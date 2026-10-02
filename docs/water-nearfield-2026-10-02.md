# Muddy near-field transmission and reflected markers

The owner's corrected target is slightly translucent nearby mud, progressively obscured detail over longer paths through the volume, subtle reflected shimmer from prominent scene markers, and caustics in every water style. The prior oracle hid too much nearby detail. This increment corrects that authoring and two reflected-marker defects while preserving the existing renderer and map contracts.

## Implementation

Muddy absorption changes from `[0.035,0.055,0.080]` to `[0.009,0.014,0.020]`. The existing Beer–Lambert term continues to use **distance inside the water**, `exp(-sigma * (tExit-tEnter))`, rather than camera distance or an opacity mask. Original surface texture coverage stays0.10. Brown scattering, the thin18-unit surface haze, original UVs/material caches, map contents, swimming and damage remain unchanged.

Muddy caustic strength changes0.12→0.65. Its addition now multiplies the transmitted receiver `c*T`, before the reflected surface is composed; brown scattered murk does not acquire a fake caustic network. Clear, Tinted and Toxic retain their existing caustic multipliers and artistic emission policy. Ordinary unlit water does not acquire light. These are the four transmissive water/slime styles; opaque lava keeps its existing glow/heat treatment.

Muddy's shared world-space ripple amplitude/speed changes0.40/0.40→0.60/0.50. It stays quieter than Clear and Toxic, with restrained fine waves. The same normal bends reflection, refraction and flashlight glints. No wave geometry or foam was added.

The old coarse SSR search could read the wall behind a thin lamp, or mistake submerged depth for an above-water source. Above-water candidates now reject below-plane sources. Internal sources remain below the surface and inside the same pool. Ineligible depth is treated as empty space consistently. Refinement requires a valid front-to-back depth crossing and checks near-plane, viewport, sky and viewmodel limits. At most one five-step refinement occurs per ray. Together with the initial and final depth reads, the increment adds at most **seven depth reads per reflected ray**, only with screen reflection enabled. The existing28 coarse steps, selected-light budget and receiver-light shadow limits remain.

Cached captures were36 units above water, higher than some low shoreline markers. The capture lift is now6 units, above the cube camera's4-unit near plane. Actual polygon anchors are revalidated in AIR at that height; unsafe pools are excluded before the nearest-two budget. Existing two256-pixel cached cubes, six faces per capture, reuse and capture-rate limit remain. No render target, pass or steady capture loop was added.

Muddy low-frequency light samples now pair colour with the exact depth texel they classify. This prevents bilinear dry-object colour from being classified as submerged sediment illumination at those taps. Normal transmission can still mix silhouette texels; reflection evidence accounts for it explicitly.

## Verification and interpretation

The focused public-interface suite passed **44/44** using Node24 and the existing Deno compatibility runner with real pinned Three.js0.183.0. Deno is unavailable locally. [Output](evidence/water-nearfield-tests-2026-10-02.txt). The independently authored [low-anchor test](../tests/water_nearfield_test.js) builds a BSP-classified chamber with a14-unit ceiling: lift36 is SOLID, the lower anchor is AIR, and a cube face covers a shoreline marker at8–12 units. A four-unit-ceiling pool is rejected. It checks six-face capture, reuse and renderer/visibility restoration. Existing independent feature, classic, profile, vapour, blend and capture-failure tests remain in the suite.

The calibrated GPU volume test uses two flat source colours with equal luminance, so sediment illumination stays stable. Each pose has its own no-liquid control; reflections, air haze, caustics and lighting are disabled for the extinction measurement. This measures **displayed colour distinguishability**, not recognition of an actual floor texture or an absolute physical transmission percentage.

| Approximate distance inside water | Colour contrast retained relative to same-pose control |
| --- | --- |
|64 units|65.8%|
|128 units|42.1%|
|247 units|17.0%|

All four styles show a positive received-light caustic response on the lit floor. Separate controls retain black ordinary water without sources, the underwater Snell window/TIR, opaque foreground and dry-view protection, lighting/reflection opt-outs and flashlight reflection/occlusion behavior.

The marker trial checks a gold lamp, red marker and blue ledge individually in their wet reflected regions. Masks use actual geometric receivers and exclude a two-pixel band at dry silhouettes and ROI edges. Positive assertions prevent empty-mask passes. Each marker is toggled at fixed pose/time. Reflection-off marker responses are **subtracted**, rather than assuming an opaque object cannot also affect transmitted light or edge filtering. Marker colour remains positive after subtraction. Time1/time3 on/off contribution differences additionally subtract reflection-off time controls to isolate reflected shimmer.

The cached fallback separately verifies the lamp and low shoreline marker. A **single box-parallax cube cannot guarantee accurate relocation of every interior object**. The near ledge's probe-only result remains an explicitly unqualified diagnostic; the combined renderer's visible ledge reflection is required and verified through SSR. No universal off-screen/dynamic marker coverage or RTX equivalence is claimed. Earlier aggregate/zero-control observations that included sediment or silhouette changes are retained as diagnostics, not accepted reflection-only proof: [control investigation](evidence/water-nearfield-marker-control-before-2026-10-02.json).

The combined accepted GPU record has **65/65** cases: [final GPU evidence](evidence/water-nearfield-gpu-final-2026-10-02.json), [source/reference identities](evidence/water-nearfield-identity-2026-10-02.json). It explicitly records verification phases. The first no-radiance check left the blue MeshBasic ledge lit, so its failure was a fixture-source omission rather than proof of spontaneous water emission. The corrected completely dark fixture returns maximum RGB0; affected groups were rerun, and the original diagnostic remains retained. Actual-game camera records and image links are recorded with this increment's evidence. The actual scene remains darker than the concept. The correction concerns near/far water behavior and reflected marker presence, not a room-wide lighting or geometry redesign. Existing noisy timing samples do not qualify a gameplay-FPS improvement; bounded source work and unchanged capture budgets are verified separately.

## Try and ownership

Hard-refresh Newer Game, leave Water appearance at Map and inspect E1M3. Nearby submerged stone should be faintly visible, with longer underwater paths losing detail. Compare shallow-angle reflections and look down for caustics. Surface haze remains the shared thin-Muddy-haze/Toxic-vapour control.

The inspection fixture is `tests/water_gameplay_trial.html`. Start E1M3 and use `-1280 -600 -328 12 35` in Camera xyz pitch yaw. The calibrated fixture exposes near/far volume and per-marker controls in `tests/water_optics_trial.html`. These controls are test-only and do not change production movement.

Independent planning, testing and source review were used. Work remains local and uncommitted. The owner's concurrent weapon-model work, weapon assets, `src/r_weapons.js`, `src/r_newerskins.js` and `tools/import_weapons.py` were preserved and not edited or staged by this water increment. Owner visual acceptance remains pending.
