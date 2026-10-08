# Rocket and grenade trails: the supplied "01 RPG smoke"

Card T-f90bdd2c, "[26] Rocket and grenade trails: port supplied smoke effect". Baseline
Dev `3f35ae8`. In Newer Game, rocket and grenade trails use the supplied smoke; Classic
keeps the original particle trail.

## Source

* Owner-supplied `fieldlab-fx-3d-updated.html`, SHA-256
  `7e35fc808c24200e9dbf2b010a72d2fbea04aca567528ebd2e61e79979afc7d6` (gitignored;
  local, never edited or distributed). Effect: tab "01 / RPG EXHAUST".
* Extraction map (source lines): `emitSmoke` 191, `updateSmoke` 192, `smokeList` 193,
  `puffVert` 102 / `puff` 106, `puffs` 145, render 212 (puffs plus the exhaust glow card),
  `configs.smoke` 228. Defaults used: density 0.25, spread 0.5, wind 0.
* Textures: the smoke atlas and noise texture are the ones already extracted for the
  Fireball (`newer/effects/fireball/`), because the source shares them.

## What replaces what

`cl_main.js` calls `R_RocketTrail( old, new, type, entityNumber )` once per missile per
frame, from two places: live play (`CL_LinkPacketEntities`) and demo playback, including the
title demo and its split (`CL_RelinkEntities`); all four rocket/grenade call sites pass the
entity number. A call without one keeps the native trail, because a shared carry would let
two missiles disturb each other's spacing (a first version missed the demo path and gave
every missile there key 0). In `render.js` types 0 (rocket) and 1 (grenade) go to `R_SmokeTrail`; blood, tracer
and voor trails (types 2–6) are untouched. When `R_SmokeTrail` declines (Classic Quake,
`r_smoketrails 0`, textures still loading or failed, no scene) the native trail is used exactly
as before, so there is never a doubled trail. The projectile's motion, the rocket's dynamic
light, damage and sound are not touched. In the title demo's Newer | Classic split the native
trail is also spawned, flagged to draw in the Classic half only (the same Classic-only mesh the
explosions use), so each half shows its own trail.

## How it is built

* `src/r_smoketrail.js` (pure, no renderer): the pool of live puffs and the source's per-puff
  motion. `forEachSmoke` is the source's `smokeList` with an explicit time-scale parameter;
  at scale 1 it equals the source exactly. Puffs are stored in the source's own space
  (y up, source units) because the source's drift terms assume it.
* `src/r_fireball.js` owns the puff layer, textures and shader (the source shares one for
  smoke and explosions), so trail smoke and explosion clouds are depth-sorted together, back
  to front, in one instanced draw. The rocket's exhaust glow (the source's glow card behind
  the nose) uses the flash layer, only on frames the rocket moved.
* `src/fx_math.js`: the source's own `clamp / mix / smooth / hashJS`, shared by both ports.

### Changes from the source, and why

The source emits **by time** (48 puffs/s) behind a demo rocket moving about 1.5 source
units/s. A Quake rocket is about 30 times faster; time-based emission would leave beads
hundreds of units apart. So:

1. **Distance-based emission, independent of frame rate.** Puffs are placed every
   `spacing` = 3 units (the native trail's own) along each frame's travelled segment, with a
   carry kept per entity number, so the same flight gives the same puffs at any frame rate.
   Each puff is born at its own moment within the frame.
2. **Time scale 2.2.** The source's smoke lives 4.4–5.6 s; its whole evolution (growth, drift,
   fade) is played 2.2× faster, so a Quake flight of about a second shows the full look.
3. **Overlap, not just density.** At 3-unit spacing the puffs are drawn 1.6× larger and their
   alpha is scaled by `spacing / sourceSpacing / sizeScale` (about 2.4; the source's own spacing
   is 0.0328 units, from its measured 6.12-unit flight path) so neighbours overlap
   into a wisp as the source's do. (A first attempt matched only density per length and gave
   a string of white beads.)
4. **Near-camera fade.** Puffs within 24–110 units of the eye fade out. A missile leaves the
   player's own muzzle; without this the trail seen end-on is a wall of white along the line
   of fire (observed in the first browser capture).

Teleports are never bridged: a segment longer than 256 units emits nothing and resets that
trail, and a trail not extended for 0.5 s starts afresh, so a reused entity number does not
inherit spacing. (Live play also has the engine's own rule, which drops a segment that moves
more than 128 units on any one axis in a frame; demo playback has no such rule, so this
module's 256 is the only guard there.)

## Bounds and cleanup

One shared pool of 1,024 live puffs (the oldest yields) and 16 exhaust glows per frame, all
preallocated; no particle is allocated per frame (the frame path writes scalars into
preallocated typed arrays and keeps one short-lived typed-array view for the depth sort).
Exhaust glows older than a quarter of a second are discarded, so frames that were updated but
not rendered (a level loading) cannot pile them up. Under heavy fire the cap is visible:
a single rocket fired continuously keeps about 750 puffs alive, so two or more at once start
to drop the oldest, still-visible puffs early. Puffs expire by age, the pool is cleared
on every map change and when Classic is selected, and also when the client clock jumps back
by more than a second (demo loop, new game). Smoke follows `cl.time`, so it freezes with pause.

## Verification (what was run)

* `tests/smoketrail_test.js` (6): the pool's seed, life and tile are exactly the source's
  `emitSmoke` for the same inputs; every puff's position, size, angle, alpha, tile and tint
  equals the source's `smokeList` at five times (about 540 puffs, about 2,700 comparisons, 1e-9), run in a sandbox
  against the source file (with `QUAKED_FIREBALL_SOURCE_REQUIRED=1` the test fails rather than
  skips when the file is absent); the same 1,000-unit flight at 7, 20, 30, 60, 144, 240 and
  1,000 fps yields identical puff counts, positions and birth times; exact spacing and the
  rocket/grenade nose offset; teleport, stale-trail and independent-carry behaviour; the pool
  stays at its cap under sustained firing and every puff expires.
* `tests/fireball_test.js` (19, 6 new for this card): routing of types 0/1 versus 2–6, Classic,
  `r_smoketrails 0` and missing textures; puffs in world coordinates inside the shared buffer
  with the rocket's exhaust glow (and none for a grenade or a stopped rocket); sorting together
  with explosion clouds, expiry, and clearing on Classic, a clock jump and a map change; the
  title-demo split; that every fallback brings back the native trail (and a call with no key
  keeps it); that size, alpha boost and the near-camera fade are exactly as documented; and
  that `cl_main.js` passes the entity number at all four call sites. Two missiles flown
  interleaved frame by frame keep exactly the spacing each. Reintroducing each of seven bugs
  (shared carry, no stale restart, no reset after a teleport, no near fade, no alpha boost, no
  size scale, a missing key on the demo path) makes a test fail.
* Real browser (Chromium on Metal, live game): real rockets and grenades photographed in
  flight; a synthetic missile crossing an open hall, side-on, compared with the source's own
  frame (thin soft wisp); the same real flight at about 61, 43 and 13 fps gives 361–362,
  350–356 and 328–345 puffs (`docs/evidence/smoke-trail-browser-2026-10-08.json`). The few-percent shortfall at 13 fps is physical, not emission error: the
  rocket has already travelled about 77 units before the client first sees it.

## Known differences and open items

* No soft-depth fade where smoke meets walls (the engine exposes no sampled scene depth to
  effects), as for the Fireball.
* Water and portal views are covered by the shared scene and clipping planes, not photographed.
* Tuning constants (`spacing`, `sizeScale`, `timeScale`, `nearFade`, `cap`) were set by eye
  against the source's frame and the live game; they are in one frozen object, `SMOKE`.
