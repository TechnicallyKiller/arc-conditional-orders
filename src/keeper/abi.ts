import { parseAbi } from "viem";

export const orderBookAbi = parseAbi([
  "function nextOrderId() view returns (uint256)",
  "function minDwellBlocks() view returns (uint64)",
  "function maxArmAgeBlocks() view returns (uint64)",
  "function feeBps() view returns (uint16)",
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct Order { address owner; address tokenIn; uint128 amountIn; uint128 minAmountOut; PoolKey key; int24 triggerTick; bool triggerBelow; uint64 expiry; uint8 status; uint64 armedAtBlock; int24 armedTick; }",
  "function getOrder(uint256 id) view returns (Order)",
  "function checkOrders(uint256[] ids) view returns (uint8[] states, int24[] ticks)",
  "function armOrder(uint256 id)",
  "function execute(uint256 id, address router, bytes routeData) returns (uint256 amountOut, uint256 fee)",
  "event OrderCreated(uint256 indexed id, address indexed owner, address tokenIn, uint128 amountIn, int24 triggerTick, bool triggerBelow)",
  "event OrderArmed(uint256 indexed id, int24 tick, uint64 atBlock)",
  "event OrderFilled(uint256 indexed id, address indexed keeper, uint256 amountOut, uint256 fee, uint256 gasCostNative)",
]);

export const poolManagerAbi = parseAbi([
  "function extsload(bytes32 slot) view returns (bytes32)",
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
]);

export const adapterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function swapExactIn(PoolKey key, bool zeroForOne, uint256 amountIn, address recipient) returns (uint256)",
]);

export enum Status {
  None = 0,
  Open = 1,
  Filled = 2,
  Cancelled = 3,
}

/** Mirrors OrderBook.TriggerState. PoolUnreadable is deliberately distinct from NotTriggered. */
export enum TriggerState {
  NotOpen = 0,
  Expired = 1,
  PoolUnreadable = 2,
  NotTriggered = 3,
  Triggered = 4,
  Arming = 5,
  ArmExpired = 6,
  Ready = 7,
}
