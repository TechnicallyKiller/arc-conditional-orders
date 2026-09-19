# Arc Conditional Orders

Stop-loss, take-profit, limit and time-sliced orders for spot traders on
[Arc](https://arc.io) — settled by a contract that proves on-chain that the fee it charged
exceeded the gas it burned.

> **Status: early.** Phases 0–2 complete, 14/14 tests passing against an Arc mainnet fork.
> Unaudited. Not deployed. Do not put money in this.

## Why

An Arc trader today has one tool: a market swap. There is no way to say *"sell if this falls
30%"* — against ~550,000 swaps a day and ~2,600 new pools a day. Nothing on Arc offers
conditional orders on spot AMM pools.

On-chain stop-losses are a dead idea almost everywhere, because executing one on a small
position costs more gas than the position is worth. On Arc, gas is USDC and a fill costs a
fraction of a cent — so the executor can enforce its own profitability as a contract invariant
instead of an off-chain heuristic. That claim is only honest on a chain where gas and profit
share a unit.

## The invariant

[`CostFloor`](contracts/CostFloor.sol) computes what a call actually cost, including what
`gasleft()` cannot observe:

```
cost = (gasConsumed + 21000 + calldataBytes*16 + settlementOverhead) * tx.gasprice
```

Intrinsic gas and calldata come from the EVM's own rules rather than a hand-tuned margin, so
the floor is checkable by reading the contract rather than by trusting the operator.

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

## Ground truth

Every address and parameter used by this codebase is recorded in
[data/ground-truth.json](data/ground-truth.json) with the on-chain read that confirmed it,
verified 2026-09-19. Nothing may appear as a constant in the code without an entry there.
The chain overrides the documentation wherever they disagree — and they do: Arc's own
`llms.txt` still says "testnet only" while mainnet is at block 21.6M.

Three Arc behaviours that change how contracts are written here:

1. **A USDC ERC-20 transfer moves native value** — any contract receiving USDC needs a payable
   `receive()` or the transfer reverts.
2. **The ERC-20 view reads the native balance** — a test contract we never funded reported
   79,228,162,514,264,337 (Foundry's default 2⁹⁶−1 wei / 10¹²). Measure deltas, never absolute
   balances.
3. **Native is 18dp, ERC-20 is 6dp, one balance** — mixing them is wrong by a factor of 10¹²,
   and in one direction it silently passes everything.

## Layout

| Path | What |
| --- | --- |
| [contracts/CostFloor.sol](contracts/CostFloor.sol) | The invariant. Stateless, reusable |
| [contracts/ArcGroundTruth.sol](contracts/ArcGroundTruth.sol) | Constants, all traceable to the ground-truth file |
| [contracts/interfaces/IMorpho.sol](contracts/interfaces/IMorpho.sol) | Transcribed from selectors in the deployed bytecode, not from memory |
| [test/CostFloor.t.sol](test/CostFloor.t.sol) | Negative tests first |
| [test/ArcFork.t.sol](test/ArcFork.t.sol) | Mainnet fork: real market, real flash loan |

## License

MIT
