// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Id} from "./interfaces/IMorpho.sol";

/// @dev Every constant here is confirmed in data/ground-truth.json by direct on-chain read.
///      Nothing may be added without a corresponding verified entry there.
library ArcGroundTruth {
    uint256 internal constant CHAIN_ID = 5042;

    /// USDC: one balance, two interfaces. ERC-20 view is 6dp, native balance is 18dp.
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    uint8 internal constant USDC_ERC20_DECIMALS = 6;
    uint8 internal constant USDC_NATIVE_DECIMALS = 18;
    /// @dev The single highest-risk number in this codebase. native = erc20 * SCALE.
    uint256 internal constant NATIVE_PER_ERC20 = 1e12;

    /// Arc's mempool silently discards transactions below this. No receipt, no error.
    uint256 internal constant MIN_BASE_FEE = 20 gwei;

    address internal constant MORPHO = 0x34CD04070dD72b14E241112F6d83812Df5Af7fCD;
    address internal constant UNIV4_POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    address internal constant CIRBTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;
    uint8 internal constant CIRBTC_DECIMALS = 8;

    /// cirBTC / USDC, 86% LLTV — 99.6% of all borrowing on Arc.
    Id internal constant MARKET_CIRBTC_USDC =
        Id.wrap(0xc2db905f174e5defcce01d321b09f15f78856a36a21b90cc7e1abbc29225815d);
    address internal constant ORACLE_CIRBTC_USDC = 0x2AA87fF48933Ce6aBA240BEE916Fc2e6Ec1e51Ab;
    address internal constant IRM_CIRBTC_USDC = 0xF02615d094Fc02fC031C35fe705e175aA4653f20;
    uint256 internal constant LLTV_86 = 0.86e18;
}
