// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "./IERC20.sol";

type Id is bytes32;

struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

struct Market {
    uint128 totalSupplyAssets;
    uint128 totalSupplyShares;
    uint128 totalBorrowAssets;
    uint128 totalBorrowShares;
    uint128 lastUpdate;
    uint128 fee;
}

struct Position {
    uint256 supplyShares;
    uint128 borrowShares;
    uint128 collateral;
}

/// @dev Interface transcribed from the selectors verified in the deployed bytecode at
///      0x34CD04070dD72b14E241112F6d83812Df5Af7fCD on Arc mainnet (see data/ground-truth.json).
///      Not written from memory of what Morpho "usually" looks like.
interface IMorpho {
    function owner() external view returns (address);
    function feeRecipient() external view returns (address);
    function idToMarketParams(Id id) external view returns (MarketParams memory);
    function market(Id id) external view returns (Market memory);
    function position(Id id, address user) external view returns (Position memory);
    function isLltvEnabled(uint256 lltv) external view returns (bool);
    function isIrmEnabled(address irm) external view returns (bool);

    function flashLoan(address token, uint256 assets, bytes calldata data) external;

    function liquidate(
        MarketParams memory marketParams,
        address borrower,
        uint256 seizedAssets,
        uint256 repaidShares,
        bytes memory data
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid);

    function accrueInterest(MarketParams memory marketParams) external;
    function createMarket(MarketParams memory marketParams) external;
}

interface IMorphoFlashLoanCallback {
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external;
}

interface IMorphoLiquidateCallback {
    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external;
}

interface IOracle {
    /// @dev Price of 1 collateral unit quoted in loan token, scaled by 1e36.
    function price() external view returns (uint256);
}
