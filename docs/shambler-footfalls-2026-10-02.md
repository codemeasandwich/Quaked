# Shambler footfall tremor

In **Newer Game**, every Shambler footstep sends a small tremor through the floor. When the Shambler's foot lands, the player's view gives one short, rapidly fading shudder. The shake is strongest beside the Shambler, fades smoothly with distance and stops at 600 units. It follows the Shambler's animation, not a timer: walking gives two heavy steps per stride, and running gives faster ones.

## Behaviour

- **One pulse per foot contact.** The client watches each visible `progs/shambler.mdl` entity's animation frame. A pulse starts when the walk cycle reaches `walk1` (right foot) or `walk7` (left foot), or the run cycle reaches `run2` (right foot) or `run5` (left foot).
  - These heel strikes were measured from the model's foot vertices. Each is the frame where a foot is on the floor at its furthest forward point.
  - The left foot touches down and is furthest forward on the same frame, `walk7`.
  - The right foot first touches at `walk12` but carries forward to `walk1`. Using `walk1` keeps the stride an even six poses apart.
  - Measurements: [shambler-footfall-frames-2026-10-02.txt](evidence/shambler-footfall-frames-2026-10-02.txt). Newer Game reskins the Shambler without changing these poses.
- **First step.** A Shambler that starts walking or running directly on a contact pose, such as `stand17` → `walk1`, makes that step felt. The first time a Shambler is seen is never a step, because its foot may have landed long before.
- **Shape.** Each pulse lasts 0.22 s.
  - **Impact:** the eye drops by up to 1.2 units and pitches down by up to 0.25°. A 0.15° roll alternates direction between the right and left feet.
  - **Decay:** the impact then shudders out at 18 Hz, with amplitude decaying quadratically.
  - **Every frame rate:** the impact is at full strength the moment the foot lands, so no steady frame rate can miss it.
  - **Weapon:** it drops with the eye, so it does not bounce against the view. It does not take the pitch or roll.
- **Distance.** Strength is `(1 − distance / 600)²`, using the 3D distance from the player's origin to the Shambler's. At melee range (about 50 units) a step drops the eye by about 1 unit. At 300 units it is a quarter as strong; at 600 units and beyond there is nothing.
- **Small, even in a crowd.** Pulses from several Shamblers add together, but the total is clamped to the single-step limits above.
- **Ground only.** The player must be standing on something when the foot lands. A step that lands while the player is jumping or falling is never felt. A pulse already running is muted while the player is in the air; it is not paused or replayed on landing.
- **Animation smoothing.** When Newer Game's monster pose blending is on (`r_lerpmodels`), the drawn pose trails the network frame by one 0.1 s animation step. The pulse is delayed by the same step, so it lands when the foot is seen touching down.
- **No replays or phantom steps.**
  - **Held poses:** a pose held across frames does not retrigger.
  - **Packet gaps:** a gap of up to three poses still produces any contact it crossed (for example `walk11` → `walk2`). Larger jumps (`walk11` → `walk3`) and reversed playback never replay a step.
  - **Restarted tracking:** teleports (moves over 96 units), Shamblers not drawn for 0.3 s and level changes all start tracking afresh.
  - **Cut-offs:** a running pulse is cut off when the Shambler stops walking or running (for example to attack), when its entity slot is reused by another model, or on a level change.
- **Remote play.** With client prediction, the client clock can step back a few milliseconds when the latency estimate rises. Regressions under 0.3 s are held rather than treated as a restart. A larger jump back, such as a map restart, forgets everything.

## Where it is off

- **Modes:** New Game, where the classic view is unchanged, and recorded demo playback, including the title demos.
- **Game state:** while paused (client or local server), at intermission, while dead, and before the connection has finished signing on.
- **Focus:** while the console, chat input or a menu has focus.

`v_shamblersteps` is an archived setting, default `1`, that scales the strength: `0` turns the tremor off and `0.5` halves it. Values above 1 are treated as 1, so the setting can only reduce the tremor. It is registered by `V_Init` with the other view settings.

With the chase camera on (`chase_active 1`), the chase camera sets its own pitch, so only the vertical drop and roll remain.

## Design and boundaries

The implementation is `src/v_shamblersteps.js`. `V_CalcRefdef` in `src/view.js` calls it once per rendered frame, after stair-step smoothing and before chase-camera placement.

The returned offsets go to the eye's position and angles and to the weapon's height. When an offset was applied, the eye is clamped again with the existing `V_BoundOffsets`. New Game and frames without a shake skip that extra clamp, so their view is exactly as before.

Only the displayed camera changes. Player physics, prediction, aim, `cl.viewangles`, sent movement commands and server state are untouched.

Per-Shambler tracking is held in a `WeakMap` keyed by the client entity. `CL_ClearState` recreates those entity objects on every level, so nothing outlives its entity.

Each rendered frame scans `cl.num_entities` client entities and compares model names. Frame names are parsed once per model and cached. While the tremor is off, the per-frame reset does not allocate, which follows the render loop's no-allocation rule.

## Verification

`tests/shambler_steps_test.js` has 13 tests. Most drive the public `V_ShamblerStepShake` entry point, and one goes through the real `V_CalcRefdef` view path. Both use the real client, server, key and cvar singletons; only the Shambler model is reduced to its frame names. The tests check:

- the walk and run contact frames, their 0.22 s decay windows, and the impact direction;
- opposite roll for the right and left feet;
- the exact `(1 − d/600)²` peak at 0–590 units, a quarter at 300, and nothing at or beyond 600;
- the clamp with a pack of seven Shamblers;
- a three-pose packet gap still landing its step, while four-pose, six-pose and reversed jumps do not;
- first steps from standing or switching to run, and no step on first sight;
- no retrigger on held poses, attacks, teleports, Shamblers out of view for 0.4 s, or other monsters;
- cut-offs on attack, reused slot and level change;
- grounded contacts only, and muting while airborne;
- every gate listed under "Where it is off", and the setting at 0, 0.5 and 3;
- small clock regressions held and a large one reset;
- the one-step delay with smoothed animation;
- through `V_CalcRefdef`: the eye drop matching the weapon, the pitch and roll, weapon angles untouched, New Game unshaken, and `V_Init` registering the setting.

Run them with:

```sh
QUAKED_THREE_MODULE=/absolute/path/to/three.module.js node tools/run_tests.mjs tests/shambler_steps_test.js
```

**Full run: 42/42.** That is the 13 new tests plus the nine existing test files that load the view, client or animation code, all passing with exit status 0. Log: [shambler-footfall-tests-2026-10-02.txt](evidence/shambler-footfall-tests-2026-10-02.txt).

**Independent review.** An independent defect-first review found no blocking runtime defect. Its findings were all corrected:

- a missing results file;
- tests that did not catch most wrong implementations;
- the airborne and map wording in this document;
- the clock-regression reset;
- the extra New Game bound;
- per-frame allocations;
- the missed first step;
- a sine phase that steady frame rates could sample at zero.

**Tests catch wrong implementations.** One-line wrong implementations were applied to a scratch copy and the tests re-run; the results are in [shambler-footfall-mutations-2026-10-02.txt](evidence/shambler-footfall-mutations-2026-10-02.txt). The only changes that still pass are the missing-world gate and the per-entity model check. These are defensive duplicates of the level-change reset, and no real input can tell them apart.

## Try it

1. Start **Newer Game** and find a Shambler.
   - **Every skill:** E1M6 places one, according to the shipped map entities.
   - **Hard only:** E1M3, E1M5 and E1M8 add more. In the console, type `skill 2`, then `map e1m3`.
2. Stand still and let it walk towards you. You should feel a thud per step that grows as it approaches.
3. Jump as it steps to confirm nothing is felt in the air.
4. Use `v_shamblersteps 0` to turn the effect off for comparison.

The automated checks establish the timing, falloff and gating logic. How the tremor feels in play, including whether the strength is right, still needs the owner to try it in the browser.
