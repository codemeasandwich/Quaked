# HT: reviewed Hexen II WORLD textures in the unified host

20 October 2026. Uncommitted candidate in `/Users/bri/worktrees/Quaked/hexen2-unified/ht`, based on
`78037c413fd982fe77d0ceb40661e1f880b5bb5d`. No stage, commit, build, landing, publication, release or owner acceptance.
The normative architecture was read from `/Users/bri/worktrees/Quaked/Dev/hexen2-unified/docs/hexen2/unified-host.md`.
The referenced `docs/per-game-packs-design-2026-10-13.md` is absent in this checkout; the existing
`docs/distribution.md`, `packs.mjs`, `manifest.mjs` and `build.mjs` establish the maintained packaging path used here.

## Delivered candidate

`tools/distribution/hexen2_textures.mjs` generates `assets/game/textures/hexen2/index.json` from the reviewed catalog.
It reads local authoring files when available, otherwise the unchanged `HEAD` Git blobs in this slim checkout.
It verifies catalog status, original PNG, retained master/tier receipts and review hashes; independently audits the
read-only owned BSPs/palette; checks native dimensions, palette, indexed and RGBA hashes; and copies each tier file
without resizing, decoding or re-encoding it. Only the native PNG is decoded, for identity validation. Repeating the
command preserves matching existing files and refuses to overwrite different bytes. `--check` performs no writes.

```sh
node tools/distribution/hexen2_textures.mjs
node tools/distribution/hexen2_textures.mjs --check
# Optional installed-library location (defaults to ~/quaked):
node tools/distribution/hexen2_textures.mjs --check --library /Users/bri/quaked
```

The output contains 47 native bindings, 46 names, 400 physical WebP files and 470 map bindings (40 shared master
packages). The payload is **34,465,242 bytes** (32.87 MiB), plus **282,521 bytes** of index/provenance. These measured
bytes differ from the brief's approximate 41 MB; every payload hash matches the catalog. Files are named by SHA-256,
so proven aliases reuse exactly the same bytes. No original game pixels, licensed BSP, palette or PAK was added.
The authoring catalog remains unchanged, including its historical pre-integration statement. This record and the
`runtimeHT` field in `progress.json` describe the separate runtime candidate.

Every binding is in `ordinaryVariants[name][nativeKey]`, with a matching `sources[name]` allowlist and no unguarded
base entry. Base/Portal edition does not choose the artwork. The two `rtex439` pictures are:

| Native ID | Runtime key | Read-only map occurrences |
| --- | --- | --- |
| `c081ae00828e2da9724ca8d772e934ebdc170fc6ffae63ff0280d6f55eac2f96` | `64x64:883910358fb6f407` | `romeric1`–`romeric5`, `romeric7`, `ravdm1` |
| `2880c270e3b99a91010e650e191d5280fb056cb400ef8f6be9d287ee50d8cef6` | `64x128:755462a58a3effa7` | `keep2`–`keep5` |

Keys use the existing `R_GlassTextureKey`, after the engine's WORLD conversion. `VID_SetPalette` clears palette
index 255; `GL_LoadTexture` makes it opaque black for these world textures, and the key restores split fullbright
RGB. Hashing the audit's palette-expanded PNG alone would be wrong for index 255. All 47 keys were verified through
real `VID_SetPalette` / `GL_LoadTexture` / `R_GlassTextureKey` calls; these originals contain no index-255 texels.
A retained synthetic 255/fullbright witness separately covers that edge case. This is engine-interface proof,
not the requested in-browser proof, which remains blocked below.

## Runtime and packaging changes

`src/newer/render/r_newertextures.js` retains existing plain-file and missing-tier fallback behaviour. An explicitly
null selected diffuse tier now means native pixels. The Hexen entries set `file.low: null`, with Mid/High pointing
to their reviewed diffuse WebPs. `normal.tiers.mid/high` each hold that tier's own height and XYZ channel files;
`R_TextureNormal` also supports tiered name-based `normals` recipes. Existing Quake recipes remain valid.
Dimension validation in the existing loader still requires height/XYZ maps to match the selected diffuse.

The frame path notices tier changes on the same model. It restores native pixels/relief before requesting the new
tier, and request tokens prevent obsolete asynchronous decodes from installing or settling readiness. Reversion
also invalidates pending upgrades, so an old Mid decode cannot undo Classic. Low restores the original image
object and removes enhanced relief. Classic twins keep native pixels. No module-global game-mode toggle was added.

`tools/distribution/packs.mjs` assigns the entire `newer/textures/hexen2/` namespace, including its index, to the
`hexen2` pack. Hexen base is rooted at `core`; demo inherits the Hexen pack; Portal already inherits base Hexen.
Thus base and demo need `core -> hexen2`, and Portal needs `core -> hexen2 -> hexen2-portals`. All editions share the
reviewed family payload (the demo also downloads unused reviewed maps). There is no edition-based art selection.
The existing `build.mjs` derives `gamePacks` through `PacksFor`, so no second pack manifest or build path was added.

The web's allowed `core/shareware/pak0` list excludes this pack. Its build records these assets as unshipped rather
than embedding their bytes. `manifest.mjs` already walks the texture tree, so no inventory change was needed.
Quake's texture index and baked game index are byte-identical to base. All **5,258 existing desktop inventory
paths** retain their previous classification; see `dist/verification/ht/quake-pack-parity.json` and
`base-unchanged.json`. A desktop artifact was not built in this slim package checkout; pack reachability is proven
through the public classifier and maintained pack tests, not a packaged-app trial.

## Independent review and public verification

The independent `ht_review` agent reviewed the plan before implementation and the final loader/pack diff. It
identified the native-255, native-Low, tier-switch and pending-reversion requirements. Its pending-reversion finding
was reproduced RED (5/6), fixed, and retained. Its final independent public run passed runtime/namespace/Q92
**19/19**, including 47 actual native upload/key comparisons; its additional existing Newer/source run reported
11/11 (one optional Scourge check returned early for absent data). No remaining blocking code findings were reported.
It confirmed the split demo's Classic draw uses material twins without re-entering the new frame reversion branch.

The initial new runtime suite was RED **0/4**, proving the missing registry, packaging and tier support. One initial
Classic assertion compared image wrappers rather than their native pixel data; it was corrected. The independent
pending-reversion regression was RED **5/6**. Failure logs are retained, not overwritten.

Exact local commands and results (Node 24.13.0; existing node_modules used, no install):

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
node tools/run_tests.mjs tests/hexen2_texture_runtime_test.js tests/newer_texture_namespace_test.js tests/texture_q92_channels_test.js tests/texture_identity_variants_test.js
# 28/28; green-focused-final.log
node tools/run_tests.mjs tests/hexen2_*_test.js tests/newer_*_test.js
# Final run: 273/273; hexen-newer-final.log. Earlier in-flight run retained the then-unfixed race: 272/273.
node tools/run_tests.mjs tests/startup_texture_prefetch_test.js tests/texture_sources_test.js tests/texture_source_builder_test.js
# 6/6, 2 runner skips: source-builder fixture needs absent resources/.
# One of the reported passes is an optional Scourge test that returns early for absent resources/hipnotic/pak0.pak.
node --test tests/packs_contract_test.mjs tests/pack_upload_contract_test.mjs
# 10/10; pack-tests.log
node --test tests/hexen2_texture_inventory_test.mjs
# 6/7; inventory-tests.log. Existing symlink-cleanup test fails ERR_FS_EISDIR at rmSync(link).
node tools/distribution/hexen2_textures.mjs --check
# 47 bindings, 46 names, 400 maps; all byte-exact. reproduce-final.log
```

The complete maintained `tools/distribution/engine-tests.mjs` default suites array was copied and run:

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js QUAKED_SHAREWARE_PAK='/Users/bri/quaked/Quake/pak0.pak' node tools/run_tests.mjs tests/game_catalogue_test.js tests/game_selection_test.js tests/desktop_prepare_test.js tests/game_shelf_test.js tests/local_play_test.js tests/net_window_test.js tests/window_play_native_test.js tests/serve_py_test.js tests/fog_test.js tests/skybox_test.js tests/options_order_test.js tests/blast_shake_test.js tests/newer_menu_scroll_test.js tests/addon_effects_guard_test.js tests/shambler_steps_test.js tests/hooks_test.js tests/drips_test.js tests/electric_native_test.js tests/electric_spatial_test.js tests/milkyway_sky_test.js tests/texture_q92_channels_test.js tests/in_web_test.js tests/in_web_capture_test.js tests/in_web_lifecycle_test.js tests/dof_test.js tests/footsteps_test.js tests/material_impacts_test.js tests/water_audio_test.js tests/native_sound_replacement_test.js tests/environment_sounds_test.js tests/player_events_audio_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js tests/ambient_sounds_test.js tests/sound_channel_steal_test.js
```

Runner total **211/212**, with `serve_py` failing to start its localhost server. `game_catalogue` additionally exits
at suite load with `listen EPERM` and produces no RESULT; it is not included in that denominator. This run is a
failure, not a green engine gate. These same failures occur using exact base versions of both changed executable
modules; all other involved source/test files are unchanged from base. The base source overlay and logs remain in
`dist/verification/ht/base-proof/`, `engine-blocked-base.log`, and `inventory-base.log`. The latter repeats the same
inventory **6/7** failure. Exact baseline reproduction commands:

```sh
NODE_OPTIONS="--import=$PWD/dist/verification/ht/base-proof/register.mjs" node --test tests/hexen2_texture_inventory_test.mjs
NODE_OPTIONS="--import=$PWD/dist/verification/ht/base-proof/register.mjs" QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js QUAKED_SHAREWARE_PAK='/Users/bri/quaked/Quake/pak0.pak' node tools/run_tests.mjs tests/game_catalogue_test.js tests/serve_py_test.js
```

`git diff --check` passed. No pre-commit hook, full distribution command, texture authoring/skin-identity tests,
Python tier-derivation suite or app build was run. The slim checkout omits `tools/texture_sheets/` and authoring
sources; no offline authoring code was changed. The integration orchestrator must run the full distribution and
staged app gates, including `tests/distribution_contract_test.mjs`; the recursive inventory now contains the Hexen
payload. No existing skin-identity/authoring suite was modified. An independent attempt to load
`level_texture_runtime_test.js` was blocked by absent canvas/`QUAKED_CANVAS_MODULE`; no pass is claimed.

## Browser trial still required

Actual attempted commands:

```sh
python3 tools/serve.py 8137 --game-root /Users/bri/quaked
# PermissionError: [Errno 1] Operation not permitted at localhost bind; server.log
node --input-type=module -e 'import {chromium} from "playwright-core"; const b=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--use-angle=metal"]}); console.log(await b.version()); await b.close();'
# Browser aborts during launch; chrome-launch.log
```

**Screenshots saved: zero. Screenshots inspected: none.** No Chrome/GPU appearance, browser native-key confirmation,
matching-material in-game relief, performance or owner trial is accepted by this candidate. There was no attempt
to bypass these native permission failures.

The read-only owned BSP scan found reviewed embedded textures in `demo1` (16), `keep1` (14), `village2` (16),
`tibet3` (17), and the duplicate-name maps above. Full map/name/key coverage is in
`dist/verification/ht/map-coverage.json`, and each index binding retains its map occurrences. These are embedded
texture observations, not screenshots or proof of a particular camera seeing them.

In a permission-enabled session, serve this checkout and visit:

- `http://127.0.0.1:8137/index.html?game=hexen2&class=paladin&autostart=1`
- `http://127.0.0.1:8137/index.html?game=hexen2-portals&class=paladin&autostart=1`

At a fixed view, set `r_hdr 1` and compare `r_texture_tier 0`, `1`, `2`, waiting for actual pending texture work to
settle each time. Compare `r_hdr 0` at the same view. Exercise `map romeric1` in base and `map keep2` in Portal to
compare the two `rtex439` identities, plus `map tibet3` for Portal materials. Save screenshots under
`dist/verification/ht/`. Read the actual in-browser native keys using the public modules, for example:

```js
const { cl } = await import('/src/engine/client/client.js');
const { R_GlassTextureKey, R_NewerTexturesStatus } = await import('/src/newer/render/r_newertextures.js');
console.table(cl.worldmodel.textures.filter(Boolean).map(t => ({name:t.name,key:R_GlassTextureKey(t.gl_texture)})));
console.log(R_NewerTexturesStatus(cl.worldmodel));
```

Compare several keys with the committed candidate index, inspect both tier dimensions and matching authored
height/XYZ data, and retain visual findings before owner acceptance. Independent tests do not substitute for this.

## Coordination and handoff

Bluey's supported whoami/checkpoint/inbox calls all returned `storage_error`, with correlation IDs
`aefd1387497c4ee3ab5d8db18f03baca`, `50cb1e6ad9c846bca7e461110d956bec`, and `660203cd6868490fbdb1e0784723403d`.
No board identity, task claim/update or completion was acknowledged. `progress.json.runtimeHT` retains the scope,
responsible owner and next action. The Bluey service owner must repair storage; the orchestrator then reconciles
this evidence with the existing card. No background worker, durable job or acceptance was claimed.

The orchestrator owns the remaining browser/native-permission trial, distribution/staged-build gates, integration,
card reconciliation and explicit owner acceptance. Preserve this uncommitted candidate, the earlier failed logs,
all source/master/review provenance and all pending authoring campaign obligations. This package registers only
the existing reviewed WORLD subset; it does not complete the whole texture campaign.

Changed files: `src/newer/render/r_newertextures.js`, `tools/distribution/packs.mjs`,
`docs/hexen2/textures/progress.json`. Added: this report, `tools/distribution/hexen2_textures.mjs`,
`tests/hexen2_texture_runtime_test.js`, `assets/game/textures/hexen2/index.json` and the 400 files enumerated in its
`provenance.files` object. Local verification files under `dist/verification/ht/` are ignored and must not be committed.
