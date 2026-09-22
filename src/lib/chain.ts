import { createPublicClient, http, defineChain } from "viem";

/**
 * Arc's public RPC answers HTTP 429 under load. Verified 2026-09-20: a sequential scan at
 * 0.15s spacing had 6 of 20 requests rejected. Code that swallows that error and returns an
 * empty result reports "nothing found" with total confidence - which is how an earlier
 * measurement pass produced numbers that were wrong by an unknown margin.
 *
 * Every client in this repo goes through here: retry with exponential backoff, and surface
 * the failure rather than absorbing it.
 */
export function arcTransport(url?: string) {
  return http(url, {
    retryCount: 5,
    retryDelay: 400,   // viem backs off exponentially: 0.4s, 0.8s, 1.6s, 3.2s, 6.4s
    timeout: 20_000,
    batch: true,       // collapse concurrent eth_calls into one JSON-RPC batch
  });
}

/** Verified against the chain 2026-09-19: eth_chainId -> 0x13b2 (5042). */
export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  /** Verified 2026-09-20: eth_getCode returns 3,808 bytes at the canonical address. */
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const arcTestnet = defineChain({
  ...arc,
  id: 5042002,
  name: "Arc Testnet",
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" } },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: arc,
  transport: arcTransport(),
  batch: { multicall: true },
});

/**
 * On Arc, USDC is the native asset AND has an ERC-20 interface over the same balance.
 * Native  = 18 decimals (address(x).balance, msg.value)
 * ERC-20  = 6 decimals  (balanceOf, transfer)
 * They are the same money. Never add one to the other without scaling by 1e12.
 */
export const USDC_ERC20 = "0x3600000000000000000000000000000000000000" as const;
export const NATIVE_DECIMALS = 18;
export const ERC20_DECIMALS = 6;
export const NATIVE_PER_ERC20 = 10n ** 12n;

/** Arc's mempool silently drops transactions below 20 Gwei maxFeePerGas. No receipt, no error. */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n;
