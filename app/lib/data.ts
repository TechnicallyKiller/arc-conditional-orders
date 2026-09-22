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
  // Live on Arc mainnet (chain 5042), deployed 2026-09-22 with the post-audit contracts.
  // The interactive demo stays on testnet because the faucet token and its seeded pool
  // only exist there; mainnet holds the real, capped deployment.
  mainnetOrderBook: "0x9872b13257E958c2F7E4DcCc3F96b3C70c8e050c",
  mainnetSwapAdapter: "0x0F1bf92EE0C79F7Ca5C1e30E9412aD5BFF45c7C8",
  keeper: "0x364EDC06254874e62FF4AD8fA4d9a45238cb5609",
  demoToken: "0xB828890c52F6d0436D9f601E78adB9E056e61ba8",
  demoLiquidity: "0xdC49311dFF60b7D971a0ac9394115D545FD5Bafa",
} as const;

/**
 * Mainnet fills. Every figure is from the OrderFilled event, not computed here.
 *
 * Order 2 is the one worth reading twice: measured at 24.85 gwei its fee of 0.008464 sat under
 * a gas cost of 0.00889245, so CostFloor refused it and the keeper skipped. Eighteen blocks
 * after order 3, gas had fallen, the same order cost 0.00663479 to execute, and it cleared at
 * 1.29x. Nothing about the order changed — only the real cost of running it did.
 */
export const MAINNET_FILLS = [
  { id: 1, block: 22_135_134, out: "0.769724", fee: "0.015394", feeBps: 200, gas: "0.00686401", marginX: "2.24x",
    tx: "0x580a4b38890ba9241f7bbaf5fd389b3a534e7c155d98381e06677f214a7e3302" },
  { id: 3, block: 22_137_837, out: "1.990132", fee: "0.009950", feeBps: 50, gas: "0.00804768", marginX: "1.24x",
    tx: "0xf2487b593d885a2fa1a8d50ccbd2cd026ea8e3c8d2617f6881a490fd247155f3" },
  { id: 2, block: 22_137_855, out: "1.716212", fee: "0.008581", feeBps: 50, gas: "0.00663479", marginX: "1.29x",
    tx: "0x63691eb4c7d282a5f0241c0ff194f1696349a7a10d0ae613a87d7177e5ff7c94",
    note: "refused at 24.85 gwei, filled once gas fell" },
] as const;

/** The first mainnet fill, kept separate because its arm transaction is the dwell evidence. */
export const MAINNET_FILL = {
  arm: "0x07e15e8a5ea2a635941f5d51c315919196be16f8f0051275046c2a99c64e7480",
  fill: "0x580a4b38890ba9241f7bbaf5fd389b3a534e7c155d98381e06677f214a7e3302",
  buy: "0x07aca67c51dbd88131be86ca95ef9a13e75147324102fe2b2b16e3c81ce971e5",
  armBlock: 22_135_116,
  fillBlock: 22_135_134,
  proceeds: "0.769724",
  fee: "0.015394",
  feeBps: 200,
  gasCost: "0.00686401",
  gasUsed: "274,380",
  marginX: "2.24x",
  token: "FOCI",
} as const;

/** Cumulative, read from the contract: totalFilledUsdc against maxTotalValueUsdc. */
export const MAINNET_TOTALS = { filled: "4.476068", cap: "100", orders: 3, fills: 3 } as const;

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
