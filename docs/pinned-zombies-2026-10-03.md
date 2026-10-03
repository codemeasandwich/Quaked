# Destructible pinned zombies — 2026-10-03

Newer Game's freshly spawned and restored crucified zombies now receive real weapon damage
and burst through the existing QuakeC zombie death routine when their native
60 health is exhausted. Nonlethal hits keep them attached to the wall and keep
their original crucifixion animation. Classic New Game and walking zombies keep
their original behavior.

## Existing behavior and the exact change

`ED_LoadFromFile` parses the map's entity, resolves its actual QuakeC classname,
and executes `monster_zombie`. The bundled `progs.dat` initializes the model,
`SOLID_SLIDEBOX`, collision bounds, 60 health, `zombie_pain`, and `zombie_die`
before testing spawn flag 1 (`SPAWN_CRUCIFIED`). That branch sets `MOVETYPE_NONE`
and runs the native six-frame `zombie_cruc1`–`zombie_cruc6` loop. It skips
`walkmonster_start`, so `takedamage` remains `DAMAGE_NO`.

The new `SV_PinnedZombieSpawned` call runs immediately after that existing spawn.
It changes two ordinary QuakeC fields only:

- `takedamage` becomes the existing `DAMAGE_AIM` value, enabling the original
  hitscan, targeting, projectile and splash-damage paths.
- `th_pain` becomes null. Native `T_Damage` already checks whether this callback
  exists. The ordinary zombie pain routine restores health to 60 and starts
  standing pain animations, so invoking it would heal or detach the pinned
  zombie after a nonlethal hit.

Health, origin, angle, bounds, solidity, movement, thinking, death callback, and
monster counts are not replaced. The helper requires Newer Game, the actual
`monster_zombie` classname, crucified flag, fixed movement, positive health,
disabled damage, the native named pain/death callbacks, and an active crucified
think callback. Unsupported or already initialized entities are left alone.
Monster callbacks are loaded-program extension fields, accessed through the
existing `GetEdictFieldValue` interface; they are not added as JavaScript-only
properties on `entvars_t`.

## Damage, death and saves

The runtime path is unchanged: native `W_FireShotgun` calls `FireBullets`, the
existing trace builtin uses `SV_Move`, `TraceAttack` collects actual pellet
damage, and `T_Damage` subtracts health. Lethal damage calls `Killed`, which
dispatches the retained native `zombie_die`; `ThrowHead` transforms the attached
body into the original zombie head and three `ThrowGib` calls make ordinary gibs.
Their sound, motion and cleanup remain native. There is no timer, visual-only
death, substitute damage calculation, new hitbox, or `progs.dat` modification.

Native `Killed` handles `MOVETYPE_NONE` objects through its direct death-callback
branch before monster tally accounting. These decorative zombies therefore add
no total or killed-monster credit, preserving the level's existing accounting.

The two fields and accumulated health use the ordinary `ED_Write` /
`ED_ParseEdict` save path. Saves made after this initialization preserve damage
and destruction. `Host_Loadgame_f` calls the same guarded initializer immediately
after parsing each saved edict and before linking it into the BSP. A living stock
crucified zombie restored from an older save with damage disabled gains the same
damage/pain settings in Newer Game, without changing its saved health, position,
bounds or animation schedule. Dead, free, already-mortal, nonnative-callback and
classic records are preserved. No save format or version changes are needed.
The mode is selected at spawn or load: changing a presentation cvar afterward
does not rewrite an already-running entity's health or saved combat state.

## How to try it

Start **Newer Game** on the Introduction map (`start`) and enter the Hard skill
hall. A native pinned zombie is at `[1004, 928, 72]`, facing west. Aim at its body
and fire the shotgun repeatedly, or use another actual weapon. Normal shotgun
pellet spread means the number of shots depends on how many pellets land.
Compare a freshly started **New Game**: the same decoration remains immune.

## Verification

The focused tests load the actual bundled `progs.dat`, native models and START
BSP, execute the public map-spawn loader, and fire actual `W_FireShotgun` code.
The trace builtin is observed after calling its original implementation; it is
not replaced with a fabricated hit. Deterministic spread is used solely to
measure six confirmed native pellets per shot.

The focused proof checks health `60 → 36 → 12 → death`, ammunition `10 → 7`,
unchanged pinned origin/bounds, native head plus three native gib models, no
monster count changes, classic immunity, ordinary zombie pain behavior, and
save/restore followed by actual `T_Damage` death. The legacy-save test exercises
the same public edict-parse, guarded initializer and link sequence used by
`Host_Loadgame_f`; it does not claim a full browser load/reconnect trial. Separate
checks preserve dead, free, already-mortal and modified-callback records.
VM, entity allocation, aiming,
collision, server packets and save-menu regressions run alongside it through the
existing process-isolated test runner.

```sh
QUAKED_THREE_MODULE=/private/tmp/quaked-three.module.mjs \
  /Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  tools/run_tests.mjs tests/pinned_zombies_test.js tests/pr_edict_test.js \
  tests/pr_exec_test.js tests/pr_address_test.js tests/pr_aim_test.js \
  tests/world_test.js tests/sv_main_test.js tests/menu_save_test.js
```

The initial spawn-only **11/11** result is retained in
[`evidence/pinned-zombies-tests-2026-10-03.txt`](evidence/pinned-zombies-tests-2026-10-03.txt).
The final spawn-and-restore result is retained in
[`evidence/pinned-zombies-restore-tests-2026-10-03.txt`](evidence/pinned-zombies-restore-tests-2026-10-03.txt).
**13/13 checks passed: five focused native damage/restore checks and eight
existing VM, entity, collision, server and save-menu checks.**
This is focused executable proof; live browser appearance, arbitrary mod
QuakeC programs and remote-server qualification remain separate. No commit,
publication or release is claimed by this feature record.
