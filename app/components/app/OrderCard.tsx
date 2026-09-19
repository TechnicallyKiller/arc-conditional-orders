import { Chip, Stat, Row, type Tone } from "./Chip";
import { TickScale } from "../TickScale";
import { DwellBlocks } from "../DwellBlocks";
import { TriggerState, type OrderView, humanPriceFromTick, sig } from "../../lib/orderbook";
import { FILL, TX } from "../../lib/data";
import { short, txUrl } from "../../lib/chain";

const ACCENT: Record<string, string> = {
  armed: "var(--vermilion)", watching: "var(--rule-3)", filled: "var(--pine)",
  refused: "var(--brick)", unreadable: "var(--ochre)", muted: "var(--rule-2)",
};

function toneFor(o: OrderView): { tone: Tone; word: string } {
  if (o.status === 2) return { tone: "filled", word: "Filled" };
  if (o.status === 3) return { tone: "muted", word: "Cancelled" };
  switch (o.state) {
    case TriggerState.PoolUnreadable: return { tone: "unreadable", word: "Pool unreadable" };
    case TriggerState.Arming: return { tone: "armed", word: "Arming" };
    case TriggerState.Ready: return { tone: "armed", word: "Armed" };
    case TriggerState.Expired: return { tone: "muted", word: "Expired" };
    default: return { tone: "watching", word: "Watching" };
  }
}

/** Position the marker and trigger on a shared rail so both are comparable at a glance. */
function railPositions(tick: number, trigger: number) {
  const span = Math.max(2000, Math.abs(tick - trigger) * 3);
  const mid = (tick + trigger) / 2;
  const pct = (t: number) => Math.max(4, Math.min(96, ((t - (mid - span / 2)) / span) * 100));
  return { marker: pct(tick), trigger: pct(trigger), lo: Math.round(mid - span / 2), hi: Math.round(mid + span / 2) };
}

export function OrderCard({ o, dec }: { o: OrderView; dec: number }) {
  const { tone, word } = toneFor(o);
  const readable = o.state !== TriggerState.PoolUnreadable;
  const p = railPositions(o.tick, o.triggerTick);
  const triggerPrice = humanPriceFromTick(o.triggerTick, 6, dec);
  const nowPrice = humanPriceFromTick(o.tick, 6, dec);

  return (
    <article
      style={{
        borderTop: "1px solid var(--rule)", borderLeft: `2px solid ${ACCENT[tone]}`,
        padding: "26px 4px 30px 22px",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19, lineHeight: "26px", fontWeight: 500, letterSpacing: "-0.008em" }}>
            {short(o.tokenIn, 6, 4)} <span style={{ color: "var(--ink-3)" }}>/</span> USDC
          </h2>
          <Chip tone={tone}>{word}</Chip>
        </div>
        <span className="num" style={{ fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
          order #{o.id.toString()} · {o.triggerBelow ? "stop-loss" : "take-profit"}
        </span>
      </div>

      {o.state === TriggerState.PoolUnreadable ? (
        <p style={{ margin: "16px 0 0", fontSize: 13, lineHeight: "19px", color: "var(--ochre)", maxWidth: "68ch" }}>
          <code className="num" style={{ fontSize: 13, background: "var(--sunk)", padding: "1px 5px", borderRadius: 2 }}>checkOrders</code>{" "}
          returned{" "}
          <code className="num" style={{ fontSize: 13, background: "var(--sunk)", padding: "1px 5px", borderRadius: 2 }}>PoolUnreadable</code>.
          This order cannot arm and will not fill. It is not cancelled — it is blind.
        </p>
      ) : (
        <>
          <div style={{ margin: "18px 0 4px" }}>
            <TickScale
              triggerPct={p.trigger} markerPct={p.marker}
              triggerLabel={sig(triggerPrice)}
              leftLabel={`tick ${p.lo.toLocaleString()}`}
              rightLabel={`tick ${p.hi.toLocaleString()}`}
            />
          </div>

          {o.state === TriggerState.Arming && (
            <div style={{ marginTop: 20 }}>
              <DwellBlocks filled={1} caption={`armed at block ${o.armedAtBlock.toLocaleString()}`} />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 16, marginTop: 16 }}>
            <Stat label="Trigger" value={sig(triggerPrice)} />
            <Stat label="Price now" value={readable ? sig(nowPrice) : "—"} />
            <Stat label="Direction" value={o.triggerBelow ? "at or below" : "at or above"} />
            <Stat label="Size" value={(Number(o.amountIn) / 10 ** dec).toLocaleString("en-US", { maximumFractionDigits: 4 })} />
          </div>
        </>
      )}

      {o.status === 2 && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 2, background: "var(--sunk)" }}>
          <div className="label" style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)" }}>
            <span>Arithmetic</span><span>USDC</span>
          </div>
          <Row label="Proceeds from swap" value={FILL.proceeds} />
          <Row label="Keeper fee (0.50%)" value={FILL.fee} />
          <Row label="Gas used" value={FILL.gasUsed} />
          <Row label="Gas cost (paid in USDC)" value={`−${FILL.gasCost}`} />
          <Row label="Keeper margin (fee − gas)" value={FILL.margin} tone="var(--pine)" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginTop: 12, fontSize: 12, color: "var(--ink-3)" }}>
            <span className="num">filled at block {FILL.block.toLocaleString()} · dwell held 2 blocks</span>
            <a href={txUrl(TX.fill)} target="_blank" rel="noreferrer" title={TX.fill} className="num" style={{ fontSize: 13 }}>
              {short(TX.fill)} ↗
            </a>
          </div>
        </div>
      )}
    </article>
  );
}
