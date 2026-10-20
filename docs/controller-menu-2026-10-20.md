# Shared controller menus — 20 October 2026

Package CT, local working candidate on `5d63589a82c09142a64973ea591c5107709e75a5`, in
`/Users/bri/worktrees/Quaked/hexen2-unified/ct`. Changes remain uncommitted. This is implementation and synthetic
verification, not visual qualification, owner acceptance, integration, deployment or release.

## Purpose and architecture

Both games' Options pages retain their existing Controller row position (formerly “Gyro controls”). It opens the
existing shared `m_gyro` platform page, now titled Controller. Its first two rows open **Customise controller** and
**Test controller**. The six gyro controls retain their existing cvars, permission gestures and behaviour. The
Controller page remembers its calling Options state; each child returns there through Controller.

There is one implementation for Quake and every Hexen II edition, in Classic and Enhanced. `menu_actions.js` holds
the two existing keyboard Customize controls lists once, in their existing order. The keyboard pages and controller
editor both use `M_ControllerActions`; the active profile's `menuSkin` selects the list. No controller page imports
Newer or branches on a game family. Native `M_PrintPixels` uses the active game's charset and highlight bank.

The procedural geometry is ported from the owner's read-only `controller-source/dist/model.js`, supplied 20 October
2026. Shell loft, grips, component geometry and all named anchors are retained. Rest rotations are retained in
addition to the reference's rest positions so animation never accumulates a trigger/bumper offset. No bundled Three,
GLB, reference picture or game data was copied. The engine uses its existing Three 0.183.0 dependency.

`r_controller_preview.js` owns a small transparent WebGL renderer and canvas. The top-down orthographic camera has
an explicit up vector and fits the controller inside the centre of the available menu viewport. Rendering uses
physical pixels; native lettering and leaders share the overlay's UI scale. Two columns are sorted by top-view
anchor height, with non-overlapping two-line callout boxes; whole action names fit within their boxes. Short viewports also scale the
two native text rows vertically to the available row height. If WebGL
creation fails, the complete label/drop-down editor still works. Page transitions notify resource owners through
`M_OnStateChange`; close disposes geometries, materials, renderer and context (`forceContextLoss`). Losing menu input
also releases the preview on the next shared menu draw.

## Pad keys, fallback and persistence

The unused key range 153–169 holds the following names, in this order:

```text
PAD_A PAD_B PAD_X PAD_Y PAD_LB PAD_RB PAD_LT PAD_RT
PAD_BACK PAD_START PAD_LSTICK PAD_RSTICK PAD_UP PAD_DOWN PAD_LEFT PAD_RIGHT PAD_GUIDE
```

Guide is supported when a platform exposes standard button 16; operating systems may reserve it. Console/config
bindings use the ordinary key path, for example `bind PAD_X "+jump"`. `Key_WriteBindings` persists these through the
existing configuration writer. Leading `+` commands receive their ordinary `-` release commands. No parallel pad
configuration or storage format exists.

In game, a non-empty pad binding runs through its dedicated key. With no pad binding, the original key is sent:

| Standard input | Original game fallback | Fixed menu input |
| --- | --- | --- |
| A, LT | Space | Enter |
| B, Back, Start | Escape | Escape |
| X | `/` | `/` |
| Y | Tab | Tab |
| LB | Shift | Shift |
| RB | Ctrl | Ctrl |
| RT | Mouse 1 | Mouse 1 |
| D-pad | Corresponding arrow | Corresponding arrow |
| Left/right stick press, Guide | No key | No key |

The editor's **Default** clears the pad binding (`''`). The label resolves the *current* fallback key binding,
including a user-remapped Space or `/`, through the active action list. Escape always shows Menu because Escape is
special in the existing key path. Unknown/custom bindings show their actual command text. **None** stores `;`, an
ordinary harmless console separator, as a deliberate empty binding: the input layer sends no game event for that
value. It persists in config, while `unbind`, `unbindall` and Reset to defaults restore legacy fallback by clearing
pad bindings. Menu navigation always uses the original fixed menu keys regardless of game bindings or None.

A button retains the key it pressed until release, including destination changes. Existing holder counts keep a
shared fallback key held until its last pad button releases it; keyboard/mouse holders remain independent. Replacing
a held dedicated pad binding first releases the old command, then waits for physical release/repress before using
the replacement. Keeping the same binding does not release it; keyboard rebinding behaviour is unchanged.

The left stick stays Move and the right stick stays Look. Those fixed axis labels cannot open a drop-down. Their
presses are bindable, except left-stick press while the existing Newer weapon wheel (`R_NewerGame` and `joy_wheel`)
is enabled: the label is fixed Weapon wheel, the binding is suppressed, and the original wheel still sees button 10
raw. The raw gyro hold-button index and existing aiming gates are unchanged.

## Trying the pages

1. Start either game, open Options → Controller → Customise controller.
2. Use arrows/d-pad to move within columns and between the nearest left/right labels. Enter/A opens the selected
   label's action list. Up/Down scroll every action, Enter/A chooses, Escape/B dismisses. Escape/B again returns to
   Controller. Click/touch a label and then an action; the small up/down arrows scroll the list using touch alone.
   A click outside the drop-down dismisses it. Changes take effect immediately and use normal config persistence.
3. Select Default to use the current keyboard fallback, or None to suppress this input in game. Try a `+` action,
   including releasing it after opening a menu. Confirm console `bind PAD_X` and saved configuration.
4. Open Test controller. All pad menu commands are swallowed **before key dispatch**, including RT/Mouse 1; raw
   buttons/trigger values/axes still animate the model. Buttons depress and brighten, d-pad arms depress, sticks tilt
   and press, triggers rotate by pull amount. The controller name replaces the connection hint after the normal
   input poll discovers it. Xbox, PlayStation and Nintendo hardware names follow their physical button positions.
5. Move a gyro-equipped controller. The menu integrates bias-corrected pitch/yaw/roll rates, easing towards rest when
   still or no fresh motion is available. R or both stick presses re-centres. This display ignores aim enable/hold
   settings; it tests available motion itself. The player's view remains gated outside `key_game`.
6. Hold the button **labelled B** (Circle on PlayStation; bottom B position on Nintendo) for 1.5 seconds to leave.
   The top-right bar shows progress. Release cancels; disconnect/replacement resets the timer. Other pad inputs
   cannot leave or navigate. Keyboard Escape or any click leaves immediately. The consumed exit press remains
   suppressed until released, so it cannot also back out of Controller.

`IN_GamepadState` returns a frozen copy of the primary pad and the same complete effective pad population used by
the last `IN_GamepadPoll`, including remote local-play assignment. It never polls again. `Gyro_Rate` shares the
private selector with `Gyro_Move`, including stale/ambiguous/source-family/explicit-pair rules. It does not establish
pairings or consume the first aiming frame. Orphan explicit pairings are ignored in a local copy; aiming retains
its existing cleanup, enable/hold/sensitivity/invert gates and first-frame drain.

## Verification record and limits

`tests/controller_menu_test.js` (11 cases) covers pad key names and config round trips, binding/Default/None routing
in game and in menus, real `+jump`/`-jump` execution, the reserved weapon-wheel press, both games' Controller routes,
drop-down navigation to the last Hexen action, fallback labels, the reference model's anchors and control poses
returning to rest, a disjoint label layout at six aspect ratios, Test swallowing every pad menu key, the B hold, and
immediate Escape/click exits. RED first: 0/11 against base `5d63589a` source; the shared gyro selector and held-binding
release each had a failing regression before their fixes. Deliberately updated expectations: the Options row now reads
Controller (`options_order_test.js`, `hexen2_menu_skin_test.js`, which keeps both hashes for every other Quake row),
gyro touch rows moved down two places (`gyro_integration_test.js`), and the studio-logo VM fixture supplies the new
release dependency (`studio_logo_test.js`).

Integration review (orchestrator, 20 October 2026), after looking at the pages in Chrome for Quake and Hexen II over
their title demos with a scripted standard-mapping Switch Pro Controller and synthetic gyro samples:

- the Controller, Customise and Test pages draw over a strong veil (0.78) instead of the title demo's light split dim, so
  the labels and leaders read against any scene and the demo's Enhanced/Classic captions are not drawn there;
- callouts start below the two header lines and end above the two hint lines (they overlapped before);
- the controller name is its product name ("Pro Controller"), without the browser's "(STANDARD GAMEPAD ...)" suffix;
- a binding outside the action list shows without its `+` (e.g. "showscores");
- the B-hold progress bar sits above its hint, not in the top corner the Enhanced FPS counter uses;
- the chosen Controller row is drawn white, since Hexen II's font has no cursor glyph.

Checked in that browser trial: mapping X through the drop-down wrote `bind PAD_X "+jump"` (Quake) and
`bind PAD_X "impulse 12"` (Hexen II); on Test, pressed A/RB/D-pad up lit and sank, the sticks and RT moved, the gyro
turned the model, and holding B returned to the Controller page; no page errors. Suites: 415/415 across every
controller, gyro, gamepad, keys, menu, options, input, Hexen II, shelf and selection suite.

Owner trial, 21 October 2026: the packaged app showed the labels without the controller. WebKit (Safari, the Mac
app) copies the preview's detached WebGL canvas onto the overlay as blank unless the drawing buffer is kept. Measured
in Playwright's WebKit on the Customise page, the share of bright pixels where the model sits was 0.000 before
`preserveDrawingBuffer: true` and 0.733 after (Chrome: 0.725); Hexen II's Test page 0.725 in WebKit after the fix.

Not yet checked: a physical controller (button and axis mapping and gyro direction on the owner's Switch Pro
Controller in the packaged app), touch input on a phone, and the WebGL-unavailable list fallback in a real browser.

## Coordination and handoff

Bluey returned `storage_error` throughout; the project ledger (`docs/hexen2/unified-host.md`, entry CT) is the record
until it returns. Next: the owner's trial in the packaged app. Not a qualified delivery and not a release.

## Files

- `src/engine/client/keys.js`: dedicated named pad keys in the existing key/config system.
- `src/platform/in_web.js`: bind/fallback/None routing, immutable primary snapshot, test suppression, wheel reservation.
- `src/platform/gyro.js`: shared source selector and read-only corrected-rate accessor.
- `src/engine/client/menu_common.js`, `menu.js`: new states, routing, the veil, resource transition notification.
- `src/engine/client/menu_gyro.js`: Controller parent page, two new entry rows, existing gyro behaviour.
- `src/engine/client/menu_options.js`, `menu_hexen2_options.js`: Controller label and reuse of action lists.
- `src/engine/client/menu_actions.js`: existing action lists, profile/skin-selected shared accessor.
- `src/engine/client/menu_controller.js`: shared editor/test pages and interactions.
- `src/engine/client/menu_controller_layout.js`: pure callout layout and controller-family names.
- `src/engine/render/r_controller_model.js`: owner-supplied procedural geometry port.
- `src/engine/render/r_controller_preview.js`: isolated context, physical compositing, control poses and disposal.
