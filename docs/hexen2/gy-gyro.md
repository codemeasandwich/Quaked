# GY — controller gyro aiming

Working candidate in `/Users/bri/worktrees/Quaked/hexen2-unified/gy`, based on
`1c188cbfd331294290f27d3bf0233f0a663c57a3`. Owner authority: 20 October 2026 GY brief,
engine-wide browser and packaged Mac support; leave changes uncommitted, no release.

## Implementation plan and independent planning

Use one platform angular-velocity pipeline (degrees/second), called with the exact
pad selected by `IN_GamepadPoll`. Keep right-stick aiming additive, existing pitch
limits and phone orientation aiming intact. Calibrate slow stationary bias, bound
sample/frame ages and discard inactive input. Sources: WebHID and native Apple
GameController through the already-present objc2 binding, without SDL or a bundled
library. A shared Gyro controls page reached from both Options pages avoids clipping
six additional rows beyond the 200-pixel menu height. Settings are archived cvars.

Independent planning review: preserve player ownership from pad_share, fail closed
on ambiguous identical controllers, avoid treating GCController playerIndex as a
browser index, do not integrate stale backlog after menus/focus changes. Public
checks must cover synthetic reports, view angles, pairing and both menus; native
and physical checks have separate evidence boundaries.

## Coordination ledger

Bluey `agent_whoami` failed with `storage_error` on 20 October 2026, correlation
`e3c1c8b8f5d64a3ba29967b994f11f99`, mutation outcome unknown. No card lookup,
assignment, progress mutation or durable execution is claimed. Responsible owner:
GY implementation agent now; integration orchestrator on handoff. Next action:
reconcile this record to the existing GY card when Bluey storage is available.

Implementation, verification, limitations and owner trial steps follow below as the
candidate is tested. This document is a working record, not acceptance or release.

## Behaviour and source contracts

The platform path is shared by every game. `IN_GamepadPoll` keeps selecting the
same stick controller (including `PadShare_Frame` remote snapshots), then applies
motion only when a gameplay command exists, the window is visible/focused, and
neither demo playback, the bestiary nor the weapon wheel owns the input. XR releases
ordinary pads. A newly selected/resumed pad drains one frame. Rates older than
100 ms are ignored; per-frame integration is capped at 50 ms to bound stall jumps.
Right-stick turning remains available with gyro enabled, disabled or absent. Phone
`deviceorientation` tilt and its existing maths are untouched.

Canonical rates are degrees/second in a right-handed controller frame, X pitch,
Y yaw, Z roll. Local-space mapping is `view yaw += (Y + Z) / sqrt(2) * dt * sensitivity`
and `view pitch -= X * dt * sensitivity` (the invert switch reverses pitch).
Pitch remains within -70..80 degrees and actual gyro pitch stops pitch drift.
This fixed 45-degree yaw/roll blend needs no gravity/attitude estimator. Physical
axis feel and signs still require the owner trial below.

Sony reports use nominal 1/16 degree/second per count, corrected by factory
bias/scale where valid. Switch Pro uses LSM6DS3's nominal 0.070 degree/second per
count, or the factory IMU SPI block at 0x6020 (`936 / (scale - origin)`). Its raw axes are permuted to canonical `pitch=-rawY, yaw=rawZ, roll=-rawX`
(SDL Switch driver:2218–2228). It averages all three IMU frames in a full 0x30 report. SPI reads never write controller flash.
Subcommands are serialised and acknowledged with a one-second timeout. Sony
feature reports enable full Bluetooth input and obtain calibration. Unknown,
truncated, short-mode and malformed reports are rejected. Invalid factory trims
use nominal scaling; unusually large residual bias then remains a hardware-trial
limitation. The shared filter learns residual bias only after one second within
0.6 degrees/second of its current bias, with a two-second exponential response and
an 0.08 degree/second noise threshold. Very slow constant motion within that band
can be absorbed as bias; no gyro-only estimator can distinguish it from drift.

Native sampling links Apple's system GameController framework through the existing
maintained `objc2` 0.6 dependency, already used by pointer lock. No dependency or
lockfile changes, SDL, native engine or bundled controller library are introduced.
The small handwritten ABI declaration follows the installed SDK's GCRotationRate
(three doubles), and objc2 handles structure-return differences between arm64 and
x86_64. All framework reads stay on the main thread at approximately 60 Hz; a
background timer schedules at most one pending read, so a stalled UI cannot queue
an unlimited sensor backlog. Manual sensors sleep while the app is unfocused.
Native radians/second become degrees/second before Tauri's `controller-gyro` event.
The desktop adapter timestamps arrival locally and removes missing/disconnected
sources; gyro listener failure is logged without preventing game startup.

Browser permissions are requested only from the Connect row's original mouse/key
user gesture. Granted devices are restored with `navigator.hid.getDevices` on
later input starts. Each handle serialises opens, setup and closes across shutdown
and reconnect; cancellation epochs also invalidate late permission grants. One
failed/stale grant does not prevent a later healthy device from restoring. Safari
shows a disabled/unavailable connection row and the Chrome/Edge capability note;
the Mac app instead says that native connection is automatic.

Pairing uses the selected pad's identity, with model/VID/PID matching only when
unambiguous. Two indistinguishable models remain motionless until exactly one
physical controller and its corresponding browser pad both report a right-stick
click. That correlates the source to the existing `index|id` pad key; enumeration
order and GCController `playerIndex` are never treated as browser pad identities.
A shared-window input poll passes the same full effective population that its
stick assignment used, retaining ambiguity checks when only a remote snapshot is
available. Browser HID handles themselves are per page: grant/open the sensor in
each player window that needs it. Native app events broadcast to its web views.

Archived settings:

| Cvar | Default | Meaning |
| --- | --- | --- |
| `gyro_enable` | 1 | Add gyro fine aim |
| `gyro_sensitivity` | 1 | Angle multiplier; Options range 0.1–10 |
| `gyro_invert_y` | 0 | Reverse gyro pitch |
| `gyro_hold` | 0 | Require the chosen standard Gamepad button |
| `gyro_button` | 10 | Hold button index; default left-stick click |

Both Options pages link to the same six-row Gyro controls page. Hexen's Options
retains its original first-page positions and offers visible, touchable More/Top
controls for its final row. This avoids adding six clipped rows to either menu.

## Reference provenance

Parser layout/calibration references checked 20 October 2026 (small idiomatic JS
translations only, no imported driver):

- [SDL DualSense layout and calibration](https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapi_ps5.c), fields 78–94, calibration 580–648.
- [SDL DualShock 4 layout and calibration](https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapi_ps4.c), fields 70–95, calibration 459–548.
- [SDL Switch Pro IMU calibration](https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapi_switch.c), calibration 1016–1088.
- [Nintendo IMU reports](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/imu_sensor_notes.md), report byte offsets, three samples and LSM6DS3 scaling.
- Installed Apple SDK: `GameController.framework/Headers/GCController.h` and
  `GCMotion.h`; system framework APIs, no controller hardware observed.

## Owner trial (required before acceptance)

1. Integration owner reviews this uncommitted candidate, runs the staged app build
   and distribution hook once in the integration worktree, then supplies that Mac
   app and the browser build. Neither packaging, landing nor release is claimed here.
2. Pair one DualSense, DualShock 4 or Switch Pro in macOS Bluetooth settings, or
   plug it in via USB. Open the new Mac app normally from its shelf, start Quake,
   press a pad button so its sticks are visible, then return to the game. Rest the
   controller for about 5 seconds. Native gyro requires no browser permission.
3. Keep the right stick centred and tilt/turn the controller gently: it should
   provide fine pitch/yaw aim. Turn with the right stick while moving the controller:
   both should contribute. Check rest drift, up/down direction and pitch limits.
4. Options → Gyro controls: switch aiming off (sticks must still turn), back on,
   change sensitivity and invert, then enable Only while held. Default hold is the
   left-stick click; select another button and confirm motion stops on release.
5. Repeat in Hexen II base and Portal. On Hexen's Options use More (or Down) to
   reveal Gyro controls; Top returns to the first rows. Escape and an outside tap
   from Gyro controls return to the correct game's Options.
6. In Chrome/Edge at a secure localhost/HTTPS origin, use a real mouse click or
   keyboard Enter on Connect controller gyro, then grant the matching physical
   controller. Gamepad-generated synthetic key events cannot grant browser user
   activation. Repeat USB and Bluetooth for each of the three supported models.
   Reload and confirm the previously granted device reconnects without a new prompt.
7. In Safari confirm Connect is unavailable with the Chrome/Edge note. In the Mac
   app confirm the automatic-native note and actual aiming even though WKWebView
   has no WebHID.
8. Open menus/console, start a demo, unfocus the window, disconnect/reconnect and
   return to play. Motion must not move a menu/demo camera or replay as a jump.
9. For two identical controllers in local play, let sticks establish the existing
   player assignments first. In gameplay click/hold each pad's right stick one at
   a time until its gyro pairs; verify motion affects only the player whose sticks
   belong to that controller. Repeat with shared snapshots and player windows.
10. On a phone, confirm existing tilt and touch aiming still work. Report controller
    model, USB/Bluetooth, macOS/browser version, drift and axis feel to the integration
    owner. No physical controller, phone or packaged runtime trial was performed by
    this agent; owner acceptance is pending.

## Review and regression record

Independent planning, public-interface testing and code review were performed by
one separate agent. Its retained `gyro_integration_test.js` checks the real input
poll and menu dispatch for both profiles. Its final source review found no remaining
concrete blocker in the reviewed shared filter, native ABI/threading, HID lifecycle,
pairing, desktop adapter and menu seams. This is code review, not a hardware trial.

Observed regressions and corrections (raw logs retained with verification):

- Switch B/right-stick byte confusion: 5/7 HID tests before correction; R3 comes
  from shared byte 3 bit 2, not face-button byte 2. The same run showed restoration
  stopping after a failed grant; attachment errors now remain per device.
- Remote PadShare population: independent integration 8/9 before, 9/9 after using
  the full effective snapshot; the test also refuses ambiguous identical siblings.
- Cancelled open: a regression run with the specific serialisation guard removed
  was 8/9; successful device close independently failed 9/10 before correction.
  Opens, setup and closes now share one per-device promise chain.
- A late permission grant after shutdown failed 10/11 before the captured-epoch fix.
- Initial Options row-count expectation failed after adding Gyro controls; updated
  visible-row expectations retain every existing label and action. Hexen's enhanced
  row test now navigates past all three appended rows. The skin test removes only
  the asserted new GYROCONTROLS glyphs and retains the old complete command-stream
  hashes for all existing Quake drawing, rather than replacing the golden hashes.
- A cosmetic import move briefly put the menu import inside its header comment;
  inspection caught it and executable import placement was restored before the
  final qualification runs. No native output or hardware acceptance depended on it.

- Distinct-axis Switch regression: 11/12 before correction of the permutation, then
  final HID suite verifies all three canonical axes independently.

## Handoff state

Implementation is left uncommitted for the integration orchestrator. Final input
and menu checks are 120/120 (26 new gyro JavaScript checks); both native targets
compile. Hexen has 248 registered passes plus one denied-listener suite error;
the engine list has 211/212 plus one denied-listener suite error. Native tests are
5 passed/7 failed; the same seven denied-listener failures occur on base (3/10).
Exact commands, failures, source hashes and changed files are in
[gy-verification.md](gy-verification.md). No remaining concrete review finding is
open in this candidate. Responsible next owner: integration orchestrator for the
normal hook and Bluey reconciliation; product owner for the documented physical
controller/phone trial and acceptance. Hardware verification remains zero. No
landing, packaging qualification, owner acceptance or release is claimed.
