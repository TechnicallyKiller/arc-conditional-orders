# X-Ray Report

> Arc Conditional Orders | 602 nSLOC | 9116817 (`master`) | Foundry (arc-foundry) | 22/09/26

---

## 1. Protocol Overview

**What it does:** Non-custodial stop-loss / take-profit orders for Uniswap v4 spot traders on Arc, where a permissionless keeper fills an order only if the fee it collects provably exceeds the gas that fill burned.

- **Users**: Spot traders who want a price-triggered exit without leaving funds with a custodian; keepers who fill those orders for the fee.
- **Core flow**: Trader approves the input token and creates an order naming a pool, a tick and a direction; a keeper arms it when the trigger is met, waits out a dwell period, then fills.
- **Key mechanism**: Two-phase arm/execute. The trigger must be observed in one block and still hold in a later one, so a price spike reverted inside a single transaction cannot satisfy both.
- **Token model**: No protocol token. Proceeds are always USDC, which on Arc is also the gas token — that shared unit is what lets `CostFloor` compare fee against gas with no oracle.
- **Admin model**: A single `owner`, set at construction, with five instant setters. No timelock, no multisig, no pause, and no ownership transfer path.

For a visual overview of the protocol's architecture, see the [architecture diagram](architecture.svg).

### Contracts in Scope

| Subsystem | Key Contracts | nSLOC | Role |
|-----------|--------------|------:|------|
| Order coordination | OrderBook | 226 | Order lifecycle, trigger re-check, fee, exposure caps |
| Cost invariant | CostFloor | 29 | Proves a fill's fee exceeded its own gas cost |
| Price reading | V4Price | 36 | Decodes `slot0` from PoolManager storage; separates unreadable from untriggered |
| Swap routing | V4SwapAdapter | 79 | Swaps against Uniswap v4 via the unlock callback, settling on transient deltas |
| Testnet sandbox | DemoToken, DemoLiquidity | 121 | Faucet token and pool seeder for the testnet demo |
| Constants | ArcGroundTruth | 19 | On-chain-verified addresses and decimal constants |

### Backwards-Compatibility Code

The project pivoted from a pooled liquidation engine (described in `claude.md`) to conditional orders. These remnants of the earlier design have **zero callers** anywhere in `contracts/` outside their own declaration:

- `ArcGroundTruth.MORPHO`, `CIRBTC`, `CIRBTC_DECIMALS`, `MARKET_CIRBTC_USDC`, `ORACLE_CIRBTC_USDC`, `IRM_CIRBTC_USDC`, `LLTV_86` — Morpho lending market parameters from the liquidation design. No lending path exists in the shipped system.
- `ArcGroundTruth.MIN_BASE_FEE`, `CHAIN_ID`, `USDC_ERC20_DECIMALS` — declared and verified, but referenced only by off-chain tooling.
- `contracts/interfaces/IMorpho.sol` (51 nSLOC) — imported by `ArcGroundTruth` for the `Id` type alone.

`claude.md` itself is a stale spec: it describes a Vault, depositor shares, borrowing and liquidation bounties, none of which exist in the shipped contracts. Treat any claim sourced from it as `(per stale spec)`.

### How It Fits Together

The core trick: on a chain where gas and profit are the same asset, a contract can enforce its own profitability as an invariant instead of trusting an off-chain estimate.

### Order creation

```
Trader
 └─ IERC20.approve(OrderBook, amountIn)        ← off-chain prerequisite, never checked on creation
 └─ OrderBook.createOrder()
     └─ orders[id] = Order{ owner, tokenIn, amountIn, minAmountOut, key, triggerTick, ... }
        *no value moves; funds stay in the trader's wallet until a fill*
```

### Arming — the first of two observations

```
Keeper
 └─ OrderBook.armOrder(id)
     ├─ V4Price.currentTick(poolId)
     │   └─ PoolManager.extsload(slot0)         *reverts if the slot reads zero — X-1*
     ├─ _requireTrigger(o, tick)                *trigger derived from the pool, not from the keeper*
     └─ o.armedAtBlock = block.number           *written unconditionally, even if already armed — I-4*
```

### Fill — the second observation, plus the cost floor

```
Keeper
 └─ OrderBook.execute(id, router, routeData)
     ├─ require armed, dwell elapsed, arm not stale     *G-11, G-12, G-13*
     ├─ _requireTrigger(o, V4Price.currentTick(...))    *trigger must STILL hold*
     ├─ o.status = Status.Filled                        *effects before interactions*
     ├─ balanceBefore = USDC.balanceOf(this)
     ├─ tokenIn.transferFrom(trader → OrderBook)
     ├─ tokenIn.approve(router, amountIn)
     ├─ router.call(routeData)                          *arbitrary calldata to an allowlisted address*
     │   └─ V4SwapAdapter.swapExactIn()
     │       └─ PoolManager.unlock() → unlockCallback()
     │           ├─ PoolManager.swap()
     │           ├─ settle owed / take owing             *from transient deltas, not the swap return*
     │           └─ refund dust → caller                 *lands inside the measured window — X-2*
     ├─ amountOut = USDC.balanceOf(this) - balanceBefore
     ├─ fee = amountOut * feeBps / 10_000                *feeBps unbounded at both write sites — I-2*
     ├─ CostFloor._assertCoversCost(gasStart, fee * 1e12, margin)   *X-4: 6dp → 18dp scaling*
     └─ USDC.transfer(trader, amountOut - fee); USDC.transfer(feeRecipient, fee)
```

### Settlement against transient deltas

```
V4SwapAdapter.unlockCallback()
 ├─ owed  = exttload(keccak256(this, currencyIn))     *negative: we owe the pool*
 ├─ owing = exttload(keccak256(this, currencyOut))    *positive: the pool owes us*
 ├─ if native: settle{value: pay}()   else: sync → transfer → settle()
 └─ take(currencyOut, recipient, owing)
    *transient deltas are used because AFTER_SWAP_RETURNS_DELTA hooks make the swap's own
     return value unreliable on most Arc launchpad pools*
```

---

## 2. Threat & Trust Model

### Protocol Threat Profile

> Protocol classified as: **DEX/AMM periphery** with **keeper-automation** characteristics

Signals are v4-specific and read-only against the AMM: `PoolKey`, `sqrtPriceX96`, `tick`, `slot0`, `PoolManager.unlock`/`swap`/`settle`/`take`. The protocol operates no curve and holds no liquidity of its own — it is an execution layer sitting on someone else's pool, so AMM manipulation threats apply to its *inputs* rather than its own reserves. The keeper dimension adds the liveness and griefing threats of any bot-dependent system.

### Actors & Adversary Model

| Actor | Trust Level | Capabilities |
|-------|-------------|-------------|
| Trader | Untrusted | Creates and cancels own orders; sets own `minAmountOut`, trigger and expiry. Cannot affect other orders. |
| Keeper | Untrusted | Anyone. Calls `armOrder` and `execute` on any order; chooses `router` (from the allowlist) and `routeData` freely. Cannot extract funds — proceeds route to the order owner at `:295`. |
| Owner | Trusted, unbounded | 5 instant setters: `setRouter`, `setFee`, `setMargin`, `setCaps`, `setDwell`. **All instant — no timelock, no multisig, no pause.** Fixed at construction (`:123`); no transfer or renounce path exists. |
| Uniswap v4 PoolManager | Trusted, external | Sole price source and swap venue. Invokes `unlockCallback` on both adapters. |

**Adversary Ranking**:

1. **Keeper-side griefer** — anyone can call the permissionless `armOrder`, and its only effect is to write state other actors depend on.
2. **MEV searcher / sandwich attacker** — every fill is a swap against a public pool with a trader-chosen slippage bound and keeper-chosen calldata.
3. **Compromised owner** — five unbounded instant setters with no delay and no recovery path.
4. **Flash-loan price manipulator** — the trigger is an AMM tick, and Arc's thin pools make ticks cheap to move.

See [entry-points.md](entry-points.md) for the full entry point map.

### Trust Boundaries

- **Owner → everything** — `onlyOwner:99-102` is the entire authorisation model; the worst instant action is `setFee(10_000, attacker)` at `:319-322`, which drives the trader payout at `:295` to zero. *Git signal: 5 commits touched access-control code in 3 days.*

- **Keeper → order state** — `armOrder:225` is permissionless and writes `armedAtBlock` with no caller restriction; `execute:240` re-derives the trigger on-chain, so a keeper's *claim* is never trusted, only its *timing*.

- **OrderBook → router** — `routerAllowed:250` gates `router.call(routeData)` at `:269`, executed while the router holds a fresh approval from `:268`. `setRouter:315` accepts any address with no code check.

- **OrderBook → PoolManager** — the only price oracle; `V4Price:57` reverts on a zero slot rather than returning tick 0.

### Key Attack Surfaces

- **`armOrder` rewrites the dwell clock unconditionally** &nbsp;&#91;[I-4](invariants.md#i-4)&#93; — `OrderBook.sol:233` sets `armedAtBlock = block.number` on every call, with no check that the order is already armed, and the function is permissionless. Worth tracing what `execute:255-257` does when that write repeats each block.

- **`feeBps` is bounded at neither write site** &nbsp;&#91;[I-2](invariants.md#i-2), [E-2](invariants.md#e-2)&#93; — `constructor:125` and `setFee:320` both assign it raw; `:288` computes the fee and `:295` subtracts it from the trader's payout. Worth confirming what values the deployment can reach and what `amountOut - fee` does at each.

- **Proceeds are a USDC balance delta on a chain where the ERC-20 view reads the native balance** &nbsp;&#91;[X-2](invariants.md#x-2)&#93; — `:265`/`:274` bracket the router call, while `V4SwapAdapter.sol:114-115` refunds leftover input to the same address inside that window and `OrderBook.sol:135` accepts native value. Worth tracing what the delta contains when `_erc20Of(currencyIn)` resolves to USDC.

- **Owner is permanent and unrecoverable** &nbsp;&#91;[I-11](invariants.md#i-11)&#93; — `owner = msg.sender` at `:123` is the only write; a repository-wide grep finds no `transferOwnership`, `renounce` or `pause` in `contracts/`. Worth confirming the intended custody of that key.

- **Allowlisted router receives arbitrary keeper calldata under a live approval** &nbsp;&#91;[X-3](invariants.md#x-3)&#93; — `:268` approves, `:269` calls with keeper-supplied `routeData`, `:271` revokes; `setRouter:316` performs no validation of what it allowlists. Worth checking what constrains `routeData` given that the trader's tokens are already in the contract at that point.

- **`setCaps` can be lowered below the accumulated total** &nbsp;&#91;[I-5](invariants.md#i-5)&#93; — `setCaps:330-331` writes `maxTotalValueUsdc` with no comparison against `totalFilledUsdc`, which only ever increases at `:286`. Worth confirming what state the contract is in when the new cap is below the old total.

- **`setDwell` accepts zero** &nbsp;&#91;[I-8](invariants.md#i-8)&#93; — `setDwell:334-336` and `constructor:127` both assign `minDwellBlocks` unchecked; the cross-block guarantee documented at `:222-224` rests entirely on that value. Worth confirming the deployed setting.

- **`DemoToken.mint` is permissionless and unmetered** — `DemoToken.sol:33` allows any address to mint any amount to anyone, while `faucet():27` is rate-limited. Sandbox-only by design, but it is the price side of the demo pool.

### Protocol-Type Concerns

**As a DEX/AMM periphery:**
- Ticks are read from `slot0` via a hardcoded mapping slot — `V4Price.sol:14` pins `POOLS_SLOT = 6`; a PoolManager storage-layout change returns zero rather than a wrong price, which `:57` converts to a revert.
- `sqrtPriceLimitX96` is set to the permissive extremes at `V4SwapAdapter.sol:86`, deliberately delegating all price protection to the trader's `minAmountOut` at `OrderBook.sol:275`.
- `_poolId` at `OrderBook.sol:302-304` re-derives the id by hashing the key's fields rather than using the imported `poolIdOf` helper; the two must agree for routing to work.

**As keeper automation:**
- `execute` is priced against `tx.gasprice` at `CostFloor.sol:44`, so fill viability is a function of gas price at submission time, not of order size alone.

### Temporal Risk Profile

**Deployment & Initialization:**
- No proxy and no `initialize()`; all parameters are constructor-set at `OrderBook.sol:111-131`, so there is no initialization front-running window.
- `Deploy.s.sol:25-26` defaults both exposure caps to `0` (unlimited). `DeployMainnet.s.sol:34-37` rejects zero caps and asserts chain 5042 — the mainnet path is the guarded one.
- `routerAllowed` starts empty; until `setRouter` runs, `execute` reverts at `:250` for every order.

**Market Stress:**
- Fills depend on a keeper submitting at a gas price where `fee * 1e12 >= gasCost + margin` (`CostFloor.sol:54`). Under a gas spike the floor holds and the fill simply does not happen — worth confirming traders understand that protection is best-effort.
- `maxArmAgeBlocks` at `:258` invalidates stale arms, so a keeper outage longer than that window requires re-arming before any fill.

### Composability & Dependency Risks

> **Uniswap v4 PoolManager** — via `V4Price.slot0`, `V4SwapAdapter.swapExactIn/unlockCallback`
> - Assumes: `slot0` lives at mapping slot 6; `exttload` returns the caller's transient delta; `take`/`settle` semantics
> - Validates: zero-slot check at `V4Price.sol:51,57`; settles from transient deltas rather than the swap return value
> - Mutability: external, out of scope; storage layout is an implementation detail this code depends on
> - On failure: `currentTick` reverts (`PoolNotInitialised`); `swapExactIn` reverts on zero output (`:71`)

> **USDC (`0x3600…0000`)** — via every transfer path
> - Assumes: ERC-20 view is 6dp, native balance is 18dp, both are one balance, ratio exactly `1e12`
> - Validates: scaling is explicit at `OrderBook.sol:292`, `V4SwapAdapter.sol:36-39`, `DemoLiquidity.sol:82-84`
> - Mutability: system precompile
> - On failure: transfers revert; note a USDC ERC-20 transfer moves native value, hence `receive()` on all three contracts

**Token Assumptions** *(unvalidated only)*:
- `tokenIn` is arbitrary and trader-chosen (`createOrder:142`): return values of `transferFrom`/`approve`/`transfer` are **not checked** at `OrderBook.sol:267`, `:268`, `:271`, `:295`, `:296` — no SafeERC20. A token that returns `false` instead of reverting would not halt the fill; `amountOut` is measured as a balance delta, which absorbs fee-on-transfer on the *output* leg but not the input leg.
- No allowlist on `tokenIn` — fee-on-transfer, rebasing and callback-bearing tokens are all reachable.

**Shared State Exposure**:
- Fills swap against public Arc v4 pools. Measured impact on those pools is material — 38 bps on a $50 sell and 371 bps at $500 on the deepest tested pool — so a fill both suffers and creates price impact that other readers of the same pool observe.

---

## 3. Invariants

> ### 📋 Full invariant map: **[invariants.md](invariants.md)**
>
> A dedicated reference file contains the complete invariant analysis — do not look here for the catalog.
>
> - **24 Enforced Guards** (`G-1` … `G-24`) — per-call preconditions with `Check` / `Location` / `Purpose`
> - **12 Single-Contract Invariants** (`I-1` … `I-12`) — Conservation, Bound, Ratio, StateMachine, Temporal
> - **4 Cross-Contract Invariants** (`X-1` … `X-4`) — caller/callee pairs that cross scope boundaries
> - **3 Economic Invariants** (`E-1` … `E-3`) — higher-order properties deriving from `I-N` + `X-N`
>
> Every inferred block cites a concrete Δ-pair, guard-lift + write-sites, state edge, temporal predicate or NatSpec quote. The **6 On-chain=No** blocks are the high-signal ones — each is simultaneously an invariant and a potential bug. Attack-surface bullets above cross-link directly into the relevant blocks.

---

## 4. Documentation Quality

| Aspect | Status | Notes |
|--------|--------|-------|
| README | Present | `README.md`, 102 lines — states status, fill economics, and Arc-specific footguns |
| NatSpec | ~10 annotations | Dense on the risky lines (`CostFloor.sol:11-13`, `V4SwapAdapter.sol:31-35`, `OrderBook.sol:54-60`); sparse on the setters |
| Spec/Whitepaper | Present but **stale** | `claude.md`, 816 lines — describes a liquidation engine with a Vault, shares and borrowing. None of that is in the shipped contracts. |
| Inline Comments | Thorough | Comments explain *why*, and several record bugs that were actually hit (`V4SwapAdapter.sol:34-35`, `OrderBook.sol:32-34`, `:203-204`) |

Claims sourced from `claude.md` are tagged `(per stale spec)` throughout this report. `data/ground-truth.json` records each constant with the on-chain read that confirmed it.

---

## 5. Test Analysis

| Metric | Value | Source |
|--------|-------|--------|
| Test files | 10 | File scan (always reliable) |
| Test functions | 64 | File scan (always reliable) |
| Line coverage | 61.17% overall — **93.40% OrderBook**, 100% V4SwapAdapter, 100% V4Price, 0% demo contracts | `forge coverage` |
| Branch coverage | 48.33% overall — 69.23% OrderBook | `forge coverage` |

The overall figure is depressed by deploy scripts and the two sandbox contracts, which carry no production risk. Coverage of the contracts that move value is high.

### Test Depth

| Category | Count | Contracts Covered |
|----------|-------|-------------------|
| Unit | 64 | broad |
| Fork (Arc mainnet) | 8 | OrderBook, V4SwapAdapter, V4Price, CostFloor |
| Stateless Fuzz | 2 | CostFloor, units |
| Stateful Fuzz (Foundry invariant) | 0 | none |
| Stateful Fuzz (Echidna) | 0 | none |
| Stateful Fuzz (Medusa) | 0 | none |
| Formal Verification (Certora / Halmos / HEVM) | 0 | none |

### Gaps

- **No stateful fuzzing of any kind** (0 Foundry invariant, 0 Echidna, 0 Medusa). Highest-value gap: the arm/execute state machine is multi-block and multi-actor, which is exactly the shape stateful fuzzing catches and unit tests do not. `I-4` and `I-5` are both sequence-dependent.
- **No formal verification.** The `CostFloor` comparison and the 1e12 scaling at `OrderBook.sol:292` are small, arithmetic, and high-consequence — good targets.
- **Branch coverage on OrderBook is 69.23%** against 93.40% of lines: roughly a third of conditional paths are unexercised, and the revert branches are where the guards live.
- Demo contracts at 0% are unexercised but testnet-only.

---

## 6. Developer & Git History

> Repo shape: **normal_dev** — 26 commits over 3 days, 10 of which touch source. Development history is real but extremely compressed.

Analyzed branch: `master` at `9116817`.

### Contributors

| Author | Commits | Source Lines (+/-) | % of Source Changes |
|--------|--------:|--------------------|--------------------:|
| Divyanshh Kalra | 26 | +942 / -44 | 100% |

### Review & Process Signals

| Signal | Value | Assessment |
|--------|-------|------------|
| Unique contributors | 1 | Single-dev |
| Merge commits | 0 of 26 (0%) | No merge commits — no peer review signal |
| Repo age | 2026-09-19 → 2026-09-22 | 3 days |
| Recent source activity (30d) | 10 commits | Entire history is within the window |
| Test co-change rate | 100% | Every source-changing commit also modified tests (co-modification, not coverage) |

### File Hotspots

| File | Modifications | Note |
|------|-------------:|------|
| contracts/OrderBook.sol | 5 | Highest churn and highest nSLOC — prioritize review |
| contracts/adapters/V4SwapAdapter.sol | 4 | Two of its four commits were unit-handling corrections |
| contracts/interfaces/IPoolManager.sol | 3 | Interface widened as hook support was added |
| contracts/libraries/V4Price.sol | 2 | Gained the non-reverting read |

### Security-Relevant Commits

**Score** = weighted sum of fix-like signals. **10+ warrants a manual diff.**

| SHA | Date | Subject | Score | Key Signal |
|-----|------|---------|------:|------------|
| b621c00 | 2026-09-19 | Harden triggers against single-block price manipulation | 13 | Spans 4 security domains; tightens access control |
| a77c2e6 | 2026-09-19 | Correct the depth measurements: they were measuring dust | 12 | Changes token transfer and accounting logic |
| 105f901 | 2026-09-19 | Native-USDC swap support, measured depth, and a liquidity problem | 12 | Adds runtime guards; accounting change |
| 3568571 | 2026-09-19 | Phases 0-2: ground truth, Arc Foundry harness, CostFloor invariant | 11 | Spans 3 domains incl. fund flows |
| 92a4609 | 2026-09-19 | Phase 3: OrderBook with on-chain trigger checks | 10 | Spans 5 security domains; +6 access-control lines |

### Dangerous Area Evolution

| Security Area | Commits | Key Files |
|--------------|--------:|-----------|
| fund_flows | 10 | OrderBook.sol, V4SwapAdapter.sol |
| oracle_price | 10 | V4Price.sol, OrderBook.sol, V4SwapAdapter.sol |
| access_control | 5 | OrderBook.sol |
| state_machines | 5 | OrderBook.sol |
| liquidation | 2 | interfaces/IMorpho.sol (dead — see §1) |

### Technical Debt Markers

None. Zero TODO / FIXME / HACK / XXX markers across `contracts/`.

### Security Observations

- **Single-developer, zero merge commits** — 100% of 942 source lines from one author across 26 commits; no peer-review signal in history.
- **Entire codebase is 3 days old** — first commit 2026-09-19, head 2026-09-22; every source commit falls inside the 30-day "late change" window.
- **`OrderBook.sol` leads both churn and attack surface** — 5 modifications, 226 nSLOC, and 6 of 8 attack surfaces.
- **Two of the top-3 fix commits are unit-handling corrections** — `a77c2e6` and `105f901` both fixed 18dp-vs-6dp errors in `V4SwapAdapter`; the same class of bug is live at `OrderBook.sol:292` (`X-4`).
- **Test co-change is 100%** — every source commit touched tests; this measures file co-modification, not coverage or assertion quality.
- **Dead liquidation-era constants survive the pivot** — 8 constants and `IMorpho.sol` have zero callers (§1).

### Cross-Reference Synthesis

- **`OrderBook.sol` is #1 in churn AND holds 6 of 8 attack surfaces** → highest-leverage review targets: `execute:240-299`, `armOrder:225-236`, and the five setters at `:315-337`.
- **The `a77c2e6` fix class is not fully retired** → decimal-scaling errors were found twice in `V4SwapAdapter`; `X-4` is the same arithmetic in `OrderBook`, guarded only by `test_feeMustBeScaledBeforeCostFloor`.
- **access_control churn (5 commits) + no timelock + no ownership transfer** → the privileged surface changed repeatedly in 3 days and has no recovery path (`I-11`).
- **0 stateful-fuzz tests + 2 sequence-dependent On-chain=No invariants** (`I-4` re-arm, `I-5` cap lowering) → the untested test category is precisely the one that targets the unenforced invariants.

---

## X-Ray Verdict

**FRAGILE** — Named roles exist and value-moving contracts are well covered by unit and fork tests, but the single `owner` has five instant unbounded setters with no timelock, no multisig, no pause and no transfer path.

**Structural facts:**
1. 602 nSLOC across 10 source files; `OrderBook.sol` alone is 226 nSLOC (38% of the codebase) and carries 5 of the 9 dangerous-area commit associations.
2. One developer authored 100% of 942 source lines across 26 commits in 3 days, with 0 merge commits.
3. 64 test functions across 10 files, including 8 Arc-mainnet fork tests and 2 stateless fuzz tests; 0 stateful-fuzz and 0 formal-verification tests.
4. 5 owner-only setters; `owner` is written once at `OrderBook.sol:123` and no `transferOwnership`, `renounce` or `pause` exists anywhere in `contracts/`.
5. 8 constants in `ArcGroundTruth.sol` plus `IMorpho.sol` (51 nSLOC) have zero callers — remnants of a liquidation design the project abandoned.
6. 6 of 19 inferred invariants are not enforced on-chain.
