// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

type PoolId is bytes32;

/// @dev PoolKey hashed with keccak256(abi.encode(...)) yields the PoolId. Verified against a
///      live Arc pool on 2026-09-19: key (USDC, 0x50c1ffe2..., 3000 bps, 200, no hooks) hashes
///      to 0x3ecd366e...58ca3, the id the Initialize event carried.
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified; // negative = exact input
    uint160 sqrtPriceLimitX96;
}

/// @dev Every selector below was found in the deployed PoolManager bytecode at
///      0x8366a39CC670B4001A1121B8F6A443A643e40951 on Arc mainnet, not written from memory.
///      unlock 0x48c89491 · swap 0xf3cd914c · take 0x0b0d9c09 · settle 0x11da60b4
///      sync 0xa5841194 · extsload 0x1e2eaeaf
interface IPoolManager {
    function extsload(bytes32 slot) external view returns (bytes32);
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (int256 delta);
    function take(address currency, address to, uint256 amount) external;
    function settle() external payable returns (uint256);
    function sync(address currency) external;
}

interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

function poolIdOf(PoolKey memory key) pure returns (PoolId) {
    return PoolId.wrap(keccak256(abi.encode(key)));
}
