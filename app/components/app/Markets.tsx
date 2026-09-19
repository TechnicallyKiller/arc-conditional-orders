import { MARKETS, TESTNET_MARKET } from "../../lib/markets";

const head: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1.4fr .9fr .9fr 1.2fr auto",
  gap: 16, padding: "10px 16px", background: "var(--paper-sunk, #12100C)",
  borderBottom: "1px solid var(--rule)",
};

export function Markets({ onSetStop }: { onSetStop: () => void }) {
  const rows = [TESTNET_MARKET, ...MARKETS];
  return (
    <>
      <h1 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: "46px", letterSpacing: "-0.02em", fontWeight: 400 }}>
        Markets
      </h1>
      <p style={{ margin: "6px 0 24px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "72ch" }}>
        Depth is measured, not assumed. Each badge is the price impact of a real executed sell
        against the pool, excluding the pool&apos;s own fee. A pool qualifies only if that sell
        succeeds — one candidate with 4.5×10²⁴ of nominal liquidity failed and is shown as such.
      </p>

      <div style={{ border: "1px solid var(--rule)", borderRadius: 6, overflow: "hidden" }}>
        <div style={head} className="label">
          <span>Token</span><span style={{ textAlign: "right" }}>Pool fee</span>
          <span style={{ textAlign: "right" }}>Impact $500</span><span>Pool</span><span />
        </div>
        {rows.map((m) => (
          <div
            key={m.symbol + m.network}
            style={{
              display: "grid", gridTemplateColumns: "1.4fr .9fr .9fr 1.2fr auto",
              gap: 16, padding: "14px 16px", alignItems: "center",
              borderTop: "1px solid var(--rule)",
              opacity: m.sellTestPassed ? 1 : 0.72,
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{m.symbol}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{m.name}</div>
            </div>
            <div className="num" style={{ textAlign: "right", fontSize: 14 }}>
              {(m.poolFeeBps / 100).toFixed(2)}%
            </div>
            <div className="num" style={{ textAlign: "right", fontSize: 14, color: m.sellTestPassed ? "var(--ink)" : "var(--brick)" }}>
              {m.sellTestPassed ? `${m.impactBps} bps` : "—"}
            </div>
            <div>
              <span
                style={{
                  padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  letterSpacing: "0.09em", textTransform: "uppercase",
                  background: m.sellTestPassed ? "#12100C" : "#2B1410",
                  color: m.sellTestPassed ? "var(--ink-2)" : "var(--brick)",
                }}
              >
                {m.sellTestPassed ? m.network : "sell test failed"}
              </span>
            </div>
            <div>
              <button
                onClick={onSetStop}
                disabled={!m.sellTestPassed}
                style={{
                  height: 34, padding: "0 14px", borderRadius: 6, cursor: m.sellTestPassed ? "pointer" : "not-allowed",
                  border: "1px solid rgba(242,237,226,.16)", background: "transparent",
                  color: m.sellTestPassed ? "var(--ink)" : "var(--ink-3)",
                  font: "inherit", fontSize: 13, fontWeight: 500,
                }}
              >
                Set stop
              </button>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
        Live prices are not shown here yet. Showing a price implies it is current, and these are
        read per-block from the pool rather than streamed — the app screen quotes a live price at
        the moment you set a trigger, which is when it matters.
      </p>
    </>
  );
}
