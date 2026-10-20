# MS: procedural MIDI music

Owner authority: package MS brief, 20 October 2026. Worktree `hexen2-unified/ms`, base `35a3973b`.
Scope: original SMF parser, procedural FM renderer, worker and the existing Hexen music selector. No dependencies,
sample banks, licensed data copies, shared bus changes, commits, full app builds or release.

Independent planning: `ms_review` read the selector and normative unified-host architecture before implementation.
Agreed sequence: public RED tests; bounded format 0/1 parser; pure offline stereo FM renderer and WAV encoder;
module worker; asynchronous MIDI fallback after pack and platform conversions; session cache with reset/race cleanup;
public GREEN and installed-data performance runs; independent code review and correction.

Contracts: preserve the synchronous conversion lookup, use the async resolver for MIDI, never render on a browser
frame, never transfer/detach mounted pack storage, and never let stale asynchronous work play or refill a reset cache.
Test parser timing/merge/status/bounds, synthesis controls/release/determinism, WAV encoding, conversion precedence,
worker lifecycle and cancellation through public interfaces. All generated URLs belong to the session and are revoked
on reset. The orchestrator owns integration, packaged trial and owner acceptance.

Coordination: Bluey identity/checkpoint returned `storage_error`, correlations `f512ec432eaa456ca8f1427eb51b4cf7` and
`50a5c8d0e4d74ce5a996c6578828eace`. No card ownership/update was acknowledged. This record retains the obligation;
MS implementer owns implementation/verification, orchestrator owns board reconciliation and integration.

Status: implementation and independent source review complete; browser/packaged acceptance, integration and release
remain unqualified. Final parser/FM-author evidence and exact commands are in
[MS verification and handoff](ms-verification.md). Concurrent-coordinator entries below retain their own run history.

Concurrent writer coordination (parser/FM author; logs prefixed `quaked-ms-root-`, 09:15 UTC): this session owns
`midi_smf.js`, `midi_fm.js`, `tests/midi_smf_test.js`, `tests/midi_fm_test.js`, `tests/midi_worker_test.js` and its
verification records. Please preserve these while reconciling the independently supplied selector, worker client,
packaging changes and `tests/hexen2_midi*`. The wrapper API reconciliation is retained. Independent planning/review
agent `ms_review` in this session has made no edits. Our full Hexen + pure MIDI + ambient music run is 239/239;
maintained engine-list run is active. The real worker entry matches direct renderer bytes in Node; browser launch
exits SIGABRT, so browser assertion is unverified. A null worker message defect was reproduced and fixed here in
`midi_render.js` (validate message and guard double settlement). Worker suite currently 3/4: browser launch alone
fails. The owner question about simultaneous writers remains unanswered; do not overwrite either implementation.
Snapshots of the supplied integration files are retained at `/private/tmp/quaked-ms-root-concurrent-files.json`.

Implementation update (MS coordinator, 20 October): original RED run `/tmp/ms-red.log` failed MIDI-only playback
(1/2 selector tests passed; parser module not yet present). Pure parser/FM modules subsequently appeared from a
concurrent writer with `MIDI_RenderFM` and split stereo arrays; these were retained and the Worker/selector adapted
to that API. The concurrent SMF test fixture contains four channel events, so its incorrect five-event expectation
was corrected. No existing work was deleted. Independent reviewer `ms_review` made no edits, identified the packaged
worker requirement and reproduced a source-await/reset cache contamination defect; the latter now has a retained
public regression. Render allocation is serialised; owned pack storage is copied only at the MIDI view boundary.

Current verification: focused selector/parser/worker suites 8/8; existing music source suite previously 4/4 and hub
native suite 5/5. First installed-data pass parsed/rendered/encoded 29 tracks (16 base, 10 Portal, 3 demo), 243–589 ms,
12.1–18.6 MB WAV per track; final maintained test measurements pending. Latest Bluey errors here are identity
`29e3a09201744ab6826514f54e504b9c` and checkpoint `4408d67b8ccd418cb1900ca2358205d6`; neither acknowledged a board
mutation. Responsible next owner remains this implementer for regression verification, then orchestrator for
independent integration review, board reconciliation, packaged build/trial and explicit owner acceptance.

Installed-data measurements (maintained owned-data test; parse + render + encode, single pass, milliseconds;
no licensed WAVs retained):

| Edition / PAK | Track | Duration s | Render ms | WAV bytes |
| --- | --- | ---: | ---: | ---: |
| base / pak0.pak | midi/casa1.mid | 184.167 | 410.5 | 16353796 |
| base / pak0.pak | midi/casa2.mid | 184.766 | 670.1 | 16406644 |
| base / pak0.pak | midi/egyp3.mid | 184 | 301.7 | 16339096 |
| base / pak1.pak | midi/casa3.mid | 182.6 | 301.5 | 16215616 |
| base / pak1.pak | midi/casa4.mid | 184 | 592.6 | 16339096 |
| base / pak1.pak | midi/casb1.mid | 184.687 | 404.9 | 16399648 |
| base / pak1.pak | midi/casb2.mid | 176.167 | 798.9 | 15648196 |
| base / pak1.pak | midi/casb3.mid | 181.332 | 275.4 | 16103736 |
| base / pak1.pak | midi/egyp1.mid | 178.285 | 574.4 | 15835044 |
| base / pak1.pak | midi/egyp2.mid | 191.999 | 601.3 | 17044572 |
| base / pak1.pak | midi/meso1.mid | 180 | 411 | 15986296 |
| base / pak1.pak | midi/meso2.mid | 191.996 | 632.3 | 17044384 |
| base / pak1.pak | midi/meso3.mid | 184.32 | 552 | 16367320 |
| base / pak1.pak | midi/roma1.mid | 192 | 565.7 | 17044696 |
| base / pak1.pak | midi/roma2.mid | 196.357 | 714.2 | 17429016 |
| base / pak1.pak | midi/roma3.mid | 184.612 | 1037 | 16393076 |
| portal / pak3.pak | midi/tulku1.mid | 192.16 | 940 | 17058808 |
| portal / pak3.pak | midi/tulku2.mid | 184.333 | 849.3 | 16368496 |
| portal / pak3.pak | midi/tulku3.mid | 188.16 | 793.4 | 16706008 |
| portal / pak3.pak | midi/tulku4.mid | 190.532 | 822.1 | 16915232 |
| portal / pak3.pak | midi/tulku5.mid | 210 | 548.9 | 18632296 |
| portal / pak3.pak | midi/tulku6.mid | 196 | 803.4 | 17397496 |
| portal / pak3.pak | midi/tulku7.mid | 136.036 | 587.1 | 12108712 |
| portal / pak3.pak | midi/tulku8.mid | 196 | 626.5 | 17397496 |
| portal / pak3.pak | midi/tulku9.mid | 192 | 1267.6 | 17044696 |
| portal / pak3.pak | midi/tulku10.mid | 180.618 | 317.4 | 16040760 |
| demo / pak0.pak | midi/casa1.mid | 184.167 | 405.8 | 16353796 |
| demo / pak0.pak | midi/casa2.mid | 184.766 | 559.4 | 16406644 |
| demo / pak0.pak | midi/egyp3.mid | 184 | 404.6 | 16339096 |

22050 Hz stereo 16-bit PCM uses 88,200 bytes/s plus the 44-byte header and a 1.25 s release tail.
A four-minute song produces 21,278,296 bytes; split Float32 working PCM is 42,556,504 bytes,
so one render peaks near 64 MB plus events, worker overhead and already cached Blob URLs. Only WAV URLs
are cached; PCM is released with the worker. All 16 base tracks cached cost 262950232 bytes;
all ten Portal tracks add 165670000 bytes. Reset revokes owned URLs and clears the cache.

Integration writer handoff (logs `/tmp/ms-*`; 09:18 UTC): acknowledged the parser/FM author's ledger entry above.
The current parser/FM modules and author-owned tests are preserved. The selector/packaging integration is finished;
no further product edits are planned here. The independent real-thread bundle test is separately named
`tests/ms_midi_worker_bundle_test.js` to avoid further file collisions. Current `midi_render.js` includes the other
writer's null-message validation and double-settlement guard; its latest worker suite passed 3/4, with only the
blocked browser launch failing. Please retain these contracts and this exact failure when integrating.

Final integration-writer checks (no app build, hook, distribution suite, commit, staging or push):

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
# RED: 1/2 selector assertions; parser import missing before implementation.
node tools/run_tests.mjs tests/hexen2_midi_music_test.js tests/hexen2_midi_test.js
# Installed tracks: 1/1 assertion, all 29 tracks; no skips.
node tools/run_tests.mjs tests/hexen2_midi_owned_test.js
# Broad regression: 244/245. All 72 Hexen suites passed 222/222 at this point.
# The sole failure is the new browser Worker assertion: Chrome aborts during launch.
node tools/run_tests.mjs tests/hexen2_*_test.js tests/midi_smf_test.js tests/midi_fm_test.js tests/midi_worker_test.js tests/ambient_music_test.js tests/audio_volume_test.js
# Latest focused tests, including the added real object-URL/revocation check and bundled worker: 33/33.
node tools/run_tests.mjs tests/hexen2_midi_test.js tests/hexen2_midi_music_test.js tests/midi_smf_test.js tests/midi_fm_test.js tests/ms_midi_worker_bundle_test.js tests/hexen2_music_source_test.js tests/audio_volume_test.js tests/ambient_music_test.js
# Latest author-owned Worker suite: 3/4; actual Node thread and malformed-message assertions pass.
node tools/run_tests.mjs tests/midi_worker_test.js
# Maintained unconditional suites array copied exactly from tools/distribution/engine-tests.mjs: 208/209.
node tools/run_tests.mjs tests/game_catalogue_test.js tests/game_selection_test.js tests/game_shelf_test.js tests/local_play_test.js tests/net_window_test.js tests/window_play_native_test.js tests/serve_py_test.js tests/fog_test.js tests/skybox_test.js tests/options_order_test.js tests/blast_shake_test.js tests/newer_menu_scroll_test.js tests/addon_effects_guard_test.js tests/shambler_steps_test.js tests/hooks_test.js tests/drips_test.js tests/electric_native_test.js tests/electric_spatial_test.js tests/milkyway_sky_test.js tests/texture_q92_channels_test.js tests/in_web_test.js tests/in_web_capture_test.js tests/in_web_lifecycle_test.js tests/dof_test.js tests/footsteps_test.js tests/material_impacts_test.js tests/water_audio_test.js tests/native_sound_replacement_test.js tests/environment_sounds_test.js tests/player_events_audio_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js tests/ambient_sounds_test.js tests/sound_channel_steal_test.js
# Whitespace check: passes.
git diff --check
```

`serve_py`'s only failure is `the server started`: localhost listening is denied in this sandbox. It was also
executed against exact `git show 35a3973b:...` versions of `tests/serve_py_test.js`, `tools/serve.py` and
`tools/resource_paths.py` in a disposable in-worktree fixture; it fails identically on that base. Fixture removed,
base output retained in `/tmp/ms-base-serve.log`. No pre-existing product failure was relabelled as a pass.
The new browser failure is not claimed pre-existing: local listen returns EPERM, Playwright's downloaded Chromium
is absent, and installed Chrome exits SIGABRT. Browser decode/playback, packaged trial, listening quality and
explicit owner acceptance remain open gates for the orchestrator. No authoring/skin suite is affected; the full
packaging contracts affected by `tools/distribution/build.mjs` must run in integration as instructed by the brief.

The standalone owned pass above ranged 275.4–1267.6 ms. The broad regression repeated every track under other
machine activity and still passed the 3000 ms limit (worst: demo egyp3, 2882.9 ms); raw output is retained in
`/tmp/ms-regression.log`. A separate four-minute stress trial, 15 sustained organ voices plus channel-10 percussion,
rendered and encoded in 2022.8 ms, 21,278,296 WAV bytes, 16 peak voices (`/tmp/ms-four-minute.log`). No WAV retained.

To try MIDI without modifying installed conversions, start a source-build Hexen session, unlock audio, then run in
its developer console (the packaged owner trial should use the integrated build):

```js
const pak = await import('/src/engine/common/pak.js');
const music = await import('/src/engine/client/hexen2_music.js');
await music.Hexen2_PlayMusicName('casa1', {
  find: path => path.startsWith('midi/') ? pak.COM_FindFile(path) : null,
  source: () => null
});
```

Expected: first play renders off-thread, returns `{ok:true, format:'wav'}`, then loops through the existing music bus;
repeat reuses the URL. Normal playback still chooses installed OGG first. This owner audition has not been performed
in this environment. The code is a verified local implementation trial, not qualified delivery, acceptance or release.

Final integration-writer inventory (all uncommitted; no index changes):

- `src/engine/client/hexen2_music.js`
- `tools/distribution/build.mjs`
- `docs/hexen2/ms-midi.md`
- `src/engine/sound/midi_fm.js`
- `src/engine/sound/midi_fm_worker.js`
- `src/engine/sound/midi_render.js`
- `src/engine/sound/midi_smf.js`
- `tests/hexen2_midi_music_test.js`
- `tests/hexen2_midi_owned_test.js`
- `tests/hexen2_midi_test.js`
- `tests/midi_fm_test.js`
- `tests/midi_smf_test.js`
- `tests/midi_worker_test.js`
- `tests/ms_midi_worker_bundle_test.js`

Implementation identity after the final 5/5 selector/bundle recheck and whitespace check:

```text
941327186d761d1b173f50acfb84663568b159222d12de9857f18656811d7bb1  src/engine/client/hexen2_music.js
7ee0211c7f072927e82c2ff09255ed4a8dd5c428c72667dc4837a2e5d51f405a  tools/distribution/build.mjs
299fc84ebecd63c0363c73d0777f0f412c5d7c754e06df45de0364d92b8f81e8  src/engine/sound/midi_fm.js
dca487f220dac44a0c7614da11b6f1e094b6db9a480251385f5c1b558a0580a4  src/engine/sound/midi_fm_worker.js
3d7f588e2e82625343acbda267a649bd1a80e3ee11d6cff8daaa8314ea987fe5  src/engine/sound/midi_render.js
426daa0bf780b6c6500292d7cbef1d778f66d6ab021ccf0414389d72912fd631  src/engine/sound/midi_smf.js
58c75d322edf855cd0ef83b378048b8e3bf7f15bfdbb0a6b5e350c5d102ed613  tests/hexen2_midi_music_test.js
008503e0649a240a537b65a5ee575dd2f947322d1c226d4880cf5acd50824fc5  tests/hexen2_midi_owned_test.js
14dbf329cd8ae265f05207fec09742d535e4c296b1183d2dd69ab155bb9a2219  tests/hexen2_midi_test.js
14d43551f266f59e85d45af003362d2cc4b64cf117b63434692f1609e9ac2cdf  tests/midi_fm_test.js
cdeb4b563302a2c7118cabf039e4be3801d3b9981f0d22de0ec81d1adc25645e  tests/midi_smf_test.js
87625b91846375bd93204d97f3239490f5e50496a2ce05b60b68df8ef550d244  tests/midi_worker_test.js
bc05557c1082a3fc28a5879077a504fa8a1576a8aaa600f6d6d710fa3a66dca7  tests/ms_midi_worker_bundle_test.js
```

These identify the local files reviewed here; the orchestrator must reconcile any later concurrent edits before
claiming the same evidence. Bluey remained unavailable; this ledger is the acknowledged local fallback, not a queued
worker or board receipt. No durable follow-up job was submitted; the existing orchestrator retains the explicit
packaged/browser and owner-acceptance obligations above.
