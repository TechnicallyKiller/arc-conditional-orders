// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoolManager, IUnlockCallback, PoolKey, SwapParams} from "../interfaces/IPoolManager.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "../ArcGroundTruth.sol";

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

    /// @dev On Arc, native USDC and the ERC-20 at 0x3600... are ONE balance behind two
    ///      interfaces. A V4 pool may name either as its currency; the deepest pools on Arc
    ///      use the native one. So we always pull input through the ERC-20 interface (which
    ///      moves the same money) and settle with value when the pool's currency is native.
    address internal constant NATIVE = address(0);

    function _erc20Of(address currency) internal pure returns (address) {
        return currency == NATIVE ? GT.USDC : currency;
    }

    struct CallbackData {
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        address recipient;
        address caller;
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
        IERC20(_erc20Of(currencyIn)).transferFrom(msg.sender, address(this), amountIn);

        bytes memory res = poolManager.unlock(
            abi.encode(CallbackData({key: key, zeroForOne: zeroForOne, amountIn: amountIn, recipient: recipient, caller: msg.sender}))
        );
        amountOut = abi.decode(res, (uint256));
        if (amountOut == 0) revert NothingReceived();
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        CallbackData memory d = abi.decode(data, (CallbackData));

        address currencyIn = d.zeroForOne ? d.key.currency0 : d.key.currency1;
        address currencyOut = d.zeroForOne ? d.key.currency1 : d.key.currency0;

        poolManager.swap(
            d.key,
            SwapParams({
                zeroForOne: d.zeroForOne,
                amountSpecified: -int256(d.amountIn), // negative = exact input
                sqrtPriceLimitX96: d.zeroForOne ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1
            }),
            ""
        );

        // Settle against the PoolManager's own transient deltas rather than the delta the swap
        // returned. Pools with an AFTER_SWAP_RETURNS_DELTA hook - which is most launchpad pools
        // on Arc - let the hook adjust what is actually owed, so the returned delta is not what
        // we can take. The transient delta is the truth for both sides.
        int256 owed = _delta(currencyIn);    // negative: we owe the pool
        int256 owing = _delta(currencyOut);  // positive: the pool owes us

        if (owed < 0) {
            uint256 pay = uint256(-owed);
            if (currencyIn == NATIVE) {
                // Native currency settles by sending value; there is no sync step.
                poolManager.settle{value: pay}();
            } else {
                poolManager.sync(currencyIn);
                IERC20(currencyIn).transfer(address(poolManager), pay);
                poolManager.settle();
            }
        }

        uint256 amountOut = owing > 0 ? uint256(owing) : 0;
        if (amountOut > 0) poolManager.take(currencyOut, d.recipient, amountOut);

        // Any unspent input (a hook may not consume it all) goes back to the caller.
        uint256 dust = IERC20(_erc20Of(currencyIn)).balanceOf(address(this));
        if (dust > 0) IERC20(_erc20Of(currencyIn)).transfer(d.caller, dust);

        return abi.encode(amountOut);
    }

    /// @dev V4 tracks what each locker owes or is owed in transient storage, keyed by
    ///      keccak256(abi.encode(target, currency)).
    function _delta(address currency) internal view returns (int256) {
        return int256(uint256(poolManager.exttload(keccak256(abi.encode(address(this), currency)))));
    }
}
