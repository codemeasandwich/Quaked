# Independent review: environmental fire and first visible Shub

Reviewed 18 October 2026 in
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, branch
`codex/demo-water-sounds`, based on
`a8ea38c718991c3f8a551e8b41c79038657d6864`.

The reviewer independently planned the reuse and public-interface checks,
authored `tests/environment_sounds_test.js` and
`tests/shub_sound_visibility_test.js`, inspected the final implementation and
wrote this review. The coordinator implemented the production changes.

## Conclusion and scope

No outstanding blocking source findings. The implementation reuses the shared
streamed SFX deck, Quake's listener/spatializer, the existing parsed ambient
source registry and Bestiary's drawn-alias visibility predicate. It adds two
bounded media decks and no parallel mixer, gameplay timer or persistence scheme.
Source and targeted tests are ready for the maintained exact-index gate.

Fire is a conservative additional layer near actual placed emitters, not
universal level ambience. Existing native fire audio and all other channels
remain unchanged. The one streamed fire deck has an approximately 0.3 gain
ceiling, 800-unit attenuation radius, 0.2-second fade-in and 0.8-second fade-out.
The actual static-sound parser records `ambience/fire1.wav` positions even when
native output is unavailable. Only when no placed fire sounds exist does the
fallback inspect up to 128 valid static flame model slots. Neither route depends
on the torch effect rendering or its per-frame registry.

The emitter registry already caps one sound name at 256 positions. Scanning
reuses the existing spatializer through an independent proxy channel, never
allocating or stealing a native sound channel. Source density selects a loudest
source instead of summing gains. The 100ms game-time scan cache invalidates
immediately on registry version or static-count changes; new worlds reset its
source count, targets and clock. Normal pause/inactive gates stop media
immediately, separately from the active fade envelope.

Shub uses an actual rendered alias, living native identity and a clear current
camera-to-centre sightline. The supported original/awakened Old One class and
model combinations must belong to this paired local client/server world.
Listen-server local view is intentionally allowed; an arbitrary remote peer is
not. Main-scene observation occurs after aliases are placed and before Bestiary
presentation. Environment-map rendering skips it; portal rendering does not
call this observation site. The cue has its own per-world receipt, independent
of persistent Bestiary discovery, facing tests and book cooldowns. Audio
stop/restart alone retains that receipt; cleared client/new world rearms it.

The alias-visibility extraction preserves the previous Bestiary checks:
attached and visible mesh/ancestors, current animated geometry bounds, camera
frustum/centre/depth/range and existing BSP plus transformed brush-door trace.
Bestiary continues to supply its own scratch bounds/frustum and keeps its
existing discovery/facing/journal rules.

## Independently run verification

The final targeted run passed **8/8** in
`quaked-environment-independent-final.log` (the corrected predecessor also passed
8/8):

- **Fire 4/4:** actual `svc_spawnstaticsound` parsing; one streamed loop; near/far
  attenuation and stereo direction through the existing spatializer; no sound
  from level entry alone; torch rendering disabled; source caps; static-model
  fallback and placed-source precedence; SFX bus ownership; lifecycle silence;
  blocked playback without repeated requests; pending-play shutdown cleanup;
  new-world source/history reset.
- **Shub 4/4:** real Three scene/camera/mesh and native-edict metadata transport;
  already-known Bestiary entry and silent preload; hidden/out-of-view/dead/wrong
  identity negatives; actual BSP wall and transformed brush-door obstruction;
  demo/remote/unpaired/hidden scope rejection; one cue after a visible encounter;
  repeated observations and audio restart stay silent; a fresh world rearms.

The first targeted run was **4/8** because the controlled Shub fixture used
`ED_NewString` without initializing the native string table. The fixture now
initializes it through supported `PR_SetStringsData(new Uint8Array([0]))` before
allocating its metadata. No production change or weakened assertion was needed.
The initial log `quaked-environment-independent.log` is retained with the
corrected result.

The reviewer also inspected the coordinator's retained logs:
`quaked-environment-initial.log` passed **26/26** existing hook, water,
player-event and native Bestiary checks; `quaked-environment-distribution.log`
passed **8/8**, zero failures. The latter covers both runtime assets in web and
desktop inventories. Literal eager asset URLs and their startup-priority entries
were checked in source before the generic background-sound rule.

## Asset and browser proof

The reviewer independently read both current owner-supplied source files and
the runtime copies, verified byte equality and checked their byte lengths and
SHA-256 identities against `assets.json`. Both match without re-encoding:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `fire-Environmental.mp3` | 1409280 | `001ecbc81045b0084a09004a6be66b069a585bce7b2c541947b6180cc6e12a09` |
| `firstSee_Shub.mp3` | 560901 | `3f656409661468f99791a1a578d685f5705dd7ab3d3914dc63b66de7ef0cfad6` |

The reviewer read `browser.json`: Chrome decoded both real MP3s (fire 44.04s;
Shub approximately 17.528s). Its actual fire media loop was driven through the
public static-sound parser and existing spatializer, with near gain
approximately 0.3, far gain zero and no reported page errors. This is real codec
and fire parser/media evidence.

The Node audio endpoints are doubles. Shub's Node fixture uses controlled
native metadata and a box alias mesh with real geometry/frustum/collision
helpers; it does not load or execute actual Shub AI. Browser Shub evidence proves
MP3 decoding, not a played `end.bsp` first-sighting campaign. Neither evidence
set establishes subjective owner listening acceptance, final perceived mixing
or a complete final-level playthrough.

## Delivery limits

This review does not claim a successful full product build, commit, Dev push,
release or owner acceptance. Those require the coordinator's actual maintained
gate and publication receipts. This increment does not waive that gate, remove
prior evidence or expand gameplay authority. No additional broad tests are
required by this source review before the maintained gate runs.

## Final native player authority guard

After the initial review, the coordinator tightened the local Shub authority
guard to reject a freed player edict or actual native player health at/below
zero. The reviewer inspected that final guard and added both negative controls
while deliberately retaining stale client health of 100. Neither case consumes
the first-sighting receipt; restoring the actual living player permits the
legitimate observation. The final independent rerun passed **8/8** in
`quaked-environment-independent-final.log`. No other implementation changes
were introduced for this follow-up, and the source conclusion above remains
unchanged.
