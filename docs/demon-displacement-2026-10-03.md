# Real displacement for the horned demon plaques

The owner requested actual displacement for `dem4_1`, `dem4_4`, and `dem5_3`,
with light-responsive depth and shadows, and luminous eyes/mouth on `dem5_3`.
Purple faces, skull bands and other materials are outside this increment.

## Authoritative source and import

The complete owner-supplied `dem4_4_maps.zip` is retained unchanged. Its README,
manifest, saved 16-bit displacement, both normal conventions, original reference,
inferred native image and conversion script remain available in that archive.
The supplied scripts are inspected as source material, not automatically executed.

`tools/sculpt_demon_faces.py` imports the saved 2048×4096 16-bit grayscale
displacement. It uses scalar bilinear sampling at texel centres, then requantizes
to uint16 at 256×512 for this renderer. `demon-face.r16` stores those values in
little-endian order; `demon-face.webp` is only the 8-bit preview/fallback normal
detail. The loader reads the binary values directly as `uint16/65535`; no gamma
conversion occurs. Missing or malformed binary data keeps the native flat
surface instead of silently using 8-bit geometry. All three color files remain
byte-identical to the committed originals.

The package's amplitude is 0.05×physical texture width: a native 64-unit-wide
plaque therefore has a base range of **3.2 world units**. After accepting the
corrected appearance, the owner requested triple depth: the applied range is
now **9.6 world units**. Geometric normals are recomputed for that scale; the
package normal PNG is retained as a calibrated source reference, not layered
on top of displaced macro geometry. The original high
resolution represents resampled inferred relief, not recovered 4K detail or a
measured scan. The package documents residual lighting and slight feature drift;
the actual color/height alignment remains subject to visual review.

## Geometry, lighting and native behavior

`src/newer/render/r_demonrelief.js` builds real tessellated surface positions from the saved
field. The raised surface uses `0.05 + 9.6*height` along the original outward
normal. The native flat face remains its backing; eye/mouth cavities sit deeper
than the protruding bone, without cutting through or rewriting the BSP wall.
Perimeter skirts connect the surface back to that wall.

Both positions and geometric normals use the same geometry height field. A
0.6-world-unit Gaussian footprint limits geometry aliasing at the mesh's sampling
scale. This does not alter the original archive or installed scalar samples.
The supplied image is not seamless: geometry filtering/sampling clamps within
the native tile, including its integer/negative UV origin; opposite edges are
not blended. Seven stock faces cross native tile boundaries: their convex
polygons are clipped at integer UV boundaries, with all source coordinates
interpolated and each piece sampled within its own clamped tile. The clipped
pieces also close back to the backing. All 30 stock matching faces are covered. Native UV and lightmap coordinates are barycentrically preserved.

The displaced materials suppress macro POM and duplicate macro normal-map
slopes. Their actual vertex normals and depth drive the existing lighting.
The existing height-based cavity occlusion tag also survives deferred direct
light, flashlight, bounce and reflections without changing pigment RGB.
The all-level sun occluder includes the raised geometry. Point/flashlight
occlusion uses the existing screen-space depth approximation; this is not a
new off-screen point-light shadow-map system.

Meshes inherit exactly the native surfaces' PVS leaves. Newer Game, newer
textures and normal maps must all be enabled for both the visible geometry and
its sun-shadow geometry. Classic rendering hides the newer-only meshes and
retains original flat geometry. Removed, pending or invalid replacement fields
dispose stale meshes/PVS entries and leave the native backing. The original
BSP polygons, collision hulls, layout, entity data and save format are unchanged.

## Mouth and eye glow

The native demon textures contain no palette fullbright pixels. `dem5_3` now
creates an enhanced emission texture from its actual warm/bright mouth and eye
pixels. The selection is limited to those three image regions, with feathered
intensity; the face is never redrawn. Diffuse plus emission conserves each source
RGB byte before the HDR glow boost. The registered material receives the new
map after async loading, at intensity 4.5, and emission is excluded from cavity
darkening. Horns and background are not selected. Classic twins use transparent
native emission, and New Game removes the enhanced-created map/tint.

## Verification and working trial

Independent planning and source review preceded the real-mesh implementation.
The final independent **13/13** cases verify the package file hashes, every
131,072 saved runtime scalar, retained precision beyond 8-bit, source normal
conventions, native artwork identity, actual geometry, UV/lightmap interpolation,
collision invariants, PVS/Classic/fallback behavior, emission and shadow gates.
See `evidence/demon-independent-tests-2026-10-03.txt` and
`evidence/demon-independent-review-2026-10-03.md` for results and exact limits.

The earlier 12-unit/raw-height candidate produced the owner's jagged oblique
screenshots and is not qualified as the intended appearance. With the package
scale and matched geometry filtering, native START quality checks put 95th
percentile height interpolation error near 0.049 world units and normal/facet
difference near eight degrees at the final triple-depth setting. The original
15-degree normal-quality and 0.1-world-unit height-quality guards remain intact. Tests check every top triangle's winding, projected
coverage and internal edges, so that receipt is not merely a vertex-count check.
The archive's normal map is not applied on top of the displaced macro slopes.

The existing single-client trial supports `level=start`, `e1m2` and `e1m6`.
Use **Inspect demon face**, **Oblique face**, **Side of face**, then
**Face relief: on/off**. The inspection camera is
held near an actual native plaque; returning to the entrance or restarting
restores ordinary movement. Diagnostics report the installed mesh and shader.
General performance, arbitrary modded polygons and every oblique viewing angle
are separate from the focused checks. Current live GPU evidence and commit
identity are recorded alongside this document when verification finishes.

## Authorized next task

After this work is finished, the owner authorized committing/pushing it, then
checking the continuous world/surface rock deformation system on at least
`bricka2_2`, `rock1_2`, `rock4_2`, and `uwall1_2`. That rock system remains
shader-level relief across connected surfaces; these decorative demon meshes
do not redefine its geometry-preservation contract.

## Final verification and visual limit

The combined gate passed **78/78** in
`evidence/demon-final-combined-tests-2026-10-03.txt`; independent constituents
passed **13/13**, including all seven cross-tile stock faces. Source hashes are
retained in `evidence/demon-final-identity-2026-10-03.json`.

The coordinator observed the corrected baseline front view and the owner
responded “Good,” then requested triple depth. Final triple-depth side/glow
captures could not be retained: the browser-use preview repeatedly detached,
and direct native Codex access was denied by computer-use safety policy.
This is a visual-verification limit, not a claimed final GPU receipt. The
public native geometry/material/shadow tests and working trial remain available
for the owner to inspect. General GPU performance is not qualified.
