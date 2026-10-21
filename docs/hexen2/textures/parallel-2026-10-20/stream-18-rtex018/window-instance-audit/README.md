# rtex018 native window-instance topology facts

Read-only audit of all218 selected native faces in the actual recorded maps cath and demo1. S/T vectors and offsets are evaluated on the ordered vertices reconstructed from each face’s signed surfedges. UV coordinates use native64×256 cells. Actual convex polygons are clipped to each cell; touching edges and bounding-box-only cells are not counted as positive coverage. Public PAK/BSP/native-proof hashes, all vertices/edges/vectors/offsets, clipped coverage polygons and examples are retained in evidence.json.

| Compiled fact | cath | demo1 map |
|---|---:|---:|
| Selected faces |206|12|
| Faces exactly covering one full UV cell |0|0|
| Faces confined to one partial UV cell |42|0|
| Faces intersecting multiple cells with positive area |164|12|
| Vertical faces |158|8|
| Upward / downward horizontal faces |24 /24|2 /2|
| Selected inline brush models / entity references |21 /21|2 /2|
| Selected faces in world model |0|0|
| Compatible coplanar/mapping groups |126|12|
| Positive-length compatible adjacency pairs |84|0|
| Multi-face adjacent components |72|0|
| Full UV cells covered by a compatible group |20|0|
| Those full cells requiring multiple face pieces |20|0|

Every selected inline model is referenced once by a compiled breakable_brush entity. All of that model’s faces use rtex018. Cath models are *6..*17,*28..*33,*35,*37,*39; demo1 models *20 and *21 also carry abslight .5. These are compiled brush/model/entity facts, not a count of individual visible windows. The23 entities may represent banks, front/back/edge surfaces or cropped repetitions. No runtime entity transforms, spawning, visibility, breakage behaviour or camera exposure was measured.

A consequential multi-cell example is cath model*6, faces5791/5792: S=(0,1,0,176), T=(0,0,-1,0). Both cover U15..18, while V splits at−.125 between−1 and0. Neither face covers a complete unit cell on its own; together this compatible coplanar group covers three full cells. This is three repetitions of the native artwork on that surface group, not proof of three distinct physical window objects. A model-wide single scene could repeat across these cells.

A partial example is cath face5785, model*6, S=(1,0,0,936), T=(0,−1,0,0): U2.75..3 and V−3.8125..−3.0625. It is a fraction of one UV cell on a horizontal surface, illustrating why a selected face is not a whole window.

A non-integer/offset example is demo1 face4054, model*20: S=(1.1764705181121826,0,0,−13), T=(0,−1,0,90), U−3.58548..−3.29136,V7.9453125..8.1640625. Its polygon crosses a cell boundary but does not establish two windows. The full exact records cover all12 demo1 faces; none is a single complete native cell.

Shared-fragment audit requires the same inline model, side-adjusted plane and S/T basis with equal offset phase modulo64×256. Positive-length shared segments are checked, including collinear T-junction overlap; point contact is excluded. Compatible face pieces are checked for positive-area UV overlap before summing group coverage. Rotated/mirrored/different-basis surfaces are not merged. The20 cath full-cell coverages can include opposite sides of the same assembly and MUST NOT become a window-instance count. The614 cath and40 demo1 positive face-cell incidences likewise are not window counts.

The model-lump reader uses the actual Hexen II80-byte layout (eight headnodes); all selected model ranges/unique face ownership and entity references validate. An initial audit-only Quake64-byte assumption failed the lump-size assertion and was retained in rejected-quake64-layout.json; no output from it was accepted and no engine code changed. This is a native-family boundary for the runtime work, not a claim that Quaked currently handles those native models.

Six manual clipping oracles plus convex-overlap and positive-length adjacency fixtures pass. The main run also validates every polygon’s clipped-area sum, closed surfedge loops, convexity, nondegenerate S/T plane basis, ordinary flags, actual member/hash provenance and all watched input bytes after inspection. These are author audit checks, not independent acceptance.

Implication for root’s plan review: world-face-only assignment misses this selected native usage; per-face choice can disagree across split artwork, while one model/entity choice can repeat the same scene across several UV cells. The audit provides the geometry and identity facts needed to choose a supported window key; it does not select or implement runtime policy. No confirmed physical-window total is asserted. No engine/asset/model-call/Git/build changes.
