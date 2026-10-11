# The Scrag's spit: the supplied twin-shot venom

Card T-18792e32, "[SP1] Scrag spit: replace with the supplied twin-shot venom effect".
Baseline Dev `459bde6d`, branch `claude-fx-spit`. In Newer Game every Scrag (Wizard) spit is drawn as
the supplied liquid jet, one jet per native projectile; Classic keeps the original picture.

## Source

* Owner-supplied `twin-shot-venom.html` ("TWINSHOT — Venom FX Lab"), 66,452 bytes, SHA-256
  `7cf9a25dfc9fd8aa9bd5a49319248822f0774501002d23da475cd3a30cf9e934`. Kept local and never
  committed (`/twin-shot-venom.html` is gitignored, like the other supplied pages).
* The effect is the ES module held as one JavaScript string on source line 79
  (`const source="..."`): `TwinVenomFX` with `twinPlan`, `streamWindow`, `STREAM_VERTEX`,
  `LIQUID_FRAGMENT`, `DROP_VERTEX`, `SPLAT_FRAGMENT`, `streamGeometry` and `DropletPool`.
  `startLab()` (the cobra, target board, UI and chat) is the page's playground and was not used.
* It is all procedural: there are no image assets, so nothing was extracted as a file.
* What was taken, and where it went: `newer/effects/venom/provenance.json`.

## What the game does, and what is replaced

QuakeC (`wizard.qc`): the Scrag's fast attack `Wiz_StartFast` spawns two helper entities, one on
each side of its mouth (`origin + '0 0 30' + v_forward*14 ± v_right*14`), which fire after 0.8 s
and 0.3 s (`Wiz_FastFire`). Each launches one `progs/w_spike.mdl` missile at 600 units/s at a point
13 units to one side of the player. `spike_touch` damages what it hits (blood when that bleeds) or
sends `TE_WIZSPIKE` for a wall. The model carries `EF_TRACER` (flag 16), which the client draws as
the green tracer trail (`R_RocketTrail` type 3); it is the only id1 model with that flag.

| Native piece | Newer Game with `r_venom 1` | Owner |
|---|---|---|
| `w_spike.mdl` mesh | not drawn: the venom stream is its picture (`R_VenomTakesEntity`, asked by `R_DrawEntitiesOnList`) | gl_rmain.js |
| green tracer (`EF_TRACER`, trail type 3) | not drawn (`R_VenomTrail`, asked by `render.js R_RocketTrail`; cl_main.js now passes the entity number for type 3) | cl_main.js / render.js |
| `TE_WIZSPIKE` particle spray (palette 20, 30 particles) | the source's impact: the stream runs on to the point, splashes and leaves a stain (`render.js R_WizardSpikeImpact` -> `R_VenomImpact`) | cl_tent.js |
| hit sound `wizard/hit.wav`, the Scrag's muzzle-flash light | unchanged | cl_tent.js / cl_main.js |
| motion, speed, collisions, damage, timing | unchanged (no server, QuakeC or client movement code is touched) | server / QuakeC |

`TE_WIZSPIKE` has no decal in this engine (only `TE_SPIKE` marks the wall), so there was no decal to
keep; the stain below is the source's own and belongs to the venom picture.

Classic, `r_venom 0`, and the Classic half of the title demo's split view keep the native mesh,
tracer and spray. In the split the native tracer and spray are spawned `classicOnly` (as the Fireball
does), and the Classic pass draws the native mesh (`R_ClassicPassActive`), so neither half shows both.

## One jet per native projectile (the "twin")

The source's "twin shot" is one activation firing two lanes at once, from two fangs to two points
either side of the target (fang gap 0.20 m, target gap 0.72 m). The Scrag already fires two
projectiles from either side of its mouth (±14 units) to points either side of the player (±13
units). So each native `w_spike` entity is drawn as exactly one lane, and the pair of lanes is the
Scrag's pair of spikes. Nothing is added: no extra projectile, no second jet per spike. The one
difference is timing: the source fires its two lanes together, the Scrag 0.5 s apart; that is
gameplay timing and stays native.

## Motion

The source's stream is a finite packet on a straight ray (`streamWindow`): the leading edge travels
at the jet speed, the trailing edge leaves the mouth `duration` (0.28 s) later at the same speed, and
when the leading edge reaches its target the packet drains into it. Here:

* **Leading edge = the native entity.** Each frame `R_VenomFrame` (called from `R_RenderView` before
  the entities are drawn) finds the `w_spike` entities in `cl_visedicts` and puts each stream's
  leading edge at its entity's interpolated origin, measured along the stream's ray (below).
* **The mouth (card [SP2]).** The owner asked for the spit to come from the Scrag's face.
  * **The problem.** The client first sees a missile a server frame or two after launch, about
    60 units out. QuakeC launches it beside the Scrag's head, not from its mouth:
    `origin + '0 0 30' + v_forward*14 ± v_right*14`.
  * **The Scrag.** The stream belongs to the nearest `progs/wizard.mdl` behind the spike within
    48 units of its ray.
  * **The fang.** Its stream starts at a fang on that Scrag's face. The source's jets leave its
    creature's two fang sockets, 0.13 m either side of the mouth (`twinPlan` `origins`). Here
    the mouth is the jaw corner of id1's Scrag model, vertex 52 on its centre line. It is read
    from the pose on screen: Newer Game blends poses over 0.1 s (`r_anim.js`), and QuakeC fires
    each spike on the think that changes the Scrag's frame. So the jaw is blended between the
    previous frame and the new one exactly as the mesh is drawn. For example, it sits 11.5
    units forward, and between 24 and 31 units up, from `magatt3` to `magatt4`.
  * **Placement.** The mouth is turned with the Scrag as the renderer turns it. The fang is
    `VENOM_MOUTH.fang` (0.13 m, 3.5 units) to the side the spike was launched from.
  * **The stream.** It is one fixed ray, from the fang to the end of the spike's own flight.
    That end is sampled once at launch along the spike's direction: the player, or the first
    wall. The spike, launched about 11 units beside the fang, stays close to that ray and
    meets it at the end. The ray is not re-aimed in flight, so the stream's narrowing and its
    droplets keep to the stream's own line. Each stream also keeps the spike's own flight line,
    from where it was first drawn along its direction. The check that tells a reused entity
    slot from the stream's own spike, and the matching of a splash, measure against that line.
    If the player dodges, the spike flies on past the estimated end: from then on the ray turns
    onto the spike, as a ray without a Scrag does, at a small angle by then.

    The first version re-aimed the ray at the spike every frame. The [SP2] reviews found that
    broke the limit, the droplets, the reused-slot check and the splash match, and later that
    a fixed ray alone lost a dodged spike past its end. Both were fixed and are tested with
    QuakeC's launch geometry:
    * the limit at the player;
    * a 0.2 s stall;
    * a dodge to the wall behind;
    * a Scrag turned 60 to 90 degrees;
    * a hit partway along the flight.
  * **Limits.** When the Scrag has turned since it stored its launch points, its face is
    further from QuakeC's launch point. At 90 degrees the drawn head is up to about 30 units
    off the spike at the start, closing in as it flies. The jaw comes from the blended pose
    only while pose smoothing is on and was drawn in the last 0.25 s. Otherwise it comes from
    the frame's own pose. The fang is fixed at launch. The jaw moving during the 0.28 s the tail takes to
    leave it is not followed. A Scrag mesh with frame groups would use each group's first
    pose; id1's has none.
  * **Fallbacks.** A Scrag mesh with a different vertex count uses QuakeC's launch height on
    the centre line (14 forward, 30 up). With no Scrag in view, the ray starts where the spike
    was first drawn.
* **Trailing edge.** `duration × speed` (0.28 s of flight, 168 units) behind the entity while it flies.
* **Impact.** `TE_WIZSPIKE` arrives in the same server message that removes the spike. It is matched to
  the stream whose ray passes within 16 units of the point (no more than 32 units behind its drawn
  leading edge or 160 ahead, since the drawn entity is a frame behind the server). That stream's end
  becomes the point; when the entity goes, its leading edge carries on at the jet speed to the point,
  the splash and stain appear, and the trailing edge drains into it, at most 0.28 s later.
* **Gone without an impact** (it hit a monster or the player, which bleed instead, or it left the
  view): the stream stops where the entity was last drawn (unless the launch estimate below is within
  64 units) and drains; no splash or stain.
* **The stream's end before the hit.** The source narrows and breaks its stream towards the target it
  knows at launch. A Quake spike's end is unknown until it hits, so it is estimated once at launch (as
  the source samples its target): the player if the ray passes within 40 units of the view, otherwise
  the first solid leaf along the ray. Only the narrowing and break-up use it; the impact waits for the
  server's message.
* **Droplets.** The source's fixed pool (900): fine fragments riding the stream (125 per second per
  stream) stop at its end; splash droplets (30 at the hit, then 85 per second while the stream drains)
  fall under gravity and die in solid (the source's floor plane) or behind the struck surface. 1/90 s
  substeps, as the source.
* **Stain.** The source's splat shader (ragged edge, 14 satellite spots, three runnels that lengthen),
  on the struck surface found with `R_DecalSurface` (else facing back along the stream), with its runnels
  running down the surface; 4.4 s life, at most 24.

## Scale, colour and deliberate differences

* **Scale.** One source metre = 600 / 22 = 27.27 Quake units (native spike speed over the source's jet
  speed), so every timing is the source's: the packet is 0.28 s of flight, droplet lives and gravity
  (5.3 m/s² = 145 units/s²) are its own.
* **Minimum width (port addition).** The source's strand is 3 cm across, about 3 px at its stage's
  viewing distance. A Quake view sees it far smaller, and a sub-pixel tube breaks into dashes, so the
  stream is never drawn thinner than 2.5 px (`VENOM.minPixels`); its ripples and pinches keep their
  proportions.
* **Colour.** The source's liquid shader is used as written (its two fixed light directions turned from
  y-up to Quake's z-up). The source tone-maps with ACES; Quaked's Newer composite grades the frame
  itself, so the include is not used. Measured in the browser, the brightest strand pixels are
  (193, 204, 168) in the source and (181, 201, 173) in the game.
* **Blending.** Premultiplied normal blending through the shared effect material (`r_fireball.js
  material`), depth-tested, no depth write, after the scorch decals (render order 5.1 stain, 5.2
  stream, 5.3 droplets).
* **Not taken.** The second tint, low quality, the source's collision/launch/impact callbacks and its
  playground.

## Cost

Everything is preallocated: 32 stream slots (one instanced tube, 144 × 8 segments), the 900-droplet
pool and 24 stains, as typed arrays and instanced attributes written in place each frame. Nothing is
allocated per frame after the first build (a test checks the buffers are the same objects frame after
frame). Outside Newer Game, or with `r_venom 0`, everything is dropped once and hidden.
A 33rd spike in flight at once has no stream slot and is drawn natively in flight, but its `TE_WIZSPIKE` still gets
the venom splash and stain (every `TE_WIZSPIKE` in Newer Game does; in id1 only the Scrag's spike sends one).

## How to try it

* In the game: Newer Game, a level with Scrags (E1M3 has them on normal skill; E1M2's are hard-only).
  `r_venom 0` in the console puts the native spit back; `r_venom 1` the venom.
* Trial page: `python3 tools/serve.py <port>`, open `tests/venom_trial.html`, then in the console
  `await venomTrial.start(true, 'e1m3')`, and `venomTrial.spit(venomTrial.wizards()[0].index, at, aim)`
  moves a Scrag of the level to `at` and runs its own `Wiz_StartFast` at a blank edict at `aim`
  (or the player when `aim` is null). The missiles are the real ones. The first sight of a Scrag opens
  its Bestiary page and holds the game; unlock it first (`localStorage['quaked.bestiary.v1'] =
  '{"version":1,"unlocked":["scrag"]}'`) or press a key.

## Checks

* `tests/venom_test.js` (public interface: the hooks and the engine wrappers): the ported
  `streamWindow` and shader lines equal the source's own (run against the local source when
  `QUAKED_VENOM_SOURCE` points to it, skipped otherwise); Classic and `r_venom 0` keep the native mesh,
  tracer and 30-particle spray, and switching off mid-flight drops everything; one stream per spike,
  following its entity, mesh and tracer left out, other models untouched; a `TE_WIZSPIKE` ends the
  stream at the point with a splash and a stain and it drains within 0.28 s, the stain gone after
  4.4 s; a spike gone without an impact just drains; the entity is only read and the module imports no
  server, QuakeC or client-movement code; the split view; fixed buffers. Each test was shown to fail
  under a targeted change to the code and passes on the committed code.
* Browser (Chromium on Metal, E1M3, real `Wiz_StartFast`): Newer, Classic and `r_venom 0` frames,
  compared with the source page's own frames:
  `docs/evidence/scrag-venom-side-by-side-2026-10-11.png` (top row the source at 0.25 s, 0.40 s and
  its impact view; middle row the game close up, mid flight, and the impact enlarged; bottom row
  Classic, `r_venom 0` and the game's impact at a distance).
* What differs in the browser: at Quake viewing distances the two strands read as single continuous
  pale lines (the source's fine highlights and gaps are below a pixel or two); the stain is about 18
  units across, so its runnels are only visible close to the wall; the pair of lanes is 0.5 s apart.

## Files

* `src/newer/render/r_venom.js` the port; hooks in `src/engine/common/hooks.js`, filled by
  `src/newer/install.js`.
* `src/engine/render/gl_rmain.js` (cvar, setup, frame, draw loop), `src/engine/render/render.js`
  (`R_RocketTrail` type 3, `R_WizardSpikeImpact`), `src/engine/client/cl_main.js` (type 3 trails carry
  the entity number), `src/engine/client/cl_tent.js` (`TE_WIZSPIKE`).
* `tests/venom_test.js`, `tests/venom_trial.html` / `.js`, `newer/effects/venom/provenance.json`.
* `tools/architecture_graph.mjs`: the local source page is a known-missing file, like the other
  supplied pages.
