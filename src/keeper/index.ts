import { Keeper, makeClient, type Config, type Mode } from "./keeper.js";
import type { Address, Hex } from "viem";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
}

const mode = (process.argv[2] ?? "observe") as Mode;
if (!["observe", "simulate", "execute"].includes(mode)) {
  console.error("usage: keeper <observe|simulate|execute>");
  console.error("  observe  - report which triggers are met. Touches nothing.");
  console.error("  simulate - also simulate the fill and price it against gas. Sends nothing.");
  console.error("  execute  - actually arm and fill. Needs KEEPER_PRIVATE_KEY.");
  process.exit(1);
}

const cfg: Config = {
  mode,
  orderBook: env("ORDER_BOOK") as Address,
  adapter: env("SWAP_ADAPTER") as Address,
  poolManager: env("POOL_MANAGER", "0x8366a39CC670B4001A1121B8F6A443A643e40951") as Address,
  privateKey: process.env.KEEPER_PRIVATE_KEY as Hex | undefined,
  pollMs: Number(env("POLL_MS", "3000")),
  lookbackBlocks: BigInt(env("LOOKBACK_BLOCKS", "20000")),
};

if (mode === "execute" && !cfg.privateKey) {
  console.error("execute mode needs KEEPER_PRIVATE_KEY");
  process.exit(1);
}

new Keeper(cfg, makeClient()).start().catch((e) => {
  console.error(e);
  process.exit(1);
});
