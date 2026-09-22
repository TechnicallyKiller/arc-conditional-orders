# Ship to Arc mainnet

## Live on mainnet

Deployed 2026-09-22 from the post-audit contracts. Cost: **0.0650 USDC**.

```
ORDER_BOOK   0x9872b13257E958c2F7E4DcCc3F96b3C70c8e050c
SWAP_ADAPTER 0x0F1bf92EE0C79F7Ca5C1e30E9412aD5BFF45c7C8
```

Verified on-chain after deployment: owner and feeRecipient are the keeper address,
`routerAllowed(adapter)` is true, caps are 10 USDC per fill and 100 USDC cumulative,
`feeBps` 50 against a `MAX_FEE_BPS` of 200, dwell 2 blocks, arm age 300 blocks.

Deployer, owner, feeRecipient and keeper are deliberately the same address: it is the only
funded wallet, and it is also the only configuration in which the keeper is profitable, since
the fee accrues to `feeRecipient`. Note `owner` has no transfer path - it is fixed for the life
of the contract.

Steps 1-5 below are **done**. Steps 0, 6, 7 and 8 remain.

## Security status

A twelve-agent adversarial audit (Pashov Audit Group skills) ran against this codebase and
found twelve issues, two of which were fund-loss. All blockers are fixed and each has a
regression test that fails against the previous code:

| # | Issue | Status |
|---|---|---|
| 1 | `execute` forwarded keeper-authored calldata — the fill pool need not be the pool whose tick authorised it | **fixed** — the call is built in-contract from the order |
| 2 | `armOrder` reset the dwell clock, so anyone could keep any order unfillable for ~$7/hour | **fixed** — a live arm is never overwritten |
| 3 | `createOrder` accepted `minAmountOut == 0`, and the UI always passed it | **fixed** — rejected on-chain, UI derives a 1% floor |
| 5 | `balanceBefore` sampled before the input was pulled | **fixed** — snapshot moved, and `tokenIn == TOKEN_OUT` rejected |
| 7 | Slippage bound checked on gross while the trader is paid net | **fixed** — fee computed first |
| 8 | `feeBps` unbounded and retroactive | **fixed** — `MAX_FEE_BPS = 200` |

**Still open, and deliberately not fixed in this pass** — none block a capped deployment, but
know them before raising the caps:

- `totalFilledUsdc` is a monotonic lifetime counter, so the exposure cap bricks the book once
  reached rather than bounding concurrent exposure. Recovery is owner-only via `setCaps`.
- `_check` omits the caps and the cost floor, so `checkOrders` can return `Ready` for an order
  that will deterministically revert.
- The fee accrues to `feeRecipient` while gas is paid by `msg.sender`, so no third-party keeper
  is profitable — order liveness depends on the operator's own keeper staying up.
- `armedTick` is written and never read: the dwell proves the trigger was true at two separate
  instants, not that it held between them.

Full reports: [x-ray/x-ray.md](x-ray/x-ray.md), [x-ray/invariants.md](x-ray/invariants.md).

## 0. Before anything: rotate the Privy app secret

`.env.example` is a tracked file and it contained a real Privy **app secret**, which is
therefore in git history (commit `cfad8ac` and earlier). The secret is unused in code and
never reached the built bundle, but the grant requires a **public** repo.

- Rotate it in the Privy dashboard. Do this even if history is rewritten — assume it leaked.
- The app only ever needs `NEXT_PUBLIC_PRIVY_APP_ID`, which is public by design.

## 1. Fund the wallet — DONE

`0x364EDC06254874e62FF4AD8fA4d9a45238cb5609` serves as deployer, owner, feeRecipient and
keeper. Funded with 4 USDC; **3.935 USDC remains** after deployment.

## 2. Set the exposure caps — DONE

In `.env`, USDC 6dp. These bind on **realised proceeds** of a fill, not on the input, so they
are exact without a price oracle. The mainnet script refuses to deploy if either is 0.

```
MAX_ORDER_USDC=10000000     # 10 USDC per fill      (deployed value)
MAX_TOTAL_USDC=100000000    # 100 USDC cumulative   (deployed value)
```

Start small. The owner can raise them afterwards with `setCaps()`; they cannot be raised by
anyone else.

## 3. Preflight — DONE (re-run any time; it is read-only)

```bash
npx tsx tools/preflight.ts
```

Refuses to pass unless: chain is 5042, the RPC survives a 24-request burst without rate
limiting, the PoolManager and Multicall3 have code, gas is above Arc's 20 gwei floor, both
wallets are funded, and both caps are set. It exits non-zero on any failure.

## 4. Deploy — DONE

```bash
export PATH="$HOME/.arc-foundry/bin:$PATH"    # stock Foundry CANNOT execute Arc's USDC precompile
forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url https://rpc.mainnet.arc.io --broadcast
```

The script asserts chain 5042, requires non-zero caps, and reads the caps and owner **back
off the deployed bytecode** before it prints the addresses. Copy `ORDER_BOOK` and
`SWAP_ADAPTER` into `.env`.

## 5. Verify the deployment — DONE

```bash
npx tsx tools/preflight.ts      # now also checks the live contract's caps and owner
```

## 6. Start the keeper

```bash
RPC_URL=https://rpc.mainnet.arc.io npm run keeper observe
```

Watch a few ticks. `observe` touches nothing. Then `simulate` (prices fills against gas,
sends nothing), then `execute`.

Host it somewhere that does not sleep. Oracle Cloud's always-free tier works. **Do not use a
free tier that spins down idle services** — a keeper that sleeps is the exact failure this
codebase is built to prevent.

## 7. Frontend

Point `app/lib/clients.ts` at mainnet and rebuild. Mainnet pools must be read over the
mainnet RPC — reading them over the testnet RPC returns nothing, which previously looked
like empty pools rather than a misconfiguration.

## 8. Submission checklist (Arc Microgrants, closes 14 Oct 2026, rolling review)

- [x] Live mainnet deployment — `0x9872b13257E958c2F7E4DcCc3F96b3C70c8e050c`
- [ ] Public repo — **only after the Privy secret is rotated**
- [ ] Short description: what it does and what it uses Arc for
- [ ] Public builder profile (GitHub / X / Farcaster)

Reviews are rolling and earlier submissions get earlier answers. There is no reason to wait
for the deadline.

## What this is, for the description

A conditional execution engine for Uniswap v4 pools on Arc. An order names a pool, a tick
threshold and a direction; a keeper arms it, waits out a dwell period so a single-block price
move cannot trigger it, then fills. `CostFloor` proves **on-chain** that the fee collected
exceeded the gas burned producing it — an invariant that is only meaningful on a chain where
gas and value are the same asset.
