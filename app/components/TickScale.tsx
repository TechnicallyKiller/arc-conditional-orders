/**
 * The signature component: a tick rail with the trigger as a notch and price as a marker.
 * Ticks are integers, so the rail is drawn as discrete marks rather than a smooth gradient —
 * the visual follows what the contract actually reads.
 */
export function TickScale({
  triggerPct, markerPct, triggerLabel, leftLabel, rightLabel, drift = false,
}: {
  triggerPct: number;
  markerPct: number;
  triggerLabel: string;
  leftLabel: string;
  rightLabel: string;
  drift?: boolean;
}) {
  return (
    <div>
      <div style={{ position: "relative", height: 74 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 34, display: "flex", justifyContent: "space-between" }}>
          {Array.from({ length: 41 }).map((_, i) => (
            <div key={i} style={{ width: 1, height: 5, background: "var(--rule-2)" }} />
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 34, height: 1, background: "var(--rule-3)" }} />
        <div style={{ position: "absolute", top: 24, left: `${triggerPct}%`, width: 1, height: 22, background: "var(--ink-2)" }} />
        <div
          className="num"
          style={{
            position: "absolute", top: 48, left: `${triggerPct}%`, transform: "translateX(-50%)",
            fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap",
          }}
        >
          {triggerLabel}
        </div>
        <div
          data-drift={drift ? "1" : undefined}
          style={{
            position: "absolute", top: 29, left: `${markerPct}%`, width: 10, height: 10,
            borderRadius: 2, background: "var(--ink)", transform: "translateX(-50%)",
            transition: "left 900ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </div>
      <div className="num" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)" }}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
