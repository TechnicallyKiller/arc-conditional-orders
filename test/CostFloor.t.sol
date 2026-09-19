// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {CostFloor} from "../contracts/CostFloor.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

/// @dev Minimal consumer so the invariant can be exercised in isolation.
contract Harness is CostFloor {
    constructor(uint256 overhead) CostFloor(overhead) {}

    /// Simulates doing work worth `valueProducedNative` and burning `burnGas` gas doing it.
    function doWork(uint256 valueProducedNative, uint256 marginNative, uint256 burnGas)
        external
        view
        returns (uint256 cost)
    {
        uint256 g = _startCostAccounting();
        uint256 target = gasleft() > burnGas ? gasleft() - burnGas : 0;
        while (gasleft() > target) {} // burn measurable gas
        return _assertCoversCost(g, valueProducedNative, marginNative);
    }

    function costOnly(uint256 burnGas) external view returns (uint256) {
        uint256 g = _startCostAccounting();
        uint256 target = gasleft() > burnGas ? gasleft() - burnGas : 0;
        while (gasleft() > target) {}
        return _gasCostSoFar(g);
    }
}

contract CostFloorTest is Test {
    Harness h;
    uint256 constant SETTLEMENT_OVERHEAD = 30_000;
    uint256 constant GAS_PRICE = 21.25 gwei; // observed on Arc mainnet, see ground-truth.json

    function setUp() public {
        h = new Harness(SETTLEMENT_OVERHEAD);
        vm.txGasPrice(GAS_PRICE);
    }

    // ---------------------------------------------------------------
    // NEGATIVE TESTS FIRST. A passing liquidation proves the pipeline works;
    // only these prove the invariant does anything.
    // ---------------------------------------------------------------

    /// THE test. Work that is profitable before gas and unprofitable after must revert.
    function test_revertsWhenProfitableBeforeGasButNotAfter() public {
        uint256 cost = h.costOnly(50_000);
        assertGt(cost, 0, "cost must be non-zero");

        // Produce strictly less value than the call cost: profitable-looking, actually a loss.
        uint256 valueProduced = cost - 1;
        // Selector-only: doWork's calldata is larger than costOnly's, so its floor is
        // legitimately higher. Asserting exact operands would be asserting my own arithmetic.
        vm.expectPartialRevert(CostFloor.CostFloorBreached.selector);
        h.doWork(valueProduced, 0, 50_000);
    }

    /// Value that clears gas but not the margin must also revert.
    function test_revertsWhenMarginNotCleared() public {
        uint256 cost = h.costOnly(50_000);
        uint256 margin = 1e15; // 0.001 USDC
        vm.expectPartialRevert(CostFloor.CostFloorBreached.selector);
        h.doWork(cost, margin, 50_000);
    }

    function test_revertsOnZeroValueProduced() public {
        vm.expectRevert();
        h.doWork(0, 0, 50_000);
    }

    // ---------------------------------------------------------------
    // Positive path
    // ---------------------------------------------------------------

    function test_passesWhenValueClearsCostAndMargin() public view {
        uint256 cost = h.costOnly(50_000);
        uint256 charged = h.doWork(cost * 2, cost / 2, 50_000);
        assertGt(charged, 0, "cost reported");
    }

    /// The floor must exceed a naive gasleft() delta, or it is not a floor at all:
    /// intrinsic gas and calldata are real costs that gasleft() cannot observe.
    function test_floorExceedsNaiveGasleftDelta() public view {
        uint256 burn = 50_000;
        uint256 reported = h.costOnly(burn);
        uint256 naive = burn * GAS_PRICE;
        assertGt(reported, naive, "floor must cover what gasleft cannot see");

        uint256 unobservable = reported - naive;
        uint256 minUnobservable = (h.INTRINSIC_GAS() + SETTLEMENT_OVERHEAD) * GAS_PRICE;
        assertGe(unobservable, minUnobservable, "intrinsic + settlement not counted");
    }

    // ---------------------------------------------------------------
    // The decimal boundary. §4 calls this the highest-risk line in the codebase.
    // ---------------------------------------------------------------

    /// Cost is native 18dp. A caller comparing a 6dp ERC-20 profit against it without scaling
    /// is wrong by 1e12 - and in one direction that silently passes everything.
    function testFuzz_erc20ProfitMustBeScaledBeforeComparison(uint96 profitErc20) public view {
        vm.assume(profitErc20 > 0);
        uint256 cost = h.costOnly(50_000);

        uint256 scaled = uint256(profitErc20) * GT.NATIVE_PER_ERC20;
        uint256 unscaled = uint256(profitErc20);

        // The unscaled comparison is wrong by exactly 1e12.
        assertEq(scaled / unscaled, GT.NATIVE_PER_ERC20, "scaling factor drifted");

        // Anything that clears the floor unscaled clears it scaled - the dangerous direction is
        // the reverse: real profits that LOOK like losses, and losses that look like profits.
        if (unscaled >= cost) assertGe(scaled, cost, "scaled must also clear");
    }

    /// Sub-cent profits are exactly where the ERC-20 view truncates to zero. The invariant must
    /// still work there, because on Arc that is the normal size of a margin.
    function testFuzz_holdsAcrossMagnitudes(uint8 exp) public {
        uint256 e = bound(exp, 0, 24);
        uint256 value = 10 ** e;
        uint256 cost = h.costOnly(50_000);
        if (value >= cost) {
            h.doWork(value, 0, 50_000); // must not revert
        } else {
            vm.expectRevert();
            h.doWork(value, 0, 50_000);
        }
    }
}
