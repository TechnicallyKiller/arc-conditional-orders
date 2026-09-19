const TONES = {
  armed: { bg: "#33190F", fg: "var(--vermilion)" },
  watching: { bg: "#12100C", fg: "var(--ink-2)" },
  filled: { bg: "#10241C", fg: "var(--pine)" },
  refused: { bg: "#2B1410", fg: "var(--brick)" },
  unreadable: { bg: "#2A2110", fg: "var(--ochre)" },
  muted: { bg: "#12100C", fg: "var(--ink-3)" },
} as const;

export type Tone = keyof typeof TONES;

export function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <span
      style={{
        padding: "3px 10px", borderRadius: 999, background: t.bg, color: t.fg,
        fontSize: 11, lineHeight: "14px", fontWeight: 600,
        letterSpacing: "0.09em", textTransform: "uppercase", whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num" style={{ fontSize: 14, lineHeight: "20px", color: tone ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}

export function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-2)" }}>
      <span>{label}</span>
      <span className="num" style={{ fontSize: 14, color: tone ?? "var(--ink)" }}>{value}</span>
    </div>
  );
}
