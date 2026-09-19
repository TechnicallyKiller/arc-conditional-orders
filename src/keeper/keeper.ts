import {
  createPublicClient, createWalletClient, http, encodeFunctionData,
  type Address, type Hex, type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc, MIN_MAX_FEE_PER_GAS, NATIVE_PER_ERC20 } from "../lib/chain.js";
import { orderBookAbi, adapterAbi, Status, TriggerState } from "./abi.js";
import { readTick, poolIdOf, type PoolKey } from "./pools.js";

export type Mode = "observe" | "simulate" | "execute";

export type Config = {
  mode: Mode;
  orderBook: Address;
  adapter: Address;
  poolManager: Address;
  privateKey?: Hex;
  pollMs: number;
  lookbackBlocks: bigint;
};

type Order = {
  id: bigint;
  owner: Address;
  tokenIn: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  key: PoolKey;
  triggerTick: number;
  triggerBelow: boolean;
  expiry: bigint;
  status: number;
  armedAtBlock: bigint;
  armedTick: number;
};

const fmtUsdc = (v: bigint) => `${(Number(v) / 1e6).toFixed(6)} USDC`;
const fmtNative = (v: bigint) => `${(Number(v) / 1e18).toFixed(8)} USDC`;

export class Keeper {
  constructor(
    private cfg: Config,
    private client: PublicClient
  ) {}

  async start() {
    console.log(`keeper starting in ${this.cfg.mode.toUpperCase()} mode`);
    console.log(`  orderBook ${this.cfg.orderBook}`);

    // No pool indexing: each order carries its own PoolKey, so the keeper can route any order
    // regardless of how long ago its pool was created.
    console.log("");

    for (;;) {
      try {
        await this.tick();
      } catch (e) {
        // Never die on a transient RPC failure; a keeper that silently stops is the worst
        // failure mode, because the trader believes they are protected.
        console.error("tick failed:", e instanceof Error ? e.message : e);
      }
      await new Promise((r) => setTimeout(r, this.cfg.pollMs));
    }
  }

  private async tick() {
    const [head, nextId] = await Promise.all([
      this.client.getBlockNumber(),
      this.client.readContract({ address: this.cfg.orderBook, abi: orderBookAbi, functionName: "nextOrderId" }),
    ]);

    const open: Order[] = [];
    for (let id = 1n; id < nextId; id++) {
      const o = await this.readOrder(id);
      if (o && o.status === Status.Open) open.push(o);
    }
    if (open.length === 0) {
      console.log(`[${head}] no open orders`);
      return;
    }

    // One on-chain call evaluates every order against the SAME block, and reports an
    // unreadable pool explicitly rather than letting it masquerade as "not triggered".
    const [states, ticks] = (await this.client.readContract({
      address: this.cfg.orderBook, abi: orderBookAbi, functionName: "checkOrders",
      args: [open.map((o) => o.id)],
    })) as unknown as [number[], number[]];

    for (let i = 0; i < open.length; i++) {
      const o = open[i];
      const state = states[i] as TriggerState;
      const tick = ticks[i];
      const dir = o.triggerBelow ? "<=" : ">=";
      const label = `order ${o.id} tick ${tick} ${dir} ${o.triggerTick}`;

      if (state === TriggerState.PoolUnreadable) {
        // Never treat this as "nothing to do". The user believes they are protected.
        console.error(
          `[${head}] order ${o.id}: *** POOL UNREADABLE *** cannot evaluate the trigger. ` +
          `This is an RPC or pool problem, NOT a quiet no-op. Orders on this pool are unprotected.`
        );
        continue;
      }
      if (state === TriggerState.NotOpen || state === TriggerState.Expired) continue;
      if (state === TriggerState.NotTriggered) {
        console.log(`[${head}] ${label}: not triggered`);
        continue;
      }
      if (state === TriggerState.Triggered) {
        console.log(`[${head}] ${label}: TRIGGERED, needs arming`);
        if (this.cfg.mode === "execute") await this.arm(o.id);
        continue;
      }
      if (state === TriggerState.Arming) {
        console.log(`[${head}] ${label}: armed at ${o.armedAtBlock}, waiting out dwell`);
        continue;
      }
      if (state === TriggerState.ArmExpired) {
        console.log(`[${head}] ${label}: arm went stale, re-arming`);
        if (this.cfg.mode === "execute") await this.arm(o.id);
        continue;
      }

      console.log(`[${head}] ${label}: ARMED AND READY`);
      if (this.cfg.mode === "observe") continue;

      const quote = await this.simulate(o);
      if (!quote) continue;
      console.log(
        `          simulated: out ${fmtUsdc(quote.amountOut)}  fee ${fmtUsdc(quote.fee)}  ` +
        `gas ${quote.gas}  cost ${fmtNative(quote.gasCost)}  profit ${fmtNative(quote.profit)}`
      );
      if (quote.profit <= 0n) {
        console.log(`          SKIP: fee does not cover gas`);
        continue;
      }
      if (this.cfg.mode === "execute") await this.fill(o, quote.gas);
    }
  }

  private async readOrder(id: bigint): Promise<Order | null> {
    try {
      const r = await this.client.readContract({
        address: this.cfg.orderBook, abi: orderBookAbi, functionName: "getOrder", args: [id],
      }) as any;
      return {
        id, owner: r.owner, tokenIn: r.tokenIn, amountIn: r.amountIn,
        minAmountOut: r.minAmountOut, key: r.key, triggerTick: r.triggerTick,
        triggerBelow: r.triggerBelow, expiry: r.expiry, status: r.status,
        armedAtBlock: r.armedAtBlock, armedTick: r.armedTick,
      };
    } catch {
      return null;
    }
  }

  private routeData(o: Order): Hex {
    // Selling tokenIn: zeroForOne is true only when tokenIn is currency0.
    const zeroForOne = o.key.currency0.toLowerCase() === o.tokenIn.toLowerCase();
    return encodeFunctionData({
      abi: adapterAbi, functionName: "swapExactIn",
      args: [o.key, zeroForOne, o.amountIn, this.cfg.orderBook],
    });
  }

  private async simulate(o: Order) {
    const data = this.routeData(o);
    const account = this.cfg.privateKey ? privateKeyToAccount(this.cfg.privateKey).address : undefined;
    try {
      const { result } = await this.client.simulateContract({
        address: this.cfg.orderBook, abi: orderBookAbi, functionName: "execute",
        args: [o.id, this.cfg.adapter, data], account,
      });
      const [amountOut, fee] = result as unknown as [bigint, bigint];
      const gas = await this.client.estimateContractGas({
        address: this.cfg.orderBook, abi: orderBookAbi, functionName: "execute",
        args: [o.id, this.cfg.adapter, data], account,
      }).catch(() => 400_000n);
      const fees = await this.client.estimateFeesPerGas().catch(() => null);
      const price = bumpToFloor(fees?.maxFeePerGas ?? MIN_MAX_FEE_PER_GAS);
      const gasCost = gas * price;
      // Fee is a 6dp ERC-20 amount; gas cost is native 18dp. Scale before comparing.
      const profit = fee * NATIVE_PER_ERC20 - gasCost;
      return { amountOut, fee, gas, gasCost, profit, data };
    } catch (e) {
      console.log(`          simulation reverted: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      return null;
    }
  }

  private wallet() {
    if (!this.cfg.privateKey) throw new Error("execute mode needs a private key");
    return createWalletClient({
      account: privateKeyToAccount(this.cfg.privateKey), chain: arc, transport: http(process.env.RPC_URL),
    });
  }

  private async arm(id: bigint) {
    const w = this.wallet();
    const fees = await this.client.estimateFeesPerGas().catch(() => null);
    const hash = await w.writeContract({
      address: this.cfg.orderBook, abi: orderBookAbi, functionName: "armOrder", args: [id],
      maxFeePerGas: bumpToFloor(fees?.maxFeePerGas ?? MIN_MAX_FEE_PER_GAS),
      maxPriorityFeePerGas: fees?.maxPriorityFeePerGas ?? 0n,
      chain: arc,
    });
    // Arc has deterministic finality: one confirmation is final.
    await this.client.waitForTransactionReceipt({ hash, confirmations: 1 });
    console.log(`          ARMED ${id} in ${hash}`);
  }

  private async fill(o: Order, gas: bigint) {
    const data = this.routeData(o);
    const w = this.wallet();
    const fees = await this.client.estimateFeesPerGas().catch(() => null);
    const hash = await w.writeContract({
      address: this.cfg.orderBook, abi: orderBookAbi, functionName: "execute",
      args: [o.id, this.cfg.adapter, data],
      gas: (gas * 12n) / 10n,
      maxFeePerGas: bumpToFloor(fees?.maxFeePerGas ?? MIN_MAX_FEE_PER_GAS),
      maxPriorityFeePerGas: fees?.maxPriorityFeePerGas ?? 0n,
      chain: arc,
    });
    const rc = await this.client.waitForTransactionReceipt({ hash, confirmations: 1 });
    console.log(
      `          FILLED ${o.id} in ${hash} (${rc.status}, ${rc.gasUsed} gas, ` +
      `${fmtNative(rc.gasUsed * rc.effectiveGasPrice)})`
    );
  }
}

/**
 * Arc's mempool SILENTLY DISCARDS transactions below 20 Gwei maxFeePerGas: no receipt, no
 * error, no block inclusion. The keeper would appear broken with no evidence why.
 */
export function bumpToFloor(maxFeePerGas: bigint): bigint {
  return maxFeePerGas < MIN_MAX_FEE_PER_GAS ? MIN_MAX_FEE_PER_GAS : maxFeePerGas;
}

export function makeClient(): PublicClient {
  // RPC_URL lets the keeper run against a local arc-anvil fork without touching mainnet.
  return createPublicClient({ chain: arc, transport: http(process.env.RPC_URL) }) as PublicClient;
}
