// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {OrderBook} from "../contracts/OrderBook.sol";
import {V4SwapAdapter} from "../contracts/adapters/V4SwapAdapter.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address feeRecipient = vm.envOr("FEE_RECIPIENT", vm.addr(pk));

        vm.startBroadcast(pk);

        V4SwapAdapter adapter = new V4SwapAdapter(GT.UNIV4_POOL_MANAGER);
        OrderBook book = new OrderBook(
            GT.UNIV4_POOL_MANAGER,
            feeRecipient,
            50,      // 0.5% fee
            0,       // margin above gas cost, native 18dp
            30_000,  // settlement gas overhead - MEASURE this on a real deployment
            2,       // minDwellBlocks  (~1.0s at 0.507s blocks)
            300      // maxArmAgeBlocks (~2.5 min)
        );
        book.setRouter(address(adapter), true);

        vm.stopBroadcast();

        console.log("SWAP_ADAPTER=%s", address(adapter));
        console.log("ORDER_BOOK=%s", address(book));
    }
}
