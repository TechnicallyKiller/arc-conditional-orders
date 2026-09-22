import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Keeper, makeClient, type Config, type Mode } from "./keeper.js";
import { arc, arcTestnet } from "../lib/chain.js";
import type { Address, Hex } from "viem";

/** Load .env for local runs. Hosted environments (Render) inject real env vars, which win. */
function loadDotEnv(path = ".env") {
  let raw: string;
  try { raw = readFileSync(path, "utf8"); } catch { return; }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

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

// Single-network entry. src/host.ts runs several at once for a hosted deployment.
const chain = env("CHAIN_ID", "5042") === "5042002" ? arcTestnet : arc;

const cfg: Config = {
  mode,
  chain,
  rpcUrl: process.env.RPC_URL,
  label: chain.id === 5042 ? "mainnet" : "testnet",
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

const keeper = new Keeper(cfg, makeClient());

/**
 * Render's free tier only offers Web Services, and it sleeps anything that receives no HTTP
 * traffic for 15 minutes. A keeper receives none by definition, so it needs a port to stay
 * awake. Rather than a dummy 200, serve the liveness the rest of this codebase argues for:
 * 503 when the last COMPLETE tick is older than the staleness budget, so whatever pings this
 * to keep it alive doubles as the monitor that notices when it has stopped working.
 */
const port = Number(process.env.PORT ?? 0);
if (port > 0) {
  const staleAfterMs = Math.max(cfg.pollMs * 10, 60_000);
  createServer((_req, res) => {
    const last = keeper.status.lastTickAt;
    const ageMs = last === null ? Infinity : Date.now() - Date.parse(last);
    // Grace before the first tick, or Render's health check fails the deploy during startup.
    const uptimeMs = Date.now() - Date.parse(keeper.status.startedAt);
    const healthy = last === null ? uptimeMs < staleAfterMs : ageMs <= staleAfterMs;
    // Read cross-origin by the status page. Public liveness data only - no secrets here.
    res.writeHead(healthy ? 200 : 503, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ healthy, staleAfterMs, ageMs: Number.isFinite(ageMs) ? ageMs : null, ...keeper.status }, null, 2));
  }).listen(port, () => console.log(`health endpoint on :${port}`));
}

keeper.start().catch((e) => {
  console.error(e);
  process.exit(1);
});
