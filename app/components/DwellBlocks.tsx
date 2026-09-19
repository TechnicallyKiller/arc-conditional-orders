/**
 * The only 3D on the site. Two cubes, one per block of the dwell window — literally what the
 * contract counts before it allows a fill. CSS 3D rather than a WebGL scene: at this size a
 * renderer would cost more than it shows.
 */
function Cube({ filled, n }: { filled: boolean; n: number }) {
  const face = filled
    ? { front: "var(--vermilion)", top: "var(--vermilion-2)", side: "var(--vermilion-deep)" }
    : { front: "#241F19", top: "var(--rule-2)", side: "#1A1611" };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 34, height: 34, position: "relative", transformStyle: "preserve-3d",
          transform: "rotateX(-24deg) rotateY(38deg)", opacity: filled ? 1 : 0.85,
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: face.front, transform: "translateZ(17px)", border: filled ? undefined : "1px solid var(--rule-2)" }} />
        <div style={{ position: "absolute", inset: 0, background: face.top, transform: "rotateX(90deg) translateZ(17px)" }} />
        <div style={{ position: "absolute", inset: 0, background: face.side, transform: "rotateY(90deg) translateZ(17px)" }} />
      </div>
      <span className="num" style={{ fontSize: 12, color: filled ? "var(--vermilion)" : "var(--ink-3)" }}>{n}</span>
    </div>
  );
}

export function DwellBlocks({ filled = 1, caption }: { filled?: number; caption: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 20, padding: 16,
        borderRadius: 2, background: "var(--sunk)",
      }}
    >
      <div style={{ display: "flex", gap: 16, perspective: "600px" }}>
        <Cube filled={filled >= 1} n={1} />
        <Cube filled={filled >= 2} n={2} />
      </div>
      <div className="label" style={{ color: "var(--ink-2)" }}>
        Dwell window
        <br />
        <span className="num" style={{ fontSize: 12, letterSpacing: 0, textTransform: "none", color: "var(--ink-3)" }}>
          {caption}
        </span>
      </div>
    </div>
  );
}
