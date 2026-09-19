// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoolManager, IUnlockCallback, PoolKey, SwapParams} from "../interfaces/IPoolManager.sol";
import {IERC20} from "../interfaces/IERC20.sol";

/// @notice Swaps directly against Uniswap V4. Used for the long tail, where an aggregator's
///         fixed fee ($0.55 on LI.FI) would swamp a small order.
contract V4SwapAdapter is IUnlockCallback {
    /// @dev TickMath bounds. A swap must name a price limit; these are the permissive extremes,
    ///      because the caller's real protection is its own minAmountOut, not this limit.
    uint160 internal constant MIN_SQRT_PRICE = 4295128739;
    uint160 internal constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;

    IPoolManager public immutable poolManager;

    error OnlyPoolManager();
    error NothingReceived();

    struct CallbackData {
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        address recipient;
    }

    constructor(address _poolManager) {
        poolManager = IPoolManager(_poolManager);
    }

    /// @dev On Arc a USDC ERC-20 transfer moves native value, so this must accept it.
    receive() external payable {}

    /// @notice Sell `amountIn` of the pool's input currency, sending proceeds to `recipient`.
    /// @dev The caller must have approved this adapter for `amountIn` beforehand.
    function swapExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn, address recipient)
        external
        returns (uint256 amountOut)
    {
        address currencyIn = zeroForOne ? key.currency0 : key.currency1;
        IERC20(currencyIn).transferFrom(msg.sender, address(this), amountIn);

        bytes memory res = poolManager.unlock(
            abi.encode(CallbackData({key: key, zeroForOne: zeroForOne, amountIn: amountIn, recipient: recipient}))
        );
        amountOut = abi.decode(res, (uint256));
        if (amountOut == 0) revert NothingReceived();
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        CallbackData memory d = abi.decode(data, (CallbackData));

        address currencyIn = d.zeroForOne ? d.key.currency0 : d.key.currency1;
        address currencyOut = d.zeroForOne ? d.key.currency1 : d.key.currency0;

        int256 delta = poolManager.swap(
            d.key,
            SwapParams({
                zeroForOne: d.zeroForOne,
                amountSpecified: -int256(d.amountIn), // negative = exact input
                sqrtPriceLimitX96: d.zeroForOne ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1
            }),
            ""
        );

        // BalanceDelta packs amount0 in the high 128 bits, amount1 in the low 128.
        int128 amount0 = int128(delta >> 128);
        int128 amount1 = int128(delta);
        int128 outDelta = d.zeroForOne ? amount1 : amount0;
        uint256 amountOut = uint256(uint128(outDelta > 0 ? outDelta : int128(0)));

        // Pay what we owe: sync, transfer in, settle.
        poolManager.sync(currencyIn);
        IERC20(currencyIn).transfer(address(poolManager), d.amountIn);
        poolManager.settle();

        // Collect what we are owed.
        poolManager.take(currencyOut, d.recipient, amountOut);

        return abi.encode(amountOut);
    }
}
