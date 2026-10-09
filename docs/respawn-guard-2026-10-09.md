# A guard monster at the death location

Card [2]. After a completed respawn the game leaves one native monster where the player fell: a **Fiend** on Normal, a
**Shambler** on Hard and Nightmare, none on Easy. It waits in its ordinary idle. It guards the weapons and ammunition the
death scattered there ([clockwise-respawn-2026-10-04.md](clockwise-respawn-2026-10-04.md)).

## How it works

* **The game's own monster.** At the moment the respawn lands (`contact()` in `src/sv_respawn.js`), after the alert pass
  that wakes the level, the game's QuakeC spawn function (`monster_demon1` or `monster_shambler`) runs on a new entity
  at the recorded death spot. So it is a real Fiend or Shambler: stock model, health, sounds and behaviour, counted in the
  kills, saved with the game, killable. It is not part of the alert pass, so it waits instead of hunting the player at
  once; ordinary AI takes over when it notices the player.
* **The death spot is checked.** The player's death position is recorded in the respawn sequence (so it survives a save).
  The nearest standing spot is used: the position itself, then a little above it, then a ring of 8 positions at 48 and 96
  units (at two heights). A spot must be in empty air (not lava, slime, water or rock), have room for the monster's hull
  (32 by 32 by 88) with the world, **every other monster and the just-respawned player** counted, be reachable by a clear
  line from the death point (a ring spot is never across a thin wall), have ground within 256 units below that is not
  liquid, and be **at least 128 units from where the player respawns** (nobody is put beside a fresh respawn, so a death
  at the start leaves no guard). A death in lava or deep inside rock, or with no such spot, simply leaves no guard, and
  the monster is never stuck in anything.
* **It counts.** The guard is a real monster: `total_monsters` grows by one (a client is sent an `svc_updatestat` for
  `STAT_TOTALMONSTERS` so the intermission and status read the new total) and killing it is a kill within that total.
* **One per completed death.** The sequence marks itself guarded; late frames, repeated sequence frames and a save made
  after the contact add nothing. A save made before the contact respawns once on load, with its own guard. A saved
  Fiend or Shambler keeps its model by name on load (its slot in the model table can differ between the two games).
* **Resources are reserved at load.** A monster's models and sounds can only be precached while a level loads. At load
  (`SV_RespawnReserveGuards`, called from `SV_SpawnServer` after the level's own spawn functions), when the model is
  already in the table or both tables have room (8 models and 24 sounds), the game's own spawn function is run once on a
  throwaway entity for each of the two monsters to reserve exactly what it needs; the entity is wiped, the entity count
  and `total_monsters` put back, so nothing is counted or left behind. With no room, or without the stock monsters, that
  level has no guard. **This happens in every local single-player level, Classic included** (like the drop models the
  respawn already precaches): both monsters' models and about 16 sounds are loaded even where no guard will ever appear.
  The difficulty used is the one the level loaded with, so changing `skill` mid-level does not change the guard.
* **Switch.** `sv_respawnguard 0` turns the guard off (default 1). Newer Game, single player, local only (the same gate as
  the rest of the respawn system); Classic Quake is unchanged.

## Interaction with other rules

* The guard stands on the spot where the drops are, so to recover them the player has to deal with it: that is the point.
* It adds a monster to the level's total and to the kills when killed.
* The Normal-difficulty respawn health ([respawn-health-2026-10-09.md](respawn-health-2026-10-09.md)) is separate.

## Checks

* `tests/respawn_guard_native_test.js` (11), real `progs.dat`, real server, stock maps, real physics frames: both monsters
  are reserved at load with their models and sounds, and reserving twice leaves `total_monsters`, the entity count and the
  monster list unchanged; a reservation that has to take a fresh slot puts the count back and leaves the slot blank; Normal
  leaves exactly one Fiend within about 110 units of the death spot, with the stock model and health, idle (no enemy), not
  alerted, while every earlier monster still is; Hard and Nightmare a Shambler, Easy none; the guard is not stuck, nor is
  the player, beside a monster's own spot, at the respawn point (no guard) and on repeated deaths on one spot; the total and
  the kills count it, the client is sent the new total, and it stays idle over 80 real server frames; one guard per death,
  none with `sv_respawnguard 0`; saves made before and after the contact; a death in lava never puts a guard in the lava,
  a death in rock leaves none and the respawn still completes; a grid of about 10,400 real death points (6,900 got a spot, 3,500 none; air, water,
  lava, slime) across three maps where every returned spot obeys every placement rule; with no room in the tables nothing
  is reserved, nothing throws, the stock respawn works, and with room again both are reserved.
* Mutation checks (16), each failing a named test: Normal getting a Shambler, Easy getting a guard, the guard before the
  alert pass, the cvar ignored, monsters not counted for the hull, the keep-away removed, the line-of-travel check removed,
  the ground check removed, the room check removed, the throwaway not wiped, the entity count not restored, the total
  not counted, no `svc_updatestat`, the difficulty not fixed at load. (The entity count defect was first found by the
  existing save/load remains test `tests/respawn_remains_test.js`.) Two mutants survive as equivalent: the one-shot flag
  (the contact itself runs once, so removing the flag changes nothing observable) and the contents check (a spot in a
  liquid fails the ground check's own liquid test).
* The older drop, health, remains, hazard and model-surface tests run with `sv_respawnguard 0` and their original
  difficulty so nobody stands on the drops; the face tests with a real respawn pass unchanged.

## Not checked

No browser capture of a guard standing over the drops. A guard placed where the player will walk can block a corridor
until it is killed (the intent). The stock monsters' sounds are a few dozen table slots, so a level already near the
256-sound limit gets no guard. Mission-pack monsters are not used. How a Shambler guard feels on Hard (600 health, lightning
at range) against a freshly respawned axe-only player is for the owner to judge.
