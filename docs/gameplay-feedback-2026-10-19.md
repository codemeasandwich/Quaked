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
