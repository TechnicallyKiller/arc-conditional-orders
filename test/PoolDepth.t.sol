// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {V4SwapAdapter} from "../contracts/adapters/V4SwapAdapter.sol";
import {IPoolManager, PoolKey, PoolId, poolIdOf} from "../contracts/interfaces/IPoolManager.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {V4Price} from "../contracts/libraries/V4Price.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

/// @dev Measures REALISED slippage by executing actual swaps, not by approximating from the
///      liquidity field. The constant-liquidity formula underestimates impact once a swap
///      crosses tick boundaries.
///
///      PINNED TO A BLOCK ON PURPOSE. Against `latest` these tests passed and then failed
///      minutes later, because tradability of Arc pools varies block to block. That makes a
///      live fork useless as a regression test: it would be red or green depending on the
///      minute. Here the pin makes this a deterministic test of the ADAPTER - in particular
///      that the native-USDC path works - and the live depth question belongs in a monitor,
///      not in CI.
///
///      A curated pool list therefore CANNOT be a static snapshot. See data/ground-truth.json
///      under liquidityIsNotStable.
contract PoolDepthTest is Test {
    using V4Price for IPoolManager;

    V4SwapAdapter adapter;
    IPoolManager constant PM = IPoolManager(GT.UNIV4_POOL_MANAGER);

    address constant USO = 0xa5a3e8FF2a61EdFb60fFB2ccAA89dDF0eFE3d227;
    address constant BB = 0x33E308242F5d38980Fa5845B03B1AcC63eea0777;
    address constant SCHNOZ = 0xacd798Faf58345a1308D26BbCdf6E6e6b450F4dd;
    address constant ERC20_TOKEN = 0x70122C10800AE1905092157c21C0Df58802998F2;

    /// A block at which these pools were tradeable. Verified by reading liquidity there.
    uint256 constant FORK_BLOCK = 21694303;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"), FORK_BLOCK);
        vm.txGasPrice(21.25 gwei);
        adapter = new V4SwapAdapter(GT.UNIV4_POOL_MANAGER);
        vm.deal(address(this), 100_000e18);
    }

    receive() external payable {}

    /// Reports total cost split into the pool's own fee and true price impact. A user cares
    /// about impact; the fee is a known, advertised cost. Conflating them makes a deep pool
    /// with a 1% fee look as bad as a shallow one.
    function _measure(string memory name, PoolKey memory key, uint256 usdc) internal returns (uint256 bps) {
        (uint160 sqrtP,,,) = PM.slot0(poolIdOf(key));
        require(sqrtP > 0, "pool not initialised");

        IERC20(GT.USDC).approve(address(adapter), type(uint256).max);
        uint256 before = IERC20(key.currency1).balanceOf(address(this));
        uint256 out = adapter.swapExactIn(key, true, usdc, address(this));
        uint256 got = IERC20(key.currency1).balanceOf(address(this)) - before;
        assertEq(got, out, "reported != delivered");

        // spot price: token1 per token0, both raw units. realised: out/in, raw units.
        // slippage = 1 - realised/spot, in basis points.
        uint256 spotQ = (uint256(sqrtP) * uint256(sqrtP)) >> 96; // Q96 of price
        uint256 expected = (usdc * spotQ) >> 96;
        bps = expected > out ? ((expected - out) * 10_000) / expected : 0;
        uint256 feeBps = uint256(key.fee) / 100; // V4 fee is in hundredths of a bip
        uint256 impactBps = bps > feeBps ? bps - feeBps : 0;
        console.log(name, usdc / (key.currency0 == address(0) ? 1e18 : 1e6), "USDC in");
        console.log("        total bps:", bps, " of which pool fee:", feeBps);
        console.log("        true price impact bps:", impactBps);
    }

    function test_depth_USO_50() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        uint256 bps = _measure("USO   ", k, 50e18);
        assertLt(bps, 500, "USO: >5% slippage on $50");
    }

    function test_depth_USO_500() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        _measure("USO   ", k, 500e18);
    }

    /// BB reports 4.5e24 liquidity, traded 135 times in 6h with a single stable liquidity
    /// value in its Swap events, and yet a real swap here returns nothing in EITHER direction.
    /// We do not know why, and that is recorded rather than guessed at. The point stands
    /// regardless: only an executed swap reveals this, so the curated list must be gated by
    /// executed swaps, never by reading the liquidity field.
    function test_depth_BB_isNotTradeableAtThisBlock() public {
        PoolKey memory k = PoolKey(address(0), BB, 2500, 50, address(0));
        IERC20(GT.USDC).approve(address(adapter), type(uint256).max);
        vm.expectRevert(V4SwapAdapter.NothingReceived.selector);
        adapter.swapExactIn(k, true, 50e18, address(this));
    }

    function test_depth_SCHNOZ_50() public {
        PoolKey memory k = PoolKey(address(0), SCHNOZ, 100, 1, address(0));
        _measure("SCHNOZ", k, 50e18);
    }

    function test_depth_ERC20POOL_50() public {
        PoolKey memory k = PoolKey(GT.USDC, ERC20_TOKEN, 30000, 200, address(0));
        _measure("ERC20 ", k, 50e6);
    }

    /// The whole reason the adapter needed a native path: the deepest pools on Arc quote
    /// against native USDC, not the ERC-20 interface.
    function test_nativeCurrencyPoolIsTradeable() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        IERC20(GT.USDC).approve(address(adapter), type(uint256).max);
        uint256 out = adapter.swapExactIn(k, true, 10e18, address(this));
        assertGt(out, 0, "native-currency pool must be tradeable");
    }

    // =================================================================
    // THE DIRECTION THAT MATTERS
    // A stop-loss SELLS the token for USDC. Buying is what a user does beforehand, on their
    // own. Testing only the buy direction measured the wrong thing entirely.
    // =================================================================

    /// V4 accounts native USDC in 18dp, so a pool whose currency0 is address(0) pays out in
    /// NATIVE units. Comparing that against a 6dp balanceOf delta is wrong by 1e12 - which is
    /// exactly the mistake this codebase exists to avoid, and it bit this test first.
    function _sell(string memory name, PoolKey memory key, uint256 tokenAmount)
        internal
        returns (uint256 out)
    {
        bool nativeOut = key.currency0 == address(0);
        deal(key.currency1, address(this), tokenAmount);
        IERC20(key.currency1).approve(address(adapter), tokenAmount);

        uint256 nativeBefore = address(this).balance;
        uint256 erc20Before = IERC20(GT.USDC).balanceOf(address(this));

        out = adapter.swapExactIn(key, false, tokenAmount, address(this)); // oneForZero

        if (nativeOut) {
            assertEq(address(this).balance - nativeBefore, out, "native delivery mismatch");
            console.log(name, "sold -> native 18dp:", out);
            console.log("        same money, 6dp view:", IERC20(GT.USDC).balanceOf(address(this)) - erc20Before);
        } else {
            assertEq(IERC20(GT.USDC).balanceOf(address(this)) - erc20Before, out, "erc20 delivery mismatch");
            console.log(name, "sold -> USDC 6dp:", out);
        }
    }

    function test_canSellUSO() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        uint256 out = _sell("USO   ", k, 1e18);
        assertGt(out, 0, "cannot sell USO - stop-loss would be unfillable");
    }

    /// The sell direction fails too. A pool like this must never reach the curated list:
    /// a stop-loss on it would sit armed and unfillable.
    function test_cannotSellBB() public {
        PoolKey memory k = PoolKey(address(0), BB, 2500, 50, address(0));
        deal(BB, address(this), 1e18);
        IERC20(BB).approve(address(adapter), 1e18);
        vm.expectRevert(V4SwapAdapter.NothingReceived.selector);
        adapter.swapExactIn(k, false, 1e18, address(this));
    }

    function test_canSellSCHNOZ() public {
        PoolKey memory k = PoolKey(address(0), SCHNOZ, 100, 1, address(0));
        uint256 out = _sell("SCHNOZ", k, 1e18);
        assertGt(out, 0, "cannot sell SCHNOZ - stop-loss would be unfillable");
    }
}
