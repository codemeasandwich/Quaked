# Player face water and underwater sounds

Owner request, 18 October 2026: fix the player face not filling in the second
title demo; copy the four supplied water MP3s, play bubbles during filling,
loop underwater ambience, play entry once, and fade shallow-water walking in
quickly and out slowly when motion stops. Commit to Dev and push; this is not
production-release authority.

## Cause and chosen change

`R_FaceWater` previously required `!cls.demoplayback`, so every demo frame
explicitly disabled the overlay. Reuse the existing `FaceWaterState`, atlas,
masks, stage thresholds and drain animation. One read-only `CL_PlayerWater`
adapter supplies the HUD and per-host-frame sound update. Native single-player
still reads QC's actual `air_finished`; the adapter never writes health, air,
items, damage or movement. Remote native air remains unknown.

A recording has no `air_finished`. During demos the existing BSP lookup samples
the recorded view entity's feet, waist and eye (`origin + viewheight`). A
visual-only twelve-second estimate progresses while the head is submerged;
`waterEstimated` identifies it and `waterKnown` remains false. W1 appears on
entry, W10 at 90% air consumption (10.8 seconds), and surfacing reuses the
existing 50ms-per-stage drain. Suit, death, client clear, world/demo replacement
and time rewind discard the visual estimate. Repeated reads and paused game
time consume no extra air. Demo observations never borrow a running server's
air deadline and cannot cause drowning.

## Sound contract and ownership

`S_UpdatePlayerWater` runs from the existing host sound updates, even with the
HUD hidden. It reuses Quake's unlocked AudioContext and the existing SFX master
bus, applying Sound Volume once and remaining independent of Music Volume.
Stream the files through media elements; do not decode multi-second tracks
into permanent PCM buffers.

| Runtime asset | Behavior |
| --- | --- |
| `player-bubbles.mp3` | Loops during unsuited face filling, stops at W10 or surfacing. |
| `underwater.mp3` | Loops while the living player's head is in water. |
| `enter-underwater.mp3` | Plays once per entry, restarts from the beginning on a later entry. |
| `walking-in-water.mp3` | Loops with horizontal speed above 20 units/s, on ground in shallow water; 120ms linear fade in, 1.8s fade out after stopping. Leaving shallow water cancels the tail. |

The walking asset is a byte-identical copy of the owner's long filename. Exact
source names, byte counts and SHA-256 hashes are retained in
[evidence](evidence/player-water-2026-10-18/assets.json). All four assets are
explicitly included in both web and desktop inventories, using the existing
`new URL(..., import.meta.url)` packaging resolver. Water sounds have startup
priority so module-load URLs cannot bind permanently to background-data silence.

Death, disconnect, intermission, Classic mode, pause, hidden page, mute or an
unavailable audio context stop the effects immediately. Live menus/console also
stop them; the title demo is allowed while its menu is visible. Resuming a
paused/muted submersion does not replay entry. Pending `play()` promises cannot
start a duplicate per frame or resurrect playback after exit. `S_StopAllSounds`
and `S_Shutdown` pause/unload elements and disconnect their context-bound nodes.
Playback failures stay visible through `S_GetPlayerWaterStatus` and are not
retried on every active frame.

## Planning, checks and owner trial

An independent agent confirmed the demo exclusion before implementation and
specified tests at the demo parser/HUD and public sound-update interfaces. Its
independently authored suites are `tests/face_demo_water_test.js` and
`tests/water_audio_test.js`. Runtime/browser endpoints may be doubled for audio
lifecycle checks; actual game water decisions are exercised. These checks do
not establish an owner's listening acceptance or a packaged Mac release.

To try: run the normal development game, let title playback reach `demo2`, and
watch the Newer Game face while the recorded player enters water. It should
start at W1 and visibly fill; surfacing drains it. With Sound Volume audible,
listen for entry, bubbles during filling and the continuous underwater layer.
In a live Newer Game, walk through shallow water then stop: walking sound
should fade in quickly and finish its 1.8s tail. Music Volume should not change
these effects. Pause or mute to confirm immediate silence.

Verification: final targeted tests passed 26/26 established face/audio/low-health
checks, 14/14 native/demo/water-audio checks, 3/3 hook-boundary checks, and 8/8
web/desktop inventory and pack checks (51 distinct checks). The initial native
regressions and their corrected results are both retained as byte-preserving
gzip logs; `logs.json` records compressed and original SHA-256 identities. The production URL
transform bundles the actual runtime JavaScript in memory with zero warnings;
this does not build data packs or a Mac app.

An actual Chrome trial replayed demo2 through public parsing, relinked entities,
and composed installed face assets at W1, W6 and W10: times 31.6277s, 37.6408s
and 42.4628s, with 0%, 50.109% and 90.292% air consumed. All 270 images loaded
without face asset errors and all selected canvases were complete. Chrome also
decoded each actual copied MP3 successfully (34.377s bubbles, 22.073s underwater,
3.312s entry, 20.036s walking; stereo at 48kHz). The trial reported zero page
errors. [Screenshot](evidence/player-water-2026-10-18/demo2-water.png),
[browser result](evidence/player-water-2026-10-18/browser.json),
[bundle result](evidence/player-water-2026-10-18/bundle.json), and
[independent review](evidence/player-water-2026-10-18/review.md) retain the scope
and evidence limits. Decoding and policy checks do not claim owner listening
acceptance or a fully packaged gameplay trial.

## Coordination and delivery ledger

Responsible owner for this increment: this Codex session. Bluey onboarding was
read and `agent_whoami`/`agent_inbox` attempted through the supported shell
bridge. Both returned `storage_error` during enrollment; a subsequent permitted
unsandboxed `agent_whoami` also failed (correlation
`d7acb8f31c97477b827a1a8f00b2b880`). No card assignment, update or completion is
claimed. Next coordination action: find/reconcile the existing HUD card
`T-dde52e7c` against this exact implementation and verification once Bluey
storage is available. No durable worker job was submitted or claimed running.

The main checkout contains unrelated changes. The clean existing HUD worktree
at `/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup` was reused from
`origin/Dev` as `codex/demo-water-sounds`; its prior
`codex/remove-old-hud-faces` branch and commit `f60eee3d` remain preserved.
Additional worktree creation was refused by the configured WIP limit; no
worktree was deleted or limit changed. Release and owner acceptance remain
separate from the requested Dev publication.

The first publication attempt was held before invoking the enforced commit gate:
the checkout was about 7.5GB and free disk fell below 4GB. The owner then asked
"try now"; a fresh check found 24GB free. The working branch was fast-forwarded
to current `origin/Dev` (`4bef35da`) with the staged water change preserved.
The intervening Dev changes were texture assets and their ownership index.

`.githooks/pre-commit` invokes `tools/distribution/precommit.mjs`: the exact-index
snapshot, distribution tests, web/desktop builds, Rust tests, maintained engine
checks and universal Mac build remain enforced. The retry uses bundled Node
24.19.0. Successful gate evidence is retained in `dist/staged/staged-receipt.json`
and its verification directory; no commit or push is claimed by this source
document alone. Existing staged build outputs for tree
`baca02a9e8530b076a03964a1007249d3f820cf3` are retained by renaming them to
`dist/retained-staged-baca02a9e8530b07` before the hook, so its replacement does
not erase the previous HUD evidence. No other worktrees, app outputs or
verification records were deleted to make room.

A fresh Bluey identity attempt during the retry still returned `storage_error`
(correlation `0436629367a4435d9fb403236eef331c`); reconciliation remains an
explicit obligation of this session, not a claimed board update. After the
gate passes, the authorized publication is a normal, non-force push to Dev.
