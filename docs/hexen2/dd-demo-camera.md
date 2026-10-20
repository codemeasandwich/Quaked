# DD — native demo camera

20 October 2026. Worktree `/Users/bri/worktrees/Quaked/hexen2-unified/dd`, base
`9c0753c3e04e5d4a905d2ad19a13bf6cc6db0817`. Owner-authorised package DD, no commit, landing or release authority.
Normative design read from `/Users/bri/worktrees/Quaked/Dev/hexen2-unified/docs/hexen2/unified-host.md`.

## Coordination and implementation plan

Bluey `agent_whoami` failed with `storage_error`, correlation `ecb9eb6249ac40919c96b9262b984a72`;
`agent_work_checkpoint` also failed, correlation `79478aa52b6347b89f9272a4eb3ba004`. No card assignment/update is
claimed. This document retains the obligation: DD implementer owns the local fix and proof; the integrating
orchestrator owns independent integration/commit, full hook and owner trial, and board reconciliation when available.
No durable background execution has been requested or submitted.

Independent planning inspected the decoder, actual shared parser and pinned uHexen2 sources before implementation.
The smallest fix stays in the native decoder: preserve the unified protocol, shared client, renderer and Quake path.

1. Measure full installed demo1–3 at 60 Hz through `CL_PlayDemoFromData` → `CL_ReadFromServer` → shared parse/relink →
   `V_CalcRefdef`, reading `r_refdef.vieworg`, viewangles and entity origins.
2. Add hand-built native-message regressions through the real shared parser; retain their failures against the base.
3. Correct coordinate/angle pair ordering in emitted packets and stored baselines, implement native reference/build
   semantics, and expand persistent native clientdata into complete unified clientdata.
4. Recheck the installed streams, independently review the implementation and verify all required engine/demo suites.

## Source findings

The direct camera failure was packet field order: XYZ followed by angles was emitted where `CL_ParseDelta` expects
X/pitch, Y/yaw, Z/roll. This corrupts Y/Z even for a full native update. Stored baselines repeated the same ordering
mistake; the old synthetic baseline writer repeated it too and the existing assertions checked only X.

uHexen2 `engine/hexen2/cl_parse.c:713-718` defines native baseline pairs; `600-621` defines entity update pairs.
`475-518` resolves omitted fields from the committed reference and captures only the first received frame of a
sequence. `1525-1613` commits that build/removal list on sequence change. A previous displayed delta is not a
reference. `732-755,784-802` retains absent clientdata fields; the Quake parser resets absent fields, so the decoder
must expand them. Native demo header float32 little-endian angles already match `cl_demo.c:176-180` and are unchanged.

Initial public regressions: existing demo suite 6/10 passed, all four new cases failed. The owned camera suite
failed all three demos. The first harness run also exposed a harness-only disconnect assertion issue, corrected
by explicitly supplying the parser's documented Host_EndGame unwind callback; no product change was made for that.

## Qualified headless measurement

| Demo | 60 Hz frames | Before in bounds/non-solid | After | Before jumps >128 | After jumps >128 |
| --- | ---: | ---: | ---: | ---: | ---: |
| demo1 | 1815 | 110 / 1815 (6.060606%) | 1815 / 1815 (100%) | 100 | 1 confirmed native teleport |
| demo2 | 1576 | 0 / 1576 (0%) | 1576 / 1576 (100%) | 76 | 0 |
| demo3 | 4891 | 87 / 4891 (1.778777%) | 4891 / 4891 (100%) | 1137 | 0 |

The real BSP is loaded from the read-only owned paks. No game data is copied into the repository. Runtime logs
report sampled eye/angle/entity positions, aggregate contents/bounds counts and all large jumps. The final camera suite passes all three demos; independent review found no remaining DD blockers. Owner visual acceptance
and integration are separate gates and have not occurred here.


## Final implementation and review

Six defects are covered by seven retained new public regression cases: full packet ordering, native baseline
ordering, committed reference/build/removal semantics, persistent native clientdata, whole-entity omission and
visibility restoration, and native forced-link semantics. `U_CLEAR_ENT` also clears the baseline/reference before
sparse deltas. `lastEntities` retains the last received fields independently of the current visibility map; removing
an entity from visibility must not erase its native message origin. New level/serverinfo resets all decoder state.
Native coordinates are represented internally as signed shorts, matching `engine/h2shared/msg_io.c:346-348`.

`PE2_NOLERP` is one optional unified-protocol flag with no payload. The decoder sets it for native `U_NOLERP`, clear
or missed-update forced links, and reference-visible entities without a new fast update. The packet parser resets
it for each actual update, and the linker applies it only on the Hexen II profile. Entity state owns/copies the flag;
the live server writer emits exactly the same fields as before. The shared client and renderer are reused.
References: native `cl_parse.c:522-525,634-645`, `cl_main.c:561-577`; the native server marks step movement no-lerp at
`sv_main.c:939-940`. The unit test proves a 20-unit step snaps, the next ordinary movement interpolates, and a
missed-update/return snaps as native does.

Independent review found and drove corrections for no-lerp, whole-entity omissions and visibility restoration;
each was first demonstrated failing. It then reran the final public unit/camera suites: **16/16 passed**, and found
no remaining blockers in the reviewed DD scope. This is source/headless review, not owner visual acceptance.

The single demo1 discontinuity at time 84.346905 is a native teleport: installed `maps/cath.bsp` has
`trigger_teleport` model `*89`, target `t35`, destination origin `[-440,912,8]`. Canonical
`gamecode/hc/h2/triggers.hc:1077,1109-1117` adds 27 Z and moves the player to `[-440,912,35]`, exactly the recorded
server origin. The test derives connected destinations from the loaded map, accepts that exact endpoint within
1/8 unit and requires exactly one such jump for demo1 and none for demo2/3. All other jumps over 128 units per
60 Hz rendered frame fail. Maximum non-teleport distances in demo2/3 are 18.700 and 17.375 units.

The camera harness processes each entire stream through its final recorded disconnect. For every signed-on rendered
frame it checks the actual view against world bounds, the shared point hull and the renderer's BSP leaf (the two
contents queries must agree). Optional compressed traces retain every frame's eye, viewangles, height and origins
of entities 1–3. The owned streams are protocol 19; synthetic tests exercise both protocols 18 and 19.

## Exact verification commands and results

Run from this worktree, with the existing installed `node_modules` (no install/download was needed).

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/cl_hexen2_demo_test.js tests/hexen2_demo_camera_test.js
```

Independent final result: **16/16 passed** (13 decoder/client, 3 camera), log
`/tmp/dd-independent-final-tests.log`. A prior focused run with traces used the same command prefixed with
`QUAKED_DEMO_CAMERA_TRACE=/tmp/quaked-dd-green`; it exposed a fixture negotiation omission in the new CLEAR_ENT
case (15/16), then the corrected explicit feature negotiation passed 13/13. This was a test setup failure, not a
product-parser exemption. Earlier retained RED checkpoints were 6/10, 10/12 and 11/12, respectively, as each review
finding received its regression.

Final full Hexen/demo command, **292/292 passed**, no skipped/missing inputs:

```sh
QUAKED_DEMO_CAMERA_TRACE=/tmp/quaked-dd-final QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_*_test.js tests/unified_protocol_test.js tests/cl_hexen2_demo_test.js tests/cl_demo_test.js tests/cl_demo_commands_test.js tests/demo_*_test.js tests/classic_demo_isolation_test.js tests/face_demo_water_test.js tests/profiler_demo_mode_test.js tests/r_demosplit_resolution_test.js
```

Log `/tmp/dd-hexen-demo-final.log`. An earlier broad run before the last added CLEAR_ENT case passed 291/291.
The final per-frame traces are `/tmp/quaked-dd-final-demo{1,2,3}.json.gz`, about 78/63/215 KiB. Reproduce RED traces
with the base source and `QUAKED_DEMO_CAMERA_TRACE=/tmp/quaked-dd-red`.

Maintained engine array copied literally from `tools/distribution/engine-tests.mjs`, **211/212 passed**, one failure:

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_catalogue_test.js tests/game_selection_test.js tests/desktop_prepare_test.js tests/game_shelf_test.js tests/local_play_test.js tests/net_window_test.js tests/window_play_native_test.js tests/serve_py_test.js tests/fog_test.js tests/skybox_test.js tests/options_order_test.js tests/blast_shake_test.js tests/newer_menu_scroll_test.js tests/addon_effects_guard_test.js tests/shambler_steps_test.js tests/hooks_test.js tests/drips_test.js tests/electric_native_test.js tests/electric_spatial_test.js tests/milkyway_sky_test.js tests/texture_q92_channels_test.js tests/in_web_test.js tests/in_web_capture_test.js tests/in_web_lifecycle_test.js tests/dof_test.js tests/footsteps_test.js tests/material_impacts_test.js tests/water_audio_test.js tests/native_sound_replacement_test.js tests/environment_sounds_test.js tests/player_events_audio_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js tests/ambient_sounds_test.js tests/sound_channel_steal_test.js
```

Log `/tmp/dd-engine-full.log`. Only `tests/serve_py_test.js` failed, case “ranges are served as 206 with the right
bytes; whole files as before; past the end is 416”: its local server cannot start. Running unchanged
`python3 tools/serve.py 39999` confirms `PermissionError: [Errno 1] Operation not permitted` at `socket.bind`.
The sandbox cannot bind a localhost listener. No safeguard/test has been weakened, and this check remains required
at integration on a host that permits local listeners.

For comparable RED and pre-existing-failure proof, the five modified product files were temporarily restored from
`git show HEAD:<path>` (base named above), then this command ran, and the candidate was restored **byte-for-byte** in
`finally` from a separate `/tmp/quaked-dd-candidate-backup` snapshot (no index, branch, reset or stash operation):

```sh
QUAKED_DEMO_CAMERA_TRACE=/tmp/quaked-dd-red QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/cl_hexen2_demo_test.js tests/hexen2_demo_camera_test.js tests/serve_py_test.js
```

Base result **6/17 passed**: the six existing decoder tests passed, all seven new decoder/client cases failed, all
three camera cases failed with the percentages above, and the same HTTP case failed. Log `/tmp/dd-base-red.log`.
All final source was restored before the final 292/292 run. `git diff --check` also passes.

Compact durable receipts: [numeric measurements, input/candidate SHA-256 identities](../evidence/hexen2-dd-verification.json)
and [retained failures and suite counts](../evidence/hexen2-dd-checks.log). These identify implementation and observed
checks; they do not certify release. Full numeric traces stay outside the repository to keep this checkout small.

## Files and handoff

Modified:

- `src/engine/client/cl_hexen2_demo.js`: native decoding, retained state and unified entity packets.
- `src/engine/client/cl_main.js`: profile-gated native forced-link handling in the shared packet linker.
- `src/engine/client/cl_parse.js`: decode/reset the optional forced-link flag.
- `src/engine/common/protocol.js`: optional `PE2_NOLERP` flag.
- `src/engine/common/quakedef.js`: packet state default/copy for that flag.
- `tests/cl_hexen2_demo_test.js`: correct baseline fixture ordering, seven new public regressions.

Added:

- `tests/hexen2_demo_camera_test.js`: whole-stream owned camera qualification and optional per-frame traces.
- `docs/hexen2/dd-demo-camera.md`: this plan, evidence, review and handoff.
- `docs/evidence/hexen2-dd-verification.json`: base/input/candidate identities and before/after metrics.
- `docs/evidence/hexen2-dd-checks.log`: retained RED, independent GREEN and maintained-engine evidence.

Owner trial: integrate the uncommitted changes, start the installed Hexen II edition, open the console and run
`playdemo demo1`, `playdemo demo2`, `playdemo demo3`. The view should follow the player inside the level; demo1's
single teleport is expected. No browser/GPU or packaged-app trial was performed here. Native compiled-engine
side-by-side playback was not run; behavioural comparisons use the pinned canonical source, public byte fixtures,
installed map teleport definitions and actual shared-client playback.

The orchestrator owns the integration diff review, commit in the integration worktree, normal hook and full
distribution check, the restricted HTTP retest, Bluey reconciliation and owner visual acceptance. No change here
affects texture/skin-identity authoring suites. Distribution, pre-commit, builds, commits, pushes and other-worktree
writes were not run. No acceptance, landing or release is claimed.
