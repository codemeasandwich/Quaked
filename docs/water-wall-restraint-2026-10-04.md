# Water distortion and wall grain correction

Publication authority update: the owner requested **commit and push** on
2026-10-04. This supersedes the earlier local-only authority statements below;
those statements and receipts describe their original verification stage.
See [combined commit verification](enhancements-commit-2026-10-04.md).

The owner reported overly prismatic water and grainy wall surfaces with black
speckles compared with the original. This increment adjusts the existing
compositor and world material shading. Source images, native UVs, BSP geometry,
collision, continuous rock fields and authored crafted-height assets are retained.

## Source changes

`src/newer/render/gl_post.js` reduces the shared water ripple slope to 65% of its previous
value, applies 35% of the previous refractive offset, and caps that offset at
0.4% of screen height instead of 1.2%. The single shared refraction ray remains;
there was no RGB dispersion term in this water shader. Physical IOR 1.333,
underwater total internal reflection, Fresnel, depth/shoreline/dry-receiver guards,
water appearances, absorption and caustic strengths retain their existing paths.

World micro-height shadow rays previously forced mip level zero even when the
height detail was smaller than a pixel. They now use explicit gradients captured
unconditionally before divergent shader branches, matching the receiver's pixel
footprint. Carved reference heights apply their existing UV scale to those same
gradients. Continuous macro-rock heights and their ray bounds are unchanged.

Upgraded world pigment receives a minimum four-texel sampling footprint in both derivative directions, so angled
walls do not retain grain along the smaller footprint axis. The
filter removes pinprick grain while retaining broader stone patterns; the source
image is not rewritten. A live per-material getter follows asynchronous art
arrival. Classic and native pigment do not receive this widened footprint.
The shader cache key changes to prevent reuse of an earlier program variant.

`src/newer/render/gl_normals.js` now enforces its existing intended maximum fallback slope
of 0.5 before encoding. Painted high-resolution grain can otherwise produce
near-vertical normals. This soft limit preserves direction and leaves the height
alpha byte unchanged. Crafted heights continue to use their authored caps.

## Verification

Independent planning and final source review found no concrete correctness
blocker. The independent CPU compatibility suite passed **49/49**, covering
normal-generation invariants, ordinary/rock/carved/displaced world shader
variants, Classic/native gates, height-shadow contracts, rock continuity and
all existing water feature boundaries. [Receipt](evidence/water-wall-tests-2026-10-04.txt).

The independent twelve-draw material/MRT GPU fixture passed **23/23**. Fine-height
shadow visibility converges exactly to an averaged-height oracle across 55,200
receiver samples; 7,200 coarse ridge-shadow pixels remain and the flat negative
control casts none. Broad linear pigment values remain approximately 80 and
160 while checker grain is filtered out. Classic matches original pigment
pixel-for-pixel. Geometry, UVs and image bytes remain immutable; GL errors are
empty. Restoring only the former level-zero shadow sampler fails the intended
oracle with mean visibility error 0.6544. Two additional oblique texture tests
exercise anisotropy 16 with unequal UV footprints in both orientations. Fine
pigment error falls from 30.0/19.98 to 0.455 linear byte units, while broad
80/160 color bands remain. Restoring the former largest-axis-only filter fails
exactly those two grain checks.
[Directional mutation](evidence/surface-filtering-directional-mutation-gpu-2026-10-04.json).
[GPU receipt](evidence/surface-filtering-gpu-2026-10-04.json),
[mutation sensitivity](evidence/surface-filtering-mutation-gpu-2026-10-04.json).

The first pigment oracle incorrectly averaged encoded sRGB attachment bytes.
Its failed record is retained. The corrected independent oracle decodes actual
SRGB8 storage before averaging, with unchanged linear-value tolerances and an
additional authored two-texel-mean check; production was not changed to fit it.
[Initial diagnostic](evidence/surface-filtering-gpu-initial-2026-10-04.json).

A fixed-camera water comparison renders the previous constants and current
constants against a straight-ray control in the same production compositor.
Mean displayed receiver difference drops from 13.02 to 6.69 at time 1 and from
13.11 to 6.49 at time 2.7. This is a relative visual-distortion measurement, not
a physical refraction percentage. Its eight checks passed. The existing eight
GPU compatibility checks also passed: animation, reflection shimmer, source-free
blackness, dry foreground protection and liquid opt-out remain working.
[Restraint comparison](evidence/water-restraint-gpu-2026-10-04.json),
[compatibility](evidence/water-restraint-compatibility-gpu-2026-10-04.json).
The eight underwater-interface GPU checks also passed, including the Snell
window, total internal reflection, foreground protection and live caustics.
[Interface receipt](evidence/water-restraint-interface-gpu-2026-10-04.json).

A native E1M3 view was also inspected at eye `(-1280,-600,-328)` and view
angles `(12,35,0)`. The prepared rock-data request timed out in that browser
run and used the existing deterministic generated fallback; readiness then
completed with no pending work or runtime/GL error. This observation does not
qualify prepared-bake load performance. Native before/after views have matching
cameras, but differing simulation times, so controlled GPU checks supply the
quantitative comparison.
[Native final receipt](evidence/water-wall-after-gpu-2026-10-04.json),
[final image](evidence/water-wall-after-2026-10-04.jpg),
[source hashes](evidence/water-wall-source-2026-10-04.json) and
[correction-only patch](evidence/water-wall-correction-2026-10-04.patch).

## Try and custody

Reload Newer Game and inspect water and stone at near and middle distances.
The local native-game inspection page is
`http://127.0.0.1:8015/tests/water_gameplay_trial.html`. It exposes liquids,
relief, height-shadow, caustic and Classic diagnostic controls. The bounded
independent GPU regression is
`http://127.0.0.1:8015/tests/surface_filtering_gpu_trial.html`; the water comparison
button is on `tests/water_optics_trial.html`.

Implementation remains uncommitted; no publication or release was performed.
The current chat owns verification and owner appearance acceptance. Original
replacement-art grain is softened by sampling, rather than completely removed
or repainted. Owner visual acceptance remains pending.
