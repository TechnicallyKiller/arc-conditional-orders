import { parseAbiItem, type Hex, type PublicClient } from "viem";

/**
 * Keeper liveness, derived from EVENTS the keeper actually emitted.
 *
 * Not from order state: an order sits in `Ready` precisely because a keeper armed it and then
 * stopped, so "some order is armed" reports a dead keeper as live — the exact failure this
 * indicator exists to catch. Only a recent OrderArmed or OrderFilled proves someone is watching.
 */
const ARMED = parseAbiItem("event OrderArmed(uint256 indexed id, int24 tick, uint64 atBlock)");
const FILLED = parseAbiItem(
  "event OrderFilled(uint256 indexed id, address indexed keeper, uint256 amountOut, uint256 fee, uint256 gasCostNative)"
);

/** ~100s at Arc's 0.507s blocks. A keeper polling every few seconds clears this easily. */
export const STALE_AFTER_BLOCKS = 200n;

export type KeeperStatus = {
  head: bigint;
  lastSeen: bigint | null;
  ageBlocks: bigint | null;
  alive: boolean;
  reachable: boolean;
};

/**
 * `logsClient` is separate from `client` on purpose. Provider free tiers cap eth_getLogs hard —
 * Alchemy's allows a 10 BLOCK range and this needs thousands — so sending the log query to the
 * configured provider throws, and a caller that treats any throw as "chain unreachable" then
 * reports a healthy chain as down. Contract reads go to the provider; logs go to the public RPC.
 */
export async function readKeeper(
  orderBook: Hex,
  client: PublicClient,
  logsClient: PublicClient = client,
  lookback = 3000n,
): Promise<KeeperStatus> {
  try {
    const head = await client.getBlockNumber();
    const fromBlock = head > lookback ? head - lookback : 0n;
    const [armed, filled] = await Promise.all([
      logsClient.getLogs({ address: orderBook, event: ARMED, fromBlock, toBlock: head }),
      logsClient.getLogs({ address: orderBook, event: FILLED, fromBlock, toBlock: head }),
    ]);
    const blocks = [...armed, ...filled].map((l) => l.blockNumber);
    const lastSeen = blocks.length ? blocks.reduce((a, b) => (b > a ? b : a)) : null;
    const ageBlocks = lastSeen === null ? null : head - lastSeen;
    return {
      head, lastSeen, ageBlocks,
      alive: ageBlocks !== null && ageBlocks < STALE_AFTER_BLOCKS,
      reachable: true,
    };
  } catch {
    return { head: 0n, lastSeen: null, ageBlocks: null, alive: false, reachable: false };
  }
}

export const secondsFromBlocks = (b: bigint) => Number(b) * 0.507;
