# DP: ordinary packaged shelf start regression

Scope: test the real `Desktop_Prepare()` in this worktree, based on `8426b4b9`, without changing product code.
The normative design is the orchestrator's newer `Dev/hexen2-unified/docs/hexen2/unified-host.md`, sections 3, 8
and the owner-trial-3 ledger. No commits, release, provider calls or owned game-data copies are authorised here.

The previous packaged smoke always supplied `trial_game`. That masked an undeclared `saveTrial` in the bundled
non-strict build, while an ordinary shelf URL fell through the catch and returned to the shelf. The declaration
already fixed in `8426b4b9` must remain necessary under this regression test.

The test registers `tests/helpers/desktop_tauri_loader.mjs` before dynamically importing `desktop.js`. It redirects
only the two Tauri bare specifiers and chains every other resolution to the existing Node/Three loader. Per-test
fixtures implement the native commands and converted-file fetches; actual catalogue range probes, strict selection,
PAK decoding, loose-file packing, mount ordering and `LAN_Init` run through their public interfaces. Browser globals
and the full hook table are restored in `finally`; no engine source is copied into a test or replaced by a stub.

The synthetic shareware PAK contains `progs.dat`, `maps/start.bsp` and `maps/e1m1.bsp`. The synthetic Hexen data1
layout contains two PAKs (palette and demo1), plus a loose version-6, CRC-38488 program with dummy bounded sections.
These are catalogue/startup fixtures, not playable maps or executable gamecode. The base Hexen catalogue checks the
program's presence; header identity is checked separately through `Hexen2_ReadProgHeaderSummary` (the catalogue's
header check applies to the demo edition). Trial and ordinary fixtures use distinct modification validators so
catalogue directory caching cannot replace the expected range reads.

Acceptance checks: ordinary shareware and Hexen starts return their game ID, parsed packs in mount order,
`autoStart: false` and `saveTrial: false`; neither the shelf hook nor URL replacement runs. They do not request trial
options. A Hexen trial overrides a shareware URL and retains its autoplay, class and save settings. Both ordinary
cases run before the trial, with no implicit `saveTrial` global available to mask the bug.

Independent planning review by `dp_review`: approved the public-interface approach; requested explicit absence of an
implicit global, both ranged and full-file reads, distinct cache validators, restoration of native callbacks and
a conflicting shelf URL in the trial. Those safeguards are implemented. Implementation review and test results follow.

Bluey: `agent_whoami` returned `storage_error`, correlation `ab4121b7c90e409594dbadee4c00ae2a`, mutation outcome
unknown. No task assignment/update or worker execution is claimed. This record retains DP's obligation while the
board is unavailable. Responsible implementation owner: this DP session; next integration owner: the orchestrator,
who must reconcile tracking, review the uncommitted diff, run the full integration hook and obtain packaged owner
acceptance. Those gates are separate from this Node regression proof.

`tools/distribution/engine-tests.mjs` now includes `desktop_prepare` immediately after `game_selection`. Independent
review found that otherwise the new filename would be outside both the maintained array and the existing Hexen/game
globs; this one-line wiring retains the regression in the existing integration gate.

Verification so far (20 October 2026):

- RED: removed only `, saveTrial=false` from the local declaration; ran the new suite in a fresh worker; exit 1,
  `RESULT 0/3 passed` / `TOTAL 0/3 passed`. Both ordinary cases hit the shelf with `saveTrial is not defined`.
  The trial case also fails in Node's strict ES module; the historical bundle permitted an implicit global.
  Raw output: [dp-red.txt](dp-red.txt). A `finally` restored the source byte-for-byte, and
  `git diff --exit-code -- src/platform/desktop.js` passed (also checked independently by the reviewer).
- GREEN: `QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/desktop_prepare_test.js`
  — exit 0, 3/3 passed. Raw output: [dp-green.txt](dp-green.txt).
- `QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/desktop_prepare_test.js tests/hexen2_selection_desktop_test.js tests/game_*_test.js`
  — reported 40/40 passed, no skips, but `game_catalogue` crashed before results on `listen EPERM 127.0.0.1`.
  Only 5 of 6 suites reported results; this batch is **not fully green**. The initial shell command tailed the log
  without preserving the runner's status; a repeat with explicit status preservation returned exit 1 with the same
  40/40 total and catalogue crash. Raw output:
  [dp-selection-game.txt](dp-selection-game.txt).

Independent implementation review by `dp_review`: no blocking finding in the test, loader or maintained-array
wiring; confirmed actual catalogue/PAK/LAN execution, strict flags, scoped stubs and restoration. The reviewer read
the RED/GREEN and selection/game receipts rather than inferring their results from a process exit, and independently
ran the GREEN command above: exit 0, 3/3 passed, no skips.

The reviewer caught the selection/game batch's pre-result catalogue crash on a full-log audit. Initial commentary
and tail-only review described 40/40 as green; that claim is corrected here and in the final report. Summary counts
alone omit suites which crash before registering/reporting tests, so both process status and suite-result inventory
must be checked.

Final broad checks (no skipped tests):

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_*_test.js
```

Exit 1, reported `TOTAL 224/224 passed`. 72 of 73 suites reported results. `tests/hexen2_catalogue_test.js` crashed
before registering/reporting tests because `listen` on `127.0.0.1` was refused with `EPERM`. The passing total does
not include that failed suite; this batch is **not fully green**. Raw output: [dp-hexen2.txt](dp-hexen2.txt).

The maintained engine array was copied into this command, including DP's new entry (the distribution wrapper and
full pre-commit hook were not run):

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/{game_catalogue,game_selection,desktop_prepare,game_shelf,local_play,net_window,window_play_native,serve_py,fog,skybox,options_order,blast_shake,newer_menu_scroll,addon_effects_guard,shambler_steps,hooks,drips,electric_native,electric_spatial,milkyway_sky,texture_q92_channels,in_web,in_web_capture,in_web_lifecycle,dof,footsteps,material_impacts,water_audio,native_sound_replacement,environment_sounds,player_events_audio,face_demo_water,face_water_entry,ambient_sounds,sound_channel_steal}_test.js
```

Exit 1, reported `TOTAL 211/212 passed`. 34 of 35 suites reported results. `tests/game_catalogue_test.js` crashed
before results on the same localhost `listen EPERM`. `tests/serve_py_test.js` reported 0/1: `the server started`
assertion failed because its local server could not start. This batch is **not fully green**. Raw output:
[dp-engine.txt](dp-engine.txt). Its included `desktop_prepare` result is 3/3.

Base reproduction:

```sh
git diff --exit-code 8426b4b9 -- src tests tools/run_tests.mjs tools/serve.py
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_catalogue_test.js tests/hexen2_catalogue_test.js tests/serve_py_test.js
```

The diff check passed: all tracked engine, existing tests, harness and server sources exercised here equal base
commit `8426b4b9`. The added desktop test/loader are not imported by these isolated test workers, and the modified
distribution suite list is not used by this direct command. The base run failed identically: both catalogue suites
crashed on `listen EPERM 127.0.0.1`, and serve_py reported 0/1 with the same startup assertion (overall exit 1).
Raw output: [dp-base-blockers.txt](dp-base-blockers.txt). These are retained sandbox limitations; no tests or gates
were weakened and no permission bypass was attempted. The orchestrator must rerun these three existing suites
outside this sandbox before claiming the broad checks pass.

`node --check` passed for the new test, loader and modified engine list. `git diff --check` passed. No dependencies
were installed (`node_modules/three/build/three.module.js` already existed). No authoring/skin-identity suite is
affected by this test-only change; no texture suites outside the required maintained engine list, full distribution
suite, build, packaged-app launch, commit, staging or release was performed.

Changed/added files:

- `tests/desktop_prepare_test.js`
- `tests/helpers/desktop_tauri_loader.mjs`
- `tools/distribution/engine-tests.mjs`
- `docs/hexen2/dp-desktop-prepare.md`
- `docs/hexen2/dp-red.txt`
- `docs/hexen2/dp-green.txt`
- `docs/hexen2/dp-selection-game.txt`
- `docs/hexen2/dp-hexen2.txt`
- `docs/hexen2/dp-engine.txt`
- `docs/hexen2/dp-base-blockers.txt`

DP's regression and maintained-gate wiring are implemented and independently reviewed. Changes remain uncommitted
for the orchestrator. Remaining gates: reconcile Bluey when its storage recovers, rerun the localhost-blocked suites,
integrate/review with the full hook in the integration worktree, and obtain ordinary shelf-start owner acceptance in
the actual packaged app. The Node test proves the adapter path; it does not establish native packaged acceptance.

## Integration (orchestrator, 20 October 2026)

Rerun outside the agent sandbox (local ports allowed) on the integration branch with DP applied:
`tests/desktop_prepare_test.js` 3/3; the maintained engine list (`tools/distribution/engine-tests.mjs`, now including
`desktop_prepare`) 220/220; `tests/game_*_test.js`, `hexen2_selection_desktop` and `hexen2_catalogue` 49/49. The
`listen EPERM` failures recorded above were the sandbox only.
