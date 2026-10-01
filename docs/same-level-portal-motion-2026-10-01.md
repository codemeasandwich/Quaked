# Same-level camera portal motion — 2026-10-01

## Problem and implementation

Newer Game's same-level teleporter preview already uses a rigid transform from
the visible source surface to its receiver. The server continued to use the
stock QuakeC `teleport_touch`: one fixed receiver origin, one fixed receiver yaw,
and a 300-unit forward launch. A later server hook halves that launch. An
oblique approach therefore lost its lateral position, relative look direction
and momentum when crossing the otherwise continuous camera window.

The existing call chain is `SV_Physics_Client` / `SV_PushEntity` →
`SV_LinkEdict(..., true)` → `SV_TouchLinks` → the trigger's QuakeC touch function.
`SV_TouchLinks` now routes that same touch through `SV_RunTriggerTouch`; the
small `sv_portal.js` helper reuses the existing portal matrix. No independent
portal coordinate system or alternate teleport authorization was introduced.

The runtime trigger brush is matched using its retained hull bounds and target,
plus the receiver's verified position. Stock `InitTrigger` calls `setmodel`,
then clears both `modelindex` and the visible `model` string. This was checked
against shipped QC bytecode: statements 31–34 call `setmodel`; statements
37–38 clear `modelindex` and 39–40 clear `model`. Matching either cleared field
alone would silently leave actual hub portals on native teleport behavior.
The renderer's portal records retain the trigger bounds and target from its
BSP entity/model linkage. Runtime bounds must match those source bounds
(within one unit), so moved or unrelated triggers are left to QC. Named
brushes retained by other progs must match both their name and physical bounds.
The focused fixtures model the stock post-spawn state with both fields zero,
retained mins/maxs, and a receiver already raised by its spawn function.

The helper applies only to a player in single-player Newer Game, with camera
portals enabled and actually active in the renderer, touching a `trigger_teleport` whose runtime brush and receiver
match an existing rendered same-level portal. Classic Game, disabled portals,
multiplayer, XR/envmap views with portals disabled, monsters, change-level exits and unmapped triggers retain their
QuakeC behavior.

## Crossing and authority

1. Bounding-box overlap alone no longer moves the player through a mapped
   camera portal. The player's hull origin must reach its visible plane. Some
   stock windows have solid backing that stops the complete player hull just
   outside that plane. These allow the touch at actual backing contact, checked
   with `SV_Move`: the collision must face the portal, lie within the normal
   hull radius of its plane, and leave at most 1/16 unit of travel. This is two
   BSP clipping epsilons. Collision remains enabled; the helper neither moves
   through the wall nor generally authorizes nearby touches. The
   incoming face is selected using movement direction and retained until
   crossing; backing out cancels that approach.
2. Position, momentum and view angles are captured before QC.
   Position includes the lateral offset and any movement already beyond the
   threshold. The velocity is rotated, with no translation or speed change.
3. The actual transformed exit is checked with the player's full hull against
   world and BSP geometry. Monsters are excluded from this preliminary check
   because QuakeC remains responsible for telefragging. A blocked exit falls
   back to the original QC destination and launch.
4. The receiver origin is temporarily set to that exit for this synchronous
   QC touch. Consequently, QC's placement, fog and telefrag logic all use the
   same lateral exit. The receiver is restored in `finally`, including on a
   QC error; QC's `self` and `other` context is restored there as well.
5. The transformed momentum and angles are committed only if QC changed
   `teleport_time`, it is in the future, and the player actually arrived at
   that receiver. A refusal or mod redirect remains authoritative. The normal
   client `fixangle` mechanism publishes the corrected view. Its packet writer
   serializes `ent.v.angles`, so those temporarily carry the full transformed
   view pitch rather than the model's normal `-viewPitch / 3` tilt.
   `SV_ClientThink` restores the normal model pose after the correction packet.
   Marking this
   teleport's launch as already handled prevents the legacy softener from
   halving the retained momentum on the next physics tick. QC's cooldown stays
   intact.

Backing geometry can clip normal velocity before the physics caller performs
its final trigger link. `SV_Physics_Client` therefore captures momentum
immediately before `SV_WalkMove`, after gravity and stuck checks, and keeps it
eligible only during that call. At confirmed backing contact, the helper can
restore a clipped-to-zero incoming normal component from that snapshot.
Current tangential and vertical floor-clipped components are retained. The
snapshot is cleared in `finally` on all returns/errors, and a same-time forced
touch after physics cannot reuse it. No previous-frame speed is guessed.
The scope storage is a pure leaf module, `sv_portalmotion.js`, with no renderer
or server imports; physics passes its existing server time to that module.
Importing the renderer-dependent portal helper directly from physics changed
the browser's circular initialization order and was removed. Renderer test
bootstrap success alone does not qualify real `main.js` startup; the live
startup check is tracked separately.

The receiver's runtime origin is already 27 units above its BSP origin. This
was checked against the shipped `pak0.pak` `progs.dat`: the
`info_teleport_destination` spawn function adds `[0, 0, 27]` at statements
10351–10354 (vector constant at global 6700). `teleport_touch` uses that runtime
origin directly. The renderer's existing BSP-origin-plus-27 destination and
the server's post-spawn edict thus match without another vertical correction.

## Focused verification

The public dispatcher tests use production edict fields and production
`R_BuildPortals`, substituting only the QC callback and hull-clearance result.
They check real dispatch context and receiver restoration, rather than calling
the matrix helper alone.

The focused suite passed **20/20**:

- Ten new dispatch cases cover oblique camera angle, lateral exit and
  side-effect position, full momentum including vertical speed, next-tick
  launch preservation, plane threshold, opposite entry face after backing out,
  floor-portal rotation, classic/disabled/multiplayer/non-player exclusions,
  blocked geometry, QC refusal/mod redirect, exception restoration, and canceling
  a saved approach when renderer portal activation is disabled, and native
  fallback for an unmapped hidden trigger or runtime-moved receiver.
- The view-correction case calls the actual `SV_WriteClientdataToMessage`
  protocol writer, with distinct camera and compressed model pitch, and checks
  the emitted `svc_setangle` bytes against the transformed camera angles.
- Five existing portal-construction cases cover the renderer's matrix,
  source/back faces and unmapped materials.
- Three existing server physics cases cover gravity, native launch softening
  and wall friction.
- The existing deep BSP hull check passes.
- A shipped `maps/start.bsp` collision-hull test decodes the original clipnodes
  and planes and calls the actual `SV_Move` with the 32 × 32 × 56 player hull.
  All three front difficulty windows at Y=1384 are physically crossable.
  The accessible nightmare window at Y=1448 stops at Y=1456.03125, leaving
  its origin 8.03125 units short of the plane; confirmed backing contact is
  therefore necessary. Across all 13 source sweeps that start outside solid
  geometry, every blocked approach permits the touch only at contact, and
  none permits it from 48 units away. Reverse sides whose initial hull lies
  inside solid geometry are recorded separately and do not qualify as usable
  approaches. This focused test uses the shipped static world collision hull;
  live QC/actor traversal is a separate runtime acceptance check.
  All three difficulty openings also pass at ±4 units of lateral offset.
  At ±12, the native arch frame stops the player 24.03125 units before the
  visible plane, and the contact helper rejects that obstruction. A 48-unit
  opening leaves only about eight lateral units for a 32-unit player hull;
  seeing part of the window does not imply the whole body fits through it.
  A separate production `Mod_ForName` loader trial reproduced these same
  center, valid-offset and frame-blocked results. The backing-contact bound is
  preserved; the feature does not authorize walking through a solid frame.
- That same real-geometry case exercises `SV_Physics_Client` → `SV_WalkMove` →
  `SV_FlyMove` → final trigger link → the public dispatcher. It checks that
  normal speed was clipped to zero at the nightmare backing wall before the
  dispatcher, then restored and rotated without losing lateral momentum or
  view pitch. The QC callback and water-content query are simulated; collision
  and player movement use production functions. The fixture restores physics
  callbacks, state, client player, time step, gravity and QC globals after
  completion. Explicit-null callback restoration only affects the hooks needed
  by this isolated fixture; omitted hooks and nonnull host wiring are preserved.

Run with Deno and the repository's renderer import map:

```sh
deno test --allow-read --import-map=tests/render_imports.json \
  tests/sv_portal_motion_test.js tests/sv_portal_hull_test.js tests/gl_portal_test.js \
  tests/sv_phys_test.js tests/world_test.js
```

Deno was unavailable in the development environment. These same test modules
were executed with Node 24 using a compatibility `Deno.test` harness and the
real Three.js 0.183.0 module pinned by the repository import map. The QC callback
is simulated in these focused tests; this is not a claim that they execute the
shipped QC VM or qualify every custom map/mod, network mode or XR device.

## Live game acceptance

The normal `main.js` browser entry now initializes successfully without any
renderer pre-bootstrap workaround. `/tests/game_options_portal_trial.html`
starts the real Newer hub and uses the shipped `pak0.pak` QuakeC VM.
**71/71 runtime checks passed**. [Recorded results](evidence/portal-qc-browser-2026-10-01.json).

Six mirrored oblique approaches cross the actual difficulty-window openings at
±4-unit offsets. Their full-hull angled `SV_Move` sweeps finish with fraction 1;
the actual trigger dispatcher executes shipped QC, preserves the renderer's
mapped lateral positions and velocities, restores receivers, avoids the old
speed-halving hook, and publishes pitch/yaw through the real client-data writer.
The outgoing packet retains the existing 360/256-degree angle quantization.

The backed nightmare window is also exercised through the actual
`SV_Physics_Client` caller and shipped QC, including native gravity/floor and
backing collision. Incoming `[20,-200,0]` becomes `[-20,200,0]` and view pitch
13 is retained, rather than collapsing the normal speed at the source wall.
The test uses ordinary collision and never grants noclip. [Runtime screenshot](images/portal-qc-2026-10-01.png).

Earlier live test offsets of ±10 exceeded the physical opening's body clearance
and correctly hit the original arch frame. Those invalid approaches were not
relabeled as traversal successes: valid mirrored paths were tested separately,
and focused tests explicitly retain the blocked-frame invariant. The primary
difficulty proof is also saved separately: [67/67 checks](evidence/portal-qc-difficulty-2026-10-01.json).

These are focused local acceptance trials, not a claim about every mod, map,
multiplayer server or XR configuration. Owner play-feel acceptance remains pending.

## Try it

Hard-refresh, start Newer Game, leave Camera portals on, and approach a
same-level difficulty/episode portal at an angle from either lateral side.
Look through the window, cross the visible plane, and continue moving. The
view direction, side of the exit and momentum should agree with that preview.
Repeat with Classic Game or Camera portals off to see the original teleport
behavior. A receiver offset obstructed by solid geometry deliberately uses
the safe original placement rather than embedding the player in a wall.
