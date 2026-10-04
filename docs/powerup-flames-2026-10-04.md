# Power-up flame effects

Publication authority update: the owner requested **commit and push** on
2026-10-04. This supersedes the earlier local-only authority statements below;
those statements and receipts describe their original verification stage.
See [combined commit verification](enhancements-commit-2026-10-04.md).

The three native world pickups now have enhanced presentation without changing
their models, skins, collision, inventory effects, pickup rules or respawn rules.

| Pickup | Presentation |
| --- | --- |
| Quad damage, `progs/quaddama.mdl` | White rising flames, a purple halo and purple environmental light. The glow pulses gently between 88% and 112% at a roughly three-second period. |
| Invulnerability pentagram, `progs/invulner.mdl` | Yellow flames and a soft dark shroud on the far side of the item relative to the current camera. |
| Invisibility ring, `progs/invisibl.mdl` | Yellow halo and animated flame-shaped light projected onto surrounding solid surfaces. |

These are Newer Game effects. `r_powerups 0` disables the entire layer;
`r_powerups 1` enables it. Classic retains the original pickups. Environmental
light follows the existing `r_newer_lighting` option. Animation uses simulation
time, so it freezes with the scene and is deterministic for a given time/pose.

## Implementation and ownership

`r_powerups.js` owns only effect groups and their light-source records.
`R_RenderScene` starts and ends a visibility epoch; the existing alias draw calls
`R_PowerupSeen` after drawing the actual native pickup mesh. The helper excludes
the held viewmodel. An absent, collected, replaced, disabled or no-longer-visible
pickup loses its effect group and light source at the end of that scene build.
`R_NewMap` clears the registry. Respawn creates a new presentation from the live
native entity. No speculative entities or QuakeC changes are involved.

The module's own registry removes groups and disposes their owned sprite
geometry/materials. It does not own or dispose the native mesh or texture.
Classic's extra draw does not start a second lifecycle epoch: helper calls are
no-ops during Classic, effect groups carry `newerOnly`, and the existing scene
save/restore restores visibility afterward.

Fire is a procedural volume rendered by `r_powerupfire.js`, with at most 40
front-to-back density samples per visible fragment. A scalar distance field is
computed from the actual native triangles and model thickness; it describes
fuel geometry, not a coloured flame image. Advected 3D noise and upward fuel
transport produce curling, translucent fire. There are no painted flame sprites,
flame stencils or generic circular flame frames. Its bounds inherit the item's
actual world rotation and scale, and simulation time animates the density.

A source-derived convex prism protects the readable glyph and its negative
spaces along the viewing ray. It is never drawn as an image. Its coverage also
excludes bloom from the symbol. The shallow surface tint samples the current
native texture to retain its detail; the pentagram's five real inner bars stay
connected in yellow. Derived fuel and guard resources rebuild only when native
position/index identity changes. The original geometry, UVs and texture remain
owned by the native renderer.

Fire renders into one separate, lazily resized half-float emission target. The
shader reads the resolved opaque HDR depth from a DIFFERENT framebuffer and
clips each ray at the nearest opaque surface. No source-depth feedback or
opaque-scene redraw is used. It handles box entry/exit, near clipping and
camera-inside rays; its coordinate path also supports orthographic cameras.
The compositor adds emission after deferred lighting and shroud suppression,
so purple environmental light cannot multiply/recolour the white fire. Bloom
samples the sum of scene and fire, with the protected glyph excluded. The same
emission is included in screen-space reflected receiver colour. This is a
bounded visual volume shader, not a physical combustion simulation.

The quad's separate halo remains view-facing and gently pulses. The pentagram's shroud is a depth-tested,
non-depth-writing billboard with an opaque deep-black core and smoky feathered edge, shifted away from each active camera
by the transformed model's bounding radius plus its lift and a margin. This
keeps it behind the whole model, including diagonal and overhead views. It
does not darken the screen indiscriminately or draw through foreground walls.
Clipping-plane shader support retains the renderer's reflected-view clipping.

The halo, shroud and surface tint write zero-alpha normal, albedo and height-mask outputs. Volumetric fire writes only its separate emission target.
They colour the HDR image while preserving the opaque receiver data beneath.
The compositor uses two float texels per currently visible shroud to reconstruct
that same billboard against the opaque scene depth. The shared opacity function
is evaluated again after deferred lighting, water, shafts and bloom, but before
exposure/colour grading. Within the shroud, it restores the original HDR scene
that contains the black smoke and original glyph; fire emission is added separately afterward. This keeps
the black void from being filled back in by deferred lights while leaving the
opaque symbol and nearer walls unmasked. There is no extra scene render, fifth
MRT, or eight-shroud cutoff. Hidden/disabled/Classic/collected shrouds have count
zero; map reset releases their metadata texture.

Pickup light sources enter the existing `selectLights` path before
`R_PostLightsFrame` freezes the source slots. They share the existing eight-light
budget, point-shadow atlas and local height-shadow visibility. Source identities,
base powers, receiver ranges and ranking stay stable as the quad pulses; only
radiance changes. Light positions use entity XY plus native model-centre Z so
rotation does not trigger unnecessary world-shadow recaptures.

The ring's cookie transforms receiver-minus-source world direction into the ring's actual local rotation.
Periodic azimuth harmonics avoid a seam at ±π; elevation forms upward flame
silhouettes and simulation time animates them. The cookie multiplies incident
point light before the existing receiver/shadow evaluation, including the shared
solid reflection-lighting function. Turning the camera does not move the pattern
around the room. Turning the ring rotates its projection in lockstep; the
orientation quaternion is copied into the pre-render light snapshot. Existing light-budget, visibility and shadow settings still
apply; this adds no extra unbounded light or shadow pass.

## Shader warm-up lifetime repair

Native testing exposed a real map-switch race: Three 0.183 `compileAsync` keeps
material objects and later polls their `currentProgram`. Disposing a material
during that interval deletes the renderer properties; the polling timer throws
outside the promise, leaving warm-up pending indefinitely.

`r_shaderwarm.js` now leases the actual scene materials during compilation.
Removal from the scene and gameplay cleanup remain immediate; only GPU material
disposal is deferred. Overlapping warm-ups share a reference count. The final
settlement restores the original own/prototype disposal method and performs one
pending disposal. Synchronous throws and promise rejection release leases too.
This preserves compilation of the actual material hooks and variants; it does
not substitute clones or mark unfinished compilation ready.

## Verification and owner trial

Independent planning and final source review covered lifecycle, camera-relative
shroud depth, shared source ordering and asynchronous disposal. A separate agent
wrote public-interface and GPU tests.

The [source identity receipt](evidence/powerups-source-2026-10-04.json) records
SHA-256 hashes for the current implementation and diagnostic sources.

- [Automated receipt](evidence/powerups-tests-2026-10-04.txt): **62/62 pass**.
  Coverage includes real native alias dispatch, exact source attributes/skin
  preservation, collection/respawn/model replacement/map clearing, lighting
  gates, stable source selection, 40 shroud camera directions, Classic
  isolation, and asynchronous shader disposal/error paths. Existing Classic,
  height-shadow, flashlight, loading and rock-field regressions also pass.
- [GPU receipt](evidence/powerups-gpu-2026-10-04.json): actual PAK models and
  skins, production sprite shaders and HDR compositor. Solid normal, albedo
  and packed height-mask attachments remain byte-identical with sprites hidden.
  Sprite HDR and ring-cookie effects are nonzero; every measured GL error is 0.
- [Extended GPU receipt](evidence/powerups-gpu-extended-2026-10-04.json): ring-only
  projection changes across time; twelve fixed wall receivers remain stable
  across camera rotation (median RGB difference 0, maximum 4/255). A ready
  production point-shadow cube blocks light behind an opaque box. Classic
  renders remain byte-identical with power-ups toggled, with a nonblank target
  and zero available enhanced light sources.
- [Native collection](evidence/powerups-native-collection-2026-10-04.json): the
  actual E1M1 quad was collected through native QuakeC touch handling; its model,
  effect group and live light source disappeared. This is not a simulated test
  removal.
- The corrected live E1M1 collection → [E1M3 ring](evidence/powerups-native-ring-2026-10-04.json)
  → [E1M8 pentagram](evidence/powerups-native-pentagram-2026-10-04.json)
  sequence retains an empty cumulative runtime-error list and GL error 0. The
  [native pentagram view](evidence/powerups-native-pentagram-2026-10-04.jpg) shows
  the depth-tested shroud and yellow flames after orbiting the item. Shader
  warm-up no longer throws the observed disposed-program error in this sequence.

[Bounded comparison room](http://localhost:8013/tests/powerups_gpu_trial.html)
shows all three native models together. Use the focus buttons, rotate items,
orbit, or choose **Animate fire (20s)**. Animation is bounded to twenty seconds
and stops before automated checks; those checks use fixed draws.

[Native gameplay trial](http://localhost:8013/tests/powerups_gameplay_trial.html)
visits the original pickups in E1M1, E1M3 and E1M8. It places a protected test
player at an unobstructed inspection angle; Orbit, Collect, Effects on/off and
Classic comparison exercise the actual engine. These trial-only player settings
do not change ordinary gameplay.

Owner acceptance of flame shape, brightness, pulse and shroud appearance remains
pending. The effects are implemented and tested; the small GPU room is not a
sustained frame-rate qualification. No commit, push or release is implied.


## Owner reference and rotation refinement

The [owner's visual target](images/powerup-effects-target-2026-10-04.png) calls
for curling white flames separate from purple illumination, yellow flames
against a DEEP BLACK shroud, and broader flowing yellow projections on stone.
The subsequent request requires the effects to rotate in lockstep with the
items. The final implementation uses a model-local fire volume and item-local ring
projection; the shroud deliberately keeps the earlier far-side camera contract.
The native artifact meshes and texture artwork remain unchanged.

Earlier receipts above describe the initial increment. Updated refinement and
rotation receipts are recorded below after final verification; they must not be
inferred from the older screenshots or initial 62-test run.


The owner further clarified that the quad must not use a circular flame frame
and that the pentagram's inner lines must also connect in yellow. The final
refinement replaces that proxy shape with native-edge emitters and a native
surface emission layer; it retains the requested rotation and far-side shroud.


The latest owner clarification supersedes the earlier planar edge-ribbon
implementation: the fire must be realistic shader animation, with strong flames
that do not obscure the original designs. The volume renderer and separate
emission path above are the final implementation of that clarification. Earlier
ribbon screenshots and their shape tests are historical, not evidence for this
version. Current volume-specific receipts are listed below after verification.


## Current volumetric verification

- [Current automated gate](evidence/powerups-volume-tests-2026-10-04.txt):
  **68/68 passed**, including native-model distance-field oracles, exact original
  topology/UV preservation, rotation and frozen light orientation, sampler and
  target lifetime, projection uniforms and render-state restoration on failure.
- [Actual volume GPU check](evidence/powerups-volume-gpu-2026-10-04.json): seven
  fixed draws through the production emission target. Changing only time from
  1 to 1.5 changed 38,944 emission RGB components while native pose and camera
  stayed exact. No nonfinite values or GL errors occurred.
- The same check measures 11,114 emitting pixels with no wall, 4,541 with a partial
  opaque wall and zero behind a complete opaque wall. Scene HDR and all receiver
  MRTs stay byte-identical; the tested symbol/foreground pixels do not change.
- [Deep-black check](evidence/powerups-volume-black-2026-10-04.json): front,
  oblique, back, overhead and half-raster cases all pass. The sampled guaranteed
  smoke core is RGB 0 against a bright wall, with native symbol and foreground
  panel unchanged. The receiver oracle excludes actual bilinear boundary
  mixtures rather than accepting their expected silhouette blending as a fault.
- [Current ring and Classic check](evidence/powerups-volume-classic-2026-10-04.json):
  animated ring projection, camera invariance and opaque blockers pass; Classic
  power-up on/off is exactly identical. All measured GL errors are zero.

These receipts qualify the tested desktop HDR path and bounded scenes; they do
not claim physical combustion simulation or a sustained frame-rate benchmark.
The owner still decides appearance acceptance. Use the twenty-second animation
control to assess motion rather than judging the shader solely from a still.
