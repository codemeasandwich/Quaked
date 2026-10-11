# Power-up vision integration

Implemented and verified on Dev, 8 October 2026. Board completion is recorded
separately from source delivery; no remote push or release is implied.

## Requested behavior

- Ring of Shadows: the supplied Unseen World spectral flow and bounded trails.
- Pentagram: the supplied sharp Demon Vision, with gold/ivory subjects and
  dark scenery with relief highlights.
- Quad: 1.5 times movement speed and actual jump height, plus flaming purple
  silhouettes of living enemies behind walls. Distance reduces opacity and
  increases blur. This explicit through-wall exception applies only to Quad.

All use native power-up state. Ring takes precedence over Demon; Demon resumes
when Ring expires if Pentagram remains. Quad's overlay composes after either
world treatment. Damage multiplication remains in native QuakeC. Renewal never
stacks a movement multiplier. Classic retains native visuals and movement.

## Source and architecture

The MIT shader bodies in `powervision_shaders.js` are exact extractions from
the supplied `demon-vision.html`, SHA-256
`0b86255fab89060c5c1be49171fda82123d7cb7c602c5532c947c5791e546e23`.
The demo scene, UI and animation loop are excluded. Runtime adapters and
balanced presets live in `r_powervision.js`; native state selection and
history admission live in `powervision_state.js`.

`gl_post.js` feeds completed linear composition into vision, then performs
the existing output conversion and display grading once. The HUD is drawn
later. The existing native power tint is replaced only when its enhanced
vision pass is available; damage, bonus and contents cshifts remain separate.

The normal and pigment buffers retain their established attachment numbers.
Enemy pigment uses an actor subtype of .065 inside the existing actor range;
pickups use .06 and held/player surfaces .08. There are no authored ink masks,
so the supplied pigment fallback is used. The height-shadow attachment is not
reused as a subject mask. Held physical depth is reconstructed from the native
negative normal-alpha packet. World up is Z; donor world scale is 1/32.

Unseen history rejects changed mode, world, view, projection, resolution,
time reversal, long gaps and camera cuts. Paused frames redraw without history
feedback. A failed history draw cannot publish its unfinished target. Client
clear and context loss invalidate history. Normal preparation resumes after a
vision-only native material is created while normals are disabled.

Quad reads guarded local-server living monster records, because client PVS
omits occluded entities. It builds render-only proxies using native alias
poses; each owns its GPU position attribute. No PVS, packets, entity state or
discovery state is modified. Monsters waiting in monster closets are not
revealed (owner request, 11 October 2026, card [QV1];
`src/newer/render/quadvision_region.js`):
- **The rule (the owner's ruling, 11 October 2026).** Reveal the monsters in the game space the
  player occupies and everything physically joined to it, where each monster is now. Monsters in
  boxes and platforms detached from it are not revealed: those are normally teleported in later.
  Doors are part of the level, so monsters behind them are revealed.
- **How "joined" is decided.** The code floods the open space of the world's player-sized
  collision hull (hull 1) from the player.
  - Doors, platforms and every other brush entity are passable, and so are liquids.
  - Every teleporter the flood reaches joins its destination, when the player's hull would
    touch it. A place the player can go by teleporter is part of their level; a box monsters are
    teleported out of is not, since the flood never gets into it.
  - The flood steps over a 16-unit grid. Each cell's node is the nearest point above or below
    the grid point, within 8 units, that the hull fits, so the flood follows ramps under low
    ceilings and ducts the hull barely fits.
  - A step joins two nodes only along a clear hull-1 trace.
- **When a monster counts as reached.** An open point by it (its origin, or nudged up to 16
  units sideways and from 32 down to 16 up, joined to the origin by a clear line) must have a
  clear trace to a reached node of its cell or the cells round it.
- **Following the player.** If the player gets somewhere the flood missed (noclip, say), the
  flood grows from there and answers are asked again.
- **Built from the level's start, breadth first,** a bounded number of cells a frame (150; 400
  per question while Quad is held). A whole level is done in about 20 to 55 s of play on the
  largest maps, nearest the player first. A monster not yet reached is not revealed.
- **Cost.** A frame costs about 1.3 ms typically, 2 to 3 ms at the 95th percentile and at most
  about 7 ms, measured in node on e4m3 and e2m6 at a load average of about 9. Revealed answers
  are kept; a hidden monster is asked again after 4000 more cells, or when the flood finishes.
- **Two earlier versions were replaced after review:**
  - The first hid monsters overlapping a teleporter with a targetname. It missed walk-in closets
    and pacing scrags, hid monsters under teleporters that cover playable space, and was checked
    only against its own definition.
  - The second used a fixed 16-unit grid. It hid all of e3m5 (a ramp under a low ceiling),
    e2m7's duct scrags and a scrag against a wall on e1m3. Its time budget also made a test
    flaky under load.
- **Evidence.**
  - `tests/quadvision_closets_native_test.js` checks hand-verified fixtures against the real maps
    and progs at Hard:
    - e1m2: exactly its four teleport-closet monsters hidden;
    - e1m3: exactly four hidden, the narrow-passage zombies and the wall scrag revealed;
    - e1m4: the walk-in ogre and pacing scrags hidden through 30 s of real play;
    - a closet emptied by the level's own button;
    - nothing in a closet revealed while the flood is under way;
    - with the registered pak and stock progs: e3m5 hides exactly its four closet scrags past its
      ramp, e2m7's duct scrags revealed, end.bsp's closet row hidden and its arena shambler
      revealed;
    - a player moved into a pocket after the flood is done has its monsters revealed.
  - **The reviewer's own scan, for fd7a5ca0.** It ran with the production per-frame budgets over
    30 s of real play, at skills 0, 1 and 2, on all 31 maps with stock progs (e4m1 at skill 0
    only). A local point-hull flood round each monster decides whether it is sealed in.
    - No closet monster was revealed in any frame.
    - No monster in the level was hidden once the flood finished.
    - Every flood finished within 30 s.
    - The only flag was end.bsp's fish, which sits in the player's own start pocket (confirmed at
      8 units).
- **In the browser** (first version, the same e1m2 result): 42 shown before, 38 after.

A separate enemy depth mask and purple composite
preserve the held weapon and ordinary visible enemy pixels. Expiry, resize,
world changes and client clear dispose proxy resources.

`sv_quadmovement.js` derives the movement factor from native bits and the
actual `super_damage_finished` timer for the supported local Newer player.
Ground/water wish movement and local speed caps scale together. A jump is
amplified only after native QC accepts a grounded dry jump. Its impulse is
calculated against Quake's gravity-before-movement discrete apex, preserving
the native gravity value and collision. No bonus is serialized separately.

## Verification so far

Use Three.js 0.183.0 with its adjacent core module:

```sh
QUAKED_THREE_MODULE=/path/to/three.module.js node tools/run_tests.mjs \
  tests/powervision_state_test.js tests/powervision_runtime_test.js \
  tests/quad_movement_native_test.js tests/quadvision_public_test.js tests/quadvision_closets_native_test.js \
  tests/powervision_save_native_test.js
```

- State/runtime checks: 11 passed, including actual post-pass ordering and
  failure cleanup. Native Quad movement: five passed; measured apex ratios
  across five fixed timestep/gravity combinations are within 0.000002 of 1.5.
- Quad renderer public checks: four passed, including PVS-absent enemies,
  semantic exclusions, owned geometry, resize/expiry and Classic.
- Native save/load and overlap: five passed independently. Actual save commands
  use memory-only storage. A save at time 10.25 preserves deadline 31 and
  remaining duration 20.75. Combined powers were obtained through native QC
  pickups and existing enhanced level carry. These tests advance simulated
  server time, not wall-clock time; timers are not shortened.
- Finite GPU compilation and eight semantic packet readbacks passed. A separate
  Quad GPU trial passed: near silhouette energy 379.571 versus far 103.308;
  normalized edge sharpness .27844 versus .21711. Visible enemy and held-weapon
  change counts were zero. These are synthetic controls, not native performance
  measurements.
- In the actual browser, physical native Ring and Pentagram pickups activated
  modes 1/2 and expired correctly with GL error zero. Quad silhouettes were
  visibly present through an E1M1 wall and absent after expiry. The trial player
  was explicitly staged; the occlusion trace fraction was .7811279296875.
  All agent-created game/GPU tabs were closed afterward.

## Final qualification and limits

- Final combined run: **47/47 passed**, including existing skin and power-up
  regressions. Independent source review found no remaining blocker.
- Optical correspondence uses the compositor's actual primary ray, encoded as
  two 16-bit UV components in RGBA8. Original depth remains in the existing
  depth texture. This adds four bytes per pixel per coordinate buffer and
  works with the renderer's half-float-only capability fallback. Ring history
  targets allocate lazily; initial Demon use allocates no Ring history.
- Auxiliary samples and position reconstruction follow that map. Previous
  history coordinates are inverted with four bounded Newton iterations;
  invalid Jacobians, folds, out-of-bounds solutions and residuals reject history.
  Nineteen finite GPU reports passed, including UV error below 0.00000757,
  shifted/curved reconstruction, inverse residual below .503 pixels and
  complete rejection in each 6144-pixel invalid-field fixture.
- Quad's packed-map GPU test measured the expected -24-pixel shift as -23.875
  pixels, with zero wrong-depth and held-boundary changes. Native enemy-facing
  Unseen and Demon views were inspected after the final compositor fix, with
  GL error zero and no runtime errors.
- Carried Ring warning/expiry sounds are now precached before serverinfo. Native
  save/carry tests verify exactly one entry per sound, actual serverinfo names
  before clientdata, and zero missing-precache diagnostics.
- A native GPU check caught a global world-material hook adding a conflicting
  output to the compositor. Fullscreen pipeline materials now explicitly own
  their output declarations. The original failure is not represented as a pass.
- Secondary chromatic/blur colour taps share the primary receiver, matching
  existing deferred lighting. This is not per-tap geometry reconstruction.
  GPU readbacks establish correctness, not a native-frame performance benchmark.
  Jump-height ratios were measured at fixed timesteps; variable timestep changes
  during a jump and inherited moving-platform velocity were not separately
  qualified. Through-wall vision is restricted to the supported local Newer
  game; no remote-server visibility information is fabricated.

The native trial is `tests/powervision_gameplay_trial.html`; it offers actual
power-up collection and an explicitly staged wall-separated enemy viewpoint.
The finite GPU trials run without gameplay or a background animation loop.

Since 9 October 2026 the Ring also hides you from monsters already hunting you, and a monster you hurt hunts where you fired from: [ring-unseen-2026-10-09.md](ring-unseen-2026-10-09.md).
