# Welcome flashlight and crosshair — 2026-10-04

The owner requests that a fresh enhanced game begins in the introductory welcome zone with both aids OFF. Entering Easy turns on the flashlight and crosshair; Normal/medium turns on only the flashlight; Hard turns on neither. This happens at the corridor entrance, before entering the portal.

| Boundary | Flashlight | Crosshair |
| --- | --- | --- |
| Fresh Newer START | OFF | OFF |
| Easy corridor entry | ON | ON |
| Normal corridor entry | ON | OFF |
| Hard corridor entry | OFF | OFF |

The existing hidden Nightmare choice retains Hard's OFF/OFF behavior. Manual changes remain available; the table describes automatic defaults, not a ban on manually changing either aid.

## Implementation and invariants

`src/newer/render/r_flashlightrun.js` owns both automatic aids through the existing per-run coordinator. `R_FlashlightNewRun` now resets them only for a successful fresh **Newer START**. It no longer derives flashlight state from difficulty for direct starts/restarts of other maps: those retain current choices. Classic START also keeps its existing preferences. The crosshair is not added to the general Newer feature startup batch; that would turn it on outside the requested entrance policy.

The existing local-player `trigger_multiple` floor-message hook in `world.js` chooses the aid pair at real corridor contact. It is more than 500 world units ahead of the late stock `trigger_setskill`/teleport area. Only the aids change there; the native difficulty selection, map geometry, movement, portal transition and message script remain unchanged. `R_FlashlightSkillSelected` shares the existing selected-choice deduplicator with the later native QuakeC skill-setting callback. Thus repeated floor touches and the later same-choice skill trigger cannot undo manual changes or consume another automatic choice.

Ordinary map context updates, seamless travel and respawn do not reset either aid. Save loading inside an entrance or late skill brush needed an additional boundary check: a resumed overlap is not a new entrance. After restored entities are linked without touching triggers, `Host_Loadgame_f` checks the living local player's restored bounds against the native START entrance/skill brushes. `R_FlashlightRunLoaded` seeds only the existing contact deduplicator; it writes neither aid cvar and does not consume the manual flashlight notification. The first resumed touch preserves the current choices. A load before the entrance remains eligible for a subsequent genuine corridor entry. No save format or geometry is changed.

Crosshair drawing continues through the normal `crosshair` cvar and native HUD glyph. Flashlight rendering and its once-per-run manual-off notice remain in their existing owners. There is no new stencil, input binding, shader, camera or trigger system.

## Verification

Independent planning identified the existing early trigger and the cold/resumed-contact boundary. Independent source review confirmed the fresh-only guard, aid matrix, registered-cvar handling, duplicate-choice protection, load timing/bounds and Classic isolation.

**44/44 related checks passed**, in two serial runs:

- [26 aid/startup/menu/demo checks](evidence/welcome-aids-final-compatibility-2026-10-04.txt), including five new independent native tests in `tests/welcome_aids_test.js`.
- [18 existing respawn/save compatibility checks](evidence/welcome-aids-respawn-compatibility-2026-10-04.txt).
- [Verified implementation, exercised tests and native/enhanced map hashes](evidence/welcome-aids-verified-source-2026-10-04.sha256).

The new tests use the actual public Newer menu, command buffer, loopback connection, native spawn/begin handlers and shipped enhanced `newer/maps.pak` START. They move the actual player through native collision dispatch. Observed entrance positions are Easy `[232,815,8]`, Normal `[544,815,8]`, Hard `[864,783,8]`; all are before the late skill and teleport brushes. Easy produces `[1,1]`, Normal `[1,0]`, Hard `[0,0]`, while native `skill` is still unchanged. Hard is also tested with both aids deliberately ON beforehand, proving that its contact actively selects OFF/OFF rather than merely retaining a previous dark start.

Actual repeated and late touches preserve manually altered aids. Actual save/load within both the Easy floor-message brush and late skill brush, including a simulated cold coordinator reset, preserves manual OFF/OFF and records only the occupied-choice marker. Every direct Episode 1 map, Classic START, native death/respawn, and a real E1M2/E1M3 travel roundtrip retain manually chosen values.

The existing direct-level flashlight tests were updated to the owner's new fresh-START-only contract. Their manual-off notification test now explicitly starts from ON rather than relying on the removed direct-level auto-ON behavior. The initial 15/16 receipt is preserved [here](evidence/welcome-aids-initial-focused-2026-10-04.txt). A native test fixture initially omitted `src_command` for save invocation, so the host correctly refused that call; the initial 4/5 receipt is preserved [here](evidence/welcome-aids-initial-native-test-2026-10-04.txt), followed by the passing genuine save/load witness.

## Native rendered trial

[Corridor trial](http://127.0.0.1:8015/tests/welcome_ramp_trial.html) uses one ordinary engine. Choose Easy, Normal or Hard, wait for the before-entrance status, then **Walk into corridor**. The inspection moves through actual `SV_PushEntity` collision/trigger dispatch and records controller state and position. It does not force either aid after signon. The existing ramp/audio checks remain available.

- [Easy before](evidence/welcome-aids-easy-before-2026-10-04.json) -> [Easy after](evidence/welcome-aids-easy-after-2026-10-04.json): OFF/OFF -> ON/ON; [actual frame](evidence/welcome-aids-easy-after-2026-10-04.jpg).
- [Normal before](evidence/welcome-aids-normal-before-2026-10-04.json) -> [Normal after](evidence/welcome-aids-normal-after-2026-10-04.json): OFF/OFF -> ON/OFF; [actual frame](evidence/welcome-aids-normal-after-2026-10-04.jpg).
- [Hard before](evidence/welcome-aids-hard-before-2026-10-04.json) -> [Hard after](evidence/welcome-aids-hard-after-2026-10-04.json): OFF/OFF -> OFF/OFF with the Hard choice recorded; [actual frame](evidence/welcome-aids-hard-after-2026-10-04.jpg).

The first old inspection startup raced the ordinary attract-demo command buffer and its later forced HDR setting masked an inactive run. That failed inspection is retained as `welcome-aids-initial-startup-race-2026-10-04.*`. The trial now waits two ordinary startup frames, explicitly disconnects before its fresh map command, checks genuine enhanced run/readiness state, and has no post-signon HDR override. This is a fixture correction; actual production menu/Host_Map activation is independently exercised by the native tests.

The ordinary game page was also started through its actual Single Player -> Newer Game keyboard menu. The fresh welcome view visibly has no crosshair or flashlight beam. [Ordinary fresh-start frame](evidence/welcome-aids-ordinary-fresh-start-2026-10-04.jpg).

Earlier startup, respawn, wall correction and owner artwork remain intact. This is implemented and locally verified, with visual acceptance still belonging to the owner. Changes are uncommitted. [Source/evidence record](evidence/welcome-aids-source-2026-10-04.json).
