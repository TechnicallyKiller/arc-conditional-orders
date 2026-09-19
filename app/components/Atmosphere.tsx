/** Fixed background layers from the design: a drifting warm bloom and a fine noise overlay. */
export function Atmosphere() {
  const noise =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")";
  return (
    <>
      <div
        aria-hidden
        className="drift"
        style={{
          position: "fixed", inset: "-20%", zIndex: 0, pointerEvents: "none",
          background:
            "radial-gradient(48% 42% at 78% 84%, rgba(255,138,99,.16), rgba(255,107,61,0) 62%)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          opacity: 0.45, mixBlendMode: "overlay",
          backgroundImage: noise, backgroundSize: "180px 180px",
        }}
      />
    </>
  );
}
