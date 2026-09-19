// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title CostFloor
/// @notice Proves on-chain that the value produced by a call exceeded the gas it burned.
///
/// This is only honestly statable on a chain where gas and value share a unit. On Arc, gas is
/// paid in USDC and profit is realised in USDC, so the comparison is arithmetic on values the
/// EVM already exposes - no oracle, no basis risk, no off-chain estimate.
///
/// Accounting is in NATIVE units (18dp), because that is the unit gas is denominated in.
/// Callers holding 6dp ERC-20 amounts must scale by 1e12 before comparing. Getting that wrong
/// is off by a factor of a trillion and, in one direction, silently passes everything.
abstract contract CostFloor {
    /// @dev Intrinsic cost of any transaction, per the EVM spec.
    uint256 public constant INTRINSIC_GAS = 21_000;
    /// @dev Worst-case calldata cost per byte post-EIP-2028 (non-zero byte).
    uint256 public constant MAX_CALLDATA_GAS_PER_BYTE = 16;

    /// @dev Gas consumed after the final measurement: settlement writes, event, return.
    ///      Measured, not guessed - see data/ground-truth.json measuredGas.
    uint256 public immutable settlementGasOverhead;

    error CostFloorBreached(uint256 valueProduced, uint256 costIncurred, uint256 margin);

    constructor(uint256 _settlementGasOverhead) {
        settlementGasOverhead = _settlementGasOverhead;
    }

    /// @notice Sample at the very top of the entry function.
    function _startCostAccounting() internal view returns (uint256 gasStart) {
        return gasleft();
    }

    /// @notice Gas this call has provably cost so far, including the parts gasleft() cannot see.
    /// @dev Unlike a bare gasleft() delta this is an UPPER bound on the unobservable portion:
    ///      intrinsic gas and calldata are computed exactly from the EVM's own rules rather than
    ///      absorbed into a hand-tuned margin. That is what makes the floor checkable by reading
    ///      the contract instead of trusting the operator's constant.
    function _gasCostSoFar(uint256 gasStart) internal view returns (uint256 costNative) {
        uint256 consumed = gasStart - gasleft();
        uint256 total = consumed + INTRINSIC_GAS + (msg.data.length * MAX_CALLDATA_GAS_PER_BYTE)
            + settlementGasOverhead;
        return total * tx.gasprice;
    }

    /// @notice Revert unless value produced clears gas cost plus margin. Both in native 18dp.
    function _assertCoversCost(uint256 gasStart, uint256 valueProducedNative, uint256 marginNative)
        internal
        view
        returns (uint256 costNative)
    {
        costNative = _gasCostSoFar(gasStart);
        if (valueProducedNative < costNative + marginNative) {
            revert CostFloorBreached(valueProducedNative, costNative, marginNative);
        }
    }
}
