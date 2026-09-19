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
    function test_whatDidTheDepthTestActuallySwap() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        IERC20(GT.USDC).approve(address(adapter), type(uint256).max);

        uint256 nativeBefore = address(this).balance;
        adapter.swapExactIn(k, true, 50e6, address(this));   // what the depth test passed
        uint256 spentNative = nativeBefore - address(this).balance;

        console.log("passed as amountIn  :", uint256(50e6));
        console.log("native actually spent:", spentNative);
        console.log("that is USDC        :", spentNative / 1e12, "millionths");
        assertLt(spentNative, 1e12, "if this passes, the depth test swapped less than 0.000001 USDC");
    }
}
