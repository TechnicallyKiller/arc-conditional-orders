/**
 * Every value here is copied from data/ground-truth.json, where it is recorded alongside the
 * on-chain read that confirmed it. Nothing on this page is invented or rounded for effect.
 * The design bundle carried placeholder figures; these are the measured ones.
 */

export const DEPLOY = {
  chainId: 5042002,
  mainnetChainId: 5042,
  orderBook: "0x55EC8907f937fEA942c5f98039a218708E965280",
  swapAdapter: "0xbaaB5e17f572CC17BA3dCa8Ebf6089908873653f",
  keeper: "0x364EDC06254874e62FF4AD8fA4d9a45238cb5609",
} as const;

export const TX = {
  fill: "0x4e3998e43e9e67718b89171d5242dcae33f6687d43581391bac7382f8ab4545d",
  arm: "0x2a2928de338fd6a0aefa126987889174501bff75d5e313f32d0178e2fbf90bab",
  armRefused: "0x6c6f3582c37dfbe82cf30a9306a8846c8b78bd8f54403b732ebeee4f67de6052",
  swapThroughHookPool: "0x718a6a366f41e82c6e1e531b9f1622ee3b8daa60ae08f863b720a517586b776f",
} as const;

/** The fill that cleared. Block 62,936,970 on Arc testnet. */
export const FILL = {
  block: 62936970,
  proceeds: "10.297301",
  feeBps: 50,
  fee: "0.051486",
  gasUsed: "351,348",
  gasPriceGwei: "25",
  gasCost: "0.008784",
  margin: "+0.042702",
  marginX: "5.9×",
} as const;

/** The order that was refused. This is the more persuasive of the two. */
export const REFUSAL = {
  proceeds: "0.396122",
  fee: "0.001980",
  gasCost: "0.012829",
  result: "−0.010849",
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
  { call: "Order fill, testnet", gas: "351,348", usdc: "0.008784" },
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
