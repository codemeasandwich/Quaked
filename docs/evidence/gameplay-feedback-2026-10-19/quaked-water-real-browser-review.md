# Independent actual-browser water audio proof

Final Chrome 154.0.8037.98 source-fixture result: PASS 11/11. Trusted click: True. No page errors, console errors or failed responses.

Real HTMLAudioElement media and the engine-created AudioContext are used throughout. The Audio constructor/play/pause wrappers forward to the native endpoints. The createMediaElementSource/connect wrapper records the native node and gain; it never substitutes them. Passive native analyzer branches observe the existing master bus and the underwater deck gain without an extra context, audible output or disconnection.

Context: {'state': 'running', 'sampleRate': 48000, 'baseLatency': 0.005333333333333333, 'outputLatency': 0, 'constructor': 'AudioContext', 'masterGain': 1}. All four streams readyState4. Dry master and underwater PCM RMS were exactly0; only underwater was running at zero gain. Its full recording had naturally advanced beyond0.35s before the dive.

Actual first nonzero PCM (>1e-6 RMS): underwater 5.5ms, master 5.5ms. Underwater gain changed0→1 in the synchronous public update; media count4, bed playcount1, seekcount0 and native media currentTime were unchanged across that call. Surface gain changed1→0 synchronously; actual PCM settled at exact0 by 9.70ms, allowing the real render/analyzer window. The silent full recording continued advancing. Pause stopped all media immediately and remained silent.

The entry and filling cues are also real, so the underwater-specific analyzer independently establishes attribution; the master trace alone would mix them.

Scope: actual source-module/browser media PCM in a controlled synthetic BSP plane fixture. Headless Chrome default audio output is muted. This does not establish speaker latency, listening quality, native WebKit behavior, a played map, a rebuilt installed app, owner acceptance or qualified delivery. No existing app/profile was opened; every isolated Chromium process was closed.

Command: `node /private/tmp/quaked-water-real-browser.mjs` (isolated Chrome temporary profile; escalation needed for native process launch).

Preserved earlier trials: `quaked-water-real-browser-initial.*`, `quaked-water-real-browser-repeat.*`, `quaked-water-real-browser-before-favicon.*` under /private/tmp. The initial first launch failed under sandbox SIGABRT; escalation enabled the authorized isolated process. Earlier successful trials had only a missing favicon404; final fixture supplies a data favicon. Final actual onset5.5ms is reported, rather than choosing the fastest repeat.

Only repository files authored by this task: tests/water_audio_browser_trial.html and .js. No production source, Git refs/index, builds or existing CPU evidence changed.

## Frozen evidence

- tests/water_audio_browser_trial.html: SHA256 c9bc04e97808eb706f9f63d67c32e45a3c465271e755f3cb93e99827c0855464
- tests/water_audio_browser_trial.js: SHA256 8e1e11a85e1d1005fb147560e6fb2bd3cc5ea43fbd07058baa0e20e0fb4b78b1
- /private/tmp/quaked-water-real-browser.mjs: SHA256 fce08c1f3f7e8dfa6a24dc2084940cd92d340651989024ca9c452bb62f0ee246
- /private/tmp/quaked-water-real-browser.json: SHA256 f11ff48e441f0d82a62f11044f4eea2b10c79fcdcfb40b3664497c29fae84703
- /private/tmp/quaked-water-real-browser.png: SHA256 32ddc356e501c98f943ac6a0ff4b365e388b3ab42c5a0398b9c253d0b02248be

Runtime fetched module/audio hashes are recorded in final JSON result.sourceHashes and bind the actual served code and four original MP3 files.
