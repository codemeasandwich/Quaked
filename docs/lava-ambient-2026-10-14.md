# Lava you can hear

Item 4 of the add-on effects for every game (card T-3faa98e3; plan:
[addon-effects-integration-2026-10-13.md](addon-effects-integration-2026-10-13.md)).

## What it does

Quake's sound system has four ambient channels, faded by how close each part of the map (each BSP
leaf) is to water, sky, slime and lava. Quake only ever gave the water and sky channels a sound. In
Newer Game, in every supported game, the lava channel now plays the lava's sound, so lava pools,
rivers and falls can be heard as you come near them and fade as you leave.

- **The sound:** `ambience/lava1.wav`, the name Dimension of the Machine and Soul of Evil use for
  their own lava sounds. A game with that file is heard with its own; every other game hears a sound
  the engine makes (`src/newer/sound/s_synth.js`): a 4-second loop of a low roil with thick bubbles
  breaking, held well under full volume and made to loop without a click. It goes through the
  ordinary sound cache and mixer (the owner's ruling of 13 Oct: generated fallback sounds, a game's
  own file always winning; `S_RegisterSoundFallback`, `snd_mem.js`). The made sound is offered in
  Newer Game only: in New Game a sound a game lacks stays missing, with its console message, as always.
- **How loud, where:** the map's own lava level in each leaf, scaled by `ambient_level` and faded by
  `ambient_fade`, exactly as the water and wind are. The re-release's maps, Dimension of the Machine
  and Arcane Dimensions store lava levels (e1m7, e3m4, e3m6, e4m3 and `end` among them). The 1996
  maps were compiled without them (the shareware e1m7 has lava and no lava level anywhere), so for a
  map that has lava surfaces and no stored lava level they are worked out once as the map compiler's
  vis works them out: for each leaf, the nearest lava surface among the leaves it can see, measured
  from the leaf's box as vis measures it (how far outside the box each corner lies, added up along
  the three axes); full within 100 units, fading to nothing at 500 (`R_LavaLevelsFill`). A map
  with any lava level of its own is never changed (and costs only a look at its levels). The levels
  are worked out again each time the map loads, a restart included.
- **Off** in New Game (the channel stays silent, as it always was) and with `s_lava 0` (saved; Options, Newer features, "Lava sound"). Switched off while
  playing, it fades out like the other ambients rather than cutting off.
- The water and sky channels, their sounds and levels are unchanged.

## Code

- `src/newer/sound/s_lava.js`: `s_lava`, `R_LavaLevelsFill`, `S_LavaAmbient` (the channel's sound
  each frame), registered with the mixer through `S_SetLavaAmbient` (`snd_dma.js`).
- `src/newer/sound/s_synth.js`: WAV making (`SYNTH_Wav`), the lava loop (`SYNTH_Lava`), and the table
  of made sounds the sound cache asks when a file is missing (`SYNTH_Sound`).

## Checks

`tests/lava_ambient_test.js`, with the shareware pack's real e1m7 and the real sound system: e1m7's
lava levels are filled (full by the lava, fading, silent far off; water and sky untouched; never
filled twice; a map without lava untouched); the made sound is mono, 11025 Hz, 16-bit, four seconds,
loops from its start without a click, is audible and never clips, and is the same every time;
standing by the lava the channel plays it faded in to the leaf's level, away from it silence; New
Game and `s_lava 0` keep the channel silent with water and sky as before; a restart of the same map
fills its levels again; in New Game the made sound is not offered for a missing file; a game's own
`lava1.wav` is played instead of the made one. Not yet heard: the sound in a browser.
