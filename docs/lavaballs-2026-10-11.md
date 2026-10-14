# Lava balls: the supplied "FIREBALLS" fire fan

Card [FB1], "Fireball attach /Users/bri/Downloads/fireballs.html". Branch `claude-fx-fire`
from Dev `459bde6d`. In Newer Game every flying lava ball is drawn as the supplied
fireball; Classic keeps the original model and trail; gameplay is unchanged.

## Source

* Owner-supplied `fireballs.html`, "FIREBALLS — Straight-flight FX Lab" (the owner calls
  it the "fire fan"), SHA-256
  `9913ff9ff80bf9f89aeed49eb2b88c0e12f2a17089e961d34501241337b925ae`, 76 601 bytes. Kept
  local, never committed, edited or distributed.
* What the page shows: one ability, "01 / FIREBALLS". A stand-in character throws a volley of
  four small fireballs (outer left, inner left, inner right, outer right, 120 ms apart).
  Each one flies straight to its own mark in 0.82 s and ends in a small impact of sparks, a
  ring and smoke. The fireball is three crossed planes carrying a procedural flame shader
  (`FIREBALL_FRAGMENT`). Behind it runs a trail of flame puffs and sparks (`FxParticles`). No
  textures are used.
* What was taken from it, line by line, is listed in `newer/effects/lavaballs/provenance.json`:
  `NOISE_GLSL` (217) verbatim, `FIREBALL_FRAGMENT` (241) and `PARTICLE_FRAGMENT` (280)
  statement for statement, the point-size rule of `PARTICLE_VERTEX` (267), the `FxParticles`
  pools (348), the capacities (430), the `shootFireballs` defaults (467), the planes of
  `_spawn` (485), `_ring` (522), `_impact` (531) and the trail and grow-in of
  `_updateFireballs` (546). `tests/lavaballs_test.js` compares those statements and constants
  with the page when it is present locally. Point `QUAKED_LAVABALLS_SOURCE` at it, and set
  `QUAKED_LAVABALLS_SOURCE_REQUIRED=1` to make a missing or different page fail instead of skip.

## Which native fireballs it targets

The lab draws flying fireballs and an impact. It is not an explosion. The explosion
fireball is the FieldLab "04 Fireball" (card [25], `r_fireball.js`), which is unchanged.
Quake's flying fireballs are all entities drawn with **`progs/lavaball.mdl`**. The model
carries the `EF_ROCKET` flag, so natively it also leaves a rocket trail and carries a
radius-200 dynamic light:

| Native ball | Thrown by | Motion | End |
|---|---|---|---|
| Lava spurt | `misc_fireball` (`misc.qc fire_fly`): `start` ×3, `e1m6` ×15, `e1m8` ×6 in the shareware maps | `MOVETYPE_TOSS`: up at `speed` (+0..200) units/s, ±50 sideways, falling back under gravity | removed on touching anything (20 damage, no explosion) or after 5 s |
| Chthon's ball | `monster_boss` (`boss.qc boss_missile`), e1m7 | `MOVETYPE_FLYMISSILE`: straight at 300 units/s | `T_MissileTouch`: an ordinary explosion (drawn by `r_fireball.js`) |

In id1's QuakeC only these two set `lavaball.mdl`. The vore, the scrag and the others have
their own models.

### The fan, one for one

The source's "fan" is a scripted volley. `burstPlan` and `fireballsPlan` lay out four lanes
and four straight rays. Quake decides how many balls fly and where they go, so the planner
is **not** used and no projectile is added. Each native ball draws exactly one source
fireball. A Chthon throw is one ball per hand, so it draws one fireball per hand. A pit of
`misc_fireball`s draws one per spurt. The picture follows the native motion. Each ball's
fireball sits at the entity's interpolated origin and points along the ball's own motion,
taken from the last frame's displacement and smoothed at 25/s through the client's 10 Hz
interpolation steps. A lava spurt's fireball therefore arcs: it points up, turns over at
the top and points down as it falls. Chthon's flies straight, as in the lab.

## What replaces what

* **Model.** `R_DrawAliasModel` (`gl_rmain.js`) asks `R_LavaBall( e )` before it builds the
  mesh. When it answers true the native mesh, and so its shadow, is not drawn.
* **Trail.** `cl_main.js` now hands each `EF_ROCKET` trail its entity's model
  (`R_RocketTrail( …, 0, key, model )`). `render.js` spawns no trail when
  `R_LavaBallTakes( model, key )`, which also needs a pool slot for that ball. In Newer Game that trail would otherwise have been the
  `r_smoketrails` rocket smoke. The fireball's own flame-and-spark trail replaces it.
* **Kept native:** the server's movement, touch, damage, removal and sounds; the client's
  interpolation; the `EF_ROCKET` dynamic light (the source's `PointLight` is not used);
  Chthon's explosion (`r_fireball.js`).
* **Impact.** When a ball disappears, the module probes the BSP contents just ahead of where
  it was last drawn (`Mod_PointInLeaf`). If that point is solid, the ball went against a wall
  or floor, and the source's `_impact` is drawn there: about 27 sparks, a ring and 6 smoke
  puffs. The normal points against the direction of travel, which is the source's own
  fallback. A ball that leaves view, or expires in the air after 5 s, just goes, as the
  native one does. For Chthon this small impact is added inside the native explosion.
* **Not taken:** the launch ring of `_spawn`. The client cannot tell a ball being thrown from
  one coming into view, and a ring popping in mid-air would be wrong.

Classic (`r_hdr` 0), the classic half of the split title demo, `r_lavaballs 0`, no scene, and
more than 64 balls at once keep the native model and trail exactly as before. In the split
demo the native trail is also spawned flagged classic-only for the Classic half, as
`r_smoketrails` does.

## The Death Knight's fan (card [FB2])

The owner asked for the Death Knight's fan attack to be replaced with this same fireball, its
trail and its impact taken exactly from `fireballs.html`, and chose **one fireball on each native
shot**. The fan itself stays Quake's:

* **Native fan.** `hknight.qc` (`hknight_magicc1`…`c11`, its `th_missile`) throws six shots,
  one per frame, with `hknight_shot( -2 … 3 )`. Each shot is aimed at the enemy and turned
  6° per step. It is `progs/k_spike.mdl`, a `MOVETYPE_FLYMISSILE` that flies straight at
  300 units/s and carries `EF_TRACER2`. On a wall, `spike_touch` sends `TE_KNIGHTSPIKE` at
  the hit point. On a monster or the player it deals 9 damage and bleeds.
* **The fireball.** `progs/k_spike.mdl` is the second entry of `LAVABALL.models`. Each shot is
  drawn by exactly the lava ball code: the same source shader, size, grow-in and trail. Six
  shots draw six fireballs, and none is added.
* **Trail.** `cl_main.js` hands each `EF_TRACER2` trail its entity number and model.
  `render.js R_RocketTrail` spawns no type-5 tracer when `R_LavaBallTakes` says the fireball
  has the shot. The source's flame-and-spark trail is drawn instead.
* **Impact.** `cl_tent.js` `TE_KNIGHTSPIKE` calls `render.js R_KnightSpikeImpact`. In Newer
  Game that draws the source's `_impact` (sparks, ring and smoke) at the server's own point,
  through `R_LavaBallImpact` (hook `R_LavaBallImpact`). The impact's normal points back
  along the held shot nearest the point, within 64 units, or up when no shot was in view. The
  native spray (palette 226, 20 particles) is not drawn. A Knight shot's slot never runs the
  lava ball's contents probe, so a wall hit draws one impact, not two. The hit sound is
  unchanged.
* **Kept native:** the shot's count, timing, aim, speed, damage, removal and sounds; the
  blood on a monster or the player. Classic, the classic pass and `r_lavaballs 0` keep the
  native model, tracer and spray. In the split demo the native tracer and spray are spawned
  for the Classic half only.

## Fire goes out in water (card [FB3])

The owner's rule (11 Oct 2026) is that fire cannot travel underwater. The owner chose real
gameplay over a picture-only change, so hiding underwater is now a defence against Death
Knights. The rule applies in Newer Game only; Classic keeps Quake's rules.

**What stops.** A Death Knight shot (`progs/k_spike.mdl`) or a lava ball (`progs/lavaball.mdl`)
that enters water or slime goes out at the surface.

**How it happens.** `sv_phys.js SV_Physics_Toss` asks `src/newer/gameplay/sv_firequench.js`
twice per missile move:

* **Before the move** (`SV_FireQuenchStep`). A fireball in the air whose step would pass into
  water or slime has the step cut at the surface. The step is sampled every 2 units, because it
  may end in the pool's floor. The surface is then found between the last dry sample and the
  first wet one, halved 8 times. So the move, and any touch it makes, stays above the water.
  The first version put the shot out only after the move. The [FB3] review measured a shot
  hurting a submerged player within one long (0.05 s) frame.
* **After the move** (`SV_FireQuench`). A fireball that reached that point goes out:
  * the server broadcasts `TE_KNIGHTSPIKE` there; the client draws it as the fireball's own
    impact (sparks, ring, smoke) with the Knight's hit sizzle;
  * `R_LavaBallImpact` sees liquid just below the point (water, slime or a current) and lays
    the ring flat on the surface;
  * Quake's missile splash, `misc/h2ohit1.wav`, is played;
  * the edict is removed, so it deals no damage.

**Where it applies.** As the other Newer gameplay rules do, it applies to a local single-player
game (not dedicated, not a demo) on the stock progs (stock QuakeC: `PR_StockProgs`, 1.06 or the 2021 re-release). A mod's QuakeC that still holds
such a missile is never surprised by the engine removing it. A multiplayer host does not change
the rules for its clients.

**Edge cases and limits:**

* A fireball born in liquid (a Death Knight standing in water) does not move at all. It goes
  out where it is, without a splash, since no surface was crossed.
* Lava does not put fire out: `misc_fireball`'s balls rise out of lava and fall back as
  before.
* Other missiles (nails, rockets, the Scrag's spit) fly on underwater as in Quake.
* The defence is being *fully* under the water. A player whose eyes are just under it still
  has up to 10 units of body above the surface (maxs z 32, view height 22), and a flat shot
  can hit that.
* A real wall hit within 2 units above water also gets the flat ring. This is cosmetic.

**Evidence.**

* `tests/firequench_native_test.js` (7 tests) uses e1m1's own water and e1m7's own lava with
  real edicts moved by `SV_Physics_Toss`, at frames of 0.02 to 0.1 s. It checks:
  * the burst on the surface;
  * the splash sound's index and place;
  * a submerged player not hurt by a real `spike_touch` shot (while Classic hurts them);
  * born in water, with no move and no splash;
  * a full datagram;
  * lava, Classic, a multiplayer host, a demo playing, another game's progs, nails and rockets;
  * the same map loaded again, whose runtime strings reuse the offsets: a nail is never taken
    for an earlier fireball. The second review found that model-name cache going stale.

  Each deliberate break was caught: no cut before the move, no splash, a born-wet shot moving
  or splashing, no overflow guard, no single-player, demo or progs gate, a cache kept across
  spawns. The "stopped short of the surface" check in `SV_FireQuench` is defensive and
  untested. In the stock progs every touch that stops a fireball also removes it or changes
  its model.
* `tests/lavaballs_test.js` checks that the ring lies flat on water.
* **Browser trial**, run again on the final version. With `?game=quake` on e2m3, a level's
  Death Knight was stood beside the level's water and fired its fan at a point under the
  surface, watched from across the pool.
  * In Newer Game the shots burst on the surface with flat rings, and none was seen below it.
  * In Classic the shots went on underwater: all six on the final run, five of six on an
    earlier one.

## How it is built

`src/newer/render/r_lavaballs.js` follows the `r_torchfire.js` pattern:

* **Each frame.** `R_LavaBallsBegin` runs before the entity list. `R_LavaBall` registers each
  ball while the list is drawn. `R_LavaBallsFlush` runs after the list and draws this
  frame's balls.
* **Per ball.** Each ball holds one of 64 slots, found by entity number. A slot keeps the
  ball's last origin, its direction, its travel and its trail carry. A slot not registered
  this frame is released, with the impact check described above.
* **The fireball.** All balls share one instanced mesh. Its geometry is the source's three
  crossed planes, baked into the ball's own frame. Each instance carries its position, its
  scale and its direction.
* **The particles.** Trail and impact particles live in the source's fixed-size pools,
  stored as typed arrays, with the oldest slot recycled. They are drawn as camera-facing
  quads with the source's particle shader: additive glow (flame puffs and sparks) and
  normal-blended smoke.
* **Trail placement.** The source emits at each 1/120 s substep. Here each trail particle is
  placed at a random point of the frame's motion and aged accordingly. A fast ball, or a slow
  frame, therefore leaves an unbroken trail.
* **No per-frame allocation.** After the first build only scalars are written into the
  preallocated arrays. The materials and the layer helper are `r_fireball.js`'s
  (`material`, `layer`, `MRT_OUT`, `MRT_ZERO`). So is the scale: `FIREBALL.unit`, 24 Quake
  units per source unit. At that scale the source's flight speed of about 12.6 units/s lands
  on Chthon's 300 units/s, and the 0.42-size fireball is about 36 units long and 10 to 18
  units thick.

### Light gain

The source draws on an 8-bit canvas, where its three summed planes stop at 1 per channel.
The core goes yellow-white and the edges stay red. Newer Game's composite multiplies the
frame by its exposure (`HDR_EXPOSURE` 1.3) and rolls anything past 0.8 toward white. In the
first browser trial the summed core came out salmon-pink. `LAVABALL.gain` (0.55) scales the
additive layers so the summed core lands in the range where the shoulder keeps its hue. The
value was chosen by eye against the source's frames.

## Switches

* `r_lavaballs` (default 1): 0 puts the native lava ball model and trail back. In Newer Game
  that means the `r_smoketrails` smoke. Since [FB2] it also puts back the Death Knight shot's
  model, tracer and wall spray.

## Evidence

* **Unit tests.** `node tools/run_tests.mjs tests/lavaballs_test.js`: 13 tests. Four of them
  are [FB2]'s: one fireball per Knight shot, and the gate; the tracer replaced, kept in
  Classic and in the split demo's classic half; the wall impact drawn once at the server's
  point, facing back along the Knight's shot even with a lava ball nearer, or up for an unseen shot, with the native spray in Classic and for a shot a full pool left native; the `cl_main.js` and `cl_tent.js` call sites. The
  shareware pak has no `k_spike.mdl`, so the unit tests use its name alone. The 13 tests
  cover:
  * the source equivalence of the shaders and constants;
  * the gate (Classic, the classic pass, `r_lavaballs 0`, other models, no scene, a full pool);
  * one fireball per ball, drawn from the frame its native model is hidden, at its origin and
    along its motion, including an arc and a turn;
  * a ball forgotten when it goes, with no impact in the air;
  * the impact on contact, and that everything expires;
  * leaving Newer Game, a clock jump and a new map; a clock jump keeps the balls in view;
  * buffer reuse;
  * the native trail in Newer, Classic, the split demo and with a full pool, through
    `R_RocketTrail`;
  * the engine call sites.

  Each test was seen to fail on a deliberate break of the code it guards (the breaks are listed
  in the card's report). `fireball_test.js`'s call-site regexes now accept the model argument.
  `torchfire_test.js` is unchanged and still passes: `R_LavaBallsBegin()` sits before
  `R_TorchFireBegin()`, so its begin/list/flush order check still holds.
* **Browser trial.** `tests/lavaballs_trial.html` boots the real game and loads a map with
  `map`, then:
  * parks the view by a `misc_fireball` on `start`;
  * wakes Chthon on e1m7 by running his own `use`, as his trigger would;
  * puts away the Bestiary's first-sighting page;
  * pauses the game to photograph a ball mid-flight.
  * For [FB2], with `?game=quake`:
    * stands one of the level's Death Knights (`find`, `stand`) in the lit start area of
      e2m5, 220 units in front of the player;
    * runs its own `th_missile` at the player (`provoke`), which is what its AI does;
    * then photographs the six shots from the side, unpaused, as they cross and hit the
      wall.

    In Newer Game, six fireballs flew with the source's trail, and two rings and smoke
    marked the wall hits. Classic showed the six native shots with their tracers. No page
    errors occurred.

  The playwright drivers are kept with the card's evidence, not in the repository.

## Known limits

* Seen nose-on, the crossed planes show only their cross-section, as they do in the source.
  A ball flying straight at the player, as Chthon's do, reads as a small flame with its
  trail behind it. At the source's size it is smaller than the native ball, which is about
  17 units across. `LAVABALL.size` is the source's 0.42. Making it larger is an owner choice.
* A new ball's direction is known only once it has moved, which is up to one server update
  (about 0.1 s). Until then it is drawn, still small (it grows in from 0.3), along its last
  direction, or upright, and its trail starts once the direction is known.
* With the pool full, a Death Knight shot that finds no slot keeps its native model and tracer,
  and its wall hit keeps the native spray: `R_LavaBallImpact` declines when no held shot is
  near the point and no slot is free.
* With one pool slot left and two new balls in the same client frame, both lose their native
  trail for that frame, and the second, which finds no slot, shows its native model.
* With `r_drawentities 0` (or an overflowing visible-entity list) a lava ball has neither
  model nor trail: the trail question finds a free slot, and the entity list never registers
  the ball.
* The impact needs the ball to have been seen to move at least once, and a solid point within
  about 1.5 frames of travel ahead of it. A ball removed by touching a monster or the player
  gets no impact; its damage is still dealt natively.
