# Environmental fire and first sight of Shub sounds

Owner continuation, 18 October 2026: add `fire-Environmental.mp3` and
`firstSee_Shub.mp3` to the established copy/wire/verify/Dev-publication workflow.
The source MP3s are copied byte-for-byte, without re-encoding or moving the
originals; [assets.json](evidence/environment-sounds-2026-10-18/assets.json)
records source paths, byte lengths and SHA-256 identities.

## Existing architecture and the working increment

`CL_ParseStaticSound` already records map standing-sound positions in the bounded
`R_AmbientPlaces` registry independently of audio initialization. Read the
`ambience/fire1.wav` emitters from that registry, rather than inventing a
per-level ambience flag or depending on the renderer's frame-local torch list.
If a map has no placed fire sounds, at most the client's 128 static entities
provide `flame.mdl`/`flame2.mdl` fallback positions. A map with no source is silent.
Turning the torch visual effect off cannot remove an actual fire emitter.

One streamed fire deck follows the loudest source. Its existing Quake
`SND_Spatialize` inputs reuse the current sound listener, native distance
attenuation and stereo direction, using a proxy rather than acquiring or
altering a native channel. The range is 800 Quake units and the added gain is
capped at 0.3. An optional stereo panner routes through the existing SFX master
bus. Owner update, 19 October 2026: an admitted fire deck replaces native
`ambience/fire1.wav` through the shared pre-play admission boundary; Classic,
unsupported/blocked replacements and unrelated sounds keep native playback.
No new fire occlusion rule is introduced. See
[gameplay feedback](gameplay-feedback-2026-10-19.md).

Emitter scans occur at most ten times per game second, invalidated when the
existing registry version or static count changes. The existing registry bounds
fire positions to 256; the fallback examines at most 128 entities. Near/far
changes fade the level over a 0.2-second rise or 0.8-second fall. Multiple fires
never allocate additional media decks or add unlimited gain. This does not depend
on HUD visibility or whether the fire is in the camera's current frustum.

The first-Shub cue runs from the main rendered scene after aliases are placed
and before Bestiary discovery starts a new camera encounter. It excludes
reflection/environment captures; portal views do not invoke this observation.
Only a paired local client/server player can provide the living native identity:
`monster_oldone`/`monster_oldone_new`, positive health, no dead flag, and the
corresponding `oldone` model among the current client entities. Asset preload,
model presence alone, title demos and unpaired remote server state do not count.
The paired native player must also be living and not freed, even when client
health is stale. A paired local listen-server player is allowed; this adds no
gameplay authority.

Visibility reuses the Bestiary's existing drawn-mesh, current-pose bounds,
frustum intersection, on-screen centre, near/far range and eye-to-centre world
and transformed-brush-door line-of-sight checks. These checks were extracted
unchanged into `R_VisibleAliasBounds`, which both consumers now call. Existing
Bestiary discovery retains its own journal, creature-facing and eligibility
rules. Sound history is separate from the persistent journal, so an already
unlocked Shub can still produce the first-sight sound on a later map visit;
Shub need not face the player for the player to see her.

## Lifecycle and audio contract

`S_ObserveEnvironmentSounds` arms the Shub one-shot once per client/world epoch.
`S_UpdateEnvironmentSounds` runs from the host sound updates and plays it once.
Repeated frames, looking away/back and same-world audio stop/restart cannot
replay it. A new world or `CL_ClearState` resets this history. The cue does not
alter health, AI, camera controls, journal discoveries or save data.

Both tracks reuse `s_effectdeck.js`, the shared streamed SFX deck from the water
and player-event increments. There are at most two decks and one stereo panner,
with the existing AudioContext and SFX master bus; Sound Volume applies once and
Music Volume stays independent. Large tracks are streamed, not decoded into a
persistent runtime PCM buffer. `S_StopAllSounds`/`S_Shutdown` unload elements and
disconnect their context-bound nodes, while preserving same-world sight history.

Classic mode, demos, no fully signed-on game, death, intermission, pause,
menu/console, hidden page, mute and unavailable audio stop playback. A first-sight
notification suppressed by one of these states is not replayed unexpectedly
later. Media failures remain observable in `S_GetEnvironmentSoundsStatus` and do
not generate a play promise each frame. Pending play generations cannot revive a
stopped deck. A later genuine fire activation may re-arm a refused fire loop.

## Packaging and verification

Both runtime assets are explicit members of the web and desktop inventories,
using literal `new URL(..., import.meta.url)` calls through the existing package
resolver. Startup priority prevents eagerly evaluated URLs binding to the
bootstrap's silent placeholder while background packs are still pending.

Independent planning traced existing ambient emitters, the Quake spatializer,
Bestiary observation, camera/portal order and journal filtering before the
implementation. Independent tests exercise the actual static-sound parser,
spatializer, rendered Three geometry and public sound updates. Shub's native
identity is controlled fixture metadata: these tests do not claim an actual
played `end.bsp` boss encounter. The new tests passed 8/8 (four fire and four Shub visibility cases). Existing
water/player-event/hook/Bestiary native regressions passed 26/26, and updated
web/desktop pack contracts passed 8/8. Initial fixture failures and corrected
results are retained as byte-preserving gzip logs with SHA-256 identities. The
[independent review](evidence/environment-sounds-2026-10-18/review.md) records
proof limits. Existing Bestiary native tests verify that the shared visibility
extraction preserves its original discovery behavior.

The browser trial decoded the actual supplied fire and Shub MP3s (44.04 seconds
and 17.528 seconds, stereo/48kHz). A real fire media element, driven by a parsed
map sound and the native spatializer, reached gain 0.3 nearby and stopped at
zero after moving beyond range. It reported no page errors. The
[browser report](evidence/environment-sounds-2026-10-18/browser.json) retains
scope and diagnostic states. It does not claim subjective listening acceptance
or final on-screen Shub gameplay qualification.

To try: enter Newer Game with Sound Volume audible, approach an actual map torch
or fire pit, turn and walk away. The added fire layer should pan and fade with
distance, independently of the torch visual switch and Music Volume. On the
final map, look at a living Shub with a clear sightline: hear the supplied cue
once. Looking away/back must not replay it; an occluding wall/closed door must
not count as a sighting. Prior Bestiary discovery must not silence it.

## Coordination and publication ledger

Responsible owner: this Codex session. Continue in the clean existing
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup` worktree, branch
`codex/demo-water-sounds`, from Dev sound commit `a8ea38c7`. Existing unrelated
work and the earlier HUD branch remain preserved. No additional worktree or
provider worker was launched.

Bluey onboarding was read earlier in the session. A new supported identity call
still returned enrollment `storage_error`, correlation
`137d26cdd39c40358e4bf34329a16d6b`. No card assignment/update/completion or durable
worker execution is claimed. This session retains the obligation to reconcile
the appropriate sound card, scope and actual evidence when the shared board is
available; this document and local publication receipts retain the work meanwhile.

The required exact-index commit gate remains unchanged: distribution tests,
web/desktop builds, Rust and maintained engine tests, and the universal Mac app
build. At initial inspection free disk was 1.2GB; a later live check found 10GB,
so storage must be rechecked before launching that gate. Prior build/evidence
outputs are retained before replacement. Successful exact-tree build and Dev
publication receipts live in `dist/staged/verification`. A source document
alone does not claim commit/push success, release or owner acceptance.

Before the new gate, the prior player-event build and exact-tree receipt
`a6005756c8d2cbf343c0c234ca2b3118f82ae553` are retained at
`dist/retained-staged-a6005756c8d2cbf3`; the hook's replacement cannot erase those
receipts. The tracked snapshot is about 2.9GB. The full gate uses bundled Node
24.19.0 and the established shared Cargo target, without bypassing any checks.
