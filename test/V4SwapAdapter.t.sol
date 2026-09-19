// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {V4SwapAdapter} from "../contracts/adapters/V4SwapAdapter.sol";
import {IPoolManager, PoolKey, PoolId, poolIdOf} from "../contracts/interfaces/IPoolManager.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {V4Price} from "../contracts/libraries/V4Price.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

/// @dev No mocks here. Real PoolManager, real pool, real liquidity, real swap.
contract V4SwapAdapterTest is Test {
    using V4Price for IPoolManager;

    V4SwapAdapter adapter;
    IPoolManager constant PM = IPoolManager(GT.UNIV4_POOL_MANAGER);

    /// A live pool with no hooks and real liquidity, found by scanning Initialize events and
    /// reading liquidity at stateSlot+3 on 2026-09-19.
    address constant TOKEN = 0x70122C10800AE1905092157c21C0Df58802998F2;
    PoolId constant EXPECTED_ID =
        PoolId.wrap(0xacea282c439a359cb659855961bdc2e01c6b62dbef811f1c7ac6c79c4fd5583a);

    function _key() internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: GT.USDC,
            currency1: TOKEN,
            fee: 30000,
            tickSpacing: 200,
            hooks: address(0)
        });
    }

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"));
        vm.txGasPrice(21.25 gwei);
        adapter = new V4SwapAdapter(GT.UNIV4_POOL_MANAGER);
    }

    /// The PoolKey we hand the PoolManager must be the one that produces this pool's id,
    /// or we would be swapping in a different pool than the one we priced.
    function test_poolKeyHashesToPoolId() public pure {
        assertEq(
            PoolId.unwrap(poolIdOf(_key())),
            PoolId.unwrap(EXPECTED_ID),
            "PoolKey does not hash to the pool id"
        );
    }

    function test_poolHasLiquidity() public view {
        (uint160 sqrtPriceX96,,,) = PM.slot0(EXPECTED_ID);
        assertGt(sqrtPriceX96, 0, "pool not initialised");
    }

    /// THE Phase 4 assertion: a real swap through the real PoolManager.
    function test_realSwapUsdcForToken() public {
        uint256 amountIn = 1e6; // 1 USDC in the 6dp ERC-20 view
        vm.deal(address(this), 1000e18); // fund with real USDC (native 18dp view)

        assertEq(IERC20(GT.USDC).balanceOf(address(this)), 1000e6, "native/erc20 views disagree");

        IERC20(GT.USDC).approve(address(adapter), amountIn);
        uint256 tokenBefore = IERC20(TOKEN).balanceOf(address(this));
        uint256 usdcBefore = IERC20(GT.USDC).balanceOf(address(this));

        uint256 amountOut = adapter.swapExactIn(_key(), true, amountIn, address(this));

        assertGt(amountOut, 0, "received nothing");
        assertEq(IERC20(TOKEN).balanceOf(address(this)) - tokenBefore, amountOut, "token not delivered");
        assertEq(usdcBefore - IERC20(GT.USDC).balanceOf(address(this)), amountIn, "wrong USDC spent");

        console.log("sold   (USDC 6dp):", amountIn);
        console.log("bought (token   ):", amountOut);
    }

    /// Only the PoolManager may drive the callback; anyone else calling it is an attack.
    function test_unlockCallbackRejectsStranger() public {
        vm.expectRevert(V4SwapAdapter.OnlyPoolManager.selector);
        adapter.unlockCallback("");
    }

    receive() external payable {}

    // ---------------------------------------------------------------
    // Hook pools: most launchpad pools on Arc carry an AFTER_SWAP_RETURNS_DELTA hook that
    // adjusts what is actually owed. Settling from the returned swap delta takes the wrong
    // amount; settling from the transient currency delta is correct.
    // ---------------------------------------------------------------

    address constant HOOK_TOKEN = 0x7b433aBe57a1b7c520e8562B7262d2Ef502BCFb1;
    address constant HOOK_ADDR = 0x0F5f4B60176E76F64A4AB0284e52bd68283eA044;
    PoolId constant HOOK_POOL =
        PoolId.wrap(0x153d783aaf1b233b422adfe9b7f8bc907bcfcd65a5e00c96e1c9cbbed6c0a717);

    function _hookKey() internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: GT.USDC,
            currency1: HOOK_TOKEN,
            fee: 10000,
            tickSpacing: 200,
            hooks: HOOK_ADDR
        });
    }

    function test_hookPoolKeyHashesToPoolId() public pure {
        assertEq(PoolId.unwrap(poolIdOf(_hookKey())), PoolId.unwrap(HOOK_POOL), "hook PoolKey wrong");
    }

    function test_realSwapThroughHookPool() public {
        uint256 amountIn = 1e6;
        vm.deal(address(this), 1000e18);
        IERC20(GT.USDC).approve(address(adapter), amountIn);

        uint256 before = IERC20(HOOK_TOKEN).balanceOf(address(this));
        uint256 amountOut = adapter.swapExactIn(_hookKey(), true, amountIn, address(this));

        assertGt(amountOut, 0, "hook pool returned nothing");
        assertEq(
            IERC20(HOOK_TOKEN).balanceOf(address(this)) - before,
            amountOut,
            "delivered amount does not match what the adapter reported"
        );
        console.log("hook pool bought:", amountOut);
    }
}
