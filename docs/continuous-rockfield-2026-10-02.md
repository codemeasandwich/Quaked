# Continuous procedural natural rock and terrain relief

The owner's `rockfield-v1.0.0.html` is the source implementation. `src/newer/assets/rockfield.js` extracts its rock-core as an ES module. The default profile remains source-identical: hash, quintic value noise, rotated fBm, domain warp, 5×5 cellular search, global height normalization, tile/gutter sample arithmetic and input bounds are unchanged. Independent tests evaluate the original HTML core and compare exact results with the extracted functions. The supplied HTML remains usable as its standalone lab. The owner then requested maximum, big, blocky cliff relief. An opt-in `blockiness` control adds broad cellular faces and deep shared fissures; its default is zero, preserving source parity. The integrated wall preset uses blockiness 1, warp 0.18, fracture 1.1 and detail 0.1. Ground continues using the original supplied profile.

## Surface contract

Natural **world** rock surfaces participate wherever they occur: exterior cliffs, tunnel walls, cave roofs, rock floors, slopes and under overhangs. Sky exposure and face orientation do not gate eligibility. `rockN_N`, `uwall1_2` and the hub’s irregular-rock `bricka2_2` are bedrock and use the maximum blocky profile on every orientation. Matching faces never change profile when the player moves underground. Animated frame prefixes retain their material's identity.

The explicit material ledger in `R_RockMaterialProfile` separates bedrock from roots/soil (`ground1_2`, `ground1_6`, `wswamp1_2`) and loose aggregate (`wizmet1_7`, `wall16_7`), which use the subtle profile. Names alone are not sufficient: `wgrnd1_5/1_6` are framed paving, `wswamp1_4/2_1/2_2` are masonry, and `rock0sid/rock1sid/rockettop` are ammunition-crate graphics. Those, brick, cut stone, metal, wood, sky and liquids retain their existing rendering. Moving brush models are outside this static connected-world surface system.

The procedural field is separate from the repeating diffuse and authored normal/height textures. Original BSP position, texture UV and lightmap UV bytes remain unchanged; no vertices, silhouettes, physics hulls or collisions move. Shader parallax follows the view ray, converting the procedural offset through the UV derivative Jacobian back into native texture coordinates. The existing fine-detail normal map remains in use.

Each map/profile owns a single field, seeded with map identity and `wall` (bedrock) or `ground` (soil/aggregate), never with a tile, texture, face index, plane or camera position. Bedrock uses the same world-coordinate projection on walls, floors, ceilings and slopes:

```
U = [ 0.48399890, -0.87506860, 0.00000000 ]
V = [ 0.27837972,  0.15397133, 0.94804935 ]
field coordinates = [dot(U, worldPosition), dot(V, worldPosition)] / 256
```

Ground retains world `(x,y)/256`. The common oblique rock projection avoids the former ceiling collapse; its minimum plane-projection area across the bundled rock geometry is 0.0393991, with horizontal floor/roof area 0.3181233. Shared world positions sample exactly identical coordinates, height and both field derivatives even when normals or native texture UVs change. This is a world projection, not a per-face unwrap; orientation changes feature spacing. The existing small-determinant UV guard remains for unsupported future geometry because no single linear 3D-to-2D projection is nonsingular on every mathematically possible plane.

The wall profile forms broad cracks, ridges, crowns and recesses; its feature-size setting is 3 field tiles. Ground uses the supplied gentler profile with feature size 2. Virtual amplitude is 0.8 field tiles for walls (the supplied lab maximum, explicitly requested by the owner) and 0.009 for ground (204.8 versus 2.304 world units at maximum normalized height difference). Relief tapers at the outer profile bounds and with view distance; it does not taper/reseed at individual texture or BSP tile boundaries.

Normals use central differences with actual neighboring gutter values. A bounded 40-layer parallax march and three refinements supply apparent depth. After viewing the maximum preset, stretched albedo bands on steep faces required a projection guard: view-parallax amplitude is capped at 0.18 field tiles, while full 0.8 cliff height still drives normals, cavities and sun self-shadows. The same capped-ray intersection is used for UV conversion and shading. This deliberately compresses view parallax to keep native texture grain readable; it is not physically full-0.8 displacement. A 12-sample height march supplies **local direct-sun self-shadowing**, using the map's real sun direction. Lamps and the flashlight retain their existing normal/deferred-lighting paths; they do not claim additional height-field ray shadows. Shallow cavity occlusion affects the baked diffuse contribution, preserving emissive/fullbright output.

## Streaming and lifetime

Generation runs in two lazy module workers, with at most two outstanding requests and no queue. Visible surface tiles and a neighbor halo (four pages for maximum cliff parallax, one for ground) are prioritized every 100 ms. One 96-page LRU cache is shared by both profiles; 64 sample intervals plus endpoints and two-sample gutters give 69×69 pages. Results transfer Float32 buffers, then upload through Three's `DataArrayTexture.addLayerUpdate` as linear R16F. GPU height storage is 914,112 bytes. A 64×32 RGBA float page table adds 32,768 bytes. Only changed height layers upload; no automatic mipmaps are generated.

All tile coordinates sample the same global field in any order, including negative coordinates. Tile eviction does not change generation; an evicted tile regenerates identically. The supplied implementation retains integer tile coordinates within ±1,000,000, far beyond Quake's map coordinate range. Resident memory remains bounded independently of the number or direction of generated tiles.

Page lookup uses bounded open addressing. Its maximum is 96 probes so every resident page remains addressable, including deliberately colliding keys. A dynamic probe bound keeps normal lookups short. Missing pages fall back to the existing surface detail; missing shadow neighbors never invent blockers. Worker failures retain existing surface rendering and appear in `R_RockfieldStatus`. Map rebuild terminates workers, advances the cancellation epoch and disposes the old GPU resources; delayed replies cannot populate a new map.

The feature is enabled in Newer Game and its enhanced demo pass when normal maps are on. The classic comparison material has no Rockfield shader; `uClassic` also suppresses its procedural contribution. `r_rockfield 0` disables the layer, `1` enables it, and values between scale its strength. The setting is archived. No height work is queued while it is off.

## G-buffer compatibility

The existing authored-colour attachment remains byte-sized. RGB still carries unlit texture colour. Alpha's existing availability test (`>0.5`) remains valid; Rock pixels encode direct-sun visibility as `0.51 + 0.49*visibility` while ordinary opaque surfaces retain alpha 1. The compositor decodes this factor and applies it only to direct sunlight. Byte quantization introduces at most about 0.0041 visibility error. Unshadowed Rock and ordinary alpha are both 1, so blending at their edges does not invent a shadow marker. No new attachment or per-frame texture bandwidth expansion was introduced.

## Verification and owner trial

Independent planning and defect review accompanied the implementation. Tests cover exact source parity; generation order and nonrepetition; height, two tangent slopes and gutters before and after actual R16F conversion; material eligibility on exterior/interior/roof/floor/slope faces; original polygon/UV bytes; immutable textures; 2-worker/96-page bounds, collisions, eviction, malformed replies, cancellation and mode gates; native UV conversion; and the byte-safe shadow contract. The actual E1M1 loader verifies 199 shared edges between cliff faces with different normals: five samples along each edge have identical field coordinates, heights and both field derivatives.

GPU compilation, live appearance and frame-delivery evidence are recorded separately from CPU tests. A working increment is not owner visual acceptance or a full performance qualification on other hardware/maps.

Try `tests/rockfield_gameplay_trial.html` on the existing server. It uses one ordinary live E1M1 client/server, positions the player at the outdoor entrance with trial-only godmode/notarget, and provides **Relief on/off** and a fixed-resolution frame-delivery comparison. These trial conveniences do not change normal gameplay. The normal app also uses the feature after reload; use `r_rockfield 0`/`1` in its console to compare.

## Resumed verification, 2026-10-03

The guarded maximum preset passes **44/44** focused/regression checks and **13/13** independent source/runtime checks. [Final test output](evidence/rockfield-tests-2026-10-03.txt), [implementation identity](evidence/rockfield-identity-2026-10-03.json). The trial now exposes a cliff close-up and keeps diagnostics collapsed so they do not cover the subject. The embedded preview reused old code after ordinary reload; the active temporary preview server uses a consistent per-launch module revision to ensure this is the current implementation.

The actual live E1M1 shader has no reported errors and reads back GL error0. At the same fixed player position and1544×1634 canvas with dynamic resolution held off,59 measured frames per mode averaged **86.439ms off /90.103ms on**, a3.664ms (about4.2%) increase. Medians were83.3/83.4ms. This is frame delivery in one local view, not a GPU timestamp or general performance guarantee; dynamic resolution was restored afterwards.

The real authored-colour attachment recorded621 sub-opaque available pixels with relief off (ordinary antialiasing edges) and18,968 with it on, at the same2,497,744 available-pixel count. The controlled grazing-light probe recorded21,179, after which the real map sun was restored. This establishes the procedural shadow channel on actual game geometry. [Complete live readback/measurement](evidence/rockfield-live-2026-10-03.json).

[Observed maximum projection artifact](images/rockfield-max-before-projection-guard-2026-10-03.jpg) and [same close-up with projection guard](images/rockfield-max-projection-guard-2026-10-03.jpg) document the correction. Texture stretching is substantially reduced; final aesthetic acceptance remains with the owner. No commit or push has been made for this increment.

## Cave/tunnel coverage correction, 2026-10-03

The owner clarified that natural rock relief must continue into caves and under tunnels. The earlier sky-exposure/orientation restrictions were incorrect and have been removed. Material identity alone chooses the field profile; the same rock keeps maximum relief on a ceiling or floor. All21 bundled BSPs were independently audited:2,360 bedrock and668 soil/aggregate world faces (3,028 total) are covered, including319 bedrock roofs,238 floors and73 slopes. E1M1 specifically covers38 rock roofs,11 floors and2 slopes; its199 differently oriented shared rock edges preserve exact maximum-field height and both derivatives. Manufactured paving/masonry and crate textures are explicitly excluded.

The corrected scope passes **45/45** focused/regression checks and **14/14** independent checks. [Coverage/regression log](evidence/rockfield-cave-tests-2026-10-03.txt), [audited material/geometry identity](evidence/rockfield-cave-identity-2026-10-03.json). The stable roof inspection point is E1M1 origin `[592,984,-343.969]`, pitch−70/yaw90, below natural-rock face3773 (`uwall1_2`, roofZ−128); native player collision hull reports empty at the point. The trial can preserve an inspection position through its `pos`/`angles` query and includes **Look at roof**.

Live inspection of the covered roof completed with96 resident pages,0 pending jobs and no reported shader/worker errors. The existing flashlight was enabled for the dark cave inspection. [Live state](evidence/rockfield-cave-live-2026-10-03.json), [same roof with continuous relief](images/rockfield-cave-roof-on-2026-10-03.jpg), [layer off](images/rockfield-cave-roof-off-2026-10-03.jpg). The trial remains open beneath that roof with relief enabled.

## Welcome-hub Hard entrance material

The owner identified the rough rock walls at the Hard entrance and explicitly kept riveted metal excluded. A live raycast against the actual rendered world batches identifies the left/right/ahead surfaces as `bricka2_2`; the riveted trims/platforms are `wizmet1_2`. Regional surface-center counts were insufficient to identify the visible walls, and initially overemphasized the metal. The actual `bricka2_2.webp` artwork shows irregular rock chunks; this single historical-name exception is now maximum bedrock relief everywhere it appears. Other brick names such as `bricka2_1`, and metal, remain excluded. START’s `rock4_1` was already covered and its308 worldfaces/329 shared edges were independently verified.
