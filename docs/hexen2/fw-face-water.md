# FW: face water during demo playback

Worktree: `/Users/bri/worktrees/Quaked/hexen2-unified/fw`, branch `u/fw`, base
`6b34f3475b53e0bad718f0e07c2a3cad86802e8e`. Owner scope: research and fix the
Newer HUD water overlay using the rendered view in demos and play; leave changes
uncommitted for orchestrator review/integration. No release authority.

## Research and implementation plan

This base already contains an earlier demo fallback. `Sbar_Draw` advances
`R_PlayerFaceFrame`, which calls `R_FaceWater`, then `CL_PlayerWater`.
`src/newer/gameplay/cl_water.js:50-56` samples the recorded body's feet, waist and
raw eye and requires all three to be liquid. It does not observe the rendered
view. `src/engine/render/gl_rmain.js:481-490` already finds the actual view leaf
for tint and warp; `view.js` applies bob, stair smoothing and other camera offsets
before that query. A dry recorded body with an underwater view therefore has a
water tint but no face overlay. The server-only hypothesis is not the current
checkout's cause.

Independent planning reviewed the caller, renderer and lifecycle seams. Reuse
the existing renderer query by publishing its contents with its world identity
on the shared client. Clear it in both the client constructor and `CL_ClearState`.
Let the HUD opt into that observation, falling back to the existing body path
before any view has been rendered. Keep the sound/body observation unchanged.
The two observations need separate demo entry timestamps: pre-render audio
sampling a dry body must not reset an underwater view's visual reserve. Use the
same reserve algorithm, native `air_finished` and existing `FaceWaterState`
animation; no second view contents query, gameplay changes or game-family branch.

Public RED/GREEN tests must drive `R_SetupFrame` and `R_PlayerFaceFrame`, with
deliberately disagreeing view/body positions and no server. Cover entry, fill,
drain, repeated sound reads, absent view entity, Quake/Hexen profiles, liquid
types and lifecycle resets. Run native air/suit tests to protect normal play.

## Coordination and remaining gates

Bluey `agent_whoami` returned `storage_error`, correlation
`ad1c1b2ba0e04af1814dac3386f4c776`; no assignment or update was acknowledged.
This follows the existing project ledger's outage procedure. Responsible owner:
FW implementer during implementation; integration orchestrator for card
reconciliation, independent final review, full integration hook and packaged
owner trial. No durable worker handoff has been submitted or claimed.

The implementation, checks and remaining handoff gates are recorded below.

## Working candidate

The renderer now publishes `{ world, contents }` as `cl.viewcontents` from its
existing leaf lookup. Both the constructor and manual client reset clear it;
no-world rendering clears the previous leaf too. `R_FaceWater` opts into the
view sample through `CL_PlayerWater( client, { view: true } )`. Other callers
retain their existing body observation. World identity guards stale samples.
Native eligibility, air deadlines, suit behaviour and the existing animation
controller remain in place. No source from the native references was translated.

Independent read-only reviewer `/root/fw_review` examined the normative plan,
caller/renderer/lifecycle paths, final implementation and the three face test
suites. Verdict: no blocking findings. The reviewer ran `git diff --check`,
but no test suites, GPU or packaged application trial. Its suggestion to add the
regression to the maintained engine list was applied (`face_view_water`).

The initial RED ran the new public suite against unchanged base product code:
**0/4 passed, 4 failed**, all on the absent view-driven fill. The first targeted
GREEN passed **23/23**. A stronger native renderer test then passed itself but
left a view sample in the next test's manually reused world: **10/11** on that
run. Adding `CL_ClearState` to its teardown fixed the test isolation failure.
The final focused run passed **46/46**; no failure was relabelled as pre-existing.
After the base-source comparison and byte-verified restoration, the same focused
command was rerun and again passed **46/46** (`restored.txt.gz`).
Real Quake demo2, now through `V_CalcRefdef` and `R_SetupFrame`, observed
987 signed-on samples, 210 underwater samples, W10 and 100% visual air use.

The all-Hexen command finished with **248/248** reported tests passing in 77
suites. `hexen2_catalogue` crashed before registering tests because localhost
binding is refused (`listen EPERM 127.0.0.1`); this is a failed overall command,
not an all-green Hexen run. The maintained engine list reported **215/217**:
two `serve_py` server-start assertions failed, and `game_catalogue` crashed
before registering tests with the same `listen EPERM` error. No skips.

All three affected suites were rerun against unchanged base source
`6b34f3475b53e0bad718f0e07c2a3cad86802e8e`: both catalogue suites crashed with
identical `listen EPERM` errors; both `serve_py` checks failed identically
(0/2 reported, exit 1). For this comparison, every modified tracked file was
saved, replaced with `git show HEAD:<path>` bytes and restored in `finally`.
Restoration was byte/hash verified; temporary preimages were removed only after
that check. No Git index/ref operations were used. The new untracked test and
documentation stayed in place and were not inputs to the baseline command.

Integration orchestrator next action: review/integrate these uncommitted files,
reconcile the existing Bluey card when storage returns, rerun listener-dependent
suites in an environment that permits local listeners, then run the full hook
and packaged owner trial. No landing, packaged visual qualification, owner
acceptance or release is claimed.

## Exact commands

Dependencies were already installed; no install, distribution test command,
pre-commit hook, app build or network access was performed. Every test command
below used this environment:

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
```

RED (0/4), before product edits:

```sh
node tools/run_tests.mjs tests/face_view_water_test.js
```

First GREEN (23/23):

```sh
node tools/run_tests.mjs tests/face_view_water_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js tests/view_contents_test.js tests/water_audio_test.js tests/face_v44_native_test.js
```

Expanded native check (10/11, isolation failure retained):

```sh
node tools/run_tests.mjs tests/face_view_water_test.js tests/face_v44_native_test.js
```

Rendered demo replay (4/4):

```sh
node tools/run_tests.mjs tests/face_demo_water_test.js
```

Final focused check after fixture teardown correction (46/46):

```sh
node tools/run_tests.mjs tests/face_view_water_test.js tests/face_demo_water_test.js tests/face_v44_native_test.js tests/face_game_test.js tests/face_native_test.js tests/face_water_entry_test.js tests/face_state_test.js tests/view_contents_test.js tests/water_audio_test.js
```

All 78 Hexen suites (248/248 reported, one suite crash, exit 1):

```sh
node tools/run_tests.mjs tests/hexen2_*_test.js
```

Maintained engine list, copied from `tools/distribution/engine-tests.mjs` with
the new regression included (215/217 reported, one suite crash, exit 1):

```sh
node tools/run_tests.mjs tests/{game_catalogue,game_selection,desktop_prepare,game_shelf,local_play,net_window,window_play_native,serve_py,fog,skybox,options_order,blast_shake,newer_menu_scroll,addon_effects_guard,shambler_steps,hooks,drips,electric_native,electric_spatial,milkyway_sky,texture_q92_channels,in_web,in_web_capture,in_web_lifecycle,dof,footsteps,material_impacts,water_audio,native_sound_replacement,environment_sounds,player_events_audio,face_demo_water,face_water_entry,face_view_water,ambient_sounds,sound_channel_steal}_test.js
```

Base-source comparison (0/2 reported, two suite crashes, exit 1):

```sh
node tools/run_tests.mjs tests/hexen2_catalogue_test.js tests/game_catalogue_test.js tests/serve_py_test.js
```

The maintained `texture_q92_channels` suite uses synthetic image transport and
does not read authoring images. No texture/skin-identity suite requiring absent
authoring inputs is affected by this HUD observation change. Optional LAN and
Lava Man additions were not requested/enabled; the integration orchestrator
retains the full hook/build and those configured optional checks.

## Evidence and file inventory

Raw logs, including the initial RED and native fixture failure, are compressed
under [the evidence directory](../evidence/fw-face-water-2026-10-21/).
`baseline-restoration.json` records the base identity, comparison command and
hashes proving the candidate was restored. Test subprocesses were allowed to
finish; no persistent server, dependency installation or large build output was
created.

Changed implementation:

- `src/engine/client/client.js`: initial view observation.
- `src/engine/client/cl_main.js`: reset that observation with the shared client.
- `src/engine/render/gl_rmain.js`: publish the existing rendered contents query.
- `src/newer/gameplay/cl_water.js`: explicit view observation and separate demo
  reserve timestamps using the existing algorithm.
- `src/newer/ui/r_facegame.js`: HUD selects the view observation.

Changed/added verification and documentation:

- `tests/face_view_water_test.js` (new): public view/body disagreement RED/GREEN.
- `tests/face_demo_water_test.js`: real demo now runs the rendered-view path.
- `tests/face_v44_native_test.js`: rendered native clock and drain control.
- `tools/distribution/engine-tests.mjs`: retain the regression in routine checks.
- `docs/hexen2/fw-face-water.md` (new): this research, verification and handoff.
- `docs/evidence/fw-face-water-2026-10-21/` (new): compressed logs and restoration
  receipt.

Try it after integration in Enhanced mode: play Quake `demo2`, watch its
underwater passages and the face's W1-to-W10 fill, then watch it drain on
surfacing. The renderer and HUD now share the same camera contents. The
synthetic public checks also select Hexen II's profile, but no packaged Hexen II
face trial or GPU framebuffer measurement was performed here.
