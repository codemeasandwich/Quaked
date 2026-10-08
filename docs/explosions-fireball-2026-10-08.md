# Explosions: the supplied "04 Fireball"

Card T-dc636ca4, "[25] Explosions: integrate supplied 04 Fireball effect". Baseline
Dev `dea37ba`. Every explosion family in the card's inventory now uses it in Newer
Game; Classic keeps the original particles.

## Source

* Owner-supplied `fieldlab-fx-3d-updated.html`, SHA-256
  `7e35fc808c24200e9dbf2b010a72d2fbea04aca567528ebd2e61e79979afc7d6`
  (gitignored; kept local, never edited or distributed).
* Effect: tab "04 / LARGE FIREBALL", mode `explosion`, default parameters
  `size 1.6, flash 1, smoke .15, sparks 1.8`, quality `medium` (40 clouds, spark cap
  300), burst duration 4.8 s. The compact "05" spark burst was deliberately not used.
* Extraction map (source lines): `puffVert` 102, `puff` 106, `shock` 125, `puffs` 145,
  `burstClouds` 194, `burstSparks` 196, `light` 202, render 203–218,
  `configs.explosion` 231.
* Assets: the source embeds its smoke atlas and noise texture as PNG data URIs. They
  were decoded byte for byte into `newer/effects/fireball/smoke-atlas.png` (512², 4×4
  tiles) and `noise.png` (256², tiling), hashes in
  `newer/effects/fireball/provenance.json`, following the `newer/effects/quad/`
  precedent (tracked, loaded through `COM_NewerURL`).

## What replaces what

`cl_tent.js` still reads the message, plays the sound, places the scorch decal and
leaves damage and timing alone. Its three explosion cases now call wrappers in
`render.js` that return `true` when the Fireball took the event:

| Event | Wrapper | Fireball | Native dynamic light |
|---|---|---|---|
| `TE_EXPLOSION` (rocket, grenade) | `R_ParticleExplosion` | yes | replaced by the Fireball's own |
| `TE_EXPLOSION2` (colour-mapped) | `R_ParticleExplosion2` | yes (the colour range is not used) | replaced by the Fireball's own |
| `TE_TAREXPLOSION` (tar baby, blob) | `R_BlobExplosion` | yes | none (it never had one) |

The card's acceptance names the ordinary, explosion2 and blob families; an earlier
draft kept the last two native pending a ruling, and the card text settled it. A tint
for the blob families is possible later and is not part of this card.

When the wrapper returns `false` the native particles (and, in `cl_tent.js`, the
native one-shot light) are used exactly as before. That happens in Classic Quake
(`r_hdr` 0), with `r_fireball 0`, while the two textures are still loading or failed
to load (a console warning is printed), with no scene, or when the pool is full of
young bursts (below).

### The title demo's split view

The attract demo draws Newer | Classic side by side by rendering the scene a second
time with everything Newer hidden. During the split an explosion therefore creates
both: the Fireball (Newer-only, so only the enhanced half draws it) and the native
particles flagged `classicOnly`. `r_part.js` draws those from a second mesh that is
hidden unless the Classic pass switches it on (`gl_rmain.js`, `R_ClassicOn`), so
neither half ever shows both. With `r_demosplit 2` (Classic over the whole screen) the
original explosion is shown everywhere.

## How it is built

`src/r_fireball.js` ports the source's functions line for line and evaluates them per
frame, exactly as the source does: the effect is analytic in the burst's age
(`forEachCloud`, `forEachSpark`, `fireballFlash`, `fireballRingRadius`,
`fireballLight`). The exported `fireballClouds` / `fireballSparks` are thin
collectors over the same cores, used by tests. Nothing is simulated and the per-frame
path allocates nothing: scalars are written straight into preallocated typed arrays.
Four instanced meshes follow `r_quadparticles.js`: cloud billboards (premultiplied
blend, sorted back to front as in the source), an additive flash card, additive
velocity-aligned spark strips (1.25 px minimum width) and an additive shock ring.

* **Scale/axes.** One source unit = 24 Quake units (a ~56-unit player against the
  source's ~1.8-unit stand-in): a fireball about 160 units across at the flash, past
  200 as the smoke rolls. Source y-up maps to Quake z-up; positions are world
  coordinates.
* **Ground.** The source's stage floor is replaced by the level: sparks fall to, and
  bounce on, the first solid found probing straight down (4-unit steps, 192 units);
  with no floor they fall freely.
* **Ring.** The shock ring lies on the nearest surface within 48 units, found with the
  decal code's `R_DecalSurface` (so on the wall a rocket hit, or the floor), is omitted
  in open air, and is skipped after its own fade reaches zero at 1 s.
* **Light.** The native dynamic light's strength is its remaining life (capped at
  0.5 s) in a fixed warm colour (`gl_rlight.js`). Each frame `driveLight` allocates
  that light under a per-burst key and sets `die = time + 0.5 × k` and
  `radius = 200 + 150 × k`, where `k = min(1, light(age) / 3.15)` is the source's light
  curve over its peak. Strength therefore follows the source (a sharp flash then a long
  glow, over ~0.9 s) with the same peak as the native explosion light, and the radius
  falls like the native one (350→200), so everything that reads the radius (screen
  tint, light slot ranking, model and lightmap lighting) fades with it. It stops being
  driven below `k = 0.02` and expires.
* **Time.** The effect follows `cl.time`, so it freezes with pause and the menu. A
  burst's clock starts at the first frame that draws it, not when the message is
  parsed (see "A bug found in use").
* **Bounds.** At most 6 live bursts; 240 cloud and 930 spark instances, allocated once.
  A full pool refuses a new burst (that explosion uses the native particles) unless
  its oldest burst is at least 1.5 s old and its smoke faint, when that one yields.
  Bursts end after 4.8 s, on a clock jump back of more than a second (demo loop, new
  game), on every map change (`R_FireballClear` from `R_NewMap`) and in Classic.
* **Pipeline.** Materials write zero to the MRT attachments, honour clipping planes and
  the XR scene scale (sparks too), never write depth, are tagged `newerOnly`, and draw
  above the scorch decals (render orders 6–9: puffs, ring, glow, sparks, the source's
  order). `r_fireball 0` turns the effect off.

## A bug found in use

"I can't see the explosions when I run Newer Game." The client steps its clock back a
little after parsing a message (`CL_RelinkEntities` clamps it to the server time; a
remote server's latency estimate also moves it). The burst's start was taken at parse
time and any burst whose clock went backwards was deleted, so on a fast display a
burst could be thrown away before its first frame, after the native particles had
already been skipped: no explosion at all. The start is now taken at the first frame
that draws the burst, small backward steps never end a burst, and only a rewind of more
than a second does. `tests/fireball_test.js` pins the exact case (spawn at 10.000,
first frame at 9.995) and fails against the old behaviour.

## Shared puff layer

The source uses one puff shader and one pair of textures for the Fireball and for the RPG smoke,
so `r_fireball.js` also draws the rocket/grenade smoke trails (`r_smoketrail.js`, card
T-f90bdd2c, `docs/rocket-grenade-smoke-2026-10-08.md`) in the same layer, depth-sorted together
with the explosion clouds.

## Differences from the source (deliberate or known)

* **No soft-depth fade.** The source fades puffs, flash and sparks against its opaque
  depth texture. Quaked does not expose a sampled scene depth to effects, so clouds
  meet walls with a hard depth-tested edge.
* **Relighting.** Like every effect that does not write depth, the clouds are passed
  through the engine's deferred lighting using the surface behind them. Capturing the
  same frame with dynamic lights disabled showed no visible difference, so it was left.
* **Split demo light.** During the split the Classic half shows the Fireball-driven light
  rather than the native one-shot light.
* Close up, the cloud shows less mottling than the source's frame because its 128-px
  atlas tiles are magnified; from game distances it matches. The ring is a flat quad
  and does not stop at ledges.
* The source's stage floor, scorch texture and camera are demo scaffolding, replaced by
  the real level, the existing scorch decal and the player's view.

## Verification (what was run)

* `tests/fireball_test.js`, 13 tests: the ported cloud, spark and spark-position functions
  equal the source's own functions, extracted from the source file and run in a sandbox,
  over 4 burst ids × 9 ages (about 600 clouds and 1,000 sparks, to 1e-12); bounds and
  expiry; fallbacks (Classic, textures missing, no scene, `r_fireball 0`); frame output
  in Quake coordinates (clouds above the detonation, sorted far to near, ring basis in
  the floor plane, radius on the source curve) and that every ported cloud of each of
  two live bursts appears at its own age and origin (no stale state); pool bound, the
  1.5 s yield rule, expiry, map change and Classic mid-burst; all three families through
  the public wrappers; the light's strength and radius curves and its absence for tar;
  render order above the decals and the XR spark projection; the backwards-clock case;
  and the split view (Fireball for the Newer half, a hidden 1,024-particle
  Classic-only mesh, nothing double). Run with
  `QUAKED_FIREBALL_SOURCE_REQUIRED=1` the equivalence test fails instead of skipping
  when the local source file is absent. Reverting individual fixes (render order, XR
  projection, young-burst eviction, the backwards-clock deletion) makes the matching test
  fail.
* Two independent code reviews. The first found 2 blocking defects (the scorch decal
  drew over the fireball; sparks ignored the XR model matrix) and 11 others; the second
  found 1 blocking (the backwards-clock deletion) and 5 more; all were fixed.
* Real browser (`tests/fireball_trial.html`, Chromium on Metal, live E1M1): synthetic
  bursts frozen with the game's own `pause` at 0.05–3.8 s against the source's own
  frames; **real rocket impacts** on a wall (ring on the wall, scorch, light, sound
  intact); 8 simultaneous explosions stay at 6 bursts and the buffer caps with no page
  errors and ~16.5 ms frames; a map change leaves 0 bursts; the real attract-demo
  split (left ENHANCED shows the Fireball, right CLASSIC the original particles);
  `r_demosplit 2` showing only the original.
* Full suite: every failing file is identical to the pristine baseline (they need
  `QUAKED_OWNED_PAK` or weapon `.zip` fixtures not present here).

## Not yet covered

* Water and portal views: they share the scene and its clipping planes; only unit-level
  bounds are tested, no photographs.
* The `cl_tent.js` light skip (no native light when the Fireball took the event, native
  light restored when it declined) has no unit test; it is exercised by the real rocket
  run.
* Real GPU timing in VR is untested; the per-frame cost is a few thousand scalar writes.
