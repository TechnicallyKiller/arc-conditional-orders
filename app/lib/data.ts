/**
 * Every value here is copied from data/ground-truth.json, where it is recorded alongside the
 * on-chain read that confirmed it. Nothing on this page is invented or rounded for effect.
 * The design bundle carried placeholder figures; these are the measured ones.
 */

export const DEPLOY = {
  chainId: 5042002,
  mainnetChainId: 5042,
  orderBook: "0x80C8B0b55827F0456564554E3A82F9B20ad6019F",
  swapAdapter: "0x80FBe4f593fc33A102CC41e3aF158ED4Fb71864C",
  keeper: "0x364EDC06254874e62FF4AD8fA4d9a45238cb5609",
} as const;

export const TX = {
  fill: "0x2d8138e62b973c96b69bc6fe995b6edb4f423049c214554afdf9d2aced81f423",
  arm: "0x3936113c7039323147131e9822fadf00ff0b0dc78a98582ed523e504e32fe752",
  armRefused: "0x55801b9c1bd99299fc23715afaa76fd34a3a00baf8a5d2961164712200a66de3",
  swapThroughHookPool: "0x718a6a366f41e82c6e1e531b9f1622ee3b8daa60ae08f863b720a517586b776f",
} as const;

/** The fill that cleared. Block 62,936,970 on Arc testnet. */
export const FILL = {
  block: 62958859,
  proceeds: "4.762711",
  feeBps: 50,
  fee: "0.023813",
  gasUsed: "372,711",
  gasPriceGwei: "25",
  gasCost: "0.009318",
  margin: "+0.014495",
  marginX: "2.6x",
} as const;

/** The order that was refused. This is the more persuasive of the two. */
export const REFUSAL = {
  proceeds: "0.023764",
  fee: "0.000118",
  gasCost: "0.013109",
  result: "-0.012991",
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
  { call: "Order fill, testnet", gas: "372,711", usdc: "0.009318" },
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
