import { createPublicClient, http, defineChain } from "viem";

/** Verified against the chain 2026-09-19: eth_chainId -> 0x13b2 (5042). */
export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

export const arcTestnet = defineChain({
  ...arc,
  id: 5042002,
  name: "Arc Testnet",
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" } },
  testnet: true,
});

export const publicClient = createPublicClient({ chain: arc, transport: http() });

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
