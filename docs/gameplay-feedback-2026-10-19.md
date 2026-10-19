# Gameplay feedback — 19 October 2026

Owner scope: repair both-axis mouse aim (keyboard works in app and HTML), limit
generated footsteps to grunts/enforcers/ogres/knights/death knights, use the lowest
nonzero default DoF, exempt sky from DoF, raise faint native clouds over a dimmer,
more contrasted Milky Way, remove dive ambience startup delay, and replace native
cues when an enhanced sound is actually admitted. Baseline Dev fdeb5a25.

## Boundaries and implementation

- Browser capture is synchronized with the DOM on request/init/shutdown. The
  independent public lifecycle test reproduced stale capture after shutdown:
  actual pointerLockElement was null while the module reported locked, preventing
  every later request and dropping both axes. Initial-session controls proved
  angle math and keyboard dispatch still worked. The default mouse-look hold also survives a physical middle-button press/release; explicit `-mlook` remains functional. No native permission widening,
  per-frame forced look or saved-binding reset is introduced.
- Existing stride, floor, spatializer and free-channel budgets remain. Only the
  named human enemy model families generate footsteps; player/nonhuman models
  are excluded. Native game-owned footsteps continue to take precedence.
- DoF default becomes 0.05 (one menu step). The existing changed-default migration
  gets a fresh marker, preserving explicit per-user choices. Main depth-clear
  sky pixels are excluded both at the output center and as blur samples. World
  focus, held-gun exclusions, Classic and XR behavior are preserved. Neighbor
  rendering has its separate finite-depth composition and needs verification.
- Panorama grading is shared by live and neighbor sky materials: linear RGB to
  power 1.2, then exposure 0.72; native moving-cloud opacity rises from 0.012 to
  0.035. No source panorama, sky matching, world exposure, cloud mask or UV timing
  changes. Original sky and unknown/named skyboxes retain their existing path.
- All four water streams prepare while dry. The underwater ambient loop keeps
  running at zero gain in eligible dry gameplay, as the engine already does for
  native ambient channels. Submersion only unmutes that running loop; there is no
  entry fade, new decoder, timer or seek. Pause/hidden/menu/mute/death still stop
  cues. Source audio, its full loop and every selected electrical clip remain
  unchanged. For custom/remote live programs BSP geometry may classify water;
  native air is never fabricated, and breath estimation remains demo-only.
- One admission boundary in the existing sound mixer runs before native playback.
  An exact true means an existing owner admitted its custom cue. Dynamic native
  channels are not started, a matching former fallback is retired, and ordinary
  observers still receive the event once. Automatic channel zero remains independent: one contact never retires another. Static/ambient logical slots remain
  available for Classic and explicit replacement failure. Unmapped cues remain
  native. Electrical receipts, environment fire, underwater ambience, confirmed
  power/death cues and admitted material impacts use this boundary. The existing
  post-start observer API cannot prevent overlap, hence the pre-play extension.
  Hell Knight fire currently has no custom audio producer: its fireball enhancement
  is visual and the supplied long fire track belongs to placed ambience. No
  arbitrary long ambient clip is substituted for a short attack or impact.

## Coordination and verification ledger

Bluey identity/enrollment failed even with approved storage access:
529c154f92d24188a94307ea6b9d9918 (storage_error, mutationOutcome unknown,
automaticRetry false). No card mutation is claimed. This chat owns the work and
will retain local evidence and reconcile the existing card when storage recovers.
The other agent's untracked Hexen II inventory/artwork and the parked rock trial
remain outside this scope. Stage only the named gameplay changes and tests.

Independent planning identified the capture lifecycle defect, sound layering and
saved DoF default migration. Input baseline 2/3 passed with the new lifecycle
regression failing; DoF baseline 5/7 passed with new default/migration failing.
Human-footstep tests now pass 7/7; water preload regression initially failed.
Current next action: finish real browser audio and native app verification,
review the combined implementation, then run the maintained publication gate.
No app/browser owner acceptance or release is claimed by this implementation log.

## Mouse follow-up: owner still reports no movement

The owner reports neither mouse axis responds in app or HTML while keyboard
input works. The lifecycle correction in 33406751 is insufficient to close that
report; the earlier unit checks were not full-game input acceptance.

Independent full-game trials of source and the retained built HTML in fresh
Chrome use unmodified startup input settings and a real local e1m1 session.
Clicking acquires BODY pointer lock; trusted mouse movement changes both pitch
and yaw, and keyboard movement also works. This does not establish the owner's
saved settings or Safari behavior. The built Newer Game menu path also passes
after the real loading hold ends: pitch 0 to 4.62 and yaw 90 to 82.0459 under
trusted mouse movement, with advancing game time and keyboard response.

Independent native source review found a second, concrete capture defect:
WebKit checks `_webViewRequestPointerLock:` before the modern completion handler.
Registering both diverts requests into the legacy callback, followed by denial.
The legacy `_didAllowPointerLock` reply is absent from this machine's WKWebView.
Install only the modern handler; all supported macOS versions (14+) have it.
Reference: WebKit `UIProcess/Cocoa/UIDelegate.mm`, `requestPointerLock`.
An isolated real WKWebView trial reproduces denial before (legacy callback 1,
modern 0) and actual BODY lock grant after (modern 1, legacy 0). It uses public
JavaScript evaluation, not physical input, and mirrors the delegate methods
rather than linking Rust. A Rust regression exercises the actual production
registration helper against Objective-C's method table and real completion
block. The app's physical mouse movement still needs a native trial.

Headless Playwright WebKit denies capture with WrongDocumentError despite DOM
focus, while keyboard and game time advance. This is retained as a failed trial;
it does not prove the owner's Safari failure or justify a synthetic mouse-input
fallback. The observer logs raw events and real startup settings without setting
input coefficients, button state or private capture flags. An early Newer trial
ran while the game was still warming and is retained separately; its stationary
angles are not treated as a live input failure. Full receipts and the reproducible
isolated native helper are in the evidence inventory.

Bluey still fails identity enrollment with storage_error, correlation
518725770df043c1b6afc92898c32b97; no card update is claimed. This ledger retains
ownership and next action: finish public game capture trials, independent
review, exact-index gate and native trial before publishing the correction.

## Verified progress and failure handling

Independent source review corrected actual PCM acceptance, independent automatic
channels, recycled native actor lifetimes, death versus drowning-pain identities,
and a blocked silent prime retrying only on a genuine new dive. Synchronous media
play failures are visible immediately. Stream admission means a playback request
accepted by the existing deck, not a guarantee of future audibility: a later
asynchronous browser rejection is recorded/blocks that cue, with native fallback
on subsequent events (and the next mixer update for ambient/static loops). No
same-event asynchronous replay or acoustic-device guarantee is claimed.

Independent input checks pass 6/6 including the unchanged original sensitivity
regression. Independent audio checks pass 42/42 (human footsteps, water, impacts,
native admission and actual module mappings). DoF/sky CPU checks pass 20/20;
GPU checks pass 17/17 on Apple M2/ANGLE, including exact sky preservation and
positive world blur in the same pass, no sky-to-world tap leakage, visible native
cloud contribution and darker/higher-contrast panorama samples. GPU fixtures'
initial target/control mistakes remain retained as failed evidence, not passes.

The shared-target coordination message timed out, so no acknowledgement is
claimed. No other cargo/rustc/tauri process was observed during read-only inventory.
A copy-on-write clone of the existing 10 GB compiler cache is isolated at
`/private/tmp/quaked-feedback-20261019-target`; the final native gate will use that
owned target, leaving every other agent's mutable compiler output untouched.
Final gate/app/publication receipts will be retained under ignored dist outputs.

Real Chrome audio passed 11/11 with zero page/console/HTTP errors: underwater PCM
onset 5.5 ms after the dive, without a new play/seek or source time jump; surface
gain muted synchronously, PCM zero within 9.7 ms; pause stopped all real media.
The headless browser measures the existing effects bus, not physical speakers.
[Evidence inventory](evidence/gameplay-feedback-2026-10-19/manifest.json) binds
receipts, logs, screenshots and review. GPU and audio source hashes were compared
to the exact current files before staging. Next: immutable gate and native-app
input trial; only an exact-tree receipt will qualify the published candidate.
