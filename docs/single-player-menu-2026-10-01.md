# Single-player menu lettering

## Problem and fix

The custom `spmenu.png` already contained miscropped letter fragments and inconsistent baselines in **Newer Game** and **Level Select**. The menu's positions and selection indices were correct: it draws at virtual `(72,32)` with five 20-pixel rows, and the cursor follows those same rows. Moving the entire sheet could not repair its individual letters.

The game now composes the extended sheet once from its original PAK menu sprites. `main.js`, after `Host_Init` and before starting the frame loop, calls `Draw_CacheSinglePlayerMenu` in `src/gl_draw.js`. That reuses `Draw_CachePic` and its palette-aware, transparent native canvases, then calls the leaf builder in `src/menu_art.js`. The result is cached under the existing `gfx/sp_menu_ext.lmp` key, so `M_SinglePlayer_Draw` and all selection handling remain unchanged.

The old PNG stays in the repository as a legacy asset, but startup no longer fetches it. Cached copies of that PNG cannot replace the newly composed menu. A hard refresh is still required to load changed JavaScript.

## Source lettering and layout contracts

| Label/letter | Native source | Source rectangle `(x,y,width,height)` | Placement |
| --- | --- | --- | --- |
| Original New Game / Load / Save | `gfx/sp_menu.lmp` | `(0,0,232,64)` | Shifted down one row, unchanged |
| Newer: intact New | `gfx/sp_menu.lmp` | `(0,0,66,16)` | `(0,0)` |
| Newer: e | `gfx/sp_menu.lmp`, final e in Game | `(129,2,16,13)` | `(68,3)` |
| Newer: r | `gfx/mainmenu.lmp`, final r in Player | `(200,2,20,13)` | `(86,3)` |
| Newer: intact Game | `gfx/sp_menu.lmp` | `(71,0,74,22)` | `(112,0)` |
| Level: capital L | `gfx/sp_menu.lmp`, Load | `(2,21,19,16)` | `(2,81)` |
| Level/Select: e | `gfx/sp_menu.lmp`, Game | `(129,2,16,13)` | Small-cap baseline y95 |
| Level: v | `gfx/sp_menu.lmp`, Save | `(32,43,19,14)`, masked as below | `(40,83)` |
| Level/Select: small l | `gfx/mainmenu.lmp`, Help | `(40,63,17,13)` | Small-cap baseline y95 |
| Select: capital S | `gfx/sp_menu.lmp`, Save | `(2,41,18,16)` | `(106,81)` |
| Select: c | `gfx/netmen4.lmp`, TCP/IP | `(16,6,14,12)` | `(181,84)` |
| Select: t | `gfx/mp_menu.lmp`, Setup | `(40,43,18,16)` | `(197,83)` |

Save's V is kerned into A. A rectangular crop carries A's lower right flank into the new word. The builder copies only source columns at or to the right of `[32,32,33,34,35,35,36,37,37,38,39,39,40,41]` for source rows 43–56, ending at column 50. This removes borrowed A pixels without synthesizing or rescaling V. The original V/T tips and G descender are retained; individual ink boxes are not vertically centred.

The added e/r in Newer share the native small-cap baseline y15. The Level Select small capitals share y95, with C's shorter native shape placed one pixel lower and V/T keeping their authored descending tips. The resulting canvas remains **232×100**, with no resampling and no changes to source canvases. Newer's G extends into otherwise empty space above the next word's small capitals; it does not overwrite painted pixels in the original rows.

Missing source artwork returns null without allocating the sheet. The existing single-player menu still supplies its original New Game/Load/Save picture and text fallbacks for the added options. This builder is measured for the shipped Quake artwork; it does not claim support for arbitrary replacement fonts in mods.

## Verification

- **4/4 focused tests passed**, including independent review's run. Public menu tests cover the sheet and cursor positions, five-row wrap, enhanced/classic game commands, Load, Save and Level Select. Builder checks cover native dimensions, no resampling, crop bounds, matching Newer small-cap baselines, unmodified borrowed canvases and missing-source fallback. [Test output](evidence/single-player-menu-tests-2026-10-01.txt).
- **3,121 browser checks passed**, with zero failures. These compare every one of the **2,481 original painted pixels** against the native source, compare added e/r/c shapes and positions pixel-for-pixel, verify caching, and ensure a known borrowed A fragment is absent. [Browser evidence](evidence/single-player-menu-browser-2026-10-01.json).
- The actual game menu was inspected at its normal scaled draw size, and the fifth row was selected in the running game. The corrected label opens the level selector. [Before](images/single-player-menu-before-2026-10-01.png), [after](images/single-player-menu-after-2026-10-01.png), [fifth-row cursor](images/single-player-menu-level-row-2026-10-01.png), [opened level selector](images/single-player-menu-level-select-2026-10-01.png).
- No browser warnings or errors were recorded in the trial. Its controls stop input propagation so their clicks do not also trigger the game's normal document-level mouse handlers.

The Deno interface was run through the existing Node compatibility harness with real Three.js 0.183.0 because Deno is unavailable locally. Normal reproduction:

```sh
deno test --allow-read --import-map=tests/render_imports.json \
  tests/singleplayer_menu_test.js tests/menu_test.js tests/menu_save_test.js
```

## Try it

Hard-refresh the game and open **Single Player**. Inspect Newer Game at the top and Level Select at the bottom; the cursor still advances in the same five rows. For visible pixel checks and selection controls, serve the repository and open `/tests/singleplayer_menu_trial.html`.

This is a locally verified increment with its implementation and evidence retained together. Owner visual acceptance and additional device/font-mod qualification remain pending; no unattended work is represented as queued.
