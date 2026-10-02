# More visible water surfaces and undersides

Historical record: the owner corrected the near-field target after this increment. Current coefficients, probe lift and reflection verification are documented in [the near-field correction](water-nearfield-2026-10-02.md); older values/results below describe their original source snapshots.

Historical evidence for the first surface increment. The subsequent [concept-targeted water increment](water-concepts-2026-10-02.md) changes the grazing curve, material coverage, brown map defaults and reflected receiver lighting; use its final-source evidence for current values.

This local increment strengthens the surface through angle-dependent reflection, keeps perpendicular viewing clearer, calms still/Muddy ripples and raises received-light caustics by 25%. Underwater viewing gains a refractive window and internal-reflection boundary, stronger original-texture cues and source-dependent distance attenuation. It also corrects a misplaced E1M1 reflection probe and a duplicate fullscreen contents tint that masked the new optics.

## References and authoring

The implementer and independent reviewer inspected all three supplied images at their available resolution. The paired Clear/Tinted reference shows legible floor detail near the viewer and reflection-dominated water toward the far side, with broken gold/white highlights. The brown reference has broader, calmer highlights and sediment-softened detail. The Toxic reference retains stronger green illumination and caustics. None calls for foam or large geometry waves. [Reference and implementation identity](evidence/water-interface-identity-2026-10-02.json).

Above-water reflection keeps normal-incidence reflectance 0.02, broadens the artistic grazing curve from exponent 5 to 3.5 and adjusts gain from 1.45 to 1.65. The reflection control still governs strength. This gives a stronger surface read without globally increasing opacity or sacrificing straight-down transparency. Muddy cached reflections average two nearby rays with their main ray for a slightly softer response.

Shared world-space ripple normals now vary by profile. Clear/Tinted use restrained still-water movement; Muddy uses lower amplitude/speed and much less fine-wave contribution. Toxic remains somewhat more active. Refraction, reflected directions and flashlight highlights use the same normal. No wave displacement, foam system or new still-water menu option was introduced.

Caustic strength rises from 0.6 to 0.75, retaining profile multipliers, floor-facing/depth fade and received-light modulation. Muddy caustics remain subdued. Reflection is composed after underwater receiver caustics, so the floor pattern does not modulate reflected walls. Ordinary unlit water remains black.

## Underwater interface

The current view's underwater classification enables the underside; being below a merged pool box alone is insufficient. Per-pool intersection must be positive, inside the pool bounds and before opaque depth. The below-water path uses water-to-air refraction with index ratio 1.333. It retains a clear Snell window and uses dielectric Fresnel/total internal reflection outside the approximately 49-degree cone from the normal. When reflection is enabled, total internal reflection permits no air transmission, even at a lower positive reflection strength. Reflection zero remains an explicit optics opt-out.

Underwater refraction accepts sky within the window while preserving sky/solid silhouettes. Candidate rays are checked at their actual interface crossing, not by incorrectly requiring an above-water object's position to lie inside the pool. Opaque foreground and portal sentinels are protected. Internal SSR sources must remain underwater and inside the same pool; the special near viewmodel depth range is rejected. Cached fallback directions point down at submerged radiance rather than at above-water sky. The existing above-surface probe remains an approximation of that source, not a dedicated underwater render.

The original water texture layer retains 80% of its above-surface coverage underneath, rather than the former 40%. Perspective changes in the world-space ripples, visible pool edges, interface reflection/refraction and camera-to-interface attenuation supply distance cues. This remains a flat optical interface with normal perturbations, not displaced wave geometry. Combined near/far pixel differences include the pre-existing absorption contribution and are not claimed as isolated proof of a new depth function.

## Two actual-game visibility defects corrected

E1M1's merged L-shaped pool had a reflection capture at `[450,904,-260]`, which the actual BSP classifies as SOLID. This was observed through the real `Mod_PointInLeaf` interface and independently confirmed by reading the unchanged BSP29 plane/node/leaf data. [Prior capture evidence](evidence/water-probe-placement-before-2026-10-02.json). Map building now retains actual liquid-polygon centres verified as air at the existing 36-unit capture height. The capture selects the valid point nearest the merged centre, retaining its actual height. Pools without safe candidates do not consume the nearest-two capture budget; geometry-free callers retain their legacy fallback.

The actual E1M1 water capture is now `[574.2222222222222,1000,-260]`, in AIR. The companion slime capture is also in air. Capacity remains two cached 256-pixel probes, six faces per capture and at most one capture each second. Anchor building does not alter physical kind, bounds, map contents or movement.

The normal renderer also applied a reduced legacy brown contents tint across the enhanced underwater view, on top of per-pixel absorption/scattering. Scaling the complete blend additionally weakened other flashes. A paired contents-free blend is now refreshed alongside the canonical native blend. Damage, pickups and powerups retain their contribution; `AddLightBlend` appends near-light flashes to both buffers. The mixing loop allocates no temporary array, and the paired buffer is allocated once. Classic scene rollback saves/restores both buffers, and the classic split/diagnostic still presents native RGB and alpha. Lava/native/liquids-off behavior remains on the original path.

## Verification

The focused public-interface suite passed **39/39** with the existing Node 24 Deno compatibility runner and real pinned Three.js 0.183.0. Deno is unavailable locally. [Test output](evidence/water-interface-tests-2026-10-02.txt), [new independently authored tests](../tests/water_surface_test.js). Coverage includes actual underwater classification, reflection controls, cached material/map reuse, opacity cues, profile and native boundaries, contents-only removal, full flash preservation, dynamic proximity additions/reset and safe probe anchors. The anchor test constructs a merged centre in solid space, verifies actual air face points through `Mod_PointInLeaf`, exercises real Three.js cube cameras and checks six draws, reuse and invalid-candidate handling.

The real GPU fixture passes **eight interface checks**, the existing **eight water checks**, **nine flashlight checks** and **14 profile checks**: **39/39**. [Current GPU record](evidence/water-interface-gpu-2026-10-02.json), [previous shader countercheck](evidence/water-interface-before-gpu-2026-10-02.json).

| Calibrated observation | Current result |
| --- | --- |
| Above reflection signal at 0 / 45 / 75 / 85 degrees from normal | 34 / 43.29 / 161.37 / 197.69 |
| Previous shader at the same angles | 31 / 32.57 / 137.20 / 175.88 |
| Clear underwater window versus outside it, black reflected receiver | mean 215.15 / zero |
| Outside-window response at reflection 0.6 versus 0.2 | zero changed central pixels |
| Reflection-off underwater opt-out | mean 214.44 instead of zero outside the window |
| Dry-view classification at the same low coordinates | zero interface contribution |
| Opaque object before the underside | zero changed foreground pixels |
| Combined interface/perspective/attenuation changes, depths 8→40 and 40→90 | 60,717 / 99,311 changed pixels |
| Received-light caustics off/on | central mean 69.15 / 75.57 |
| Stronger ordinary caustics without a source | maximum RGB zero |

The angle fixture explicitly captures constant reflected radiance with its black calibration receiver excluded during capture, then restores the opaque receiver for measurement. This isolates the curve from changing wall/sky content and the finite probe-box approximation. A separate actual black underwater receiver is captured after the public one-second rate limit for Snell-window tests. These are calibrated raster mechanism checks, not the supplied cave or a photon-transport comparison. The old shader fails the underside window and reflection opt-out checks; its outside-window mean remains 214.44. Shader rendering reports GL error zero in the recorded cases.

Actual E1M1 observations include [clean surface preview](images/water-surface-final-2026-10-02.jpg), [grazing reflection](images/water-surface-grazing-2026-10-02.jpg), [downward clarity/caustics](images/water-surface-down-2026-10-02.jpg) and [calmer Muddy styling](images/water-surface-muddy-2026-10-02.jpg). Underwater eye heights recorded through the actual render camera are approximately 5.97, 31.97 and 55.97 units below the -296 surface, each classified WATER. The deep test preset clamps away from solid floor rather than claiming its requested 80 units. [Near](images/water-underside-near-2026-10-02.jpg), [middle](images/water-underside-mid-2026-10-02.jpg), [deep](images/water-underside-far-2026-10-02.jpg); records [near](evidence/water-underside-near-2026-10-02.json), [middle](evidence/water-underside-mid-2026-10-02.json), [deep](evidence/water-underside-far-2026-10-02.json).

The enhanced pure-water frame has contents-free blend `[0,0,0,0]` while preserving canonical native water alpha 0.501960813999176. The actual full-classic diagnostic still draws that original alpha and corresponding native sRGB colour: [native record](evidence/water-underside-native-2026-10-02.json), [native view](images/water-underside-native-2026-10-02.jpg). That diagnostic capture precedes the anchor fix; its purpose is overlay preservation, not current capture placement. Gameplay images remain dark in this cave and require owner visual judgement; no glow is fabricated to hide a lack of received illumination. Empty gameplay error arrays are not shader assertions.

## Trying it and limits

Hard-refresh Newer Game, visit water and compare a shallow viewing angle with looking down. Swim underneath and look upward while approaching/leaving the surface. Compare Clear/Tinted and Muddy through the existing Water appearance selector. Use the flashlight to judge lit details. Reflection zero intentionally disables the underside reflection boundary; liquids-off/classic use native behavior.

`tests/water_optics_trial.html` provides the calibrated interface checks; `tests/water_gameplay_trial.html` provides inspection-only camera and diagnostic controls. No production player positioning/physics is changed. Cached probe/deferred-light and screen-space visibility limitations remain, and the merged-volume approximation is retained. No RTX equivalence, exact image reproduction or new gameplay-FPS qualification is claimed.

Independent planning, interface tests and source review were used. This water increment remains local and uncommitted, alongside the separate pending profiler fix, whose five recorded source identities are unchanged. Owner visual acceptance remains pending. Unrelated assets/game data are preserved; no release or durable follow-up job has been submitted.
