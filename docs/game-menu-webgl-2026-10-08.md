# Supplied WebGL2 menu system

Card T-216d11cc ("[8] Main Quake menu"). Baseline Dev
`612a071f4d2c9351db438df802af6b154d57e6c8`. Owner requirement (8 Oct 2026): the
supplied menu is a **sharper, clearer, exact replica of the original**, replaces
every place the old menu drew static images, is an overlay on live gameplay,
adds **no background**, and matches the original's **exact positions and spacing**.

## Source and responsibility

* Renderer source: `quake-menu-final.html`, SHA-256
  `0c17c95648f1bcfa20fe2d882814ed11577d2f423cf7682a19535fb889d1f8ce`
  (kept local; not shipped). `tools/extract_menu_webgl.py` derives
  `src/menu_webgl_source.js` from it and `--check` verifies the result. Patches
  are explicit `once()` replacements, so a donor change fails loudly.
* `src/menu.js` is still the only owner of menu state, actions, input, Continue
  availability, saves and confirmations. There is no second navigation stack and
  no GPU hit map: the engine's own 20-unit row grid is the touch map.
* `src/menu_webgl.js` is the adapter. `menu.js`'s drawing helpers (`M_Print`,
  `M_PrintWhite`, `M_DrawCharacter`, `M_DrawTextBox`, `M_DrawSlider`,
  `M_DrawPic/TransPic/SubPic`) hand it their native coordinates; it builds one
  command list per frame and the single detached WebGL2 canvas renders it.
* `src/gl_draw.js`: `Draw_FullResolutionCanvas` copies the rendered canvas onto the
  2D overlay at physical resolution (identity transform, state restored);
  `Draw_FullResolutionImage` copies a source rectangle the same way (logo art and
  deferred pictures). Cached pictures now carry their `path` so the adapter can
  recognise stock graphics. The studio logo still draws afterwards.

## How exact placement is achieved

Positions come from the original artwork's own pixels wherever a sprite carries them.
A few constants are hand-measured against the stock art and named in the source:
`PLAQUE_LETTERS`, `PLAQUE_ID`, `SHEET_EM_FIT`, `SHEET_INSET`, `CELL_CAP*`,
`SELECTOR_HEIGHT`, `ROW_CORE_*`.

| Element | Source of position and size |
|---|---|
| Menu item sheets (`mainmenu_ext`, `sp_menu_ext`, `mp_menu`, `sp_menu`) | Opaque-pixel box of each 20-unit sheet row, read once per picture (`inkBox`); the horizontal extent comes from the row's core band so a swash from the row above (the stock G descender joining LOAD) cannot widen it. The supplied font is fitted to that box (`fitText`): left edge, width and vertical centre are the sprite's; letter height is the tightest row's times `SHEET_EM_FIT` (the donor capitals carry more swash than the sprites). `SHEET_INSET` removes the soft-edge overshoot. Labels are the sheet's real words (e.g. "Join a Game", not "Join Game"); Continue only exists in a live game. |
| Plaque titles | Real words (`TITLES`: MAIN, SINGLE, MULTIPLAYER, OPTIONS, LOAD, SAVE, ENHANCED, CUSTOMIZE) fitted to the darkest ink inside the plaque, clear of its rivets, drawn in the dark engraved style. |
| Engine text (`M_Print*`, labels, values, save slots, credits) | Per character on the **native 8-unit cell grid**: character *i* of a string sits in cell `x + 8*i`, uppercase, centred in its cell, condensed (never widened) to fit. Right-aligned labels, value columns and slot rows therefore land where the bitmap font put them. |
| Left QUAKE plaque | Panel plus five letters fitted to measured letter boxes (units of the 32×144 sprite); the `id` mark is blitted from the original pixels, unsmoothed. Drawn wherever the engine draws it. |
| Sliders | 12-cell bevelled track from the engine's call (`x-8`, 96 units) and a knob on the native cell for the current value. |
| Text boxes (Credits, Quit, Accept Changes) | Dark recessed "well" panel inset by the transparent margin measured from `box_tl`/`box_br`. |
| Selector | Donor rotating Q, centred on the `menudot` sprite cell with a fixed fraction of its height (the six rotation frames' ink centres differ by about a unit, which would otherwise rebuild the layout 10 times a second). |

Engine "white" text (`M_PrintWhite`) uses a dedicated donor kind 3 (stock white);
donor kinds 0–2 are untouched so the donor parity test stays meaningful.

Pictures with no replacement (for example the Credits weapon-model credit) are
queued and copied **after** the WebGL output, unsmoothed like the native raster, so
panels cannot cover them. The
colour-translated player portrait and its `bigbox` frame stay native for the same
reason. Sheets whose measurement fails (no readable canvas) fall back to the native
raster for that picture only.

## Lifetime, input and failure behaviour

External-frame mode: the donor owns no keyboard/pointer listeners, animation
scheduling or resize observer; the engine supplies physical size and time. One
renderer is cached between openings, hidden frames are discarded
(`MainMenu_SetVisible(false)` clears commands and blits), and it is destroyed on
engine shutdown (`Host_Shutdown`) or page exit. A pending font decode cannot
revive a destroyed renderer. Until the atlas is ready, and during context loss or
permanent failure, the established native menu stays visible and interactive;
failure is exposed in `MainMenu_Snapshot()` and the console and never traps the
player behind an incomplete menu. After a context restore the renderer rebuilds from
the host's commands (the donor's standalone layout is never shown over gameplay).
While the menu is closed the renderer's canvas is shrunk to 1×1 so no screen-sized
buffers are held through gameplay; opening restores it. `MainMenu_Frame()` is a read-only diagnostic of
the last frame's commands and blits.

## Font notice

The embedded font atlas is DpQuake (Dead Pete): "You may freely distribute this
font, but you must ALWAYS include this file!!". `docs/newer/menu-webgl/` holds
`FONT-NOTICE.txt`, the MIT `LICENSE`, `SOURCE.json` and `README.md`; the generated
`src/menu_webgl_source.js` header points there and **must ship with it**.

## Verification (what was actually run)

* **Real-browser captures** (`tests/menu_webgl_trial.html`, Chromium 1217 on the
  Metal GPU, live native E1M1 over the menu): 13 screens (main, single, load,
  save, level select, multiplayer, options, credits, quit, enhanced features,
  customize controls, player setup, join) captured with the supplied renderer and
  with it blocked (native raster) at DPR 1, plus DPR 2 for the new renderer.
  Measured row/edge positions agree with the original within a few pixels; the
  remaining differences are the supplied artwork itself (plaque colour, glyph
  swash, the rotating Q selector).
* `tests/menu_webgl_gpu_trial.html`: supplied renderer RGB within 1 level of the
  original HTML at 640×360, 1280×720 and 390×844; no generated background;
  opaque menu panels; the WebGL→2D copy is exact (colour 0, alpha 0 after
  premultiplication); context loss/restore and destroy-during-decode behave.
  (The copy check previously compared un-premultiplied against premultiplied
  RGB; it now compares premultiplied colour and alpha.)
* Node tests: `tests/menu_webgl_test.js` (routing exactly once per action,
  sheet placement against measured ink, the 8-unit grid, deferred pictures,
  WebGL-failure fallback, close/destroy), plus `menu_test`, `main_menu_art_test`,
  `singleplayer_menu_test`, `menu_save_test` and `studio_logo_test`.
  Run with `QUAKED_THREE_MODULE=<three.module.js> node tools/run_tests.mjs <files>`.

## Known limits

* Plaque material, glyph swash, and the rotating Q selector are the supplied
  design, not pixel copies of the old sprites; only geometry is matched.
* Screens not captured against the original: LAN config, game options, video,
  and Bestiarium (which keeps its own authored book page). They use the same
  helpers; a plaque with no known title keeps its native raster.
* Case-sensitive text (player name while editing, save names, the credits URL) is
  displayed in capitals because the fixed-grid glyph set is uppercase.
* **Owner decision needed:** the Enhanced-features screen previously drew a dark
  readability panel behind its ~20 rows (commit edb07c7). The skinned menu does not
  draw it, following "no background". If that screen is hard to read over a bright
  scene, restore it by drawing the panel as a `well` command in `M_Newer_Draw`.
* Copy submission time is not a GPU performance measurement.
* The full repository suite has pre-existing failures that need local archives
  (`QUAKED_OWNED_PAK`, weapon `.zip` fixtures) and rendering fixtures; they fail
  identically on the baseline commit and are unrelated to the menu.
