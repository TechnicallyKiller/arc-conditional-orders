# Invariant Map

> Arc Conditional Orders | 24 guards | 12 inferred | 6 not enforced on-chain

---

## 1. Enforced Guards (Reference)

Per-call preconditions. Heading IDs below (`G-N`) are anchor targets from x-ray.md attack surfaces.

#### G-1
`if (msg.sender != owner) revert NotOwner()` · `OrderBook.sol:100` · Sole access-control boundary for every parameter setter; the contract has no role system beyond this one address.

#### G-2
`if (_locked != 1) revert Reentrancy()` · `OrderBook.sol:105` · Prevents a router callback re-entering `execute` while an order is mid-fill; paired with the status write at :263 that already makes double-fill impossible.

#### G-3
`if (amountIn == 0) revert ZeroAmount()` · `OrderBook.sol:150` · Stops zero-size orders occupying ids and being armed/filled for no proceeds, which would burn keeper gas against a guaranteed CostFloor revert.

#### G-4
`if (o.owner != msg.sender) revert NotOrderOwner()` · `OrderBook.sol:211` · Only the order's creator may cancel it; this is the entire authorisation model for order lifecycle.

#### G-5
`if (o.status != Status.Open) revert OrderNotOpen()` · `OrderBook.sol:212` · Prevents cancelling an already filled or cancelled order, keeping the status machine one-way.

#### G-6
`if (o.status != Status.Open) revert OrderNotOpen()` · `OrderBook.sol:227` · Stops a filled/cancelled order being re-armed, which would otherwise write arming state onto a terminal order.

#### G-7
`if (o.expiry != 0 && block.timestamp > o.expiry) revert OrderExpired()` · `OrderBook.sol:228` · Enforces the trader's own time bound at arm time so an expired order cannot be staged for a fill.

#### G-8
`if (o.status != Status.Open) revert OrderNotOpen()` · `OrderBook.sol:248` · The double-fill guard on the value-moving path.

#### G-9
`if (o.expiry != 0 && block.timestamp > o.expiry) revert OrderExpired()` · `OrderBook.sol:249` · Honours the trader's expiry at fill time, not just at arm time.

#### G-10
`if (!routerAllowed[router]) revert RouterNotAllowed(router)` · `OrderBook.sol:250` · The only thing standing between `router.call(routeData)` at :269 and an arbitrary call made with a live token approval.

#### G-11
`if (armed == 0) revert NotArmed()` · `OrderBook.sol:254` · Forces the two-phase arm/fill sequence; without it a fill could be attempted on a price observed in the same transaction.

#### G-12
`if (block.number < armed + minDwellBlocks) revert DwellNotMet(armed, uint64(block.number), armed + minDwellBlocks)` · `OrderBook.sol:255-257` · The core anti-manipulation guard: the trigger must have been observed in an earlier block, so a spike-and-revert inside one transaction cannot satisfy both observations.

#### G-13
`if (block.number > armed + maxArmAgeBlocks) revert ArmStale(armed, uint64(block.number))` · `OrderBook.sol:258` · Stops a long-ago observation being replayed when price happens to revisit the trigger much later.

#### G-14
`if (!ok) revert SwapFailed()` · `OrderBook.sol:270` · Converts a silent low-level call failure into a revert; without it the fill would continue against an unchanged balance.

#### G-15
`if (amountOut < o.minAmountOut) revert SlippageExceeded(amountOut, o.minAmountOut)` · `OrderBook.sol:275` · The trader's own slippage bound — the contract never picks one on their behalf.

#### G-16
`if (maxOrderValueUsdc != 0 && amountOut > maxOrderValueUsdc) revert OrderValueCapped(amountOut, maxOrderValueUsdc)` · `OrderBook.sol:279-281` · Bounds single-fill exposure during a capped mainnet rollout, measured on realised proceeds so no price oracle is needed.

#### G-17
`if (maxTotalValueUsdc != 0 && newTotal > maxTotalValueUsdc) revert TotalValueCapped(newTotal, maxTotalValueUsdc)` · `OrderBook.sol:283-285` · Bounds lifetime exposure of the deployment as a whole.

#### G-18
`if (!met) revert TriggerNotMet(tick, o.triggerTick, o.triggerBelow)` · `OrderBook.sol:308` · Re-derives the trigger from the pool's own tick rather than trusting the keeper's claim; this is what makes a malicious keeper harmless.

#### G-19
`if (valueProducedNative < costNative + marginNative) revert CostFloorBreached(valueProducedNative, costNative, marginNative)` · `CostFloor.sol:54-56` · The protocol's headline invariant — a fill that does not pay for its own gas does not execute.

#### G-20
`if (sqrtPriceX96 == 0) revert PoolNotInitialised(id)` · `V4Price.sol:57` · Distinguishes an unreadable/uninitialised pool from a real price of zero, so a bad storage read cannot be interpreted as a valid tick.

#### G-21
`if (msg.sender != address(poolManager)) revert OnlyPoolManager()` · `V4SwapAdapter.sol:75` · Restricts the unlock callback to the PoolManager; without it anyone could invoke the settlement path with forged callback data.

#### G-22
`if (amountOut == 0) revert NothingReceived()` · `V4SwapAdapter.sol:71` · Rejects a swap that produced nothing rather than returning a zero the caller might treat as success.

#### G-23
`if (msg.sender != address(poolManager)) revert OnlyPoolManager()` · `DemoLiquidity.sol:60` · Same callback restriction for the sandbox liquidity seeder.

#### G-24
`require(block.timestamp - lastFaucet[msg.sender] > 60, "wait a minute")` · `DemoToken.sol:28` · Rate-limits the sandbox faucet per address. Note `mint()` at :33 has no such limit.

---

## 2. Inferred Invariants (Single-Contract)

Inferred invariants are derived from structural analysis of the source code. Each block cites one of five extraction methods in its `Derivation` field.

Each block is classified by shape: `Conservation` · `Bound` · `Ratio` · `StateMachine` · `Temporal`. Category definitions at the end of §2.

---

#### I-1

`Conservation` · On-chain: **Yes**

> `DemoToken.totalSupply == Σ balanceOf[addr]` across any sequence of mints and transfers.

**Derivation** — Δ-pair: `DemoToken.sol:36` (`balanceOf[to] += amount`) ↔ `DemoToken.sol:37` (`totalSupply += amount`). Write-site enumeration for `totalSupply`: `_mint:37` only. `_transfer:60-61` moves between balances with no scalar change, so it is self-conserving. No burn path exists.

**If violated** — the sandbox token's supply accounting would diverge from holdings; sandbox-only impact.

---

#### I-2

`Bound` · On-chain: **No**

> `feeBps` should be bounded to a sane maximum (conventionally ≤ 10_000 = 100%).

**Derivation** — guard-lift of the fee computation at `OrderBook.sol:288` (`fee = (amountOut * feeBps) / 10_000`). Write-site enumeration for `feeBps`: `constructor:125` and `setFee:320`. **Neither write site enforces any upper bound.** There is no `require`/`if-revert` on `_feeBps` at either location.

**If violated** — at `feeBps == 10_000` the trader's payout at `OrderBook.sol:295` (`amountOut - fee`) is zero; above 10_000 the subtraction underflows and every fill reverts. Worth confirming which of those the deployment can reach.

---

#### I-3

`StateMachine` · On-chain: **Yes**

> An order's `status` moves `Open → Filled` or `Open → Cancelled`, and never leaves a terminal state.

**Derivation** — edge: `Open@OrderBook.sol:161` → `Filled@OrderBook.sol:263` (guarded by G-8 at :248) and `Open@161` → `Cancelled@213` (guarded by G-5 at :212). Write-site enumeration for `status`: `createOrder:161`, `execute:263`, `cancelOrder:213`. No write returns a terminal order to `Open`; `Status.None` is never written.

**If violated** — an order could be filled twice, pulling the trader's tokens a second time.

---

#### I-4

`Temporal` · On-chain: **No**

> An order whose trigger has held since `armedAtBlock` becomes fillable once `minDwellBlocks` have elapsed.

**Derivation** — temporal: `if (block.number < armed + minDwellBlocks) revert DwellNotMet(...)` at `OrderBook.sol:255-257`. Write-site enumeration for `armedAtBlock`: `createOrder:162` (zero), `armOrder:233` (`o.armedAtBlock = uint64(block.number)`). **`armOrder` is permissionless (no modifier, no `msg.sender` restriction) and rewrites `armedAtBlock` unconditionally — it does not check whether the order is already armed.**

**If violated** — the dwell window restarts on every call to `armOrder`. Worth tracing whether an address calling `armOrder` once per block keeps `block.number < armed + minDwellBlocks` permanently true, and what that costs the caller versus the order owner.

---

#### I-5

`Bound` · On-chain: **No**

> `totalFilledUsdc <= maxTotalValueUsdc` whenever the cap is non-zero.

**Derivation** — guard-lift of G-17 at `OrderBook.sol:283-285`. Write-site enumeration: `totalFilledUsdc` is written only at `execute:286`, and the guard precedes it. But `maxTotalValueUsdc` is written at `constructor:130` and `setCaps:331`, and **`setCaps` performs no comparison against the current `totalFilledUsdc`**.

**If violated** — lowering the cap below the already-accumulated total makes `newTotal > maxTotalValueUsdc` true for every subsequent fill. Worth confirming whether any path other than raising the cap again can clear that state.

---

#### I-6

`Temporal` · On-chain: **Yes**

> An order with a non-zero `expiry` cannot be armed or filled after `block.timestamp > expiry`.

**Derivation** — temporal: `if (o.expiry != 0 && block.timestamp > o.expiry) revert OrderExpired()` at `OrderBook.sol:228` (arm) and `:249` (fill); the same predicate returns `TriggerState.Expired` in the view path at `:188`. `expiry` is written only at `createOrder:160` and never mutated.

**If violated** — a stale order could fill long after the trader intended it to lapse.

---

#### I-7

`Conservation` · On-chain: **No**

> The contract holds no persistent record of `tokenIn` pulled from traders.

**Derivation** — negative conservation. `execute` pulls `o.amountIn` at `OrderBook.sol:267` (`transferFrom(o.owner, address(this), o.amountIn)`) with **zero storage Δ** tracking it. The only accounting write in the function is `totalFilledUsdc = newTotal` at `:286`, which records proceeds, not input.

**If violated** — not itself a defect (the design is pass-through within one transaction), but it means any `tokenIn` left in the contract after a fill is unattributed and unrecoverable by design. Worth confirming the adapter always consumes or refunds the full input.

---

#### I-8

`Bound` · On-chain: **No**

> `minDwellBlocks >= 1`, so arming and filling can never land in the same block.

**Derivation** — guard-lift of G-11/G-12 at `OrderBook.sol:254-257`. Write-site enumeration for `minDwellBlocks`: `constructor:127` and `setDwell:335`. **Neither write site rejects zero.** At `minDwellBlocks == 0` the check `block.number < armed + 0` is false in the same block, so `armOrder` and `execute` can both execute within one transaction sequence at the same block height.

**If violated** — the cross-block requirement described in the `armOrder` NatSpec at `:222-224` no longer holds. Worth confirming the deployed value.

---

#### I-9

`Ratio` · On-chain: **Yes**

> `fee == amountOut * feeBps / 10_000`, computed from the measured delta rather than a router-reported figure.

**Derivation** — `OrderBook.sol:288`. `amountOut` is snapshotted as a balance difference at `:265` (before) and `:274` (after), so the ratio's numerator is taken **after** the external call and after the slippage and cap guards at `:275`–`:285`.

**If violated** — fee and payout would disagree with the value actually received.

---

#### I-10

`Bound` · On-chain: **Yes**

> Realised proceeds of a single fill never exceed `maxOrderValueUsdc` when that cap is non-zero.

**Derivation** — guard-lift of G-16 at `OrderBook.sol:279-281`. `amountOut` is a function-local derived at `:274`; there is exactly one site where it is finalised, and the guard immediately follows it.

**If violated** — a single fill could exceed the deployment's declared per-order exposure limit.

---

#### I-11

`StateMachine` · On-chain: **Yes**

> `owner` is written once and never changes.

**Derivation** — edge: `owner@OrderBook.sol:123` (`owner = msg.sender` in the constructor) with **no reverse or forward path**. Write-site enumeration for `owner`: constructor only. Repository-wide grep for `transferOwnership`, `renounce`, and `pause` across `contracts/` returns no matches.

**If violated** — n/a; the property holds. It is recorded because its consequence is structural: the privileged address is fixed at deployment for the life of the contract.

---

#### I-12

`Temporal` · On-chain: **Yes**

> A given address can call `DemoToken.faucet()` at most once per 60 seconds.

**Derivation** — temporal: `require(block.timestamp - lastFaucet[msg.sender] > 60, "wait a minute")` at `DemoToken.sol:28`, with `lastFaucet[msg.sender] = block.timestamp` at `:29`. Checked-then-updated ordering.

**If violated** — sandbox faucet drain; note this bound is independent of `mint()` at `:33`, which is unrestricted.

---

**Categories:**
- **Conservation**: Two or more storage variables change by equal-and-opposite amounts in the same function body.
- **Bound**: A guard on a storage variable, lifted to a global property and enforced across every write site. On-chain=**No** if any write site lacks the equivalent guard.
- **Ratio**: A storage variable defined as a formula of other storage variables.
- **StateMachine**: A storage variable transitioning through discrete values with guards preventing reversal.
- **Temporal**: A condition depending on `block.timestamp`, `block.number`, or a duration/deadline variable.

---

## 3. Inferred Invariants (Cross-Contract)

Trust assumptions that span contract boundaries. Each block cites both caller-side and callee-side code.

---

#### X-1

On-chain: **Yes**

> `OrderBook` assumes `V4Price.currentTick` reverts rather than returning a usable tick when the pool slot reads as zero.

**Caller side** — `OrderBook.sol:230` and `OrderBook.sol:260` — the returned tick is passed straight into `_requireTrigger` (G-18) with no zero check of its own.

**Callee side** — `V4Price.sol:54-58` — `currentTick` reverts via `PoolNotInitialised` when `sqrtPriceX96 == 0`. The non-reverting sibling `tryCurrentTick:44-52` returns `ok=false` instead, and is used only by the view path `_check:191`.

**If violated** — a pool whose slot reads zero would be interpreted as tick 0, which for a `triggerBelow` order is a satisfied trigger.

---

#### X-2

On-chain: **No**

> `OrderBook` assumes the USDC balance increase across the router call equals the swap proceeds owed to the trader.

**Caller side** — `OrderBook.sol:265` (`balanceBefore`) and `OrderBook.sol:274` (`amountOut = balanceOf(this) - balanceBefore`) — the delta becomes the payout, the fee base (I-9) and the cap input (I-10, I-5).

**Callee side** — `V4SwapAdapter.sol:111` credits the recipient via `poolManager.take(currencyOut, d.recipient, amountOut)`, **and separately** `V4SwapAdapter.sol:114-115` refunds leftover input — `dust = IERC20(_erc20Of(currencyIn)).balanceOf(address(this))` transferred to `d.caller`, which is the OrderBook. `_erc20Of` at `:27-29` maps the native currency to `GT.USDC`.

**If violated** — the two credits land in the same measured window. Worth tracing what `amountOut` represents when `currencyIn` resolves to USDC through `_erc20Of`, given that on Arc the ERC-20 view and the native balance are one balance (`ArcGroundTruth.sol:11-16`) and `OrderBook` accepts native value via `receive()` at `:135`.

---

#### X-3

On-chain: **No**

> `OrderBook` assumes an allowlisted router consumes the approval it was granted and nothing more.

**Caller side** — `OrderBook.sol:268` (`approve(router, o.amountIn)`), `:269` (`router.call(routeData)` with caller-supplied calldata), `:271` (`approve(router, 0)`).

**Callee side** — `V4SwapAdapter.sol:63-65` pulls exactly `_toErc20Units(currencyIn, amountIn)` via `transferFrom`. But `routerAllowed` is written at `OrderBook.sol:316` by `setRouter`, which accepts **any** address and performs no code or interface check.

**If violated** — the safety of the approval reduces entirely to the owner's allowlist discipline (G-10, G-1). Worth confirming what constrains `routeData`, which is fully keeper-controlled.

---

#### X-4

On-chain: **Yes**

> `OrderBook` assumes the fee, a 6dp ERC-20 amount, must be scaled to 18dp native before comparison against gas cost.

**Caller side** — `OrderBook.sol:292` (`uint256 feeNative = fee * GT.NATIVE_PER_ERC20`) feeding `:293` `_assertCoversCost(gasStart, feeNative, marginNative)`.

**Callee side** — `CostFloor.sol:40-45` computes `costNative` as `total * tx.gasprice`, i.e. native 18dp, and `CostFloor.sol:11-13` documents that callers holding 6dp amounts must scale by 1e12. `ArcGroundTruth.sol:16` defines `NATIVE_PER_ERC20 = 1e12` and flags it as the highest-risk constant in the codebase.

**If violated** — the comparison would be wrong by 10^12 and, in one direction, would pass every fill regardless of cost.

---

## 4. Economic Invariants

Higher-order properties derived from combinations of §2 and §3 invariants.

---

#### E-1

On-chain: **Yes**

> A fill only executes when the fee it collects exceeds the gas that call provably burned, plus the configured margin.

**Follows from** — `I-9` (fee ratio) + `X-4` (unit scaling) + `G-19` (CostFloor assertion)

**If violated** — the keeper would run at a loss and stop, leaving every open order unprotected while traders believe they are covered.

---

#### E-2

On-chain: **No**

> The protocol's realised-proceeds exposure stays within the caps the owner declared at deployment.

**Follows from** — `I-10` (per-fill cap, Yes) + `I-5` (cumulative cap, No) + `I-2` (unbounded `feeBps`, No)

**If violated** — the declared exposure envelope is only as stable as the owner's setter discipline, since `setCaps` and `setFee` are instant and unbounded. Worth confirming the intended operational procedure for those two functions.

---

#### E-3

On-chain: **Yes**

> A trader's payout is the measured proceeds less the protocol fee, and never less than their own declared slippage bound minus that fee.

**Follows from** — `G-15` (slippage bound) + `I-9` (fee ratio) + `X-2` (proceeds measurement)

**If violated** — the trader would receive less than the minimum they signed up for. Note this inherits X-2's On-chain=No caveat on what the measured delta represents.
