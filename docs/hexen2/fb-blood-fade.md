# FB: fractional face blood

Owner: Package FB agent in `/Users/bri/worktrees/Quaked/hexen2-unified/fb`.
Base: `6b34f3475b53e0bad718f0e07c2a3cad86802e8e`. Changes stay uncommitted for the
orchestrator's integration review. No release authority.

## Decision and implementation

The owner/orchestrator has resolved the art mapping: **crossfade existing
replacement decals**. H1 is clear; H2–H10 each contain a complete blood state.
Earlier complete decals must not accumulate. The approved rule is:

```text
health = clamp(healthPercent, 0, 100)
s = clamp((100 - health) / 10, 0, 9)
stage = floor(s)
draw stage fully (stage 0 means no decal), then stage + 1 at s - stage
```

At s=9, draw only H10 fully. The exported pure
`faceBloodBlend(percent)` in `src/newer/ui/r_playerface.js` implements the single
rule and returns `{ base, next, alpha }`. `base` and `next` are zero-based indices
into `pose.blood_layers` (0=H2, 8=H10), or null for no draw. Base draws at alpha 1;
next draws at alpha `alpha`. At exact stops `next` is null and `alpha` is zero.
The helper clamps finite input without rounding; non-finite/unknown input is
healthy/clear. The previous unused `faceBloodOpacity` helper has been removed.

| Health percent | Base | Next | Next opacity |
| --- | --- | --- | --- |
| 100 | clear | none | 0 |
| 95 | clear | H2 | 0.5 |
| 93 | clear | H2 | 0.7 |
| 90 | H2 | none | 0 |
| 64 | H4 | H5 | 0.6 |
| 10 or less | H10 | none | 0 |

The normative architecture is `docs/hexen2/unified-host.md`. The existing path
remains `Sbar_Draw` → `R_PlayerFaceFrame` → `FaceState.frame` →
`R_PlayerFaceCompose`. The compositor replaces only the blood slot's draw logic,
using the resolved `faceSelection(...).healthPercent`. It draws base then next
in the existing position after invisibility and before power eyes, water and
equipment. Canvas2D save/restore confines globalAlpha to each decal. Missing
required base or next art marks `blood` incomplete; Sbar retains its existing
fallback and only caches complete portraits. `faceSelection.layers.blood`
continues to describe the original whole health stage for existing callers;
composition resolves its fractional draw through the helper.

Existing health-stage authority remains: a stage-only caller uses its manifest
default (100, 90, ..., 10), and a mismatched stale percentage falls back to that
default. The existing live face pipeline still rounds health percent, clamped
out of 100; mega-health stays clear. Expression, gaze, flinch, blink, death,
powers, water, equipment and native fallback logic are unchanged. Hexen II still
returns early into its native status bar; FB adds no other portrait path or
class maximum.

`Sbar_DrawFace`'s cache key includes `healthPercent`: 95→93 recomposes even though
both use legacy stage H1. Unchanged percentage reuses the canvas while the other
face state fields remain unchanged. No per-frame recomposition was added.

## Plan and review

Independent read-only planning review confirmed zero-based decal mapping,
manifest-default compatibility and the need to handle blood even when the
legacy H1 selection is null. Public RED/GREEN tests exercise the helper and the
real `R_PlayerFaceCompose` entry point with stub Canvas2D/image endpoints and
the actual manifest/layer renderer. Across all 25 poses they check exact blood
decals, draw count/order, globalAlpha, invisibility before blood, power eyes
after blood and unchanged opacity for surrounding layers. Stage-only and stale
percentage calls are covered too. Public `Sbar_Draw` covers cache invalidation
and reuse.

Independent final code/test review found no blocking defects. Its test
robustness finding was fixed: the mask-order assertion now also requires the
mask to be present. Review was read-only; the reviewer did not run tests.

## Coordination and handoff

Bluey remains unavailable. The earlier `agent_whoami` failure was
`storage_error`, correlation `52a224359fcd45f39d56f2c3ea039e3c`. On continuation,
`agent_whoami` again failed with `storage_error`, mutation outcome unknown,
correlation `042666045b82481c92f03746f3e6fa22`. No assignment, card update or
handoff is acknowledged. This document retains the obligation and evidence;
the orchestrator must reconcile the existing FB card when access returns.

Responsible next owner: orchestrator, for integration review, missing-input
verification and owner trial. No commit, staging, landing, packaging, release,
visual app trial or owner acceptance is claimed. Source changes are ready for
that review; qualification remains limited by the checks recorded below.

## Continuation verification (21 October 2026)

The public crossfade tests first reported **RED 0/11**: ten missing-helper
failures and a compositor failure at 95% (no H2 draw). After implementation,
**GREEN 11/11**, plus **5/5 HUD tests**, including unchanged-health cache reuse.
The compositor case checks 25 poses × nine health inputs (225 compositions),
plus stage-only/stale-percentage compatibility. No image pixels or live app
appearance are claimed by the stub-context tests.

Commands run from this worktree with the already installed Three module:

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
node tools/run_tests.mjs tests/face_blood_test.js tests/hud_face_combo_test.js
node tools/run_tests.mjs tests/face_state_test.js tests/face_game_test.js tests/player_face_preload_test.js tests/player_face_failure_test.js tests/face_v44_state_test.js tests/face_v44_readiness_test.js tests/face_v44_composition_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js
node tools/run_tests.mjs tests/hexen2_*_test.js
```

Current logs: `/tmp/quaked-fb-crossfade-red.log`,
`/tmp/quaked-fb-crossfade-green.log`, `/tmp/quaked-fb-crossfade-face.log`,
`/tmp/quaked-fb-crossfade-hexen.log` and `/tmp/quaked-fb-crossfade-engine.log`.

- Focused crossfade + HUD: **16/16**, exit 0, after **RED 0/11** for the new
  crossfade contract. Final focused run includes the independent review fix.
- Face/state/preload/failure/readiness/water group: **31/34**, plus one whole
  suite skipped. Three readiness failures reproduce the previously recorded
  legacy `newer/hud/playerface/*.png` file-path problem; the first missing PNG
  this run is `blood_h2_normal_front.png`, followed by both dry-completeness
  assertions. The earlier same-base failure evidence is retained below.
- `face_v44_composition_test.js` was attempted and **skipped**, because the
  required `player-face-layers-v4.4.0.html` is absent from this slim worktree.
  Integration still owes the authoring-backed pixel parity check with that input
  supplied. The stub composition test does not replace it.
- Hexen: all **78 selected suite files attempted**, **248/248 reported checks**
  across 77 reporting suites. The command is **not all-pass**:
  `hexen2_catalogue_test.js` aborts before reporting tests on localhost
  `listen EPERM` in this sandbox.
- Maintained engine array: **35 suite files attempted**, **211/213 reported
  checks**, exit 1. `game_catalogue_test.js` aborts on localhost `listen EPERM`;
  `serve_py_test.js` is 0/2 because its server cannot start. These match the
  previously retained same-base sandbox failures. The suite array was read
  directly from `tools/distribution/engine-tests.mjs` and each named file was
  passed to `tools/run_tests.mjs`, repeating the exact 35-file command shown in
  the historical record. Optional Lava Man/LAN additions were not enabled.
- Final `git diff --check`: passed. Only the two production files, the HUD test,
  the new blood test and this document differ from the base. All test processes
  finished; Bluey reconciliation remains with the orchestrator.

The historical evidence remains intact in the next section.

To try after orchestrator integration, run the existing Newer HUD portrait and
vary health through the table above; also confirm powers, blink/death and water
look unchanged. The existing `tests/player_face_trial.html` offers the face
trial; the packaged-app owner trial remains separate from these unit tests.

## Historical verification: earlier partial increment (21 October 2026)

The following retained record describes the earlier unfinished helper increment,
not the current crossfade implementation or its completion status.

All commands ran from the FB worktree, with the Three module already installed;
no dependency install, build, distribution wrapper, hook, commit or staging ran.

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
node tools/run_tests.mjs tests/face_blood_test.js
node tools/run_tests.mjs tests/hud_face_combo_test.js
node tools/run_tests.mjs tests/face_state_test.js tests/face_game_test.js tests/player_face_preload_test.js tests/face_v44_state_test.js tests/face_v44_readiness_test.js
node tools/run_tests.mjs tests/hexen2_*_test.js
node tools/run_tests.mjs tests/game_catalogue_test.js tests/game_selection_test.js tests/desktop_prepare_test.js tests/game_shelf_test.js tests/local_play_test.js tests/net_window_test.js tests/window_play_native_test.js tests/serve_py_test.js tests/fog_test.js tests/skybox_test.js tests/options_order_test.js tests/blast_shake_test.js tests/newer_menu_scroll_test.js tests/addon_effects_guard_test.js tests/shambler_steps_test.js tests/hooks_test.js tests/drips_test.js tests/electric_native_test.js tests/electric_spatial_test.js tests/milkyway_sky_test.js tests/texture_q92_channels_test.js tests/in_web_test.js tests/in_web_capture_test.js tests/in_web_lifecycle_test.js tests/dof_test.js tests/footsteps_test.js tests/material_impacts_test.js tests/water_audio_test.js tests/native_sound_replacement_test.js tests/environment_sounds_test.js tests/player_events_audio_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js tests/ambient_sounds_test.js tests/sound_channel_steal_test.js
```

- Formula: RED 0/8, GREEN 8/8.
- Public HUD cache regression: RED 4/5, GREEN 5/5; the failure was the same-stage
  95→93 canvas identity, with time, expression and powers fixed.
- Face/state/readiness group: 23/26. State 10/10, game adapter 4/4, mocked preload
  3/3, blink/death 4/4. Readiness 2/5: real image loading still uses legacy
  `newer/hud/playerface/*.png` file URLs rather than the physical assets tree.
  One missing PNG rejects loading; both subsequent dry-completeness checks fail.
- Every Hexen suite attempted: **248/248 reported checks across 77 suites**, but
  command exits 1: `hexen2_catalogue_test.js` aborts before registering results
  because this sandbox refuses `listen 127.0.0.1` (`EPERM`). This is not an all-pass.
- Maintained engine array (35 suites, copied from `engine-tests.mjs`): **211/213**,
  exit 1. `game_catalogue_test.js` also aborts on `listen EPERM`; `serve_py_test.js`
  fails 0/2 because its local server cannot start. Other reported checks pass.
  Optional environment-dependent Lava Man/LAN additions were not enabled.
- `git diff --check`: passed.

Baseline verification retained repository contents unchanged. A temporary Node
loader `/tmp/quaked-fb-base-loader.mjs` substitutes the exact original
`face_state.js` and `sbar.js` bytes from `git show
6b34f3475b53e0bad718f0e07c2a3cad86802e8e:<path>` at their original module URLs;
all other sources are unchanged from that commit. These commands reproduce the
same failures on the base implementation:

```sh
NODE_OPTIONS=--import=/tmp/quaked-fb-base-loader.mjs node tools/run_tests.mjs tests/face_v44_readiness_test.js
NODE_OPTIONS=--import=/tmp/quaked-fb-base-loader.mjs node tools/run_tests.mjs tests/serve_py_test.js tests/hexen2_catalogue_test.js
NODE_OPTIONS=--import=/tmp/quaked-fb-base-loader.mjs node tools/run_tests.mjs tests/game_catalogue_test.js
```

Base readiness is also 2/5 with the same three failing test names (the first
missing PNG can vary with image decoding order). Base Python server is 0/2;
both base catalogue suites abort with the same localhost `EPERM`. Candidate logs
are `/tmp/quaked-fb-face-check.log`, `/tmp/quaked-fb-hexen-base.log` (candidate,
name retained), `/tmp/quaked-fb-engine.log`; corresponding base logs are
`/tmp/quaked-fb-readiness-base.log`, `/tmp/quaked-fb-network-base.log` and
`/tmp/quaked-fb-game-catalogue-base.log`.

Independent read-only planning and partial-code review found no defects in the
formula or cache change; it explicitly records that rendered opacity is still
unimplemented and that the face's existing health pipeline rounds percentages.

Integration must run the authoring-backed `face_v44_composition_test.js` if the
renderer changes; it was not run here because the slim checkout excludes its
supplied HTML/authoring input. `face_v44_startup_test.js` was not run; the
startup pack and asset manifest have not been changed. The compositor
has not been changed in this partial increment. No visual app trial or owner
acceptance is claimed. The remaining work is the chosen decal mapping,
compositor use of the helper, public draw alpha tests and independent final
review; this package is **incomplete**, retained for the owner/orchestrator.
