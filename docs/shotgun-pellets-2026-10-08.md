# Shotgun pellets, underwater bubbles, and damage that arrives with them

Card T-cc141b2c, "[20] Shotgun fire: subtle visible pellets and underwater bubble trails". Baseline Dev
`5182679`. In single-player Newer Game every blast of the shotgun and the super shotgun, and of the
soldiers' shotguns, shows the supplied pellets flying at twice the supplied speed, and **the shot's damage,
blood and puffs arrive when its pellets do**, as a nail or a rocket landing. Under water the pellets leave
the supplied bubble wake. Classic Quake and everything else are as before. (The supplied muzzle-smoke wisps
are card [30b], which reuses this event path.)

## Owner direction that changed the first design (8 Oct 2026)

The first version only drew the pellets and left the game's hitscan damage instant, as the card said. The
owner then pointed out that a player looking at a soldier sees himself hit, and a fraction of a second later
the pellets that hit him arriving: the picture was behind the damage. Direction: double the pellets' speed,
and make the pellets the impact trigger, "the same as the nail gun and rockets". So:

* pellet speed is doubled (air 124, water 68 source units a second; the source has 62 and 34);
* the damage of each pellet that hit something waits for that pellet's flight (`src/sv_shotdelay.js`);
* there is no range cap any more (the source's 30 and 23 unit caps belong to a demo wall a few units away): a
  pellet flies all the way to where the game's ray stopped, because the damage now arrives with it.

This is a gameplay change, made on purpose and only where the pellets are drawn: single-player local Newer
Game. `sv_shotdelay 0` restores the instant hitscan; Classic Quake, demos, multiplayer and remote servers
never have the delay.

## Source

* Owner-supplied `arc-weapons-wall-canvas-shotgun.html`, SHA-256
  `8b1569225ae56f2e53a6f5748435e77699aa7e0f1c8c0082a12cfc3d0a401adf` (gitignored; local, never edited or
  distributed). Class `ShotgunEffect`; extraction map and line numbers (checked against the hashed file) in
  `newer/effects/shotgun/provenance.json`. No texture or asset is used: only code is taken.
* Only the pellet (kind 0) and bubble (kind 1) shader branches are drawn. The source's muzzle flash,
  impact flash, smoke and wall-burn kinds are not drawn here.

## How the picture gets the game's rays

The game decides everything: QuakeC's `FireBullets` makes one `traceline` per pellet with its own random
spread, then `TraceAttack` for each that hit something (damage, blood or puff). The stock `progs.dat`'s
`FireBullets` traces **only its pellets** (6 for the shotgun, 14 for the super shotgun, 4 for a soldier;
`tests/shotgun_native_test.js` pins those counts). The explosion of a barrel the pellets kill traces more
(`T_RadiusDamage`, `CanDamage`) inside the same weapon function, so only traces made by `FireBullets` itself
are kept (an independent review found this; a test shoots a real explobox).

1. `PF_traceline` (`pr_cmds.js`) reports each trace to `SV_FaceShotTrace` (`sv_faceevents.js`): a one-line,
   read-only call.
2. `sv_faceevents.js` already watches the local player's weapon functions for the HUD face, with its guard
   for a real, local, single-player Newer Game and its handling of the super shotgun's one-shell fallback. A
   shotgun token (`W_FireShotgun`, `W_FireSuperShotgun`) collects the pellet traces of its blast; a second token
   watches `army_fire` of a `monster_army`. Each blast gets an id when it starts. When the blast is confirmed
   (ammunition went down, as the face bridge already requires) one `rays` event is queued.
3. `sv_shotrays.js` turns the traces into the event: each ray's start and stop, and the distances along it that
   are in water or slime (sampled every 8 units to 760 and bisected to 0.5 unit, because a real ray can cross
   a surface).
4. `r_shotgun.js` drains the queue each frame (`SV_FaceDrain( 'rays' )`) and builds the pellets.

## Damage arrives with the pellets (`sv_shotdelay.js`)

When `FireBullets` calls `TraceAttack` during an observed blast, `sv_faceevents.js` hands the call to
`shotDelayCapture` and has the interpreter run `SUB_Null` instead (the mechanism the respawn sequence already
uses, `pr_exec.js`). The capture snapshots everything `TraceAttack` reads: its arguments, `trace_ent`,
`trace_endpos`, `trace_plane_normal`, `v_up`, `v_right` and `self`, and works out when that pellet arrives:
`shotgun_flight.js`'s flight time over the pellet's path (air and water segments, the pellet's own speed
variation from the blast id and its index), the same function the picture draws. At the start of every server
frame (`SV_Physics`, after `StartFrame`) `SV_ShotDelayRun` runs the pellets that have arrived: with the saved
globals restored it calls the real `TraceAttack`, between `ClearMultiDamage` and `ApplyMultiDamage` as
`FireBullets` does.

*One application per target.* A blast's pellets at one damageable target are applied together, once, when the
last of them has landed: stock Quake's one `ApplyMultiDamage` per target, so armour rounds once, a monster
rolls for pain once and the pain functions see the blast's total (a zombie ignores any single call under 9
damage). The cost is that the damage can land up to about 50 ms (at 1,000 units) after the first of those
pellets. Splitting a blast into per-frame calls was tried first and measured as far worse (a blast at 600
units split into two or more calls most of the time, which changes armour, pain and gibbing); the second
independent review found it. Pellets that hit the world are puffs and each lands at its own time. The game's
own QuakeC does the damage, blood and puffs, so armour, pain, kills and credit behave as they always did,
later. In a real run the health dropped in step with the pellets disappearing.

*Landing later* means the stock QuakeC evaluates things at the landing: a Quad or Pentagram running out or
being picked up while the pellets fly changes the damage; a pellet that finds its target already dead becomes a
puff; a kill can be counted just after an intermission begins.

*Safety.* Each pending pellet is stamped with its world (the entity array, the progs and the map name) and is
dropped, never landed, if any of them changed: a new map, a loaded game or a seamless level change cannot land
old pellets on whatever entity now has that index. Shooter and target are checked by their `freetime`, so an
entity freed in flight does nothing even if its slot was reused. Switching to Classic mid-flight does not drop
pellets: damage already paid for still lands. The delay is off with `sv_shotdelay 0` (or any value that is not
positive) and with `r_shotgunfx 0`, because no pellets are drawn to wait for.

What changes: when `TraceAttack` runs, and so the order of the random numbers it draws relative to the rest
(its `crandom` calls now follow the spread draws instead of interleaving with them). Unchanged: the rays and
spread of a blast, the ammunition, the cadence. What is lost: a pellet in flight when the game is saved,
saved is lost (a flight is at most about two seconds). Pellets hit what they traced, as hitscan did: a target
that moved away is still hit; one that was removed is skipped.

## What is drawn

* **Pellets.** One per native ray, a short, tapered, softly glowing streak (the supplied 16 ms shutter slice,
  at most 0.95 source units long) travelling from the muzzle to where the game's ray stopped at twice the
  supplied speed, each pellet's speed varied +/-7% by the supplied formula. The super shotgun's 14 alternate
  between its two barrels; its one-shell fallback is the single gun's blast from one barrel.
* **Wake and muzzle bubbles.** A pellet in water leaves the supplied wake, a bubble every 0.6-0.84 source
  units of flight, born where the pellet passed whatever the frame length; a blast fired from under water also
  lets four small bubbles escape each barrel. Bubbles detach, lose their forward drift and rise along world
  +Z, fading in over 35 ms and out over their last half second. A pellet in air leaves none.
* **Air to water.** Segment by segment along its ray a pellet flies at air speed through air and at water
  speed with drag through water. With one segment it is the source's pellet exactly.

### Adaptations from the source

1. **Scale.** One source unit is 24 Quake units (as the Fireball and the smoke trails use). A pellet is about
   0.7 unit across and at least 1.45 px wide.
2. **Direction, count, end point** come from the native rays, not the source's own spread.
3. **Muzzle.** The pellets leave the front of the viewmodel's own geometry (`viewModelMuzzles`: the forward-most
   4% of its vertices, split left and right for the super shotgun), in the scene's own coordinates (the mesh's
   matrix, not `matrixWorld`, which carries the XR scene scale), and only from a gun that was placed this frame:
   with the gun hidden (ring of shadows, chase camera, `r_drawviewmodel 0`) or not a shotgun, a point in front
   of the eye is used. A target closer than the muzzle's reach is shot from the game's own ray start so
   the pellet does not fly backwards. A soldier's pellets leave the point his own trace started from (about
   10 units in front of his chest): his model has no muzzle anchor.
4. **Cosmetic randomness** (speed factor, size, wake spacing) is the source's `sgRandom`, one stream per
   pellet derived from the blast id and the pellet's index, so the picture and the damage schedule give the
   same pellet the same speed. It never touches the game's random numbers.
5. **Shader.** The vertex and fragment statements of the two drawn kinds are the source's; the renderer's
   changes are listed in the test.
6. In first person the pellets fly almost along the line of sight, so most are small bright dots that spread
   away from the muzzle (a streak is foreshortened); they read as streaks near the gun and from the side.

## Bounds and cleanup

At most 256 pellets and 1,800 bubbles (the source's defaults), preallocated instance buffers (the per-frame path
allocates only small scratch such as the drained queue; a blast allocates its pellets once). Water along a ray
is sampled over the whole ray (found once per ray and kept for both the event and the schedule). Everything is a
function of `cl.time`, so pause freezes it, and the server's schedule is a function of `sv.time`. The pools and
layer are cleared on every map change (`R_NewMap`), by Classic, by `r_shotgunfx 0`, and when the clock jumps
back by more than a second. Pending pellets are dropped when their world changes (above), not by the picture's
own resets. The event queue is drained every frame even when the effect is off.

## Where it does not apply (stated, not guessed)

* **Demos, remote servers, multiplayer** (`SV_FaceLocalActive` is false): only the impact is known (`TE_GUNSHOT`),
  so no pellets are drawn and the damage is instant, as always.
* **Other players' and other monsters' guns.** Only the local player and `monster_army` (the only monster that
  shoots bullets) are observed.
* **Other levels seen through portals** have no running game logic.
* A blast fired from the water's surface is called "submerged" by where the game's ray starts (about 15 units
  above the feet), not at the drawn muzzle; a few muzzle bubbles may show just above the surface.

## Verification (what was run)

* `tests/shotgun_native_test.js` (17), on the real QuakeC and a real local server: the shotgun's six and the
  super shotgun's fourteen pellet rays (and the one-shell fallback as one blast of six); no event for dry fire,
  other weapons, demos, remote sockets, multiplayer or a reloaded world; identical random draws, ammunition and
  last trace with and without the observer (with the delay off); real water in `e1m3` located within 1.2 units
  and a blast under it reported submerged; a real soldier's four rays and no event for other monsters; a real
  explobox shot gives exactly six rays with the delay on and off; an end to end frame (14 pellets, once, the
  soldier's four, none in Classic); and the delay: a soldier does not hurt the player at the instant of the shot
  but does once the pellets have flown (and the same for the player's shotgun against a monster, after a real
  delay for 400 units), the damage is instant with `sv_shotdelay 0`, in Classic, in multiplayer and in demos, a
  a real map change with the clock ahead of the shot never lands old pellets in the new level, pellets
  already paid for still land after a switch to Classic, a blast at 200, 400 and 600 units is one application on
  its target that lands when the last pellet does (1 ms steps), an entity freed and reused in flight is skipped,
  and the server's wait equals the drawn pellet's flight; and armour sees one application of the blast's total.
* `tests/shotgun_test.js` (11): the random stream, pellet distance, trail length and time at a distance equal
  the source's own functions (the source class run in a sandbox) at the source's speed, in air and water, over
  1,500 comparisons, and the port's speeds are exactly double; a bubble's placement and a pellet's wake equal the
  source's, with a long step and 144 fps steps giving the same births; the shaders' statements are the source's;
  native rays become pellets along the muzzle-to-hit line to the hit (2,000 units is reached; a point-blank
  pellet does not fly backwards) with no game random draws; the super shotgun alternation and the one-shell
  fallback; water segments and bubbles; world-coordinate output, sorting, pause, expiry; bounds and clearing;
  bubble fading; the viewmodel muzzle on the real stock models, and in an XR-scaled scene; and that the
  server's wait is the drawn pellet's own flight time. With `QUAKED_FIREBALL_SOURCE_REQUIRED=1` the source tests
  fail rather than skip when the file is absent. Twenty-four deliberate mutations (drag, barrel alternation, wake
  in air, clock-jump clear, depth sort, ray recording, soldier token leak, water exit, bubble fading, no
  deferral, any trace a pellet, no grouping, no wait, cvar ignored, weapon deciding barrels, matrixWorld muzzle,
  speeds not doubled, and the second review's: no world stamp, no reuse identity, r_shotgunfx ignored, a reset
  that clears pellets, a group landing at one pellet's time) each make a test fail.
* Real browser (Chromium on Metal, `tests/shotgun_trial.html`): a real shotgun in `e1m1` (small bright dots
  leaving the muzzle and receding to the crosshair); a real super shotgun under water in `e1m3` (the rising
  bubble wake); a real fight against soldiers in `e1m2` logging health, pellets drawn and pellets pending each
  frame, with the health dropping as the pellets disappear; no page errors.
* Full suite: see the card for the final figures; the failing files are the same 15 (they need
  `QUAKED_OWNED_PAK` or weapon `.zip` fixtures not present here).

## Known limits and open items

* A soldier's pellets were verified by events, counts, positions, damage timing and an end-to-end frame, but a
  clear photograph of them was not obtained.
* The viewmodel muzzle is tested on the stock models; the replacement models of `newer/weapons` (which need the
  weapon archives, absent here) are covered by the browser photographs only.
* The pellets are subtle by the source's art direction, and small in first person (adaptation 6).
* In water a hit 2,000 units away takes about two seconds (drag), because there is no range cap.
* The picture's pellet flies from the muzzle to the hit and the server waits for the flight from the game's own
  ray start (the chest) to the hit: the drawn pellet is 10-25 units shorter, so it lands 3-8 ms before the
  damage (under a frame). A test pins that they agree exactly when the muzzle is the ray start.
* Wall-contact output of the source (`consumeWallContacts`) belongs to cards [30c] and [33].
* No frame-cost measurement of the layer was made (at most 2,056 instances).
