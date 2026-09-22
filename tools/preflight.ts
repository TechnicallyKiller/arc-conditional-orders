/**
 * Mainnet ship check. Run this BEFORE spending anything.
 *
 * Every check either passes with the evidence that proved it, or fails loudly. Nothing here
 * returns a default on error - that habit is what produced an entire dataset of confident
 * wrong numbers earlier in this project, and it is the failure mode this repo exists to avoid.
 *
 *   npx tsx tools/preflight.ts
 */
import { readFileSync } from "node:fs";
import { createPublicClient, formatEther, parseAbi } from "viem";
import { arc, arcTransport, MIN_MAX_FEE_PER_GAS } from "../src/lib/chain.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

/** Load .env without adding a dependency. Existing environment always wins. */
function loadDotEnv(path = ".env") {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return; // no .env is fine; the checks below will say what is missing
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) {
      process.env[k] = v.replace(/^["']|["']$/g, "");
    }
  }
}
loadDotEnv();

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/** Measured on the testnet deployment: OrderBook + V4SwapAdapter + setRouter. */
const DEPLOY_GAS = 2_691_539n;

let failures = 0;
const ok = (label: string, detail: string) => console.log(`  PASS  ${label.padEnd(30)} ${detail}`);
const bad = (label: string, detail: string) => {
  failures++;
  console.log(`  FAIL  ${label.padEnd(30)} ${detail}`);
};

async function main() {
  const client = createPublicClient({
    chain: arc,
    transport: arcTransport(process.env.RPC_URL),
    batch: { multicall: true },
  });

  console.log("\nArc mainnet preflight\n");

  // --- chain identity -----------------------------------------------------
  const chainId = await client.getChainId();
  chainId === 5042
    ? ok("chain id", `${chainId} (Arc mainnet)`)
    : bad("chain id", `${chainId} - NOT Arc mainnet. Refusing.`);

  const head = await client.getBlockNumber();
  ok("rpc reachable", `head block ${head.toLocaleString()}`);

  // --- rate limiting ------------------------------------------------------
  // Arc's public RPC returns HTTP 429 under load. If the transport is not backing off, the
  // keeper will silently see fewer orders than exist. Prove the retry path works.
  const burst = await Promise.allSettled(
    Array.from({ length: 24 }, () => client.getBlockNumber())
  );
  const rejected = burst.filter((r) => r.status === "rejected").length;
  rejected === 0
    ? ok("rate limit handling", `24 concurrent reads, 0 failures`)
    : bad("rate limit handling", `${rejected}/24 reads failed - raise retryCount in arcTransport`);

  // --- dependencies -------------------------------------------------------
  for (const [name, addr] of [
    ["Uniswap v4 PoolManager", POOL_MANAGER],
    ["Multicall3", MULTICALL3],
  ] as const) {
    const code = await client.getCode({ address: addr });
    const size = code ? (code.length - 2) / 2 : 0;
    size > 0
      ? ok(name, `${size.toLocaleString()} bytes at ${addr.slice(0, 10)}...`)
      : bad(name, `NO CODE at ${addr}`);
  }

  // --- gas ----------------------------------------------------------------
  // Arc's mempool silently discards transactions below 20 gwei: no receipt, no error.
  const fees = await client.estimateFeesPerGas();
  const price = fees.maxFeePerGas < MIN_MAX_FEE_PER_GAS ? MIN_MAX_FEE_PER_GAS : fees.maxFeePerGas;
  ok("gas price", `${Number(price) / 1e9} gwei (floor ${Number(MIN_MAX_FEE_PER_GAS) / 1e9})`);

  const deployCost = DEPLOY_GAS * price;
  console.log(`\n  estimated deploy cost: ${formatEther(deployCost)} USDC\n`);

  // --- deployer -----------------------------------------------------------
  const pk = process.env.PRIVATE_KEY as Hex | undefined;
  if (!pk) {
    bad("PRIVATE_KEY", "not set - cannot check the deploying account's balance");
  } else {
    const deployer = privateKeyToAccount(pk).address;
    const bal = await client.getBalance({ address: deployer });
    // Deploy, plus float for arming and filling. One arm+fill cycle is ~0.01 USDC.
    const needed = deployCost + 1_000_000_000_000_000_000n;
    bal >= needed
      ? ok("deployer balance", `${formatEther(bal)} USDC at ${deployer}`)
      : bad("deployer balance", `${formatEther(bal)} USDC - want at least ${formatEther(needed)}`);
  }

  // --- keeper -------------------------------------------------------------
  const kpk = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
  if (!kpk) {
    bad("KEEPER_PRIVATE_KEY", "not set - the keeper cannot arm or fill");
  } else {
    const keeper = privateKeyToAccount(kpk).address;
    const bal = await client.getBalance({ address: keeper });
    bal > 0n
      ? ok("keeper balance", `${formatEther(bal)} USDC at ${keeper}`)
      : bad("keeper balance", `0 USDC at ${keeper} - it cannot send a single transaction`);
  }

  // --- exposure caps ------------------------------------------------------
  // These bind on realised USDC proceeds. Unset means unlimited, which must never be an
  // accident on mainnet.
  for (const name of ["MAX_ORDER_USDC", "MAX_TOTAL_USDC"] as const) {
    const v = process.env[name];
    if (!v || BigInt(v) === 0n) {
      bad(name, "unset or 0 (= UNLIMITED). DeployMainnet will refuse.");
    } else {
      ok(name, `${(Number(v) / 1e6).toFixed(2)} USDC`);
    }
  }

  // --- already deployed? --------------------------------------------------
  const existing = process.env.ORDER_BOOK as Address | undefined;
  if (existing) {
    const code = await client.getCode({ address: existing });
    const size = code ? (code.length - 2) / 2 : 0;
    if (size > 0) {
      const abi = parseAbi([
        "function owner() view returns (address)",
        "function maxOrderValueUsdc() view returns (uint256)",
        "function maxTotalValueUsdc() view returns (uint256)",
      ]);
      const [owner, mo, mt] = await Promise.all([
        client.readContract({ address: existing, abi, functionName: "owner" }),
        client.readContract({ address: existing, abi, functionName: "maxOrderValueUsdc" }),
        client.readContract({ address: existing, abi, functionName: "maxTotalValueUsdc" }),
      ]);
      ok("existing OrderBook", `owner ${owner}`);
      ok("  caps on-chain", `${Number(mo) / 1e6} / ${Number(mt) / 1e6} USDC`);
    } else {
      bad("existing OrderBook", `ORDER_BOOK set to ${existing} but there is no code there`);
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`${failures} check(s) FAILED. Do not deploy.\n`);
    process.exit(1);
  }
  console.log("All checks passed. Safe to run DeployMainnet.s.sol\n");
}

main().catch((e) => {
  // A preflight that dies quietly is worse than no preflight.
  console.error("\npreflight itself failed:", e);
  process.exit(1);
});
