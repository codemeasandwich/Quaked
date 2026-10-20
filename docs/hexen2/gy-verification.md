# GY verification — 20 October 2026

Uncommitted candidate on `u/gy`, base `1c188cbfd331294290f27d3bf0233f0a663c57a3`.
Source/test hashes: [gy-candidate.json](gy-candidate.json). Contracts, independent
review and exact owner trial: [gy-gyro.md](gy-gyro.md). Recorded check names and
failure diagnostics: [gy-evidence.txt](gy-evidence.txt).

| Check | Result |
| --- | --- |
| Final input/options/menu group, 35 suites | **120/120 passed**, exit 0 |
| New gyro JavaScript checks within that group | **26/26 passed** (13 HID, 9 independent integration, 3 filter, 1 desktop adapter) |
| All 78 Hexen II suites | **248/248 registered checks passed**; one additional suite failed to load, exit 1 |
| Maintained engine list, 35 suites | **211/212 registered checks passed**; one additional suite failed to load, exit 1 |
| Native arm64 `cargo build` | Passed |
| Native x86_64 `cargo build` | Passed |
| Native `cargo test` | **5 passed, 7 failed**, exit 101; both new gyro tests pass |
| Same native tests on untouched base snapshot | **3 passed, same 7 failed**, exit 101 |
| Public new-feature suites copied to untouched base | All four fail to import absent gyro modules, exit 1 (no registered tests, not behavioural RED claims) |
| Physical controller / phone / packaged runtime | **Not run; zero hardware verification** |

The Hexen failure is `tests/hexen2_catalogue_test.js`, before registration, when
`server.listen` is denied (`EPERM 127.0.0.1`). The engine failures are
`tests/game_catalogue_test.js` with the same setup error, and the registered
`tests/serve_py_test.js` range-response check (its Python server cannot bind).
All three fail in the base snapshot under this same sandbox. The original Cheats
suite also fails on base because its “last row” assumption predates Sky fog; its
retained replacement verifies the established Cheats row/action directly.

The seven native failures are unchanged pack tests: all panic at
`src-tauri/src/packs.rs:429` when a localhost listener is denied, before pack work:

- `packs::tests::a_corrupt_part_is_refused_and_nothing_unverified_is_kept`
- `packs::tests::a_part_longer_than_listed_is_refused`
- `packs::tests::a_read_only_source_part_is_used_without_downloading`
- `packs::tests::a_verified_part_is_not_downloaded_again`
- `packs::tests::an_asset_that_does_not_match_its_listed_hash_is_refused`
- `packs::tests::downloads_verifies_unpacks_and_then_works_offline`
- `packs::tests::only_the_parts_holding_missing_assets_are_downloaded`

No failed permission check was skipped or weakened. Normal full qualification
must be repeated by the integration owner in its authorised test environment.
The arm64/x86_64 builds compile both native targets; they do **not** certify a
packaged universal app, signing, distribution, release or real sensor operation.

## Commands and environment

`node_modules` was already present; no npm install or network dependency fetch ran.
Every JavaScript command used:

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
```

The final 35-suite command below is the exact argv expanded by the supervised
`node /private/tmp/gy-run-checks.mjs focused` invocation (120/120):

```sh
node tools/run_tests.mjs \
  tests/cheats_menu_test.js \
  tests/desktop_gyro_test.js \
  tests/desktop_prepare_test.js \
  tests/flashlight_native_touch_test.js \
  tests/gamepad_test.js \
  tests/gyro_hid_test.js \
  tests/gyro_integration_test.js \
  tests/gyro_test.js \
  tests/hexen2_input_native_test.js \
  tests/hexen2_input_test.js \
  tests/hexen2_menu_native_test.js \
  tests/hexen2_menu_shared_test.js \
  tests/hexen2_menu_skin_test.js \
  tests/hexen2_menu_vector_test.js \
  tests/in_web_capture_test.js \
  tests/in_web_lifecycle_test.js \
  tests/in_web_test.js \
  tests/main_menu_art_test.js \
  tests/menu_common_test.js \
  tests/menu_levelselect_test.js \
  tests/menu_main_test.js \
  tests/menu_multiplayer_test.js \
  tests/menu_options_test.js \
  tests/menu_save_test.js \
  tests/menu_test.js \
  tests/menu_webgl_test.js \
  tests/mp_menu_test.js \
  tests/newer_menu_scroll_test.js \
  tests/options_order_test.js \
  tests/pad_assign_test.js \
  tests/pad_window_test.js \
  tests/singleplayer_menu_test.js \
  tests/touch_layout_test.js \
  tests/trigger_touch_order_native_test.js \
  tests/visual_options_test.js
```

All Hexen suites (248 registered passes plus the catalogue setup error):

```sh
node tools/run_tests.mjs tests/hexen2_*_test.js
```

The exact maintained `suites` array from `tools/distribution/engine-tests.mjs`,
without its optional credential/owned-pack lanes (211/212 plus catalogue error):

```sh
node tools/run_tests.mjs \
  tests/game_catalogue_test.js \
  tests/game_selection_test.js \
  tests/desktop_prepare_test.js \
  tests/game_shelf_test.js \
  tests/local_play_test.js \
  tests/net_window_test.js \
  tests/window_play_native_test.js \
  tests/serve_py_test.js \
  tests/fog_test.js \
  tests/skybox_test.js \
  tests/options_order_test.js \
  tests/blast_shake_test.js \
  tests/newer_menu_scroll_test.js \
  tests/addon_effects_guard_test.js \
  tests/shambler_steps_test.js \
  tests/hooks_test.js \
  tests/drips_test.js \
  tests/electric_native_test.js \
  tests/electric_spatial_test.js \
  tests/milkyway_sky_test.js \
  tests/texture_q92_channels_test.js \
  tests/in_web_test.js \
  tests/in_web_capture_test.js \
  tests/in_web_lifecycle_test.js \
  tests/dof_test.js \
  tests/footsteps_test.js \
  tests/material_impacts_test.js \
  tests/water_audio_test.js \
  tests/native_sound_replacement_test.js \
  tests/environment_sounds_test.js \
  tests/player_events_audio_test.js \
  tests/face_demo_water_test.js \
  tests/face_water_entry_test.js \
  tests/ambient_sounds_test.js \
  tests/sound_channel_steal_test.js
```

Native commands, run serially in this worktree:

```sh
RUSTC_WRAPPER= CARGO_TARGET_DIR=/private/tmp/quaked-gy-target cargo build --offline --manifest-path src-tauri/Cargo.toml
RUSTC_WRAPPER= CARGO_TARGET_DIR=/private/tmp/quaked-gy-target cargo build --offline --target x86_64-apple-darwin --manifest-path src-tauri/Cargo.toml
RUSTC_WRAPPER= CARGO_TARGET_DIR=/private/tmp/quaked-gy-target cargo test --offline --manifest-path src-tauri/Cargo.toml
```

The first build attempt failed before compilation because the host's configured
`sccache` wrapper was denied by the sandbox. The successful commands above use
ordinary rustc, with no gate disabled. They leave all build outputs in the agent's
external temporary target directory. Warnings are existing unused pack/library
helpers. `Cargo.toml` and `Cargo.lock` are unchanged.

Base controls used a read-only Git archive of the named base's source, tests,
tools, package metadata, branding and `assets/layout.json` in
`/private/tmp/quaked-gy-base`, with only the new feature test files copied in for
the explicit missing-feature RED. No product source was changed in that snapshot.
Its ignored `dist/desktop` and `dist/desktop-assets` directories were created
empty, matching this slim worktree's native compile fixture; initial incomplete
snapshot attempts failed on those missing directories/layout and were not counted
as proof of the base's runtime failures. No owned game data was copied.

```sh
RUSTC_WRAPPER= CARGO_TARGET_DIR=/private/tmp/quaked-gy-target cargo test --offline --manifest-path /private/tmp/quaked-gy-base/src-tauri/Cargo.toml
cd /private/tmp/quaked-gy-base
QUAKED_THREE_MODULE=/Users/bri/worktrees/Quaked/hexen2-unified/gy/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_catalogue_test.js tests/game_catalogue_test.js tests/serve_py_test.js tests/cheats_menu_test.js
QUAKED_THREE_MODULE=/Users/bri/worktrees/Quaked/hexen2-unified/gy/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/gyro_test.js tests/gyro_hid_test.js tests/gyro_integration_test.js tests/desktop_gyro_test.js
```

The base-control JavaScript command returns 1/3 registered passes, with the two
catalogue setup errors, range-server failure and old Cheats navigation assertion.
The new-feature base command has four module-import failures, not skipped tests.

## Retained RED and intermediate runs

Each focused HID regression command was
`node tools/run_tests.mjs tests/gyro_hid_test.js`, with the environment above.
Captured outcomes: 5/7 (R3 byte and restore); 8/9 (open guard specifically removed
as a mutation check); 9/10 (deferred close); 10/11 (late permission); 11/12 (Switch
axis permutation); 11/13 (USB/Bluetooth output framing). Final HID is 13/13.
The independent public integration command was
`node tools/run_tests.mjs tests/gyro_integration_test.js`: remote population RED
8/9, GREEN 9/9. Early fixture-only failures are not treated as product RED.

Initial core 3/3; first five-suite input group 17/18 (old Options row count), then
21/21 including desktop prepare. Intermediate transport runs were 9/9, 18/18 and
14/14 at their then-current test inventories. Initial broad 32-suite group was
108/112; failures were the old Cheats navigation assumption, permission regression
loaded before its fix, Hexen final-row navigation and the intended added drawing
row. Final 35-suite group was 119/119 before adding the framing regression and
**120/120 after its fix**. Detailed retained failure messages and final test names
are in the evidence file; raw stdout/stderr remain at `/tmp/gy-*.txt`.

## Integration and remaining gates

No `git add`, commit, push, stash, reset, rebase, branch deletion, pre-commit hook,
`npm run test:distribution`, authoring or skin-identity campaign suite was run.
The user-requested Hexen *menu skin* suite reads native menu fixtures; it passed.
One initial broad filename selection also ran `normal_baker_inputs_test.js` (2/2),
which exercises synthetic image helpers/native palette input without authoring
assets or a bake; it is excluded from the final input-only group.

The integration orchestrator must run the normal staged app/distribution hook,
including `tests/distribution_contract_test.mjs`,
`tests/native_library_contract_test.mjs` and `tests/resource_layout_contract_test.mjs`
as selected by the maintained policy. No texture/skin-identity authoring suite is
affected by this input/menu-only change. Then perform the owner trial, including
ordinary shelf launch, all three controllers over USB/Bluetooth, both games, and
local-play pairing. No work was landed, deployed, released or owner-accepted.
Bluey reconciliation remains with the integration owner; no durable worker/job
handoff was submitted or claimed for this owner-run physical trial.

## Files changed or added

- `src-tauri/src/gyro.rs`
- `src-tauri/src/main.rs`
- `src/engine/client/menu.js`
- `src/engine/client/menu_common.js`
- `src/engine/client/menu_gyro.js`
- `src/engine/client/menu_hexen2_options.js`
- `src/engine/client/menu_options.js`
- `src/platform/desktop.js`
- `src/platform/gyro.js`
- `src/platform/gyro_hid.js`
- `src/platform/in_web.js`
- `src/platform/pad_share.js`
- `tests/cheats_menu_test.js`
- `tests/desktop_gyro_test.js`
- `tests/desktop_prepare_test.js`
- `tests/gyro_hid_test.js`
- `tests/gyro_integration_test.js`
- `tests/gyro_test.js`
- `tests/hexen2_menu_shared_test.js`
- `tests/hexen2_menu_skin_test.js`
- `tests/options_order_test.js`

Documentation/evidence additions: `docs/hexen2/gy-gyro.md`,
`docs/hexen2/gy-verification.md`, `docs/hexen2/gy-evidence.txt`,
`docs/hexen2/gy-candidate.json`.
