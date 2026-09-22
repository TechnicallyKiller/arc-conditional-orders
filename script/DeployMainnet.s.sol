// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {OrderBook} from "../contracts/OrderBook.sol";
import {V4SwapAdapter} from "../contracts/adapters/V4SwapAdapter.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

/**
 * Mainnet deployment. Deliberately stricter than Deploy.s.sol, which defaults the exposure
 * caps to 0 (unlimited) because that is the right default for a testnet sandbox and exactly
 * the wrong one for real money.
 *
 * This script refuses to run unless:
 *   - it is pointed at Arc mainnet (chain 5042), and
 *   - both exposure caps are set to a non-zero value.
 *
 * The caps bind on REALISED PROCEEDS, not on the input amount. Valuing the input would need
 * a price oracle for an arbitrary token; the output leg is USDC, which is the unit the cap is
 * denominated in, so it can be checked exactly with no external dependency.
 */
contract DeployMainnet is Script {
    uint256 internal constant ARC_MAINNET = 5042;

    function run() external {
        require(block.chainid == ARC_MAINNET, "not Arc mainnet - use Deploy.s.sol for testnet");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);

        // USDC 6dp. No default: shipping uncapped must be a deliberate act, not an omission.
        uint256 maxOrder = vm.envUint("MAX_ORDER_USDC");
        uint256 maxTotal = vm.envUint("MAX_TOTAL_USDC");
        require(maxOrder > 0, "MAX_ORDER_USDC must be set on mainnet");
        require(maxTotal > 0, "MAX_TOTAL_USDC must be set on mainnet");
        require(maxTotal >= maxOrder, "MAX_TOTAL_USDC below MAX_ORDER_USDC");

        // Arc's mempool silently discards anything under 20 gwei: no receipt, no error, no
        // inclusion. A deploy that vanishes with no diagnostic is worth one require().
        require(tx.gasprice == 0 || tx.gasprice >= GT.MIN_BASE_FEE, "gas price below Arc's 20 gwei floor");

        console.log("deployer        %s", deployer);
        console.log("balance (wei)   %s", deployer.balance);
        console.log("fee recipient   %s", feeRecipient);
        console.log("max per fill    %s USDC (6dp)", maxOrder);
        console.log("max cumulative  %s USDC (6dp)", maxTotal);

        vm.startBroadcast(pk);

        V4SwapAdapter adapter = new V4SwapAdapter(GT.UNIV4_POOL_MANAGER);
        OrderBook book = new OrderBook(
            GT.UNIV4_POOL_MANAGER,
            feeRecipient,
            50,      // 0.5% fee, basis points
            0,       // margin required above gas cost, native 18dp
            30_000,  // settlement gas overhead
            2,       // minDwellBlocks  (~1.0s at 0.507s blocks)
            300,     // maxArmAgeBlocks (~2.5 min)
            maxOrder,
            maxTotal
        );
        book.setRouter(address(adapter), true);

        vm.stopBroadcast();

        // Read back rather than trusting the constructor arguments: this is the only evidence
        // that the caps are actually live on the deployed bytecode.
        require(book.maxOrderValueUsdc() == maxOrder, "cap readback mismatch");
        require(book.maxTotalValueUsdc() == maxTotal, "cap readback mismatch");
        require(book.owner() == deployer, "owner mismatch");

        console.log("");
        console.log("SWAP_ADAPTER=%s", address(adapter));
        console.log("ORDER_BOOK=%s", address(book));
        console.log("");
        console.log("caps verified on-chain. Owner may change them later via setCaps().");
    }
}
