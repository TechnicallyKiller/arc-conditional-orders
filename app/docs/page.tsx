"use client";

import { useNetwork } from "../lib/network";
import { NetworkSwitch } from "../components/NetworkSwitch";

export default function DocsPage() {
  const { info } = useNetwork();

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "48px 20px 96px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="serif" style={{ fontSize: 38, margin: 0, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            How it works
          </h1>
          <p style={{ color: "var(--ink-2)", margin: "6px 0 0", fontSize: 14 }}>
            Conditional orders on Uniswap v4 pools, settled by a contract that proves its own
            profitability.
          </p>
        </div>
        <NetworkSwitch />
      </div>

      <Section title="The idea">
        <P>
          You hold a token on Arc and want to sell it if the price crosses a line. Today the only
          tool is a market swap you have to send yourself, at the moment you happen to be awake.
        </P>
        <P>
          This is the missing half: you describe the order once — a pool, a price threshold, a
          direction, an amount — and it sits on-chain until the condition is true. Your tokens
          never leave your wallet until the moment of the fill. There is no deposit, no vault and
          no custodian.
        </P>
      </Section>

      <Section title="The life of an order">
        <Step n="1" title="Create">
          You approve the exact amount (not an unlimited allowance) and call{" "}
          <C>createOrder</C> with the pool, the trigger tick, the direction, and the minimum you
          are willing to receive. Nothing moves. The order is a row in a mapping.
        </Step>
        <Step n="2" title="Arm">
          A keeper watching the pool sees your trigger is met and calls <C>armOrder</C>. The
          contract re-reads the pool&rsquo;s own tick — it does not take the keeper&rsquo;s word — and
          records the block. Still nothing moves.
        </Step>
        <Step n="3" title="Dwell">
          The order cannot fill for <C>{String(info.chainId)}</C>&rsquo;s configured dwell period after
          arming. This is the anti-manipulation window, explained below.
        </Step>
        <Step n="4" title="Fill">
          The keeper calls <C>execute</C>. The contract re-derives the trigger from the pool a
          second time, pulls your tokens, routes the swap it builds itself, measures what actually
          arrived, and pays you — but only if the fee it collected exceeds the gas that call
          burned.
        </Step>
      </Section>

      <Section title="Why the fee has to cover the gas">
        <P>
          On most chains, an executor&rsquo;s profitability can only be estimated off-chain: gas is
          paid in the chain&rsquo;s native asset, proceeds arrive in the traded one, and comparing them
          needs a price feed and carries basis risk.
        </P>
        <P>
          On Arc, gas <em>is</em> USDC and proceeds <em>are</em> USDC. So the comparison is
          arithmetic on two numbers the EVM already exposes, and the contract can refuse a fill
          that would not pay for itself:
        </P>
        <Pre>{`cost = (gasConsumed + 21000 + calldataBytes*16 + settlementOverhead) * tx.gasprice
revert unless  fee >= cost + margin`}</Pre>
        <P>
          Intrinsic gas and calldata come from the EVM&rsquo;s own rules rather than a hand-tuned
          constant, so you can check the floor by reading the contract instead of trusting whoever
          runs the keeper. The practical consequence: orders below roughly two USDC of proceeds
          are not fillable, because the fee cannot cover the gas.
        </P>
      </Section>

      <Section title="Why a price spike cannot trigger your order">
        <P>
          The trigger is a Uniswap v4 tick, and a tick can be pushed anywhere inside a single
          transaction by someone willing to trade against the pool. If the contract checked the
          price once, an attacker could shove it through your stop, fill your order at a price
          that never really existed, and put the pool back — all atomically, with no risk.
        </P>
        <P>
          So observation and execution are split across blocks. Arming records the trigger in one
          block; filling re-derives it in a later one. A spike that is reverted inside one
          transaction cannot satisfy both, because they cannot land in the same block.
        </P>
        <P style={{ color: "var(--ink-3)" }}>
          Honest limit: this proves the trigger was true at two separate instants, not that it held
          continuously between them. It removes the free, risk-free version of the attack; it does
          not make manipulation impossible for someone willing to hold a position across blocks.
        </P>
      </Section>

      <Section title="Fees, caps and limits">
        <P>
          The protocol fee is taken from the proceeds and is capped in the contract — the owner
          cannot raise it past the ceiling, and your minimum-received bound is checked against what
          you actually receive, after the fee.
        </P>
        <P>
          Two exposure caps are enforced on-chain: a maximum per fill, and a maximum cumulative
          across all fills ever. They bind on realised USDC proceeds, which is exact and needs no
          price oracle. Live values are on the <A href="/status">status page</A>.
        </P>
      </Section>

      <Section title="Networks">
        <P>
          <strong style={{ color: "var(--ink)" }}>Testnet</strong> is the sandbox. It has a faucet
          token and a pool whose price is driven by a script, so you can set a real order and watch
          a real keeper fill it without risking anything. The token is worthless on purpose.
        </P>
        <P>
          <strong style={{ color: "var(--ink)" }}>Mainnet</strong> is the real deployment against
          real Uniswap v4 pools, with the exposure caps set deliberately low. There is no faucet
          there because there is nothing to hand out.
        </P>
      </Section>

      <Section title="What can go wrong">
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink-2)", fontSize: 15, lineHeight: 1.75 }}>
          <li>
            <strong style={{ color: "var(--ink)" }}>The keeper can stop.</strong> Nothing fills if
            nobody is watching. That is why liveness is shown rather than assumed — check the{" "}
            <A href="/status">status page</A> before relying on an order.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>Small orders will not fill.</strong> If the fee
            cannot cover the gas, the contract refuses. This is the design working, but it means a
            stop-loss on a tiny position is not protection.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>The cumulative cap does not reset.</strong> Once
            lifetime fills reach it, further fills stop until the owner raises it.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>Thin pools move.</strong> The fill trades against
            a real pool, so a large order moves the price against itself. Your minimum-received
            bound is the protection, and you choose it.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>It has not been audited by a firm.</strong> It
            went through an adversarial review that found and fixed two fund-loss issues, and it is
            covered by 71 tests against a mainnet fork — but that is not the same thing, which is
            why the caps exist.
          </li>
        </ul>
      </Section>

      <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 36 }}>
        <A href="/status">Status</A> · <A href="/app">Open the app</A> ·{" "}
        <a href={`${info.explorer}/address/${info.orderBook}`} target="_blank" rel="noreferrer" style={linkStyle}>
          Contract on {info.label.toLowerCase()}
        </a>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 40 }}>
      <h2 className="serif" style={{ fontSize: 24, margin: "0 0 12px", color: "var(--ink)", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
      <span
        className="num"
        style={{
          flex: "0 0 auto", width: 26, height: 26, borderRadius: 999, display: "grid",
          placeItems: "center", background: "var(--sunk)", border: "1px solid var(--rule-2)",
          color: "var(--vermilion-2)", fontSize: 12,
        }}
      >
        {n}
      </span>
      <div>
        <div style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{title}</div>
        <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 15, lineHeight: 1.7 }}>{children}</p>
      </div>
    </div>
  );
}

const linkStyle: React.CSSProperties = { color: "var(--vermilion-2)", textDecoration: "none" };
const P = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <p style={{ margin: "0 0 12px", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.75, ...style }}>{children}</p>
);
const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} style={linkStyle}>{children}</a>
);
const C = ({ children }: { children: React.ReactNode }) => (
  <code style={{ background: "var(--sunk)", padding: "1px 5px", borderRadius: 4, fontSize: 13, color: "var(--ink)" }}>{children}</code>
);
const Pre = ({ children }: { children: React.ReactNode }) => (
  <pre
    className="num"
    style={{
      background: "var(--sunk)", border: "1px solid var(--rule)", borderRadius: 10,
      padding: 14, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink)",
      overflowX: "auto", margin: "0 0 12px",
    }}
  >
    {children}
  </pre>
);
