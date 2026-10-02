# Flashlight in water reflections

The subsequent [four water appearances](water-looks-2026-10-02.md) update the current optical profiles and verification. Counts, opacity and measurements below describe this preceding increment.

The flashlight now contributes to valid opaque surfaces seen in screen-space water reflections and produces an angle-dependent highlight on the rippled water surface. Existing environmental reflection strength, original water colour/texture, transparency and independent feature switches remain intact. This is a local increment on the preceding textured-water work, not a release or RTX-equivalence claim.

## Cause and implementation

The existing shader lit the depth receiver, typically the submerged floor, before composing water. Reflection weight did not change with flashlight state. However, the brighter transmission reduced perceived reflection contrast, and SSR sampled `tScene` before deferred flashlight lighting. Reflected walls therefore omitted the beam visible on the wall itself. The owner's three supplied images were inspected as visual references; they are not labelled flashlight off/on captures and are not claimed as a controlled reproduction.

`src/gl_post.js` retains the same Fresnel/environment-reflection mix. A shared `flashlightIrradiance` function preserves the existing cone/core, 280-unit falloff, 800–1500-unit range taper and eight-step screen-space visibility calculation. The original solid receiver uses this helper with its existing diffuse normal and material colour. SSR adds the same direct diffuse beam to valid opaque hits using their authored albedo and softened normal. Sky, missing albedo and live-portal sentinels bypass that estimate. Hits outside the cone exit before albedo/normal reconstruction and shadow sampling.

At a visible clear-water surface, the live shoulder light receives a bounded dielectric GGX response using the same ripple normal as environment reflection, with dielectric Fresnel 0.02. It is added after transmission/environment mixing, with shore fade and the existing visibility test. It can remain when environment reflections are disabled, as direct lighting remains independently active. It is absent outside the beam, with lighting/liquids disabled, in classic scopes and for an underwater viewer. Slime/lava do not acquire this clear-water specular path.

Caustics now modulate the transmitted underwater receiver before Fresnel reflection, so floor caustics cannot brighten or distort reflected walls. The source colour remains unchanged. There is no fixed grey lift, artificial flashlight-dependent Fresnel boost or global floor dimming. No new target, draw pass or probe recapture is introduced. At grazing angles a shoulder light near the viewer may produce little direct glint; a beam-lit reflected wall can still be visible. Looking down can reveal the direct surface highlight.

## Executable evidence

[Current source/baseline identity and fixture contract](evidence/flashlight-water-identity-2026-10-02.json). The focused public-interface regression suite passed **33/33** with the existing Node 24 Deno compatibility runner and pinned Three.js 0.183.0. Deno is unavailable locally. [Test output](evidence/flashlight-water-tests-2026-10-02.txt). The independent reviewer wrote and ran `tests/water_flashlight_test.js`, checking the public beam/cvar/frame/material/probe boundaries. Toggling the beam preserves map/material identity, opacity 0.24, pool and reflection uniforms and the same cached six-face probe. Independent focused checks passed 16/16. The shared Node runner runs this test after `water_effect_test.js` because their mocked capture clocks differ; standard isolated Deno file execution does not share that module clock.

The controlled real GPU scene passed all **nine dedicated flashlight checks**, alongside the existing **eight water optics checks**. [Current GPU record](evidence/flashlight-water-gpu-2026-10-02.json), [pre-fix shader record](evidence/flashlight-water-before-gpu-2026-10-02.json).

| Isolated flashlight check | Current result |
| --- | --- |
| Environmental reflection signal with beam off/on | 5,137 / 4,810 changed water pixels versus reflection-off |
| Direct glint over black transmission, environment reflections off, downward view | 3,302 changed pixels, maximum channel change 176 |
| Beam aimed away | Zero changed water pixels |
| Opaque blocker shadows still-visible water | 158 of 1,633 eligible glint pixels lose at least half their signal |
| Grazing view over black transmission | Zero direct changes, GL error zero |
| Oblique downward view over black transmission | 14 changed pixels, maximum change 21, GL error zero |
| Enhanced lighting off | Zero changed pixels |
| Opaque beam-lit SSR receiver, direct surface beam outside cone | 2,853 changed reflected water pixels; direct-only control zero |
| Shader compilation/rendering | GL error zero |

The rectangle initially included part of the dry ledge. Final optical masks explicitly raycast to a submerged floor through inset water bounds and exclude dry objects/blockers. The occlusion comparison only counts visible floor-through-water rays, with unchanged black background, preventing a black occluder hiding water from masquerading as a shadow. The previous shader fails the isolated direct-glint, shadow and beam-lit-SSR checks: it records zero direct glint and zero reflected beam pixels. This countercheck demonstrates the new checks detect missing implementation, rather than accepting a bright dry ledge or merely checking shader text.

The 120-frame synchronized 480×270 controlled run measured 2.79 ms per frame currently versus 2.68 ms for the pre-fix shader, with one-pixel readback after every full frame. This is a small fixture, includes synchronization overhead and is not a gameplay FPS qualification or a prediction for other resolutions/devices.

Actual E1M1 inspection used the normal game/render path. A paused native simulation kept the comparison at client time 47.71540069580078, eye `[576,1056,-276]`, angles `[6,116.56504821777344,0]`; only the flashlight changed. Both records retain liquids/lighting one, reflection 0.8 and one cached probe. [Off record](evidence/flashlight-water-gameplay-off-2026-10-02.json), [on record](evidence/flashlight-water-gameplay-on-2026-10-02.json), [off screenshot](images/flashlight-water-off-2026-10-02.jpg), [on screenshot](images/flashlight-water-on-2026-10-02.jpg). The lit wall's broken reflection remains visible with the original fine water pattern. [Clean unpaused preview](images/flashlight-water-final-2026-10-02.jpg), [final gameplay observation](evidence/flashlight-water-gameplay-final-2026-10-02.json). Empty gameplay `errors` fields are not GL assertions; shader error checks come from the controlled GPU fixture.

## Trying it and limits

Hard-refresh the normal game page, choose Newer Game, visit E1M1's underground pool and toggle the flashlight. Aim at a wall above the pool to see its lit patch reflected; look down to inspect the surface highlight. Keep liquids and enhanced lighting enabled. `r_reflect_screen 0` keeps cached environment probes and the direct water highlight but cannot show the live beam on reflected walls. `r_reflect 0` removes environment reflection while preserving direct beam/refraction.

`tests/water_optics_trial.html` exposes “Check flashlight and reflections” and “Run GPU checks”; a normal HTTP server can run those checks, with the unrelated GIF panel unavailable unless its inspection routes are configured. `tests/water_gameplay_trial.html` exposes camera, beam and native pause controls solely for inspection. Production movement/portal code is unchanged.

SSR remains a first-order screen-space estimate. It cannot reflect flashlight-lit off-screen walls through static probes, and visibility inherits the existing depth-buffer limitations. The reflected estimate includes direct flashlight diffuse lighting, not recursive bounce or exact photon transport. Owner visual acceptance is pending. Owner authorized committing and pushing the combined water work on 2026-10-02, with unrelated owner files preserved; no durable follow-up obligation or packaged release was submitted.
