# Rend the Veil source review — 7 October 2026

Review scope: the current uncommitted working-tree implementation in `/Users/bri/SOURCE/Quaked`, based on HEAD `907d5cdeca72392a78aa1ce938ad3db148c6dd3a`. Source reads and hashes were refreshed after the owner-rejected trial, doubled-size/darker-palette repair and coverage-driven MRT albedo correction on 7 October 2026; the exact current hashes are below. This is an independent review of the root agent's visual adapters. This reviewer authored the native/server bridge and snapshot wiring; independent native public-interface testing therefore belongs to the separate test agent, not to this receipt.

## Assessment

The reviewed source preserves the supplied reference's timing, existing native creature, lifetime identity, arrival frame, shader layering, body protection and resource ownership. Previously identified adapter defects have source fixes in this snapshot: reciprocal local connection identity, native cached render clock, material reset/rebinding, per-frame ghost geometry, fixed arrival frame and scale, shadow reveal/displacement, transparent MRT preservation and full active-field optics processing. No render callback activates a monster.

**No unresolved source defect remains in the reviewed contracts.** The previously omitted destination light now enters native deferred selection and dynamic shadow capture with a finite reference-scaled reach. The owner rejected the preceding trial for effect size and excessive brightness. Fresh doubled-size/darker-palette GPU verification and renewed owner appearance acceptance remain separate and pending. Native attenuation is an explicit host adaptation; this receipt does not claim identical Three.js photometry or pixel equivalence.

## Reference and extraction

The owner supplied `quaked-rend-the-veil-v1.0.0.html`; the preserved copy and `/Users/bri/Downloads/quaked-rend-the-veil-v1.0.0.html` both hash to `8258cd66ba4a0633e32795ce8a20d6f2cb108167d747906442568657c7583e33`.

Read-only extraction comparison initially confirmed that config, timeline, effect frame, shared GLSL, glyph data, optics shader and local-effects bodies differed from the embedded module bodies only by local module headers and import/export packaging. The later owner steering adds the explicitly reviewed black-to-purple palette/blending overrides, then the doubled local-effect frame, darker non-rune output and removal of the optical emissive Focus flash; the other listed extracted bodies remain unchanged apart from packaging. The material binding has bounded host adaptations: native MRT writes, ghost sun-layer exclusion, resetting a per-frame native selected material to its bound clone, following current native geometry, and lifecycle/introspection helpers. The supplied procedural geometry, runes, particle paths, fields and matched reveal/unwind remain reused.

The canonical profile reaches Appearance at 0.5 seconds, complete opaque material at 1.5, Focus at 2.5 and effect completion at 2.8. The renderer samples this pure timeline. The server obtains Focus/completion from the same locked profile through `rend_veil_state.js`; it does not await visibility, shader readiness or a render callback.

## Reviewed contracts

- Native arrival: `SV_RunTriggerTouch` observes a named stock `teleport_touch` and an alive native monster. Completed native transfer to the actual receiver creates the finite record. Original targets, fog/sound, destination, telefrags, collision and damage remain native. Generic `setorigin` and proximity fog are not activation authority.
- Local boundary: the active stock single-player Newer connection must be a reciprocal loopback pair attached to the real server client/player. Remote connections, demos, unrelated active servers and disabled contexts do not supply holds or cached native records.
- Server lifetime: the normal physics dispatch gates after force-retouch; `SV_RunThink` also retains its pending native think during the hold. The first Focus tick resumes normal overdue thinking. Death, free/reuse, model changes and disabled contexts retire the record. Bounded saved metadata and `clearFields` prevent stale slot state.
- Existing body: the current native alias mesh/posed geometry and selected face material are reused. Binding clones materials, composes the existing shader callback and shares model textures/geometry. Per-frame selected material changes rebind; ghosts follow current geometry. Focus disposes the temporary body binding and restores the original material before Remnants end.
- Arrival identity/frame: entries invalidate changed record identity. A weak per-entity/record frame cache retains the destination frame through PVS loss or selected-material rebinding. The recorded native origin is transformed through the parent frame. The retained native body frame remains 1× for reconstruction and shadow masking, while its 2× copy supplies local geometry, optics, particle units and light reach. Subject bounds produced in body-canonical coordinates are transformed by `FXInverse * bodyFrame`, placing their actual physical extent into FX-canonical space without doubling the protected body. Remnants remain at the arrival rather than following the activated monster.
- Shadows: `R_CreateShadowCaptureMaterial` patches the existing broad sun, near sun, point and flashlight capture materials. Borrowed caster clones identify their original native mesh. Reveal/coating clocks participate in existing frozen point-capture qualification. Non-Rend objects reset uniforms to neutral identity. Visual ghosts disable the native sun layer and do not masquerade as physical casters.
- Receivers: non-rune transparent layers and alias ghosts darken deferred albedo RGB through their ink coverage while preserving stored alpha/class tags and normal/depth/height packets. Rune layers retain their original additive path and zero receiver writes. Opaque native actors retain normal/albedo/height contracts; the bound coating and ink-black appearance edge also affect deferred albedo, preventing bright direct lights from restoring the uncoated base appearance or an emissive edge.
- Optics: all active native fields use the existing two-target sequential pass. Its borrowed hardware depth, reference-coordinate volume and subject protection remain source-derived. Existing native lighting/bloom/exposure/display ownership is preserved. Renderer target, viewport, scissor, auto-clear and XR state restore through `finally`; no input is sampled while that same texture is the current output.
- Background capture: current native subjects, their ghosts and local VFX are hidden only for the borrowed environment capture. Visibility and renderer state restore in `finally`. The capture has matching MRT formats and conventional native hardware depth; actual GPU correctness still needs its own receipt.
- Cleanup: effect release restores/disposes owned material clones and returns local VFX to the existing pool. Clear disposes the pool and background target; post shutdown disposes the two optics targets/material/geometry. No model-owned skin texture or native posed geometry is disposed by the effect binding.
- Level snapshots: saved phase/pose freeze at `_rendVeilTime`; they do not invent a continuing server clock. A root-scene identity sibling avoids doubling the translated level-view offset. Main-view optics exclude snapshots. Runner/view disposal releases their visual bindings. Held monsters remain in level snapshots; only released actual followers discard prior-arrival remnants when parsed into another map.

## Owner-rejected trial, doubled effect and rune-only brightness exception

The owner rejected the preceding trial: the effect needed to be twice the incoming model size, brightness reduced, and previously white non-rune features made black while retaining the runes. The current source deliberately adapts the supplied palette and spatial frame under that later authority. Prior source/GPU passes are retained history, not acceptance of this revised candidate.

The effect frame is `bodyFrame * scale(2,2,2)` about the recorded destination foot. Native geometry, body reconstruction and matching shadow masks use the original cached body frame. Optics use the larger FX frame; protected subject bounds are correctly converted from body-canonical to FX-canonical coordinates. The native light's finite distance follows the larger retained scale, while its radiance is multiplied by 0.12 after each fresh source state update. This does not accumulate across repeated `Seen` calls because the source local update first recomputes the unattenuated intensity.

Reviewed palette changes darken swirls and alpha-blended particles/streaks; reduce ghost rim radiance; replace the assembled appearance edge with ink-black color plus the matching deferred-albedo attenuation; and remove the emissive optical Focus flash. Existing finite pool/ripple release and clock remain. Every currently extracted `SEAL_FRAGMENT`, `VEIL_FRAGMENT` and `PARTICLE_FRAGMENT` has balanced source braces; the earlier one-line comment swallowing failure remains described below. Source balance is not GPU compilation evidence.

The supplied glyph dataset contains exactly 1,326 vertices and 1,326 `aKind` values, all **0**, with matching kinds at each line-segment pair. Its unchanged SHA-256 is `68c07477102b3456b56b8efbc8428c1395dd221d2a8d2cea8a1694bb43ff6bea`. There are no kind-1/2 ring/knot primitives in this tailored data. The new kind-based dark-ring geometry/material clone would therefore draw nothing; review identified that dead overhead and the root removed the clone and split entirely. Exact read-only string comparison confirmed the actual `GLYPH_VERTEX` and `GLYPH_FRAGMENT` still match the supplied reference. `GlyphSystem` retains its original geometry, uniforms, additive blending and shader construction.

The non-rune circles needing recoloring are in the ground seal canvas. Its generation now marks circle/binding strokes in opaque red and rune-letter strokes in opaque green. Drawing paths, stroke widths, seed/RNG calls, positions, chipped-chalk erasure and alpha recipe remain source-derived. The seal fragment uses the green mask for original rune color and the red/non-green mark coverage for subdued black-purple circle color. This is a color-classification adaptation; no independent pixel-level alpha equivalence test was run by this reviewer.

A required source failure was found during the first palette pass: adding a `//` comment in the one-line `VEIL_FRAGMENT` swallowed the remaining `vec3 c`, output assignment and closing GLSL brace. The root corrected it to a terminated block comment before reloading. Readback confirms the complete output/brace remains active code. No pre-repair file hash was recorded; this is retained as an observed failed source edit, not a GPU compile claim or fabricated candidate hash.

The local-effect pool now contains only its real source nodes. Each pooled instance owns unique glyph, veil and particle geometries/materials; the canvas seal texture is shared and disposed once by pool disposal. No unused cloned ring geometry/material remains. Release removes/hides the instance, while clear disposes the pool and owned resources. Model geometry/textures remain borrowed.

The initial doubled/darker GPU trial confirmed the earlier review risk: floor circles were re-lit by original floor albedo and stayed too bright. This is a retained required failure, not deferred debt. The root added the bounded existing-MRT repair below and is reloading a fresh candidate; this reviewer did not launch that GPU trial. Source math is reviewed, but corrected floor-ring pixels and attachment readback remain actual runtime qualifications.

`cl_tent.js` describes teleport spots as legacy visual data, and `gl_rmain.js` removes its unused spot import. These changes leave native arrival/hold authority intact. Earlier corrected captures and retained `failed-viewport-1.80.*` files remain distinct evidence; preceding trial images do not qualify the current doubled/darker candidate. The root is reloading the current candidate before a new GPU trial. This reviewer did not launch a browser or execute tests.

## Coverage-driven MRT repair

The root's bounded repair keeps the existing four-attachment draw and shader/target budgets. Non-rune local materials use RGB blend factors `SrcAlpha / OneMinusSrcAlpha` and independent alpha factors `Zero / One`, all with additive equations. Each attachment's RGB factors use its own emitted alpha:

| Attachment | Emitted RGB / alpha | Resulting RGB | Stored alpha metadata |
| --- | --- | --- | --- |
| Scene color 0 | Authored color / visible alpha | Normal visible color-over-background | Destination alpha retained |
| Normal/depth 1 | Zero / zero | Destination normal RGB retained | Signed destination depth retained |
| Albedo/class 2 | Zero / ink coverage | Destination albedo RGB multiplied by `1 - coverage` | Destination receiver class/tag retained |
| Height packet 3 | Zero / zero | Destination height packet RGB retained | Destination height alpha retained |

Alpha output is `sourceAlpha * 0 + destinationAlpha * 1`; the albedo coverage is therefore used for RGB blending without overwriting its receiver tag. Coverage is clamped to `[0,1]`. This source equation is not a claim that this reviewer measured GPU attachments.

For the ground seal, the appended coverage is `gl_FragColor.a * (1 - marks.g)`. Full green rune pixels therefore keep the original floor albedo; red non-rune circles darken it under their visible opacity. Mixed antialiased/mipmap boundary pixels preserve proportionate rune coverage. The existing extracted dataset's only `varying float vAlpha` material is the supplied rune glyph shader, which is explicitly left on its original additive blending path with zero receiver outputs. No dead ring geometry is reintroduced.

Native alias ghosts use the same custom RGB/alpha blend separation and set albedo coverage from clamped `diffuseColor.a`, matching their current visible formation opacity. They retain zero normal and height outputs. Actual actor geometry, collision, body shadows and post-Focus material restoration remain unchanged.

Source inspection verified that the local shader insertion targets the final `main` closing brace, that `marks` remains in scope in the seal shader, and that declarations/main initializers precede all appended output writes. No line-comment swallow was found. The source paths are straight-alpha, and the changed blend settings are confined to the effect's owned transparent materials. Source comments must describe intentional albedo darkening rather than claim every receiver packet remains untouched.

## Destination-light repair and host adaptation

`local-effects.js` creates the reference's time-dependent violet `PointLight` at `(0,1.2,0)` with range 4.2. The initial native adaptation did not consume ordinary scene PointLights; that source review finding is now corrected.

`R_RendVeilLights()` exposes a stable current native entry light record with origin, color, intensity-derived power and `rendVeil:true`. `gl_post.js` feeds it into its existing `selectLights`/`consider` selection. On each acquisition, the actual Three light now receives `distance = 4.2 * retainedFrameScale`, matching the tailored reference runtime. Its native record reads that same `distance` rather than duplicating the calculation. Only Rend sources override receiver reach to this actual finite distance; other light families retain their prior range formula. The retained frame basis length is a positive native-world scale, so the Three light and deferred range use the same units; no texture or clock binding changed in this two-line consistency repair. After the owner-requested 0.12 radiance reduction, native `LIGHT_GAIN=5` is canceled once by the adapter's `intensity/5`, avoiding duplicate source-radiance gain. The record deliberately has `origin` rather than static-map `pos`, so existing dynamic shadow-source selection uses its finite range and live native caster path. No `cl_dlights` slot, new lighting budget or global brightness setting is used.

Reference Three.js inverse-square attenuation is adapted to Quaked's maintained finite native attenuation. This is a documented host-lighting difference requiring GPU appearance review, not an omitted light. Snapshot sources remain excluded from active main-level lighting, matching their frozen preview ownership. Source inspection confirmed zero-intensity/invisible/completed native entries stop contributing, while release/clear retire their records through the ordinary entry lifecycle. `R_RegisterGlow` was correctly not repurposed as a receiver-light API.

## Evidence and limits

Read-only source checks included native bytecode/lifecycle tracing, embedded-module extraction diffs, current shader/capture/caster paths, local connection pairing, and `git diff --check` over the scoped source. The separate test-agent log `/private/tmp/rend-veil-regression.txt` reports 40/40 passing: Rend native 5, model point shadows 9, flashlight world shadows 3, alias cache 4, enemy-face material 6, enemy-face native 11, seamless corpse restore 2. Its observed SHA-256 is `81c5d76bac76f4c0766e039ca98d57a3f3bd9d2659f899bff28e6d0b692883c9`. This reviewer read the receipt and did not run or independently reproduce those tests. The log alone does not bind every later renderer edit to a tested candidate.

No browser/runtime was launched by this reviewer. Source review is not shader compilation, GPU image equivalence, all-map behavior, owner acceptance, dev landing or release. The readable GPU fixture uses the actual E1M2 skill-2 `t143→t142` fiend closet, original walls and an inspection lighting curve; it is checked separately by the root agent. The earlier native `t53` fixture remains a distinct public-interface test. The separate recording-renderer state fixture and review receipts report 2/2 passing and verify the corrected logical-default-before-HDR-target restoration order on successful capture and an injected failure; this reviewer read those receipts rather than claiming their execution. They are not an enlargement of the 40/40 native/regression receipt. No additional structural/source defect was identified after the required repairs and dead-clone removal, subject to the fresh doubled/darker GPU trial, the black-overlay deferred-lighting check, and documented native attenuation/preview limits.

## Current candidate and test receipt qualification

The current source read covers the doubled FX/native-body frame separation, bounds and shadow transforms, darker non-rune shader outputs, rune-only source geometry, mask-based seal recoloring and pooled ownership. Source review finds no additional structural defect. The corrected appearance and metadata behavior of the coverage-driven MRT repair remain real pending GPU qualifications rather than an assumed pass. Owner acceptance and landing are pending; no release follows from this receipt.

The retained 42/42 suite and subsequent 2/2 capture recheck described earlier belong to prior candidates. The root has a fresh public 42-case suite underway for the latest owner steering. This source receipt does not relabel previous pass counts as fresh execution, and repeated capture checks do not create another two unique cases. Actual updated result files may be reconciled after execution. This reviewer did not execute them.

Current fixture and retained result hashes below identify observed files. They distinguish source review from execution, shader compilation, pixel proof and owner acceptance.

## Fidelity correction: supplied reveal restored, native coordinate fit

The owner challenged the invented spatial-hash dissolve. That adaptation was incorrect for the requested faithful source reuse and is rejected, not described as an original-source implementation. The root restored the supplied `rvField` radial/noisy field, body-only `RV_FRAGMENT_MASK`, original `RV_VERTEX_BIND`, original ghost formation-opacity curve and original optics `1 - subjectFront * uFocus` protection. Read-only comparison confirmed the vertex-bind and fragment-mask strings match the supplied tailored HTML. Owner-authorized dark colors and 2× local effects remain distinct from source reveal behavior.

The root's clean-body diagnosis identifies an actual native-input mismatch: the fiend's long posed geometry extends beyond the source radial radius when normalized only by height. Surface coordinates outside radius 2.55 clamp near `.997`, leaving large sections until near-complete progress. The current host adapter computes the maximum radius of actual posed vertices in body-canonical coordinates about the fixed source center `(0,2.3,0)`, then applies `s = min(1, 2.55 / maxRadius)` uniformly about that same center to the fragment anchor after the original vertex binding. Radius 2.55 is the supplied value, with no invented margin.

This is explicitly a **host coordinate adaptation**, not an unchanged renderer. For the fitted current pose, the Euclidean ball is convex, so keeping every actual triangle vertex within the authored radius also encloses triangle interiors. Actual native positions, ghost movement and surface displacement use their original matrices; the adapter modifies the anchor supplied to the preserved source field. Color/depth/point/sun/spot capture paths share the same fitting matrix, and non-Rend objects use identity. The adapter is uniform, so it does not distort the physical enemy or introduce a different radial field.

Fidelity limit: `vRVAnchor` also drives fragment coating-grain sampling, so its mapped sampling wavelength changes along with reveal coordinates. It is inaccurate to claim that only the mask is affected. The fit is currently computed when an entry is created, for that actual pose. Native damage/pain may change a pose during the hold; a later wider pose can exceed an initial fit unless the host updates it. This review therefore qualifies the spawn-pose fit and reports that counterexample; it does not claim an all-pose envelope or demand an unrelated redesign. Source preservation, fit correctness and actual visible reveal require separate evidence.

The independently approved grounding correction is separate: `SV_DropToFloor` reuses the stock 256-unit native hull trace and ground/link semantics; the QC builtin delegates to that helper. Eligible step monsters settle before the record/hold, flying/swimming flags retain authored destinations, and no-floor failure follows native physics without an ungrounded rite. Valid floor support clears vertical velocity for the hold and the saved record stores settled origin plus bounded optional `floorZ`. Body geometry retains its original frame; the 2× ground-effect frame uses actual support height. No generic `setorigin` interception or extra touch is added.

The prior invented-mask candidate and earlier 46-case/GPU receipts cannot qualify this latest fidelity/grounding candidate. Root-owned clean-body/full-effect comparisons and independent native/shader checks remain required. This reviewer made no production edits or runtime launch during this bounded fidelity review.

## Current source hashes

Hashes identify this working-tree snapshot, not a committed delivery. Refresh this receipt after any required source repair.

| File | SHA-256 |
| --- | --- |
| `tools/summoning_reference/quaked-rend-the-veil-v1.0.0.html` | `8258cd66ba4a0633e32795ce8a20d6f2cb108167d747906442568657c7583e33` |
| `tools/summoning_reference/provenance.json` | `c4543ec68c8a23f91ee74e452c7e043134b8e90fce161f16bbdcde029450f075` |
| `src/rend_veil/config.js` | `279c4687699517203fbeeec5e9ef541a315e8945bb9425f9851b8ad4e2f99e1a` |
| `src/rend_veil/timeline.js` | `120a6cd5054cb56c5dbfb9fab68f06f560976849b842b0ad16228926d6d6916a` |
| `src/rend_veil/frame.js` | `42187eb0b85426f04b4faca6fd156dc73d889bb3e36c261b2fd9a83f7ca9cf6b` |
| `src/rend_veil/shader-common.js` | `2b39165252fa9317ff64bbcb8def8999b7649b5c75d21a91f4a624950d7e8c71` |
| `src/rend_veil/glyph-data.js` | `68c07477102b3456b56b8efbc8428c1395dd221d2a8d2cea8a1694bb43ff6bea` |
| `src/rend_veil/optics-shader.js` | `3a9380b8b50f374d96d1fba3b69135bb7291c53ec947dea5ec84094f6889f96e` |
| `src/rend_veil/local-effects.js` | `14e1dd31ae729a10c4bd56ebcba2e59b92f6c128127d80de2bd97e5231e30517` |
| `src/rend_veil/material-binding.js` | `b3d75ec418a075c969f0595c7accf4fd78a5724f762ab59351e0bc1670ef6afd` |
| `src/rend_veil_state.js` | `28a6e32174ca7d4c2347ea6d02783410fc5f2c6f35477a873c63ea95bd19ae7b` |
| `src/r_rendveil.js` | `b9c712921a305ef93cc29c9f4052b1ee9ff9a4b186a842b7c65308c29162229b` |
| `src/r_rendveil_optics.js` | `6ce8d38d83096733f5a86c1b6d74e468040421d4e9eb6b8903488b16e7a92efc` |
| `src/gl_rmain.js` | `e0911f6d5869882f832cec1614d02f367aa2c6bf017b7d0914fd8ceea905f2b4` |
| `src/gl_post.js` | `11cc1863774239084c2c61e1785b17834f96a7c639033a0d5be8199a8f53cca1` |
| `src/r_pointshadows.js` | `cf72d6513b6540020c23d8b5c1f3142166a929f4ed6007a3d2175771e171e30a` |
| `src/sv_rendveil.js` | `cf8a1745f115b2de73566e88286d80f73c2759b40abd09308ddcedae200013b6` |
| `src/world.js` | `80cbabd0c759cb321982b0175d5af6bced6c2045afe3ae9a1ecb3f470f038b72` |
| `src/sv_phys.js` | `41e5870793f1aa928335272eeb3a355793ec05a74220f52aa24eff904931e3bc` |
| `src/progs.js` | `397b4026ee979bb310176d8f541dba6f4d67a9d7be216b21a138eea5416ebfd3` |
| `src/pr_edict.js` | `26ad6f22f8772efdf5b1a0b6c58fc196a8e761ff2ca24882a34a362f8eaf8041` |
| `src/cl_main.js` | `7bc900f482411264db0628559a0c20298f2de7ebfaa8e78974ad6d46328319eb` |
| `src/cl_parse.js` | `646590c95124328bb13cf2b82dec6261c1502b2ac4a60956d43c3419af06de03` |
| `src/r_levelents.js` | `e5487bf8a3d60eae7c6951160fe045c667f4106dcfdf0cb58651f12dd6632db3` |
| `src/r_levelview.js` | `c0aebb928f11da9b3b029e1a945f119c3f1ce0b3b2ff8729ea1a3620f1a6840f` |
| `src/sv_seamless.js` | `e9139c71973d60dc2b3b84c7c0176eb95a82104cc0b11370ebe80957ed383f5b` |
| `src/cl_tent.js` | `b89011c03e86d2b6ec81f4a3406d329b0e7b368e51b23dcd36d2295d118b2660` |
| `src/pr_cmds.js` | `80a3e138f9711e0ecd3ad7a2657f67bcf5412540e9b51fe8b19237b32b275da6` |

## Current fixture and retained receipt hashes

| File | SHA-256 |
| --- | --- |
| `tests/rend_veil_native_test.js` | `89375fc51b58b48ce6b6072daaf9d03d49e1a1d51bde57827f61b03559e0064d` |
| `tests/rend_veil_capture_state_test.js` | `5ca5b0a65ece7e9a8321d6a2415d736e7a116920524245a1a70e4f59eb5226a6` |
| `tests/rend_veil_gameplay_trial.js` | `061fdcaa51fc60bc0e123e4409c2926b429860a846f18ebfd8a884dd7125aa59` |
| `tests/rend_veil_gameplay_trial.html` | `5cfcf2cf200b7a92a58688194607df6baa6c4ad96831fb09d62c1b3be52260fd` |
| `tests/model_pointshadows_test.js` | `0425e6f4e8ce4e15009d8853d7679b539556554e38f3807c73bf1c4e8dfc1ff8` |
| `tests/flashlight_world_shadow_test.js` | `90025dd8f8554b97d6b8b126be24c0f20ea4db69c05a3ff655716d1b674fc6d7` |
| `tests/alias_mesh_cache_test.js` | `efa2787a4b2675f5402db54aadf708eda227cba00c7dfdb30e6e33a60e1fd7bd` |
| `tests/enemy_face_material_test.js` | `60c19224527fb8472433f32b61d67faae205a6a7ff5b357d607dca3d41498293` |
| `tests/enemy_face_native_test.js` | `156fb8478e78553e252f00624c4edc47b2e22506496cf54454b7e0665ec8e305` |
| `tests/seamless_corpse_restore_test.js` | `04e95b4c04f37a78abad1928767d08d6cd067528c346d5d3cff30336c41d4efa` |
| `tools/run_tests.mjs` | `8f2925437ee8dbe752f8787e0e75f47727793fea87c77420dc7698a97a2cdbbc` |
| `docs/evidence/rend-veil-regressions-2026-10-07.txt` | `9fd5836dfde5ba284e72b2d04c1c81ecbc756aad59931dea07e8cbc136ada4cb` |
| `docs/evidence/rend-veil-background-capture-tests-2026-10-07.txt` | `0aa454c59a0d4a19a121db52ad4c83fe1fb9a25b80be1831533784435ad051af` |
| `docs/evidence/rend-veil-background-capture-review-2026-10-07.md` | `e9ec8c2d64197f95af58b422678a1e7f6d6cd3346f67846153a20b1a2bcc3a7c` |

## Parent verification closure

The independent reviewer reported no source defect in the doubled/body-frame separation, ownership, rune isolation, or coverage/alpha blend math. The parent completed the remaining native GPU trial: five current-source phase frames, unchanged mesh scale, doubled FX scale, body material restoration at Focus and invocation retirement at completion. Fresh browser readiness completed with no pending/fallbacks, and console shader errors/warnings were absent since that load. Receipts and candidate hashes: `docs/evidence/rend-veil-double-ink-2026-10-07/manifest.json`. The final combined targeted suite passes 46/46. Actual per-attachment GPU buffer readback is not claimed; blend metadata invariants have independent public-material/shader and numerical checks. Earlier brighter trial was rejected; the revised trial remains available for owner acceptance. No Git landing or release is claimed. No production edits follow these verified candidate hashes.
