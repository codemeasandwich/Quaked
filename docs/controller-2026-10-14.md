# The controller, as the re-release has it

Item 14 of the add-on effects for every game (card T-3faa98e3; plan:
[addon-effects-integration-2026-10-13.md](addon-effects-integration-2026-10-13.md)): from Quake's
2021 re-release, a weapon wheel, button prompts and rumble. All three extend the existing controller
path (`src/platform/in_web.js`: one controller playing, its own keys released when it goes, menus,
local play across windows, XR); nothing else reads the controller.

## Weapon wheel (`joy_wheel`, "Pad: weapon wheel")

Redesigned to the owner's reference (14 October 2026, a GTA V style wheel). Hold the **left stick's button**:

- **The world blurs and slows.** The 3D picture is blurred (a CSS blur on the WebGL canvas only, so the status bar
  and the wheel, on the 2D overlay above it, stay sharp; `WHEEL_BLUR`, 9 px for a 1080-line picture) and, in single
  player, the game eases to a tenth of its speed over 0.15 s of real time (`WHEEL_SLOW`, `WHEEL_EASE`). The slowing
  goes through the host's own slow-motion rule (`_Host_FilterTime`, host.js, beside `host_timescale`), so it applies
  only with a local single-player server: in a network game, or local play across windows, the game keeps its speed.
  Letting go, a menu, death, intermission or any cancel restores both at once; a wheel no poll has looked after for
  a quarter of a second of real time and more than three frames closes itself, so the game can never stay slow or
  blurred (both, so a single long frame, a hitch or a slow machine, never closes a wheel that is still held).
  `Host_SlowMotion` (host.js) holds the rule. With the touch screen's weapon menu (`host_timescale` 0.12) open at
  the same time the two multiply. Rumble keeps its own timing in game time, so while the game is slowed a shake
  lasts longer in real time.
- **A ring of eight segments**, translucent grey with light lines between them, the axe at the top and on clockwise
  in impulse order. In each, the weapon drawn as **grey line art from its own 3D model**
  (`src/newer/ui/r_wheelicons.js`): the model the player holds (Newer's imported weapon art when it is ready, else
  the game's `v_*.mdl`, so an add-on's own weapons are drawn as they are), rendered side on with the muzzle to the
  right, then turned into three or four greys of light from above, a black outline and black lines where surfaces
  meet sharply or step in depth. The pictures are made once, in a small WebGL context of their own (never the
  game's), which is let go when the wheel closes; at most about 8 ms of picture-making a frame (one picture takes a
  few), so the first opening does not freeze, the rest showing their names for a frame or two. A weapon whose picture
  cannot be made (no WebGL, a lost context, a blank render) shows its name, and is tried again at the next opening.
- **Under each weapon, its ammunition over the most it can carry** (shells 100, nails 200, rockets 100, cells 100),
  e.g. `40 / 100` (just the count when an add-on lets the player carry more); nothing under the axe or a weapon not had. Usable weapons are bright, those without ammunition
  dim, those not had faint.
- **The chosen segment is blue** with a blue edge. The wheel opens on the weapon in hand; point the right stick at a
  segment (more than half way) and it becomes the chosen one, and stays chosen when the stick comes back to the
  middle. The middle shows the chosen weapon's name and its ammunition, above and below the crosshair.
- **Let go to take it** (`impulse 1..8`). Let go without having pointed, or on a weapon you cannot use, and nothing
  changes.

While the wheel is open the right stick points instead of turning the view; the left stick still moves you. It
closes, taking nothing, if a menu opens, at intermission, on death, when the controller goes away or another takes
over, when WebXR begins, while the bestiary has the controls, and if it is not looked after for a quarter of a second
(real time); a new map closes it too. Only a controller with the standard button layout opens it. The weapon list is
the touch screen's (`Touch_WeaponChoices`), so the two always agree; it has Quake's own eight weapons (the mission
packs' extra weapons are reached as before, with the weapon keys). The other buttons keep their meanings (X still
changes weapon with a tap).

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
stubbed: the wheel opens on the weapon in hand and letting go without pointing changes nothing; time eases to a
tenth in 0.15 s of real time and the world is blurred, both restored at once on letting go or when the wheel goes
unlooked-after; the slowing is applied only inside the host's single-player rule and never in New Game; the ring
paints eight segments with the chosen one blue, a picture for every weapon at its own shape, bright/dim/faint by
what can be used, the ammunition labels (`20 / 100`, `0 / 200`, `5 / 100`) and the middle's name and ammunition,
and names in place of missing pictures; the slowing rule (`Host_SlowMotion`) gives a tenth in single player only,
multiplies with `host_timescale`, and leaves network games alone; the blur lands on the world's canvas scaled to its
height and goes when Newer Game is turned off with the wheel open; one long frame does not close a held wheel or
lose its choice; ammunition beyond Quake's most is written as the count alone; the line art has a black outline,
greys by the light and a line where surfaces meet sharply, and a full-size picture takes well under 40 ms; the wheel opens on the left stick's button; up is the axe, up-right the shotgun, down the
super nailgun, left the rocket launcher; what can be used; letting go on the rocket launcher runs
`impulse 7`, on a weapon without ammunition or pointing nowhere nothing; the view does not turn
while the wheel is open and does when closed; rumble when hurt and not as the flash fades, never for
firing, not when the keyboard was last used; a disconnect, another controller taking over, a gap in looking
after it and the bestiary taking the controls close the wheel and take nothing; the player's hard
landing shakes the controller, another's or a soft one does not; a rocket beside the player shakes the controller;
a new map does not hold the next shake back; New Game, `joy_wheel 0` and a demo give no wheel, New
Game no rumble; the prompts in a menu after the controller, not after the keyboard, not in New Game
or in the game. `tests/gamepad_test.js`, `pad_assign_test.js` and `pad_window_test.js` pass unchanged.
Browser trial (14 October 2026, WebKit, the source build, the owner's Quake, e1m1 in Newer Game with every weapon
given, the Gamepad API stubbed): the wheel opened on the shotgun, the world blurred (`blur(7.5px)` at a 900-line
window) and the status bar stayed sharp; game time advanced 0.12 s in 1.2 s of real time with the wheel open (a
tenth); pointing down-right and letting go took the nailgun; closed, no blur. Screenshots were
checked by eye: all eight weapons drawn as line art from Newer's weapon art (the axe from its MDL). Newer Game's
first-level hold was released by the trial itself after 30 s, as headless WebKit never reports the level ready.
Not yet tried with a real controller.
