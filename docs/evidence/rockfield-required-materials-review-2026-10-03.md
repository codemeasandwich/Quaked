# Required rock material coverage

The new independent public suite `tests/rockfield_required_materials_test.js` passes **3/3**, with exact output in `rockfield-required-materials-tests-2026-10-03.txt`. It reads all **21 bundled PAK0 BSPs**, independently reconstructs model0 world faces from native vertices, edges, planes, texture records and material names, then calls the actual chart/geometry interfaces. No game, browser or GPU instance is launched. Worker transport is observed through bounded endpoint doubles; no real worker is started.

| Required texture | Map | Native world faces |
|---|---|---:|
| `bricka2_2` | START | 80 |
| `rock1_2` | E1M4 | 840 |
| `rock4_2` | E1M5 | 267 |
| `uwall1_2` | E1M1 | 307 |

All **1,494 world faces** already receive the wall profile with maximum amplitude 0.8 through the existing implementation. Each map uses its common `seedFrom(mapName + ':wall')` seed and the same world basis `ROCK_AXIS_U/V`. Material identity and plane orientation do not reseed the field. The covered faces include **140 ceilings, 45 floors and 52 slopes**. These exact native world counts are regression assertions, not counts of texture records or all brush surfaces.

The test exercises `R_RockfieldBuild`, `DrawGLPoly` and `R_RockfieldGeometry` for every required world piece, proving chart attributes contain the world-derived coordinates and maximum amplitude. Original position, normal, albedo-UV and lightmap attributes retain their identity and byte values. Source polygons and the entire PAK digest remain unchanged.

Across **3,063 actual shared edges** touching a required material, including **57 texture changes, 1,410 plane changes and 461 ceiling edges**, both sides sample identical field coordinates, procedural heights and derivatives. Tests use native shared positions, including endpoints and midpoints, so material and angled-face boundaries cannot secretly change phase.

The second case loads each material's actual map through the normal model/lightmap builder and observes its real Three world batches. Every matched material is automatically registered with `userData.rockField`; the public compile hook receives live shared height-atlas uniforms and world-chart varyings. Actual runtime geometry preserves native lightmap/albedo UVs. New Game, normal-off and Classic controls disable the procedural field. Native collision hulls remain byte-equivalent in their serialized data before/after world building and these controls.

## Brush-model finding resolved through the actual draw path

The first world-only review identified eight additional `rock1_2` faces 5940..5947 on E1M4 brush model `*64`, a `func_door` with targetname `t98`. This was a real rendering gap: classification alone did not annotate or render its field. The coordinator extended the shared chart build and existing brush draw/scheduler; the reviewing agent made no production edits.

The third public case reloads the actual E1M4 inline model, verifies its native surface identity, and calls **`R_DrawBrushModel`**. All eight surfaces join the same map-wide wall chart, giving **848 rock1_2 faces** (840 world + 8 brush) and **1,502 verified required faces** in total. The pure world-only chart API retains its original range. The merged drawn geometry contains every native triangle of all eight faces, actual meshes/materials automatically bind `rockField`, and their public compile hooks use live shared height-atlas uniforms. Every merged vertex carries maximum amplitude 0.8 and its rest-space field coordinates.

At the closed pose, rest coordinates match the adjacent world field. Translation plus a 90° yaw preserves cached geometry, source XYZ/albedo/lightmap bytes, and field phase; independent analytic transformed-eye and physical-distance expectations verify scheduling uses the correct material/rest space rather than reseeding the moving entity. Native door collision hulls stay unchanged.

An undrawn brush starts no requests. Drawing marks all eight faces, and the next world update accepts those previous-frame marks. Exactly **two endpoint transports** and **two pending jobs** are created; completed pages enter the shared atlas. A stale unseen door starts no new requests. Classic, normals-off, New Game and `r_rockfield=0` create no procedural marks/jobs while the original brush remains drawn. Reflection whole-world visibility and its PVS restore retain brush visibility.

Two initial test-harness failures are retained in `rockfield-required-materials-brush-attempt-01/02-2026-10-03.txt`: missing native-PAK registration in the new case, then a Float64 expected eye compared with the renderer's actual Float32 eye. They were corrected in test setup without production changes. The final three-case receipt is `rockfield-required-materials-tests-2026-10-03.txt`.

This suite verifies current source/geometry/material/scheduler interfaces, not final GPU appearance or frame-rate performance. The coordinator owns those live qualifications. This agent changed only the new test and evidence, with no production edits or commit/push.
