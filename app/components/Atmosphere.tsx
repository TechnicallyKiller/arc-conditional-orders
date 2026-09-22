/**
 * Fixed background layers. Order matters: warm bloom, then the relief, then noise on top so the
 * grain sits over the art rather than under it.
 *
 * The relief is Kairos — the Greek personification of the fleeting opportune moment, carved with
 * a forelock you must seize as he passes and bald behind, because once he is gone you cannot
 * catch him. That is a stop-loss, and it is the reason he is here rather than a watchman: this
 * protocol is about *timing*, not surveillance.
 *
 * Landing page only. The app is instruments and numbers, and texture behind a dense table of
 * figures reads as dirt rather than atmosphere.
 *
 * He is `position: fixed`, so he does not scroll with the content — the moment stays put while
 * everything moves past it.
 *
 * The source art is near-black with a pure #000 floor, so it composites with `screen`: black
 * contributes nothing and only the raking light on the carving adds any luminance at all. That
 * is why the opacity here looks high — under `screen` it is the highlights being scaled, not the
 * whole frame being laid over the page.
 */
const RELIEF_OPACITY = 0.85;

export function Atmosphere({ relief = true }: { relief?: boolean } = {}) {
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

      {relief && <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          opacity: RELIEF_OPACITY,
          mixBlendMode: "screen",
          backgroundImage: "url(/bg.webp)",
          backgroundSize: "cover",
          // The figure occupies the right third of the art; anchoring right keeps him off the
          // copy at every viewport width instead of creeping inward as the page narrows.
          backgroundPosition: "right center",
          backgroundRepeat: "no-repeat",
          // Quieter on the left where the copy sits, present on the right. Fades at top and
          // bottom so it never collides with the header bar or the footer rule.
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.35) 30%, #000 64%), linear-gradient(180deg, transparent 0%, #000 12%, #000 86%, transparent 100%)",
          maskImage:
            "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.35) 30%, #000 64%), linear-gradient(180deg, transparent 0%, #000 12%, #000 86%, transparent 100%)",
          WebkitMaskComposite: "source-in",
          maskComposite: "intersect",
        }}
      />}

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
