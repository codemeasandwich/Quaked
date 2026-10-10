# Paused at the owner's request

Owner went to bed and explicitly requested standing down until morning. Both session browser tabs were closed (gameplay tab4 and bounded GPU fixture tab5); in-app browser tab inventory returned empty. The Quaked Python HTTP server PID8902, serving this checkout on127.0.0.1:8013, was identified and stopped with SIGTERM. Port8013 has no listening process. Test processes finished; planning/review agents are idle. Nothing is scheduled to restart automatically.

Work is saved **uncommitted** in `/Users/bri/SOURCE/Quaked`, based on main at `c865b75`. Preserve all pending work, including the owner's original infographic and `rockfield-v1.0.0.html`. No push was requested for this increment.

## Current owner direction and implementation

Owner wants continuous, seeded virtual surface relief over whole outdoor cliffs and gentle ground, preserving texture images, polygon/UV data, silhouettes and collision. They explicitly selected **stronger**, then **MAX**, then **big and blocky**, using the second screenshot (2026-10-02 at21.37.45) as the desired shape.

Current cliff amplitude is0.8 field tiles (204.8 worldunits, the supplied lab's maximum); ground remains0.009 (2.304units). Current wall worker preset: featureSize3, blockiness1, warp0.18, fracture1.1, detail0.1. The optional blockiness branch adds broad nearly planar cellular faces and deep common fissures while default/explicit0 remain exactly source-identical. Field seeds depend on map/profile, never face/texture/tile; cliff coordinates `(0.8*x+0.6*y,z)/256` remain continuous across angled BSP facets, and ground uses worldXY/256.

Core, workers, streaming/cache, world charts and shader are `src/newer/assets/rockfield.js`, `src/newer/assets/rockfield_worker.js`, `src/newer/render/r_rockfield.js`, `src/newer/render/r_rocksurfaces.js`, `src/newer/render/r_rockshader.js`. Existing world batching/detail/deferred-lighting paths are integrated in gl_rsurf/gl_post/gl_rmain. Cache is96 R16F pages, two outstanding jobs/no queue, epoch cancellation, dynamic bounded hash probes; maximum cliff parallax uses40 layers and a four-page request halo. Setting `r_rockfield` is archived, default1;0 disables. Classic stays native.

G-buffer alpha MUST remain byte-safe: Rock writes`.51+.49*sunVisibility`; ordinary availablealpha1 and unavailable0 retain their existing meanings. Decoder uses `base.a>.5 ? clamp((base.a-.51)/.49,0,1) :1`, applying only direct-sun visibility. Earlier suggested alpha1..2 encoding was rejected because the actual attachment is unsigned byte. Actual sun direction drives height shadows. Source textures and geometry remain unchanged.

## Evidence already obtained

- Latest focused+regression run: **44/44 passed**, `docs/evidence/rockfield-tests-2026-10-02.txt`. Independent generator/runtime review:13/13, including source parity, block shape, real88 angled E1M1 edges, CPU+half-float seam slopes/gutters, cache/job bounds, collisions, cancellation, UV conversion and byte alpha compatibility.
- New shape isolation: flat high-crown samples5.29%→76.71%; largest connected crown49→1894samples; deep-cut samples426→2516 with only blockiness varied. Ground configuration remains original.
- Final bounded GPU fixture (`tests/rockfield_gpu_trial.html`) **PASS**, using a diagnostic sinusoidal height field at0.8 amplitude through actual material/HDR/upload paths: availablepixels38412 both draws, shadow-coded pixels776off (ordinary AAedges)→31158on, GLerror0, original geometry/UV/texturebytes unchanged. Two fixed draws; no game instance/animation loop. Do not require off shadow-code count0—MSAA edges can have alpha128..254.
- Actual gameplay shader compiled with no errors and streamed75–96pages. Earlier mild-preset full-resolution samples were about202/203ms and181/198ms off/on at1619×1712; these are noisy local frame-delivery samples, NOT maximum/block-preset performance qualification. Later attempts were interfered with by owner toggling/moving, so do not claim their speedup or shadow results as acceptance. Trial now disables controls/holds angles during its measurement.
- First GPU compile caught declaration-order issue; fixed by passing eyePosition to qrRockFrame instead of referring to later-declared vViewPosition inside its function.
- Final **big/blocky** owner appearance acceptance and a reliable performance sample remain pending. Do not claim visual equivalence to reference merely from tests.

## Resume only when owner returns

Restart the ordinary existing server from this checkout with `python3 -m http.server 8013 --bind 127.0.0.1`. Open only one real gameplay trial at `http://localhost:8013/tests/rockfield_gameplay_trial.html`. It starts ordinary E1M1 and positions the player in collision-checked open air at `[128,1008,-199.95]`, with trial-only godmode/notarget. Native player hull confirmed that `[240,740,24]` is SOLID, so do not reuse it: engine will return the player to spawn. Trial waits for replacement server edicts and spawned client before setup; **Outdoor entrance** button repositions if needed. **Relief on/off** compares only the procedural layer. No music-volume change is queued.

The final profile was loaded into the existing gameplay tab before shutdown, but no final screenshot was saved or owner acceptance received after the big/blocky change. Continue by visually assessing that profile with the owner, preserving underlying geometry/texture identity. The implementation/limits are documented in `docs/continuous-rockfield-2026-10-02.md`.

## Resumed 2026-10-03

Owner explicitly said `continue`. Local port8013 and one real gameplay tab were reopened. The embedded preview retained an old child script even after reload; server/source hashes matched. A temporary server at `/private/tmp/quaked-preview-server.py` now gives each launch a consistent versioned module graph and no-store code responses, preserving ordinary asset caching and leaving source imports unchanged on disk. This is the active preview process; use `lsof -nP -iTCP:8013 -sTCP:LISTEN` to identify it before shutdown. Restart with `python3 /private/tmp/quaked-preview-server.py` while that file exists. No extra game instances were opened.

Trial controls now keep diagnostics collapsed, report friendly readiness text and offer **Cliff close-up**. Once genuinely fresh maximum code was visible, a steep-face texture-stretch artifact was found and recorded in `docs/images/rockfield-max-before-projection-guard-2026-10-03.jpg`. The smallest projection guard caps the pre-march view amplitude at0.18, retains the ray's actual intersection for UVs/height/shading, and leaves full0.8 height for normals/AO/sun rays. The visible stretch is substantially reduced in the same close-up; corrected capture is `docs/images/rockfield-max-projection-guard-2026-10-03.jpg`. This is explicitly compressed view parallax, not physically full0.8 view displacement. Independent13/13 checks passed at this snapshot. The main gameplay tab remains the owner's live trial; visual acceptance is still the owner's decision.

Latest resumed verification:44/44 full focused/regression checks,13/13 independent checks. Saved live GPU result and implementation hashes under `docs/evidence/rockfield-*-2026-10-03.*`. Actual game GLerror0 and authored-light shadow-channel changes verified; one fixed-resolution sample cost about4.2%. The server and one marked gameplay tab are running for the owner. No commit/push.

## Owner cave correction

Owner explicitly clarified ALL natural rock, including tunnel/cave roofs, rock floors and overhangs. The former sky/orientation exclusions were incorrect and removed. Material identity now controls eligibility; bedrock stays maximum regardless of normal. Visually audited construction exceptions (`wgrnd1_5/1_6`, `wswamp1_4/2_1/2_2`, ammo-crate rock0sid/rock1sid/rockettop) stay excluded. Roots/moss soil and loose aggregate retain subtle relief.

The old `(0.8*x+0.6*y,z)` projection collapsed on horizontal roofs and some real slopes. Replaced by one shared orthonormal oblique pair:U=[.48399890,-.87506860,0],V=[.27837972,.15397133,.94804935]. All rock orientations use the same map+wall seed and these axes, never per-face reseeding. Audit over21 bundled BSPs finds3028 eligible worldfaces (2360bedrock,668terrain), including319 roofs/238 floors/73slopes; minimum bedrock projection area.0393991, no collapsed supported faces. E1M1 has199 tested shared rockedges,38roof/11floor/2slopefaces. Current test output `rockfield-cave-tests-2026-10-03.txt`:45/45, independent14/14.

Trial supports `pos=x,y,z&angles=pitch,yaw,roll` to return to a saved inspection point after code refresh. Added **Look at roof**, while **Outdoor entrance** still returns to the original safe default point. Source textures, nativeUVs, collision and silhouettes remain unchanged.

Covered-roof live comparison saved: on/off JPEGs and `rockfield-cave-live-2026-10-03.json`, no errors,96resident/0pending. Existing flashlight is on forinspection (Ftoggles); singlemarkedtab remains at `[592,984,-343.969]` beneath uwall1_2roof withreliefenabled. No commit/push.
