import { createPublicClient, http, type PublicClient } from "viem";
import { arc, arcTestnet } from "./chain";

/**
 * One client per network. Reading a mainnet pool through the testnet RPC returns nothing, which
 * is why every mainnet row once rendered as "—": the pool does not exist on the chain being
 * asked. The network is therefore always explicit, never inferred.
 *
 * RPC URLs come from the environment so a provider endpoint (Alchemy et al.) can replace the
 * public one, which returns HTTP 429 under load. When code swallows that and yields an empty
 * result, it reports "nothing found" with total confidence — so every client here retries with
 * backoff instead.
 *
 * NOTE: NEXT_PUBLIC_* values are inlined into the browser bundle at build time. An endpoint with
 * an embedded API key IS public. Restrict it by referrer/domain in the provider dashboard; do
 * not rely on it being secret.
 */
const MAINNET_RPC = process.env.NEXT_PUBLIC_ARC_MAINNET_RPC;
const TESTNET_RPC = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC;

const transport = (url?: string) =>
  http(url, { retryCount: 4, retryDelay: 400, timeout: 20_000, batch: true });

export const testnetClient = createPublicClient({
  chain: arcTestnet,
  transport: transport(TESTNET_RPC),
  batch: { multicall: true },
}) as PublicClient;

export const mainnetClient = createPublicClient({
  chain: arc,
  transport: transport(MAINNET_RPC),
  batch: { multicall: true },
}) as PublicClient;

export const clientFor = (network: "mainnet" | "testnet") =>
  network === "mainnet" ? mainnetClient : testnetClient;

/**
 * A SEPARATE client for log queries, pinned to Arc's public RPC.
 *
 * Provider free tiers cap eth_getLogs hard — Alchemy's allows a 10 BLOCK range, and keeper
 * liveness needs thousands. Sending those to a configured provider endpoint fails every read
 * and renders as "chain unreachable", which is indistinguishable from the chain actually being
 * down. Arc's public RPC has no such cap; it rate-limits instead, which the retry handles.
 *
 * So: provider endpoint for contract reads (frequent, small, rate-limit sensitive), public RPC
 * for logs (rare, wide, range sensitive). Each gets the traffic it is good at.
 */
export const logsClientFor = (network: "mainnet" | "testnet") =>
  network === "mainnet" ? mainnetLogsClient : testnetLogsClient;

const mainnetLogsClient = createPublicClient({
  chain: arc,
  transport: transport(undefined),
}) as PublicClient;

const testnetLogsClient = createPublicClient({
  chain: arcTestnet,
  transport: transport(undefined),
}) as PublicClient;

/** Whether a dedicated endpoint is configured, so the UI can say so rather than guess. */
export const rpcIsCustom = (network: "mainnet" | "testnet") =>
  Boolean(network === "mainnet" ? MAINNET_RPC : TESTNET_RPC);
