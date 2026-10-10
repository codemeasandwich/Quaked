# Choosing the game: the shareware or the full Quake (card [34c], first increment, 10 Oct 2026)

## What it does

The console's `game` command chooses which game the page runs; `game` alone prints the current choice.

* `game shareware`: the shareware alone. The page reloads; the owner's full-game pack is not downloaded; Level Select
  offers the Introduction and Episode 1 only; saves are kept apart (`quake_save_shareware_<slot>`).
* `game quake`: the full Quake, as the page has run it since the full-game card (the owner's `pak0.pak` under the
  shareware: Episodes 2 to 4 from it, the shareware's QuakeC, palette and start worlds kept). Saves keep their
  original keys (`quake_save_<slot>`), so the saves made so far stay with it.
* Any other game is refused with the catalogue's reason ([34b]): a mission pack, episode or add-on "cannot be chosen
  yet: its HUD, QuakeC and protocol support are not yet shown to work"; a game that is not installed, "not playable".

With no choice made the start is exactly as before: the full Quake when its pack is there, else the shareware. The
choice is kept in the browser (`quaked.game.v1`); a browser that refuses to store it is told so, and nothing changes.

## Why a reload

The engine's search path only grows (nothing removes a pack), and its model, sound and picture caches are keyed by
file name and kept for the page's life (`Mod_ClearAll` skips alias models; `known_sfx`, `cachepics` and the loose files
are never cleared). Two games share most file names, so an in-page switch would need every one of those reset, and a
miss would show one game's model or sound in the other. Reloading the page is the clean boundary the engine already
has: every cache starts empty, the right packs are fetched (only those chosen), and the shareware's start is
unchanged. An in-page mount and unmount, with each cache's reset, belongs to the increments that bring the mission
packs, which need their own QuakeC, HUD and protocol.

## Where it lives

`src/engine/common/game_selection.js` (the choice, the packs it fetches, the save prefix, the `game` command). `main.js`
fetches the owned pack only as the choice says: none for the shareware, otherwise `games/Quake/pak0.pak` (card [34a]'s
folder) and then `resources/id1/pak0.pak`. `host_cmd.js` (save and load) and `menu.js` (the save and load lists) take
the save prefix from it, so the two can no longer disagree.

## Checked

* `tests/game_selection_test.js`: the default start; choosing the shareware (kept, reloaded, no owned pack, its own
  saves) and back; the refusals (not installed, a mission pack, an unknown name) and a blocked store.
* The suites around it: start-up (its two harnesses stub the choice), the full-game pack suites, the menu and save
  suites.
* In the browser, on the owner's machine: the default start fetched the owned pack and Episode 2 was there; a save made
  `quake_save_s0`; `game shareware` reloaded with no owned pack fetched, no Episode 2, and its save went to
  `quake_save_shareware_s0`; `game hipnotic` was refused; `game quake` brought the owned pack and Episode 2 back.

## Not done here

Choosing a game from the menu ([M1]); the mission packs' and the re-release episodes' support (their QuakeC, HUD,
items and protocol); an in-page mount and unmount; moving the owned packs into `games/` ([34d]).
