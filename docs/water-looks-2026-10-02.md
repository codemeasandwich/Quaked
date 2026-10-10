# Four reference-based water appearances

The subsequent [surface-definition refinement](water-surface-definition-2026-10-02.md) updates reflection/ripple/caustic authoring, underwater optics, capture placement and current verification. Measurements below describe this preceding increment.

This working local increment provides Clear, Tinted, Muddy and Toxic water appearances based on the owner's three supplied images. It builds on the textured-water and flashlight corrections, retaining original texture maps/turbulent UVs, rippled reflections, depth-guided refraction and the live flashlight response. It changes liquid rendering, not level contents, swimming, collision or damage.

## Trying the result

Hard-refresh, choose Newer Game, then open **Options → Newer Game features → Water appearance**. Left/right, Enter and touch cycle **Map / Clear / Tinted / Muddy / Toxic**. Changes apply on the next rendered frame, without loading a level. The choice is saved with the normal archived cvar configuration.

Map uses Clear for ordinary water and Toxic for native slime. The other choices override ordinary water's appearance; native slime remains Toxic. Choosing Toxic for an ordinary pool does not introduce slime damage. `r_water_look` accepts 0 Map, 1 Clear, 2 Tinted, 3 Muddy, 4 Toxic. Lava and teleporters retain their existing paths. New Game, classic demo scopes and liquids-off use native materials despite a saved appearance choice.

No automatic transparency classification was inferred from texture colour. The original format distinguishes water/slime contents but does not reliably label clear, tinted and sediment-filled water. A comparison control is the smallest tryable change; it preserves map identity and avoids assigning physical meaning to painted texture colour.

## Reference interpretation and authoring

Both implementer and independent reviewer inspected all three attached images at their available resolution. Their hashes are retained in [source/reference identity](evidence/water-looks-identity-2026-10-02.json).

| Appearance | Reference treatment | Rendered optical policy |
| --- | --- | --- |
| Clear | Left of paired image: cool clear transmission, legible floor, broken gold/white reflections | Low surface coverage, stronger red absorption than blue, light-driven cool scattering, visible caustics and refraction |
| Tinted | Right of paired image: translucent green, floor still visible, reflected light retains source colour | Green transmission/scattering with moderate texture coverage; refraction and caustics retain detail |
| Muddy | Brown image: sediment obscures/softens floor detail, gold reflections remain | Stronger depth extinction, brown scattering from a low-frequency received-light field, subdued caustics/refraction |
| Toxic | Green image: luminous yellow-green water, strong light networks, rising mist | Deliberate green emission, green-biased transmission, stronger caustics, the existing bounded mist system, reflective surface |

Surface texture opacities are 0.12 / 0.16 / 0.28 / 0.22 respectively. These are the original texture layer's coverage, not total liquid opacity: depth absorption/scattering and angle-dependent reflection define the final image. Ordinary Clear/Tinted/Muddy scattering requires received light and creates no glow in a black room. Toxic alone has intentional emission, matching the supplied luminous reference and the established slime identity. Colours remain responsive to scene illumination rather than a fixed cave darkness filter.

## Implementation and boundaries

`src/newer/render/gl_post.js` owns one `LIQUID_LOOKS` authoring table. Material opacity and generated GLSL share its values. `R_LiquidLookIndex` resolves the bounded saved choice, always retaining Toxic for physical slime. The existing unused `uWaterMax.w` carries the optical id, while `uWaterMin.w` remains the physical kind. No physical regions are rebuilt or merged differently when a choice changes.

Muddy scattering averages four bounded scene-luminance taps beneath the same pool. Sky, live portals, dry banks and points outside the pool are rejected. Direct illumination is retained; sediment scatters a smoother light field rather than transferring all floor texture contrast into its haze. This branch runs for Muddy only. Reflection is composed afterward, preserving source colour and the flashlight-lit SSR estimate. No new render target or fullscreen pass is added.

Existing cached water materials update opacity and keep their map identity. Reflection/refraction and cached probes now also support native slime's reflective Toxic appearance, still within the existing two-probe/six-face limits. `src/newer/render/r_mist.js` reuses the bounded 720-point mist system for optically Toxic regions; changing effective appearance disposes/rebuilds its points, while ordinary looks contain no mist. Its activation now explicitly requires enhanced liquids, respecting liquids-off and classic boundaries. Mist remains an artistic additive effect. The appearance is not a simulation of suspended particles or photon transport.

The existing Newer features menu adds one choice row after reflections. Its 320×200 layout, footer and first three independent feature indices remain intact. Console/config values are sanitized before drawing/cycling the menu, preventing invalid values from selecting missing labels. `src/engine/render/gl_rmain.js` registers the archived cvar through the existing initialization path.

## Verification and evidence

The focused suite passed **35/35** using the existing Node 24 compatibility runner with real pinned Three.js 0.183.0; Deno is unavailable locally. [Test output](evidence/water-looks-tests-2026-10-02.txt). New independently authored public-interface tests exercise touch/keyboard cycling, wrapping, console bounds, archived configuration output, next-frame uniforms/material-cache reuse, unchanged physical kinds, native slime, opaque lava, liquids-off, classic scopes and New Game. Independent review also inspected all four controlled outputs, four gameplay captures and the menu; a separate boundary subset passed 12/12. [New tests](../tests/water_looks_test.js).

The real GPU controlled fixture passed **14 profile checks**, the existing **eight water checks** and **nine flashlight checks**: **31/31**. [GPU record](evidence/water-looks-gpu-2026-10-02.json).

- All four render with GL error zero, original texture identity and physical water kind zero.
- All four retain a measurable environmental reflection signal versus reflection-off at the same camera/time.
- Clear floor-detail luminance range is 55.62 versus Muddy 17.97 in the fixed measurement region; muddy detail is materially obscured.
- Tinted increases green relative to red compared with Clear. Muddy remains warm brown; Toxic is green and has visible mist points.
- Clear, Tinted and Muddy each give maximum RGB zero in the source-free control.
- Existing flashlight reflection/glint, occlusion, independent switches and optics checks still pass.

[Four controlled outputs](images/water-looks-trial-2026-10-02.jpg), individual [Clear](images/water-look-clear-2026-10-02.png), [Tinted](images/water-look-tinted-2026-10-02.png), [Muddy](images/water-look-muddy-2026-10-02.png), [Toxic](images/water-look-toxic-2026-10-02.png). These use a deliberately simple checkerboard pool to expose transmission/detail, not the reference cave scene. Rendering and pixel comparisons run through the public frame/beam/mist interfaces.

Actual E1M1 captures also compare all four at paused client time **38.95130157470703**, eye `[576,1056,-256]`, angles `[20,116.56504821777344,0]`; lighting/liquids remain enabled, reflection 0.8 and flashlight off. Only appearance changes. Native `*water0` maps remain in use with corresponding live opacities. [Comparison](images/water-looks-gameplay-comparison-2026-10-02.jpg), records [Clear](evidence/water-game-clear-2026-10-02.json), [Tinted](evidence/water-game-tinted-2026-10-02.json), [Muddy](evidence/water-game-muddy-2026-10-02.json), [Toxic](evidence/water-game-toxic-2026-10-02.json). Clear/Tinted differences are subtle under this dark room's lighting; Muddy sediment and Toxic glow/mist are stronger. [Actual menu layout](images/water-appearance-menu-2026-10-02.jpg). Empty gameplay `errors` fields are observations, not GPU error assertions; explicit GL checks come from the controlled fixture.

The fixture buttons in `tests/water_optics_trial.html` run the comparisons; `tests/water_gameplay_trial.html` provides test-only camera/appearance controls. `tests/water_looks_gallery.html` displays the unmodified saved E1M1 screenshots. Supplied images are reference material, not new gameplay textures or level data.

## Acceptance and limits

This replicates the references' optical treatments in the existing raster architecture. It does not reconstruct their cave geometry, materials, lights or exact pixels, and does not claim RTX equivalence. Existing merged-volume and screen-space visibility/reflection limitations remain; cached probes do not update off-screen beam lighting. Toxic mist is bounded artistic rendering. No new gameplay FPS qualification is claimed for the additional Muddy sampling.

Owner authorized commit and push on 2026-10-02. Visual balance acceptance remains pending. No packaged release or durable follow-up job was submitted, and unrelated owner files/resources remain preserved.
