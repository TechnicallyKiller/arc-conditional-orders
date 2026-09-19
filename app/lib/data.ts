/**
 * Every value here is copied from data/ground-truth.json, where it is recorded alongside the
 * on-chain read that confirmed it. Nothing on this page is invented or rounded for effect.
 * The design bundle carried placeholder figures; these are the measured ones.
 */

export const DEPLOY = {
  chainId: 5042002,
  mainnetChainId: 5042,
  orderBook: "0xEe22D840289d4a94B0E1Efd7A072854a74ED489C",
  swapAdapter: "0x2958d7445C5D0Aa9D06EAc625C85072E81CA49a3",
  keeper: "0x364EDC06254874e62FF4AD8fA4d9a45238cb5609",
  demoToken: "0xB828890c52F6d0436D9f601E78adB9E056e61ba8",
  demoLiquidity: "0xdC49311dFF60b7D971a0ac9394115D545FD5Bafa",
} as const;

export const TX = {
  fill: "0xe6b66031b1cd20b8ebe3a63aaa7cc5ad788a1484c6361f8a8afe1788301e48af",
  arm: "0x5d726af9d03c69f5357ebf218029be434928dc4cd5ece3a8b115fca1e3cea1b9",
  armRefused: "0x93bc9da29afa50b5b47f00e22003e3c5759fcb7430aa8d223631b178fe3f0d09",
  swapThroughHookPool: "0x718a6a366f41e82c6e1e531b9f1622ee3b8daa60ae08f863b720a517586b776f",
} as const;

/** The fill that cleared. Block 62,936,970 on Arc testnet. */
export const FILL = {
  block: 62972903,
  proceeds: "1.934340",
  feeBps: 50,
  fee: "0.009671",
  gasUsed: "238,700",
  gasPriceGwei: "25",
  gasCost: "0.005968",
  margin: "+0.003703",
  marginX: "1.6x",
} as const;

/** The order that was refused. This is the more persuasive of the two. */
export const REFUSAL = {
  proceeds: "0.016998",
  fee: "0.000084",
  gasCost: "0.008065",
  result: "-0.007981",
} as const;

export const ARITHMETIC = [
  { label: "Proceeds from swap", value: FILL.proceeds, tone: "ink" },
  { label: "Keeper fee (0.50%)", value: `+${FILL.fee}`, tone: "ink" },
  { label: "Gas used", value: FILL.gasUsed, tone: "ink" },
  { label: "Gas cost", value: `−${FILL.gasCost}`, tone: "ink" },
  { label: "Keeper margin (fee − gas)", value: FILL.margin, tone: "pine" },
] as const;

/** Measured on a mainnet fork and on testnet under arc-foundry, never estimated. */
export const GAS_ROWS = [
  { call: "Uniswap V4 swap (no hook)", gas: "157,274", usdc: "0.003343" },
  { call: "Uniswap V4 swap (hook pool)", gas: "263,994", usdc: "0.005610" },
  { call: "Order fill, mainnet fork", gas: "357,845", usdc: "0.007604" },
  { call: "Order fill, testnet", gas: "238,700", usdc: "0.005968" },
] as const;

export const RISKS = [
  {
    tone: "var(--ochre)",
    title: "Unaudited",
    body: "The contracts have not been audited. You are approving a token to code read by its author and a handful of others. Testnet first is not a formality.",
  },
  {
    tone: "var(--ochre)",
    title: "Fills need a keeper",
    body: "Nothing fires on its own. Anyone may run a keeper and nobody can steal with one, but if none is running your order sits unfilled. The app shows whether one has reported recently.",
  },
  {
    tone: "var(--brick)",
    title: "Thin pools slip",
    body: "A stop on a pool that cannot absorb the sale is worthless. Pools qualify only if a real simulated sell succeeds at the size offered — one candidate with 4.5e24 of nominal liquidity failed that test and was excluded.",
  },
  {
    tone: "var(--rule-3)",
    title: "Mainnet is capped",
    body: "maxOrderValueUsdc and maxTotalValueUsdc are enforced on-chain and read live in the app. Testnet is the sandbox; mainnet is deliberately small while this is young.",
  },
] as const;

export const HERO_STATS = [
  { label: "Dwell", value: "2 blocks" },
  { label: "Fill gas", value: FILL.gasUsed },
  { label: "Chain", value: String(DEPLOY.chainId) },
] as const;
