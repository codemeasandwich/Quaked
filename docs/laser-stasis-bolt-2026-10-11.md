# Laser shots: the supplied "STASIS 02" bolt

Card T-0236f3fe, "[LZ1] Laser shots: replace with the supplied stasis bolt, one for one". Baseline Dev `459bde6d`.
In Newer Game every laser projectile is drawn as one supplied bolt; Classic keeps the native laser.

## Source

* Owner-supplied `stasis-combat-fx-v2.html` ("STASIS 02 — Miniature Plasma Lab"), SHA-256
  `8ae01c6dbfdc442b43dec7c48d622963f52069a8c6e665a785b6a1da248c52a8`, 90 589 bytes (gitignored; kept local, never
  edited or distributed). Effect: ability "01 / KINETIC", the Stasis bolt, `fireBurst('bolt')`.
* The owner's call: `fireBurst('bolt', { origin, direction, count: 4, frequency: 8, scale: 0.24, freezeAt: 7.5 })`.
  The owner's clarification: one for one. Each native laser projectile becomes ONE bolt (not a burst of four), with
  the bolt's look at scale 0.24, travelling with the native projectile.
* The source is procedural: no textures, nothing decoded. What was taken, with source line numbers, is listed in
  `newer/effects/stasisbolt/provenance.json`.

## What is replaced, and what is not

All laser shots are one model, `progs/laser.mdl` (19.2 × 2.6 × 3 units, centred on its origin, one frame, no trail
flag), fired by QuakeC's `LaunchLaser`: the Enforcer (`enforcer_fire`) and the laser traps (`trap_spikeshooter` /
`trap_shooter` with spawnflag 2, `spikeshooter_use`). Velocity 600 units/s, `MOVETYPE_FLY`, `EF_DIMLIGHT`.

| Part | Newer Game | Classic |
|---|---|---|
| The flying shot (`progs/laser.mdl`) | one supplied bolt, its native mesh not drawn | native mesh |
| Hitting a wall (`TE_GUNSHOT`, sent by `Laser_Touch` 8 units back along the shot) | the source's bolt impact (sparks and ring) instead of the 20 native gunshot particles | native particles |
| Sound, damage, speed, collision, the dim light, the wall mark (decal / wall burn), blood on a monster | native, untouched | native |

Nothing in the client's or server's movement, collision or damage code is changed. The engine reaches the effect
through four hooks (`src/engine/common/hooks.js`, filled by `src/newer/install.js`):

* `R_StasisBoltTakes( ent )`, asked by `R_DrawEntitiesOnList` (gl_rmain.js) for every alias entity: true for a laser
  in Newer Game, and the native mesh is then not drawn (as `R_LightningTakesBeam` does for the player's beam).
* `R_StasisBoltFrame( time, viewSize )`, in `R_RenderView` beside the shotgun's frame (after the entity list).
* `R_StasisBoltImpact( pos )`, in `cl_tent.js` for every `TE_GUNSHOT`: true when the point is a laser's impact, and the
  native particles are then not spawned.
* `R_StasisBoltSetup` / `R_StasisBoltClear` in `R_NewMap`. Cvar `r_stasisbolt` (default 1; 0 puts the native laser back).

The effect is off, and the native picture used, in Classic (`r_hdr 0`), in the Classic half of the title demo's split
view (`R_NewerGame()` is false in that pass and the layers are `newerOnly`), with `r_stasisbolt 0`, with no scene or
client, and for a shot beyond the pool of 32 tracked shots. In the split view a laser's impact also spawns the native
gunshot particles flagged for the Classic half alone (as the explosions do), so neither half shows both.

## How it is built (`src/newer/render/r_stasisbolt.js`)

* **Bolt.** The source's `FxPlasmaVolume`: a proxy box the bolt's length long and 3.5 radii across, ray-marched by the
  source's fragment shader (copied statement for statement; the test checks every statement against the hashed
  source). One instanced box per shot: the instance carries the centre, the phase and the axis; the vertex shader
  carries the camera into the box's own −1..1 space (the source's `uCameraLocal`). Back faces, additive, no depth
  write, as the source. At scale 0.24: length 3.15 × 0.24 = 0.756 m, radius max(0.014, 0.115 × 0.24) = 0.0276 m.
  One source unit (metre) is 24 Quake units, as the Fireball, the smoke trails and the shotgun pellets use: the bolt is
  18.1 units long against the native model's 19.2.
* **Where.** Centred on the entity's interpolated origin (the client's own, as the native mesh would be drawn; lasers
  are faster than `R_SmoothMove` glides, so the native mesh is not smoothed either), pointing along its angles
  (`vectoangles` of the velocity: pitch up positive). A shot is tracked by its entity while it keeps to its line; an
  entity number reused by a new shot (more than 64 units off the line, or 0.3 s unseen) starts a new bolt.
* **Glow sparks.** The source's `_updateBolts` sheds 45 sparks a second while flying, at random points of the bolt,
  living 0.04–0.13 s where they were shed. Here spark *m* of a shot is emitted at (*m* + 1)/45 s of its flight, from
  where the shot was then (its last position less its measured velocity times the time since), with hashed offsets,
  drift, life and size from the source's distributions, drawn as camera-facing quads with the source's kind-0 particle
  shading and its one-pixel minimum.
* **Impact.** `Laser_Touch` sends `TE_GUNSHOT` 8 units back along the shot, the same event a bullet sends. A
  `TE_GUNSHOT` is taken as a laser's when it lies on the path of a bolt drawn in the last 0.25 s: within 4 units of the
  line of its measured flight (the angles reach the client rounded to 1.4°; the event lies exactly on the line), from
  24 units behind it to 16 units past where it could be one server tick (0.1 s) from now. That bolt then ends; if the
  same shot is still listed 0.1 s later the event was not its own, and it is drawn again. The
  impact is the source's `_impact('bolt')` at visual scale 0.24: 14 sparks thrown off the struck surface (found with
  the decal code's `R_DecalSurface` within 48 units, facing the shot; else the touch point, facing back), under
  gravity 6 m/s² and drag 1, and the ring (0.94–1 band, growing 0.1 → 0.364 m, fading over 0.45 s) in the surface's
  plane, half a unit off it.
* **Motion law.** The source steps its particles at 1/60 s (`CombatFX.update` splits every frame): `v *= exp(-drag h)`,
  `v.up -= g h`, `p += v h`. `particleOffset` is that law summed in closed form, so it equals the source's path at
  every step (checked to 1e-5 m against the source's own `FxParticles`) and is the same at any frame rate.
* **Colour.** The source's page shows its effect shaders' values as screen values, clipped at 1 (its ShaderMaterials
  do not convert; its ring is a MeshBasicMaterial, whose colour is shown as written). Quaked's composite treats an
  effect's output as linear light, multiplies it by its exposure (1.3) and grade, and rolls anything over its knee
  toward white: written as the source writes it, the bolt showed as a pink-white bar (a pure red of 1.0 shows as
  (205, 109, 99) in Newer Game). Every output here is therefore clipped at 1 as the source's screen clips it,
  converted with the exact sRGB curve and scaled by 0.6 (`STASIS_DISPLAY`), which puts the source's full scale just
  under the knee: the mantle shows saturated red and only the core reads white, as in the source. 0.6 was chosen in
  the browser against the source's own bolt rendered from the same distance with a Quake-like camera (0.3–0.5 left the
  core red, 1 and above turned the bolt pink). The Fireball port writes its values unconverted.
* **Time and bounds.** Everything follows `cl.time`, so it freezes with pause and the menu; an impact's clock starts on
  the first frame that draws it (the Fireball's lesson). 32 tracked shots, 16 impacts, 480 spark quads, allocated once;
  the per-frame path writes scalars into preallocated typed arrays. A clock jump back of more than 1 s, a new map and
  leaving Newer Game drop everything.

## `freezeAt: 7.5`, and the other parts of the call not used

* `freezeAt` is **not** a pose time. In the source (`BoltMotion`) it is a travel distance in metres: a bolt flies
  from its origin at its speed (16 m/s in the lab) and, on reaching `freezeAt` metres, stops translating and hangs in
  the air (the "stasis") while its plasma keeps flowing (the shader's time never stops). `fireBurst` staggers the
  four pulses' stop points back by 1.32 bolt lengths each (pulse *i* stops at `freezeAt − i × spacing`), so the burst
  hangs in a row until `release()`. With `freezeAt: 7.5` the lab's first pulse hangs 7.5 m from the hand.
  A laser here must travel with the native projectile (the owner's clarification; the game moves it and decides where
  it stops), so no stop point is applied. If the owner wants a visible "stasis" moment, that would be a gameplay change
  (the projectile would have to stop) and is not part of this card.
* `count: 4, frequency: 8` (four pulses 125 ms apart): replaced by the game's own shots, one bolt each.
* The bolt's point light: not added; the laser keeps its native dim light.

## Verification

* `tests/stasisbolt_test.js` (9 tests). Against the source (run when the hashed page is at the repository root or
  `QUAKED_STASIS_SOURCE` names it; `QUAKED_STASIS_SOURCE_REQUIRED=1` makes its absence a failure): the source's own
  `CombatFX` runs in a VM with the real three.js and the owner's call; its bolt's length, radius, proxy box, colours,
  steps, roughness and power equal the port's; every ray-march statement is in the port's shader; its spark rate,
  sizes, lives and colour, its impact's count, ranges, gravity, drag, ring size, life and colour match the port's
  distributions; its particle integrator matches `particleOffset` to 1e-5 m. The public interface: the Newer/Classic
  gate, the split's Classic pass, `r_stasisbolt 0`, other models, no scene; one bolt per projectile at its origin and
  heading, following it, gone with it; entity reuse; the pool limit; the impact on the struck wall, one per bolt, not
  for a bullet off the path, over after 0.8 s; the real `R_DrawEntitiesOnList` leaves the laser's native mesh out in
  Newer only and the real `CL_ParseTEnt` drops the 20 gunshot particles only for a laser; the entity is never written;
  the buffers are the same objects every frame.
* `tests/stasisbolt_trial.html?game=quake` (the full Quake's pack; the shareware has no Enforcers, laser traps or
  laser.mdl) boots the real game on e2m1, fires a laser trap through its QuakeC `use` and an Enforcer through its own
  `enforcer_fire`, and pauses at chosen moments for photographs, in Newer and in Classic (other monsters are removed
  first through QuakeC's `SUB_Remove`, so nothing stands in a shot's way; `host_framerate 0.008` slows the game so a
  600 units/s shot can be caught beside the camera).

## Browser evidence (11 Oct 2026, headless Chromium on Metal, e2m1 of the full Quake)

* Newer Game, laser trap (`trap_spikeshooter`, spawnflag 2) and an Enforcer: the trial's snapshot reports one bolt
  for the one laser entity drawn (`bolts 1`, the native mesh not drawn), sparks shed behind it, and after each laser
  struck a wall one impact with its ring and 14 particles (the real `TE_GUNSHOT` matched). Seen from the side the bolt
  is a saturated red streak about the native laser's length with a brighter core; at the struck wall a thin red ring
  and a few red sparks, with the existing Newer wall burn beside it.
* Classic, same shots and viewpoints: the native orange laser model in flight (`nativeMesh true`, no bolt), and the
  native grey gunshot particles at the wall.
* The source's own bolt and impact, rendered by its `CombatFX` from the same distance with a 90° camera, match the
  in-game bolt's colour (saturated red mantle, white core line) and thickness; the in-game red peaks at 201–204
  because Newer Game's composite never shows a full 255 red. The source's impact at scale 0.24 is as faint as the
  in-game one.
* No page errors in any run. The photographs are not committed (they show the registered game's level).

## Differences from the source (deliberate or known)

* One bolt per shot, no burst, no stop point (above).
* A `TE_GUNSHOT` that happens to lie on a live laser's path (a soldier's pellet striking right where a laser is about
  to) would be drawn as the laser's impact. The match is 4 units off the line and at most a tick's flight ahead, and a
  shot wrongly ended comes back after 0.1 s; no such case has been seen.
* A laser that strikes a brush entity (a door, a platform) gets its impact at the touch point facing back along the
  shot, because the surface search reads only the world's leaves.
* The source's particles bounce on its stage floor; here impact sparks fall freely and are hidden by the level's depth.
* The wall mark a gunshot leaves in Newer Game (decal or wall burn) is kept for laser impacts, as before this card.
