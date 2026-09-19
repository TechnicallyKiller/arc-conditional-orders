// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {V4Price} from "../contracts/libraries/V4Price.sol";
import {IPoolManager, PoolId} from "../contracts/interfaces/IPoolManager.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

contract V4PriceTest is Test {
    using V4Price for IPoolManager;

    IPoolManager constant PM = IPoolManager(GT.UNIV4_POOL_MANAGER);

    /// A pool with real swap flow, observed in PoolManager Swap logs on 2026-09-19.
    PoolId constant LIVE_POOL =
        PoolId.wrap(0x870728a1dee8290b0dcb7ce52c664433f63fc5243ced76c03bd2e6bba10d0cc9);

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"));
    }

    function test_readsLivePoolPrice() public view {
        (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee) =
            PM.slot0(LIVE_POOL);

        assertGt(sqrtPriceX96, 0, "live pool must have a price");
        assertGt(tick, V4Price.MIN_TICK, "tick below range");
        assertLt(tick, V4Price.MAX_TICK, "tick above range");
        assertLe(lpFee, 1_000_000, "lpFee cannot exceed 100%");
        assertLe(protocolFee, 1_000_000, "protocolFee cannot exceed 100%");

        console.log("sqrtPriceX96:", sqrtPriceX96);
        console.logInt(tick);
        console.log("lpFee (pips):", lpFee);
    }

    /// THE assertion that proves the slot is right rather than merely returning something.
    /// A wrong POOLS_SLOT would read zero for a real pool too - so a live pool reading non-zero
    /// AND an unknown pool reading zero can only both hold if the mapping slot is correct.
    function test_unknownPoolReadsZero() public view {
        PoolId fake = PoolId.wrap(keccak256("no such pool on arc"));
        (uint160 sqrtPriceX96,,,) = PM.slot0(fake);
        assertEq(sqrtPriceX96, 0, "unknown pool must read zero - slot is wrong");
    }

    function test_currentTickRevertsOnUninitialisedPool() public {
        PoolId fake = PoolId.wrap(keccak256("definitely not a pool"));
        vm.expectRevert(abi.encodeWithSelector(V4Price.PoolNotInitialised.selector, fake));
        this.callCurrentTick(fake);
    }

    function callCurrentTick(PoolId id) external view returns (int24) {
        return PM.currentTick(id);
    }

    /// Two reads in the same block must agree. Guards against a decode that accidentally
    /// depends on call ordering or dirty memory.
    function test_readIsDeterministic() public view {
        (uint160 a, int24 ta,,) = PM.slot0(LIVE_POOL);
        (uint160 b, int24 tb,,) = PM.slot0(LIVE_POOL);
        assertEq(a, b, "sqrtPrice not deterministic");
        assertEq(ta, tb, "tick not deterministic");
    }
}
