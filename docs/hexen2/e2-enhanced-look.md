# E2: neutral Enhanced grading and HUD-sized view

20 October 2026. Implementation trial, uncommitted; integration and owner visual acceptance pending.

Authority: the owner's E2 brief, following rule 7 and the seams in the approved
`/Users/bri/worktrees/Quaked/Dev/hexen2-unified/docs/hexen2/unified-host.md`.
E1 source investigation: `/private/tmp/claude-501/-Users-bri-SOURCE-Quaked/787691d8-c4d2-45bf-a428-fa92315953de/scratchpad/logs/E1.log`.
Worktree: `/Users/bri/worktrees/Quaked/hexen2-unified/e2`; base `592220adefad59eb6b4a6e3bf01e3bc000132999`.
No other checkout or game data was modified. No staging, commits, builds or release are authorised in this package.

## Behaviour and ownership

- `content_bindings.js` owns `launchDefaults`: Quake's frozen map is empty; every Hexen edition uses
  `r_newbright 1`, `r_newcontrast 1`, `r_newdark 1`. No lighting, DOF, bloom, filtering or performance feature is disabled.
- `Newer_ApplyGameDefaults(profile, enabled)` appends the binding commands only when enabled. Its Quake command
  string is unchanged byte for byte, including ordering and newlines; `hdr:false` still omits just the header.
  Classic emits only `r_hdr 0`, or nothing with `hdr:false`.
- `game_profile.js` owns the shared engine's frozen `screen.enhancedViewUnderHud` policy: true for Quake, false
  for Hexen base/demo/Portal. Only the existing full-height override in `SCR_CalcRefdef` reads it.
  Enhanced Hexen therefore retains Classic's rectangle above `sb_lines` and any touch inset. Intermissions and
  viewsize 120 still use their existing no-bar rules. No weapon position, pullback or separate FOV was added.

Configuration semantics are unchanged. `Host_Init` (`src/engine/server/host.js`) queues the game's startup script,
then saved configuration. Quake's explicit Newer menu launch/Options enable calls the defaults helper afterward;
Hexen's host startup and menus use the same helper. Like the existing gamma/feature baseline, Hexen's three
appearance values are therefore reset on an explicit Enhanced launch/enable, after prior saved choices.
Subsequent console commands, Options controls and configuration replay remain effective; no per-frame code resets
them. The three grading cvars keep their existing non-archived declarations; no new storage keys or persistence
scheme were introduced. Quake's launch helper still leaves all three alone.

## Viewport consumer audit

The shorter rectangle follows the existing Classic path through shared rendering:

| Consumer | Existing contract and E2 consequence |
| --- | --- |
| Camera and physical viewport | `gl_rmain.js` `R_SetupGL` uses refdef aspect and fixed vertical FOV. `R_ComputeViewport` converts its rectangle/scale to physical target dimensions and logical presentation coordinates, including the bottom margin. |
| HDR/volume/bloom targets | `R_RenderView` passes computed dimensions to `R_PostBegin`; `ensureTargets` in `r_post_targets.js` resizes all dependent targets. No full-screen assumption needs changing. |
| Dynamic resolution | `R_PostBegin` scales both dimensions; presentation retains the original logical rectangle above the HUD. Even-pixel rounding remains unchanged. |
| DOF | `R_PostComposite` sizes the DOF target and texel offsets from HDR width/height and scales the blur circle with that height. Public tests exercise full/short/scaled/full transitions. |
| Screen-space effects | Fireball, venom, motes and portal views derive dimensions from refdef and dynamic-resolution scale in `gl_rmain.js`; no additional mode branch is needed. |
| HUD and overlays | `SCR_UpdateScreen` draws the 2D HUD, menus and controller overlays afterward using full virtual screen dimensions; native HUD anchoring stays unchanged. Crosshair placement already uses the full screen in Classic as well and is unchanged here. |
| XR | The headset path bypasses the desktop viewport override and enabled HDR post-processing. Three.js owns eye viewports/projections; DOF has an existing XR-off gate. Audited in source and covered by the existing DOF gate tests; no headset trial was performed. |

## Verification and handoff

Independent planning and final diff review were requested from the read-only `e2_review` agent. The planning review
confirmed the bindings/profile ownership, configuration ordering and viewport consumer contracts. Review findings
and final verification results are recorded below when available.

Public regressions use `Newer_ApplyGameDefaults`, the actual command buffer/cvars, material shader callback,
`R_PostBegin`/`R_PostComposite`, public dynamic-resolution and DOF interfaces, and `SCR_UpdateScreen` with its existing
external callbacks. No private function export or source-text assertion was added. Screen cases include all three
Hexen editions, 4:3/wide/portrait sizes, viewsize 80/90/100/110/120, touch insets, mode switching and intermission.

Initial RED command (product files still at base):

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/newer_bindings_test.js tests/hexen2_enhanced_view_test.js
```

Result: 6/12 passed, six failed as intended: neutral grading missing for all three Hexen editions, and Enhanced
full-height viewport differing from Classic for all three. Log: `/tmp/e2-red.log`.
After implementation and correcting the test harness's missing `window.innerHeight` for touch scaling, the same
command passed 12/12 (`/tmp/e2-green.log`). The added composite tests passed 3/3 (`/tmp/e2-post.log`).

To try after integration, select Hexen II, its demo or Portal, launch Enhanced and compare the same map pose with
Classic: the held model should occupy the same HUD-sized rectangle, with the three grade controls at 1. Change
brightness/contrast/darkening through Options or the console and confirm the next frames retain the choice. Launch
Quake Enhanced to confirm its existing full-height presentation and appearance choices. The orchestrator owns
integration, maintained pre-commit/distribution checks and a browser/packaged visual trial; the owner owns visual
acceptance. This worktree has no new GPU screenshot, headset run, packaged build or release receipt.

## Coordination during the Bluey outage

Bluey `agent_whoami` and `agent_work_checkpoint` failed with `storage_error`, `mutationOutcome: unknown`,
`automaticRetry: false`; correlations `83e52de3beae40369d84f1901f08e78e` and `e3c7328857ad42118f3b5953297878ae`.
No identity/card read or update is confirmed. Independent reviewer saw the same failures (correlations
`0f874eaceda64aa2b41b8cecd6bb060e`, `84d134fa6b8e448784164957545b4968`). This record and the linked unified-host
ledger retain the obligation. E2 implementer owns local verification and review resolution; integration orchestrator
owns reconciling this evidence to the existing card when Bluey returns and presenting the integrated trial to the owner.
No durable background job or completed board state is claimed.

### Final results

Independent final review: **no material issues found**, no edits/builds/tests by the reviewer. Its configuration
precision note (grading cvars are non-archived) is reflected above.

Commands below ran from this worktree with:

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
```

1. Core RED/GREEN command above: RED **6/12**, GREEN **12/12**. The initial combined GREEN attempt was **9/12**
   because the screen test omitted `window.innerHeight`, preventing the existing touch-inset conversion; correcting
   that fixture produced the stated GREEN result. No product change was needed for the fixture error.
2. `node tools/run_tests.mjs tests/r_post_composite_test.js`: **3/3**, no skips (`/tmp/e2-post.log`).
3. Broad requested run:

   ```sh
   node tools/run_tests.mjs tests/hexen2_*_test.js tests/newer_*_test.js tests/dof_test.js tests/visual_options_test.js tests/*menu*_test.js tests/*options*_test.js tests/r_post_composite_test.js
   ```

   **311/312**, one failure, no skips (`/tmp/e2-required.log`). Shell globs intentionally covered every menu and
   options suite; overlapping globs repeated six suites. There were 98 invocations of 92 distinct suites, with
   **289/290** distinct checks. All **69 Hexen suites / 214 checks** and **7 Newer suites / 29 checks** passed.
4. Maintained engine list, copied from the `suites` array in `tools/distribution/engine-tests.mjs`:

   ```sh
   node tools/run_tests.mjs tests/{game_catalogue,game_selection,game_shelf,local_play,net_window,window_play_native,serve_py,fog,skybox,options_order,blast_shake,newer_menu_scroll,addon_effects_guard,shambler_steps,hooks,drips,electric_native,electric_spatial,milkyway_sky,texture_q92_channels,in_web,in_web_capture,in_web_lifecycle,dof,footsteps,material_impacts,water_audio,native_sound_replacement,environment_sounds,player_events_audio,face_demo_water,face_water_entry,ambient_sounds,sound_channel_steal}_test.js
   ```

   Runner aggregate **208/209**, one failed check, no skips, **plus `game_catalogue_test.js` aborted at module
   startup before a result count** (`/tmp/e2-engine.log`). The aggregate does not include that aborted suite's eight
   declared tests. Thus this run is not a passing engine gate. No optional owned-pak/LAN variables were supplied.
5. Base reproduction (all four changed product files temporarily replaced with `git show
   592220adefad59eb6b4a6e3bf01e3bc000132999:<path>`, then restored byte for byte in a Python `finally` block):

   ```sh
   node tools/run_tests.mjs tests/cheats_menu_test.js tests/serve_py_test.js
   node tools/run_tests.mjs tests/game_catalogue_test.js tests/cheats_menu_test.js tests/serve_py_test.js
   ```

   Both aggregate **1/3**; the second additionally reproduced the catalogue startup abort.
   Logs: `/tmp/e2-base-failures.log`, `/tmp/e2-base-failures-final.log`. No Git index, branch or ref was changed.
6. After restoring E2, final targeted command:

   ```sh
   node tools/run_tests.mjs tests/newer_bindings_test.js tests/hexen2_enhanced_view_test.js tests/r_post_composite_test.js
   ```

   **15/15**, no skips (`/tmp/e2-final-targeted.log`). Subsequent base reproduction restored identical bytes again.
7. `git diff --check`: passed. `node_modules` was present; no install was run.

Retained failures, all reproduced on the base commit:

- `cheats_menu_test.js`: “Enter on it opens Cheats: 8 != 23”. Its first test assumes that Up from the first Options
  row selects Cheats. Current `BASE_OPTIONS_ORDER` has another row after Cheats, so the assertion reaches Options
  instead. The second test passes. No E2 file changes that navigation.
- `serve_py_test.js`: “the server started” assertion fails. A diagnostic `python3 tools/serve.py 0` exits 1 with
  `PermissionError: [Errno 1] Operation not permitted` at socket bind. This sandbox cannot start its loopback server.
- `game_catalogue_test.js`: module startup aborts with `Error: listen EPERM: operation not permitted 127.0.0.1`.
  Its HTTP fixture is likewise blocked by local socket permissions; no test cases execute in that suite.

No `npm run test:distribution`, pre-commit hook, app build, texture authoring or skin-identity suite was run, as
instructed. E2 changes no source art, texture/skin identity, resource routing or manifests. No authoring-file suite
has a known changed expectation from E2; the orchestrator still owns the full maintained integration hook and any
required distribution/identity gates in its full checkout. The local engine list's `texture_q92_channels` uses
in-memory channel fixtures and passed 9/9; it is not an authoring/skin-identity trial.

Changed/added files:

- `src/engine/common/game_profile.js`
- `src/engine/render/gl_screen.js`
- `src/newer/content_bindings.js`
- `src/newer/ui/newer_defaults.js`
- `tests/newer_bindings_test.js`
- `tests/hexen2_enhanced_view_test.js` (new)
- `tests/r_post_composite_test.js`
- `docs/hexen2/unified-host.md` (worktree ledger link)
- `docs/hexen2/e2-enhanced-look.md` (new)

E2's requested code and public regressions are implemented and independently reviewed. Remaining owners/actions:
integration orchestrator reviews/lands the uncommitted diff, reruns the two socket-dependent suites where local
listening is permitted, resolves the existing Cheats navigation/test mismatch under the appropriate scope, runs
its integration hook, and supplies an integrated browser/packaged trial. Owner visual acceptance remains pending.
Bluey reconciliation remains with that orchestrator when service access returns. None of those gates is claimed
complete here; no release or durable follow-up worker was launched.
