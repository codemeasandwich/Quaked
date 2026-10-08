# Respawn after slime or lava: no carried-over hazard damage

Card T-f09bf1a6, "[41] Respawn bug: clear stale toxic-water/lava damage at the new location". Baseline Dev `19afb82`.

## Reproduced (before the fix)

On the real server with the stock QuakeC, a player killed by the game's own slime or lava damage and respawned by the
respawn coordinator at a dry spot was hurt again on the first tick: health 100 -> **88** after slime and 100 -> **70**
after lava, with `waterlevel 3` and the old `watertype` (-4 slime, -5 lava) still on the player at contact, although the
new position is dry air. (The reproduction is `tests/respawn_hazard_native_test.js`, which failed 4 of 5 checks on the
old code with exactly these numbers.)

## Cause

`sv_respawn.js` `contact()` moves the player to the saved start after the native `PutClientInServer`, but `waterlevel` and
`watertype` are only recomputed by `SV_CheckWater`, and nothing runs it until the first full physics pass **after the
whole respawn sequence** (`SV_RespawnFrame` returns early for the rise, about 1.3 s, with movement and QuakeC held). In that
pass `SV_Physics_Client` runs the player's `PlayerPreThink` (`WaterMove`) *before* `SV_CheckWater`. So (a) during the rise the
player already stands at the dry destination with the dead player's liquid on it, which the face and the clientdata water
flag show as a submerged player, and (b) the first QuakeC tick after the sequence saw that liquid and applied
`T_Damage( 4 * waterlevel )` (slime) or `10 * waterlevel` (lava); the old `dmgtime` had long expired. `PutClientInServer`
resets `air_finished`, `dmg` and the water flags in `flags`, but not `waterlevel`/`watertype`.

## Fix

At contact, after the player is linked at the destination, `SV_CheckWater( p )` (the engine's own routine) refreshes
`waterlevel` and `watertype` for the destination, so neither the rise nor the first tick evaluates stale state; `dmgtime`
is cleared too (hygiene: the old timer has always expired by then, so this changes no behaviour). The refresh is repeated
when the sequence completes (idempotent), which also corrects a game saved during the rise by a build without the fix. Nothing else is touched: no invulnerability, no timed blackout, no forced dry.
A destination that really is wet is seen as wet at contact and obeys the native rules, and a later walk into a hazard hurts
as before. Radiation suit and air supply are the existing mechanisms (the suit is removed with the other powers at
death; `PutClientInServer` gives a fresh air supply).

## Verification

`tests/respawn_hazard_native_test.js` (6), real QuakeC, real server physics, real stock pools found by scanning the levels'
contents (slime in e1m4, lava in e1m6): a dry respawn after dying in slime and after lava has `waterlevel 0` and `watertype`
empty already at contact (during the rise), and after the sequence a cleared timer, full health on each of 400 following ticks
and a fresh air supply; a respawn whose start really
is in the liquid sees `waterlevel > 0` at contact and is hurt natively; a dry respawn followed by a walk into the liquid is
hurt; the sequence ends when it always did, the player can be damaged and walks again (not forced by the test), a real
15-point hit lands, inventory, ammunition and health are as before; a stale state left by an old save is corrected at completion. Deliberate mutations (no water refresh, the player forced dry regardless of the destination, no refresh at contact only,
no refresh at completion, the player left immune) each make a test fail; clearing `dmgtime` is caught only by a direct
state assertion, since it changes no behaviour. The existing respawn
tests (`respawn_native_test.js` 17, `respawn_remains_test.js` 7) pass.
