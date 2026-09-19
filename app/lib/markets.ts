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

/** The pool the testnet deployment actually trades against. */
export const TESTNET_MARKET: Market = {
  symbol: "TSTA", name: "Testnet demo token", network: "testnet",
  token: "0xc9020C4Bd8Ea5de25548AfAC8457469EecAB2360",
  currency0: "0x3600000000000000000000000000000000000000",
  fee: 0, tickSpacing: 200,
  hooks: "0xf825EeB04b2B258Ac6314Dd05CB91dB0ea0e6AEC",
  decimals: 18, impactBps50: null, impactBps500: null, poolFeeBps: 0, sellTestPassed: true,
};
