# H1: hub save size and storage

Workspace: `/Users/bri/worktrees/Quaked/hexen2-unified/h1`, branch `u/h1`, base `245a5cb34fd9eebef22c156da1c341b4baf4cc04`.
Authority: the owner's H1 brief; no commits, publication or release. Normative design read from
`/Users/bri/worktrees/Quaked/Dev/hexen2-unified/docs/hexen2/unified-host.md`.

## Coordination and implementation plan

Bluey `agent_whoami` failed with `storage_error`, correlation `0970c1364dec42baa1cbdb3eb37b5cd6`.
No verified identity, card claim or update is asserted. Bluey remains unavailable; reconcile with the existing H1 card when access returns. This file retains H1's scope/evidence until the orchestrator
can reconcile the existing card. Responsible implementation owner: this H1 session; integration/review owner: the
unified-host orchestrator. Next action: orchestrator reviews the uncommitted H1 diff, reconciles the existing Bluey card and runs the sandbox-blocked Python server and Hexen catalogue tests in a permitted environment before integration.

Reuse the shared server and hub serialiser unchanged. Measure fresh, once-visited maps through the exported
`Host_Hexen2ChangeLevel2` and `Host_Hexen2SaveGame`/`ReadSlot` path, discovering targets from the live gamecode's
`trigger_changelevel` entities. Keep separate base, Keep and Tibet hubs. Captures are headless initial map state,
not a long-play or combat worst-case. No licensed content is written into the repository.

The measured first hub and Tibet exceed 1 MB, so route hub records through the existing `Hexen2_SaveStore`.
Keep Quake's version-5 branch unchanged. Wait for transaction completion, not request success, before acknowledging a
write or deleting a legacy source. Fall back only when IndexedDB cannot be opened; a transaction/quota failure must
fail visibly and keep the previous committed save. Retain the localStorage and memory backends, warning for memory.

Keep the exported host names and console/menu commands. Save/read/load become asynchronous; menu summaries remain
synchronous cached metadata and refresh when a page opens. Serialise repository operations so rapid save/read/delete
and migration cannot overwrite each other. Namespace by the existing game save prefix. Read-through migration
validates the old hub, commits the new record, then removes the legacy key; a failed migration still loads the old
record. Delete removes both formats. Menu reads never parse hub JSON during drawing.

Verification: public RED/GREEN regression tests for IndexedDB round-trip, an abort after request success, previous-save
preservation, migration, fallback, responsive menu refresh/deletion and game isolation; owned-data size measurements;
all Hexen II, menu and maintained engine suites. Independent review and owner app trial remain separate from this
session's checks. A read-only sibling agent reviewed the saved design, implementation and public tests after the
first implementation; it found the fallback recovery defect described below. No implementation was delegated.
DeepSeek V4.1 Flash is not exposed as a callable tool in this session; this is not a claim of provider-qualified review.

## Measurements and decision

Command: `QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_save_size_test.js tests/hexen2_save_size_portal_test.js`.
Result: 2/2 passed in the initial run. Final seeded counts below also pass against the base implementation. Bytes are UTF-8 of the actual saved text, including header, comment and trailing newline.

| Capture | Total bytes | Levels |
| --- | ---: | ---: |
| Base demo1 alone | 134,400 | 1 |
| Base first hub including rider1a | 1,223,081 | 9 |
| Portal Keep | 844,884 | 5 |
| Portal Tibet | 1,285,484 | 10 |

Three copies of both the base first hub and Tibet: 7,525,695 bytes. Both exceed 1,000,000 bytes independently.
Migration is required by either trigger in the brief. localStorage's UTF-16 accounting can make the pressure greater.
These final captures seed the test's random source (12345) to make map-spawn variation reproducible; earlier unseeded
8-map measurements already crossed the threshold. No storage-size reduction was used to justify migration.

Per-level bytes below are `JSON.stringify(level)` within the hub (the remainder is keys, session/clients and framing):

| Base first hub | Bytes (% of save) | Keep | Bytes (% of save) | Tibet | Bytes (% of save) |
| --- | ---: | --- | ---: | --- | ---: |
| demo1 | 132,518 (10.83%) | keep1 | 145,358 (17.20%) | tibet1 | 126,232 (9.82%) |
| demo2 | 186,819 (15.27%) | keep2 | 198,377 (23.48%) | tibet2 | 185,752 (14.45%) |
| demo3 | 104,128 (8.51%) | keep3 | 192,373 (22.77%) | tibet3 | 98,664 (7.68%) |
| village1 | 226,368 (18.51%) | keep4 | 145,002 (17.16%) | tibet4 | 172,282 (13.40%) |
| village2 | 192,424 (15.73%) | keep5 | 159,776 (18.91%) | tibet5 | 99,464 (7.74%) |
| village3 | 184,820 (15.11%) |  |  | tibet6 | 117,878 (9.17%) |
| village4 | 76,390 (6.25%) |  |  | tibet7 | 133,834 (10.41%) |
| village5 | 88,283 (7.22%) |  |  | tibet8 | 135,498 (10.54%) |
| rider1a | 27,542 (2.25%) |  |  | tibet9 | 129,813 (10.10%) |
|  |  |  |  | tibet10 | 83,936 (6.53%) |

The base traversal includes rider1a and stops at its meso2 target (the next episode). The Portal traversal measures both connected Keep and Tibet
map groups separately, including every live trigger target in each group. Host transitions bypass puzzle locks as
authorised by H1; they exercise native client carry-over, not a played-through campaign. Per-level values depend on
the recorded visit order; tests print the full target graph and all byte counts for reproducibility.

## Implementation and recovery

- `hexen2_save.js` retains its database (`quaked-hexen2-saves`, `saves`, version 1) and existing fallback prefix
  `quaked.hexen2.save.`. Explicit null platform injection disables that backend. IndexedDB open failure/blocked open
  selects fallback; quota/request/transaction failure does not silently switch persistence. `put` resolves at commit.
- `Host_Hexen2SaveGame`, `Host_Hexen2ReadSlot` and `Host_Hexen2LoadGame` return promises. Save captures the immutable
  text before yielding; the repository queue preserves save/read/delete order. The `save`/`load`, aliases and quick
  commands retain their syntax and report asynchronous completion/failure. Loading leaves live state alone while
  awaiting storage and refuses a changed active game. Quake's version-5 storage and restore bodies are unchanged.
- `Host_Hexen2SaveSummary` returns cached metadata synchronously. `Host_Hexen2RefreshSaveIndex` reads the twelve slots
  when a page opens; the page opens and accepts input immediately. Draw uses only cached comments. Scan identity and
  game prefix prevent an older asynchronous refresh overwriting the newly opened game's list.
- `Host_Hexen2DeleteSlot` is asynchronous; menu Delete uses it and refreshes the index after completion. It removes
  primary, fallback and legacy forms after a healthy database open. If the advertised IndexedDB cannot open, deletion
  refuses visibly before removing anything; reopen/restart the page or app after recovery, then retry. The open
  decision is cached for the page lifetime, so waiting in the same page does not retry the database open. A fallback-only deletion in that condition could
  otherwise resurrect the old IndexedDB copy. Platforms with no IndexedDB API retain fallback-only deletion.
- Legacy `HEXEN2HUB 1` values under `<existing game save prefix><slot>` are validated and copied into the repository,
  then removed only after a persistent commit. If migration fails, the old slot still loads and a warning explains
  that it was retained. Memory never replaces the only persistent source. Quake version-5 text is ignored.
- Independent review found that a successful IndexedDB reopen could hide a newer localStorage fallback save behind
  an older IndexedDB copy. The host now reads that fallback through the same store API, compares validated hub
  `savedAt` dates (fallback wins a tie), commits the newer fallback and only then removes it. Aborted recovery keeps
  and returns the fallback. Cleanup is guarded by the primary store actually resolving to `indexeddb`, so an open
  failure cannot cause the active fallback to delete itself. Primary writes clean obsolete fallback records.

Trial: start Hexen II, use `save h1trial`, travel with `changelevel2 demo2`, then `load h1trial`; the saved map/player
and visited hub should return. Save/Load pages show cached comments immediately and refresh from IndexedDB. For a
legacy slot, loading or opening the slot page performs read-through migration. In a browser with no persistent
storage, the console explicitly warns that memory-only saves disappear when the app closes. No packaged app trial,
owner acceptance, integration, commit or release is claimed here.

## Independent review and remaining gates

Read-only sibling reviewer `h1_review` reviewed the design record, source and public tests. First review found fallback
continuity; re-review found outage deletion; both received retained RED/GREEN tests and fixes. Final re-review found
no further material issue within the documented scope and required the restart/retry limitation above. The source-review phase ran no tests/builds. A subsequent supervised independent run used the five public-interface
suites listed below: exit 0, 23/23 checks, no skips or startup crashes, and identical owned-data size measurements.
Combined stdout/stderr is retained at `/tmp/h1-independent-public.log`; expected failure-injection diagnostics were
inspected and no unexpected failure occurred. This is independent source/public-interface evidence, not owner
acceptance, provider qualification, integration or release.

The orchestrator owns integration and permitted-environment retries of `serve_py_test.js` and
`hexen2_catalogue_test.js`. Both fail on localhost startup under this sandbox, and both reproduce on the base. No post-session worker
has been submitted or claimed running. This report is the visible H1 obligation while Bluey is unavailable. No files
were staged or committed; no other worktree or licensed installation was modified. No authoring/texture/skin-identity
or full distribution suite was run; H1 changes no authoring assets, so no additional such suite is identified as
affected. The integration worktree still owns its normal pre-commit build/distribution gates.

## Verification commands and receipts

Dependencies were already present; no install, build, pre-commit hook or full distribution run was performed.
All commands below ran from the H1 worktree with:

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
```

The full command set (repeated runs use the same command with the then-current tests):

```sh
node tools/run_tests.mjs tests/hexen2_save_size_test.js tests/hexen2_save_size_portal_test.js
node tools/run_tests.mjs tests/hexen2_save_storage_test.js
node tools/run_tests.mjs tests/hexen2_save_storage_test.js tests/hexen2_hub_native_test.js tests/hexen2_save_size_test.js tests/hexen2_save_size_portal_test.js
node tools/run_tests.mjs tests/hexen2_save_storage_test.js tests/hexen2_save_size_test.js tests/hexen2_save_size_portal_test.js
node tools/run_tests.mjs tests/hexen2_save_storage_test.js tests/hexen2_menu_native_test.js
node tools/run_tests.mjs tests/hexen2_save_storage_test.js tests/hexen2_hub_native_test.js tests/hexen2_menu_native_test.js tests/hexen2_save_size_test.js tests/hexen2_save_size_portal_test.js
node tools/run_tests.mjs tests/hexen2_*_test.js tests/menu*_test.js
```

| Receipt log (temporary, outside repo) | Result | Meaning |
| --- | --- | --- |
| `/tmp/h1-measure.log` | 2/2 | Initial pre-implementation measurement, unseeded, before adding rider1a |
| `/tmp/h1-red.log` | 0/3 | Original host/store fail migration, commit acknowledgement and IDB routing |
| `/tmp/h1-green-first.log` | 10/10 | First migration/round-trip and inclusive map measurement |
| `/tmp/h1-green-second.log` | 7/7 | Seeded measurements and five storage checks |
| `/tmp/h1-green-third.log` | 14/14 | Six storage checks and eight native-menu checks |
| `/tmp/h1-recovery-red.log` | 6/7 | Review finding: newer outage save hidden by older IDB copy |
| `/tmp/h1-recovery-green.log` | 7/7 | Recovery fix |
| `/tmp/h1-delete-red.log` | 7/8 | Re-review finding: outage deletion falsely succeeded |
| `/tmp/h1-final-smoke.log` | 23/23 | Eight storage checks, five native hub, eight native menu, two size checks |
| `/tmp/h1-independent-public.log` | 23/23; exit 0 | Independent repeat of those five suites, no skips/startup crashes; identical measured sizes |
| `/tmp/h1-all-hexen-menu.log` | 233/233 executed; exit 1 | Before final guard; catalogue suite also crashed before registering its four tests |
| `/tmp/h1-final-all-hexen-menu.log` | 234/234 executed in 76 completed suites; exit 1 | 77 suites requested; catalogue suite startup failed, four checks unexecuted; no skips |
| `/tmp/h1-final-engine.log` | 208/209 (34 suites); exit 1 | Final maintained engine run; Python server startup failed, no skips |
| `/tmp/h1-catalogue-current.log` | suite startup failure; exit 1 | Final isolated catalogue retry: `listen EPERM` |
| `/tmp/h1-catalogue-base.log` | suite startup failure; exit 1 | Same catalogue failure on base implementation |
| `/tmp/h1-engine.log` | 208/209 | Maintained engine list; Python localhost bind refused by sandbox |
| `/tmp/h1-base-red.log` | 7/16 | Base replay: server 0/1, new storage regressions 0/7, native menu 7/8 |
| `/tmp/h1-base-size.log` | 2/2 | Final seeded measurement also passes on the base implementation, identical byte counts |

The maintained engine `suites` array from `tools/distribution/engine-tests.mjs` was run directly, without its
build/distribution wrapper or optional owned-mission-pack/LAN additions:

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_catalogue_test.js tests/game_selection_test.js tests/game_shelf_test.js tests/local_play_test.js tests/net_window_test.js tests/window_play_native_test.js tests/serve_py_test.js tests/fog_test.js tests/skybox_test.js tests/options_order_test.js tests/blast_shake_test.js tests/newer_menu_scroll_test.js tests/addon_effects_guard_test.js tests/shambler_steps_test.js tests/hooks_test.js tests/drips_test.js tests/electric_native_test.js tests/electric_spatial_test.js tests/milkyway_sky_test.js tests/texture_q92_channels_test.js tests/in_web_test.js tests/in_web_capture_test.js tests/in_web_lifecycle_test.js tests/dof_test.js tests/footsteps_test.js tests/material_impacts_test.js tests/water_audio_test.js tests/native_sound_replacement_test.js tests/environment_sounds_test.js tests/player_events_audio_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js tests/ambient_sounds_test.js tests/sound_channel_steal_test.js
```

Base replay uses a Node source loader at `/tmp/h1-base-loader.mjs`, which substitutes `git show
245a5cb34fd9eebef22c156da1c341b4baf4cc04:<path>` for the three changed production modules. Everything else in the
engine is unchanged. It verifies that `tests/hexen2_catalogue_test.js`, `tests/serve_py_test.js`, `tools/serve.py`, `tools/resource_paths.py` and the test
runner have byte-identical Git object hashes to that base. No checkout or worktree is created or modified.

```sh
NODE_OPTIONS='--import=/tmp/h1-base-loader.mjs' QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/serve_py_test.js tests/hexen2_save_storage_test.js tests/hexen2_menu_native_test.js
NODE_OPTIONS='--import=/tmp/h1-base-loader.mjs' QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_save_size_test.js tests/hexen2_save_size_portal_test.js
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_catalogue_test.js
NODE_OPTIONS='--import=/tmp/h1-base-loader.mjs' QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_catalogue_test.js
python3 tools/serve.py 27849
git diff --check
```

The Python startup diagnostic fails at `socket.bind` with `PermissionError: [Errno 1] Operation not permitted`.
The same `serve_py_test.js` assertion (`the server started`) fails 0/1 on the base. This is a retained failing check,
not a skip or green qualification. `hexen2_catalogue_test.js` likewise fails before registering its four
checks with `Error: listen EPERM: operation not permitted 127.0.0.1`, both in the final run and the base replay. The
runner's aggregate TOTAL omits suite startup crashes, so the 234/234 aggregate is not an overall passing run. No approval escalation or safeguard bypass was attempted. `git diff --check`
passes. New storage regressions fail on the base; one deletion/index check there names an API that did not exist,
while the other regression failures exercise the original callable public save/read/store/menu interfaces.

## Changed and added files

Changed:

- `src/engine/common/hexen2_save.js`
- `src/engine/server/host_cmd.js`
- `src/engine/client/menu_hexen2_multiplayer.js`
- `tests/hexen2_hub_native_test.js`
- `tests/hexen2_menu_native_test.js`

Added:

- `tests/helpers/fake_indexeddb.mjs`
- `tests/helpers/hexen2_save_measure.mjs`
- `tests/hexen2_save_storage_test.js`
- `tests/hexen2_save_size_test.js`
- `tests/hexen2_save_size_portal_test.js`
- `docs/hexen2/h1-save-storage.md`

Final status: implementation and source review complete for orchestrator review; final Hexen/menu run 234/234 executed checks across 76 completed suites, plus one suite startup failure
(`hexen2_catalogue_test.js`, four checks not registered/executed); overall exit 1. Final maintained engine tests are
208/209, exit 1. Both localhost startup failures reproduce on the base. Final diff whitespace check passes;
Git index is empty and all 11 changed/added files remain uncommitted. Size numbers match the base replay exactly.
The only final source edits after the full run were module/JSDoc comments; executable code is the tested version.
The independent 23/23 run occurred after those comments and made no source edits. Broad qualification remains
incomplete until both sandbox-blocked server suites run in the permitted integration environment.
