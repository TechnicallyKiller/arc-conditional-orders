// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {DemoToken} from "../contracts/demo/DemoToken.sol";
import {DemoLiquidity} from "../contracts/demo/DemoLiquidity.sol";
import {PoolKey, poolIdOf, PoolId} from "../contracts/interfaces/IPoolManager.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

/// Creates the demo market: a worthless token, a pool we control, and liquidity to trade against.
/// Testnet sandbox. The point is that a visitor can watch a real order fill within seconds.
contract DeployDemo is Script {
    // Full range for tickSpacing 60.
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;
    uint24 constant FEE = 3000;
    int24 constant SPACING = 60;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);

        vm.startBroadcast(pk);

        DemoToken token = new DemoToken("Arc Demo", "ADEMO");
        DemoLiquidity liq = new DemoLiquidity(GT.UNIV4_POOL_MANAGER);

        // currency0 is native USDC (address(0)), which always sorts first.
        PoolKey memory key = PoolKey({
            currency0: address(0),
            currency1: address(token),
            fee: FEE,
            tickSpacing: SPACING,
            hooks: address(0)
        });

        // Start at 1 USDC = 1000 ADEMO. sqrtPriceX96 = sqrt(1000) * 2^96.
        uint160 sqrtPriceX96 = 2505414483750479311864138015696;
        liq.initializePool(key, sqrtPriceX96);

        // Seed with 5 USDC and 5,000 ADEMO across the full range.
        token.mint(me, 10_000e18);
        token.approve(address(liq), type(uint256).max);
        IERC20(GT.USDC).approve(address(liq), type(uint256).max);
        liq.addLiquidity(key, MIN_TICK, MAX_TICK, int256(158_113_883_008_418_966_599));

        vm.stopBroadcast();

        console.log("DEMO_TOKEN=%s", address(token));
        console.log("DEMO_LIQUIDITY=%s", address(liq));
        console.log("DEMO_POOL_ID=%s", vm.toString(PoolId.unwrap(poolIdOf(key))));
    }
}
