# Arc Conditional Orders — UI build spec

Build the web interface. This document is the design system: tokens are exact, not
suggestions. Where a value is given, use that value.

Read `data/ground-truth.json` before writing code. Every address and number is verified there.
Never invent a value — if one is missing, stop and ask.

---

## 1. The product, in one paragraph

A trader approves a token and sets a trigger price. An unprivileged keeper watches; when price
crosses the trigger it **arms** the order, waits a dwell window of 2 blocks (~1 second on Arc),
re-checks, then fills — selling the token for USDC through Uniswap V4. If the fee would not
cover the gas, the fill reverts and nobody is paid. Gas on Arc is USDC, so cost and profit are
the same unit and the contract can enforce this without an oracle.

Live on Arc testnet:

| | |
|---|---|
| OrderBook | `0x55EC8907f937fEA942c5f98039a218708E965280` |
| Swap adapter | `0xbaaB5e17f572CC17BA3dCa8Ebf6089908873653f` |
| A real fill | `0x4e3998e43e9e67718b89171d5242dcae33f6687d43581391bac7382f8ab4545d` |
| Explorer | `https://explorer.testnet.arc.io` |

Arc mainnet chain 5042, testnet 5042002.

---

## 2. Concept

**"Instrument."** The aesthetic of precision measuring equipment — seismographs, tide gauges,
oscilloscopes — but *printed* rather than glowing. Ink on warm paper. Measured, tactile,
quietly confident. It is a financial tool that does not perform seriousness at you.

This is deliberately the opposite of standard DeFi: no dark slab, no neon, no glass. A warm
light interface with a vermilion accent will look unlike anything else in the category, and it
screenshots well, which matters more than people admit.

Three adjectives to design against: **measured, tactile, alert.**
Three to design away from: severe, playful, futuristic.

---

## 3. Colour tokens

Define as CSS custom properties on `:root`. Never hardcode a hex in a component.

### Light — "Paper" (default)

```css
--bone:          #F4F1E8;  /* page background */
--paper:         #FBF9F3;  /* raised surface, cards, inputs */
--paper-sunk:    #EDE9DE;  /* inset wells, table header, code */
--ink:           #17140F;  /* primary text */
--ink-2:         #5F574C;  /* secondary text, labels */
--ink-3:         #8C8275;  /* tertiary, placeholders, disabled */
--rule:          #DDD6C7;  /* borders, dividers */
--rule-strong:   #C3B9A5;  /* emphasised borders, focus rings */

--vermilion:     #DD4B1E;  /* primary accent: live, armed, CTA */
--vermilion-ink: #B03714;  /* text on tint, hover */
--vermilion-tint:#FBE8E0;

--pine:          #1F5C48;  /* filled, success, profitable */
--pine-tint:     #E2EFE9;

--brick:         #9E2B18;  /* refused, error, unprofitable */
--brick-tint:    #F7E4E0;

--ochre:         #B5821A;  /* stale, warning, keeper down */
--ochre-tint:    #FAF0DC;
```

### Dark — "Slate"

Not `#111`. A warm charcoal that reads as inked paper at night.

```css
--bone:          #16140F;
--paper:         #1F1C16;
--paper-sunk:    #12100C;
--ink:           #F2EDE2;
--ink-2:         #A99F90;
--ink-3:         #756C5E;
--rule:          #332E25;
--rule-strong:   #4A4337;

--vermilion:     #FF6B3D;
--vermilion-ink: #FF8A63;
--vermilion-tint:#33190F;

--pine:          #4FBF92;
--pine-tint:     #10241C;

--brick:         #E2603F;
--brick-tint:    #2B1410;

--ochre:         #E6B54A;
--ochre-tint:    #2A2110;
```

### Rules

- Colour carries meaning only. A surface is never coloured for decoration.
- Exactly one accent is visible per screen region. If two things are vermilion, one is wrong.
- **No gradients anywhere.** Not on buttons, not on backgrounds, not on text.
- **No shadows for depth.** Elevation is expressed with `--rule` borders and `--paper` vs
  `--bone`. One exception: a 0 1px 2px rgba(23,20,15,.06) on floating overlays only.
- Semantic mapping is fixed: vermilion = active/armed/attention, pine = filled/cleared,
  brick = refused/failed, ochre = stale/degraded.

---

## 4. Typography

Three families, all free, all loaded via `next/font/google` with `display: swap`.

| Role | Family | Use |
|---|---|---|
| Display | **Instrument Serif** | Page titles, hero numbers, quoted claims. Use the *italic* for emphasis — it has real character. |
| UI | **Instrument Sans** | All interface text, labels, buttons, body copy |
| Data | **IBM Plex Mono** | Every number, address, hash, tick, price |

**Never Inter.** Never a single family for everything.

### Scale — exact

```
display-xl   64px / 60px  Instrument Serif  400  -0.025em
display-l    44px / 46px  Instrument Serif  400  -0.02em
display-m    32px / 36px  Instrument Serif  400  -0.015em

heading-l    26px / 32px  Instrument Sans   500  -0.011em
heading-m    19px / 26px  Instrument Sans   500  -0.008em
heading-s    15px / 21px  Instrument Sans   600   0
label        11px / 14px  Instrument Sans   600   0.09em  UPPERCASE
body-l       17px / 27px  Instrument Sans   400   0
body         15px / 23px  Instrument Sans   400   0
body-s       13px / 19px  Instrument Sans   400   0

data-xl      40px / 42px  IBM Plex Mono     500  -0.02em
data-l       23px / 28px  IBM Plex Mono     500  -0.01em
data         14px / 20px  IBM Plex Mono     400   0
data-s       12px / 17px  IBM Plex Mono     400   0
```

### Number rules — non-negotiable

- `font-variant-numeric: tabular-nums` on **every** numeric element.
- Right-align numbers in tables. Align on the decimal point.
- A number that updates live must not change width. Pad, do not reflow.
- Addresses and hashes: first 6 and last 4, middle replaced with `…`, full value in `title`.
- Prices: significant digits, not fixed decimals. `0.00004128` not `0.0000`.
- USDC always shows 6 decimal places in data contexts, 2 in summary contexts.

---

## 5. Space, shape, grid

```
space: 2 4 8 12 16 20 24 32 40 56 72 96 128   (px)
radius-sharp: 2px    data surfaces, table cells, inputs
radius:       6px    cards, buttons
radius-pill:  999px  badges, status chips
border:       1px solid var(--rule)
```

**Do not apply one radius everywhere.** Data surfaces are sharp (2px); interactive controls are
soft (6px); status chips are pills. The mix is what stops it looking templated.

Grid: 12 columns, 72px max gutter, content max-width 1200px. Reading text max-width 68ch.
Breakpoints: 640 / 900 / 1200.

---

## 6. Components

Build these as a real component library in `src/components/ui/` before building screens.

**Button** — `primary` (vermilion fill, `--bone` text), `secondary` (paper fill, rule border),
`ghost` (text only), `danger` (brick). Heights 32 / 40 / 48. Padding-x 16 / 20 / 24.
Press state translates Y by 1px. No shadow, no gradient, no scale transform.

**Input / NumberField** — paper fill, 1px rule border, 2px radius, 40px tall. Focus: border
becomes `--ink`, plus a 2px `--vermilion-tint` outline offset 1px. Numeric inputs use the
data font. Every field has a persistent label above (11px label token), never a placeholder
as the only label.

**Card** — `--paper` on `--bone`, 1px rule, 6px radius, 20px padding. A card never has a
coloured background; state is shown by a 3px left border in the semantic colour.

**Table** — `--paper-sunk` header row, 11px uppercase label, 1px rule dividers, 40px rows,
hover row `--paper-sunk`. Numeric columns right-aligned in the data font. No zebra striping.

**StatusChip** — pill, 11px label, coloured tint background with the matching ink colour.
States: `WATCHING` (ink-2 on paper-sunk), `ARMED` (vermilion), `FILLED` (pine),
`REFUSED` (brick), `UNREADABLE` (ochre), `CANCELLED` (ink-3).

**TickScale** — the signature component. A horizontal rule representing a tick range, with the
current price as a filled marker and the trigger as a notched line. Used on market rows, in
the create form, and on every open order. This component *is* the brand.

**DepthBadge** — small pill showing measured impact: `$500 → 0 bps`. Ochre if impact > 100 bps,
brick if the pool failed its sell test.

**AddressLink / TxLink** — data font, truncated, external-link glyph, always href to the
explorer for the current network.

---

## 7. Motion — anime.js v4

Use **anime.js v4** (`import { animate, createTimeline, stagger, createSpring } from 'animejs'`)
for all non-trivial motion. CSS transitions only for hover/focus colour changes.

```
duration-instant  80ms    hover, focus
duration-quick   160ms    chip changes, toggles
duration-base    240ms    entrances, panels
duration-slow     420ms   state transitions that must be noticed
duration-story    900ms   scroll narrative beats

ease-standard  cubicBezier(.2,.8,.2,1)
ease-enter     cubicBezier(0,.7,.2,1)
ease-exit      cubicBezier(.5,0,.9,.3)
spring-block   createSpring({ stiffness: 140, damping: 16 })
```

Rules:
- Entrances stagger with `stagger(28)`. Never animate more than 8 items in sequence.
- A number changing value counts up with anime.js over `duration-quick`, tabular-nums held.
- The tick marker on `TickScale` eases along its rail with `ease-standard` — never teleports.
- `prefers-reduced-motion: reduce` disables all of it and jumps to final state. Required.
- Nothing loops forever except the keeper heartbeat dot (2s pulse, opacity only).

---

## 8. The two signature moments

**a. The arming counter — the only 3D.**

When an order arms, render the dwell window as blocks advancing: 2 cubes that fill in as blocks
are mined, in `react-three-fiber`. Orthographic camera, flat matte materials in `--ink` and
`--vermilion`, one soft directional light, no environment map, no bloom, no reflections. Each
block lands with `spring-block`. It is honest — those cubes are literally what the contract
counts — and it is the one place 3D appears. Do not put 3D anywhere else. Canvas ≤ 240px tall.

**b. The scroll narrative — landing page.**

Scrolling walks one order through its life. Four beats, driven by an anime.js timeline bound to
scroll progress (not scroll-jacked — the page scrolls normally):

1. **Set** — a TickScale draws in, trigger notch lands.
2. **Watch** — the price marker drifts toward the trigger, days compressed into the scroll.
3. **Arm** — marker crosses; the 3D blocks count 1, 2.
4. **Fill** — the order resolves, the arithmetic types out: proceeds, fee, gas, cleared.

The scroll *explains the product*. Must be skippable, must degrade to static under reduced
motion, must not hijack the scrollbar.

---

## 9. Screens

**Markets.** Table of curated pools. Columns: token, price, 24h, TickScale sparkline, depth
badge, action. The depth badge is unusual and it is the honest thing to show — a stop-loss on a
pool that cannot absorb the sale is worthless.

**Create order.** Two columns: form left, live preview right. The preview must show, before
signing:
- the TickScale with current price and the proposed trigger
- **the computed tick AND the price it converts back to.** This is the highest-risk input in
  the whole app; a decimals error must be visible before a signature.
- estimated proceeds after the pool fee
- whether the order clears the cost floor. If not, say so here — not after a keeper silently
  ignores it.

**Orders.** The centrepiece. Live cards: `WATCHING → ARMING (n/2) → FILLED`, with
`POOL UNREADABLE` as its own visible state, never hidden. A filled order expands to show the
arithmetic: proceeds, fee, gas used, gas cost, margin, and the tx link.

**Proof.** The real transactions with their arithmetic, the measured gas table, and **live
keeper status** — last seen block, ochre if stale, brick if down. A stop-loss that silently
does not fire is worse than none, so keeper health is a first-class element, never a footer.

---

## 10. Honesty requirements

Credibility here comes from saying what is true, including the unflattering parts.

- **Unaudited.** Visible where someone is about to sign, not in a footer.
- **Fills depend on a keeper running.** Say it, and show whether one is.
- **Mainnet is capped** by `maxOrderValueUsdc` / `maxTotalValueUsdc`. Read them on-chain and
  display live values — never hardcoded text.
- **Slippage on thin pools is real.** That is what the depth badge is for.
- Every number links to the transaction or contract that produced it.
- No claim on the page that cannot be checked on-chain.

---

## 11. Do not build

- purple/blue gradient hero, glassmorphism, glowing borders, neon
- emoji in headings
- copy like "Elevate your trading", "Seamlessly", "Powered by cutting-edge", "The future of"
- Inter; a single font family; 16px everything; one radius on every surface
- three equal feature cards with generic line icons
- fake testimonials, fake logos, invented metrics, fake activity tickers
- animated gradient backgrounds, floating blobs, particle fields, aurora
- box-shadows for elevation
- a dark theme that is `#111` plus white text
- 3D anywhere except the arming counter

---

## 12. Technical

- Next.js App Router, TypeScript, Tailwind configured **from the tokens above** (extend theme;
  do not use default Tailwind palette or spacing).
- `viem` + `wagmi`. Arc chain config already exists in `src/lib/chain.ts`.
- ABIs in `src/keeper/abi.ts`. Order state comes from `checkOrders(uint256[])`, returning a
  `TriggerState` per order — `PoolUnreadable` is its own value and must surface in the UI.
- USDC ERC-20 view (6dp) for balances and display. Native 18dp **only** for gas math. Never add
  or display the two together: one balance, two interfaces, mixing them is wrong by 10^12.
- Testnet is the full sandbox and gets the polished path; mainnet is capped and real. Network
  switch always visible.
- Works with no wallet connected. Works on a phone. Light and dark both complete.
