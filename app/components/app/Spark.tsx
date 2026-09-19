/**
 * A price line drawn from real Swap-event ticks. No smoothing, no interpolation between points:
 * each vertex is a trade that happened. A flat line means the pool genuinely did not move.
 */
export function Spark({
  ticks, width = 132, height = 34, tone = "var(--ink-2)", trigger,
}: {
  ticks: number[];
  width?: number;
  height?: number;
  tone?: string;
  trigger?: number;
}) {
  if (ticks.length < 2) {
    return (
      <div className="num" style={{ width, height, display: "flex", alignItems: "center", fontSize: 11, color: "var(--ink-3)" }}>
        no recent trades
      </div>
    );
  }

  const all = trigger === undefined ? ticks : [...ticks, trigger];
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (ticks.length - 1)) * width;
  const y = (t: number) => height - ((t - lo) / span) * height;

  const d = ticks.map((t, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(t).toFixed(1)}`).join(" ");
  const rising = ticks[ticks.length - 1] >= ticks[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ display: "block", overflow: "visible" }}>
      {trigger !== undefined && (
        <line x1={0} x2={width} y1={y(trigger)} y2={y(trigger)}
          stroke="var(--vermilion)" strokeWidth={1} strokeDasharray="2 3" opacity={0.85} />
      )}
      <path d={d} fill="none" stroke={tone === "auto" ? (rising ? "var(--pine)" : "var(--brick)") : tone}
        strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ticks.length - 1)} cy={y(ticks[ticks.length - 1])} r={2}
        fill={tone === "auto" ? (rising ? "var(--pine)" : "var(--brick)") : tone} />
    </svg>
  );
}
