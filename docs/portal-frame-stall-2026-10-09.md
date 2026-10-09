# Camera teleporters: no stall when a sill or frame holds the player back

Card [14]. The owner reported waiting one to two seconds at a camera-surface teleporter before walking through.
The owner did not say which teleporter, so this is the cause found by walking into every one in the stock maps.

## Cause (found and reproduced)

A camera teleporter crosses the player with the same rigid transform its preview uses, so it waits until the
player's origin reaches the visible surface (or the player is pressed against the surface's own backing wall,
`SV_PortalBackingContact`). Until then `SV_BeginPortalTouch` returns `false`, and **neither** the camera crossing
**nor** QuakeC's teleport runs. When something in front of the surface holds the hull back, the origin can never
get there and the player stands still until they happen to slide into line.

* **The start hub's skill arches are the clearest case.** In `start.bsp` (and the Newer Game's copy) the floor
  inside each arch is a sill 32 units above the floor in front of it, far higher than a step, and the opening is
  48 units wide for a 32-unit hull. A walking player, centred or not, is stopped about 24 units from the surface
  and stalled indefinitely (80 of 80 frames in the test).
* Several E1M2 and E1M5 portals (diagonal ones, and ones with a frame to one side) stall for the same reason.

## Change

`SV_PortalObstructed` (`src/world.js`) says the hull overlaps the trigger and is held short of the threshold: a
sweep toward the surface advances no further than two BSP clipping epsilons, and neither the same sweep one step
higher (18 units, the walk move's step), nor the sweep nudged 2.5 units either way (the walk move slides a hull
past a chamfered frame) can advance. A hull that can still step, slide or walk forward is not obstructed and waits
as before.

`SV_BeginPortalTouch` (`src/sv_portal.js`) takes it as an optional fourth argument. For an obstructed player:

* the crossing is made from the origin **projected onto the threshold**, with the incoming speed restored as the
  existing backing-wall case does, so the view and velocity carry through (the player pops forward by the
  held-back distance, about 20 units);
* the receiver clearance still gates it. If the exit would be inside a wall the touch falls to stock QuakeC, which
  teleports at once, as in Classic, to the receiver centre with its own push and re-entry cooldown. Stock QuakeC
  also still decides disabled triggers, telefrags and redirects.

**At the hub arches the exit is always blocked**, because the camera transform keeps the player's height and the
player is standing 32 units below the sill the window looks onto. So walking into a hub arch ends the wait with the
stock teleport (view set by the map), not the seamless crossing. A seamless crossing there would need the player to
hop onto the sill, or a deliberate height mapping; that is a change for the owner to choose.

## What changed in practice

Measured with an independent walking probe (real gravity, a standing player, held forward at 200 and 320 units a
second, 15 lateral offsets, five approach angles) over the Newer and stock start maps and E1M1 to E1M8, 8,000+
scenarios, against the code before this change:

| Before | After | Scenarios |
|---|---|---|
| stall | native teleport | 4,585 |
| stall | camera crossing | 472 |
| stall | stall | 1,746 |
| camera crossing | camera crossing | 1,329 |
| camera crossing | native teleport | 18 |
| native teleport | native teleport | 355 |

* **The 18** crossed by camera one frame later before, after stepping up 14 to 18 units and sliding about 2 units
  sideways at once. Now the stock teleport fires from under the step: 8 are the extreme 16-unit edge of E1M2
  portals `*1` and `*3`, and 10 are E1M5 portals `*29` and `*28` at 8 to 10 units off centre. A sweep that tries the
  step and the slide together returns all 18 to the camera crossing but leaves 14 other E1M5 walk-ins (portals 5,
  7, 9 at +10 and others at -10) standing still, because a straight-on walk has no sideways velocity to do the
  slide; a stock teleport one frame early is the milder failure, so the simpler check is kept.
* **The 1,746 that still stall:** the reviewer inspected the stuck cases of an earlier build of this change and in
  every one the player was blocked outside the trigger (E1M4 `*85`, E1M1 `*20`, frames in E1M3 and E1M6, the start
  hub's `*19` from any angle); stock Quake would not teleport there either, so they are not teleporter stalls. I
  did not recount them after the last edit, and the 35-degree hub approaches are in this group.
* **No duplicate teleports:** an earlier build fired QuakeC twice in one frame at the start map's `*19` (198
  scenarios): the touch came from inside the walk move's step-down, which was then undone, and the final link
  teleported again. `SV_PortalMoveStepping` (`src/sv_portalmotion.js`, set by `SV_WalkMove` around its step
  attempt) now makes the obstruction test ignore those links, and the frame's final link decides.

## Checks

* `tests/sv_portal_walk_test.js` (the probe, trimmed, with real `SV_Physics_Client` and the shipped collision of
  `start.bsp`, `e1m2.bsp`, `e1m5.bsp`; it keeps simulating four frames after the first teleport): QuakeC runs
  exactly once in every scenario (it ran twice at start `*19`, offset -16, without the stepping flag); every hub
  arch at three offsets teleports within a few frames of meeting the sill (it stalled for 80 frames on the old
  code, which is the red run); ten E1M2 entries with a step or a frame to slide past keep the camera crossing; an
  E1M5 entry held 20 units short crosses by camera, its exit is exactly the transform of the origin projected onto
  the threshold (not of the raw origin) and its 200 units a second are carried through; the hub sill is
  obstructed at contact and not 8 units short.
* Mutation checks, each failing the test: no fallback (hub stalls); no step check and no nudge check (E1M2 loses the
  camera crossing); no projection; no velocity restoration; no stepping flag (double teleport). A sweep toward the
  surface that is not yet in contact is also rejected by the step and nudge sweeps, so that first check is belt and
  braces.
* `tests/sv_portal_hull_test.js` 1/1, `sv_portal_motion_test.js` 10/10, `gl_portal_test.js` 5/5,
  `flashlight_native_touch_test.js` 1/1, `flashlight_corridor_test.js` 3/3, `respawn_native_test.js` 17/17,
  `respawn_hazard_native_test.js` 6/6.

## Not checked

No browser capture. The stock teleport's view at the hub arches is whatever the map sets. A monster standing in the
opening is ignored by the sweep (as in the backing-wall check): the player then waits as before. A hull overlapping
a square-faced frame by 2.5 units or less counts as able to slide even when a straight walk cannot, so it keeps
waiting as before; none was found in a shipped map. E1M2's diagonal portals `*21` and `*22` call QuakeC a second
time within four frames of a camera crossing, in the old code too (37 scenarios): a separate problem, not changed.
