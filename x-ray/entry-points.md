# Entry Point Map

> Arc Conditional Orders | 17 entry points | 9 permissionless | 3 role-gated | 5 admin-only

---

## Protocol Flow Paths

### Setup (Owner)

`constructor()` → `setRouter(adapter, true)` → [optional] `setCaps()` / `setFee()` / `setDwell()`

### Trader Flow

`[owner setup above]` → `IERC20.approve(OrderBook, amountIn)`  ◄── off-chain, on the input token
                      → `OrderBook.createOrder()`
                           ├─→ `OrderBook.cancelOrder()`  ◄── owner only, while Open
                           └─→ [keeper flow below]

### Keeper Flow

`[createOrder above]` → [pool tick crosses trigger] → `OrderBook.armOrder()`
                      → [minDwellBlocks elapse]  ◄── and not more than maxArmAgeBlocks
                      → `OrderBook.execute()`  ◄── trigger must STILL hold; fee must clear gas

`execute()` → `V4SwapAdapter.swapExactIn()` → `PoolManager.unlock()` → `V4SwapAdapter.unlockCallback()`

### Sandbox (Testnet only)

`DemoToken.faucet()` → `IERC20.approve()` → `[trader flow above]`

`DemoLiquidity.initializePool()` → `DemoLiquidity.addLiquidity()` → `PoolManager.unlockCallback()`

---

## Permissionless

### `OrderBook.createOrder()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external` |
| Caller | Trader |
| Parameters | `tokenIn` (user-controlled), `amountIn` (user-controlled), `minAmountOut` (user-controlled), `key` (user-controlled), `triggerTick` (user-controlled), `triggerBelow` (user-controlled), `expiry` (user-controlled) |
| Call chain | `→` none (storage write only) |
| State modified | `nextOrderId`, `orders[id]` |
| Value flow | None — funds stay in the trader's wallet |
| Reentrancy guard | no |

### `OrderBook.armOrder()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external` |
| Caller | Keeper / Anyone |
| Parameters | `id` (user-controlled) |
| Call chain | `→ V4Price.currentTick() → PoolManager.extsload()` |
| State modified | `orders[id].armedAtBlock`, `orders[id].armedTick` |
| Value flow | None |
| Reentrancy guard | no |

### `OrderBook.execute()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external`, `nonReentrant` |
| Caller | Keeper / Anyone |
| Parameters | `id` (user-controlled), `router` (keeper-provided), `routeData` (keeper-provided) |
| Call chain | `→ V4Price.currentTick() → V4SwapAdapter.swapExactIn() → PoolManager.unlock() → V4SwapAdapter.unlockCallback() → PoolManager.swap()` |
| State modified | `orders[id].status`, `totalFilledUsdc` |
| Value flow | In: `tokenIn` trader → OrderBook. Out: USDC OrderBook → trader, USDC OrderBook → feeRecipient |
| Reentrancy guard | yes |

### `V4SwapAdapter.swapExactIn()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external` |
| Caller | OrderBook / Anyone |
| Parameters | `key` (user-controlled), `zeroForOne` (user-controlled), `amountIn` (user-controlled), `recipient` (user-controlled) |
| Call chain | `→ PoolManager.unlock() → V4SwapAdapter.unlockCallback() → PoolManager.swap() → PoolManager.settle() → PoolManager.take()` |
| State modified | none (transient deltas only) |
| Value flow | In: input currency caller → adapter. Out: output currency pool → recipient, dust → caller |
| Reentrancy guard | no |

> Not matched by either entry-point grep — the signature spans lines with `external` on its own line (`V4SwapAdapter.sol:58-60`), which neither the single-line nor the closing-paren pattern catches. Classified from the source read.

### `DemoLiquidity.initializePool()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external` |
| Caller | Anyone |
| Parameters | `key` (user-controlled), `sqrtPriceX96` (user-controlled) |
| Call chain | `→ PoolManager.initialize()` |
| State modified | none locally |
| Value flow | None |
| Reentrancy guard | no |

### `DemoLiquidity.addLiquidity()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external` |
| Caller | Anyone |
| Parameters | `key` (user-controlled), `tickLower` (user-controlled), `tickUpper` (user-controlled), `liquidityDelta` (user-controlled) |
| Call chain | `→ PoolManager.unlock() → DemoLiquidity.unlockCallback() → PoolManager.modifyLiquidity()` |
| State modified | none locally |
| Value flow | In: both pool currencies caller → adapter → PoolManager |
| Reentrancy guard | no |

### `DemoToken.faucet()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external` |
| Caller | Anyone |
| Parameters | none |
| Call chain | `→ DemoToken._mint()` |
| State modified | `lastFaucet[msg.sender]`, `balanceOf[msg.sender]`, `totalSupply` |
| Value flow | Out: 10,000e18 DEMO minted to caller |
| Reentrancy guard | no |

### `DemoToken.mint()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external` |
| Caller | Anyone |
| Parameters | `to` (user-controlled), `amount` (user-controlled) |
| Call chain | `→ DemoToken._mint()` |
| State modified | `balanceOf[to]`, `totalSupply` |
| Value flow | Out: arbitrary DEMO minted to any address, no rate limit |
| Reentrancy guard | no |

### `DemoToken.approve()` / `transfer()` / `transferFrom()`

Standard ERC-20 surface, `DemoToken.sol:41`, `:47`, `:52`. `transferFrom:52-57` treats `type(uint256).max` allowance as infinite and skips the decrement.

---

## Role-Gated

### Order owner

#### `OrderBook.cancelOrder()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external`, no modifier — restricted by `if (o.owner != msg.sender) revert NotOrderOwner()` at `:211` |
| Caller | Trader who created the order |
| Parameters | `id` (user-controlled) |
| Call chain | `→` none |
| State modified | `orders[id].status` |
| Value flow | None |
| Reentrancy guard | no |

### PoolManager

#### `V4SwapAdapter.unlockCallback()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external`, no modifier — restricted by `if (msg.sender != address(poolManager)) revert OnlyPoolManager()` at `:75` |
| Caller | Uniswap v4 PoolManager |
| Parameters | `data` (protocol-derived, round-tripped from `swapExactIn`) |
| Call chain | `→ PoolManager.swap() → PoolManager.exttload() → PoolManager.settle() → PoolManager.take()` |
| State modified | none (transient deltas) |
| Value flow | Out: proceeds → recipient, dust → caller |
| Reentrancy guard | no |

#### `DemoLiquidity.unlockCallback()`

| Aspect | Detail |
|--------|--------|
| Visibility | `external`, no modifier — restricted by `if (msg.sender != address(poolManager)) revert OnlyPoolManager()` at `:60` |
| Caller | Uniswap v4 PoolManager |
| Parameters | `data` (protocol-derived) |
| Call chain | `→ PoolManager.modifyLiquidity() → PoolManager.settle()` |
| State modified | none locally |
| Value flow | In: both currencies payer → PoolManager |
| Reentrancy guard | no |

---

## Admin-Only

All five are gated by `onlyOwner` (`OrderBook.sol:99-102`), where `owner` is fixed at construction and has no transfer, renounce or pause path anywhere in `contracts/`.

| Contract | Function | Parameters | State Modified |
|----------|----------|------------|----------------|
| OrderBook | `setRouter()` | `router` (admin), `allowed` (admin) | `routerAllowed[router]` |
| OrderBook | `setFee()` | `_feeBps` (admin), `_feeRecipient` (admin) | `feeBps`, `feeRecipient` |
| OrderBook | `setMargin()` | `_marginNative` (admin) | `marginNative` |
| OrderBook | `setCaps()` | `_maxOrderValueUsdc` (admin), `_maxTotalValueUsdc` (admin) | `maxOrderValueUsdc`, `maxTotalValueUsdc` |
| OrderBook | `setDwell()` | `_minDwellBlocks` (admin), `_maxArmAgeBlocks` (admin) | `minDwellBlocks`, `maxArmAgeBlocks` |

---

## Payable Fallbacks

`OrderBook.sol:135`, `V4SwapAdapter.sol:54` and `DemoLiquidity.sol:41` each declare `receive() external payable {}`. On Arc a USDC ERC-20 transfer moves native value, so a contract that can hold USDC must accept it or the transfer reverts.

## Initialization

No proxy pattern. No `initialize()` function. All configuration is set in `OrderBook`'s constructor (`:111-131`) or through the owner setters above.
