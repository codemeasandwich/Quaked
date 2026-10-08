# Torches and fire pits: the supplied "02 Wall torch" flame

Card T-f0cab47c, "[28] Torches and fire pits: automatic scaled source-flame replacement".
Baseline Dev `e4f7a55`. In Newer Game every torch and fire pit gets the supplied flame **laid
over the native flame model**, whose own glow stays and gives the flame a 3-D body inside it
(owner's direction). `r_torchfire 2` instead replaces the native flame with it; `r_torchfire 0`
and Classic Quake keep the original flame models.

## Source

* Owner-supplied `fieldlab-fx-3d-updated.html`, SHA-256
  `7e35fc808c24200e9dbf2b010a72d2fbea04aca567528ebd2e61e79979afc7d6` (gitignored; local,
  never edited or distributed). Effect: tab "02 / STONE-WALL TORCH".
* Extraction map (source lines): `cardVert` 112, `fire` 115-119, `card` 147,
  `torchEmbers` 197, `torchSmoke` 198, `light` 202, render 213, `configs.fire` 229, defaults
  `fire:{size:1, turbulence:1.6, glow:1.8, wind:0}` (line 50). Recorded in
  `newer/effects/fireball/provenance.json`.
* No new asset: the flame is procedural (it erodes the seamless noise texture the Fireball
  already loads) and its faint smoke uses the same smoke atlas.

## What replaces what

Every torch and fire pit in Quake is a static entity drawn with one of two alias models. The
stock levels have, for example, 31 `flame.mdl` and 10 `flame2.mdl` in the hub and up to 128 in a
level.

Default (`r_torchfire 1`): every model below is drawn exactly as before and the supplied flame is
added on top. With `r_torchfire 2` the following happens instead:

| Model | Used by | What the model is | What happens with `r_torchfire 2` |
|---|---|---|---|
| `progs/flame.mdl` | wall torches (`light_torch_small_walltorch`) | the flame **on its wooden handle** (122 triangles; 36 of them are the handle) | the 86 flame triangles are not drawn; the handle is drawn as before |
| `progs/flame2.mdl`, frame 0 | `light_flame_small_yellow`, `light_flame_small_white` | the flame alone (the brazier is a brush of the map) | whole model replaced |
| `progs/flame2.mdl`, frame 1 | `light_flame_large_yellow` | a flame twice as tall and wide | whole model replaced |

Nothing is registered by hand: any entity that draws one of these models is picked up when the
entity list is drawn, on any map. The brackets and braziers are world geometry and are not
touched. The pit's soft container shadow (`R_FireBase`, `gl_rmain.js`) is still produced.

**Fallback to the native model** (each case draws exactly what the game drew before; in mode 2
never nothing and never both): Classic Quake (`r_hdr 0`) and the classic half of the title demo's
split; `r_torchfire 0`; the effect textures not loaded yet or failed to load; no scene; more
than 128 torches in one frame; any entity with another model (custom fixtures, other-level views
through portals, which draw their own flames in `r_levelview.js`); and `flame.mdl` if its handle
is not the known one, or `flame2.mdl` is not the stock model (below; both only matter to mode 2).

**Light.** The source's point light (`light()`, line 202) is *not* ported and none is added.
The torches' light in Quake comes from the map's light entities (`gl_post.js` `worldLights`,
flicker from `R_FireFlicker`) whatever model the entity draws, so there is exactly one light
owner and its flicker and style are kept. The new flame therefore does not change what a torch
lights, and its own animation is independent of the light's flicker.

## How it is built

* `src/r_torchfire.js`, pure part: the model's **parts** (`torchParts`), the flame's **extents**
  (`flameExtent`), the registry the entity list fills, and the source's ember and smoke
  functions (`forEachEmber`, `forEachSmoke`), which equal the source's exactly. No state is kept
  per torch.
* Renderer part, same file: three instanced layers (smoke puffs, flame cards, ember streaks)
  using the shaders, textures and layer helpers of `r_fireball.js` (exported from there). The
  flame card is the source's `cardVert`/`fire`: an upright card (world up) that turns about the
  vertical to face the camera. Embers and smoke are the source's, drawn in the shared puff and
  spark shaders. Draw order follows the source (smoke, flame, embers) after the scorch decals.
* `gl_rmain.js`: `R_DrawAliasModel` asks `R_TorchFire( e )` first. It returns `TORCH_WHOLE` (the
  model is not built; mode 2), `TORCH_OVERLAY` (the native model is drawn and the flame added; the
  default), `TORCH_HANDLE` (the model is built with `e._aliasPart` so that only the
  handle's indices are drawn) or 0 (native). `R_RenderScene` calls `R_TorchFireBegin()` before
  and `R_TorchFireFlush()` after the entity list: the visible static entities are added to the
  list inside `R_RenderScene` (`R_DrawWorld`), so the flush has to follow it.
* `gl_mesh.js`: `entity._aliasPart` (a function returning an index buffer) draws part of a model,
  re-applied when it changes; and a missing colour array is rebuilt (see "A bug found in use").

### Scale and position from the fixture

The source's flame is `flameHeight` = 3.25 / 1.76 = 1.847 source units from root to tip (the
shader maps the card's height to 1.76 flame heights and the flame ends at 1). For each entity
the average height of the **flame triangles** over the poses of its own frame group (wall torch
25.4 units, small pit flame 25.4, large pit flame 50.7), times `TORCH.fit`, is mapped onto that,
so the three kinds keep their relative sizes (in the default overlay mode the flame triangles are
only measured, not left out). The flame's root is the lowest point of its
triangles: for the wall torch that is the top of the handle (z = 1.4), not the model's origin.
One source unit is `height * fit / 1.847` Quake units (11.0 for a wall torch). The card is
2.8 x 3.25 source units with its centre 1.385 above the root (render 213).

`TORCH.fit` = 0.8 is a judgement (made on the replace-mode pictures; in the default mode the native
flame is under it as well): the models' extents are set by thin tips, and the body that
reads as flame is about 0.62 of them for a wall torch (about 78 px against 127 px in one photograph)
and more for the tall pit flame; 0.8 was chosen by eye so each kind is at least as present as
the flame it replaces. It is one number in the frozen `TORCH` object.

### Differences from the source

1. **Per-torch phase.** The source has one flame and one clock. Each torch adds a phase
   (a hash of its origin, 0-97 s) to the clock, so a row of torches does not burn in step.
2. **No heat-haze displacement.** The source also bends the picture behind the flame by sampling
   the opaque scene colour. Quaked does not expose the scene colour to effects, so the displacement
   is left out. The haze's *coverage* is kept (the source's coverage is max(alpha, haze * .75,
   glow * .32)), and where the source blends its own sample of the background the port blends the
   background itself, which gives the same result without the bend (out = (flame * alpha + glow) *
   coverage, blend factor alpha * coverage). An independent review found a first version had
   dropped the haze term from the coverage (dimmer, shorter flames); it is restored and the test
   now compares the coverage statement too.
3. **No soft-depth fade** against walls, as for the Fireball and the smoke trails.
4. **Handle detection by skin columns.** The wall torch's handle is told apart by the skin
   columns it occupies (s / width 0.10-0.22 and 0.60-0.72), which was read off the stock skin;
   `torchParts` requires exactly 36 such triangles, all below z = 2.5, and otherwise declines
   (the native model is drawn). Another model name has no handle rule at all.
5. The source's ember and smoke sizes are in its units, so they scale with the flame.
6. **Sorting.** The source has one flame. Several flames blend over one another and write no
   depth, so the cards are sorted back to front each frame, like the puffs.

## Bounds and cleanup

At most 128 torches per frame (the engine's static-entity limit), preallocated: 128 flame
cards, 2,048 puffs, 2,816 embers. Nothing is allocated per frame (the shared texture object is built
once, and the title demo's classic pass reuses a torch's existing colour buffer). The registry is cleared at the
start of every frame, so a torch that leaves the view or a switch to Classic or `r_torchfire 0`
removes its flame in the same frame; the layers are hidden and emptied when nothing is
registered and on every map change (`R_TorchFireClear` from `R_NewMap`); no per-torch
resource exists to leak, and repeated loads or toggles cannot duplicate fire.

## A bug found in use

The first run of the title demo's Newer | Classic split threw a `TypeError` every frame. A pit
flame that the supplied effect draws has no native mesh in the Newer pass but does own its
fire-base shadow mesh, so the classic pass's save/restore recorded it, restored its colour
array to null and kept the geometry the classic pass had made; the next classic draw then
dereferenced the null array. The alias mesh now rebuilds a missing colour array, and
`tests/torchfire_test.js` pins it (it fails when the guard is removed). The review then found that
the first guard allocated a new buffer every classic pass and that the classic pass did not restore
which part of a model had been drawn (a wall torch could show only its handle for up to 0.1 s); both
are fixed and tested.

## Verification (what was run)

* `tests/torchfire_test.js` (14): the ember and smoke functions equal the source's own, run in
  a sandbox against the source file (54 states, 1,188 embers and 864 puffs, 1e-12; with
  `QUAKED_FIREBALL_SOURCE_REQUIRED=1` the test fails instead of skipping without the file); 19
  statements of the flame shader, coverage included, are found verbatim in the source's, with the
  one deviation listed (the per-torch phase), plus `flameColor`, the card size and centre and the
  defaults (the vertex shader is not compared: it is the source's card written for three's
  instancing);
  the stock models split into 36 handle triangles and a flame, flame2 has none; heights of the
  three flame kinds; routing of wall torch, small and large pit flames, a soldier, no model;
  every fallback (Classic, classic pass, `r_torchfire 0`, no textures, no scene, past the cap);
  a frame's world-coordinate output (card centre 1.385 units above each root, ember reach,
  puffs sorted back to front); phases differ and no state is stale between frames; hiding and
  emptying on an empty frame and a map change; the alias mesh's handle-only drawing and the
  colour-array guard and its buffer reuse; the classic pass's restore of the drawn part; back to
  front card order; the default overlay and the mode-2 routing; and the order of the renderer's
  calls (a text check of `gl_rmain.js`, so it would not catch a wrong order with the same text).
  Fourteen deliberate mutations (ember rise, a shader constant, a lower cap, no phase, root at the
  origin, replacement in Classic, no part change detection, no colour guard, dropped pit shadow, no
  haze in the coverage, no card sort, no part restore, no colour reuse, no stock check) each make
  a test fail.
* Real browser (Chromium on Metal, `tests/torchfire_trial.html`, stock `start`, `e1m3`):
  photographs of a wall torch, a small pit flame and a large pit flame beside the same views
  with `r_torchfire 0`; Classic (`r_hdr 0`) showing the original models; `r_torchfire 0` and
  back; `r_hdr 0`/`1` toggles; map changes start to e1m3 and back (counts return to the same
  19 / 2 / 19 with nothing accumulated); the overlay (default), replace (`r_torchfire 2`) and native
  views of the same wall torch and a large pit flame; the real title demo split (0 page errors after the
  fix above); no page errors in any run.
* Cost: in a torch-heavy hall (e1m3, 44 flames registered, 1920 x 1080, headless Chromium on
  Metal, 600 frames per run, three runs each) the frame time is the same within noise with the
  supplied flames (median 55.5 / 58.4 / 38.9 ms) and the native models (59.0 / 56.9 / 58.9
  ms); the scene itself is heavy there and the flames are not measurable in it.
* Full suite (all 194 test files): 833 of 866 checks passed. The failing count (33) and the
  number of failing files (15) are the same as before this change; those files need
  `QUAKED_OWNED_PAK` or weapon `.zip` fixtures that are not present here.

## Known limits and open items

* No heat haze and no soft-depth fade (above).
* The light is the map's own and its flicker is not synchronised with the flame's animation.
* Flames seen through a portal into another level (`r_levelview.js`) keep the native model.
* Seen from directly above a pit, the upright card is edge-on (as in the source); in the default
  mode the native model still shows its flame from there, in mode 2 it does not.
* In mode 2 a wall torch's handle keeps the full-bright torch lighting the whole model has, which
  may read as glowing without its flame; not checked beyond the photographs.
* Not photographed: water and portal views, VR (the flame uses the same clipping-plane and XR
  scale code as the other layers, but no test touches either), and the title demo
  split at a moment when a torch is in view in both halves (the counts and the absence of
  errors were checked; a torch was in the enhanced half's view in one capture).
* `fit` is an eye-chosen calibration.
