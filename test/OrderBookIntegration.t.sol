// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {OrderBook} from "../contracts/OrderBook.sol";
import {CostFloor} from "../contracts/CostFloor.sol";
import {V4SwapAdapter} from "../contracts/adapters/V4SwapAdapter.sol";
import {V4Price} from "../contracts/libraries/V4Price.sol";
import {IPoolManager, PoolKey, PoolId, poolIdOf} from "../contracts/interfaces/IPoolManager.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

/// @dev Phase 4 gate: the OrderBook's behaviour must be identical against a REAL router.
///      No mock anywhere in this file - real PoolManager, real pool, real liquidity.
contract OrderBookIntegrationTest is Test {
    using V4Price for IPoolManager;

    OrderBook book;
    V4SwapAdapter adapter;
    IPoolManager constant PM = IPoolManager(GT.UNIV4_POOL_MANAGER);

    address constant TOKEN = 0x70122C10800AE1905092157c21C0Df58802998F2;
    PoolId constant POOL =
        PoolId.wrap(0xacea282c439a359cb659855961bdc2e01c6b62dbef811f1c7ac6c79c4fd5583a);

    address trader = address(0xBEEF);
    address keeper = address(0xCAFE);
    address feeRecipient = address(0xFEE);

    int24 liveTick;
    uint128 traderTokens;

    function _key() internal pure returns (PoolKey memory) {
        return PoolKey({currency0: GT.USDC, currency1: TOKEN, fee: 30000, tickSpacing: 200, hooks: address(0)});
    }

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"));
        vm.txGasPrice(21.25 gwei);

        adapter = new V4SwapAdapter(GT.UNIV4_POOL_MANAGER);
        book = new OrderBook(GT.UNIV4_POOL_MANAGER, feeRecipient, 50, 0, 30_000, 2, 300, 0, 0);
        book.setRouter(address(adapter), true);

        // Acquire real tokens for the trader by actually buying them on the pool.
        vm.deal(address(this), 10_000e18);
        IERC20(GT.USDC).approve(address(adapter), 100e6);
        uint256 bought = adapter.swapExactIn(_key(), true, 100e6, trader);
        traderTokens = uint128(bought);
        assertGt(traderTokens, 0, "setup: trader has no tokens");

        vm.prank(trader);
        IERC20(TOKEN).approve(address(book), type(uint256).max);

        liveTick = PM.currentTick(POOL);
    }

    function _route(uint128 amountIn) internal view returns (bytes memory) {
        // oneForZero: selling TOKEN (currency1) for USDC (currency0), proceeds to the book.
        return abi.encodeCall(V4SwapAdapter.swapExactIn, (_key(), false, amountIn, address(book)));
    }

    function _armAndWait(uint256 id) internal {
        book.armOrder(id);
        vm.roll(block.number + 2);
    }

    function _create(int24 trigger, bool below, uint128 minOut) internal returns (uint256 id) {
        vm.prank(trader);
        id = book.createOrder(TOKEN, traderTokens, minOut, _key(), trigger, below, 0);
    }

    /// Same assertion as the mocked suite, against a real swap.
    function test_stopLossFillsThroughRealPool() public {
        uint256 id = _create(liveTick + 1000, true, 0); // trigger already met
        _armAndWait(id);

        uint256 traderUsdcBefore = IERC20(GT.USDC).balanceOf(trader);

        vm.prank(keeper);
        (uint256 amountOut, uint256 fee) = book.execute(id, address(adapter), _route(traderTokens));

        assertGt(amountOut, 0, "no proceeds");
        assertEq(fee, (amountOut * 50) / 10_000, "fee wrong");
        assertEq(
            IERC20(GT.USDC).balanceOf(trader) - traderUsdcBefore, amountOut - fee, "trader underpaid"
        );
        assertEq(IERC20(GT.USDC).balanceOf(feeRecipient), fee, "fee not collected");
        assertEq(IERC20(TOKEN).balanceOf(trader), 0, "tokens not taken");

        console.log("sold tokens     :", traderTokens);
        console.log("USDC out (6dp)  :", amountOut);
        console.log("fee  (6dp)      :", fee);
    }

    /// Same negative assertion as the mocked suite, against a real swap.
    function test_refusesWhenTriggerNotMetThroughRealPool() public {
        int24 trigger = liveTick - 1000;
        uint256 id = _create(trigger, true, 0);

        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.TriggerNotMet.selector, liveTick, trigger, true)
        );
        vm.prank(keeper);
        book.armOrder(id);
    }

    /// The trader's own slippage bound must still bind against a real pool.
    function test_slippageBoundBindsThroughRealPool() public {
        uint256 id = _create(liveTick + 1000, true, type(uint128).max);
        _armAndWait(id);
        vm.prank(keeper);
        vm.expectPartialRevert(OrderBook.SlippageExceeded.selector);
        book.execute(id, address(adapter), _route(traderTokens));
    }

    receive() external payable {}
}
