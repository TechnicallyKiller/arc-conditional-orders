# Ship to Arc mainnet

Everything that does not cost money is already done. This is the sequence to run once the
wallet is funded. Measured cost of the whole thing: **well under 3 USDC**.

## 0. Before anything: rotate the Privy app secret

`.env.example` is a tracked file and it contained a real Privy **app secret**, which is
therefore in git history (commit `cfad8ac` and earlier). The secret is unused in code and
never reached the built bundle, but the grant requires a **public** repo.

- Rotate it in the Privy dashboard. Do this even if history is rewritten — assume it leaked.
- The app only ever needs `NEXT_PUBLIC_PRIVY_APP_ID`, which is public by design.

## 1. Fund two addresses

| Address | Why | Amount |
|---|---|---|
| deployer (`PRIVATE_KEY`) | one-off deploy | ~0.07 USDC + margin |
| keeper (`KEEPER_PRIVATE_KEY`) | arms and fills, forever | 1–2 USDC |

Current keeper address: `0x364EDC06254874e62FF4AD8fA4d9a45238cb5609` — held **0 USDC** on
mainnet at last check.

## 2. Set the exposure caps

In `.env`, USDC 6dp. These bind on **realised proceeds** of a fill, not on the input, so they
are exact without a price oracle. The mainnet script refuses to deploy if either is 0.

```
MAX_ORDER_USDC=25000000     # 25 USDC per fill
MAX_TOTAL_USDC=250000000    # 250 USDC cumulative, ever
```

Start small. The owner can raise them afterwards with `setCaps()`; they cannot be raised by
anyone else.

## 3. Preflight

```bash
npx tsx tools/preflight.ts
```

Refuses to pass unless: chain is 5042, the RPC survives a 24-request burst without rate
limiting, the PoolManager and Multicall3 have code, gas is above Arc's 20 gwei floor, both
wallets are funded, and both caps are set. It exits non-zero on any failure.

## 4. Deploy

```bash
export PATH="$HOME/.arc-foundry/bin:$PATH"    # stock Foundry CANNOT execute Arc's USDC precompile
forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url https://rpc.mainnet.arc.io --broadcast
```

The script asserts chain 5042, requires non-zero caps, and reads the caps and owner **back
off the deployed bytecode** before it prints the addresses. Copy `ORDER_BOOK` and
`SWAP_ADAPTER` into `.env`.

## 5. Verify the deployment

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

- [ ] Live mainnet deployment, with a link
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
