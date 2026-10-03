# Independent demon-face verification

The qualified scope is `dem4_1`, `dem4_4` and `dem5_3`, using the owner's complete `dem4_4_maps.zip` package and actual raised geometry. The drawn anatomy, image-derived candidate, earlier clipboard PNG and twelve-unit displacement were superseded. Their results do not qualify the final assets.

The initial package-scale suites `demon_face_relief_test.js` (seven cases) and `demon_mesh_test.js` (five cases) passed **12/12** at 3.2-unit depth. This receipt predates the owner's subsequent triple-depth request; current qualification is recorded below. Output is retained in `demon-independent-tests-2026-10-03.txt`. Tests use real Three objects, decoded assets and native bundled BSPs, with no game, renderer or browser instance. These establish executable asset, geometry, material, PVS and shadow contracts. The coordinator supplies GPU appearance/performance and owner acceptance separately.

## Complete source and scalar preservation

The complete retained ZIP has SHA256 `b6b31e9b6916a9393bb772bebc1db17123db3f02efe1444b884b8297c50bddc8`. It includes the original reference, inferred source, saved 2048×4096 unsigned sixteen-bit height, both normal conventions, manifest, README and reproduction script. Independent tests read these as data and never execute the supplied script. They verify every manifest file checksum, inferred-source SHA256 `d348dbc26c75776abd38b72eb93fb9e5a83555be248423d193e062ca42429743`, and byte equality of the packaged original reference with unchanged installed `dem4_4` albedo.

Canonical saved-height SHA256 is `d5e89e6d2a3109e0507b91b53ed65b4ce072f1789296190ecc4b94f87009ef45`. Every one of the 131,072 installed `normals/demon-face.r16` values equals independently decoded scalar texel-centre bilinear downsampling of that saved field to 256×512, requantized unsigned little-endian sixteen-bit. Of these, 130,288 lie between eight-bit quantization levels. The public async loader preserves every value as `Float32(uint16/65535)`, without gamma or eight-bit conversion. WebP is an eight-bit preview derived from these values, not the source of physical geometry when the sixteen-bit data is available. All three variants share that scalar file and retain their existing albedo bytes.

Independent finite differences reproduce **15,969 OpenGL normal pixels exactly**, including every outer-boundary pixel with one-sided derivatives. DirectX preserves R/B and flips G byte-exactly across all 8,388,608 pixels. The documented amplitude `.05 × physical texture width` becomes **3.2 world units** for native 64-unit-wide plaques. Runtime geometric normals differentiate its resampled, half-world-unit Gaussian-smoothed field; the source normal PNG remains package evidence and is not applied a second time to physical geometry.

The package makes no seamless or measured-geometry claim. Tile-local scalar sampling and smoothing now clamp outer boundaries, including exact right/bottom endpoints and negative native tile origins. Integer native UV shifts preserve tile phase. Broad source landmarks align with raised horn/brow/nose/cheek and recessed eye/throat patches. This does not claim pixel-perfect anatomical registration, which the supplied manifest itself disclaims.

## Material and failure handling

Native PAK textures are 64×128 and all three have zero fullbright palette texels. The enhanced-created `dem5_3` emissive map supplies **583 left-eye, 553 right-eye and 2,501 mouth pixels**, HDR gain4.5. Horn/background pixels are excluded. Every authored colour byte is conserved by diffuse-plus-glow splitting. Registered materials bind new normal/emissive metadata asynchronously without a mode flip. Classic receives transparent native glow; New Game removes the enhanced-created map and restores native pixels.

Invalid relief metadata is rejected before compilation. Ordinary detail stays ten layers and the original logo reference retains sixty-layer precedence. Physical plaque materials suppress macro POM and the second macro normal application; cavity AO preserves emission. Failed/truncated sixteen-bit fetches retain native geometry rather than silently displacing the preview. Preview normal fallback is cached separately from canonical sixteen-bit normals.

Review found and the implementer corrected: phantom raised shadows with textures off; stale meshes after height removal; cache identity conflating preview and sixteen-bit normals; NaN smoothing treated as zero; and outer-edge wrapping contrary to the supplied nonseamless package. Tests cover these contracts.

## Accepted base-depth mesh and quality baseline

The first native START plaque has **98,304 top vertices, 33,792 total triangles including 1,024 skirts**, with top depth **0.3951..2.7941 world units**. Of its normals, 18,789 differ substantially from the original plane. Every top vertex follows the geometric field and maps into an original triangle with barycentric texture/lightmap coordinates within float precision. Original BSP polygon/UV bytes and collision hulls stay unchanged; skirts meet retained wall backing.

Across both actual START plaques, every **65,536 top triangles** has outward, nondegenerate winding. Projected area equals the native polygons, with no overlapping/nonmanifold or unmatched internal top edges. This rules out those particular tearing mechanisms on these native faces.

Interpolation error against the continuous geometric field is **0.0680 world units p95**, forehead maximum **0.0740**. Facet-vs-normal disagreement is **9.06° p95**, forehead maximum **10.71°**. Regressions protect height p95 and forehead maximum below 0.1 world, and normal p95 and forehead maximum below 15°. The superseded twelve-unit candidate had forehead p95 height error 0.965 and normal disagreement 66.7°; package scale and smoothing materially improve this failure. Numerical proof does not replace the owner's oblique GPU view.

Public world drawing installs real meshes upon scalar arrival, uses native PVS, hides them in Classic and with textures off, includes them in the reflection visibility adapter, and disposes invalid/stale geometry. Sun triangle counts equal original plus raised triangles under the same Newer/normal/texture gates; other modes retain the original caster.

## Reproduction and remaining qualification

Run both files through `tools/run_tests.mjs`, with `QUAKED_THREE_MODULE` pointing to installed Three0.183.0, `QUAKED_CANVAS_MODULE` to installed `@napi-rs/canvas/index.js`, and `QUAKED_PYTHON` to installed NumPy/Pillow. Python independently decodes saved source; neither authoring script executes.

These checks qualify source/material/geometry contracts, not full gameplay performance or owner visual acceptance. The coordinator qualifies live raised START and glowing E1M2 appearances before landing. This agent made no production changes or commit/push for the demon increment.

## Current owner request: triple depth — strict gate passes

The owner accepted the package-scale appearance and requested triple depth. Production records `ownerDepthMultiplier: 3` separately from the package's `.05` amplitude and supplies **9.6-unit physical depth**, **0.5-unit tessellation step**, and **0.6-world-unit smoothing**. Source R16 and original albedo bytes remain unchanged. Source normal PNGs remain evidence at their original `.05` amplitude, not at amplified geometry depth. Runtime mesh normals are recalculated from the amplified geometric field, without stacking full source-normal slopes.

The initial amplified field used 0.5-world-unit smoothing. All 262,144 top triangles had correct winding, projected area and internal edges; height and normal p95 guards passed. Forehead maximum 17.760° exceeded the original 15° maximum. That failed strict attempt remains in `demon-triple-depth-attempt-01-2026-10-03.txt`. A subsequent 20° guard experiment passed, but the coordinator rejected relaxation in favor of fixing geometric filtering. Its log remains `demon-triple-depth-rejected-tail-guard-2026-10-03.txt` and is explicitly not qualification. All original quality bounds are restored.

The fix increases filtering footprint by 20% to 0.6 world, leaving amplitude, source values and triangle density unchanged. The second strict geometry run passes 5/5 in `demon-triple-depth-attempt-02-2026-10-03.txt`; the final source/material/geometry run passes **12/12** in `demon-triple-depth-tests-2026-10-03.txt`.

Every **262,144 top triangle** across the two native START plaques retains outward, nondegenerate winding, exact projected native area and matching internal edges. First plaque **393,216 top vertices**, **133,120 total triangles**, including **2,048 skirts**, have **1.1185..8.2134 world-unit** top depth. Source/collision/PVS/sun/material/glow/classic contracts pass.

The unchanged strict guards pass: height **p95 0.04890 world** and forehead **maximum 0.05356 world** below 0.1; normal **p95 8.413°** and forehead **maximum 14.139°** below 15°. Global normal-disagreement mean is 3.518° and maximum 30.658°; global height maximum is 0.1551 world. These tails remain visible in the measured evidence, rather than being called exact facet agreement.

Independent checks establish amplified geometry and material contracts. Current GPU appearance/performance and owner acceptance of the amplified result remain coordinator qualification. No production edits, additional game/browser instances or commits were performed by this reviewing agent.

## Native faces crossing donor tile boundaries

A later full-stock audit identified seven cross-tile plaques. The independent public regression `demon_tiles_test.js` covers all seven: E1M2 faces 2881,3242,3246,3452,4190 and E1M4 faces 5820,5821. These are real BSP surface indices, all using `dem5_3`, loaded through the normal model/display-list interfaces. The exact successful output is `demon-native-tile-tests-2026-10-03.txt`.

The mesh helper clips convex native polygons into their covered integer UV tiles before displacing them. The independent test verifies **2,695,956 top vertices** and **898,652 top triangles**. Every generated region has contiguous triangle ranges and UVs within its own donor tile. An independent bilinear scalar sampler confirms each vertex uses that tile's clamped height, rather than the original face-bounding-box origin. Native affine/barycentric UV and lightmap values survive clipping at every vertex. Every triangle has outward nondegenerate winding; projected area matches its original polygon and unmatched edges occur only at original perimeters or intended tile cuts. Each clipped perimeter reaches native backing through skirts. Original polygon bytes and collision hulls remain unchanged.

E1M2 face 2881 spans three tiles with 197,636 top triangles; the next four span two tiles with 164,354 each. The two E1M4 faces each span two tiles with 21,800 triangles. All are within the 262,144 top-triangle budget. This verifies every known stock crossing face; it does not assert that this child independently exercised every one of the 30 plaques in the coordinator's stock audit.

The unchanged single-tile suite reruns successfully **12/12** against the same clipping implementation, in `demon-triple-depth-tests-2026-10-03.txt`. The cross-tile suite separately passes **1/1**, giving **13/13 current constituent cases** across the three public test files. No new game/browser instance or production modification is made by this regression.
