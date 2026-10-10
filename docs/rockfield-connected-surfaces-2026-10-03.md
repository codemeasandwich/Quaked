# Connected procedural rock surfaces

The owner clarified that the engine must walk matching texture coverage over
connected wall faces or connected ground faces, rather than treating all rock
in a map as one field. This increment replaces the prior map/profile grouping.
It also imports the saved numeric settings from `rockfield-v1.6.0.html`.

## Coverage and settings

Canonical texture names ignore case, animation prefixes and `.webp`. Matching
texture and resolved surface role define eligible neighbors. A positive-length
shared 3D edge joins faces, including long/short partial edges and BSP T
junctions. A corner-only touch, gap, different texture or different role does
not join them. Plane direction does not split a connected wall: the same field
continues around corners and onto tunnel undersides.

- Walls: `rock1_2`, `uwall1_2`, `bricka2_2`.
- Ground: `wgrnd1_5`, `wgrnd1_6`, restricted to signed upward normals above .65.
- Both: `rock4_1`, resolved by the same signed upward threshold; other
  orientations, including ceilings, use the wall field.
- Previously supported natural rock remains eligible, including requested
  `rock4_2`. Its earlier maximum block preset remains the fallback.

`src/newer/assets/rockfield_presets.js` starts from the six saved catalog presets. The
owner's screenshot `Screenshot 2026-10-03 at 16.11.16.png` supersedes only
`uwall1_2`: feature size 2.50, warp .65, fracture 0, detail 1.50, 64 intervals,
amplitude .80. The original donor HTML is retained unchanged.
`rock4_1` has only a ground preset in the supplied file; for its owner-requested
wall use the same saved numeric controls/amplitude are used with `profile=wall`.
No speculative blending or dominant-material override is applied. All six
embedded albedo hashes match the installed textures; those images are unchanged.
The 1.2 core supplied inside the 1.6 HTML has the same numerical algorithm as
its 1.0 predecessor. The optional earlier blockiness extension remains available
for fallback materials but is absent from the six saved presets.

## Continuous field and bounded streaming

The native BSP already contains the complete face coverage. At map load an
interval sweep over each material/role's edges, followed by exact collinearity
and overlap checks (tolerance .001 world units), builds connected components.
There are no rounded line-hash buckets that can lose fractional shared edges.
Component identities sort the unique native points, independent of traversal
order, polygon winding or PVS visibility. Each component gets a deterministic
map/component seed, one fixed projection and one preset. This is a full-map
coverage pass; generation of individual height tiles remains lazy.

Wall coordinates use the existing common oblique world/rest projection; ground
uses XY, at 256 world units per procedural tile. Actual position, rather than
repeating texture UV, selects a region of the mathematical field. Adjacent tile
windows therefore share values and derivatives in either direction, regardless
of request order. Expanding visible tile coverage does not reseed a component.
Procedural tile coordinates have no component-sized atlas or finite baked-map
limit. Adding or replacing BSP geometry is a map rebuild, not live topology
extension, and can change a component's identity.

The existing two-worker, two-outstanding-job and 96-resident-page limits remain.
Workers receive the chart's exact saved configuration, not the former hardcoded
maximum wall preset. The current/previous-frame PVS and brush visibility marks
retain their 100ms bounded scheduling policy.

Inline rock brushes join adjacent world coverage in their closed/rest position.
The existing renderer groups brush faces by texture, lightmap **and component**,
so disconnected faces cannot inherit the first face's chart. Moving brushes
retain their material/rest-space field; inverse-transformed eye coordinates and
physical transformed distance drive tile requests.

## Preserved behavior and verification

This remains shader-level virtual surface relief, with normals, cavity shading
and local self-shadow approximation. It does not add physical rock geometry or
alter silhouettes, native collision, texture UV, lightmap UV or gameplay. The
separate demon plaques continue using their real displacement meshes. Classic,
normals-off and relief-off retain the native path.

Independent planning and review cover component adjacency, fractional edges,
role resolution and brush batching. New public-interface tests exercise
synthetic folded/T-junction surfaces, disconnected and corner-only regions,
order-independent identities, exact donor worker requests and tile/derivative
parity, native BSP coverage, and actual brush shader binding. Historical
map-wide tests are updated to the owner's new same-material/role contract;
native-source and collision checks remain mandatory.

Try `http://localhost:8013/tests/rockfield_gameplay_trial.html`, walk into the
cave and use Relief on/off. This record describes a working implementation. The owner subsequently
authorized commit/push; that does not establish visual acceptance. Final rendered appearance and frame
performance require an attached browser observation; CPU/shader-interface
receipts alone do not establish them.

## Current receipts

The combined gate passed **86/86** (`evidence/rockfield-connected-final-tests-2026-10-03.txt`).
The independent connected suite passed 5/5; updated native/runtime suites passed
12/12. Across all 21 shipped BSPs the six selected materials cover 2,423 pieces,
plus 267 `rock4_2` pieces, including 32 brush pieces. There are 101 components
and 5,140 audited exact shared edges. The ground-only guard excludes 73 native
side/underside faces. The formerly required material counts remain 80/848/267/307
including the eight `rock1_2` door faces.

The attached E1M1 cave at `(592,984,-343.969)`, view `(-30,90,0)` reports all five
material probes as `uwall1_2`, `continuousRelief=true`, compiled `quake-detail-rock-v1`,
Classic=0. Atlas: 10 components, 96 resident pages, no pending work or errors.
The actual GPU off/on check changes relief-encoded pixels from 0 to 234,737;
a grazing-light probe changes that to 365,589; GL error is 0. These are actual
render-target receipts (`evidence/rockfield-connected-cave-live-2026-10-03.txt`),
not a CPU-generated comparison. A screenshot is retained alongside them.

A short 59-frame sample at 762x1654 pixels measured mean delivery 33.33ms off,
42.37ms on, medians 17.5/17.6ms. This variable sample is not performance
qualification. The first measurement at the trial's default position looked
at metal, not rock; it is retained as nonqualifying context only. After the
cave measurement and screenshot, the in-app page crashed. Its crash page's
`data:` URL prevented further controls through the browser policy. A fresh
same-browser preview was opened; no safety protections or native app controls
were bypassed. Sustained browser stability and owner appearance acceptance
remain unverified. At the time of that capture this increment was uncommitted;
the owner subsequently authorized commit/push.

The 16.11 tuning changes only the `uwall1_2` numeric configuration. Component
identities, seeds, coverage, connected edges and other material presets remain
unchanged. The existing worker/source-parity and native renderer tests use the
explicit latest screenshot values as their independent numeric oracle.

The screenshot tuning gate passes **17/17** in
`evidence/rockfield-uwall-tuning-tests-2026-10-03.txt`. Independent read-only
review confirmed only the `uwall1_2` numbers differ from the original catalog,
all other presets and source albedo hashes match, and chart-to-worker dispatch
uses the new values. The cache-safe preview server was restarted for this tuning.

## Authorized publication gate

The owner requested commit and push after completion of today's implementation.
The final combined gate passes **117/117** on the latest screenshot settings
and HUD artwork refresh (`evidence/rockfield-final-push-tests-2026-10-03.txt`).
Independent review found no missing implementation requirement. Actual Git
commit/push completion is confirmed separately from these pre-publication receipts.
The unrelated unintegrated shield/saw GLB is excluded and preserved locally.
