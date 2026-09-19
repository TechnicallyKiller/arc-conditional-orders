# Landing page — build spec

Inherits the full design system in `FRONTEND_PROMPT.md`. Tokens, fonts, motion scale and the
do-not-build list all apply unchanged. This document covers structure and copy only.

**The job of this page:** a stranger arrives knowing nothing and decides in thirty seconds
whether this is real. It is not a marketing page. It is an evidence page that happens to be
beautiful.

Copy below is written to be used close to verbatim. Do not rewrite it into marketing language.

---

## Rules for every word on this page

- Specific numbers beat adjectives. "0.0088 USDC of gas" not "incredibly cheap".
- Sentences under 20 words. No sentence contains "seamlessly", "effortlessly" or "simply".
- Never "the future of", "revolutionising", "unlock", "empower", "elevate", "supercharge".
- No exclamation marks. No emoji. No rhetorical questions as headings.
- Every number on this page is a link to the transaction or contract that produced it.
- If a sentence would still be true about a different product, cut it.

---

## Section 1 — Hero

No nav bloat: logo, three links (App, How it works, GitHub), network chip. That's it.

Above the fold, with no scrolling, a reader must get the claim and be able to check it.

**H1** (`display-xl`, Instrument Serif):
> Set your exit. Stop watching.

**Sub** (`body-l`, max 60ch, `--ink-2`):
> Stop-loss and take-profit orders for Arc. Non-custodial — your tokens stay in your wallet
> until a fill. The contract refuses any fill whose fee cannot cover its own gas.

**Right of the copy:** a live `TickScale` showing a real order on Arc testnet — current price,
trigger notch, current state chip. Real data from `checkOrders`, not a mock. If nothing is
live, show the most recent filled order instead, labelled with its timestamp.

**Two buttons:** `Try it on testnet` (primary, vermilion) · `Read the contract` (secondary).

**Directly beneath, one line, `data-s`:** two transaction links, side by side, labelled:

```
A fill      10.297301 USDC out · 0.051486 fee · 0.008784 gas     0x4e3998e4…
A refusal   0.396122 USDC out · fee 0.001980 < gas 0.012829      0x6c6f3582…
```

Give the refusal equal weight. It is the more persuasive of the two and most visitors will not
expect to see a product advertising something it declined to do.

---

## Section 2 — The scroll narrative

The anime.js scroll sequence from the design system, four beats, full viewport each. Left side
holds the animation, right side holds one short line of text per beat.

1. **Set** — `You choose a price.` The TickScale draws in; the trigger notch lands.
2. **Watch** — `Anyone can watch. Nobody can touch your tokens.` Marker drifts toward trigger.
3. **Arm** — `The trigger has to hold across blocks.` The 3D cubes count 1, 2.
4. **Fill** — `It sells, and proves it was worth doing.` The arithmetic types out.

Under beat 3, in `body-s`, `--ink-2`:
> A price can be pushed through a trigger and back inside a single block. Requiring the
> trigger to hold across two blocks means an attacker has to hold the price and pay for the
> privilege.

Scroll normally. Never hijack. Skippable. Static under `prefers-reduced-motion`.

---

## Section 3 — Why this only works here

**H2** (`display-m`): *Gas on Arc is USDC.*

Three facts, in a row, each a `data-xl` number over a `label` caption, each linked to its
source in `ground-truth.json` or the explorer:

```
0.507s        block time, measured over 10,000 blocks
0.0088 USDC   gas for a real fill on testnet
5.9×          the fee on that fill, against its gas
```

**Body** (`body`, max 68ch):
> Everywhere else, cost is denominated in one asset and profit in another, so a contract cannot
> compare them without a price oracle. On Arc they are the same asset in the same transaction.
> That is the whole reason this contract can refuse to run at a loss, and why the guarantee is
> something you read rather than something you trust us about.

---

## Section 4 — The refusal, foregrounded

**H2:** *It refused this one.*

Show the arithmetic as a small table in the data font, exactly as the keeper logged it:

```
proceeds      0.396122 USDC
fee at 50bps  0.001980 USDC
gas cost      0.012829 USDC
result       -0.010849 USDC     refused
```

**Body:**
> That order was too small to be worth filling, so it was not filled. The keeper caught it in
> simulation and spent nothing. Had it been submitted anyway, the contract would have reverted.
> A system that only ever succeeds tells you nothing about its safety.

This section gets a vermilion left rule and more vertical space than section 3. It is the
argument.

---

## Section 5 — What it costs

**H2:** *Measured, not estimated.*

The gas table from `ground-truth.json` — operation, gas, cost in cents — rendered as a real
table. Note under it, `body-s`:

> Public figures for Arc execution costs disagree with each other. These were measured on a
> mainnet fork and on testnet, and the method is in the repository.

---

## Section 6 — What this does not do

**H2:** *Limits.*

Four items, plain, no icons, no cards. This section is short and it is not hedged.

> **Unaudited.** One developer, no third-party review. Mainnet orders are capped on-chain by
> `maxOrderValueUsdc`; the live value is shown in the app.
>
> **Fills need a keeper.** Anyone can run one and nobody can steal with one, but if none is
> running, your order sits unfilled. The app shows whether one is alive.
>
> **Thin pools slip.** The contract protects the economics of the fill, not the quality of the
> price you get. Every market shows its measured depth.
>
> **Testnet is the sandbox.** Everything works there with faucet funds and no caps. Start there.

---

## Section 7 — Close

Single line, `display-l`, centred, with one primary button under it:

> Everything above is on-chain. Go check.

Button: `Open the app`. Under it, `body-s`: links to the contract on the explorer, the repo,
and the ground-truth file.

Footer: one row. Network switch, chain id, contract addresses in `data-s`, repo link. No
newsletter, no social icons wall, no sitemap.

---

## Layout notes

- Sections 3–6 alternate `--bone` and `--paper` backgrounds. No other separation needed.
- Section max-width 1200px, text blocks 68ch, generous vertical rhythm: 96px between sections
  on desktop, 56px on mobile.
- The `TickScale` appears in the hero and in the scroll narrative and nowhere else on this page.
  Repetition of one element is what gives the page identity.
- Total page weight target under 500KB excluding fonts. The 3D scene loads lazily, below the
  fold, and never blocks first paint.
