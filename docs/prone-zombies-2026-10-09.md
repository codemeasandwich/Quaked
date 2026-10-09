# A knocked-down zombie can be finished off

Card [40]. Newer Game only (local single player, stock progs); Classic keeps Quake's.

In stock QuakeC a zombie knocked down (25+ damage at once) goes SOLID_NOT at `zombie_paine10`: traces, missiles and
`T_RadiusDamage` all skip it, so it always gets up. `src/sv_pronezombie.js` (hooked in `src/pr_exec.js`) makes it a low solid box
while it lies there (SOLID_BBOX, 12 units high: a player steps over it), and gives it back its standing box and SOLID_NOT just
before the game's own stand-up test in `zombie_paine12`. Damage follows the game's own rule: `zombie_pain` resets its health to 60
on every hit, so only 60+ at once kills it (a rocket or grenade, a quad blast); then the game's own `zombie_die` throws its head
and gibs once and counts one kill. A smaller hit does nothing and it gets up on time.

Quake's autoaim (`PF_aim`, `src/pr_cmds.js`) aims at a target's origin, which for a lying zombie is its standing middle, 18
units over the box: a rocket aimed near it flew over. For a lying zombie only, autoaim now aims at the box's middle from the
height the shot leaves at; every other target keeps Quake's exact aim.

Review found that being hittable opened a path the stock zombie never took: a hit from anyone but its enemy runs `FoundTarget`,
which started it running in its lying box. Now a lying zombie turned on a new attacker keeps lying (its enemy changes,
`FoundTarget` is skipped) and stands on its own time; any standing behaviour reached while still lying gets the standing box
first; the standing box is given back at the stand-up in any mode (a Newer save loaded in Classic); and a lying box is only made
where it fits (never around a player). Lying solid, it also stops projectiles, touches triggers if it is moved, and blocks a
closing door (whose damage then does nothing to it).

## Checks

* `tests/prone_zombie_native_test.js` (7), real zombies on E1M3: lying hittable and low; a trace down at it hits it; a 20-point
  hit does nothing; a 110-point hit gibs it once with one kill and nothing gets up; a blast (`T_RadiusDamage`) gibs it; left alone
  it stands with its own box; with the player on it, it stays down and hittable; the save holds the lying box; Classic stays
  SOLID_NOT. Mutants (no lying box; no standing box restored) fail. Pinned-zombie and axe suites pass.
* Review cases: hit by someone not its enemy, it turns on them but stays down and stands with its standing box; a zombie lying in
  a Newer save stands up whole in Classic; a lying box is never made around a player; the player stands on top of it, free.
  Mutants (no `FoundTarget` skip, the standing box only in Newer, no fit check) fail.
* A fifth test: a rocket fired near a lying zombie passes through its box (fails without the aim change: 110 units, over the box).
* Browser, E1M3: a zombie knocked down is SOLID_BBOX with the low box and health 60; a real rocket fired at it gibs it (its head
  flies, the kill is counted). Before the aim change the same rocket flew over it.

## Not checked

Whether smaller hits should add up while it is down is the owner's call (Quake's rule is kept).
