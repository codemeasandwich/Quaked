# Rend the Veil — native monster-closet arrivals

This increment replaces the former `R_EntityTeleportFx` red/blue stretch with the owner's supplied Rend the Veil profile. It binds the existing alias monster, scene, camera, renderer, receiver buffers and post-processing. It never constructs a replacement monster or imports the reference page's preview creature or Three.js runtime.

## Owner contract and sources

The requested use is a monster transferred from a closet by a trigger. AI, movement and attacks resume on **Focus**, after the entire Unwind and before Remnants. Records belong to individual entity lifetimes; unrelated monsters never share an activation timer.

`tools/summoning_reference/provenance.json` retains hashes and both unchanged HTML references. The later `quaked-rend-the-veil-v1.0.0.html` supplies the locked integration profile, pure clock, frame, procedural local layers, radial reveal, material binding and linear optical shader. These production modules are extracted into `src/newer/render/rend_veil/`; embedded vendor runtime, demo mesh, mock activation bridge and standalone renderer are excluded. The original Forbidden Summoning source remains available for provenance.

| Interval | Native behavior | Visual behavior |
| --- | --- | --- |
| 0–0.5 s | Transferred monster held | Corruption, runes and gathering |
| 0.5–1.5 s | Held | Four silhouettes and noisy radial opaque reconstruction |
| 1.5–2.5 s | Held | Complete opaque body; linked curse and field unwind |
| 2.5 s | Focus releases hold | Restore original body materials; local snap/ripple |
| 2.5–2.8 s | Normal native physics/AI | Destination-local Remnants |
| ≥2.8 s | Normal native physics/AI | Retire only the invocation resources |

## Native authority and failure handling

`world.SV_RunTriggerTouch` wraps the existing stock `teleport_touch`. Stock QC continues to own target activation, destination selection, departure/destination fog, sound, ground flags and telefrags. Only a successful transfer of a living `monster_*` through a **named** stock trigger to a stock teleport destination starts a record. A before/after check verifies movement and the actual receiving position. Eligible walking monsters then settle with the same native hull trace as the QC `droptofloor` builtin before the hold starts. The shared `world.SV_DropToFloor` preserves stock builtin behavior; fly/swim arrivals retain their authored destination. A walking arrival with no support remains ordinary native physics rather than freezing in midair. Settled position and optional bounded `floorZ` are saved, and the ground seal uses that support height. Failed, dead and unnamed touches create no rite. A held monster cannot retrigger and restart its rite.

The current gameplay scope is a reciprocal paired local, one-player, stock-Quake connection in Newer Game. Classic, remote servers, demos, timedemos and other QC programs retain ordinary native teleport behavior. No packet-format extension is introduced. `SV_Physics` holds after force-retouch and before the monster's movement branch; `SV_RunThink` also guards public thinker execution. Collision, damage and telefrag semantics remain native. The due thinker is preserved and executes on the first physics tick at or after Focus; no render callback releases it.

A bounded versioned `_newer_rend_veil` save field retains start time, model and arrival origin. Malformed, dead, freed, recycled, model-changed or expired records retire. Both NQ and QW local client bridges copy the native record and clock. A renderer refresh cannot restart gameplay. Snapshot level views retain the saved pose/phase; their local effect geometry uses the translated view's actual world frame and is released with its view. Snapshots do not own or advance server activation clocks, and do not contribute global optical fields.

## Rendering and ownership

`r_rendveil` derives a uniformly scaled, right-handed body frame from the actual alias geometry's bounds and actor orientation. The owner requested the surrounding rite at twice the incoming model's size: a separate effect frame doubles all ritual geometry, particle paths and optical bounds while the native model, reconstruction and shadows retain the original body frame. Optical subject bounds explicitly convert from the body frame to the larger effect frame. The canonical +Y is native +Z; canonical +Z follows the native monster's forward direction. The original opaque material's face/skin and receiver hooks are retained in instance-owned clones. At Focus those clones and silhouettes are removed and the original materials restored. Ghost geometry follows the native mesh's current posed geometry. Rune layers preserve receiver packets. Black ink and silhouettes also darken deferred albedo RGB with their visible coverage, while separate zero/one alpha blending preserves signed depth, height visibility and receiver class tags. Seal rune letters are explicitly excluded from that albedo darkening. Visual layers never enter the native sun shadow layer. The curse coating also scales deferred actor albedo, so lighting respects Unwind.

The supplied seed-based ritual pool, inscription, two remaining glyph layers, 18 ribbons, particles and streaks are retained. Native world units only adapt scale. The destination light enters the existing native light selection and live shadow path. Its intensity is divided by native `LIGHT_GAIN=5` once, with finite reach `4.2 * frameScale`; native attenuation is retained rather than adding a second Three lighting pipeline. This is a documented radiance/attenuation adapter, not an identical inverse-square lighting claim.

Resources are pooled across invocation lifetimes and released on map cleanup. The reference's engraving is bounded by the 2.8-second invocation here rather than retained indefinitely on the level.

A scoped environment capture hides the arriving bodies, silhouettes and ritual layers, then draws the existing scene into a matching receiver target with hardware depth. Renderer target, viewport, scissor, automatic clearing and object visibility are restored even on failure. The optical helper uses the existing linear composite, native depth, environment depth, canonical actor bounds and a finite 24-step field. Two reusable color targets process simultaneous invocations sequentially. Existing bloom, grading, display conversion and HUD remain owned by the game. Actual point, spot and near-sun shadow overrides require the same radial mask/displacement and a time-dependent caster cache key; native packed depth/distance output is retained.

## Try the working increment

Serve the repository with its normal local HTTP server and open `http://127.0.0.1:8000/tests/rend_veil_gameplay_trial.html`. The page loads actual E1M2 and uses its shipped named `t143 → t142` fiend closet trigger on skill 2, `teleport_use`, and `teleport_touch`. Replay runs a native arrival. Continue gameplay resumes the actual server clock. Phase buttons deliberately pause/seek this test clock for visual inspection; they are fixture behavior, not production activation controls. Download frame and receipt captures after an actual screen draw.

The inspection uses original wall textures and an explicit mild display curve (`r_newdark 1`, `r_newbright 1.5`) while enhanced enemy skins, lighting, normals and water remain enabled. Production display defaults are unchanged. This avoids the pre-existing full wall-displacement readiness issue; it is not a qualified full-enhancement map-loader check. No loading gate is weakened.

## Verification and acceptance

Independent native tests live in `tests/rend_veil_native_test.js`. Browser receipts and source hashes are retained under `docs/evidence/`. Native physics/think timing, real QC transfer, unsupported scope, retrigger, save validation and cleanup must pass. Browser validation must show all phases on the actual monster with no shader errors, intact depth/receiver output and original body restoration. Source review is independent from public-interface tests. A local working trial does not imply owner acceptance, Git landing, or release; these remain distinct decisions.

### Owner palette correction

The owner requested swirls and other particles between black and purple, with glyphs unchanged. The veil ribbons now shade from ink black to purple. Seeded particles and streaks use subdued black-to-purple colors with normal alpha blending so black ink can darken the background; additive blending could only brighten it. Bright silhouette/reconstruction highlights are replaced by ink-black edges with dark purple contours, including matching deferred actor albedo. The emissive release flash is removed; the pool and ripple provide the dark release. The destination light runs at 12 percent of its authored radiance. Rune glyph geometry, glyph shader and glyph brightness remain exactly as supplied. The ground seal preserves its paths, chipping seed and alpha, using red/green mask channels to distinguish its circles from actual rune letters: surrounding circles become black/dark purple while rune letters keep their authored color and brightness. Body textures, timing and activation stay unchanged.

The earlier brighter working trial was explicitly rejected by the owner. This larger, darker revision supersedes it; acceptance of the revised trial remains pending.

### Current checks

The final combined native/alias/face/shadow/seamless and public renderer suite passes 46/46. Its independently authored public capture/frame/ink fixture contributes 6/6, including DPR2, offset logical viewports, render failure and recovery. GPU inspection found and corrected an HDR viewport restoration bug; failed and passing same-camera frames are retained separately. Phase captures and source hashes live in `docs/evidence/rend-veil-native-2026-10-07/manifest.json`; subsequent owner-directed palette/size revisions retain their own receipts, so earlier frames are not relabeled as final. They distinguish paused visual stages from a live native replay; the replay resumes native animation/physics after Focus and retires the rite. These checks qualify this local desktop working increment; full wall-displacement readiness, remote/multi-player, demos, XR and owner acceptance are not claimed.

Final larger/darker native frames and candidate hashes: `docs/evidence/rend-veil-double-ink-2026-10-07/manifest.json`. The prior bright trial and intermediate palette captures are retained as prior evidence. One prepared enemy-normal startup timeout recovered after an ordinary reload; no gate was bypassed. The revised fresh load completed with no pending art, water fallback, or shader error.

## Grounding and original reveal follow-up

The owner identified a missing/unclean model reveal and a drop at Focus. A temporary spatial hash dissolve was an invented adaptation and was rejected during review; it is removed. The current radial/noisy `rvField`, body/ghost mask, original ghost formation curve, post-posed vertex chunk, progress curve and optical `1 - subjectFront * uFocus` protection are directly compared with the supplied HTML. This is an opaque radial materialization, not a newly designed uniform-opacity fade. Approved dark colors and doubled surrounding FX remain separate overrides.

The native fiend is substantially longer than it is tall. Height-only input normalization left much of its surface outside the authored 2.55 radius, clamped near .997 until the final frame. A native `uRVRevealFromBody` input adapter fits the complete actual posed surface around the original `(0,2.3,0)` center into that radius. It changes reveal coordinates, not geometry, body scale, ghost movement, the source field algorithm or source timing. Body, depth/distance, point/spot and sun passes share the fit. The adapter refreshes on actual position-attribute identity/version changes, including pain poses; fragment coating sampling also follows the fitted coordinates.

Walking arrivals now stand on native collision support before materialization and keep the same Z through the actual Focus physics tick. Saved `floorZ` anchors the ritual plane independently of triangles that extend slightly below the collision hull. Native flying/swimming policies remain unchanged.

The trial adds `Model reveal only` and intermediate .7/.9/1.1/1.3 controls for comparing the bound source reveal independently of silhouettes, ritual geometry and optical occlusion. These are fixture diagnostics. Native runtime color/shadow behavior stays on the same implementation. Fresh receipts distinguish this follow-up from the earlier brighter or hovering trials.

## Commit verification

The owner authorized commit and push on 7 October 2026. The current grounding/reveal candidate was rechecked before staging: the combined targeted suite passes **52/52**, changed production JavaScript passes syntax checks, and `git diff --check` passes. Exact command, output and candidate source/test hashes are retained in `docs/evidence/rend-veil-commit-verification-2026-10-07.txt`. This records Git landing authority separately from the earlier visual trial acceptance and historical GPU frames; it does not relabel prior captures as a fresh grounding/reveal browser run. Unrelated owner texture/reference edits remain outside this commit.
