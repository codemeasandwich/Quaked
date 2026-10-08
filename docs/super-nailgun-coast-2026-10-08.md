# Held super nailgun: the barrels coast and spin down after firing

Card T-d833f5d2, "[45] Equipped super nailgun: smooth barrel coast and spin-down after firing". Baseline Dev
`0839b30`. Before this change the held super nailgun's four barrel assemblies stopped dead the moment firing ended.

## What it does

`R_WeaponRotorFrame` (`src/r_weapons.js`), the existing rotor coordinator, now keeps a **continuous angle and angular
velocity** per held weapon entity instead of an angle derived from the current pose:

* **Firing** (any weapon pose except the idle pose 0): the speed eases up to the firing speed, the stored poses' own rate
  and direction (the poses step 45 degrees each 0.1 s weapon frame, so -pi/4 / 0.1 = about -7.85 rad/s, 1.25 turns a
  second, a full turn in eight frames), with a short time constant (0.06 s).
* **Firing stops:** the barrels keep turning the same way and the speed decays exponentially (time constant 0.25 s), a
  coast of about 2 rad (a third of a turn, mostly done in three quarters of a second), and settles with exactly zero
  speed (below 0.1 rad/s the rotor is set to rest, which leaves about 0.025 rad of invisible travel and ends the
  per-frame geometry rebuild, which costs about 2 ms with the real 2,176 rotor vertices, about a second sooner).
* **Firing again** eases from the current angle *and* speed: no snap in angle, none in speed.
* Both are **exact exponential integrals** over the game-time step, so the result does not depend on the frame rate; the same
  game time (a pause, or a second render pass) integrates nothing; the Classic pass has no rotor asset and neither
  advances nor erases the enhanced state.
* Only the rigid barrel vertices and their normals rotate, about the asset's own axis and pivot, from the shared
  immutable rest geometry; spacing, radius, body, bounds and muzzle are untouched. A fresh entity, a clock that jumps back,
  a stale gap, a teleport, a clock that jumps back or the game replacing the pose-blend record **do not** restart it
  (an earlier version did, which would have stopped a coasting rotor dead and snapped the angle; an independent review
  found it): the angle and speed carry on, a long gap is integrated exactly and a rollback only re-anchors the time. Only
  a new rotor asset restarts the state and only losing the rotor asset (unequipping, another weapon) releases it. A
  non-finite time is ignored.

`ROTOR` (`step .1`, `spinUp .06`, `spinDown .25`, `stopBelow .1`) holds the tuning: small, documented values, not
measured from the original game. The stored poses are now used only for the firing speed and direction and for the angle a
fresh state starts from (the rest of the model does not change between poses); the previous behaviour of interpolating
the angle between pose angles is gone, and with it the difference `r_lerpmodels 0` used to make (the barrels stepped
between poses): the rotor is now always smooth (`docs/weapons-and-shells-2026-10-02.md` is updated). The step is read
from the stored angles wrapped into (-pi, pi]; a missing or zero step falls back to -pi/4 per 0.1 s.

Coast length: the speed times the decay time, 7.85 x 0.25 = about 2 rad. (An earlier draft used 0.45 s, which is a 3.5 rad coast, more
than half a turn; it was shortened because the card asks for a small coast.)

## What is not changed

Native weapon frames, firing cadence, ammunition and damage; pickups do not spin (they are drawn through the same function but
have no rotor data, so it returns nothing for them).
The rotor settles wherever the coast ends (as it did before it ended on whatever the last firing pose was); there is no
detent alignment, because whether the four barrels are interchangeable under a quarter turn is not known here.

## Verification

* `tests/weapon_rotor_test.js` (6), on a synthetic rotor asset driven through the public function as `gl_mesh.js`
  does (a persistent pose-blend record, the game's frame as the pose and the game's time; the weapon archives are not needed): the firing speed and direction; coast continuing in the same direction, speed only
  falling, a coast distance equal to speed x decay time within 2%, exact zero speed and a stable settled angle, no step in
  speed between frames; resuming fire with no jump or reversal of angle and a ramped speed from mid-coast; the same angle at
  20, 60, 144 and 240 frames a second (to 0.1 degree), nothing integrated at a repeated game time, Classic leaving the
  state alone; teleports, a replaced pose-blend record, a clock that goes back, a long gap and a non-finite time never
  stop the coast or snap the angle; rigid motion (radius and axis position kept, body vertices and shared rest arrays untouched, unit normals),
  independent states, a new asset starting afresh, release when the asset goes away. Deliberate mutations (never stopping, speed jumping to
  its goal, lost coast distance, no exact stop, restarting on a clock jump back, capping a long gap, a coast that is far too
  long) each make a test fail; ignoring a non-finite time is covered by a check that it does not poison the clock.
* `tests/supernailgun_profile_test.js`, which pinned the old pose-interpolated angle, is rewritten for the new contract
  (rotor state and geometry through the public draw, firing speed, coast, refire, settling). It needs the local
  `supernailgun2.zip`, which is not on this machine, so **that rewritten test has not been run**; the same behaviour is
  checked on the synthetic asset and in the real game.
* Real game (Chromium on Metal, e1m1, the real imported super nailgun with its 2,176 rotor vertices, final constants):
  holding fire gave a steady -7.85 rad/s; releasing it decayed -4.31, -1.21, -0.34 rad/s and 0 over about a second, the
  angle advancing about 1.6 rad (a quarter of a turn) and then holding still. The sampling used an ad hoc script that is not kept
  in the repository (an unrecorded observation); no photograph of the barrels mid-coast was taken.
