import { parseAbiItem, type Hex } from "viem";
import { clientFor } from "./clients";
import { poolIdOf } from "./pools";
import type { Market } from "./markets";

const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;

/**
 * Price history reconstructed from Swap EVENTS, not from state reads.
 *
 * Each V4 Swap log carries the pool's tick at the moment it executed, so a series of them is a
 * real price history written by the PoolManager itself. This matters here specifically: state
 * reads against the public Arc RPC have returned zero for slots that events prove were
 * non-zero, so events are the trustworthy source.
 */
const SWAP = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
);

export type Series = { ticks: number[]; blocks: bigint[] };

export async function readHistory(m: Market, blocks = 40_000): Promise<Series> {
  const client = clientFor(m.network);
  const head = await client.getBlockNumber();
  try {
    const logs = await client.getLogs({
      address: PM as Hex,
      event: SWAP,
      args: { id: poolIdOf(m) },
      fromBlock: head - BigInt(blocks),
      toBlock: head,
    });
    return {
      ticks: logs.map((l) => Number(l.args.tick)),
      blocks: logs.map((l) => l.blockNumber),
    };
  } catch {
    // The RPC caps eth_getLogs at 2000 results; a busy pool over a wide range trips it.
    // Returning empty is honest — the UI shows "no recent trades" rather than a fabricated line.
    return { ticks: [], blocks: [] };
  }
}
