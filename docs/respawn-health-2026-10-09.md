# Normal difficulty: falling respawn health, topped up by new levels

Card [4]. On Normal, dying costs something and moving on earns a little back.

## The rule

The player has a **respawn-health entitlement**, starting at 100 on a new game.

* Each completed death and respawn takes **10** off it, down to a floor of **60**, and the player respawns with that
  health: 90, 80, 70, 60, 60, 60, ... The corner message **"Respawn minus 10 health"** is shown only when the
  entitlement actually went down, so not for the 60 to 60 respawns.
* The first time the player arrives, by `changelevel`, in a level not seen before in this run, the entitlement
  goes **up 10, to at most 100**, and **"Next phase plus 10 respawn"** is shown, only when it actually went up.
* The entitlement is its own number. Current health, health pickups and armour never change it.
* **Normal only** (`skill 1`). Easy, Hard and Nightmare respawn at 100 as before, and neither lose nor recover any
  entitlement; the run keeps whatever it had on Normal.
* Newer Game, single player, local only: the respawn system this belongs to is the clockwise respawn
  ([clockwise-respawn-2026-10-04.md](clockwise-respawn-2026-10-04.md)).

## What counts as "a level not seen before"

A run keeps a list of the levels it has been in (`state.visited`, in the player's respawn record, newest 512). The
level a run starts in is on it from the start; leaving a level always puts it on the list, which also covers a save
made before the list existed. A level is named by the progs CRC and the map path the server reports
(`24778:maps/e1m2.bsp`). **This engine has one map namespace and no game directories, so today that is the bare map
name**; the CRC and path only guard against a future progs build or map location. Two same-named maps from different
campaigns would need a content hash of the map file in the key, which is not done.

Only the game's own **`changelevel`** path (stock exits, seamless crossings, the console command) is a transition.
These give nothing: Level Select and the console `map` command (a fresh run, entitlement back to 100), loading a
game (the saved entitlement and list come back), a return to a level already seen, a repeat visit after a reload,
and teleporters inside a level. Walking A, B, A, B pays once, for the first B.

## Persistence and edge policies

* **Save and load:** `respawnHealth` and `visited` are saved with the player's respawn record (`_clockwise_player`),
  validated on load (an integer from 60 to 100; at most 512 names of at most 160 characters); a record that fails is
  refused as before. A save from before this change loads with entitlement 100 and an empty list.
* **Travel:** the entitlement and the list always travel with the player through `changelevel` (the carried
  weapons and ammunition still travel only after a death, as before).
* **Dying as the level changes:** the entitlement and the levels seen travel unchanged (an unfinished death is not a
  completed respawn, so it takes nothing and cannot make a later return visit pay). Only the carried weapons and
  ammunition are withheld from the middle of a death, as before.
* **Classic Quake (Newer off):** a Classic arrival gives no reward and shows no message. With no death behind it
  no run record is created (as before). After a death the old inventory carry still happens, so a record exists, and
  the levels entered in Classic are marked seen without paying. Switching back to Newer resumes the run.
* **Restart / new game / Level Select:** a fresh run, 100.
* The change of difficulty mid-run is honoured at each death or arrival: only Normal ones count (the live `skill`
  setting is read, as the game's own QuakeC does).
* The corner message is not drawn over a demo, the menu or the console, and is cleared with the carried data when
  a game is started or loaded.

## Where

`src/newer/gameplay/sv_respawn.js` (`respawnHealth`, `levelKey`, `SV_RespawnCaptureTravel`, `restoreTravel`, the contact step that
used to write 100), `src/newer/gameplay/respawn_record.js` (validation), `src/newer/ui/respawn_notice.js` (the message channel between the
local server and the screen), `src/engine/render/gl_screen.js` (`SCR_DrawRespawnNotice`, top right just under the FPS line,
for three seconds).

## Checks

* `tests/respawn_health_native_test.js` (16), real `progs.dat` and server: the 90/80/70/60/60 sequence and the exact
  message only on decreases; stamping and three-second life; pickups and damage do not change the entitlement; Easy,
  Hard and Nightmare unchanged; mid-run difficulty change; A to B to A to B pays once, never above 100, no message
  without a gain; Hard and Level Select (fresh run); the starting level counts as seen; a save with no ledger; the
  level key; a level change in the middle of a death; Classic arrivals; the 512 cap; save and load round trip with refusal of eight kinds of bad data.
* `tests/respawn_notice_screen_test.js` (2): the real draw function and `Draw_String` onto a real canvas put the
  text in the top-right rectangle while it is active and nowhere before or after, nor over a demo or the console; `SCR_UpdateScreen` calls it once.
* Mutation checks, each failing a named test: not Normal-only, a floor of 50, the message on every death, a reward on
  every arrival, no cap, the reward message without a gain, the entitlement not carried, the departing level not
  seen, no validation; progress dropped in the middle of a death; the reward or a record in Classic; no 512 cap; the
  message in the wrong corner, never expiring, or over a demo.
* Existing suites that assumed a full-health respawn on Normal now run on Hard
  (`respawn_native_test`, `respawn_hazard_native_test`, `model_surface_native_test`, which are about drops, hazards and
  the blood coating), or expect the new first-death value of 90 (`welcome_aids_test`, `face_native_test`); all pass.

## Not checked

No browser capture of the message's look (size, contrast over bright scenes). It is the game's own 8-pixel text in
white, like the FPS counter, with no background. The walking-through-an-exit sequence was exercised with the
game's `changelevel` spawn-parameter path, not with a click-through of a real intermission. The message has no
sound, and it is not scaled with the HUD size options.

Two independent reviews: the second found three should-fix issues (progress lost in the middle of a death, the reward
reaching Classic, an over-claim about level identity) and four nits, all addressed above.
