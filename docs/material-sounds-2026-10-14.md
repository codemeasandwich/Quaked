# Surfaces that sound like themselves

Items 2 (surface-aware impacts) and 1 (footsteps) of the add-on effects for every game (card
T-3faa98e3; plan: [addon-effects-integration-2026-10-13.md](addon-effects-integration-2026-10-13.md)),
as Arcane Dimensions, Quoth and Abyss of Pandemonium have them. Both use one material table.

## The material table (`src/newer/sound/s_material.js`)

Quake's texture names say what a surface is. The 5,228 texture names the installed games' maps use
(19,790 uses; `node tools/audit_material_names.mjs` counts them again) were sorted by what their names
say, and in that order the first rule that fits wins:

| Material | Names (examples) | Share of uses |
|---|---|---|
| glass | window*, *glass*, {win* | 2% |
| ground | ground*, wgrnd*, *swamp*, grass, dirt, sand, snow | 2% |
| wood | wizwood*, wood*, crate*, bookshelf*, barrel | 5% |
| metal | metal*, met*, tech*, comp*, cop*, buttons, plats, slipgates, grates, pipes, trims, panels | 39% |
| stone | everything else: rock*, brick*, city*, wall*, egypt*, rune* ... | 49% |
| water | any liquid, by the world's contents where the sound is | 3% |

`S_MaterialAt` finds the surface at a point with the existing decal finder (`R_DecalSurface`), taking
only floors for footsteps and landings, and the world's contents for liquids (water and slime splash;
lava swallows the sound: none). A point whose own leaf does not list the surface it touches (on
e1m1, two of the sixteen walls round the start) is looked at again 3 units to each side, and the
nearest surface found is taken. Only the world is looked at: a door, lift or train sounds as the wall
or floor nearest it.

## The sounds (`src/newer/sound/s_surfacesounds.js`)

Stock Quake has no surface sounds, so the engine makes them (the owner's ruling of 13 Oct 2026:
generated sounds through the existing sound cache and mixer, a game's own file always winning).
Each is a short WAV made once and handed to the sound cache: per material, three impact sounds
(`quaked/hit_<material><1..3>.wav`: stone chips, metal pings, wood knocks, ground thuds, glass
tinks, water splashes) and four footsteps and four heavy footsteps (`quaked/step_…`, `quaked/steph_…`).
They are made only in Newer Game.

## Impacts (`src/newer/sound/s_impacts.js`, `s_impacts`, "Surface sounds")

When a game plays one of these sounds, a quiet second sound of the surface goes with it, never
instead of the game's sound and never changing it. It is started only once the game's sound is
playing on its channel, and only while more than four channels are free (`S_StartSoundIfFree`), so
the game's own next sounds always find a channel and none is ever cut off. Which of the surface's
three sounds plays is decided by where it happens, so the same strike sounds the same:

| The game's sound | Where the surface is | Beside it at |
|---|---|---|
| a nail's ricochet: `weapons/tink1.wav`, `weapons/ric1..3.wav` | where the nail struck | 0.45 |
| the axe on a wall: `player/axhit2.wav` | 64 units along the striker's aim, as the game's axe traces | 0.6 |
| a landing: `player/land.wav`, `player/land2.wav` | the floor under the one who landed | 0.35, 0.55 |

The shotgun and the lightning gun play none of these sounds, so they are untouched (`TE_GUNSHOT`'s
handling is pinned by `tests/addon_effects_guard_test.js`). The nails' own particles, holes, sounds
and random draws are unchanged. Off in New Game, in demos and with `s_impacts 0`.

## Checks

`tests/material_impacts_test.js`: the table on known names; every made sound short, mono, playing
once, audible, never clipped and different from the others; through the client's real nail parser
on e1m1's walls round the start, the game's own sound and random draws are the same with the
surface sound on or off, the surface's sound matches the wall's texture, and every one of those
metal walls is heard as metal, the two its leaf does not list included; landing on e1m1's floor and
the axe on a wall bring the surface's sound; a gunshot and the lightning gun bring none; New Game, a
demo and the switch off bring none; with all but two channels busy the surface sound waits and every
game sound plays on. `tests/nailhits_test.js` leaves the surface sound out of its comparison of the
nails' own sounds (this test covers it). Not yet heard in a browser.
