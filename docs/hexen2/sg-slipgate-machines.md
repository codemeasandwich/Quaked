# SG: slipgate machines retain their own art

21 October 2026. Local, uncommitted candidate in
`/Users/bri/worktrees/Quaked/hexen2-unified/sg`, based on
`6b34f3475b53e0bad718f0e07c2a3cad86802e8e`. Owner authority: package SG and the
21 October request to show destinations through portals/teleporter doorways while leaving slipgate machines plain.
No commit, integration, packaged trial, owner acceptance or release is claimed.

## Existing behaviour and the problem

Research used the newer approved architecture at
`/Users/bri/worktrees/Quaked/Dev/hexen2-unified/docs/hexen2/unified-host.md`, not the older local copy.
There are two existing destination-view producers; changing only `sv_portal.js` would miss level-exit machines.

- `gl_portal.js` parses the BSP entity lump, resolves `trigger_teleport` targets to
  `info_teleport_destination` (or `misc_teleporttrain`), and considers turbulent texture names beginning
  `*teleport`, case-insensitively. Sources are the world and eligible, unshifted `func_wall`/`func_illusionary`
  brushes. A brush left out for game type has no camera. The client has no skill setting from the server and keeps
  its existing policy of excluding only entities inhibited at every single-player skill.
- A face must lie within 24 units of a qualifying trigger's box. Always-working triggers beat named triggers;
  otherwise nearest wins, with the later trigger winning a tie. Coplanar faces belonging to one trigger share a view.
  There was no aperture size/shape test or per-map selection list in this camera path.
- A nearby `trigger_changelevel` claims a gate instead of the same-level camera path. Parallel gate faces within
  eight units are excluded together. `sv_portal.js` matches only the resulting rendered portals before preserving a
  crossing's camera, position and velocity; without one, the ordinary QC touch runs.
- `SV_SeamlessSetup` in `sv_seamless.js` separately offers pad exits as instantaneous teleports. Its
  `SV_PadWindows` supplied view-only crossings to `R_SetupLevelViews`, which reaches `R_AddLevelPortal`. That path
  previously put destination pictures over solid `slip*` machine panels, as well as actual `*teleport` portal rings.
  It requires upright, axis-aligned faces within 24 units of the exit plane, trigger overlap, at least 40 units across
  and 48 high, half-outline coverage, and an outer face. At most one face per facing gets a window.
- `R_RenderPortals` renders at most three visible camera/level views per frame. Camera views are enabled only in
  Enhanced/Newer mode with the portal options on. The existing seamless-travel enablement is retained.

`sv_portalmotion.js` records scoped pre-impact motion; `sv_teleporttrain.js` removes the end teleport train's corner
pauses. Neither chooses machines, and neither needs changing. Existing map examples in comments are not runtime
allowlists. No new map-name, target-name, entity-index or coordinate lists are introduced in runtime code.

## Rule and implementation

Reused the two constructors above, their entity parser, and the original render/transport paths. One small shared
render helper is needed because the server has raw BSP edges while the client may have subdivided render polygons:

1. (Withdrawn at integration, 21 October 2026.) The first candidate also treated start's three difficulty
   teleporters, beside their `trigger_setskill` brushes, as machines. They are doorway-sized `*teleport` openings in
   `wizmet1_2` arches, so the orchestrator kept their destination views, as the owner asked for doorways; there is
   no control-relationship rule.
2. Solid `slip*` / animated `+?slip*` panels are authored machine material. They retain their own material instead of
   getting level-view meshes. This is the material family already used by the existing exit recogniser.
3. For an upright `*teleport` swirl opening, recognise machine framing only when slip-family geometry covers at
   least half of BOTH opposing side edges, or BOTH top/bottom edges. Frame and aperture planes/edges must be within
   24 units. Project actual polygon vertices, including rotated apertures; merge interval coverage so BSP subdivision
   and duplicated back faces do not affect the decision. A single nearby decorative panel is insufficient.
4. World and eligible static-wall faces supply framing. Moving, translated or inhibited brushes do not. Camera
   selection retains the client's existing inhibition policy; server pad selection uses its actual skill/game type.
   Floor portals and unknown material families keep existing behaviour.

No renderer flag, game mode toggle, parallel portal subsystem or change to gamecode was added. Cameras excluded at
construction never acquire `_portal`, materials, render-target candidates, receiver visibility or camera-preserving
server motion. Machines' normal swirl/panel/frame rendering and collision remain the engine's ordinary paths.
Level-exit machine transport still uses the existing pad mechanism; plain doorways and portal rings retain their
existing crossings and destination views. This is a setup-time scan, not per-frame work.

Limits: Quake BSP has no universal semantic “machine” tag. The generic rule uses authored material conventions,
geometry and control entities. A wholly retextured add-on machine with no slip material or skill control is
indistinguishable from a doorway in this data, so it keeps its existing view. Do not replace this conservative default
with a map list or a size-only guess. Ring-shaped `*teleport` portals with ordinary copper/stone frames remain portals.

## Real-map evidence

Read-only inputs: the repo shareware pack, owned `/Users/bri/quaked/Quake/pak0.pak` and
`/Users/bri/quaked/Scourge of Armagon/pak0.pak`. No game data was copied into the repository.
[sg-map-decisions.json](sg-map-decisions.json) retains input SHA-256 identities and **every** requested map's
teleport brush/target and before/after camera-face count, including zero-view monster and deathmatch triggers.
Counts are coplanar face groups, not distinct teleport brushes. The tests use the public pack/model loaders and
`R_BuildPortals` / `SV_PadWindows`; before values ran against both original constructors from the base commit.

| Map | Same-level teleport brushes with views (before → after, camera-face counts) | Level-exit pad windows (before → after) |
| --- | --- | --- |
| start | `*1/*2/*3` (difficulty doorways): 4 each → 4 each; `*19`: 2 → 2; `*25`: 4 → 4 | episode gates to e1m1/e2m1/e3m1/e4m1: 1 each → 0; end: 0 → 0 |
| e1m1 | `*20`: 2 → 2 | e1m2 machine: 1 → 0 |
| e1m2 | `*1/*21/*22`: 4 each → 4 each | no pad window; ordinary exit doorway to e1m3 retains its seamless view |
| e1m3 | `*55/*76`: 4 each → 4 each | no pad window; doorway to e1m4 unchanged |
| e1m4 | all teleport triggers: 0 → 0 | ordinary doorway to e1m5 unchanged; secret ring to e1m8: 2 → 2 |
| e1m5 | `*11/*28/*29`: 2 each → 2 each; `*27/*48`: 4 each → 4 each | portal to e1m6: 1 → 1 |
| e1m6 | `*22/*28/*32/*52/*99`: 2 each → 2 each | no pad window; doorway to e1m7 unchanged |
| e1m7 | all teleport triggers: 0 → 0 | portal ring to start: 2 → 2 |
| hip1m1 | `*39/*76`: 2 each → 2 each; other triggers 0 → 0 | hip1m2 machine: 1 → 0 |

Important correction to the brief: actual E1M2 exit `*36` is a brick/metal doorway, not a slipgate machine.
Its box is `[-671,-623,465]..[-665,-377,575]`, with nearby `metal5_6`, `wbrick1_5` and `exit02_2`; the closest
slip surface is about 2922.5 units away. Its view is deliberately preserved. Start's three difficulty controls are
48×96 `*teleport` apertures framed in `wizmet1_2`, not slip textures. Their skill brushes are ten units away.
E1M3 doorways use the same metal material, so metal names, vertical orientation and size alone would be wrong.
Episode/E1M1 exit machines actually use solid `slip1` panels and animated slip frame textures; their view overlays
previously covered that authored machinery. E1M4's secret exit is a copper-framed `*teleport` ring.

## Verification and handoff

Independent planning examined both constructors and the real BSPs before the final rule. Independent read-only
review found fragmented-frame, rotated-projection and inactive-brush defects in the first candidate; all three were
corrected and receive permanent synthetic regressions through `R_BuildPortals`.

RED first: the initial shareware test failed on start `*1` (0/1). The expanded regression suite run with the original
base constructors failed 0/4; the machine renderer assertion and real installed-machine decisions also failed.
Original source was restored after the first baseline run; the expanded baseline used a process-local Node loader
overriding only the two original constructor modules, leaving the worktree candidate unchanged.

Final commands/results are recorded below after the required runs finish. Existing physics suites intentionally
requiring camera views on skill controls were updated to require no camera there, while retaining ordinary hub-return,
step/frame, velocity, obstruction and destination-clearance checks. Native public trigger-touch coverage executes the
real installed QuakeC teleport to prove skill machines still transport the player. Real exit coverage goes through
`SV_SeamlessSetup → R_SetupLevelViews`: a machine creates no view/window mesh; the portal ring still creates one.

Try it after integration: start Quake in Enhanced mode with portals enabled, walk through each skill selector and
inspect the episode machines, then E1M1's exit. Their art stays visible and transport still works. Compare E1M3's
in-level teleports, E1M4's secret ring and E1M2's exit doorway: destination views remain. A packaged visual/owner trial
is still required; these headless Three.js/public-interface checks do not claim GPU screenshot acceptance.

## Coordination and remaining owner

Bluey `agent_whoami` failed with `storage_error`, correlation `fbd3faa166f2440594bf294e5655768a`, and
`mutationOutcome: unknown`. No board mutation, assignment, acknowledgement or completed card is claimed.
This package record is the outage ledger. SG is responsible for the local implementation and verification;
the integration orchestrator owns diff review, reconciliation onto the existing card when Bluey recovers, commit,
maintained pre-commit/distribution gate, app trial and acceptance. Do not pick up unrelated tasks or publish a release.
The final candidate is deliberately left uncommitted, with all new files present for the orchestrator.

### Final results and exact commands

[sg-verification.txt](sg-verification.txt) retains each suite result, failures, missing inputs, base reproductions and
runtime/test source hashes. Independent read-only review concluded no remaining code blocker after its corrections;
its additional geometry/static-source probes passed 8/8. This is code review and local verification, not landing.

The required run is **not fully green** in this sandbox:

| Run | Result |
| --- | --- |
| Focused portal/native/renderer checks, 9 files | 35/35 passed; 7 end-level tests skipped because the checkout's `resources` directory is absent |
| All `tests/hexen2_*_test.js`, 78 files | 77 suites reported 248/248 passed; `hexen2_catalogue_test.js` aborted on localhost `listen EPERM` before reporting any tests |
| Maintained `engine-tests.mjs` list, all 35 files | 34 suites reported 211/213 passed; 2 `serve_py_test.js` tests failed; `game_catalogue_test.js` aborted on localhost `listen EPERM` |
| Base reproduction of both catalogue suites | Both aborted on the same localhost `listen EPERM` |
| Base reproduction of `serve_py_test.js` | 0/2 passed, same two server-start failures |
| Whitespace check | `git diff --check` passed |

The failing Python child was separately launched with captured stderr: binding `127.0.0.1` raises
`PermissionError: [Errno 1] Operation not permitted`. The server script and all three affected HTTP test files are
unchanged from base. Do not relabel these failures as passes or skips: integration must rerun these checks where
localhost binding is permitted. The runner's `TOTAL` counts omit suites that abort during module initialisation;
the file inventory above explicitly includes them. Runtime source had only a private helper rename and replacement
of array spreading by a bounded loop during the long Hexen run; the final focused run followed those edits.

All commands ran from the SG worktree, using the already-present `node_modules`; no installation/download was needed:

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js

# Final focused run: 35/35, 7 skips (missing resources).
QUAKED_OWNED_PAK='/Users/bri/quaked/Quake/pak0.pak' node tools/run_tests.mjs tests/slipgate_machine_test.js tests/gl_portal_test.js tests/sv_portal_motion_test.js tests/sv_portal_walk_test.js tests/sv_portal_hull_test.js tests/pad_window_test.js tests/end_level_native_test.js tests/portal_receiver_cull_test.js tests/r_teleportfx_test.js

# Required wildcard: 248/248 reported, one aborted suite as above.
node tools/run_tests.mjs tests/hexen2_*_test.js

# Copied maintained suites array: 211/213 reported, one aborted suite as above.
node tools/run_tests.mjs tests/game_catalogue_test.js tests/game_selection_test.js tests/desktop_prepare_test.js tests/game_shelf_test.js tests/local_play_test.js tests/net_window_test.js tests/window_play_native_test.js tests/serve_py_test.js tests/fog_test.js tests/skybox_test.js tests/options_order_test.js tests/blast_shake_test.js tests/newer_menu_scroll_test.js tests/addon_effects_guard_test.js tests/shambler_steps_test.js tests/hooks_test.js tests/drips_test.js tests/electric_native_test.js tests/electric_spatial_test.js tests/milkyway_sky_test.js tests/texture_q92_channels_test.js tests/in_web_test.js tests/in_web_capture_test.js tests/in_web_lifecycle_test.js tests/dof_test.js tests/footsteps_test.js tests/material_impacts_test.js tests/water_audio_test.js tests/native_sound_replacement_test.js tests/environment_sounds_test.js tests/player_events_audio_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js tests/ambient_sounds_test.js tests/sound_channel_steal_test.js

# Earlier iterations (retained failures were corrected, not waived).
node tools/run_tests.mjs tests/slipgate_machine_test.js
node tools/run_tests.mjs tests/gl_portal_test.js tests/sv_portal_motion_test.js tests/sv_portal_walk_test.js tests/sv_portal_hull_test.js tests/pad_window_test.js tests/end_level_native_test.js tests/portal_receiver_cull_test.js tests/r_teleportfx_test.js
QUAKED_OWNED_PAK='/Users/bri/quaked/Quake/pak0.pak' node tools/run_tests.mjs tests/slipgate_machine_test.js tests/gl_portal_test.js tests/sv_portal_hull_test.js tests/sv_portal_walk_test.js tests/pad_window_test.js
QUAKED_OWNED_PAK='/Users/bri/quaked/Quake/pak0.pak' node tools/run_tests.mjs tests/slipgate_machine_test.js tests/pad_window_test.js

# Base runtime loader replaces only gl_portal.js and sv_seamless.js with their git-show base sources.
NODE_OPTIONS='--import /tmp/sg-baseline-loader.mjs' node tools/run_tests.mjs tests/slipgate_machine_test.js
NODE_OPTIONS='--import /tmp/sg-baseline-loader.mjs' node tools/run_tests.mjs tests/serve_py_test.js
NODE_OPTIONS='--import /tmp/sg-baseline-loader.mjs' node tools/run_tests.mjs tests/game_catalogue_test.js
NODE_OPTIONS='--import /tmp/sg-baseline-loader.mjs' node tools/run_tests.mjs tests/hexen2_catalogue_test.js

git diff --check
```

Earlier results: first regression RED 0/1; first GREEN 1/1; expanded GREEN 4/4; first affected run 27/29 with 7 skips
(the two failures were old skill-camera assertions); intermediate affected run 21/22 (native test compared string-table
indices rather than string values); corrected intermediate run 10/10; expanded base RED 0/4. The final focused command
above supersedes the earlier candidate runs. All other requirements remain visible rather than hidden by a passing total.

No app build, pre-commit hook, `npm run test:distribution`, authoring/skin-identity suite, commit or push was run.
No authoring/skin-identity suite is affected by this code-only change. The orchestrator retains the full staged app and
distribution checks. No owned pack or source reference was modified, and no large artifact was created.

### File handoff

Modified:

- `src/newer/render/gl_portal.js`: selection-control exclusion, shared eligible faces, framed-machine rejection.
- `src/newer/gameplay/sv_seamless.js`: shared eligible faces and rejection before level-window creation.
- `tests/pad_window_test.js`: revised machine expectations; retained ring/E1M2 doorway evidence; native QC and renderer tests.
- `tests/sv_portal_hull_test.js`, `tests/sv_portal_walk_test.js`: intentional skill exclusion, retained ordinary portal physics checks.
- `docs/hexen2/unified-host.md`: link to this package's outage/handoff ledger.

Added:

- `src/newer/render/r_slipgate.js`: shared material/frame rule and eligible world/static-face enumeration.
- `tests/slipgate_machine_test.js`, `tests/helpers/slipgate_maps.mjs`: synthetic and installed/shareware public-interface regressions.
- `docs/hexen2/sg-slipgate-machines.md`, `docs/hexen2/sg-map-decisions.json`, `docs/hexen2/sg-verification.txt`: rationale, provenance,
  complete map decisions, verification and failures.

The final checkpoint read also failed: `agent_work_checkpoint`, `storage_error`, correlation
`df6564f1b33b4feaa9a9d8668a0acc5e`, `mutationOutcome: unknown`. The existing board card could not be read or updated.
Next owner remains the integration orchestrator: reconcile this ledger, review the uncommitted diff, rerun the three
HTTP suites with localhost permission and the skipped end-level suite with its resources, run maintained integration
checks, then arrange the owner's packaged visual trial. No autonomous worker handoff or queued follow-up is claimed.
