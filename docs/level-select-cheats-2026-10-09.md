# Level Select by episode, and a Cheats menu in Options

Card [L1].

## Level Select: episode, then level

Single Player > Level Select now has three rows above the levels: **Game** (Newer Game or New Game), **Skill**, and
**Episode**. Left and right (or Enter, or a tap) on the Episode row step through the episodes this copy of the game has,
wrapping round; the levels listed below are that episode's, with their names.

* All stock maps are listed by episode, each with the title the map itself carries: the Introduction (`start`), Episode 1
  (E1M1 to E1M8), Episode 2 (E2M1 to E2M7), Episode 3 (E3M1 to E3M7) and Episode 4 (E4M1 to E4M8, then `end`,
  Shub-Niggurath's Pit, the final level; E4M8 is The Nameless City).
* An episode appears only if at least one of its maps is available: the shareware `pak0.pak` gives the Introduction and
  Episode 1; the 2021 re-release's `pak0.pak` read from `resources/id1/pak0.pak` adds Episodes 2 to 4 (the original release
  keeps them in `pak1.pak`, which is not read)
  ([fullgame-pak-2026-10-05.md](fullgame-pak-2026-10-05.md)). Within an episode only the maps present are listed.
* Episode 1 is the default when it exists (the cursor opens on its first level, E1M1; before, it opened on the Introduction), and the
  menu remembers the episode and cursor between visits. Keyboard, Enter and touch all work; a level starts exactly as
  before (`map <name>` with the chosen game mode and skill).
* The old fixed list (the Introduction, Episode 1 and E2M1) is replaced; `LEVEL_SELECT_LEVELS` keeps its name and now
  carries each map's `episode`.

## Options > Cheats

A new last row in Options, **Cheats**, opens a small menu of the game's own cheat commands:

| Row | Command | Shown |
|---|---|---|
| God mode, No clip, No target, Fly | `god`, `noclip`, `notarget`, `fly` | on/off, read from the player's flags and movement |
| All weapons and ammo | `impulse 9` | |
| Full health | `give h 100` | |
| Quad Damage | `impulse 255` | |

* They work only in a local single-player game: the menu refuses and says "Cheats need a single player game" when there is no
  game, in multiplayer, in deathmatch or in co-op. (The game's own `god`, `noclip`, `notarget`, `fly` and `give` only refuse in
  deathmatch, and `impulse 9` and `impulse 255` refuse in co-op too; the menu's own single-player check is what blocks the rest.)
  After a co-op session `coop` can stay set, so the menu may refuse in what is really a single-player game.
* The menu says **"Cheats used in this game: yes/no"**, counting only cheats used from this menu (not typed in the console).
  It starts again for every map load and every loaded game (it is keyed to the game's entity list, not the map name).
  There are no achievements or unlocks and the respawn rules are not affected, but the switches are fields of the player
  and so are kept in a save game.
* A one-shot give (all weapons, full health, Quad Damage) needs Enter or a tap; the arrow keys only flip the switches.
  `impulse 9` and `impulse 255` take effect when the menu closes (single-player time stops while a menu is open) and are
  dropped during the respawn rise, which clears the player's impulse every frame.
* Up and down move (wrapping); Enter, left, right and a tap apply the row; Escape returns to Options.

## Checks

* `tests/level_select_test.js` (4): the shareware copy offers the Introduction and Episode 1, defaults to Episode 1 with
  its eight levels on the cursor, steps and wraps on the Episode row (also with Enter), and launches the Introduction and
  E1M5; with the owned full game (read from `resources/id1/pak0.pak`, never copied) all five episodes and each episode's
  levels, Episode 4 (with `end`) wraps to the Introduction, E3M3 launches in Newer Game and in Classic, the episode is
  remembered, and `end` and E4M8 launch; a fourth test reads what is drawn (the Episode row at y 64 with its name at x 184,
  level row i at y 84 + 8 i, nothing at the old row, the Introduction's single row); touch steps the episode, starts a tapped level and ignores taps between the rows. The full-game part
  prints whether it ran (it ran in this evidence).
* `tests/cheats_menu_test.js` (2): the row is last in Options and opens the menu (keys and touch), Escape returns; each row
  sends its game command, the states read from the player's flags, the note says "no" then "yes" and starts again for a
  new game on the same map (and is not reset by a map name alone), the arrows do not fire the one-shot gives, the cursor wraps
  both ways, touch applies a row, and multiplayer, no game, deathmatch and co-op all refuse
  and say so.
* Updated for the new layout: `tests/options_order_test.js` (18 rows), `tests/fullgame_pack_test.js` (needs
  `QUAKED_OWNED_PAK`) and `tests/demo_hdr_ownership_test.js`.
* Mutation checks, each failing a named test: a cheat applied outside single player, the wrong command, the "used" note
  never set, deathmatch allowed, no wrap, Cheats missing from Options; all episodes always offered, levels of every episode,
  the episode never changing, the default being the Introduction. (A touch-offset mutant is equivalent: the start handler
  already ignores a missing level.)

## Not checked

No browser capture of either screen (they are the game's own 8-pixel menu text). The Cheats rows depend on the game's
cheat commands being allowed (they are not in deathmatch or co-op, and the menu cannot see QuakeC's own `deathmatch`
global, only the cvar). Mission-pack episodes are not listed (this engine has none). The episode names are short so they
fit the 320-pixel menu ("E2 Black Magic").
