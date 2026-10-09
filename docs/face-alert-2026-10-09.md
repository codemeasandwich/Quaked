# The status-bar face turns toward an off-screen enemy that has just noticed you

Card [F1]. When an enemy that is not on screen becomes aware of the player and makes its noise, the face in the
status bar looks toward where it came from.

## Behaviour

* **The trigger is the game's own.** A monster that has just noticed the player runs `FoundTarget`, which always plays its
  sight sound (`SightSound`) and then starts the hunt. In the stock progs `FoundTarget` is called from three places:
  `FindTarget` (the monster sees or hears the player), `T_Damage` (the player hurt a monster that had a different
  enemy) and `monster_use` (a trigger or alarm wakes it). The server hook (`src/sv_faceevents.js`, `alertEnter`) watches
  `FoundTarget` and queues an `alert` event when the monster is a real monster (`FL_MONSTER`) whose enemy is the player.
  It changes nothing in the game. Every such notice is queued (the queue is bounded to 256).
* **Off screen only.** The client adapter (`R_FaceAlerts` in `src/r_facegame.js`) takes the angle from the player's view
  at that moment to the monster with the same function the damage glance uses (`faceImpactAngle`; yaw only) and ignores
  a monster within half the **live** horizontal field of view plus 5 degrees of it (`r_refdef.fov_x`, which widens on
  wide screens and with the Newer phone settings: 53 degrees at fov 90 on 16:9, about 70 at the phone's 120). The
  fixed 55 degrees (`FACE_ALERT_ONSCREEN`) is only the fallback when the field of view is not known.
* **The face.** `FaceState.alert` (`src/face_state.js`) turns the head the way a hit from that direction would. Everything
  past the screen edge is 45 degrees or more off the view, so it is a head turn left or right, or the centred pose for
  straight behind (as for damage; nothing visible happens for a sound exactly behind, though it still holds the
  second). It lasts one second and shows no pain. **One glance per half second**, applied after the on-screen filter, so
  a monster the player can see (the first to wake in a room) never hides one they cannot. A reaction to damage that is
  under way is never replaced, and damage that arrives after an alert takes over. A newer alert after the half second
  replaces an older one. A dead face does not glance.
* **Priority.** An alert takes the face's hit-reaction slot, so it also outranks the forward-attack pose: the head can
  turn away while the player is firing ([gloom-hood-face-2026-10-04.md](gloom-hood-face-2026-10-04.md) lists the order
  death, hit reaction (now including alerts), forward attack, idle).
* **Quiet rules.** None while the player is dead; none during the clockwise respawn sequence (its own alert runs the
  real `FoundTarget` over every monster in the level); none in Classic, in demos, in multiplayer, or on a remote server
  (the same local-single-player gate as the other face events).

## Checks

* `tests/face_alert_native_test.js` (8), real `progs.dat`, real connected local game and stock E1M1: `FoundTarget` for
  the player queues one event with the monster's position and the player's view; not for a monster that noticed another
  monster, not for a dead player; two monsters in one moment are both queued; the real death-and-respawn sequence runs
  the game's own `SV_RespawnAlert` over the level (23 monsters) and queues nothing, and a notice after it queues one;
  nothing in Classic, a demo or multiplayer; the face looks left and right, stays front for straight ahead and for
  straight behind, and uses the live field of view (limits at fov 90, 106 and 120, 3 degrees either side; 60 degrees is
  on screen at 120 and off at 90; junk values fall back to 55); a visible monster waking first does not hide the unseen
  one 0.1 s later; the event time is converted to the client's clock; a second glance within half a second is ignored;
  a glance shows no pain; damage overrides and is not overridden; junk angles are ignored and the dead face stays front.
* Mutation checks, each failing a named test: the fixed 55 degree limit, no half-second rule, the clock not converted,
  a dead face glancing, no respawn guard, the filter stopping at the first on-screen event. (Earlier versions also
  caught: an alert overriding damage, an alert showing pain, any monster instead of the player's enemy.)
* The existing face suites pass: `face_native_test` 8/8, `face_v44_native_test` 6/6, `face_water_entry_test` 2/2,
  `face_state_test` 10/10. Two independent reviews' findings are all addressed above.

## Not checked

No browser capture of the face animating. Pitch is ignored (a monster far below a player looking steeply down can be on
screen yet 90 degrees to the side by yaw). A monster the player shoots while it is asleep also queues an alert
(`T_Damage` calls `FoundTarget`); it is on screen in practice, so the filter drops it.
