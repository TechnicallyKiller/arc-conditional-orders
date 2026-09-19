// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoolManager, IUnlockCallback, PoolKey} from "../interfaces/IPoolManager.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "../ArcGroundTruth.sol";

interface IPoolManagerFull is IPoolManager {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
    function modifyLiquidity(PoolKey memory key, ModifyLiquidityParams memory params, bytes calldata hookData)
        external
        returns (int256 callerDelta, int256 feesAccrued);
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

/// @notice Creates and seeds the demo pool. Testnet sandbox only — this holds no real value.
contract DemoLiquidity is IUnlockCallback {
    IPoolManagerFull public immutable poolManager;

    error OnlyPoolManager();

    struct AddData {
        PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
        address payer;
    }

    constructor(address _pm) {
        poolManager = IPoolManagerFull(_pm);
    }

    /// @dev On Arc a USDC ERC-20 transfer moves native value, so this must accept it.
    receive() external payable {}

    function initializePool(PoolKey calldata key, uint160 sqrtPriceX96) external returns (int24) {
        return poolManager.initialize(key, sqrtPriceX96);
    }

    /// @notice Add liquidity over a tick range. Caller must have approved both currencies.
    function addLiquidity(
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        int256 liquidityDelta
    ) external {
        poolManager.unlock(
            abi.encode(AddData(key, tickLower, tickUpper, liquidityDelta, msg.sender))
        );
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        AddData memory d = abi.decode(data, (AddData));

        poolManager.modifyLiquidity(
            d.key,
            ModifyLiquidityParams(d.tickLower, d.tickUpper, d.liquidityDelta, bytes32(0)),
            ""
        );

        _settle(d.key.currency0, d.payer);
        _settle(d.key.currency1, d.payer);
        return "";
    }

    /// @dev Pay whatever the pool is owed for this currency, pulling from the caller.
    function _settle(address currency, address payer) internal {
        int256 delta = int256(uint256(poolManager.exttload(keccak256(abi.encode(address(this), currency)))));
        if (delta >= 0) return;
        uint256 owed = uint256(-delta);
        address erc20 = currency == address(0) ? GT.USDC : currency;
        // Native amounts are 18dp; the ERC-20 interface takes 6dp. Round up so the pool is
        // never left short.
        uint256 pull = currency == address(0)
            ? (owed + GT.NATIVE_PER_ERC20 - 1) / GT.NATIVE_PER_ERC20
            : owed;
        IERC20(erc20).transferFrom(payer, address(this), pull);

        if (currency == address(0)) {
            poolManager.settle{value: owed}();
        } else {
            poolManager.sync(currency);
            IERC20(currency).transfer(address(poolManager), owed);
            poolManager.settle();
        }
    }
}
