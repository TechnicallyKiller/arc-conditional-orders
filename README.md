# Arc Conditional Orders

A conditional execution engine for Uniswap v4 pools on [Arc](https://arc.io). An order names a
pool, a tick threshold and a direction. A keeper observes the trigger in one block, waits out a
dwell period, and fills in a later one — and the contract proves on-chain that the fee it
collected exceeded the gas that fill burned.

> **Status: live on Arc mainnet.** 71 tests passing against an Arc mainnet fork.
> Hardened against an adversarial review before deployment — two fund-loss issues found and
> fixed, see [Security](#security). Exposure is capped on-chain at 10 USDC per fill and
> 100 USDC cumulative.

## Live on Arc mainnet

| | |
| --- | --- |
| OrderBook | [`0x9872b13257E958c2F7E4DcCc3F96b3C70c8e050c`](https://explorer.arc.io/address/0x9872b13257E958c2F7E4DcCc3F96b3C70c8e050c) |
| Swap adapter | [`0x0F1bf92EE0C79F7Ca5C1e30E9412aD5BFF45c7C8`](https://explorer.arc.io/address/0x0F1bf92EE0C79F7Ca5C1e30E9412aD5BFF45c7C8) |
| Chain | 5042 · deployed 2026-09-22 · cost 0.0650 USDC |

Configuration read back off the deployed bytecode, not taken from the constructor arguments:
`routerAllowed(adapter)` true, `feeBps` 50 against a `MAX_FEE_BPS` of 200, `minDwellBlocks` 2,
`maxArmAgeBlocks` 300, caps 10 / 100 USDC.

## What it does, demonstrated

The interactive demo runs on **Arc testnet**, because it needs a faucet token and a seeded pool
that deliberately do not exist on mainnet.

| | |
| --- | --- |
| OrderBook (testnet) | [`0xEe22D840289d4a94B0E1Efd7A072854a74ED489C`](https://explorer.testnet.arc.io/address/0xEe22D840289d4a94B0E1Efd7A072854a74ED489C) |
| **Fill** | [`0xe6b66031…`](https://explorer.testnet.arc.io/tx/0xe6b66031b1cd20b8ebe3a63aaa7cc5ad788a1484c6361f8a8afe1788301e48af) |
| Arm | [`0x5d726af9…`](https://explorer.testnet.arc.io/tx/0x5d726af9d03c69f5357ebf218029be434928dc4cd5ece3a8b115fca1e3cea1b9) |

**The fill:** 1.934340 USDC out, 0.009671 USDC fee at 50bps, 238,700 gas at 25 Gwei
= 0.005968 USDC of gas. Keeper margin +0.003703 USDC, 1.6×.

**The refusal is the better demonstration.** A second order produced 0.016998 USDC, so a 0.5%
fee of 0.000084 USDC against 0.008065 USDC of gas — a loss of 0.007981 USDC. The keeper refused
it, and `CostFloor` would have reverted it on-chain had it been submitted anyway. That order is
left permanently armed, so a visitor watches the invariant hold rather than a screenshot of it
having held. A system that only ever succeeds proves nothing about its safety property.

## Why this is an Arc protocol and not a port

On-chain conditional orders are a dead idea almost everywhere, because executing one costs more
gas than a small position is worth, and the executor's profitability can only be estimated
off-chain — gas is denominated in the chain's native asset, proceeds in the traded one, and
comparing them needs a price oracle and carries basis risk.

On Arc, **gas is USDC and proceeds are USDC**. The comparison becomes arithmetic on two numbers
the EVM already exposes, so the executor can enforce its own profitability as a *contract
invariant* rather than a heuristic. That claim is not portable; it is only honest on a chain
where gas and value share a unit.

## The invariant

[`CostFloor`](contracts/CostFloor.sol) computes what a call actually cost, including what
`gasleft()` cannot observe:

```
cost = (gasConsumed + 21000 + calldataBytes*16 + settlementOverhead) * tx.gasprice
```

Intrinsic gas and calldata come from the EVM's own rules rather than a hand-tuned margin, so the
floor is checkable by reading the contract rather than by trusting the operator.

## Defeating single-block manipulation

The trigger is a Uniswap v4 tick, which is manipulable within a transaction. `armOrder` records
that the trigger held; `execute` re-derives it from the pool and requires the observation to be
at least `minDwellBlocks` old and no more than `maxArmAgeBlocks` old. A spike-and-revert inside
one transaction cannot satisfy both, because they must land in different blocks.

A live arm can never be overwritten — an earlier version let anyone re-arm and push the dwell
deadline forward indefinitely, which is [finding 2](#security).

## Security

The contracts went through an adversarial review before the mainnet deployment, run as a
structured pass over each contract from a different attacker's angle — arithmetic, access
control, economics, execution order, invariants, and the seams between them.

It surfaced twelve issues. Two could have cost user funds, and neither was visible from the
test suite, which passed throughout. All are fixed, and each fix carries a regression test that
fails against the previous code:

| Issue | Fix |
| --- | --- |
| `execute` forwarded caller-authored calldata, so the pool whose tick authorised a fill need not be the pool that filled it | The router call is built in-contract from `o.key`, `o.amountIn` and `address(this)` |
| `armOrder` reset the dwell clock on every call, letting anyone keep any order unfillable | A live, non-stale arm is never overwritten |
| `createOrder` accepted `minAmountOut == 0`, and the frontend always passed it | Rejected on-chain; the UI derives a 1% floor from its own quote |
| The output balance was snapshotted before the input was pulled in | Snapshot moved, and `tokenIn == TOKEN_OUT` rejected |
| The slippage bound was checked on gross proceeds while the trader is paid net | Fee computed first; the bound binds on what the trader receives |
| `feeBps` was unbounded and applied retroactively to signed orders | `MAX_FEE_BPS = 200`, enforced in the setter and the constructor |

Threat model and invariant map: [x-ray/x-ray.md](x-ray/x-ray.md),
[x-ray/invariants.md](x-ray/invariants.md).

No formal verification and no stateful fuzzing yet. Automated review cannot establish the
absence of vulnerabilities, which is why exposure is capped on-chain.

### Known limitations

- **The keeper is operator-run, not permissionless.** The fee accrues to `feeRecipient` while gas
  is paid by `msg.sender`, so an independent keeper loses money on every fill.
- **`totalFilledUsdc` never decreases**, so the cumulative cap bounds lifetime throughput rather
  than concurrent exposure; once reached, fills stop until the owner raises it.
- **`checkOrders` can return `Ready` for an order that will revert** — the view omits the caps
  and the cost floor that `execute` enforces.
- **`owner` has no transfer path**, and `armedTick` is recorded but never read: the dwell proves
  the trigger was true at two instants, not that it held between them.

## Running the tests

**Stock Foundry cannot run this suite.** Arc's USDC at `0x3600…` delegates to a precompile at
`0x1800…`; stock Foundry returns `OpcodeNotFound` and every test that moves USDC fails. Worse,
read-only tests still pass — so a suite that only reads goes green and proves nothing.

```bash
# Arc Foundry, not stock Foundry
curl -sL https://github.com/circlefin/arc-foundry/releases/download/v0.8.0-2/arc-foundry-v0.8.0-2-x86_64-unknown-linux-gnu.tar.gz \
  | tar xz -C ~/.arc-foundry/bin
export PATH=$HOME/.arc-foundry/bin:$PATH

forge install foundry-rs/forge-std --no-git
forge test
```

`network = "arc"` is pinned in [foundry.toml](foundry.toml) so the flag cannot be forgotten.
Before deploying anywhere, `npx tsx tools/preflight.ts` checks the chain, the RPC's behaviour
under load, the dependencies' bytecode, the gas floor, both balances and both caps — and exits
non-zero rather than returning a default on any failure.

## Ground truth

Every address and parameter used by this codebase is recorded in
[data/ground-truth.json](data/ground-truth.json) with the on-chain read that confirmed it.
Nothing may appear as a constant in the code without an entry there. The chain overrides the
documentation wherever they disagree — and they do.

Four Arc behaviours that changed how these contracts are written:

1. **A USDC ERC-20 transfer moves native value** — any contract receiving USDC needs a payable
   `receive()` or the transfer reverts.
2. **The ERC-20 view reads the native balance** — a test contract we never funded reported
   79,228,162,514,264,337 (Foundry's default 2⁹⁶−1 wei / 10¹²). Measure deltas, never absolute
   balances.
3. **Native is 18dp, ERC-20 is 6dp, one balance** — mixing them is wrong by a factor of 10¹²,
   and in one direction it silently passes everything. This one bit: an early depth measurement
   reported "0 bps impact" because a swap labelled `$50` moved 0.000001 USDC.
4. **The public RPC returns HTTP 429 under load.** Code that swallows that and returns an empty
   result reports "nothing found" with total confidence. Every client here retries with backoff
   and fails loudly.

## Layout

| Path | What |
| --- | --- |
| [contracts/CostFloor.sol](contracts/CostFloor.sol) | The invariant. Stateless, reusable |
| [contracts/OrderBook.sol](contracts/OrderBook.sol) | Order lifecycle, arm/dwell, caps, fee |
| [contracts/adapters/V4SwapAdapter.sol](contracts/adapters/V4SwapAdapter.sol) | Uniswap v4 swap, settled against transient deltas |
| [contracts/libraries/V4Price.sol](contracts/libraries/V4Price.sol) | Tick reads that distinguish "unreadable" from "not triggered" |
| [tools/preflight.ts](tools/preflight.ts) | Refuses to let a broken deployment happen |
| [x-ray/](x-ray/) | Threat model, invariant map, entry-point map |
| [SHIP.md](SHIP.md) | The deployment runbook, with what is done and what remains |

## License

MIT
