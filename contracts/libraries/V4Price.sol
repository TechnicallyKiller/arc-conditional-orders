// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoolManager, PoolId} from "../interfaces/IPoolManager.sol";

/// @notice Reads a Uniswap V4 pool's live price directly from the PoolManager.
///
/// The trigger for an order is re-checked against this on-chain, never trusted from the keeper.
/// The keeper decides WHEN to attempt a fill; the contract decides whether the attempt is valid.
library V4Price {
    /// @dev Slot of the `pools` mapping in PoolManager. Verified on Arc mainnet 2026-09-19 by
    ///      reading a live pool and confirming the decoded tick and sqrtPriceX96 agree with each
    ///      other (tick 401996 <-> price 2.868e17). A wrong slot returns zero, not a wrong price.
    uint256 internal constant POOLS_SLOT = 6;

    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = 887272;

    error PoolNotInitialised(PoolId id);

    /// @notice slot0 packs sqrtPriceX96 (160) | tick (24) | protocolFee (24) | lpFee (24).
    function slot0(IPoolManager manager, PoolId id)
        internal
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)
    {
        bytes32 stateSlot = keccak256(abi.encodePacked(PoolId.unwrap(id), POOLS_SLOT));
        bytes32 data = manager.extsload(stateSlot);
        assembly ("memory-safe") {
            sqrtPriceX96 := and(data, 0xffffffffffffffffffffffffffffffffffffffff)
            tick := signextend(2, shr(160, data))
            protocolFee := and(shr(184, data), 0xffffff)
            lpFee := and(shr(208, data), 0xffffff)
        }
    }

    /// @notice Current tick, reverting if the pool does not exist. Used for trigger evaluation
    ///         because ticks are monotonic in price, cheap to compare, and carry no decimals -
    ///         which on Arc removes an entire class of 18-vs-6 mistakes from the hot path.
    /// @notice Non-reverting read. Lets a caller tell "pool reads as uninitialised" apart from
    ///         "trigger not met" - a distinction that matters because the public Arc RPC has
    ///         been observed returning zero for a slot that Swap events prove was non-zero.
    ///         A keeper that cannot tell those apart silently fails to fill.
    function tryCurrentTick(IPoolManager manager, PoolId id)
        internal
        view
        returns (bool ok, int24 tick)
    {
        uint160 sqrtPriceX96;
        (sqrtPriceX96, tick,,) = slot0(manager, id);
        ok = sqrtPriceX96 != 0;
    }

    function currentTick(IPoolManager manager, PoolId id) internal view returns (int24 tick) {
        uint160 sqrtPriceX96;
        (sqrtPriceX96, tick,,) = slot0(manager, id);
        if (sqrtPriceX96 == 0) revert PoolNotInitialised(id);
    }
}
