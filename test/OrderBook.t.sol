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
    uint256 constant PAYOUT = 1_000e6;
    uint64 constant DWELL = 2;
    uint64 constant MAX_ARM_AGE = 300;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"));
        // Without this tx.gasprice is 0, the cost floor is trivially satisfied, and every
        // negative test would pass for the wrong reason.
        vm.txGasPrice(21.25 gwei);

        tokenIn = new MockERC20();
        router = new MockRouter(GT.USDC);
        book = new OrderBook(GT.UNIV4_POOL_MANAGER, feeRecipient, 50, 0, 30_000, DWELL, MAX_ARM_AGE);
        book.setRouter(address(router), true);

        liveTick = IPoolManager(GT.UNIV4_POOL_MANAGER).currentTick(LIVE_POOL);

        tokenIn.mint(trader, AMOUNT_IN);
        vm.prank(trader);
        tokenIn.approve(address(book), type(uint256).max);

        vm.deal(address(router), PAYOUT * 1e12 * 10);
        router.setPayout(PAYOUT);
    }

    function _create(int24 triggerTick, bool below, uint128 minOut) internal returns (uint256 id) {
        vm.prank(trader);
        id = book.createOrder(address(tokenIn), AMOUNT_IN, minOut, LIVE_POOL, triggerTick, below, 0);
    }

    /// Arm the trigger, then advance past the dwell window, as a keeper would across blocks.
    function _armAndWait(uint256 id) internal {
        book.armOrder(id);
        vm.roll(block.number + DWELL);
    }

    function _route() internal view returns (bytes memory) {
        return abi.encodeCall(MockRouter.swap, (address(tokenIn), AMOUNT_IN));
    }

    // =================================================================
    // Single-block manipulation defence - the reason arming exists
    // =================================================================

    /// THE anti-manipulation assertion. An attacker who spikes the pool through a trigger and
    /// reverts it inside one transaction can never fill, because arming and executing must land
    /// in different blocks. Everything else here is ordinary order-book hygiene; this is the
    /// property that makes the dwell window worth its gas.
    function test_cannotArmAndFillInSameBlock() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        book.armOrder(id);

        vm.expectPartialRevert(OrderBook.DwellNotMet.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    function test_cannotFillWithoutArming() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        vm.expectRevert(OrderBook.NotArmed.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    /// An observation from long ago must not be replayable when price revisits the trigger.
    function test_staleArmIsRejected() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        book.armOrder(id);
        vm.roll(block.number + MAX_ARM_AGE + 1);

        vm.expectPartialRevert(OrderBook.ArmStale.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    /// Arming is permissionless, like execution: safety must not depend on who observes.
    function test_anyoneCanArm() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        vm.prank(address(0xD00D));
        book.armOrder(id);
        vm.roll(block.number + DWELL);
        vm.prank(keeper);
        (uint256 amountOut,) = book.execute(id, address(router), _route());
        assertEq(amountOut, PAYOUT);
    }

    // =================================================================
    // Trigger correctness - now enforced at arm time AND at fill time
    // =================================================================

    function test_cannotArmWhenPriceHasNotFallenToTrigger() public {
        int24 trigger = liveTick - 1000;
        uint256 id = _create(trigger, true, 0);
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.TriggerNotMet.selector, liveTick, trigger, true)
        );
        vm.prank(keeper);
        book.armOrder(id);
    }

    function test_cannotArmTakeProfitBelowTrigger() public {
        int24 trigger = liveTick + 1000;
        uint256 id = _create(trigger, false, 0);
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.TriggerNotMet.selector, liveTick, trigger, false)
        );
        vm.prank(keeper);
        book.armOrder(id);
    }

    // =================================================================
    // Other negative paths
    // =================================================================

    function test_refusesWhenFeeDoesNotCoverGas() public {
        book.setFee(0, feeRecipient);
        uint256 id = _create(liveTick + 1000, true, 0);
        _armAndWait(id);
        vm.expectPartialRevert(CostFloor.CostFloorBreached.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    function test_refusesWhenSlippageExceeded() public {
        uint256 id = _create(liveTick + 1000, true, uint128(PAYOUT + 1));
        _armAndWait(id);
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.SlippageExceeded.selector, PAYOUT, PAYOUT + 1)
        );
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    function test_refusesUnapprovedRouter() public {
        MockRouter rogue = new MockRouter(GT.USDC);
        uint256 id = _create(liveTick + 1000, true, 0);
        _armAndWait(id);
        vm.expectRevert(abi.encodeWithSelector(OrderBook.RouterNotAllowed.selector, address(rogue)));
        vm.prank(keeper);
        book.execute(id, address(rogue), _route());
    }

    function test_cannotFillTwice() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        _armAndWait(id);
        vm.prank(keeper);
        book.execute(id, address(router), _route());

        vm.expectRevert(OrderBook.OrderNotOpen.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    function test_cancelledOrderCannotFill() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        _armAndWait(id);
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
            address(tokenIn), AMOUNT_IN, 0, LIVE_POOL, liveTick + 1000, true, uint64(block.timestamp + 100)
        );
        book.armOrder(id);
        vm.roll(block.number + DWELL);
        vm.warp(block.timestamp + 200);
        vm.expectRevert(OrderBook.OrderExpired.selector);
        vm.prank(keeper);
        book.execute(id, address(router), _route());
    }

    // =================================================================
    // Positive path
    // =================================================================

    function test_fillsWhenPriceReachesTrigger() public {
        uint256 id = _create(liveTick + 1000, true, 0);
        _armAndWait(id);

        uint256 traderBefore = IERC20(GT.USDC).balanceOf(trader);

        vm.prank(keeper);
        (uint256 amountOut, uint256 fee) = book.execute(id, address(router), _route());

        assertEq(amountOut, PAYOUT, "wrong amount out");
        assertEq(fee, (PAYOUT * 50) / 10_000, "wrong fee");
        assertEq(IERC20(GT.USDC).balanceOf(trader) - traderBefore, PAYOUT - fee, "trader underpaid");
        assertEq(IERC20(GT.USDC).balanceOf(feeRecipient), fee, "fee not collected");
        assertEq(tokenIn.balanceOf(trader), 0, "tokenIn not taken");
    }

    /// The decimal boundary, in the place it actually bites. Fee is a 6dp ERC-20 amount and gas
    /// cost is native 18dp; comparing them unscaled is wrong by 1e12, and unscaled this fee
    /// would look ~1000x SMALLER than the gas cost, so the fill would wrongly revert.
    function test_feeMustBeScaledBeforeCostFloor() public pure {
        uint256 fee = (PAYOUT * 50) / 10_000;
        uint256 feeNative = fee * GT.NATIVE_PER_ERC20;
        uint256 typicalGasCost = 300_000 * 21.25 gwei;
        assertLt(fee, typicalGasCost, "unscaled fee looks smaller than gas - the trap");
        assertGt(feeNative, typicalGasCost, "scaled fee must clear gas cost");
    }
}
