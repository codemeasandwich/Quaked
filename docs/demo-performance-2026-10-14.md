# The enhanced demos at 60 fps: where the time goes, 14 October 2026

Card T-efb1e55d. The owner: "replay the three demo sequences using full enhanced capabilities and have it at a solid
60 frames a second throughout". The title demo's enhanced/classic split stays as it is.

## Measured (the owner's MacBook Air, Apple M2, 10-core GPU; WebKit, Newer Game, every enhancement on)

With the profiler (`perfprofile`, demo1-3, full resolution, 1280x800 window at 2x = 2560x1600):

| | before | shadows cached |
|---|---|---|
| average fps | 21.9 | 24.8 |
| frames within 16.7 ms | 3.9% | 17.5% |
| triangles a frame | 4.1 million | 0.46 million |
| draw calls a frame | 2576 | 997 |
| stalls (new shaders/textures) | 19 | 32 (the next step) |

Before, almost all the triangles were shadow maps redrawn every frame: each of the eight chosen lights' cubes (six
views of the whole level) whenever anything moved anywhere (3.3 million triangles, 2400 draw calls a frame), and the
sun's map from the whole level (1.1 million). The picture itself is about 40 000 triangles in about 50 draw calls.

The remaining cost is the GPU shading the picture's pixels. It scales with the pixel count (the picture's draw takes
15.9 ms at 2x and 5.7 ms at 1x, real-time playback with dynamic resolution) and no single enhancement dominates
(height-map self-shadowing about 4.7 ms, the relief maps about 4.9 ms, the rest less). Real-time playback at 2x holds
about 30-33 fps with dynamic resolution at its 50% floor; at 1x (the same window, not Retina) about 57 fps.

## What changed (src/newer/render/r_pointshadows.js, r_post_shadows.js)

- **Point-light cubes**: a light is redrawn only when a moving caster can reach it (a caster wholly outside the sphere
  of radius far x sqrt(3) round the light draws nothing into its six faces) or reached it at its last capture (to take
  its old shadow away), and flickering or moving lights as before. A redrawn light starts from its level-only cube,
  drawn once per light position and range into a second atlas (`staticTarget`), copied in with its depth, and only the
  casters that reach it are drawn over it; an exact depth tie is the same point at the same distance, so the order cannot matter.
- **The sun's map**: the level's depth is drawn into a cache 512 texels wider each side, on the same texel grid, and
  drawn again only when the view moves beyond that margin (across or along the sun), the occluder is rebuilt or the
  sun turns; each frame the map's window is copied out (depths moved to the map camera's range, `R_SunCachePlan`) and
  what moves (monsters, items, the axe's halves) is drawn over it. A map so tall that any of its level comes within the
  margin of the map camera's near plane (3400 units sunward of the view) keeps the whole draw every frame
  (`fallbacks` in `R_SunShadowCacheStatus`), so nothing the original clips can appear as shadow. The cache's 47 MB are
  let go with the pipeline (`R_SunShadowCacheDispose`).
- **Only the game asks for it**: `PointShadowAtlas.update` draws whole by default (`cache: false`, exactly as before);
  r_post_shadows.js asks for the caching. A light that moves or changes range every frame is drawn whole too.
- **Same pixels**: `tests/shadow_cache_trial.mjs` (WebKit, the source build with the owner's Quake) freezes demo1 at
  eight moments and, for the same frame, draws the shadows cached and whole (`R_ShadowCacheEnable`,
  `R_PostLastShadowFrame`). Point atlas: identical at every moment (0 texels). Sun map: 0 to 6 of 4.2 million texels
  differ by more than 0.001 of the depth range, the rest by under 0.00055 (under 4 world units; the shadow test's own
  bias is 0.0012, 8 units).
- The profiler now separates "water probes", "lights and shadows" and "rend veil capture" from "world draw".

## Checks

- `tests/model_pointshadows_test.js`: the whole path unchanged (9 tests); cached (4 new): a light no moving thing
  reaches keeps its cube; one reached is redrawn from its level cube with only that caster, the level drawn once; a
  caster leaving takes one more redraw then none; a moved light has its level redrawn; a caster just inside the reach
  is drawn and just outside is not; an instanced caster reaches every light; changed vertices re-measure the reach and
  the geometry's own bounding sphere is never replaced.
- `tests/sun_shadow_cache_test.js`: the cache is drawn again at 513 texels, not 512, across or down, beyond the pad
  along the sun, for a new occluder, sun or invalid cache and for a NaN centre; the texel offset follows the view; a
  cached depth becomes exactly the depth a real map camera gives (three points, two real orthographic cameras).
- `tests/shadow_cache_trial.mjs` (above), the shadow, lighting and profiler suites (134 tests).
- Independent review (Sonnet): its blocking finding (a near-plane band that could have become shadow) and all
  should-fix findings are fixed (above, and: sun-basis equality that forced redraws, error safety, disposal, the
  caster sphere no longer replacing the geometry's own, lazy reach, an interleaved buffer's version, test strength).

## Step 2: shaders compiled before the demo plays (plan item 1)

Measured first (`programs` in WebKit, the three demos in Newer Game): 38 shader programs were compiled mid-demo,
each a frame of 20-700 ms (Apple's GPUs cannot compile in the background). Their causes, from comparing each late
program's key with the ones already compiled:

- **The level's monsters, items and weapons.** Their skin and weapon materials were warmed only for the level the
  loading welcome holds back (the first one); a demo going on to its next map, or the same map loaded again, did not
  warm them, and the gun in the player's hands has a variant of its own (`-held-receiver-player-surface`).
- **Programs thrown away and compiled again.** three destroys a program when its last material is disposed. Every map
  change disposes the entity materials, and the Quad's glow and fire are rebuilt each time the Quad comes back into
  view (three times in demo3). For a ShaderMaterial the shader text's number is also part of the key, and it is
  renumbered once no material holds it.
- **Effects built on first use**: the fireball's ring and flash, the marks, the particles, the motes, the wall burns
  (and their two paint passes, drawn in a scene of their own), the Scrag's venom.
- **Doors, lifts and the ammo and health boxes**, built when first in view, and their relief maps arriving after the
  level's first frames.

What changed:

- **Each demo level is warmed** (`R_LevelShaderWarm`, gl_rmain.js), not only the welcome's: once its skins and weapon
  models have settled, their materials (and each view model's in-hand variant, `R_HeldViewmodelMaterial`, the recipe
  R_DrawViewModel draws with), its brush models built as their first draw builds them (`R_BrushModelWarmGroup`,
  gl_rsurf_brush.js, the build now a function of its own), the registered effects (`R_ShaderWarmRegister`,
  `R_ShaderWarmRegisterScene`, r_shaderwarm.js: fireball, venom, marks, motes, wall burns and their paint passes in
  their own scene) and the particles (`R_ParticleWarmObject`, r_part.js) are compiled together with the level, under
  the map's fog (part of a program's key). three's compile already reaches the surfaces out of view. Stand-ins are
  compiled, not the effects' own meshes, so nothing in the scene moves or shows. It is done again when those bindings
  change, and, while the demo is held, when the level's own textures land. Demos only: a level the player enters has
  the loading welcome. A level whose warm-up throws is reported and plays as before.
- **A demo waits on its first frame while that runs** (`R_LevelWarmHolding`; cl_main.js and cl_demo.js stop its clock
  and its reading), and for its first four frames and the level's own textures, at most 4 s after the level loaded.
  Only in the enhanced view. Timedemos too, so the profiler's runs match: a timedemo's clock starts after the hold, and
  the profiler does not time held frames. Measured (WebKit, the source build): 0.4, 1.3 and 1.1 s for demo1-3. A held
  frame shows the level's opening view with its items. Waiting for the relief maps as well was tried and dropped: one
  never finishes decoding in WebKit here, and every demo then waited out the cap.
- **Programs are kept for the session** (`R_KeepPrograms`, at most 512), and the first material of each ShaderMaterial
  text is kept undisposed (`R_DisposeKeepingShader`, used by r_powerups.js), so a material made again finds its program.
- **Tried and dropped: putting the level's textures on the card during the hold.** Uploading every world texture
  (about 300 a level) made playback markedly worse (173 stalls against 65), and without it the stalls returned to the
  baseline's. Textures stay uploaded as they are first drawn.

Result. `programs` (WebKit): mid-demo compiles 38 -> 3 (the Quad's glow and fire, now once per session; one world
shader late in demo3; one material not yet identified in demo1); the rest happen at each level's start, in the hold.
The profiler (perfprofile, 2x, a visible window): frames with new shader programs 12-13 -> 4 in every pairing, and the
time lost in stalls 10.1 s -> 8.9 s (baseline and change profiled back to back). The average frame rate could not be
compared: on the fanless MacBook Air it fell from 28 to 18 fps over successive runs of the same build as the machine
heated, which also hides the depth of field's own cost (0.03 ms a frame in the profile; turning it off made no
measurable difference, owner's question, 14 October 2026).

Checks: `tests/shader_keep_test.js` (programs kept once and to the cap; one keeper per shader text; stand-ins leave
the effects' meshes untouched; the particles' and a brush model's warm objects; three's own release, renumbering and
compile rules pinned), `tests/level_warm_hold_test.js` (the hold's conditions, cap, release, failure, and a held
timedemo's start time, each seen to fail with its fault put in by hand), `tests/profiler_demo_mode_test.js` (held frames
not timed), `tests/asset_readiness_test.js` (the in-hand variant), and the suites that touch the changed modules.
Independent review (Sonnet): its blocking findings (a held timedemo's start time; an experiment left in) and its
should-fix findings are fixed, except the portal shaders' renumbering (gl_portal.js, r_levelview.js), left for a later
step.

## Research and the plan (owner's choice, 14 October 2026: optimise and keep the look)

Three researchers (Sonnet), on this engine's measurements; the plan in order, each step checked pixel for pixel:

1. **Shader-compile hitches** (up to 1 s when an effect first appears mid-demo). Safari advertises
   `KHR_parallel_shader_compile` but links still block on Apple Silicon (WebKit bug 251514), so `compileAsync` cannot
   hide them; WebGL has no program binaries. Log every program first used during the demos and warm them all with a
   real draw into the real G-buffer at load (colour writes off), plus `initTexture` for the demos' textures; fold
   `customProgramCacheKey` variants into uniforms where they only change values.
2. **The surface shader** (no change to the look): first measure it against a trivial shader writing the same four
   targets, to split shading from bandwidth. Then the height shadows' exact early exits (stop a ray once fully shadowed;
   skip the macro ray when the micro one is) and a conservative per-texel maximum-slope bound (return lit without
   marching when the light clears it: exact if built conservatively; Dummer's cone step mapping, Robust Cone Step
   Mapping EGSR 2024). Move global shader state into locals (non-constant globals are costly on ANGLE's Metal backend,
   WebKit bug 255987).
3. **Full-resolution post passes**: invalidate or clear each target before its full-screen pass (ANGLE-Metal otherwise
   loads it from memory: Apple's load/store guidance; ANGLE FrameBufferMtl), one unscissored clear before the
   G-buffer, opaque draws before discard and transparent ones (hidden-surface removal), fewer passes reading the
   G-buffer once.
4. **Scene build** (5-9 ms of JavaScript): a persistent mesh per entity, matrix updates taken over, no allocation per
   frame, the light choice cached per leaf with hysteresis (which also keeps the shadow cache warm).

Sources: Apple TBDR and load/store documentation, WWDC20 10632/10602; ANGLE `FrameBufferMtl.mm`; WebKit bugs 251514,
255987, 235043; three.js `WebGLProgram.js`, `WebGLPrograms.js`; Unity HDRP cached shadows; Unreal virtual shadow maps;
Dummer 2006, Policarpo (GPU Gems 3 ch. 18), Tatarchuk 2006, Sloan & Cohen 2000.

## Not yet done

60 fps at 2x with every enhancement needs the GPU's per-pixel work roughly halved. Choices are with the owner (card
T-efb1e55d): a lower dynamic-resolution floor, deeper shader work (a depth pre-pass so the heavy surface shader runs
once a pixel, height shadows at a lower rate, light culling), and the remaining hitches (texture uploads, the
GPU's own stalls; above).
