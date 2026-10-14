# The controller, as the re-release has it

Item 14 of the add-on effects for every game (card T-3faa98e3; plan:
[addon-effects-integration-2026-10-13.md](addon-effects-integration-2026-10-13.md)): from Quake's
2021 re-release, a weapon wheel, button prompts and rumble. All three extend the existing controller
path (`src/platform/in_web.js`: one controller playing, its own keys released when it goes, menus,
local play across windows, XR); nothing else reads the controller.

## Weapon wheel (`joy_wheel`, "Pad: weapon wheel")

Hold the **left stick's button** (unused until now) and the eight weapons spread round the middle of
the screen, the axe at the top and on clockwise in impulse order, each with the status bar's own
picture (the axe's name). Those you can use are bright, those without ammunition dim, those you do
not have faint. Point the right stick at one (more than half way) and let go of the button to take it
(`impulse 1..8`); the last one pointed at stays chosen when the stick comes back to the middle. Let
go without having pointed, or on one you cannot use, and nothing changes. While the wheel is open
the right stick points instead of turning the view; the left stick still moves you and the game does
not pause (so it works the same in multiplayer). It closes, taking nothing, if a menu opens, at
intermission, on death, when the controller goes away or another takes over, when WebXR begins,
while the bestiary has the controls, and if it is not looked after for a quarter of a second; a new
map closes it too. Only a controller with the standard button layout opens it. The weapon list is the touch
screen's (`Touch_WeaponChoices`), so the two always agree; it has Quake's own eight weapons (the
mission packs' extra weapons are reached as before, with the weapon keys). The other buttons keep
their meanings (X still changes weapon with a tap).

## Button prompts (`joy_prompts`, "Pad: button prompts")

In a menu, while the controller is what was last used (`key_lastsource`, `keys.js`), the foot of the
screen says what its buttons do there: (A) Select, (B) Back, (D-pad) Move. Touch the keyboard or the
mouse and they go.

## Rumble (`joy_rumble`, "Pad: rumble")

Through the browser's dual-rumble effect, the controller in use shakes when you are hurt (by how
much: the damage flash's rise), when an explosion's blast reaches you (as strongly as the screen
shake, so it follows `v_blastshake`: with the explosion shake off there is no blast rumble), and on a
hard landing (when the game's landing sound is heard). A new map or a loaded game forgets what was
shaking. A controller lent from another window in local play does not shake. It is never shaken for firing: the shotgun and the lightning gun are left exactly as
they are, and so are the other weapons. Short effects only when the shake rises, never one a frame;
a controller without rumble simply does not shake. Not while the keyboard or mouse was last used, and
not in demos.

All three are Newer Game only: in New Game the controller is exactly as before.

## Checks

`tests/controller_extras_test.js`, through the existing controller path with the Gamepad API
stubbed: the wheel opens on the left stick's button; up is the axe, up-right the shotgun, down the
super nailgun, left the rocket launcher; what can be used; letting go on the rocket launcher runs
`impulse 7`, on a weapon without ammunition or pointing nowhere nothing; the view does not turn
while the wheel is open and does when closed; rumble when hurt and not as the flash fades, never for
firing, not when the keyboard was last used; a disconnect, another controller taking over, a gap in looking
after it and the bestiary taking the controls close the wheel and take nothing; the player's hard
landing shakes the controller, another's or a soft one does not; a rocket beside the player shakes the controller;
a new map does not hold the next shake back; New Game, `joy_wheel 0` and a demo give no wheel, New
Game no rumble; the prompts in a menu after the controller, not after the keyboard, not in New Game
or in the game. `tests/gamepad_test.js`, `pad_assign_test.js` and `pad_window_test.js` pass unchanged.
Not yet tried with a real controller.
