/**
 * Arc's mempool silently discards transactions below 20 Gwei maxFeePerGas — no receipt, no
 * error, no block inclusion. A wallet that estimates below this appears simply to do nothing.
 */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n;
