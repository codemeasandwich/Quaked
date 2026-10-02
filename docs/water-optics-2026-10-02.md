# Textured, reflective Newer water

The subsequent [four water appearances](water-looks-2026-10-02.md) update the current optical profiles and verification. Counts, opacity and measurements below describe this preceding increment.

This local increment keeps the original water texture and turbulent UVs, adds stronger moving reflection definition and bounded refraction, and retains moderate transparency. It follows the owner's “halfway” balance: recognisable original colour/fine pattern alongside transmitted detail and rippling environmental reflections. The surface opacity is 0.24, not a mandated 50% blend. Brightness follows local lighting; no fixed cave-dark or brown filter is applied. Classic water, slime and lava retain their existing paths. The preceding ambient-music work was committed and pushed as `7560a4b` before this task began.

The subsequent [flashlight and water correction](flashlight-water-2026-10-02.md) adds live beam reflection and updates current verification to 33 tests plus dedicated isolated GPU checks. The measurements below describe the preceding water increment.

## Complete reference inspection

The reference is the owner-supplied `Quake_1996_4K_RTX_Mod_Graphical_Mods_Gameplay.gif`, SHA-256 `f2fcae232fbb9c8c1c071c553b09e8dcda0aca4d3e82554b1d30e724c1fbf23c`. Both the primary implementer and independent reviewer actually inspected **all 152 frames**, at their native **480×270** resolution, in eleven ordered contact sheets. No frame was skipped or replaced by the inline preview. Original 60–70 ms delays were retained, totaling **10,140 ms**. [Every frame's timing and pixel hash](evidence/water-reference/frame-timing-ledger.json), [explicit inspection coverage and observations](evidence/water-reference/inspection-coverage.json).

The complete sequence shows gold and red light reflections stretching and breaking into changing streaks on otherwise dim water. Dry ledges and fixtures remain rigid; shallow detail is visible through the surface. Viewing-angle and ledge transitions alter reflection visibility. Frames 80–84 cannot uniquely establish submersion from the recording alone. The full-screen yellow tint beginning at frame 97 accompanies pickup messages and is treated as a pickup flash, not water colour. There is no clear evidence for foam or large geometric waves. Darkness is contextual cave illumination, as the owner explicitly clarified.

`tools/inspect_water_reference.py SOURCE.gif OUTPUT_DIRECTORY` reproduces every decoded frame, hashes/timing and native-resolution contact sheets with Pillow. The original GIF also plays beside the controlled rendering trial at its native timing.

## Reused implementation

The existing pool regions, transparent water meshes, absorption, caustics, screen-space reflections and cached cube probes remain the rendering architecture. No extra water rendering pass, simulation, reflection target or per-frame cube capture was added.

- `gl_rsurf.js` retains `MeshBasicMaterial`, the original texture and original turbulent UVs. Clear Newer water alone uses vertex brightness sampled from the world's existing BSP lighting. Shared sample positions are cached; static light styles cause no repeated BSP traces. Style changes invalidate raw samples, while lighting/`r_newdark` changes refresh derived colours independently. The conversion matches the atlas convention: bounded `sample/128`, selected curve, then intensity two. Thus the texture retains its own hue and fine pattern but does not become a fullbright sheet in a dark room. The cache is cleared during map rebuild, releasing the previous world. Native materials explicitly ignore this shared colour attribute.
- `gl_rlight.js` adds `R_LightPointValue`, a value-only wrapper around the established query. It restores `lightspot` and `lightplane` in `finally`, preserving the alias/shadow contract.
- `gl_post.js` shares a world-space crossing-ripple normal between reflection and refraction, with distance/pixel-footprint attenuation for fine wavelengths. Refraction samples are chosen before scene/depth/albedo sampling and deferred lighting, so refracted submerged detail keeps its lighting. Depth, pool bounds and the existing portal sentinel reject dry foreground, banks and live portal views. The bend is bounded and eases near shore.
- Reflections remain angle dependent and preserve the actual reflected colour. Missing environment data falls back to black rather than an invented blue glow. Disabling `r_reflect_screen` skips its ray march; `r_reflect 0` disables reflection while retaining transmission/refraction. Water absorption and caustics modulate existing illumination instead of adding a constant glow to unlit water; slime's established behavior remains separate.
- `gl_rmain.js` identifies the first-person viewmodel explicitly. `r_waterprobe.js` excludes it from cached captures so its special depth range cannot leave a floating weapon in the environment. Visibility, render target/cube face/mip, XR state and world visibility are restored after success or failure; a failed capture releases its target. Probe limits remain two cached 256-pixel cubes, six face draws per capture, at most one new capture per second.

The independent liquids option still governs this effect. Lighting off keeps liquids and their native baked brightness; normal-map off does not disable analytic liquid ripples. `r_newer_water 0` and classic scopes preserve original water. Underwater views keep their existing clear path and avoid above-surface reflection.

## Verification

Public-interface/boundary tests passed **28/28** with Node 24, the existing Deno compatibility runner and pinned Three.js 0.183.0. Deno was unavailable. New coverage includes texture-light cache reuse and live styles, lighting/curve changes, native vertex-colour isolation, preserved light-query globals, independent optics switches, six-face probe reuse and exception cleanup. [Recorded output](evidence/water-effect-tests-2026-10-02.txt). Independent planning/review inspected the full reference and identified cache-retention and GPU-test isolation issues; both were corrected.

The real GPU controlled scene passed eight checks:

| Check | Recorded result |
| --- | --- |
| Refraction animates with reflections off | 7,846 changed pixels |
| Dry foreground ledge stays rigid | 0 changed pixels in 100-pixel interior |
| Liquids-off native surface stays stable | 0 changed pixels |
| Probe reflection animates with SSR off, over black transmitted water | 6,189 changed pixels |
| Reflection-off removes that isolated highlight | 6,785 changed pixels |
| Unlit water/caustics do not manufacture light | maximum RGB zero in selected water region |
| Brighter environment changes water-region output | 8,925 changed pixels |
| Shader compilation/rendering | GL error zero |

[GPU output, all 152 timed renders and controlled cost](evidence/water-optics-gpu-final-2026-10-02.json). Every reference timestamp was rendered in order with no GL error, while the complete original GIF played alongside it. All 152 captured 480×270 outputs were additionally inspected in eleven ordered sheets. [Rendered-frame inspection, timing and pixel hashes](evidence/water-rendered-sequence-2026-10-02.json). The controlled scene intentionally differs from the reference level/camera; this proves the mechanisms and temporal stability, not pixel matching to RTX.

The synchronized controlled 480×270 run used one-pixel readback after each of 120 complete frames: current mean **1.54 ms**, committed renderer mean **1.93 ms**. [Baseline record](evidence/water-optics-baseline-cost-2026-10-02.json). This includes synchronization overhead, concerns a small controlled fixture and is not a gameplay FPS or performance-improvement qualification. The code adds no new pass/target and keeps probe capture caching.

Actual E1M1 gameplay was also inspected above the pool, looking down, at grazing angle and underwater, including camera motion and separate liquid/lighting/reflection toggles. Visible water uses the original `*water0` map, opacity 0.24 and contextual vertex brightness. [Native-off gameplay record](evidence/water-gameplay-final-2026-10-02.json), [restored enhanced view](evidence/water-gameplay-enhanced-2026-10-02.json), [downward view](images/water-gameplay-down-2026-10-02.png), [underwater view](images/water-gameplay-underwater-2026-10-02.png), [clean final gameplay preview](images/water-final-2026-10-02.jpg). Test-only camera placement follows the native angle packet and uses actual water polygons/visibility rather than assuming the centre of a merged L-shaped pool is open space. Production code does not move the player or change portal physics.

## Trying the increment and limits

Hard-refresh the normal page, select Newer Game and visit a pool, such as E1M1's underground water. At low angles the surface should be defined more strongly by moving reflections; looking down should preserve a subtle original texture/colour with transmitted detail. Its darkness/brightness should respond to the room. Toggle liquids, lighting and reflection separately to inspect their boundaries. `r_reflect_screen 0` uses probes alone; `r_reflect 0` retains refraction; New Game retains original water.

`/tests/water_optics_trial.html` runs the controlled GPU checks and complete timed comparison. The custom local preview needs `/reference-water.gif` and `/water-reference/frame-timing-ledger.json` routes generated from the supplied reference; these are inspection data, not gameplay assets. `/tests/water_gameplay_trial.html` offers camera presets only for inspection.

This is a working local raster approximation. Cached probes cannot fully represent changing off-screen illumination/objects; SSR uses the available scene/depth, while caustics remain procedural modulation of received light. Pool volumes retain the existing merged-region approximation. It is not ray-traced photon transport or RTX equivalence, and no exact camera/scene reconstruction is claimed. The owner still needs to judge the final texture/reflection/transparency balance. Owner authorized committing and pushing the combined water changes on 2026-10-02; no deferred job or packaged release has been submitted. Owner photographs/resources and game-data changes were preserved.
