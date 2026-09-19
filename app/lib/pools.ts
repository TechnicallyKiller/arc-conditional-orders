import { keccak256, encodeAbiParameters, type Hex } from "viem";
import { clientFor } from "./clients";
import type { Market } from "./markets";

const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;
const POOLS_SLOT = 6n;

export function poolIdOf(m: Market): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [m.currency0, m.token, m.fee, m.tickSpacing, m.hooks]
    )
  );
}

const stateSlot = (id: Hex) => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, POOLS_SLOT]));

export type PoolState = { tick: number; liquidity: bigint; readable: boolean };

/** Reads slot0 and liquidity for many pools in one multicall, so all rows share a block. */
export async function readPools(markets: Market[]): Promise<Record<string, PoolState>> {
  const byNetwork = { mainnet: markets.filter((m) => m.network === "mainnet"), testnet: markets.filter((m) => m.network === "testnet") };
  const parts = await Promise.all(
    (Object.keys(byNetwork) as (keyof typeof byNetwork)[])
      .filter((n) => byNetwork[n].length)
      .map((n) => readPoolsOn(n, byNetwork[n]))
  );
  return Object.assign({}, ...parts);
}

async function readPoolsOn(network: "mainnet" | "testnet", markets: Market[]): Promise<Record<string, PoolState>> {
  const client = clientFor(network);
  const abi = [{
    name: "extsload", type: "function", stateMutability: "view",
    inputs: [{ type: "bytes32" }], outputs: [{ type: "bytes32" }],
  }] as const;

  const calls = markets.flatMap((m) => {
    const base = BigInt(stateSlot(poolIdOf(m)));
    return [
      { address: PM as Hex, abi, functionName: "extsload", args: [`0x${base.toString(16).padStart(64, "0")}` as Hex] },
      { address: PM as Hex, abi, functionName: "extsload", args: [`0x${(base + 3n).toString(16).padStart(64, "0")}` as Hex] },
    ];
  });

  const res = await client.multicall({ contracts: calls, allowFailure: true });
  const out: Record<string, PoolState> = {};

  markets.forEach((m, i) => {
    const s0 = res[i * 2], liq = res[i * 2 + 1];
    if (s0.status !== "success") { out[m.symbol] = { tick: 0, liquidity: 0n, readable: false }; return; }
    const v = BigInt(s0.result as Hex);
    const sqrt = v & ((1n << 160n) - 1n);
    let tick = Number((v >> 160n) & ((1n << 24n) - 1n));
    if (tick >= 1 << 23) tick -= 1 << 24;
    out[m.symbol] = {
      tick,
      liquidity: liq.status === "success" ? BigInt(liq.result as Hex) : 0n,
      readable: sqrt !== 0n,
    };
  });
  return out;
}
