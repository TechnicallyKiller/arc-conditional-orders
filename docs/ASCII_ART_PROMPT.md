# ASCII hero art — generation and rendering spec

The landing page carries one piece of figurative art, converted to ASCII. It is the only
illustration on the site. Everything else is data.

## Why Argus Panoptes

Argus was the hundred-eyed giant set to guard Io. Only some of his eyes slept at a time, so he
never slept. That is exactly what the keeper is: an unsleeping watcher that holds nothing,
takes nothing, and cannot touch what it guards. A hundred eyes, some always open.

It also sits naturally beside Arc, and `ARGUS` is a token currently trading there.

---

## Primary image prompt

Generate at 2048×2048 or larger, then convert. Prompt:

> A classical Greco-Roman marble bust of Argus Panoptes, the hundred-eyed watchman, carved in
> weathered Pentelic marble. Frontal three-quarter view, head and shoulders only. Eyes are
> carved across the brow, temples and cheekbones in addition to the two natural eyes —
> approximately twelve visible, some open and some closed, arranged with the deliberate
> asymmetry of real archaic sculpture rather than a regular pattern. Calm, watchful expression;
> not menacing, not heroic. Tight curled hair and a short beard in the archaic Greek manner.
>
> Lighting: single hard directional key light from the upper left at roughly 40 degrees,
> producing deep unfilled shadow on the right third of the face. No fill light, no rim light.
> Strong tonal separation between lit and shadowed planes — the form must read as a clear
> silhouette when reduced to ten grey levels.
>
> Background: flat, featureless, near-black. No environment, no pedestal, no props, no text.
> Surface: matte weathered stone with fine chipping at the edges. No polish, no specular
> highlights, no subsurface glow.
>
> Photographed straight on with a 85mm lens, museum documentation style. Greyscale.
> High contrast. Sharp focus on the eyes.

**Negative prompt:**
> colour, gradient background, glow, neon, bloom, lens flare, bokeh, dramatic clouds, fantasy
> armour, wings, crown, lightning, gold, ornate frame, watermark, text, signature, multiple
> figures, full body, hands, cinematic teal-orange grade, 3d render, plastic, cgi skin

---

## Alternate: Kairos

If the watcher reads as too static, Kairos is the moment rather than the vigil.

> A classical Greek marble bust of Kairos, god of the opportune moment. Young, beardless,
> head turned sharply as if passing by. A single long forelock falls forward over the brow;
> the back of the head is shaved bare — the detail that gives the myth its meaning: he can be
> seized as he approaches and never once he has passed. Small wings at the temples, carved
> flush to the stone, not feathered or protruding.
>
> Same lighting, background, surface and camera treatment as above. Greyscale, high contrast,
> flat near-black background, no environment.

Use the same negative prompt.

---

## Converting to ASCII

1. Crop square, centre the face on the vertical third.
2. Convert to greyscale, raise contrast until the shadow side is near-black and the lit
   cheek is near-white. Mid-tones are the enemy: ASCII has about ten levels.
3. Downsample to **110 columns**. Character cells are roughly twice as tall as wide, so
   compress vertical resolution by ~0.5 to keep proportions.
4. Ramp, light to dark: `` ` . : - = + * # % @ ``  — eleven levels including space.
5. Hand-correct the output. Automated conversion always mangles the eyes; they are the whole
   point. Nudge characters until each eye reads clearly at 12px.

Target output: about 110 × 60 characters.

---

## Rendering on the page

- Monospace, IBM Plex Mono, `font-size: 9px`, `line-height: 9px`, `letter-spacing: 0`.
- Colour `--ink-3` on `--bone`. Deliberately low contrast: this is texture, not a headline.
  It should be legible when looked at and quiet when not.
- **Two or three of the eyes render in `--vermilion`.** Those are the open ones.
- With anime.js, the vermilion eyes shift slowly — one fades out over ~2.4s while another
  fades in elsewhere, so a different pair is lit each time. Never all at once, never a blink.
  Some eyes are always open, which is the myth and the product.
- Disable the shifting entirely under `prefers-reduced-motion`; hold one static pair.
- Wrap in `<pre aria-hidden="true">` with `user-select: none`. It is decoration and must not
  reach a screen reader.

## Placement

One instance only, on the landing page. Behind and to the right of the hero, bleeding off the
right edge, at roughly 45% opacity, never overlapping the H1 or the transaction links. On
mobile it moves below the hero copy and drops to 30% opacity.

It does not appear in the app. The app is instruments and numbers; the myth belongs on the
page that has to make someone care.
