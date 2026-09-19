import { defineChain } from "viem";

/** Verified on-chain: eth_chainId -> 0x13b2. See data/ground-truth.json. */
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

export const EXPLORER = arcTestnet.blockExplorers.default.url;
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
export const short = (v: string, l = 6, r = 4) => `${v.slice(0, l)}…${v.slice(-r)}`;
