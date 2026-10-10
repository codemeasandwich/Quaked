# Multiplayer menu: Local (split screen) and Online — card [MP1], 10 October 2026

## What the owner asked

> "so for now show the multiplayer but when you go into it. There will be local (split screen) and online. The online
> option will be faded out & Disabled from the menu"

When asked what Local should do, the owner chose to build split screen now (cards [37a]–[37c]). Until it lands, Local
opens a short screen saying it is being built. That screen starts no game and fakes nothing.

## What the player sees

- **Main menu → Multiplayer** now opens a choice screen (`m_mpchoice`, 24) instead of the online menu (`m_multiplayer`, 5).
  It shows the Quake plaque and the Multiplayer title, then two items:
  - **Local (split screen)** can be chosen. Enter, or a touch on the item, opens `m_splitscreen` (25).
    - At first that screen said split screen was being built.
    - It is now local play, with each other player in a window of their own: see `docs/local-play-2026-10-10.md`.
    - Esc returns to the choice.
  - **Online** is drawn faded and cannot be chosen. The cursor skips it with the arrow keys, Enter on it does nothing,
    and a touch on it does nothing.
- Esc on the choice screen returns to the main menu.
- The online screens themselves (`m_multiplayer`, setup, join and room list) are unchanged. Only the main menu's
  route to them is closed. They can still be opened:
  - by a join by link (`?room=`);
  - by a connection error (`M_ConnectionError` falls back to `m_multiplayer`);
  - by the console commands `menu_multiplayer`, `menu_setup`, `menu_lanconfig` and `menu_gameoptions`, or a key
    bound to one of them.

  This meets "disabled from the menu". Closing Online everywhere would also mean gating those commands, and that is
  the owner's call. Esc on the online screen still goes straight to the main menu, not to the new choice screen,
  because the choice screen is not how it is reached any more.

## How the fade is drawn

- **WebGL menu (the default).** `M_PrintFaded` calls `MainMenu_Text( x, y, text, 0, true )`. The new `disabled`
  argument is passed on to the donor renderer as the fourth glyph parameter. The donor (`quake-menu-final.html`) already
  draws that parameter with its own disabled material. The generator `tools/extract_menu_webgl.py` adds this with one
  `once()` substitution and records it in `docs/newer/menu-webgl/SOURCE.json`'s adaptations. `--check` verifies the
  generated module byte for byte.
- **Native 2D menu (fallback).** When the WebGL menu is not drawing, `M_PrintFaded` draws the alternate (brown/gold)
  characters through `Draw_WithAlpha( 0.4, … )`. That is a new `gl_draw.js` export, which sets the overlay's
  `globalAlpha` and restores it afterwards. The host passes it to the menu through `M_SetExternals`. If it is not
  wired, the menu draws at full opacity.

## Contracts kept

- The engine still never imports Newer code. `menu.js` reaches the WebGL menu only through the existing
  `MainMenu_Text` hook.
- The other menus' states and numbers are unchanged. The two new states are appended (24, 25).
- The test expectations for the main menu's Multiplayer item (`menu_webgl_test`, `main_menu_art_test`,
  `bestiary_book_test`) now expect `m_mpchoice`. This is the intended change.

## Checks

- `tests/mp_menu_test.js` (new) has two tests:
  - the key and click flow: Multiplayer → choice → Online cannot be chosen, reached by the cursor or clicked → Local
    (by key or click) → being-built screen → back → main menu;
  - the native fade: with the WebGL menu absent, Online is drawn through `Draw_WithAlpha( 0.4 )` and Local is not.
- `tests/menu_webgl_test.js` checks the supplied renderer: on the choice screen, exactly the letters of Online are
  disabled text commands.
- `tests/bestiary_book_test.js`'s main-menu click expectations now expect `m_mpchoice` for Multiplayer.
- A mutation check: with Online temporarily enabled, all three new tests fail.
- The existing menu suites still pass: menu, menu_webgl, main_menu_art, singleplayer_menu, level_select and menu_save.
- In the real page (served by `tools/serve.py`, driven by Playwright), the states went 24 → 25 → 24 with no page
  errors. The screenshots show "Online" faded below "LOCAL (SPLIT SCREEN)" and the being-built box drawn.

## What remains

- Split screen itself has landed, as local play across windows (`docs/local-play-2026-10-10.md`). Card [37c]'s
  controller-per-window step remains.
- Enabling Online is a later, separate decision for the owner. Set `enabled: true` on its `MPCHOICE_ITEMS` entry and
  route Enter to `M_Menu_MultiPlayer_f()`.
