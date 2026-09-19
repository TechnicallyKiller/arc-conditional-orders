import { Atmosphere } from "./components/Atmosphere";
import { Header } from "./components/Header";
import { Beat } from "./components/Beat";
import { TickScale } from "./components/TickScale";
import { DwellBlocks } from "./components/DwellBlocks";
import { ARITHMETIC, DEPLOY, FILL, GAS_ROWS, HERO_STATS, REFUSAL, RISKS, TX } from "./lib/data";
import { addrUrl, short, txUrl } from "./lib/chain";

const serifH2: React.CSSProperties = {
  margin: 0, fontFamily: "var(--font-serif), Georgia, serif", fontSize: 32,
  lineHeight: "36px", letterSpacing: "-0.015em", fontWeight: 400,
};
const sectionHead: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline",
  justifyContent: "space-between", borderBottom: "1px solid var(--rule)", paddingBottom: 14,
};
const stepTitle: React.CSSProperties = {
  margin: "6px 0 8px", fontSize: 26, lineHeight: "32px", fontWeight: 500, letterSpacing: "-0.011em",
};
const body: React.CSSProperties = {
  margin: 0, fontSize: 15, lineHeight: "23px", color: "var(--ink-2)", maxWidth: "52ch",
};
const card: React.CSSProperties = {
  flex: "1 1 300px", minWidth: 0, padding: 20, border: "1px solid rgba(242,237,226,.08)",
  borderRadius: 16, background: "rgba(31,28,22,.5)", backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};

export default function Landing() {
  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <Atmosphere />
      <Header />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "0 24px 96px" }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 32, padding: "56px 0 72px" }}>
          <div style={{ flex: "1 1 440px", minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px",
                borderRadius: 999, background: "rgba(255,107,61,.13)", color: "var(--vermilion-2)",
                fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase",
              }}
            >
              Live on Arc testnet
            </div>
            <h1
              className="serif"
              style={{
                margin: "18px 0 0", fontSize: 64, lineHeight: "60px", letterSpacing: "-0.025em",
                fontWeight: 400, color: "var(--ink)", textWrap: "pretty",
              }}
            >
              A stop-loss that <span style={{ fontStyle: "italic" }}>proves</span> it fired.
            </h1>
            <p style={{ margin: "20px 0 0", fontSize: 17, lineHeight: "27px", color: "var(--ink-2)", maxWidth: "56ch", textWrap: "pretty" }}>
              Approve a token, set a trigger. An unprivileged keeper watches, arms for two blocks,
              re-checks, then sells for USDC through Uniswap V4. If the fee does not cover the gas,
              the fill reverts and nobody is paid.
            </p>
            <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: "23px", color: "var(--ink-3)", maxWidth: "56ch" }}>
              Gas on Arc is USDC. Cost and proceeds are the same unit, so the contract enforces
              profitability itself — no oracle, no trust in the keeper&apos;s arithmetic.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
              <a
                href="/app"
                style={{
                  height: 48, display: "inline-flex", alignItems: "center", padding: "0 24px",
                  borderRadius: 999, background: "var(--vermilion)", color: "var(--paper)",
                  fontSize: 15, fontWeight: 600, textDecoration: "none",
                }}
              >
                Open the app
              </a>
              <a
                href={txUrl(TX.fill)} target="_blank" rel="noreferrer"
                style={{
                  height: 48, display: "inline-flex", alignItems: "center", padding: "0 22px",
                  borderRadius: 999, border: "1px solid rgba(242,237,226,.16)", color: "var(--ink)",
                  fontSize: 15, fontWeight: 500, textDecoration: "none",
                }}
              >
                Read a real fill ↗
              </a>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 36, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
              {HERO_STATS.map((s) => (
                <div key={s.label}>
                  <div className="label">{s.label}</div>
                  <div className="num" style={{ fontSize: 23, lineHeight: "28px", fontWeight: 500, letterSpacing: "-0.01em" }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Argus Panoptes — the watchman who never fully sleeps. Decoration, hidden from AT. */}
          <div
            aria-hidden
            style={{
              flex: "1 1 420px", minWidth: 0, alignSelf: "stretch", position: "relative",
              minHeight: 520, marginRight: -120, opacity: 0.5,
              backgroundImage: "url(/argus-ascii.png)", backgroundSize: "cover",
              backgroundPosition: "52% center",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 34%, #000 100%)",
              maskImage: "linear-gradient(90deg, transparent 0%, #000 34%, #000 100%)",
            }}
          />
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section id="how" style={{ padding: "8px 0 24px" }}>
          <div style={sectionHead}>
            <h2 style={serifH2}>One order, start to finish</h2>
            <span className="label">Four states, no others</span>
          </div>

          <Beat>
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              <div className="label">Step 01</div>
              <h3 style={stepTitle}>Set</h3>
              <p style={body}>
                You approve the token and write a trigger price. The app shows the tick it compiles
                to{" "}
                <em className="serif" style={{ fontStyle: "italic", fontSize: 17, color: "var(--ink)" }}>and</em>{" "}
                the price that tick converts back to, before you sign. A decimals error is visible,
                not fatal.
              </p>
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 0, alignSelf: "center" }}>
              <TickScale triggerPct={38} markerPct={66} triggerLabel="0.00003950"
                leftLabel="tick −101,397" rightLabel="price now 0.00004128" />
            </div>
          </Beat>

          <Beat driftTo="36%">
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              <div className="label">Step 02</div>
              <h3 style={stepTitle}>Watch</h3>
              <p style={body}>
                Nothing is custodied and nothing is locked. A keeper — anyone, unprivileged — calls{" "}
                <code className="num" style={{ fontSize: 13, background: "var(--sunk)", padding: "1px 5px", borderRadius: 2 }}>checkOrders</code>{" "}
                each block. If the pool cannot be read, the order says so rather than pretending.
              </p>
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 0, alignSelf: "center" }}>
              <TickScale triggerPct={38} markerPct={66} triggerLabel="trigger" drift
                leftLabel="watching" rightLabel="re-checked each block" />
            </div>
          </Beat>

          <Beat accent="var(--vermilion)">
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              <div className="label" style={{ color: "var(--vermilion-2)" }}>Step 03</div>
              <h3 style={stepTitle}>Arm</h3>
              <p style={body}>
                Price crosses. The order arms and waits two blocks — about a second on Arc — then
                re-checks. A wick that recovers disarms it. The counter is literal: two blocks, mined.
              </p>
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 0, alignSelf: "center" }}>
              <DwellBlocks filled={1} caption={`armed, then re-checked at fill`} />
            </div>
          </Beat>

          <Beat accent="var(--pine)">
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              <div className="label" style={{ color: "var(--pine)" }}>Step 04</div>
              <h3 style={stepTitle}>Fill</h3>
              <p style={body}>
                The swap executes and the contract checks itself: keeper fee against gas, both in
                USDC. Short by a cent and the whole transaction reverts. This one cleared.
              </p>
              <a href={txUrl(TX.fill)} target="_blank" rel="noreferrer" title={TX.fill}
                className="num" style={{ display: "inline-block", marginTop: 14, fontSize: 14 }}>
                {short(TX.fill)} ↗
              </a>
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              {ARITHMETIC.map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderTop: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-2)" }}>
                  <span>{r.label}</span>
                  <span className="num" style={{ fontSize: 14, color: r.tone === "pine" ? "var(--pine)" : "var(--ink)" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </Beat>
        </section>

        {/* ── The refusal ──────────────────────────────────────── */}
        <section style={{ padding: "56px 0 24px" }}>
          <div style={sectionHead}>
            <h2 style={serifH2}>It refused this one</h2>
            <span className="label">The more useful of the two</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: "28px 4px 8px 22px", borderLeft: "2px solid var(--brick)" }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <p style={{ ...body, maxWidth: "58ch" }}>
                That order was too small to be worth filling, so it was not filled. The keeper caught
                it in simulation and spent nothing. Had it been submitted anyway, the contract would
                have reverted. A system that only ever succeeds tells you nothing about its safety.
              </p>
              <a href={txUrl(TX.armRefused)} target="_blank" rel="noreferrer" title={TX.armRefused}
                className="num" style={{ display: "inline-block", marginTop: 14, fontSize: 14 }}>
                {short(TX.armRefused)} ↗
              </a>
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              {[
                ["Proceeds", REFUSAL.proceeds, "ink"],
                ["Fee at 50 bps", REFUSAL.fee, "ink"],
                ["Gas cost", REFUSAL.gasCost, "ink"],
                ["Result", `${REFUSAL.result}  refused`, "brick"],
              ].map(([l, v, tone]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderTop: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-2)" }}>
                  <span>{l}</span>
                  <span className="num" style={{ fontSize: 14, color: tone === "brick" ? "var(--brick)" : "var(--ink)" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Limits ───────────────────────────────────────────── */}
        <section id="honest" style={{ padding: "56px 0 24px" }}>
          <div style={sectionHead}>
            <h2 style={serifH2}>What can go wrong</h2>
            <span className="label">Read before signing</span>
          </div>
          {RISKS.map((r) => (
            <div key={r.title} style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "22px 4px 22px 22px", borderTop: "1px solid var(--rule)", borderLeft: `2px solid ${r.tone}` }}>
              <h3 style={{ margin: 0, flex: "0 1 220px", fontSize: 15, lineHeight: "21px", fontWeight: 600, color: r.tone }}>{r.title}</h3>
              <p style={{ margin: 0, flex: "1 1 320px", minWidth: 0, fontSize: 15, lineHeight: "23px", color: "var(--ink-2)", maxWidth: "62ch" }}>{r.body}</p>
            </div>
          ))}
        </section>

        {/* ── Proof ────────────────────────────────────────────── */}
        <section id="proof" style={{ padding: "56px 0 0" }}>
          <div style={sectionHead}>
            <h2 style={serifH2}>Everything here is on-chain</h2>
            <span className="label">Arc testnet · chain {DEPLOY.chainId}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 20 }}>
            <div style={card}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15, lineHeight: "21px", fontWeight: 600 }}>Contracts</h3>
              {[
                ["OrderBook", DEPLOY.orderBook],
                ["Swap adapter", DEPLOY.swapAdapter],
                ["Keeper", DEPLOY.keeper],
              ].map(([l, a]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 10, fontSize: 13, color: "var(--ink-2)" }}>
                  <span>{l}</span>
                  <a href={addrUrl(a)} target="_blank" rel="noreferrer" title={a} className="num" style={{ fontSize: 14 }}>{short(a)} ↗</a>
                </div>
              ))}
            </div>
            <div style={card}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15, lineHeight: "21px", fontWeight: 600 }}>Measured gas, in USDC</h3>
              {GAS_ROWS.map((g) => (
                <div key={g.call} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-2)" }}>
                  <span>{g.call}</span>
                  <span className="num" style={{ fontSize: 14, color: "var(--ink)" }}>{g.usdc}</span>
                </div>
              ))}
              <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
                Measured on a mainnet fork and on testnet under arc-foundry. Public figures for Arc
                execution costs disagree with each other; the method is in the repository.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 20, marginTop: 40, padding: "32px 0 0", borderTop: "1px solid var(--rule)" }}>
            <div>
              <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: "46px", letterSpacing: "-0.02em", fontWeight: 400 }}>Set one on testnet.</h2>
              <p style={{ margin: "8px 0 0", fontSize: 15, color: "var(--ink-3)", maxWidth: "52ch" }}>
                Free tokens, real contracts, the same code path as mainnet — with the caps read live
                from the chain.
              </p>
            </div>
            <a href="/app" style={{ height: 48, display: "inline-flex", alignItems: "center", padding: "0 24px", borderRadius: 999, background: "var(--vermilion)", color: "var(--paper)", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
              Open the app
            </a>
          </div>
        </section>
      </main>

      <footer style={{ position: "relative", zIndex: 1, borderTop: "1px solid var(--rule)", padding: 24, marginTop: 40 }}>
        <p style={{ margin: "0 auto", maxWidth: 1152, fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
          Unaudited. Arc testnet, chain {DEPLOY.chainId} · mainnet {DEPLOY.mainnetChainId}. Fills
          require a running keeper; the contract refuses any fill whose fee does not cover its gas.
          Hero: Argus Panoptes, the watchman who never fully sleeps.
        </p>
      </footer>
    </div>
  );
}
