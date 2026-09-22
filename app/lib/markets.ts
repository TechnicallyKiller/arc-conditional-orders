/**
 * The curated list. A pool qualifies only if an EXECUTED SELL succeeded at the size offered —
 * not a liquidity read, not a buy. See data/ground-truth.json -> curatedListRule.
 *
 * These are the pools actually verified in test/PoolDepth.t.sol. Nothing here is illustrative.
 *
 * The impact figures are REAL and they are not flattering: Arc's pools are thin. A $500 sell on
 * USO costs 3.71% in slippage on top of its 1% fee. That is the number a trader needs before
 * setting a stop, so it is shown rather than softened.
 */
export type Market = {
  symbol: string;
  name: string;
  token: `0x${string}`;
  currency0: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
  decimals: number;
  /** Measured impact of a real executed swap, excluding the pool fee. Null = sell test failed. */
  impactBps50: number | null;
  impactBps500: number | null;
  poolFeeBps: number;
  /** Null impact means the sell test failed and the pool must not be used. */
  sellTestPassed: boolean;
  network: "mainnet" | "testnet";
};

const NATIVE = "0x0000000000000000000000000000000000000000" as const;

export const MARKETS: Market[] = [
  {
    // Verified by an EXECUTED round trip on 2026-09-22: bought 1,489.46 FOCI for 0.70 USDC
    // (0x07aca67c…), then the keeper filled a real order back to USDC (0x580a4b38…).
    // currency0 is the ERC-20 USDC address, not native, and the pool carries an
    // AFTER_SWAP_RETURNS_DELTA hook — the case the adapter settles from transient deltas.
    symbol: "FOCI", name: "Foci", network: "mainnet",
    token: "0x7c7489163b1060333e71229bb7a9f8cb7094a7a9",
    currency0: "0x3600000000000000000000000000000000000000",
    fee: 0, tickSpacing: 200,
    hooks: "0xf847790b6fa5da300bb3f56f10d743e71e98e044",
    decimals: 18, impactBps50: null, impactBps500: null, poolFeeBps: 0, sellTestPassed: true,
  },
  {
    symbol: "USO", name: "United States Oil Fund", network: "mainnet",
    token: "0xa5a3e8FF2a61EdFb60fFB2ccAA89dDF0eFE3d227",
    currency0: NATIVE, fee: 10000, tickSpacing: 200, hooks: NATIVE,
    decimals: 18, impactBps50: 38, impactBps500: 371, poolFeeBps: 100, sellTestPassed: true,
  },
  {
    symbol: "SCHNOZ", name: "schnoz", network: "mainnet",
    token: "0xacd798Faf58345a1308D26BbCdf6E6e6b450F4dd",
    currency0: NATIVE, fee: 100, tickSpacing: 1, hooks: NATIVE,
    decimals: 18, impactBps50: 823, impactBps500: null, poolFeeBps: 1, sellTestPassed: true,
  },
  {
    symbol: "BB", name: "BB", network: "mainnet",
    token: "0x33E308242F5d38980Fa5845B03B1AcC63eea0777",
    currency0: NATIVE, fee: 2500, tickSpacing: 50, hooks: NATIVE,
    decimals: 18, impactBps50: null, impactBps500: null, poolFeeBps: 25, sellTestPassed: false,
  },
];

/**
 * The sandbox market. Our own token and our own pool, because Arc testnet has no organic
 * trading — 14 pools with liquidity and zero swaps in 40,000 blocks. A visitor needs a market
 * that moves, so tools/pulse.ts makes small real trades against this one. The token is
 * worthless by design and the UI says the price is scripted.
 */
export const TESTNET_MARKET: Market = {
  symbol: "ADEMO", name: "Arc Demo (sandbox)", network: "testnet",
  token: "0xB828890c52F6d0436D9f601E78adB9E056e61ba8",
  currency0: "0x0000000000000000000000000000000000000000",
  fee: 3000, tickSpacing: 60,
  hooks: "0x0000000000000000000000000000000000000000",
  decimals: 18, impactBps50: null, impactBps500: null, poolFeeBps: 300, sellTestPassed: true,
};

/**
 * Symbols that must never appear as a tradeable market, because the payout leg is real USDC and
 * a row labelled "USDC" that is not USDC is a trap rather than a listing. Arc's two busiest
 * memecoin pools both set symbol() to "USDC" - verified on-chain 2026-09-22. The executed-sell
 * rule does not catch this: those tokens trade perfectly well, which is the point.
 */
export const FORBIDDEN_SYMBOLS = new Set(["USDC", "EURC", "USYC"]);

export const symbolIsSafe = (symbol: string) => !FORBIDDEN_SYMBOLS.has(symbol.toUpperCase());

/** Markets available on a given network. Mainnet rows are real Arc pools; testnet is the sandbox. */
export const marketsFor = (network: "mainnet" | "testnet"): Market[] =>
  (network === "testnet" ? [TESTNET_MARKET] : MARKETS).filter((m) => symbolIsSafe(m.symbol));

/**
 * The market an order form defaults to. On mainnet that is the deepest pool whose SELL test
 * actually passed — a pool that only accepts buys is not somewhere a stop-loss can exit.
 */
export const defaultMarketFor = (network: "mainnet" | "testnet"): Market =>
  network === "testnet" ? TESTNET_MARKET : (MARKETS.find((m) => m.sellTestPassed) ?? MARKETS[0]);
