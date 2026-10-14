# Gibs that sound when they land

Item 10 of the add-on effects for every game (card T-3faa98e3; plan:
[addon-effects-integration-2026-10-13.md](addon-effects-integration-2026-10-13.md)).

## What it does

In Newer Game, in every supported game, a gib that comes to rest makes a quiet wet thud: the game's
own `zombie/z_fall.wav` (stock Quake has it; a game or add-on with its own file of that name is
heard instead, through the ordinary sound search), at 0.3 of full volume, where the gib lies.

- **When:** the same rest the blood mark under a gib already waits for (`src/newer/render/gib_rest.js`,
  moved out of `r_decals.js` word for word: still for 0.3 s, moving less than 0.6 units in a tenth of
  a second). Each gib sounds once. A gib is any model with Quake's gib flag (`EF_GIB`, model flag 4).
- **Never at the cost of a game sound:** it plays only while more than four dynamic channels are free
  or finished (`S_StartSoundIfFree` keeps that reserve, `snd_dma.js`), so the game's own next sounds
  always find a channel; otherwise it is skipped. At most four gibs
  sound in one frame.
- **Off** in New Game, the classic half of the title demo, while paused, at intermission, and with
  `s_gibs 0` (saved; Options, Newer features, "Gib sounds").
- The sound keeps its own watch of each gib (`_gibAudioState`), apart from the blood mark's
  (`_gibState`), because the blood mark only watches gibs that are drawn while a gib out of sight can
  still be heard. The blood marks are unchanged.
- Multiplayer: the client also watches the packet positions (`S_GibRestPackets`, `cl_main.js`), so a
  gib not yet linked this frame is still heard.

## Checks

`tests/gib_sounds_test.js`, through the real sound system with the shareware pack's real sound: one
sound, at 0.3 volume and the gib's place, once; none for a moving gib, a body that is not a gib, New
Game, the classic half, `s_gibs 0`, a pause or intermission; at most four in a frame; none when every
channel is taken, and no game sound cut off; the rest rule itself. `tests/r_decals_test.js` and
`tests/blood_runs_test.js` cover the unchanged blood marks.
