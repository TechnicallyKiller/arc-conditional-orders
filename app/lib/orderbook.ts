import { parseAbi, type PublicClient } from "viem";

export const orderBookAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct Order { address owner; address tokenIn; uint128 amountIn; uint128 minAmountOut; PoolKey key; int24 triggerTick; bool triggerBelow; uint64 expiry; uint8 status; uint64 armedAtBlock; int24 armedTick; }",
  "function nextOrderId() view returns (uint256)",
  "function getOrder(uint256 id) view returns (Order)",
  "function checkOrders(uint256[] ids) view returns (uint8[] states, int24[] ticks)",
  "function minDwellBlocks() view returns (uint64)",
  "function feeBps() view returns (uint16)",
  "function maxOrderValueUsdc() view returns (uint256)",
  "function maxTotalValueUsdc() view returns (uint256)",
  "function totalFilledUsdc() view returns (uint256)",
]);

/** Mirrors OrderBook.TriggerState. PoolUnreadable is its own value, never folded into NotTriggered. */
export enum TriggerState {
  NotOpen = 0, Expired = 1, PoolUnreadable = 2, NotTriggered = 3,
  Triggered = 4, Arming = 5, ArmExpired = 6, Ready = 7,
}

export const STATUS = ["None", "Open", "Filled", "Cancelled"] as const;

export type OrderView = {
  id: bigint;
  owner: `0x${string}`;
  tokenIn: `0x${string}`;
  amountIn: bigint;
  minAmountOut: bigint;
  triggerTick: number;
  triggerBelow: boolean;
  status: number;
  armedAtBlock: bigint;
  state: TriggerState;
  tick: number;
};

/** price = 1.0001^tick. Ticks carry no decimals, which keeps the 18-vs-6 hazard off this path. */
export const priceFromTick = (t: number) => Math.pow(1.0001, t);
export const tickFromPrice = (p: number) => Math.round(Math.log(p) / Math.log(1.0001));

export function sig(n: number, digits = 4): string {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  const exp = Math.floor(Math.log10(n));
  return n.toFixed(Math.min(18, Math.max(0, -exp + digits - 1)));
}

export const fmt = (n: number, dp = 6) =>
  isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";

export async function loadOrders(orderBook: `0x${string}`, client: PublicClient): Promise<OrderView[]> {
  const next = await client.readContract({ address: orderBook, abi: orderBookAbi, functionName: "nextOrderId" });
  const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
  if (!ids.length) return [];

  const [states, ticks] = (await client.readContract({
    address: orderBook, abi: orderBookAbi, functionName: "checkOrders", args: [ids],
  })) as unknown as [number[], number[]];

  const orders = await Promise.all(
    ids.map((id) => client.readContract({ address: orderBook, abi: orderBookAbi, functionName: "getOrder", args: [id] }))
  );

  return orders.map((o: any, i) => ({
    id: ids[i], owner: o.owner, tokenIn: o.tokenIn, amountIn: o.amountIn,
    minAmountOut: o.minAmountOut, triggerTick: o.triggerTick, triggerBelow: o.triggerBelow,
    status: o.status, armedAtBlock: o.armedAtBlock,
    state: states[i] as TriggerState, tick: ticks[i],
  }));
}

/**
 * Decimals-aware tick conversion. THIS IS THE LINE THAT MATTERS.
 *
 * A V4 tick prices currency1 against currency0 in RAW units. A human price is in display units.
 * They differ by 10^(dec1 - dec0), which for a USDC(6) / token(18) pair is 10^12 — the same
 * factor that has bitten this project three times. Computing the tick from the human price
 * directly, as the design mockup did, produces a trigger that is wrong by a trillion.
 *
 *   raw = human * 10^(dec1 - dec0)
 *   tick = log(raw) / log(1.0001)
 */
export function tickFromHumanPrice(human: number, dec0: number, dec1: number): number | null {
  if (!isFinite(human) || human <= 0) return null;
  const raw = human * Math.pow(10, dec1 - dec0);
  const t = Math.round(Math.log(raw) / Math.log(1.0001));
  return Number.isFinite(t) ? t : null;
}

export function humanPriceFromTick(tick: number, dec0: number, dec1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
}
