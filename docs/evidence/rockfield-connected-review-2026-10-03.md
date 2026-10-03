# Independent connected-surface review

`logo_review` independently planned and reviewed the material/role graph,
T-junction adjacency, projection area, ground-only guards, component identity,
worker dispatch and brush grouping. It found an asymmetric tolerance check on
long/short almost-collinear edges: face order changed the graph. Root replaced
that with symmetric common-segment endpoint distance checks; the reviewer and
`axe_review` reproduced one identical-seed component in both orders afterward.
The exact failing example is retained in the connected public-interface test.

`axe_review` owns the new connected tests and verified five public cases,
including actual native brush drawing with two disconnected faces sharing
texture/lightmap. Distinct meshes carry distinct component IDs, the exact
.35 saved amplitude, unchanged native attributes and live shared-atlas shader
binding. It independently checked all six source presets, VM core parity,
negative-coordinate tile gutters and both derivatives, and all 21 native BSPs.

`axe_plan` updated the two historical suites for the owner's changed contract.
An overstrict world-batch homogeneity assertion failed and is retained as
attempt-02. World batching legitimately carries different component IDs across
separate triangles. The corrected check requires each triangle to have a
single actual component ID, saved amplitude and matching projected UVs.
Brush merging still requires chart grouping because it annotates merged geometry
from one source surface. The final updated gate passes 12/12, with original
source geometry/UV/lightmap, PAK checksum, collision and disabled-mode guards.

Reviewers observed no remaining source/public-interface blocker. Their CPU
chart-build audit on stock maps took about 2–57ms. This is map-load work and
not a GPU performance receipt. Coordinator live cave measurements and browser
crash/stability limits are documented in the feature record separately.
