// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {V4SwapAdapter} from "../contracts/adapters/V4SwapAdapter.sol";
import {IPoolManager, PoolKey, PoolId, poolIdOf} from "../contracts/interfaces/IPoolManager.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

/// @dev Diagnostic: in which UNITS does V4 account for Arc's native USDC?
contract NativeUnitsTest is Test {
    V4SwapAdapter adapter;
    address constant USO = 0xa5a3e8FF2a61EdFb60fFB2ccAA89dDF0eFE3d227;
    uint256 constant FORK_BLOCK = 21694303;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"), FORK_BLOCK);
        adapter = new V4SwapAdapter(GT.UNIV4_POOL_MANAGER);
    }

    receive() external payable {}

    function test_whereDoTheUnitsDiverge() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        deal(USO, address(this), 1e18);
        IERC20(USO).approve(address(adapter), 1e18);

        uint256 nativeBefore = address(this).balance;
        uint256 erc20Before = IERC20(GT.USDC).balanceOf(address(this));

        uint256 reported = adapter.swapExactIn(k, false, 1e18, address(this));

        uint256 nativeDelta = address(this).balance - nativeBefore;
        uint256 erc20Delta = IERC20(GT.USDC).balanceOf(address(this)) - erc20Before;

        console.log("adapter reported      :", reported);
        console.log("native balance delta  :", nativeDelta);
        console.log("erc20 balanceOf delta :", erc20Delta);
        if (reported > 0) {
            console.log("nativeDelta / reported:", nativeDelta / reported);
            console.log("erc20Delta  / reported:", erc20Delta / reported);
        }
        console.log("--- which pairing is consistent? ---");
        console.log("native == erc20 * 1e12 ?", nativeDelta == erc20Delta * 1e12);
        console.log("reported == native      ?", reported == nativeDelta);
        console.log("reported == erc20       ?", reported == erc20Delta);
    }
}
