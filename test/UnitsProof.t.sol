// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {V4SwapAdapter} from "../contracts/adapters/V4SwapAdapter.sol";
import {IPoolManager, PoolKey} from "../contracts/interfaces/IPoolManager.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

contract UnitsProofTest is Test {
    V4SwapAdapter adapter;
    address constant USO = 0xa5a3e8FF2a61EdFb60fFB2ccAA89dDF0eFE3d227;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"), 21694303);
        adapter = new V4SwapAdapter(GT.UNIV4_POOL_MANAGER);
        vm.deal(address(this), 100_000e18);
    }
    receive() external payable {}

    /// Was "$50" actually fifty dollars, or fifty millionths of a cent?
    ///
    /// This pool's currency0 is the native asset, quoted in 18dp. The original depth test
    /// passed 50e6 - a 6dp ERC-20 amount - and reported the resulting price impact as the
    /// impact of a $50 trade. It was not. Every "0 bps" reading it produced was measuring
    /// a swap a million times smaller than intended.
    function test_passingSixDecimalAmountSwapsDust() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        IERC20(GT.USDC).approve(address(adapter), type(uint256).max);

        uint256 nativeBefore = address(this).balance;
        adapter.swapExactIn(k, true, 50e6, address(this));   // what the depth test passed
        uint256 spentNative = nativeBefore - address(this).balance;

        console.log("passed as amountIn   :", uint256(50e6));
        console.log("native actually spent:", spentNative);

        // 50e6 native is below one ERC-20 unit, so settlement rounds UP to exactly 1e12
        // native (0.000001 USDC). Bound is inclusive because of that ceiling.
        assertLe(spentNative, 1e12, "expected dust: 50e6 native is sub-micro-USDC");
        assertLt(spentNative, 50e18 / 1000, "this moved real money - the unit bug is back");
    }

    /// The other half of the proof: passed in the pool's own units, $50 moves $50.
    /// Without this, the test above could be satisfied by an adapter that swaps nothing.
    function test_passingNativeAmountSwapsRealMoney() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        IERC20(GT.USDC).approve(address(adapter), type(uint256).max);

        uint256 nativeBefore = address(this).balance;
        adapter.swapExactIn(k, true, 50e18, address(this));  // 50 USDC in the pool's units
        uint256 spentNative = nativeBefore - address(this).balance;

        console.log("native actually spent:", spentNative);
        assertGe(spentNative, 49e18, "a $50 swap should move about $50");
        assertLe(spentNative, 51e18, "spent materially more than requested");
    }
}
