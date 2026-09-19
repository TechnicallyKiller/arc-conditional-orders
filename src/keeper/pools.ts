import { keccak256, encodePacked, type PublicClient, type Address, type Hex } from "viem";
import { poolManagerAbi } from "./abi.js";

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** Slot of the `pools` mapping in the V4 PoolManager. Verified on Arc mainnet. */
const POOLS_SLOT = 6n;

export function stateSlot(poolId: Hex): Hex {
  return keccak256(encodePacked(["bytes32", "uint256"], [poolId, POOLS_SLOT]));
}

/** slot0 packs sqrtPriceX96 (160) | tick (24) | protocolFee (24) | lpFee (24). */
export async function readTick(
  client: PublicClient,
  poolManager: Address,
  poolId: Hex
): Promise<number | null> {
  const raw = await client.readContract({
    address: poolManager,
    abi: poolManagerAbi,
    functionName: "extsload",
    args: [stateSlot(poolId)],
  });
  const v = BigInt(raw);
  const sqrtPrice = v & ((1n << 160n) - 1n);
  if (sqrtPrice === 0n) return null; // pool uninitialised
  let tick = Number((v >> 160n) & ((1n << 24n) - 1n));
  if (tick >= 1 << 23) tick -= 1 << 24;
  return tick;
}

/**
 * poolId is keccak256(abi.encode(PoolKey)), and the OrderBook only stores the id, so the keeper
 * needs its own id -> key index. Arc's RPC caps eth_getLogs at 2000 results, so this walks in
 * chunks rather than asking for the whole history at once.
 */
export async function indexPools(
  client: PublicClient,
  poolManager: Address,
  fromBlock: bigint,
  toBlock: bigint,
  chunk = 400n
): Promise<Map<string, PoolKey>> {
  const out = new Map<string, PoolKey>();
  for (let b = fromBlock; b <= toBlock; b += chunk) {
    const hi = b + chunk > toBlock ? toBlock : b + chunk;
    try {
      const logs = await client.getContractEvents({
        address: poolManager,
        abi: poolManagerAbi,
        eventName: "Initialize",
        fromBlock: b,
        toBlock: hi,
      });
      for (const log of logs) {
        const a = log.args;
        if (!a.id || !a.currency0 || !a.currency1 || a.hooks === undefined) continue;
        out.set(a.id.toLowerCase(), {
          currency0: a.currency0,
          currency1: a.currency1,
          fee: Number(a.fee),
          tickSpacing: Number(a.tickSpacing),
          hooks: a.hooks,
        });
      }
    } catch {
      // A chunk that exceeds the 2000-result cap is skipped rather than silently counted as
      // zero - that exact mistake cost us a wrong conclusion during Phase 0.
      console.warn(`  [pools] chunk ${b}-${hi} failed (likely >2000 results); narrow the range`);
    }
  }
  return out;
}

import { encodeAbiParameters } from "viem";

/** poolId = keccak256(abi.encode(PoolKey)). Verified against a live Arc pool. */
export function poolIdOf(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]
    )
  );
}
