/**
 * Fixed background layers. Order matters: warm bloom, then Argus, then noise on top so the
 * grain sits over the art rather than under it.
 *
 * Argus is `position: fixed`, so he does not scroll with the content — the watchman stays put
 * while everything moves past him, which is the myth and also what the keeper does. Kept faint:
 * this is texture behind text, and if it ever competes with the copy it is too strong.
 */
const ARGUS_OPACITY = 0.1;

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
          opacity: ARGUS_OPACITY,
          backgroundImage: "url(/argus-ascii.webp)",
          backgroundSize: "cover",
          backgroundPosition: "72% center",
          backgroundRepeat: "no-repeat",
          // Quieter on the left where the copy sits, present on the right. Fades at top and
          // bottom so it never collides with the header bar or the footer rule.
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.45) 26%, #000 62%), linear-gradient(180deg, transparent 0%, #000 12%, #000 86%, transparent 100%)",
          maskImage:
            "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.45) 26%, #000 62%), linear-gradient(180deg, transparent 0%, #000 12%, #000 86%, transparent 100%)",
          WebkitMaskComposite: "source-in",
          maskComposite: "intersect",
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
