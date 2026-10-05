# Welcome-level rock bands — 2026-10-04

## Request and observed cause

The owner reported horizontal lines on the brown welcome-level rock wall and confirmed the map is START. Native raycasts in the Hard corridor identify `bricka2_2`, with the original 256×256 replacement pigment and height texture, continuous relief enabled, and no vertex displacement.

The dark mid-tile fissure is painted into both native 64×64 art and the 256×256 replacement. It is not an anomalous top/bottom wrap edge. Independent asset inspection measured the native middle band at 15.77/255 versus 26.98 outside it, and the replacement at 18.57 versus 33.47. Fixed-camera native checks with final contrast neutralized, height shadows off, and continuous relief off still show the fissure. Therefore a contrast-only correction would not solve its repeating straight alignment. Texture repainting or blanket relief suppression would violate the original material/geometry contract.

## Small implementation increment

Only enhanced `bricka2_2` wall sampling gains a continuous, seeded UV domain warp. Original texture files, native UV buffers, positions, indices, collision geometry, lighting settings, procedural field configuration, and Classic behavior remain owned by their existing systems.

`R_RockfieldGeometry` adds a separate `rockWarp` attribute. It holds the lower 16 bits of the existing map/material/profile seed and a 0.20 tile amplitude for this material; other materials receive amplitude 0. Component IDs, allocation order, tile discovery, page residency, and camera time do not seed this function. The interpolated seed is rounded before conversion to integer, avoiding one-bit hash changes from perspective rounding.

`r_rockshader.js` computes deterministic quintic value noise at 128 and 51.2 world-unit spacing in the existing oblique rest-space chart. Two centered octaves bound each native UV offset to±0.20 texture tile, equivalent to at most 12.8 units for the native 64unit tile. It gently bends/de-aligns the painted fissure instead of removing the original rock cracks. It performs no texture blend, colour grading, animation, image regeneration, or streamed-height lookup.

The macro parallax ray keeps its original physical-to-native-UV conversion. The pigment warp is evaluated at the accepted macro hit. Diffuse, normal, authored height and emissive sampling then share the same resulting coordinates. Warped **rest** coordinates drive micro-parallax gradients, height-shadow gradients and pigment filtering. Those derivative captures occur before clipping/discard and per-source ray branches. Macro normals, cavities, sun visibility and individual-source self-shadows continue through the existing field. Classic/field-off return exactly zero offset. Shader program identity includes `v2-bandwarp` so prior cache variants cannot be mistaken for the new path.

## Playable review

Open [native START trial](http://127.0.0.1:8015/tests/rockfield_gameplay_trial.html?level=start&inspect=bands). It uses one ordinary local client/server and the real map; no fabricated rock geometry. Wait for the connected-surface status. The inspected camera is held at player origin `[864,1008,-39.969]`, yaw 0. The trial hides repeat corridor instructions while inspecting and records the player view angle consistently. **Break up bands** toggles only this new sampler offset while keeping the existing relief on. **Hard entrance** restores movement. Diagnostics expose actual visible materials and packed GPU height masks.

Native paired images retain the same inspection camera but native flame/light flicker continues; do not treat them as byte-identical lighting frames. The bounded GPU fixture separately holds its geometry, camera, lights and render state fixed for numerical comparisons.

- [Native offset off](evidence/rock-bands-native-off-2026-10-04.jpg)
- [Native offset on](evidence/rock-bands-native-on-2026-10-04.jpg)
- [Native material/GPU readback](evidence/rock-bands-native-gpu-2026-10-04.json)

## Verification and limits

Independent planning and review rejected the contrast-only hypothesis, checked batch/brush attribute propagation and matching micro sampler metrics, and identified the interpolated-seed rounding correction. Automated regression also identified the derivative timing repair. The initial old UV-expression assertion failure is retained in `rock-bands-initial-regression-2026-10-04.txt`. A subsequent 27/28 check caught capture placement after clipping; it was repaired before final verification (the receipt was reused by the passing rerun; this document retains the failure and reason).

Final checks against the frozen implementation:

- **30/30 CPU tests**: 28 focused runtime/material/chart/height-shadow/filter tests, plus 2 independent public metadata/compiler tests. [Focused receipt](evidence/rock-bands-focused-regression-2026-10-04.txt), [public receipt](evidence/rock-bands-public-cpu-2026-10-04.txt).
- **Independent GPU PASS**, 26 bounded draws using installed `bricka2_2` pigment/height and production shaders. It checks deterministic repeat frames, negative coordinate/lattice/mid-tile continuity, bounded offset, seed variation, perspective split/T-junction agreement, integer UV-phase identity, Classic/off/non-target identity, matched material data and unchanged native attributes/pixels. Maximum helper seam delta was 0.0000045635 tile; vertical fissure offsets spanned 0.28242 tile. [Readback](evidence/rock-bands-independent-gpu-2026-10-04.json). The fixture isolates the warp without resident macro pages; it does not claim fractional authored UV-phase jumps are identical.
- **Existing streamed macro-relief GPU PASS**, 8 bounded scene cases for wall/ground with 36 actual worker tiles each, matching unsplit/split/T-junction albedo, normals and composed images. [Readback](evidence/rock-bands-macro-regression-gpu-2026-10-04.json).
- **Final native START view:** 241 resident tiles, zero missing visible tiles, four HDR attachments, 789041 tagged rock pixels, GL error 0, no shader/runtime errors. Original pigment and height dimensions remain 256×256, procedural relief is active and real displacement false. Native bake loading timed out and the supported runtime generation fallback supplied all 241 tiles; this is recorded rather than hidden.
- Independent final source review found no remaining concrete declaration, sampler-metric, batching or Classic-gate blocker. Source/evidence hashes are in [the implementation record](evidence/rock-bands-source-2026-10-04.json).

Reproduce CPU checks with `QUAKED_THREE_MODULE=/private/tmp/quaked-three.module.mjs node tools/run_tests.mjs tests/rockfield_runtime_test.js tests/rockfield_required_materials_test.js tests/rockfield_connected_test.js tests/height_shadows_test.js tests/surface_filtering_test.js tests/rock_bands_test.js`. GPU trials: `/tests/rock_bands_gpu_trial.html` and `/tests/rockfield_continuity_trial.html` on the local preview server.

 Native diagnostic output distinguishes pre-existing bake-download timeout/fallback from shader errors. Runtime generation remains available; this new warp does not depend on those pages.

Scope is the demonstrated `bricka2_2` wall. Other rock texture wrap issues are not inferred from this image. Existing authored cracks remain; their repeated straight courses are broken up. This is a working local trial awaiting the owner's visual acceptance, not a claim that every possible texture seam is eliminated. Current respawn work and owner artwork are preserved. No new commit or push is performed for this increment.
