"use client";

import { useMemo, useState } from "react";
import { Row } from "./Chip";
import { TickScale } from "../TickScale";
import { TESTNET_MARKET } from "../../lib/markets";
import { fmt, humanPriceFromTick, sig, tickFromHumanPrice } from "../../lib/orderbook";
import { FILL } from "../../lib/data";

const field: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px", borderRadius: 2,
  border: "1px solid var(--rule-2)", background: "var(--sunk)", color: "var(--ink)",
  font: "inherit", fontFamily: "var(--font-mono), monospace", fontVariantNumeric: "tabular-nums",
};
const panel: React.CSSProperties = {
  padding: 18, border: "1px solid rgba(242,237,226,.08)", borderRadius: 16,
  background: "rgba(31,28,22,.5)",
};

export function Create({ currentTick }: { currentTick: number | null }) {
  const m = TESTNET_MARKET;
  const [amount, setAmount] = useState("");
  const [trigger, setTrigger] = useState("");

  const nowPrice = currentTick === null ? null : humanPriceFromTick(currentTick, 6, m.decimals);

  const calc = useMemo(() => {
    const t = parseFloat(trigger);
    const amt = parseFloat(amount);
    // Decimals-aware: a V4 tick prices raw units, a typed price is in display units.
    const tick = tickFromHumanPrice(t, 6, m.decimals);
    const back = tick === null ? NaN : humanPriceFromTick(tick, 6, m.decimals);
    const drift = tick === null ? 1 : Math.abs(back - t) / t;

    const gross = isFinite(amt) && isFinite(t) && t > 0 ? amt * t : 0;
    const poolFee = gross * (m.poolFeeBps / 10_000);
    const net = gross - poolFee;
    const keeperFee = net * 0.005;
    // The gas figure is the measured testnet fill, not an estimate.
    const gas = parseFloat(FILL.gasCost);
    const clears = keeperFee - gas;
    return { t, tick, back, drift, gross, poolFee, net, keeperFee, gas, clears };
  }, [amount, trigger, m.decimals, m.poolFeeBps]);

  const valid = calc.tick !== null;
  const backTone = !valid ? "var(--brick)" : calc.drift > 0.005 ? "var(--ochre)" : "var(--pine)";

  return (
    <>
      <h1 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: "46px", letterSpacing: "-0.02em", fontWeight: 400 }}>
        Create order
      </h1>
      <p style={{ margin: "6px 0 24px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "72ch" }}>
        Sell <span style={{ color: "var(--ink)" }}>{m.symbol}</span> for USDC when price reaches
        your trigger. Everything below is checked before you sign.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <form style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }} onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 6 }}>Amount to sell ({m.symbol})</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" style={field} inputMode="decimal" />
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 6 }}>Trigger price (USDC per {m.symbol})</label>
            <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="0.00000000" style={field} inputMode="decimal" />
            {nowPrice !== null && (
              <div className="num" style={{ marginTop: 6, fontSize: 12, color: "var(--ink-3)" }}>
                price now {sig(nowPrice)}
              </div>
            )}
          </div>

          {/* The single highest-risk input in the app. */}
          <div style={{ padding: 16, borderRadius: 2, background: "var(--sunk)" }}>
            <div className="label" style={{ color: "var(--ink-2)" }}>Decimals check</div>
            <Row label="Computed tick" value={calc.tick === null ? "—" : calc.tick.toLocaleString()} />
            <Row label="Tick converts back to" value={valid ? sig(calc.back) : "—"} tone={backTone} />
            <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
              Read the second number. If it is not the price you meant, your decimals are wrong and
              no keeper will save you. Ticks are integers, so the nearest tick is rarely exactly the
              price you typed — a small difference is normal, a factor of a thousand is not.
            </p>
          </div>

          <button
            type="submit"
            disabled
            title="Wallet connection is not wired up yet"
            style={{
              height: 48, borderRadius: 6, border: "none", background: "var(--rule-2)",
              color: "var(--ink-3)", font: "inherit", fontSize: 15, fontWeight: 600, cursor: "not-allowed",
            }}
          >
            Connect a wallet to continue
          </button>
        </form>

        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={panel}>
            <div className="label" style={{ color: "var(--ink-2)", marginBottom: 12 }}>Preview</div>
            <TickScale
              triggerPct={valid && currentTick !== null ? 38 : 50}
              markerPct={currentTick !== null ? 62 : 50}
              triggerLabel={valid ? sig(calc.back) : "set a trigger"}
              leftLabel={calc.tick === null ? "tick —" : `tick ${calc.tick.toLocaleString()}`}
              rightLabel={currentTick === null ? "price —" : `now ${sig(humanPriceFromTick(currentTick, 6, m.decimals))}`}
            />
          </div>

          <div style={panel}>
            <div className="label" style={{ color: "var(--ink-2)" }}>If it filled at your trigger</div>
            <Row label="Gross proceeds" value={calc.gross ? fmt(calc.gross) : "—"} />
            <Row label={`Pool fee (${(m.poolFeeBps / 100).toFixed(2)}%)`} value={calc.gross ? `−${fmt(calc.poolFee)}` : "—"} />
            <Row label="You receive" value={calc.gross ? fmt(calc.net - calc.keeperFee) : "—"} />
            <Row label="Keeper fee (0.50%)" value={calc.gross ? fmt(calc.keeperFee) : "—"} />
            <Row label="Gas cost (measured)" value={`−${fmt(calc.gas)}`} />
            <Row
              label="Cost floor"
              value={!calc.gross ? "—" : calc.clears > 0 ? `clears by ${fmt(calc.clears)}` : `short by ${fmt(Math.abs(calc.clears))}`}
              tone={!calc.gross ? undefined : calc.clears > 0 ? "var(--pine)" : "var(--brick)"}
            />
            {calc.gross > 0 && calc.clears <= 0 && (
              <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--brick)" }}>
                This order is too small. The keeper fee would not cover the gas, so no keeper will
                fill it and the contract would revert if one tried. Increase the size.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
