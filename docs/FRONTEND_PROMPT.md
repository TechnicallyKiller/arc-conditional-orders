Build the web interface for **Arc Conditional Orders** — stop-loss, take-profit and limit
orders for spot traders on Arc, settled by a contract that proves on-chain that the fee it
charged exceeded the gas it burned.

Read `data/ground-truth.json` first. Every address, number and claim below is verified there.
Do not invent values; if something is missing, stop and ask.

## What the product actually is

A trader approves their token to an OrderBook and sets a trigger price. An unprivileged keeper
watches; when the trigger is hit it **arms** the order, waits out a dwell window of a few
blocks, re-checks, then fills — selling the token for USDC through Uniswap V4. If the fee
wouldn't cover the gas, the fill reverts and nobody is paid.

Live on Arc testnet now:
- OrderBook `0x55EC8907f937fEA942c5f98039a218708E965280`
- Swap adapter `0xbaaB5e17f572CC17BA3dCa8Ebf6089908873653f`
- A real fill: `0x4e3998e43e9e67718b89171d5242dcae33f6687d43581391bac7382f8ab4545d`
- Explorer: `https://explorer.testnet.arc.io`

Arc mainnet chain id 5042, testnet 5042002. USDC is the native gas token.

## The four screens

**1. Markets.** Curated pools only. Live price, 24h change, and a **depth badge** showing the
measured impact of a real order ("$500 → 0 bps impact"). The badge is unusual and it is the
honest thing to show: a stop-loss on a pool that cannot absorb the sale is worthless.

**2. Create order.** Direction (stop-loss / take-profit), amount, trigger price. Must show
live, before signing:
- trigger vs current price, and the distance between them
- **the computed tick AND the price it converts back to** — so a decimals mistake is visible
  before the user signs. This is the highest-risk input in the app.
- estimated proceeds after the pool fee
- whether the order is large enough to clear the cost floor. If it isn't, say so *here*, not
  after a keeper silently ignores it.

**3. My orders — the centrepiece.** Three live states:
`WATCHING → ARMING (n/2 blocks) → FILLED`
Plus `POOL UNREADABLE` as its own visible state, never hidden. Each filled order shows the
arithmetic: proceeds, fee, gas used, gas cost, and whether it cleared.

**4. Proof.** The real transactions, the measured gas table, and **live keeper status** (last
seen block, red if stale). A stop-loss that silently doesn't fire is worse than none, so the
keeper's health is a first-class UI element, not a footer note.

## Design direction

The visual anchor is **the tick**. Uniswap V4 prices are discrete integers, and this entire
product is "watch a number cross a line." Build the identity from that: a tick scale, a
threshold, a marker moving along it. Precision-instrument, not crypto-startup.

**3D, used once, meaningfully.** During `ARMING`, render the dwell window as blocks advancing —
blocks are literally what the contract is counting. Real mechanism made visible, not decoration.
`react-three-fiber`. One scene. Do not put 3D anywhere else.

**Scroll animation with a job.** On the landing page, scrolling walks through a single order's
life: price drifts toward the trigger, arms, fills. The scroll *explains the product*. No
parallax for its own sake, no scroll-jacking, and it must be skippable.

**Typography.** IBM Plex Sans + IBM Plex Mono, or Geist + Geist Mono. Every number is monospaced
with tabular figures and aligned on the decimal — this is a financial instrument and numbers
that jitter as they update look broken.

**Palette.** One restrained accent plus near-neutral surfaces. Colour carries meaning only:
armed, filled, refused, stale. Not decoration.

## Do not build

These are the patterns that make something look machine-generated. Avoid all of them:
- purple/blue gradient hero, glassmorphism cards, glowing borders
- emoji in headings, "🚀", "✨"
- copy like "Elevate your trading" / "Seamlessly" / "Powered by cutting-edge"
- Inter as the only font, 16px everything, uniform 8px radius on every surface
- three equal feature cards with generic line icons
- fake testimonials, fake logos, invented metrics
- animated gradient backgrounds, floating blobs, particle fields
- a dark theme that is just #111 with white text and no hierarchy

## Non-negotiable honesty

The project's credibility comes from saying what is true, including the unflattering parts:
- **Unaudited.** State it where someone about to sign can see it, not in a footer.
- **Fills depend on a keeper running.** Say so, and show whether it is.
- **Mainnet is capped** by `maxOrderValueUsdc` / `maxTotalValueUsdc`, readable on-chain. Show
  the live values, not hardcoded text.
- **Slippage on thin pools is real.** The depth badge exists for this.
- Every number on the page links to the transaction or contract that produced it.
- No claim that cannot be checked on-chain.

## Technical

- Next.js App Router + TypeScript, `viem` + `wagmi`. Arc chain config is in `src/lib/chain.ts`.
- Reuse the ABIs in `src/keeper/abi.ts`. Order state comes from `checkOrders(uint256[])`, which
  returns a `TriggerState` per order — `PoolUnreadable` is its own value and must surface.
- Read the USDC ERC-20 view (6dp) for balances and display. Native 18dp is ONLY for gas math.
  Never add or show the two together — they are one balance behind two interfaces, and mixing
  them is wrong by a factor of 10^12.
- Testnet is the full sandbox and must be the polished path; mainnet is capped and real.
  A visible network switch, always.
- Works with no wallet connected. Works on a phone.
