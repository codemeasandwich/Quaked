# A knocked-down zombie can be finished off

Card [40]. Newer Game only (local single player, stock progs); Classic keeps Quake's.

In stock QuakeC a zombie knocked down (25+ damage at once) goes SOLID_NOT at `zombie_paine10`: traces, missiles and
`T_RadiusDamage` all skip it, so it always gets up. `src/sv_pronezombie.js` (hooked in `src/pr_exec.js`) makes it a low solid box
while it lies there (SOLID_BBOX, 12 units high: a player steps over it), and gives it back its standing box and SOLID_NOT just
before the game's own stand-up test in `zombie_paine12`. Damage follows the game's own rule: `zombie_pain` resets its health to 60
on every hit, so only 60+ at once kills it (a rocket or grenade, a quad blast); then the game's own `zombie_die` throws its head
and gibs once and counts one kill. A smaller hit does nothing and it gets up on time.

## Checks

* `tests/prone_zombie_native_test.js` (4), real zombies on E1M3: lying hittable and low; a trace down at it hits it; a 20-point
  hit does nothing; a 110-point hit gibs it once with one kill and nothing gets up; a blast (`T_RadiusDamage`) gibs it; left alone
  it stands with its own box; with the player on it, it stays down and hittable; the save holds the lying box; Classic stays
  SOLID_NOT. Mutants (no lying box; no standing box restored) fail. Pinned-zombie and axe suites pass.
* Browser, E1M3: a zombie knocked down is SOLID_BBOX with the low box and health 60.

## Not checked

A real rocket fired at a downed zombie in the browser did not kill it in my one scripted try (the aim at a lying target is the
likely cause; not investigated). Whether smaller hits should add up while it is down is the owner's call (Quake's rule is kept).
