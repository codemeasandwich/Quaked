# MS verification and handoff, 20 October 2026

Implementation is ready for orchestrator integration review. Browser audio, packaged owner trial, landing and release
are **not qualified**. Work remains uncommitted in `/Users/bri/worktrees/Quaked/hexen2-unified/ms`, based on `35a3973b`.
See [the package design/coordination record](ms-midi.md). A simultaneous writer supplied the worker client, selector,
packaging wiring and complementary tests; these were preserved and reviewed together with this session's parser/FM
implementation. No licensed data or generated music was copied into the repository.

## Working behaviour and contracts

- SMF format 0/1, merged tempo maps, running status, length-prefixed metadata/sysex, EOT, TPQN and SMPTE
  (-24/-25/-29 at 30000/1001/-30). Parser bounds: 4 MiB, 256 tracks, 250,000 parsed events, 600 seconds.
- Original two-operator FM at 22,050 Hz stereo: 16 procedural GM family patches, velocity, ADSR, seeded percussion,
  volume/expression/pan/sustain, live ±2-semitone bend, FIFO overlapping notes, all-notes-off and all-sound-off.
  Default 48 voices; released then oldest voices are stolen. Smooth limiter bounds finite rendered samples.
- Pack OGG/MP3/WAV, then platform conversions, then native MIDI. The asynchronous resolver returns `format: 'wav'`.
  The synchronous conversion lookup retains its historical `midi-no-synth` sentinel until the async path is used.
- A module Worker renders browser MIDI; Node verification calls the same pure functions. No browser synchronous
  fallback. Transfer copies exactly the MIDI view, retaining mounted pack storage. Worker error, timeout and abort
  terminate the worker. Null-message regression is fixed; double settlement is guarded.
- Rendering is serial; per-stem Promise/WAV URL cache lasts until reset. Reset invalidates pending source/render
  results, aborts workers and revokes generated URLs. A failed render logs a diagnostic and remains unplayable.
  Quake and `cd_audio.js` are unchanged. The existing music bus owns looping, gain, pause and playback.

## Owner trial

On a MIDI-only Hexen II installation, load a level normally: its worldspawn music name now triggers rendering.
OGG installations continue to prefer their conversions. To force a trial without changing the read-only owned
installation, use browser DevTools on a running **source** Hexen II page (click the page first to unlock audio):

```js
const { COM_FindFile } = await import('/src/engine/common/pak.js');
const { CDAudio_Stop } = await import('/src/engine/sound/cd_audio.js');
const { Hexen2_PlayMusicName } = await import('/src/engine/client/hexen2_music.js');
CDAudio_Stop();
await Hexen2_PlayMusicName('casa1', {
  find: path => path.startsWith('midi/') ? COM_FindFile(path) : null,
  source: () => null
});
```

This trial recipe has not been executed here: Chrome exits SIGABRT at launch, before browser assertions. The
orchestrator/owner must confirm audible timbre, looping, pause, gain, worker startup and packaged asset URLs.
Original procedural patches are an FM approximation, not a sample-bank reproduction of the original soundtrack.

## Commands and results

All test commands used this existing dependency (no npm install or new dependency was needed):

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
```

Initial RED: `node tools/run_tests.mjs tests/hexen2_midi_music_test.js` returned **1/2**; MIDI-only stem returned
`midi-no-synth`. Initial parser/FM suite launch failed with `ERR_MODULE_NOT_FOUND` (modules did not yet exist;
**0/0 assertions**, not a passing test). A mistaken fixture expectation of five channel events was corrected to four.

Broad run:

```sh
node tools/run_tests.mjs tests/hexen2_*_test.js tests/midi_smf_test.js tests/midi_fm_test.js tests/ambient_music_test.js
```

**239/239 passed**; includes all 29 installed tracks. Log: `/private/tmp/quaked-ms-root-hexen-tests.log`.
A simultaneous writer subsequently added one URL-revocation test to the music suite; that final suite passed 4/4
in the focused run below. The broad run is reported at its actual historical count, not relabelled as 240.

Maintained engine array, copied from `tools/distribution/engine-tests.mjs`:

```sh
node tools/run_tests.mjs tests/game_catalogue_test.js tests/game_selection_test.js tests/game_shelf_test.js tests/local_play_test.js tests/net_window_test.js tests/window_play_native_test.js tests/serve_py_test.js tests/fog_test.js tests/skybox_test.js tests/options_order_test.js tests/blast_shake_test.js tests/newer_menu_scroll_test.js tests/addon_effects_guard_test.js tests/shambler_steps_test.js tests/hooks_test.js tests/drips_test.js tests/electric_native_test.js tests/electric_spatial_test.js tests/milkyway_sky_test.js tests/texture_q92_channels_test.js tests/in_web_test.js tests/in_web_capture_test.js tests/in_web_lifecycle_test.js tests/dof_test.js tests/footsteps_test.js tests/material_impacts_test.js tests/water_audio_test.js tests/native_sound_replacement_test.js tests/environment_sounds_test.js tests/player_events_audio_test.js tests/face_demo_water_test.js tests/face_water_entry_test.js tests/ambient_sounds_test.js tests/sound_channel_steal_test.js
```

**208/209 passed**. `serve_py_test.js` fails at "the server started" because Python cannot bind the loopback socket:
`PermissionError: [Errno 1] Operation not permitted`. Log: `/private/tmp/quaked-ms-root-engine-tests.log`.
Base proof: copied `tests/serve_py_test.js`, `tools/serve.py`, `tools/resource_paths.py`, `package.json` verbatim with
`git show 35a3973b:<path>` into `/private/tmp/quaked-ms-base-35a3973b-serve`; executed the unchanged public test with a
minimal Deno registration shim:

```sh
node /private/tmp/quaked-ms-base-35a3973b-serve/run.mjs
```

**0/1 on the base**, same assertion; direct base server launch also raises the same bind PermissionError.
Log: `/private/tmp/quaked-ms-root-serve-base.log`. No maintained gate was changed.

Final focused run after worker robustness fix and the extra URL-revocation regression:

```sh
node tools/run_tests.mjs tests/ms_midi_worker_bundle_test.js tests/midi_smf_test.js tests/midi_fm_test.js tests/hexen2_midi_music_test.js tests/hexen2_music_source_test.js
```

**18/18 passed**. Log: `/private/tmp/quaked-ms-root-final-focused.log`. This includes an in-memory esbuild IIFE worker,
real Node worker transport, source-buffer preservation, valid PCM/WAV and cache/URL cleanup. The fixed WAV/noise
fingerprint is FNV-1a `6e5a13cb`; bend endpoints, repeated keys and CC123 under sustain have retained public tests.

Worker robustness RED: **2/4**, with null-reply callback TypeError plus Chrome launch failure. After the fix:

```sh
node tools/run_tests.mjs tests/midi_worker_test.js
```

**3/4 passed**, **one environment failure**. Fake transport, actual module worker/direct-byte equality and malformed
reply rejection pass. Browser WAV decode assertion never runs: installed Chrome exits SIGABRT; the cached Chromium
headless shell also cannot launch. No browser success or audible acceptance is claimed.
Logs: `/private/tmp/quaked-ms-root-worker-null-red.log`, `/private/tmp/quaked-ms-root-worker-green.log`.

`git diff --check` passed. No full app build, pre-commit hook, `npm run test:distribution`, texture/skin identity suite,
git add, commit, push, stash, reset, rebase or branch deletion was performed by this session. The packaging change
requires the orchestrator's normal full distribution gate, especially `distribution_contract_test.mjs`,
`embedded_asset_contract_test.mjs` and `packs_contract_test.mjs`; texture authoring content is unaffected.

## Timings and memory

The installed-data public test reads only pack header/directory and MIDI ranges. Times include parse, render and
16-bit WAV encoding, excluding disk reads and worker startup. No generated licensed music is retained. During the
broad test run all 29 files met the unchanged 3000 ms bound. Earlier quieter measurements were 220–572 ms per file;
these broad-run numbers include competing local workload and are reported as measured.

| Edition / PAK | Track | Song seconds | Parse + render + WAV ms | WAV bytes |
| --- | --- | ---: | ---: | ---: |
| base / pak0.pak | midi/casa1.mid | 184.167 | 1205.7 | 16353796 |
| base / pak0.pak | midi/casa2.mid | 184.766 | 1803.4 | 16406644 |
| base / pak0.pak | midi/egyp3.mid | 184 | 681.7 | 16339096 |
| base / pak1.pak | midi/casa3.mid | 182.6 | 626.8 | 16215616 |
| base / pak1.pak | midi/casa4.mid | 184 | 1522.7 | 16339096 |
| base / pak1.pak | midi/casb1.mid | 184.687 | 839.1 | 16399648 |
| base / pak1.pak | midi/casb2.mid | 176.167 | 1313.5 | 15648196 |
| base / pak1.pak | midi/casb3.mid | 181.332 | 681.5 | 16103736 |
| base / pak1.pak | midi/egyp1.mid | 178.285 | 646 | 15835044 |
| base / pak1.pak | midi/egyp2.mid | 191.999 | 721.1 | 17044572 |
| base / pak1.pak | midi/meso1.mid | 180 | 410.4 | 15986296 |
| base / pak1.pak | midi/meso2.mid | 191.996 | 574.5 | 17044384 |
| base / pak1.pak | midi/meso3.mid | 184.32 | 836.3 | 16367320 |
| base / pak1.pak | midi/roma1.mid | 192 | 539.7 | 17044696 |
| base / pak1.pak | midi/roma2.mid | 196.357 | 888.4 | 17429016 |
| base / pak1.pak | midi/roma3.mid | 184.612 | 599.3 | 16393076 |
| portal / pak3.pak | midi/tulku1.mid | 192.16 | 799.3 | 17058808 |
| portal / pak3.pak | midi/tulku2.mid | 184.333 | 1357.1 | 16368496 |
| portal / pak3.pak | midi/tulku3.mid | 188.16 | 1647.8 | 16706008 |
| portal / pak3.pak | midi/tulku4.mid | 190.532 | 981 | 16915232 |
| portal / pak3.pak | midi/tulku5.mid | 210 | 1008.5 | 18632296 |
| portal / pak3.pak | midi/tulku6.mid | 196 | 1364.3 | 17397496 |
| portal / pak3.pak | midi/tulku7.mid | 136.036 | 718.5 | 12108712 |
| portal / pak3.pak | midi/tulku8.mid | 196 | 726.8 | 17397496 |
| portal / pak3.pak | midi/tulku9.mid | 192 | 1738 | 17044696 |
| portal / pak3.pak | midi/tulku10.mid | 180.618 | 1262.9 | 16040760 |
| demo / pak0.pak | midi/casa1.mid | 184.167 | 682.4 | 16353796 |
| demo / pak0.pak | midi/casa2.mid | 184.766 | 1587.8 | 16406644 |
| demo / pak0.pak | midi/egyp3.mid | 184 | 1249.6 | 16339096 |

A representative four-minute workload (base `egyp1.mid` events repeated and truncated at 240 s, 8,598 events,
44 peak voices) took **574.2 ms**. A serial stress workload of 48 permanently held voices for 240 s took
**2338.1 ms**, meeting the target. Its earlier concurrent run took **6372.9 ms** and failed the target; this failed
stress measurement is retained separately. No phase approximation or polyphony reduction was introduced to pass it.
Stress receipt: `/private/tmp/quaked-ms-root-stress-serial.json`.

Stereo PCM16 is 88,200 bytes/s, plus a 44-byte WAV header and 1.25 s release tail. Four minutes produces
**21,278,296 bytes WAV**, with **42,556,504 bytes** temporary stereo Float32 PCM: about **64 MB** combined, plus events,
worker/Blob overhead and previous cached URLs. Maximum accepted ten-minute track is about 159 MB combined.
Installed WAVs are 12,108,712–18,632,296 bytes; cache of all 16 base tracks is 262,950,232 bytes and all ten Portal
tracks add 165,670,000 bytes. Only WAV object URLs remain cached; worker PCM is released. Reset revokes the cache.

## Review, coordination and next owner

`ms_review` independently planned and reviewed pure modules and integration. Its final source readback found no
blocking defects and confirmed the malformed-message fix. Review performed no edits or test runs. Source/Node/thread
and bundle evidence supports implementation handoff; it does not establish browser, packaged-app or owner acceptance.

Bluey identity/checkpoint returned storage_error; exact correlations remain in ms-midi.md. No acknowledged card
assignment, progress mutation or durable worker execution is claimed. The orchestrator owns board reconciliation,
final stable-diff review across simultaneous writers, normal distribution gates, integration commit, packaged trial
and explicit owner acceptance. This is a visible handoff obligation, not a claim of queued background execution.

## Changed and added files

- `src/engine/client/hexen2_music.js`
- `src/engine/sound/midi_smf.js`
- `src/engine/sound/midi_fm.js`
- `src/engine/sound/midi_fm_worker.js`
- `src/engine/sound/midi_render.js`
- `tools/distribution/build.mjs`
- `tests/hexen2_midi_music_test.js`
- `tests/hexen2_midi_owned_test.js`
- `tests/hexen2_midi_test.js`
- `tests/midi_fm_test.js`
- `tests/midi_smf_test.js`
- `tests/midi_worker_test.js`
- `tests/ms_midi_worker_bundle_test.js`
- `docs/hexen2/ms-midi.md`
- `docs/hexen2/ms-verification.md`

Production-source SHA-256 at handoff preparation (recheck if concurrent edits occur):

```text
941327186d761d1b173f50acfb84663568b159222d12de9857f18656811d7bb1  src/engine/client/hexen2_music.js
426daa0bf780b6c6500292d7cbef1d778f66d6ab021ccf0414389d72912fd631  src/engine/sound/midi_smf.js
299fc84ebecd63c0363c73d0777f0f412c5d7c754e06df45de0364d92b8f81e8  src/engine/sound/midi_fm.js
dca487f220dac44a0c7614da11b6f1e094b6db9a480251385f5c1b558a0580a4  src/engine/sound/midi_fm_worker.js
3d7f588e2e82625343acbda267a649bd1a80e3ee11d6cff8daaa8314ea987fe5  src/engine/sound/midi_render.js
7ee0211c7f072927e82c2ff09255ed4a8dd5c428c72667dc4837a2e5d51f405a  tools/distribution/build.mjs
```
