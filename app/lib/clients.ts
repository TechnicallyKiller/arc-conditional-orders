import { createPublicClient, http, type PublicClient } from "viem";
import { arc, arcTestnet } from "./chain";

/**
 * One client per network. Reading a mainnet pool through the testnet RPC returns nothing, which
 * is why every mainnet row rendered as "—": the pool does not exist on the chain being asked.
 */
export const testnetClient = createPublicClient({ chain: arcTestnet, transport: http() }) as PublicClient;
export const mainnetClient = createPublicClient({ chain: arc, transport: http() }) as PublicClient;

export const clientFor = (network: "mainnet" | "testnet") =>
  network === "mainnet" ? mainnetClient : testnetClient;
