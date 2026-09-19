// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";
import {
    IMorpho, IMorphoFlashLoanCallback, IERC20, IOracle, Id, MarketParams, Market
} from "../contracts/interfaces/IMorpho.sol";

/// @dev Phase 1 gate: fork Arc mainnet, read a real market, and assert something non-trivial.
///      The non-trivial assertion is that Morpho's flashLoan actually executes — which is the
///      evidence that this engine needs no depositor capital to liquidate.
contract ArcForkTest is Test, IMorphoFlashLoanCallback {
    IMorpho constant MORPHO = IMorpho(GT.MORPHO);
    IERC20 constant USDC = IERC20(GT.USDC);

    bool internal flashLoanCallbackFired;
    uint256 internal balanceInsideCallback;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"));
    }

    function test_forkIsActuallyArc() public view {
        assertEq(block.chainid, GT.CHAIN_ID, "not forked onto Arc");
        assertGt(block.number, 21_000_000, "fork is stale");
    }

    /// The decimal boundary that §4 calls the most likely catastrophic bug in this codebase.
    /// Asserting it explicitly so a change in Arc's USDC breaks the suite loudly.
    function test_usdcIsDualDecimal() public view {
        assertEq(USDC.decimals(), GT.USDC_ERC20_DECIMALS, "ERC-20 view is not 6dp");
        // 1 USDC expressed both ways must differ by exactly 1e12.
        uint256 oneUsdcErc20 = 10 ** GT.USDC_ERC20_DECIMALS;
        uint256 oneUsdcNative = 10 ** GT.USDC_NATIVE_DECIMALS;
        assertEq(oneUsdcNative / oneUsdcErc20, GT.NATIVE_PER_ERC20, "scaling factor drifted");
    }

    function test_marketParamsMatchGroundTruth() public view {
        MarketParams memory p = MORPHO.idToMarketParams(GT.MARKET_CIRBTC_USDC);
        assertEq(p.loanToken, GT.USDC, "loan token");
        assertEq(p.collateralToken, GT.CIRBTC, "collateral token");
        assertEq(p.oracle, GT.ORACLE_CIRBTC_USDC, "oracle");
        assertEq(p.irm, GT.IRM_CIRBTC_USDC, "irm");
        assertEq(p.lltv, GT.LLTV_86, "lltv");
        assertTrue(MORPHO.isLltvEnabled(p.lltv), "lltv not enabled");
        assertTrue(MORPHO.isIrmEnabled(p.irm), "irm not enabled");
    }

    function test_marketHasRealBorrowDemand() public view {
        Market memory m = MORPHO.market(GT.MARKET_CIRBTC_USDC);
        assertGt(m.totalBorrowAssets, 1_000_000e6, "less than $1M borrowed - thesis is dead");
        assertGt(m.totalSupplyAssets, m.totalBorrowAssets, "borrow exceeds supply");
        console.log("supplied USDC :", uint256(m.totalSupplyAssets) / 1e6);
        console.log("borrowed USDC :", uint256(m.totalBorrowAssets) / 1e6);
    }

    /// On Arc a contract's USDC IS its native balance, so any native funding shows up in
    /// balanceOf(). Foundry hands every test contract 2**96-1 wei, which surfaces here as
    /// ~79,228,162,514 USDC that was never deposited. Absolute-balance assertions are unsafe;
    /// always measure deltas. This test exists so that fact can never be forgotten silently.
    function test_nativeBalanceLeaksIntoErc20View() public {
        vm.deal(address(this), 1e18); // 1 USDC in native 18dp units
        assertEq(USDC.balanceOf(address(this)), 1e6, "erc20 view must be native / 1e12");
        vm.deal(address(this), 0);
        assertEq(USDC.balanceOf(address(this)), 0, "erc20 view must follow native balance");
    }

    /// THE architectural assertion: we can source liquidation capital from Morpho itself,
    /// atomically and for free. If this passes, the Vault is unnecessary for execution.
    function test_flashLoanNeedsNoDepositorCapital() public {
        uint256 amount = 1_000_000e6; // 1M USDC, 6dp ERC-20 units
        vm.deal(address(this), 0); // start from a known native balance, not Foundry's default
        uint256 before = USDC.balanceOf(address(this));

        MORPHO.flashLoan(GT.USDC, amount, abi.encode(amount));

        assertTrue(flashLoanCallbackFired, "callback never fired");
        assertEq(balanceInsideCallback - before, amount, "did not receive the borrowed USDC");
        assertEq(USDC.balanceOf(address(this)), before, "flash loan was not repaid exactly");
    }

    /// On Arc, an ERC-20 USDC transfer moves NATIVE value. A contract with no payable
    /// receive() cannot be paid at all - the transfer reverts. Every contract in this system
    /// that touches USDC must declare this, and the Engine is no exception.
    receive() external payable {}

    function onMorphoFlashLoan(uint256 assets, bytes calldata) external {
        assertEq(msg.sender, GT.MORPHO, "callback not from Morpho");
        flashLoanCallbackFired = true;
        balanceInsideCallback = USDC.balanceOf(address(this));
        // Morpho pulls the funds back via transferFrom after this returns.
        USDC.approve(GT.MORPHO, assets);
    }

    function test_oracleReturnsUsablePrice() public view {
        uint256 p = IOracle(GT.ORACLE_CIRBTC_USDC).price();
        assertGt(p, 0, "oracle dead");
        // price is scaled 1e36 * 10^(loanDec - collatDec) = 1e36 * 1e(6-8)
        uint256 btcUsd = p / 10 ** (36 + GT.USDC_ERC20_DECIMALS - GT.CIRBTC_DECIMALS);
        assertGt(btcUsd, 10_000, "cirBTC under $10k - oracle scaling is wrong");
        assertLt(btcUsd, 1_000_000, "cirBTC over $1M - oracle scaling is wrong");
        console.log("cirBTC price USD:", btcUsd);
    }
}
