# Arc Liquidation Engine — Production Specification

Status: pre-Phase 0. Nothing in this document is confirmed until the ground-truth
file exists and its gate passes.

---

## 1. Product definition

A pooled liquidation engine for Arc's credit markets. Depositors supply USDC to a
vault. Anyone can trigger a liquidation against a lending market, and the engine
borrows from the vault, closes the unhealthy position, converts the seized
collateral back to USDC, and repays the vault within the same transaction. The
caller keeps a bounty from the surplus; the remainder accrues to depositors as a
rising share price.

The entire cycle is atomic. There is no window in which vault capital sits outside
the vault. That removes counterparty risk, and with it the staking registry,
slashing mechanism, draw caps and timeout logic a multi-transaction design would
require. A call that does not return more USDC than it took does not execute at
all.

**What this is not.** Not a lending protocol, not a yield aggregator, not a
general-purpose keeper network. It executes one operation against one class of
venue.

**Primary deliverable.** A working liquidation cycle on Arc mainnet evidenced by
transaction hashes, plus a read-only interface that lets anyone verify vault state
and liquidation history without connecting a wallet.

---

## 2. The thesis

Every liquidation is a bet that the seizure discount exceeds the cost of capturing
it. On every chain before Arc, one side of that comparison is denominated in a
volatile asset and the other in a stablecoin. Gas is paid in ETH; profit is
realised in USDC. To compare them you need a price oracle, and the moment you
introduce one you inherit oracle latency, oracle manipulation risk, and basis risk
between the two assets.

The practical consequence is that no liquidation bot in production enforces
profitability on-chain. Every one of them estimates off-chain, submits, and
occasionally executes at a loss. It is treated as an unavoidable operating cost.

On Arc, gas is USDC. Cost and profit are the same unit, in the same transaction.
The comparison becomes arithmetic on values the EVM already exposes.

**The design claim:** this is the first liquidation engine that enforces its own
profitability as a contract-level invariant rather than an off-chain heuristic. It
cannot execute a trade that loses money, and that guarantee is verifiable by
reading the contract rather than trusting the operator.

The claim is narrow, testable, and true only on a chain with this fee model. That
is what makes it an Arc project rather than an EVM project that happens to be
deployed on Arc.

Two secondary properties reinforce it. Deterministic sub-second finality with no
reorg risk means a liquidation cannot be undone by a chain reorganisation,
removing a class of race condition that exists elsewhere. And because gas is USDC,
an operator needs no gas-token treasury, no rebalancing, and no exposure to a
second asset in order to participate.

---

## 3. System architecture

Four on-chain components, one off-chain service, one interface. Each component has
a single responsibility and no component reaches past its immediate neighbour.

### Vault

ERC-4626 over USDC. Holds idle capital, mints and burns shares, and is the only
contract that knows about depositors. It exposes a single privileged operation to
the Engine: lend within a transaction, expect repayment before the transaction
ends.

The Vault never calls a lending market, never holds a non-USDC asset, and never
touches a swap venue. It is deliberately boring, because accounting bugs here are
silent and total.

Note: on Arc a contract's USDC is its **native balance**, not an entry in a token
contract. The Vault's accounting reads the native balance, not the truncating
ERC-20 view. See §4 and the appendix.

### Engine

The only contract that composes. It owns the liquidation cycle and the
profitability invariant. It is stateless between calls apart from configuration,
which means a compromised or superseded Engine can be replaced without migrating
depositor capital.

### Lending adapter

Translates between the Engine's internal notion of a liquidation and a specific
venue's interface. Morpho first. The adapter surface is deliberately minimal:
identify the position, report whether it is liquidatable, execute the seizure,
report what was seized.

### Swap adapter

Converts seized collateral to USDC under a caller-supplied slippage bound. Two
implementations: a production adapter against the live DEX, and a fixed-price
adapter used only by the demonstration market.

### Watcher

Off-chain. Reads market state, computes health, simulates candidate liquidations,
submits the profitable ones. It holds no privileged position. Anyone can run one,
and the system's safety does not depend on the Watcher being correct, because the
Engine's invariant rejects unprofitable calls regardless of who submits them.

### Interface

Read-only by default. Vault state, share price, liquidation history with
transaction links, and the current state of the demonstration market.

### One cycle

1. Watcher observes a position below the health threshold.
2. Watcher simulates the full call and computes expected surplus after gas.
3. Watcher submits to the Engine.
4. Engine records the Vault's starting USDC balance and the gas consumed so far.
5. Engine borrows the required USDC from the Vault.
6. Lending adapter executes the liquidation; collateral arrives at the Engine.
7. Swap adapter converts collateral to USDC under the slippage bound.
8. Engine computes realised surplus, subtracts its own gas cost, and reverts if
   the result does not clear the configured margin.
9. Engine repays principal to the Vault, pays the caller's bounty, forwards the
   remainder to the Vault.
10. Share price rises. The transaction emits a structured event the interface
    indexes.

Any failure at any step reverts the entire transaction. There is no partial state.

---

## 4. The profitability invariant

This is the core of the product. It must be specified precisely, because an
invariant that is almost right is worse than none: it produces false confidence.

### Statement

For any successful liquidation, the USDC returned to the Vault must exceed the
USDC borrowed from it by at least the transaction's own gas cost plus a configured
margin. If that does not hold, the transaction reverts.

### The decimal boundary, which is where this breaks

USDC on Arc exposes two interfaces over one balance: a native interface at 18
decimals and an ERC-20 interface at 6. Arc's own documentation warns against
mixing `msg.value` with `balanceOf()` in pool or LTV math, because the raw values
differ by a factor of 10^12.

The invariant does exactly that. Gas cost is native-denominated at 18 decimals.
Realised profit, read naively, comes back through the ERC-20 view at 6. Getting
the conversion wrong makes the check off by a trillion in one direction or the
other, and in one of those directions it silently passes everything.

Two consequences follow:

- **Measure profit against the native balance, not `balanceOf`.** The ERC-20 view
  truncates sub-USDC fractions, so small realised profits disappear entirely, and
  a zero `balanceOf` does not mean the native balance is zero.
- **The unit conversion is the highest-risk line in the codebase.** It needs a
  dedicated test asserting the exact scaling factor, and a fuzz test across
  magnitudes spanning both sides of the truncation boundary.

Handling this correctly is also the clearest demonstration that this is an Arc
contract rather than an EVM contract deployed on Arc.

### Computation

Gas consumed is measured by sampling remaining gas at the start of the Engine's
entry function and again immediately before settlement. That interval excludes the
fixed intrinsic cost of the transaction and the final settlement writes, so the
measurement is a lower bound on true cost. The margin absorbs the difference.

Multiplying gas consumed by the effective gas price yields cost in native units.
The comparison against profit happens only after both sides are expressed in the
same denomination.

Relevant confirmed fee mechanics: the minimum base fee is 20 Gwei, the base fee is
paid to the block beneficiary rather than burned, and the next block's base fee is
carried in the parent header's extra data.

### Known limitations, stated rather than hidden

- **The measurement is a lower bound.** Intrinsic gas, calldata cost, and
  post-measurement settlement are not captured. The margin must be set above the
  largest plausible sum of these, measured empirically, not guessed.
- **Gas deductions emit no log.** Off-chain cost accounting has to derive gas from
  the transaction receipt rather than from Transfer events.
- **Caller-supplied inputs are adversarial.** The slippage bound, seize amount and
  swap path all come from the caller. The invariant constrains the outcome, not
  the inputs: the caller may propose anything, and only outcomes that satisfy the
  invariant execute.
- **It guarantees no loss on an executed liquidation, not optimal execution.** A
  caller can still choose a worse swap path than necessary and capture a smaller
  surplus. The Vault is protected; efficiency is not guaranteed.

### Why the negative test is the deliverable

A passing liquidation proves the pipeline works. It does not prove the invariant
does anything. The test that matters constructs a liquidation profitable before
gas and unprofitable after, and asserts a revert with the specific expected
reason. Until that test exists and passes, the central claim of this project is
unsubstantiated.

---

## 5. Trust model and threat surface

### Who can do what

**Depositors** deposit and withdraw. They cannot direct capital, and they bear
loss only through share price.

**Callers** are unpermissioned. Anyone can trigger a liquidation. A caller cannot
extract Vault capital, because the transaction reverts unless more comes back than
went out. A caller can choose inputs, so a caller can waste their own gas and can
execute a less efficient liquidation than an optimal one.

**Admin** sets the margin, the bounty rate, the approved venue list, and can
pause. Admin cannot withdraw depositor funds and cannot alter share accounting. On
a production deployment this key belongs behind a timelock.

### Threats and mitigations

- **First-depositor share inflation.** The classic ERC-4626 attack. Mitigated by a
  dead-share mint at initialisation. Requires an explicit test that attempts the
  attack and fails.
- **Reentrancy through the liquidation callback.** Morpho's liquidation path can
  call back into the caller. This is the highest-risk surface in the system.
  Guarded, and tested with a malicious adapter that attempts reentry.
- **Oracle manipulation on the target market.** The Engine does not price anything
  itself; it relies on the venue's own liquidation eligibility. A compromised
  oracle on a target market is a risk of that market, not of this system, which is
  why the venue allowlist exists.
- **Swap venue manipulation.** A thin pool can be moved to make a liquidation
  appear profitable while extracting value through the swap. Mitigated by the
  slippage bound and by restricting production operation to venues with verified
  depth.
- **Griefing via repeated failed calls.** Failed calls cost the caller, not the
  Vault. Not a meaningful threat.

### Arc-specific execution hazards

These are not attacks. They are ways correct-looking code fails on Arc and nowhere
else.

- **Decimal mismatch.** The 18-versus-6 boundary described in §4. The single most
  likely source of a catastrophic bug in this codebase.
- **Silently dropped transactions.** A `maxFeePerGas` below 20 Gwei is discarded
  by the mempool with no error and no receipt. The Watcher will appear broken with
  no evidence why. Enforce the floor in the submission path and log it.
- **Blocklist reverts.** A liquidation touching a blocklisted counterparty reverts
  and still consumes gas. The Watcher should screen before submitting; the cost
  lands on the caller.
- **Native sends can revert.** Sending value to a contract is not guaranteed to
  succeed on Arc, which breaks a standard DeFi assumption. Transfers to the zero
  address, to precompiles, and to self-destructed accounts all revert.
- **No onchain randomness.** `PREVRANDAO` returns 0 and the beacon-roots contract
  is absent. Nothing in the design should depend on either.
- **Event indexing.** Native movements emit EIP-7708 Transfer logs from a system
  emitter, and two emitter addresses exist. The Watcher and interface must avoid
  double-counting.
- **Timestamp ordering.** Block timestamps are non-decreasing rather than strictly
  increasing, so sub-second blocks can share one. Order by block number.

### Explicitly out of scope

No formal verification. No third-party audit. No governance. No cross-chain
operation. No support for venues beyond the implemented adapters. These are stated
as absences, not deferred promises.

---

## 6. Ground truth

Every failure mode in a project like this traces back to an assumed external fact.
Arc is days old, its ecosystem is moving, and most public writing about it is
secondary reporting. Nothing here is taken on trust.

Before any contract is written, produce a single ground-truth file recording each
external dependency, its value, the source, and the on-chain read or official
document that confirms it. Anything not in that file cannot appear as a constant
in the codebase.

### Already confirmed from Arc's documentation

Subject to the caveat below.

- Arc targets the Osaka EVM baseline, plus EIP-7708 from Amsterdam ahead of
  upstream
- USDC exposes a native interface at 18 decimals and an ERC-20 interface at 6,
  sharing one balance; divide native by 10^12 to display as USDC
- Minimum base fee is 20 Gwei; transactions below it are silently dropped by the
  mempool with no receipt and never appear in a block
- Base fee is paid to the block beneficiary rather than burned; the next block's
  base fee sits in the parent header's extra data
- Finality is deterministic on inclusion, so one confirmation is sufficient
- Gas deductions emit no log; derive gas cost from the transaction receipt
- Native value movements emit EIP-7708 Transfer logs from a system emitter; two
  emitter addresses exist, so indexers must avoid double-counting
- Blocklist is enforced at runtime; a reverting transfer still consumes gas
- Value transfers to the zero address, to precompiles, and to self-destructed
  accounts all revert
- `PREVRANDAO` always returns 0; no onchain randomness
- Blob transactions are rejected; `block.withdrawals` is always empty; the
  EIP-4788 beacon-roots contract is absent
- Block timestamps are non-decreasing rather than strictly increasing, so order by
  block number

### Still to verify by reading the chain

- **Network.** Mainnet and testnet chain IDs, RPC endpoints, explorer URLs.
- **Assets.** The USDC address on both networks, confirmed against the
  contract-addresses reference and the chain itself.
- **Lending venue.** Morpho's deployed address on Arc mainnet, confirmed by
  reading code at that address. Whether an instance exists on testnet; if not,
  deploy one for testnet work.
- **Market constraints.** Which interest rate models are enabled and which LLTV
  values are permitted. Market creation is permissionless in the loan asset,
  collateral asset and oracle, but not in these two.
- **Borrow demand.** Total borrow assets across Morpho's Arc markets, read
  directly and re-read weekly. This is the number that determines whether the
  engine has work to do, and it is not published anywhere. The trend matters more
  than the snapshot.
- **Swap venue.** Which DEX is deployed and whether any pool holds meaningful
  depth. If depth is absent, production operation is blocked until it exists, and
  that should be stated rather than worked around.
- **Measured gas.** Actual gas consumed per operation from a real deployment, not
  a figure from a blog post. Public numbers currently disagree with each other.

### Caveat on the documentation itself

The docs index still describes Arc as testnet-only and its changelog's newest
entry predates the September mainnet launch. The site lags the chain. Treat every
documented value as a starting point to verify against the chain, never as the
confirmation itself.

### Gate

Every entry confirmed by direct read or primary documentation, with the chain
taking precedence over the docs wherever they disagree.

---

## 7. Build phases and gates

Each phase ends in a falsifiable condition. Nothing proceeds until the gate
passes. The purpose of the gates is that each can kill or reshape the project
cheaply, before work is stacked on a wrong assumption.

**Phase 0 — Ground truth.** No code. Produce the verification file described
above, including the borrow-demand reading.
*Gate: every external value confirmed by direct read, with the chain overriding
the docs on any disagreement.*

**Phase 1 — Harness.** Use **Arc Foundry** (`circlefin/arc-foundry`), not stock
Foundry. Standard `anvil` runs a plain EVM and cannot reproduce Arc's semantics,
so a suite that passes under it proves nothing; `arc-anvil --network arc` is the
correct environment. Primary test environment is a fork of Arc mainnet rather than
a blank local chain. The first deliverable is a passing test that forks mainnet,
reads a real market's parameters, and asserts something non-trivial about them.
*Gate: that test passes in CI under arc-anvil.*

**Phase 2 — Vault.** ERC-4626 over USDC, built on a reviewed base implementation.
Correct accounting for capital in flight. Deposit cap and pause.
*Gate: invariant suite passes at high run count, including an explicit attempt at
the first-depositor attack.*

**Phase 3 — Engine.** The atomic cycle and the profitability invariant.
*Gate: on a mainnet fork, a real profitable liquidation succeeds and a marginal
one reverts with the expected reason.*

**Phase 4 — Adapters.** Lending and swap interfaces, with Morpho and DEX
implementations plus the fixed-price demonstration adapter.
*Gate: Engine tests pass unchanged against both swap implementations, proving the
abstraction holds.*

**Phase 5 — Watcher.** Three modes, shipped in order: observe, simulate, execute.
Do not skip to the third.
*Gate: simulate mode runs continuously against live mainnet for several days
without failure, and its predictions match fork simulation.*

**Phase 6 — Testnet.** Full deployment. Create the demonstration market, open a
position, move the oracle, liquidate. Record measured gas per operation.
*Gate: one complete cycle with transaction hashes, plus a gas table measured
rather than estimated. This is the decision point on mainnet spend.*

**Phase 7 — Mainnet.** Deploy, seed the demonstration market, execute both the
successful liquidation and the rejected marginal one.
*Gate: both transactions live on the explorer.*

**Phase 8 — The proof surface.** Six gated deliverables, specified in full in §9.1.
Everything before this phase is invisible; this is the phase that converts the
work into something a stranger can judge in thirty seconds. It gets the same rigor
as Phase 3, not less.
*Gate: all six sub-gates in §9.1 pass.*

---

## 8. Testing strategy

### Arc Foundry, then fork over mock

Stock Foundry's `anvil` simulates a standard EVM and cannot reproduce Arc's
value-transfer rules, dual-decimal USDC, fee floor or blocklist behavior. A green
suite under it is not evidence. Use `arc-anvil --network arc` from Circle's Arc
Foundry as the baseline environment.

Within that, the default is a fork of Arc mainnet. Fork tests run against real
deployed contracts, real state and real liquidity, locally and at no cost. They
are the only way to know an integration is correct rather than correct against an
imagined interface.

Mocks are permitted only where a fork genuinely cannot reach the thing being
tested, and each one carries a comment explaining why. A test suite that passes
entirely against mocks proves nothing about the deployed system.

### What counts as a test

A test asserts a specific state change or a specific revert reason. A test that
only confirms a call did not revert is not a test, and should be deleted rather
than kept for coverage.

### Invariant testing for the Vault

State the properties and let a fuzzer attack them rather than writing example
cases:

- Total assets and total shares remain consistent across any sequence of deposits,
  withdrawals and liquidations
- No sequence lets a depositor withdraw more than their proportional claim
- No external call changes share price without a realised profit or loss
- Share price never decreases except through a realised loss

### Negative tests are mandatory

Every safety property needs a test proving it fires, not merely one that passes
when nothing is wrong. At minimum:

- A liquidation profitable before gas and unprofitable after must revert
- A first-depositor inflation attempt must fail
- A reentrant call through the liquidation callback must fail
- A swap exceeding the slippage bound must revert
- A call against an unapproved venue must revert

### Coverage as a floor, not a goal

Path coverage on the Engine and Vault should be complete, but coverage is a check
that nothing is untested, not evidence that anything is correct. The negative
tests carry the actual assurance.

---

## 9. Deployment and demonstration

### The demonstration problem

Borrowing on Arc is days old. There may be no liquidatable position on the chain
for weeks. A liquidation engine that has never liquidated anything is difficult to
evaluate, so the demonstration has to be constructed rather than waited for.

Market creation on Morpho is permissionless in the loan asset, collateral asset
and oracle. So: deploy a collateral token, deploy an oracle whose price is
settable, create a market pairing USDC against that token using an enabled
interest rate model and an enabled LLTV, supply liquidity, open a position from a
second address, move the oracle price, and liquidate.

The market is isolated. Nothing done inside it touches any other market or any
other user.

### Testnet

Full sandbox. Faucet funds are free, so visitors can do everything: deposit, watch
share price, push the position underwater, trigger the liquidation. All
development and cost measurement happens here, and nothing is spent on mainnet
until the cycle is proven.

### Mainnet

The artifact. Two transactions matter: a successful liquidation, and a marginal
one rejected by the invariant. The second is more persuasive than the first,
because it demonstrates the safety property doing its job rather than merely not
getting in the way.

### Replayable demonstration

Because the demonstration market's oracle is under the deployment's control, the
loop can be made repeatable: expose a function that moves the price into
liquidatable territory, and one that resets the position afterward. A visitor can
then trigger a real mainnet liquidation for a few cents of gas and watch share
price move.

That is materially stronger than a page describing something that happened once.
It is the single interactive element worth building.

### Deposit policy

An unaudited contract holding other people's money is a real liability regardless
of the amount. Mainnet deposits stay closed or capped very low, with an unmissable
notice that this is unaudited demonstration software. Anyone wanting to try
depositing is pointed at testnet, where the experience is identical and the risk
is zero.

Stating that restriction plainly reads as judgment. An open vault soliciting funds
from a three-week-old codebase reads as the opposite.

---

## 9.1 Phase 8 — The proof surface

Everything in phases 0 through 7 is invisible. A reviewer opens one link and
decides in roughly thirty seconds whether this is real. This phase is not "build a
frontend"; it is the phase that converts seven phases of work into something a
stranger can judge quickly and verify independently. It carries the same weight as
the Engine phase.

Six deliverables, each with its own gate.

### 8a — The claim on the first screen

The page opens with the invariant stated in one sentence and the two transactions
that prove it, both linked to the explorer. No hero banner, no value proposition,
no scroll required.

*Gate: a reader who knows nothing about the project can state what it claims and
check it, without scrolling and without connecting a wallet.*

### 8b — The rejection, foregrounded

A successful liquidation is table stakes; every liquidation bot has one. The
differentiator is the invariant refusing to execute. Give the rejected transaction
equal or greater prominence, and show the arithmetic that produced it: gas
consumed, effective gas price, cost in native units, realised surplus, configured
margin, and the comparison that failed.

*Gate: the rejected transaction is as visible as the successful one, and its
arithmetic is displayed rather than asserted.*

### 8c — Replayable in both directions

Two controls. One moves the demonstration market's oracle into liquidatable
territory so any visitor can trigger a real mainnet liquidation for a few cents of
gas. The other configures a position deliberately too small to clear the cost
floor, so the visitor watches the invariant reject it live. Both reset cleanly
afterward.

The second control is the more valuable one. A visitor who watches the safety
property fire remembers what this project does.

*Gate: a stranger with a wallet and ten cents of USDC can run both paths end to
end, and the demonstration state returns to its starting condition.*

### 8d — The cost dataset

Every execution records measured gas per operation, converted to cents. Publish it
as a live table generated from on-chain data, with the methodology stated
explicitly: what was measured, what was excluded from the measurement, and what
the margin is sized to cover.

This is the deliverable with a life outside the project. Public figures for Arc
execution costs currently disagree with one another, and nobody has published
measured ones. A page that answers "what does this actually cost on Arc" becomes a
reference other people link to, independent of whether they care about
liquidations.

*Gate: the table is generated from chain data rather than typed, and the stated
methodology is precise enough for someone else to reproduce the numbers.*

### 8e — The written argument

Three short claims, each defensible:

- Why atomic composition removes the staking registry, slashing mechanism and
  timeout logic a multi-transaction design requires
- Why the profitability invariant is honest only on a chain where gas and profit
  share a unit, and what it would take to state it elsewhere
- What the 18-versus-6 decimal boundary cost to get right, with the test that
  proves it

Plus an explicit section on what the project does not do: unaudited, deposits
capped, demonstration market clearly marked, near-term utility limited by Arc's
current borrow volume.

*Gate: the limitations section exists and is specific rather than boilerplate.*

### 8f — Submission package

Live link, public repo with real commit history, a short description naming
exactly what the project uses Arc for, and a public builder profile.

*Gate: someone else reads the description and correctly restates what the project
does and why it requires Arc.*

### Constraints across the whole surface

- Loads and is fully legible with no wallet connected
- Works on a phone; reviewers skim on phones
- Every number links to the transaction that produced it
- The demonstration market is visibly marked wherever it appears
- A visible switch between mainnet and testnet views
- No claim appears on the page that cannot be checked on-chain

---

## 10. Operating rules for AI-assisted development

These exist to prevent a specific failure mode: code that is fluent,
well-structured, and wrong in ways that are invisible until it touches real money.
Keep them at the repository root where the coding agent reads them on every
session.

- **No invented values.** Every address, chain ID and parameter comes from the
  ground-truth file. If something is missing, stop and ask rather than producing a
  plausible-looking constant. A constant that looks right is worse than a blank,
  because nobody questions it.
- **No assumed interfaces.** Before integrating any external contract, fetch its
  actual source or ABI from the deployed address. Never write an interface from
  memory of what that protocol usually looks like. Protocol versions differ, and a
  V4 is not a V3.
- **Fork over mock.** If the real contract can be reached on a fork, use it. Every
  mock carries a comment explaining why a fork could not.
- **Tests assert behaviour.** No test that merely confirms absence of revert.
  Every test asserts a state change or a revert reason.
- **Negative tests before positive ones.** For any safety property, write the test
  that proves it fires before writing the code that makes it pass.
- **No silent failure.** No empty catch blocks, no swallowed errors, no unchecked
  return values, no unexplained try-catch around external calls.
- **No speculative generality.** Build the adapter interface because a second
  venue is planned. Do not build configuration, hooks or extension points for
  things nobody has asked for.
- **Done means gated.** A phase is complete when its gate passes, not when the
  code compiles.
- **One phase at a time.** The failure mode of handing over a long plan is that
  the agent races ahead and constructs four phases of scaffolding on top of
  assumptions from phase zero. Give it the current phase and the gate, nothing
  further.

### Install Circle's Arc skill first

Circle publishes a skills plugin covering chain config, RPC setup, contract
deployment, USDC bridging and gas in USDC. Install it before the first session so
the agent works from Circle's own guidance rather than from general EVM habits:

```
/plugin marketplace add circlefin/skills
/plugin install circle-skills@circle
```

Also worth reading before writing the Vault: Arc's porting-contracts checklist,
and the DeFi integration page covering decimal handling in pool math. Both address
the exact hazard this codebase is most exposed to.

---

## 11. Honest assessment against the judging criteria

The program scores four things: relevance to Arc, technical credibility, quality
of what was built, and whether the project is worth taking further. Promise counts
for more than traction.

**Relevance to Arc — strong.** The profitability invariant is not merely easier on
Arc, it is impossible to state honestly anywhere else. That is the difference
between a project deployed on Arc and a project that belongs on Arc, and it is the
criterion most submissions will be weakest on.

**Technical credibility — strong if executed as specified.** Atomic composition
with an enforced invariant, fork-based testing against live protocol state, and
explicit negative tests are the visible markers of someone who has shipped before.
The design argument for why the multi-transaction staking and slashing model was
unnecessary here demonstrates judgment rather than just implementation.

**Quality — depends entirely on discipline.** The scope is small enough to finish
properly, which is the only reliable route to this score. A finished small system
beats an ambitious partial one every time.

**Worth taking further — moderate, and this is the weak point.** Three honest
problems. Arc's credit markets are days old, so there is currently almost nothing
to liquidate and near-term utility is close to zero. The Aave market arrived with
Gauntlet, Steakhouse, Keyrock and Cumberland already involved in risk and
curation, so professional liquidators will appear quickly and this is a
competitive domain rather than an empty one. And liquidation is fee extraction,
which commoditises once volume justifies a professional operation.

The honest counter-argument, worth stating rather than hiding: the useful asset is
not the liquidation itself but the enforced-cost-floor pattern, which generalises
to any small-value automation on a chain where gas and value share a unit. Nobody
has published that pattern. The adapter interface and the measured cost data are
the parts most likely to outlive the specific application.

**Net.** This scores well on the two criteria that are hardest to fake and
acceptably on the third. The fourth is arguable in either direction, and arguing
it honestly is more persuasive than overclaiming.

---

## 12. Beyond the microgrant

### What production actually requires

The gap between a working demonstration and something that should hold other
people's money is large and should not be understated.

An independent audit, which is the non-negotiable one. Admin functions behind a
timelock. Per-market exposure limits so a single compromised venue cannot drain
the pool. A circuit breaker triggered by anomalous oracle movement. Watcher
redundancy, since a single operator is a single point of failure. Real liquidity
on the swap venue, verified rather than assumed. Monitoring and alerting on failed
liquidations, because a silent failure to liquidate is the failure mode that
matters most.

### Where it goes next

The adapter interface is the extension point. Aave V4 is the obvious second venue,
and its architecture differs enough from V3 that supporting it is genuine work
rather than a copy.

The more interesting direction is the cost-floor pattern itself. Any contract
performing small-value automated work on Arc faces the same problem this solves:
proving that execution cost does not exceed the value of the work. Publishing that
as a small library, with measured cost data behind it, is more broadly useful than
the liquidation engine and costs almost nothing extra given the work is already
done.

### Route to the Circle Grant Program

The microgrant is explicitly a route into the larger program, which funds the path
to production with milestone-based grants. The credible sequence is: prove the
mechanism works, publish measured data nobody else has, use ecosystem office hours
to find out what Arc's credit markets actually need, and apply with a specific
production milestone rather than a general ambition.

### Realistic framing

Arc's credit markets may take months to generate meaningful liquidation volume, or
they may not develop in a way that supports an independent operator at all. This
project is worth building on the assumption that being early and correct has
option value, not on the assumption that revenue follows shortly. Stating that
plainly is better than the alternative, and reviewers who have seen many
submissions will notice which one they are reading.

---

## Appendix: Arc platform reference

Everything below comes from Arc's own reference pages. It is recorded here so the
ground-truth file starts populated rather than empty, subject to the same caveat:
the chain overrides the docs wherever they disagree.

### Facts that change how this codebase is written

**A contract's USDC is its native balance.** On Arc, USDC held by a contract lives
in the account itself rather than as an entry in a token contract. Two
consequences. `SELFDESTRUCT` on a contract holding USDC moves that USDC to the
beneficiary, which is not how any other chain behaves. And the Vault's holdings
are a native balance, so its accounting should read them as such rather than
through the truncating ERC-20 view.

**Native USDC and ERC-20 USDC are one asset, not two.** Arc's documentation states
directly that a pool pairing them against each other is meaningless. Relevant if a
swap path is ever constructed programmatically rather than supplied.

**`SELFDESTRUCT` reverts in four cases**: the beneficiary is the contract itself
with a balance, the beneficiary is the zero address with a balance, either side is
blocklisted, or the beneficiary has already self-destructed and there is a
balance. A zero balance always succeeds. A successful self-destruct that moves
value emits a Transfer log from the system emitter.

**A non-zero-value call to a self-destructed account reverts**, where on Ethereum
it succeeds. Arc treats it as a forbidden burn. This is described in Arc's docs as
the largest semantic departure from Ethereum.

**These behave exactly as on Ethereum**, so no special handling is needed: EIP-7702
set-code transactions, `CREATE2` including EIP-7610 residual-storage behaviour,
and EIP-2935 historical block hashes. The EIP-2935 block-hash-history contract is
deployed and functional, unlike the EIP-4788 beacon-roots contract, which is
absent.

### Reference pages to read before the phase that needs them

- **Porting contracts to Arc** — the checklist to run against any existing
  contract before deploying it. Read before Phase 2.
- **DeFi and protocol operators** integration guide — USDC pool implementation and
  decimal handling in pool math. The page most directly aimed at the hazard this
  codebase is most exposed to.
- **Stablecoin native model** — the two-interface table, truncation behaviour, and
  EURC and USYC support.
- **USDC system events** — emitter addresses, log format and indexing guidance.
  Read before Phase 5.
- **Indexers and block explorers** guide — how to index EIP-7708 Transfer events
  without double-counting across the two emitters.
- **Relayers and paymasters** guide — USDC-denominated gas infrastructure and
  decimal precision in fee calculation. Closest existing guidance to the
  invariant's arithmetic.
- **Gas and fees**, **Stable fee design**, **Deterministic finality** — the three
  concept pages behind the thesis.

### Infrastructure to survey in Phase 0

Arc's tools section carries separate listings for node providers, data indexers,
oracles, account abstraction providers and compliance vendors. Two matter here:
the oracle listing, for the demonstration market's price source, and the indexer
listing, for the Watcher and interface.

The testnet explorer and Circle's faucet cover Phases 1 through 6 at no cost.

### Agent tooling

Beyond the skills plugin, Arc publishes an MCP server exposing its documentation
to coding agents, and an `llms.txt` index. Connecting both means the agent reads
Arc's current docs rather than working from general EVM knowledge, which is the
same failure this specification's operating rules exist to prevent.