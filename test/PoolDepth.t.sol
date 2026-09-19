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

        IERC20(GT.USDC).approve(address(adapter), usdc);
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
        console.log(name, usdc / 1e6, "USDC in");
        console.log("        total bps:", bps, " of which pool fee:", feeBps);
        console.log("        true price impact bps:", impactBps);
    }

    function test_depth_USO_50() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        uint256 bps = _measure("USO   ", k, 50e6);
        assertLt(bps, 500, "USO: >5% slippage on $50");
    }

    function test_depth_USO_500() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        _measure("USO   ", k, 500e6);
    }

    /// BB has large nominal liquidity but a real swap returns nothing, so it must NOT go on
    /// the curated list. This is exactly why the list is gated by executed swaps rather than
    /// by reading the liquidity field: nominal depth is not tradeable depth.
    function test_depth_BB_isNotTradeable() public {
        PoolKey memory k = PoolKey(address(0), BB, 2500, 50, address(0));
        IERC20(GT.USDC).approve(address(adapter), 50e6);
        vm.expectRevert(V4SwapAdapter.NothingReceived.selector);
        adapter.swapExactIn(k, true, 50e6, address(this));
    }

    function test_depth_SCHNOZ_50() public {
        PoolKey memory k = PoolKey(address(0), SCHNOZ, 100, 1, address(0));
        _measure("SCHNOZ", k, 50e6);
    }

    function test_depth_ERC20POOL_50() public {
        PoolKey memory k = PoolKey(GT.USDC, ERC20_TOKEN, 30000, 200, address(0));
        _measure("ERC20 ", k, 50e6);
    }

    /// The whole reason the adapter needed a native path: the deepest pools on Arc quote
    /// against native USDC, not the ERC-20 interface.
    function test_nativeCurrencyPoolIsTradeable() public {
        PoolKey memory k = PoolKey(address(0), USO, 10000, 200, address(0));
        IERC20(GT.USDC).approve(address(adapter), 10e6);
        uint256 out = adapter.swapExactIn(k, true, 10e6, address(this));
        assertGt(out, 0, "native-currency pool must be tradeable");
    }
}
