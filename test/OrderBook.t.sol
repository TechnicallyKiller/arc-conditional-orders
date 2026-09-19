// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {OrderBook} from "../contracts/OrderBook.sol";
import {CostFloor} from "../contracts/CostFloor.sol";
import {V4Price} from "../contracts/libraries/V4Price.sol";
import {IPoolManager, PoolId} from "../contracts/interfaces/IPoolManager.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";
import {MockERC20, MockRouter} from "./mocks/Mocks.sol";

contract OrderBookTest is Test {
    using V4Price for IPoolManager;

    OrderBook book;
    MockERC20 tokenIn;
    MockRouter router;

    address trader = address(0xBEEF);
    address keeper = address(0xCAFE);
    address feeRecipient = address(0xFEE);

    PoolId constant LIVE_POOL =
        PoolId.wrap(0x870728a1dee8290b0dcb7ce52c664433f63fc5243ced76c03bd2e6bba10d0cc9);

    int24 liveTick;
    uint128 constant AMOUNT_IN = 1_000e18;
    uint256 constant PAYOUT = 1_000e6; // 1,000 USDC out, 6dp ERC-20 view

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"));

        // Without this tx.gasprice is 0, the cost floor is trivially satisfied, and every
        // negative test would pass for the wrong reason.
        vm.txGasPrice(21.25 gwei);

        tokenIn = new MockERC20();
        router = new MockRouter(GT.USDC);
        book = new OrderBook(GT.UNIV4_POOL_MANAGER, feeRecipient, 50, 0, 30_000); // 0.5% fee
        book.setRouter(address(router), true);

        liveTick = IPoolManager(GT.UNIV4_POOL_MANAGER).currentTick(LIVE_POOL);

        tokenIn.mint(trader, AMOUNT_IN);
        vm.prank(trader);
        tokenIn.approve(address(book), type(uint256).max);

        vm.deal(address(router), PAYOUT * 1e12 * 10); // fund router with real USDC (native 18dp)
        router.setPayout(PAYOUT);
    }

    function _create(int24 triggerTick, bool below, uint128 minOut) internal returns (uint256 id) {
        vm.prank(trader);
        id = book.createOrder(address(tokenIn), AMOUNT_IN, minOut, LIVE_POOL, triggerTick, below, 0);
    }

    function _route() internal view returns (bytes memory) {
        return abi.encodeCall(MockRouter.swap, (address(tokenIn), AMOUNT_IN));
    }

    // =================================================================
    // NEGATIVE TESTS FIRST
    // =================================================================

    /// THE Phase 3 gate. A stop-loss must refuse to fill while price is above its trigger.
    function test_refusesWhenPriceHasNotFallenToTrigger() public {
        // Stop-loss 1000 ticks BELOW the live price: not triggered.
        int24 trigger = liveTick - 1000;
        uint256 id = _create(trigger, true, 0);

        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.TriggerNotMet.selector, liveTick, trigger, true)
        );
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    /// The mirror case: a take-profit must refuse while price is below its trigger.
    function test_refusesTakeProfitBelowTrigger() public {
        int24 trigger = liveTick + 1000;
        uint256 id = _create(trigger, false, 0);
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.TriggerNotMet.selector, liveTick, trigger, false)
        );
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    /// A fill whose fee cannot cover its own gas must revert, even though the trigger is met.
    function test_refusesWhenFeeDoesNotCoverGas() public {
        book.setFee(0, feeRecipient); // zero fee -> zero value produced
        uint256 id = _create(liveTick + 1000, true, 0);
        vm.expectPartialRevert(CostFloor.CostFloorBreached.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    function test_refusesWhenSlippageExceeded() public {
        uint256 id = _create(liveTick + 1000, true, uint128(PAYOUT + 1));
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.SlippageExceeded.selector, PAYOUT, PAYOUT + 1)
        );
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    function test_refusesUnapprovedRouter() public {
        MockRouter rogue = new MockRouter(GT.USDC);
        uint256 id = _create(liveTick + 1000, true, 0);
        vm.expectRevert(abi.encodeWithSelector(OrderBook.RouterNotAllowed.selector, address(rogue)));
        vm.prank(keeper);
        book.execute(id, address(rogue), _route());
    }

    function test_cannotFillTwice() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        vm.prank(keeper);
        book.execute(id, address(router), _route());

        vm.expectRevert(OrderBook.OrderNotOpen.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    function test_cancelledOrderCannotFill() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        vm.prank(trader);
        book.cancelOrder(id);
        vm.expectRevert(OrderBook.OrderNotOpen.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    function test_onlyOwnerCanCancel() public {
        uint256 id = _create(liveTick - 1000, true, 0);
        vm.expectRevert(OrderBook.NotOrderOwner.selector);
        vm.prank(keeper);
        book.cancelOrder(id);
    }

    function test_expiredOrderCannotFill() public {
        vm.prank(trader);
        uint256 id = book.createOrder(
            address(tokenIn), AMOUNT_IN, 0, LIVE_POOL, liveTick + 1000, true, uint64(block.timestamp + 1)
        );
        vm.warp(block.timestamp + 2);
        vm.expectRevert(OrderBook.OrderExpired.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    // =================================================================
    // Positive path
    // =================================================================

    /// The other half of the gate: it fires when the price HAS reached the trigger.
    function test_fillsWhenPriceReachesTrigger() public {
        int24 trigger = liveTick + 1000; // live price is already at/below this
        uint256 id = _create(trigger, true, 0);

        uint256 traderBefore = IERC20(GT.USDC).balanceOf(trader);

        vm.prank(keeper);
        (uint256 amountOut, uint256 fee) = book.execute(id, address(router), _route());

        assertEq(amountOut, PAYOUT, "wrong amount out");
        assertEq(fee, (PAYOUT * 50) / 10_000, "wrong fee");
        assertEq(IERC20(GT.USDC).balanceOf(trader) - traderBefore, PAYOUT - fee, "trader underpaid");
        assertEq(IERC20(GT.USDC).balanceOf(feeRecipient), fee, "fee not collected");
        assertEq(tokenIn.balanceOf(trader), 0, "tokenIn not taken");
        console.log("fee (USDC 6dp):", fee);
    }

    /// The decimal boundary, in the place it actually bites. The fee is a 6dp ERC-20 amount and
    /// the gas cost is native 18dp; comparing them unscaled is wrong by 1e12. Unscaled, this
    /// fee would look ~1000x SMALLER than the gas cost and the fill would wrongly revert.
    function test_feeMustBeScaledBeforeCostFloor() public pure {
        uint256 fee = (PAYOUT * 50) / 10_000; // 5 USDC, 6dp
        uint256 feeNative = fee * GT.NATIVE_PER_ERC20;
        uint256 typicalGasCost = 300_000 * 21.25 gwei;

        assertLt(fee, typicalGasCost, "unscaled fee looks smaller than gas - the trap");
        assertGt(feeNative, typicalGasCost, "scaled fee must clear gas cost");
    }
}
