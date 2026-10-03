# Required rock material coverage

Historical receipt for the first brush-coverage increment. The later owner
clarification and v1.6 settings supersede its map/profile grouping and strengths.
See `rockfield-connected-surfaces-2026-10-03.md` for the current contract.

After the preceding enhancements were committed and pushed as `2b1593b`, the
owner requested continuous rock relief on at least `bricka2_2`, `rock1_2`,
`rock4_2` and `uwall1_2`.

The existing classifier and production world path already covered all 1,494
matching world faces across the shipped maps. An independent audit found eight
additional `rock1_2` faces on E1M4's `func_door` brush model `*64`. Those were
not covered by the former world-only chart and scheduler; classifier eligibility
alone did not make their material render relief.

| Texture | World faces | Brush faces | Map |
| --- | ---: | ---: | --- |
| bricka2_2 | 80 | 0 | START |
| rock1_2 | 840 | 8 | E1M4 |
| rock4_2 | 267 | 0 | E1M5 |
| uwall1_2 | 307 | 0 | E1M1 |

Production chart construction now optionally includes eligible inline brush
surfaces in the same map/profile field. The public chart helper keeps its
world-only default for callers explicitly inspecting world ranges. Both paths
use the same wall seed, projection axes and maximum amplitude of 0.8. Texture
names, BSP cuts, slopes and ceiling orientation do not reseed the field.

Brush geometry receives the existing field attributes, and its cached/animated
materials use a separate rock shader cache key. The closed rock door matches
its adjoining wall. Its rest-space field moves with the rock material when the
door moves, preserving the texture's local relationship to the relief. Rendered
brushes mark their visibility, inverse-transformed eye position and transformed
world distance for the existing bounded scheduler. Because entity rendering
follows the world update, current/previous-frame visibility marks are accepted.
The two-job/96-page bounds and 100ms request interval are unchanged.

This is the existing shader-level deformation system. It does not displace
brush geometry or alter door physics, BSP collision, native positions, texture
UVs, lightmaps or entity data. Classic, normals-off and relief-off retain their
existing behavior. Offscreen brush reflections/probe tile readiness remain
outside this coverage receipt; the extension preserves the existing reflection
visibility policy.

Independent public checks pass **3/3** in
`evidence/rockfield-required-materials-tests-2026-10-03.txt`. They exercise
actual BSP world batching and `R_DrawBrushModel` for all eight door faces,
registered shader/atlas bindings, translated and rotated request coordinates,
bounded/stale/off requests, classic controls and native-source invariants.
3,063 native shared edges include 57 texture changes, 1,410 plane changes and
461 ceiling edges, all with the same continuous height/coordinate field.
The independent review is saved in
`evidence/rockfield-required-materials-review-2026-10-03.md`.
The combined source, renderer, option, Classic and rock-field regression gate
passed **42/42**, retained in
`evidence/rockfield-required-materials-regression-2026-10-03.txt`.

The preceding commit/push is complete. This subsequent brush-coverage increment
and its tests/documentation were then retained in the working tree for review.
The later connected-surface record supersedes this receipt and records the
owner's subsequent commit/push authorization.
