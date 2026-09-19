"use client";

import { useEffect, useState } from "react";
import { MARKETS, TESTNET_MARKET, type Market } from "../../lib/markets";
import { readPools, type PoolState } from "../../lib/pools";
import { readHistory, type Series } from "../../lib/history";
import { humanPriceFromTick, sig } from "../../lib/orderbook";
import { Spark } from "./Spark";

const ROWS: Market[] = [TESTNET_MARKET, ...MARKETS];
const GRID = "1.3fr .85fr .75fr 1fr .95fr auto";

function DepthBadge({ m }: { m: Market }) {
  const failed = !m.sellTestPassed;
  const marginal = (m.impactBps ?? 0) > 100;
  const bg = failed ? "var(--brick-tint, #2B1410)" : marginal ? "#2A2110" : "#10241C";
  const fg = failed ? "var(--brick)" : marginal ? "var(--ochre)" : "var(--pine)";
  return (
    <span
      title={failed
        ? "A real sell against this pool returned nothing. It must not be used."
        : "Measured price impact of an executed $500 sell, excluding the pool's own fee."}
      style={{
        padding: "3px 10px", borderRadius: 999, background: bg, color: fg,
        fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
      }}
    >
      {failed ? "sell test failed" : `${m.impactBps} bps`}
    </span>
  );
}

export function Markets({ onSetStop }: { onSetStop: () => void }) {
  const [pools, setPools] = useState<Record<string, PoolState>>({});
  const [hist, setHist] = useState<Record<string, Series>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const p = await readPools(ROWS);
        if (alive) setPools(p);
      } catch { /* row falls back to "—", never to a fabricated price */ }
    };
    load();
    const t = setInterval(load, 12_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const m of ROWS) {
        const s = await readHistory(m);
        if (!alive) return;
        setHist((h) => ({ ...h, [m.symbol]: s }));
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <>
      <h1 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: "46px", letterSpacing: "-0.02em", fontWeight: 400 }}>
        Markets
      </h1>
      <p style={{ margin: "6px 0 24px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "72ch" }}>
        Depth is measured, not assumed — each badge is the price impact of a real executed sell,
        excluding the pool&apos;s own fee. The line is drawn from Swap events, so every vertex is a
        trade that happened rather than an interpolation.
      </p>

      <div style={{ border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden", background: "var(--paper)" }}>
        <div className="label" style={{ display: "grid", gridTemplateColumns: GRID, gap: 16, padding: "11px 18px", background: "#12100C", borderBottom: "1px solid var(--rule)" }}>
          <span>Token</span>
          <span style={{ textAlign: "right" }}>Price</span>
          <span style={{ textAlign: "right" }}>Pool fee</span>
          <span>Recent trades</span>
          <span>Depth $500</span>
          <span />
        </div>

        {ROWS.map((m) => {
          const p = pools[m.symbol];
          const h = hist[m.symbol];
          const price = p?.readable ? humanPriceFromTick(p.tick, 6, m.decimals) : null;
          return (
            <div
              key={m.symbol + m.network}
              style={{
                display: "grid", gridTemplateColumns: GRID, gap: 16, padding: "16px 18px",
                alignItems: "center", borderTop: "1px solid var(--rule)",
                opacity: m.sellTestPassed ? 1 : 0.6,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.005em" }}>{m.symbol}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {m.name} · <span className="num">{m.network}</span>
                </div>
              </div>

              <div className="num" style={{ textAlign: "right", fontSize: 14, color: price === null ? "var(--ink-3)" : "var(--ink)" }}>
                {price === null ? "—" : sig(price)}
              </div>

              <div className="num" style={{ textAlign: "right", fontSize: 13, color: "var(--ink-2)" }}>
                {(m.poolFeeBps / 100).toFixed(2)}%
              </div>

              <div>
                {h ? <Spark ticks={h.ticks} tone="auto" /> :
                  <div className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>loading…</div>}
                {h && h.ticks.length > 1 && (
                  <div className="num" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                    {h.ticks.length} trades
                  </div>
                )}
              </div>

              <div><DepthBadge m={m} /></div>

              <div>
                <button
                  onClick={onSetStop}
                  disabled={!m.sellTestPassed}
                  style={{
                    height: 34, padding: "0 14px", borderRadius: 6,
                    cursor: m.sellTestPassed ? "pointer" : "not-allowed",
                    border: "1px solid rgba(242,237,226,.16)", background: "transparent",
                    color: m.sellTestPassed ? "var(--ink)" : "var(--ink-3)",
                    font: "inherit", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
                  }}
                >
                  Set stop
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ margin: "14px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
        A flat line means the pool genuinely did not move, not that data is missing. BB is listed
        and disabled on purpose: it reports 4.5×10²⁴ of nominal liquidity and a real sell against
        it returns nothing, which only an executed swap reveals.
      </p>
    </>
  );
}
