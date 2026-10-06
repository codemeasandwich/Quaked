# E1M1 exit corridor ceiling fixtures

The bundled E1M1 end corridor has six downward 32×32 `tlight01` panels,
with authored light helpers on the same vertical axes. The former 192-unit
surface clustering merged these into four isotropic records and discarded
direction. The enhancement now moves each uniquely matched helper to ten
units inside its physical panel and adds a soft downward cone. It retains
the authored color, intensity and style and suppresses only that panel's
additional procedural emission. Native geometry, baked lightmaps, texture
pixels, edicts, collision and Classic rendering are unchanged.

`r_fixturelights.js` admits only the inspected bundled E1M1 source (1,365,176
bytes; SHA-256 `7b7061ec63c3e8ecb9c0e0a8075f18823efea6578666d57d601c191bcaf16c26`).
A synchronous FNV admission fingerprint avoids asynchronous map state; it is
not an authenticity/security check. Geometry and the actual sole exit to
E1M2 are independently checked. Six connected panels must have unique
same-axis authored helpers 64–88 units below them, with an air segment from
the relocated source. Unknown variants, incomplete geometry, unmatched or
ambiguous helpers retain the previous behavior. Face numbers and arbitrary
world-point tables are not used to place lights. The owned full-game E1M1
is a different BSP and is deliberately not silently assumed equivalent.

The initial 18-degree inner and 32-degree outer cone and 96-unit source
falloff are presentation calibration, not values authored by Quake's BSP.
Source membership gets fixture priority without doubling authored radiance.
Relocated source leaves are rebuilt for PVS selection.

This adapts the existing eight selected point-light slots, point shadow
cubes, caster borrowing, and ordered height-shadow mask bits. No additional
shadow atlas, sampler, manager, flashlight target or runtime asset is added.
Directions rotate with the camera as vectors and are copied with the frozen
pre-HDR snapshot. Absent/invalid directions remain isotropic. World/alias
receiver lighting, separate specular highlights, reflection incident-light
ranking and height-source weights use the same cone. The optional cone volume path uses twelve clipped-ray samples and existing
cube visibility, while ordinary points retain their analytic path. The current
renderer deliberately sets point `SCATTER=0`, so neither path contributes
point-light shafts in normal presentation. This change does not enable broad
point fog or claim visible fixture shafts. The flashlight continues
to own its single independent spot target. Live sources and actors keep
existing selection and refresh budgets.

Required qualification includes native-load classification, cone boundary
and camera-rotation controls, existing point/flashlight/height regressions,
and actual corridor floor/ramp/occluder captures in Newer with Classic
controls. Code or source inventory alone does not qualify the visible pools.

## Verified bounded renderer trial

The production implementation from `18ae741` was unchanged through the final
`6fd1247` test corrections. Five independent native/public fixture tests plus
the existing point, flashlight and height controls passed **25/25**. The
actual renderer trial captured 19 images and passed positive world-irradiance
checks under every fixture, a sloped-ramp inner/outside-cone comparison,
fixed-pose native soldier-to-world shadow changes with held casting preserved,
Classic exact-pixel parity, eight ready cube slots and unchanged BSP bytes.
Shader, runtime and GL errors were zero. Its 162 controlled draws completed
in 2.029 seconds; this is a component trial, not level-loading performance.

Flat-floor inner irradiance was 0.530633 with cone 1; outside was 0 versus
0.314798 for the same source made isotropic. Ramp inner irradiance was
0.310474 with cone 1; outside was 0 versus a positive 0.001361 isotropic
control. Both comparisons sample actual production compositor irradiance
before final display quantization, using 25 native world pixels per region.
The soldier caster changed 226 world pixels while its pose, geometry and held
weapon stayed fixed. All six core receivers had positive irradiance and cone 1.

The trial uses native pigments and controlled cameras, with texture/skin,
normal/rock and water enhancements disabled to isolate physical lighting.
The isolated ramp pair hides the same held foreground mesh in both images
so it cannot obscure the measured floor. The normal/height integration is
covered separately by the public frame/compiler checks; this trial does not
claim water-reflection pixels, gameplay navigation or visible point shafts.
Earlier failed receiver-tag, display-threshold and foreground-occlusion
measurements remain retained with their exact source/PNG receipts.

Five warm public light-collection samples measured 9.59–19.71 ms with the
fixture classifier versus 6.60–17.55 ms for the original collector on this
machine. It scans the 1.365 MB source once per map build, retains six physical
fixtures, and reduces procedural world sources from 267 to 263. This noisy
CPU measurement is not an end-to-end startup guarantee. The selected limit
remains eight lights/cubes; no new render target or shadow-face budget exists.

Try a served `dev` checkout at `tests/fixture_lights_gpu_trial.html`, then
click **Run fixture checks**. For normal gameplay choose Newer E1M1 and walk
to its exit corridor/ramp; Classic retains its original appearance. The
maintained CPU recipe is `tools/run_tests.mjs` with
`tests/fixture_lights_test.js`, `tests/model_pointshadows_test.js`,
`tests/flashlight_world_shadow_test.js` and `tests/height_shadows_test.js`,
using the existing Three runtime.
