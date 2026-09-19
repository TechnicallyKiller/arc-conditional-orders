// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

type PoolId is bytes32;

/// @dev Uniswap V4 exposes its state through extsload rather than getters.
///      Selector 0x1e2eaeaf verified against the deployed PoolManager on Arc mainnet.
interface IPoolManager {
    function extsload(bytes32 slot) external view returns (bytes32);
}
