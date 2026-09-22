/**
 * One process, several jobs — because a free Render plan gives 750 instance-hours a month,
 * which covers exactly one service running continuously.
 *
 * It runs:
 *   - a keeper on Arc mainnet   (the real, capped deployment)
 *   - a keeper on Arc testnet   (so the sandbox demo actually fills)
 *   - tools/pulse.ts            (so the sandbox price moves at all)
 *
 * and serves one health endpoint covering all of them. Each job is independent: a failure in
 * one must not take the others down, because the whole point of this codebase is that a keeper
 * which has quietly stopped is worse than one that never started.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Keeper, makeClient, type Config, type Mode } from "./keeper/keeper.js";
import { arc, arcTestnet } from "./lib/chain.js";
import type { Address, Chain, Hex } from "viem";

function loadDotEnv(path = ".env") {
  let raw: string;
  try { raw = readFileSync(path, "utf8"); } catch { return; }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const POOL_MANAGER = (process.env.POOL_MANAGER ?? "0x8366a39CC670B4001A1121B8F6A443A643e40951") as Address;
const POLL_MS = Number(process.env.POLL_MS ?? "5000");
const KEY = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
const MODE = (process.env.MODE ?? "observe") as Mode;

/** A keeper only runs if its network is fully configured. Absent config is a skip, not a crash. */
type Spec = { label: string; chain: Chain; rpcUrl?: string; orderBook?: string; adapter?: string };

const SPECS: Spec[] = [
  {
    label: "mainnet",
    chain: arc,
    rpcUrl: process.env.RPC_URL,
    orderBook: process.env.ORDER_BOOK,
    adapter: process.env.SWAP_ADAPTER,
  },
  {
    label: "testnet",
    chain: arcTestnet,
    rpcUrl: process.env.TESTNET_RPC_URL ?? "https://rpc.testnet.arc.io",
    orderBook: process.env.TESTNET_ORDER_BOOK,
    adapter: process.env.TESTNET_SWAP_ADAPTER,
  },
];

const keepers: Keeper[] = [];

for (const s of SPECS) {
  if (!s.orderBook || !s.adapter) {
    console.log(`[${s.label}] skipped — no ORDER_BOOK / SWAP_ADAPTER configured`);
    continue;
  }
  if (MODE === "execute" && !KEY) {
    console.error(`[${s.label}] execute mode needs KEEPER_PRIVATE_KEY — skipping`);
    continue;
  }
  const cfg: Config = {
    mode: MODE,
    chain: s.chain,
    rpcUrl: s.rpcUrl,
    label: s.label,
    orderBook: s.orderBook as Address,
    adapter: s.adapter as Address,
    poolManager: POOL_MANAGER,
    privateKey: KEY,
    pollMs: POLL_MS,
    lookbackBlocks: BigInt(process.env.LOOKBACK_BLOCKS ?? "20000"),
  };
  const k = new Keeper(cfg, makeClient(s.chain, s.rpcUrl));
  keepers.push(k);
  // Deliberately not awaited: start() loops forever. A rejection here is logged and the other
  // jobs carry on.
  k.start().catch((e) => {
    console.error(`[${s.label}] keeper stopped:`, e instanceof Error ? e.message : e);
  });
}

/** Pulse is the demo market maker. Optional, testnet only, and never fatal to the keepers. */
const pulse = { enabled: process.env.RUN_PULSE === "1", running: false, lastError: null as string | null };
if (pulse.enabled) {
  import("../tools/pulse.js")
    .then(({ runPulse }) => {
      pulse.running = true;
      return runPulse();
    })
    .catch((e) => {
      pulse.running = false;
      pulse.lastError = e instanceof Error ? e.message : String(e);
      console.error("[pulse] stopped:", pulse.lastError);
    });
}

const misconfigured: string[] = [];
for (const s2 of SPECS) {
  if (!s2.orderBook || !s2.adapter) {
    misconfigured.push(
      s2.label === "mainnet"
        ? "set ORDER_BOOK and SWAP_ADAPTER for mainnet"
        : "set TESTNET_ORDER_BOOK and TESTNET_SWAP_ADAPTER for testnet"
    );
  }
}
if (MODE === "execute" && !KEY) misconfigured.push("execute mode needs KEEPER_PRIVATE_KEY");

// Deliberately NOT process.exit here. Render's start command dying leaves you reading logs to
// find out why; binding the port and serving 503 with the reason puts it at the URL the monitor
// already watches. A misconfigured service should be visibly wrong, not absent.
if (keepers.length === 0 && !pulse.enabled) {
  console.error("nothing to run — " + misconfigured.join("; "));
}

/**
 * Health. 503 once EVERY configured keeper is stale, so the uptime pinger that keeps the free
 * plan awake also functions as the monitor. One keeper lagging while another works is degraded,
 * not dead — reported, but still 200, because taking the service down would stop the healthy one
 * too.
 */
const port = Number(process.env.PORT ?? 0);
if (port > 0) {
  const staleAfterMs = Math.max(POLL_MS * 10, 60_000);
  createServer((_req, res) => {
    const now = Date.now();
    const jobs = keepers.map((k) => {
      const last = k.status.lastTickAt;
      const ageMs = last === null ? now - Date.parse(k.status.startedAt) : now - Date.parse(last);
      return { ...k.status, ageMs, healthy: ageMs <= staleAfterMs };
    });
    const healthy = jobs.length === 0 ? pulse.running : jobs.some((j) => j.healthy);
    res.writeHead(healthy ? 200 : 503, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ healthy, staleAfterMs, jobs, pulse, misconfigured }, null, 2));
  }).listen(port, () => console.log(`health endpoint on :${port}`));
}

console.log(`host up — ${keepers.length} keeper(s), pulse ${pulse.enabled ? "on" : "off"}, mode ${MODE}`);
if (misconfigured.length) console.error("  missing config: " + misconfigured.join("; "));
if (port === 0) console.error("  PORT not set — no health endpoint. Render requires a bound port.");
