# Hexen II playability increment — menus, animations and RPG mechanics

Status: **executed increment, not qualification.** This record covers the in-game pause menu, four-class selection,
first-person and enemy animation evidence, and the core RPG mechanics on the supplied Installed retail data. It does
not claim the full native menu art set, whole-hub cross-level trigger semantics, the full campaigns or owner acceptance.

## In-game pause menu

- `src/engine/client/hexen2_menu.js` adds the menu model and a DOM host: **Resume, Inventory, Character, Options,
  Save game, Load game, New game / change class, Quit to shelf**. Inventory/Character read the native HUD (health, mana, armour, rings, level,
  experience, class stats, artifact count, puzzle slots); Options adjust sound volume and mouse sensitivity; Escape
  closes a submenu to Main and a second Escape resumes.
- The page freezes simulation while the menu is open (`tick` returns), exits pointer lock, routes keys to the menu,
  and restores `key_game`/pointer lock on resume. The overlay is `.fixed`, above the canvas and HUD.
- Browser evidence (`tools/hexen2-browser/product-trial.mjs`) for all four classes: Escape opens `HEXEN II — PAUSED`,
  ArrowDown+Enter opens Inventory (`Health: …`), Character (`Class: …`) and Options (`Sound volume: …`), Save/Load
  round-trip through IndexedDB (`save quicksave (indexeddb)`, `load quicksave (indexeddb)`), and two Escapes resume;
  screenshots are `hexen2-product-<class>-menu.png`.
- Model tests: `tests/hexen2_menu_test.js` **3/3**.

## Save and load

- `src/engine/common/hexen2_save.js` defines the schema-2 **whole-hub** record: native player fields/vectors, level,
  class, skill, time, the client view and the visited hub's per-level player/world snapshots. Schema-1 player-only
  records remain readable; malformed/lookalike records are refused.
- The pause menu's Save/Load use `Hexen2_SaveStore`: IndexedDB with one transactional `put`, a localStorage fallback and
  an in-memory fallback; legacy Quake save keys are untouched. The record is refused when its schema/level/fields are
  invalid. Load restores the hub store and the saved client view, restores the named level's world when it is current, or
  reloads into that level through the transition path when it differs.
- Tests: `tests/hexen2_save_test.js` **3/3** (build/validate/apply, malformed/lookalike refusal, memory/localStorage
  round-trip/hub field). Browser: all four classes saved and loaded through IndexedDB with the hub count in
  `docs/evidence/hexen2-product-host.json` (`save quicksave (indexeddb, 1 levels)`).
- Whole-hub **level snapshots** now have a first implementation: `Hexen2_HubStore` keeps a normalized per-level
  snapshot, the page restores a visited level's snapshot on return, and a forward level restores only the player fields
  so the new map's own start wins. The `changelevel(level, spot)` builtin (#70) records the target and the page reloads
  with `?game=…&autostart=1&class=…&skill=…&map=…&spot=…`; the mount sets the native `startspot` and selects the matching
  `info_player_start`, and `restoreSnapshot` consumes the transition record.
- Per-level world snapshots now use the **existing Quake save text** (`ED_WriteGlobals`/`ED_Write` and their parsers):
  globals, light styles and every edict are captured and restored, including door/puzzle state. `Hexen2_CaptureWorld`
  and `Hexen2_RestoreWorld` are covered by `tests/hexen2_hub_test.js` 1/1 (a door's serialized state and player
  health round-trip). The save record now bundles every visited level's player/world snapshot; client-only
  presentation state (decals, shells, transient effects) and full campaign-route validation are still G2 work.

## Item movement and weapon bob

- Bonus items now use the native Hexen rule: only the **MDL flags** `EF_ROTATE` (8) spin, by
  `anglemod((origin.x + origin.y) * 0.8 + 108 * cl.time)`. Hexen's entity effect bit 8 is `EF_DIMLIGHT`, so it must not
  spin an item; the earlier Quake-shaped check was wrong.
- `cl.time` now advances from the server time each tick, so the item spin, effect animation and fire renderers see a
  moving clock.
- The first-person weapon keeps `V_CalcRefdef`'s shared Quake view bob, punch, roll and step smoothing instead of
  overwriting the origin; the page only lifts it clear of the Hexen bar.
- Tests: `tests/hexen2_native_ui_test.js` covers the rotation formula/bit separation; the browser host records changing
  viewmodel frames and visible entity frames.

## Sky

- The page now calls the **client** `R_NewMap(cl)` wrapper, which selects the map's `sky*` texture and clears the
  texture chains; the previous direct `gl_rmain` call skipped that setup.
- `tests/hexen2_render_test.js` asserts the supplied `demo1` selects its `sky001` texture through `R_NewMap`.

## Fire/effect reuse

- `src/engine/client/hexen2_effects_bridge.js` maps Hexen's `CE_*` explosion/acid/flame effect slots onto Quaked's existing
  `R_ParticleExplosion` / `R_BlobExplosion` / `R_FireballSpawn` / `R_SmokeTrail` renderers. It is an adapter, not a
  second effect implementation; a slot is bridged once per server time, acid uses the existing blob path, flame/firewall
  slots reuse the advanced Fireball and smoke/teleport trails reuse the advanced smoke trail.
- The server effect slot now retains its decoded `params` (including origin) so the adapter can place the shared effect.
- Tests: `tests/hexen2_effects_bridge_test.js` **2/2**; the page calls the bridge after each physics frame.

## Campaign route

- `hexen2_campaign_test.js` exercises a real two-map base route: mount `demo1`, read its `trigger_changelevel`
  (`map=demo2`, `target=demo1`), record the target through the gamecode `changelevel` builtin, mount `demo2` at that
  start spot, carry the player fields, then return to `demo1` and restore its saved world/player. This covers the
  transition, start-spot, hub-save and revisit mechanics together, not just each in isolation.
- The page reads the gamecode intermission hand-off through `Hexen2_IntermissionStatus` (running/nextmap/nextstartspot),
  draws a native pixel intermission screen, and on Enter calls the normal `changelevel` path. `hexen2_intermission_test.js`
  covers the helper; the finale/credits sequences and remaining maps are still G2.

## Native pixel menu

- The pause menu is drawn on Quaked's existing **320×200 overlay canvas** with the Hexen II small font and dark/Brass
  palette fills, not as DOM chrome. `src/engine/client/hexen2_pixel_menu.js` presents the shared model; the page
  redraws it every frame while paused so it remains visible over the frozen world.
- The DOM host remains only as the test/accessibility mirror; it is hidden in the game (`pixel: true`). Browser screenshots
  (`hexen2-product-<class>-menu.png`) now show the native pixel panel; all four classes still open it.
- The **start gate** is now the same pixel language: a 320×200 canvas with a 5×7 bitmap font, class rows, difficulty
  row and pointer/keyboard selection (`hexen2_pixel_gate_test.js` 1/1). Portal adds the Succubus row; base/demo keep
  four classes.
- This is the menu presentation, not a claim that every native menu art backdrop/page is reproduced.

## Door sounds

- A door's `sound()` entity is often at world origin; the page defers the local sound origin to the sounding edict's
  model/box centre. `hexen2_hub_test.js` now resolves a real `demo1` door's `mins`/`maxs` through
  `Hexen2_SoundOrigin` and requires a non-zero centre, alongside the existing C4 control.
- The browser host reports a running mixer; a fresh packaged door-sound receipt is still missing.

## RPC stats / +showinfo

- The native expanded bar is now driven by TAB (`+showinfo`): the bar height animates from 46 to 144 and back, drawing
  the lower class/stat block under the main HUD (`hexen2-product-<class>-stats.png`). It shows class, INT/WIS/DEX/STR,
  LVL/EXP, portrait, armour/rings/puzzle art and the class's two abilities when the gamecode's ability flags are set.
- The page animates `barHeight` and passes it to `Hexen2_StatusBarOps`, matching the native 320×200 slide-up.

## Character selection

- The native start gate still offers Paladin, Crusader, Necromancer and Assassin; the page receives the chosen class
  and spawns it through the gamecode's `newclass` path.
- The browser product host starts each class with the correct native `classNumber` 1–4 and native class maxima; the
  packaged app autostarted all four (previous increment). The menu's **New game / change class** returns to
  `?game=<id>`, which reopens the gate for a new run.
- Existing tests: `hexen2_profile_test.js`, `hexen2_class_stats_test.js`, `hexen2_coop_four_test.js`, plus the
  four-class product-host receipt.

## First-person weapon animation

- Holding attack advances the gamecode's native `weaponframe`; the page copies it to `cl.viewent.frame`, which the
  renderer draws each frame. `tests/hexen2_animation_test.js` observes a multi-frame attack sequence.
- The browser product host records the real viewmodel frames over an attack: **19–38 distinct viewmodel frames per
  class** in `hexen2-product-host.json` (`weaponFrames`).

## Enemy attack animation

- `tests/hexen2_animation_test.js` places a live level monster in front of the player; over 60 ticks its model frame
  advances through multiple values and its attack reaches the player (`player.v.health < 1000`).
- The browser product host records **100 distinct visible entity frames** per class (`entityFrames`), proving the page's
  client entity frames change while it runs; the renderer draws `ent.frame` on the alias mesh.

## RPG mechanics

- `tests/hexen2_rpg_test.js` **2/2**:
  - all four native armour pieces (`item_armor_{amulet,bracer,breastplate,helmet}`) are picked up and reach the HUD
    armour total;
  - an artifact (`art_torch`) increments `cnt_torch` and the inventory reader;
  - a weapon pickup (`wp_weapon2`) changes the native `items` bits;
  - a kill with experience just below the Paladin level-2 threshold awards experience, advances the level, and grows
    max health and max mana through `PlayerAdvanceLevel`.
- HUD/menu: the Inventory and Character panels expose health/mana/armour/rings/level/experience/stats.

## Receipts

- `tests/hexen2_menu_test.js` 3/3; `tests/hexen2_animation_test.js` 3/3; `tests/hexen2_rpg_test.js` 2/2;
  `tests/hexen2_save_test.js` 3/3; `tests/hexen2_effects_bridge_test.js` 2/2; `hexen2_render_test.js` sky assertion.
- `tools/hexen2-browser/product-trial.mjs` four classes: frames, movement, HUD pixels, weapon frames, entity frames,
  menu panels, Save/Load through IndexedDB, AudioContext running and mixer sources. Receipt: `docs/evidence/hexen2-product-host.json`.
- Browser Portal: `hexen2-product-portal.png` and the `succubus` entry in `hexen2-product-host.json` (class 5, HUD,
  animation, menu/Save/Load, running audio).
- Packaged Portal: `docs/evidence/hexen2-native-portal-2026-10-19.json` — catalogue `hexen2-portals:111`, Succubus class 5, Keep 347 entities, pixel menu open/close, 270 autoplay frames, zero frame errors. A packaged window capture is `docs/evidence/hexen2-native-portal-screen-2026-10-19.png`; packaged save/load is `docs/evidence/hexen2-native-portal-save-2026-10-19.json`.
- The full Hexen suite run is recorded in `docs/evidence/hexen2-suites-2026-10-19.json`: **142/142 assertions across 79 suites**, 0 failures/hangs.

## Not yet done

- A whole-hub save record containing every visited level, and client-only world decoration/effect state, are G2 and
  not claimed; per-level ED world snapshots and the forward/revisit transition path are implemented.
- Both the pause menu and the startup character/difficulty gate are native pixel canvases; no DOM chrome remains as
  the visible menu.
- Packaged WKWebView menu **open/close** and a packaged window capture are verified; a CGEvent click on the packaged window yields `audio=running` (`docs/evidence/hexen2-native-portal-audio-2026-10-19.json`). The host output-device path is recorded in `hexen2-physical-audio-2026-10-19.json`; packaged save/load is recorded in `hexen2-native-portal-save-2026-10-19.json`.
- Portal/Succubus **selection** is implemented: Portal offers the Succubus (native class 5), while base and demo offer
  four classes and refuse the Succubus; the Portal plan starts at `maps/keep1.bsp` (`hexen2_portal_test.js` 1/1).
  The Portal program and its RAPO (Raven version-50) alias models now load through the shared alias loader; `maps/keep1`
  mounts with the Succubus, 347 entities and its models. RAPO's per-corner `stindex` is now carried through the mesh
  strips (`mtriangle_t.stindex` + `gl_mesh`'s parallel ST index), not approximated by the vertex index.
- `hexen2_portal_maps_test.js` mounts every supplied Portal map (Keep, Tibet, Thomas, Monsters) with the Succubus.
- `hexen2_portal_test.js` traverses `keep1 → keep2 → keep3 → keep4 → keep5`, and
  `hexen2_portal_campaign_test.js` traverses `tibet1 → tibet3 → tibet4 → tibet5 → tibet8 → tibet9 → tibet10` through
  the real trigger/changelevel/start-spot paths, keeping the Succubus and spawning each map's entities. The Portal
  finale/intermission and fresh visual comparison remain G2.
- The start gate now derives its class buttons from the edition's profile, so only Portal shows the Succubus.
