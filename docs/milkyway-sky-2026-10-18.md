# Welcome hub sky replacement — 18 October 2026

Current owner update, 19 October 2026: see [gameplay feedback](gameplay-feedback-2026-10-19.md)
for native-cue replacement admission, instant water ambience, capture fixes and
revised sky/DoF policy. Historical verification receipts below retain their
original tested source; they are not relabeled as proof of this successor.

## Owner outcome and native identity

The owner requested the Quake 1 introductory welcome hub's sky to be identified
and replaced everywhere that artwork occurs, using the supplied
`/Users/bri/SOURCE/QuakedResources/sky_pano_-_milkyway.zip`. The existing clouds
must remain, lightened and very faint in front of a deep star field.

The hub is `maps/start.bsp`; its native texture is `sky1`, 256×128 palette indices.
It is a two-layer scrolling sky rather than a six-face named skybox. Its mip-zero
SHA256 is `40d6d0aad0622e29dedfcbfbca4f7c3794e7ec188cd62190a4ac522332a96b2b`.
The exact same artwork occurs under other names, including `sky4` in E1M5–E1M7.
E1M1 also calls its sky `sky4`, but uses different artwork and keeps it.

The implementation matches BOTH original split RGBA layers with the existing
R_GlassTextureKey helper: solid `128x128:5ad746b445c2c41e` and alpha
`128x128:b7a1ae6d577f3ae7`. Thus matching artwork in any loaded map is replaced,
regardless of its name. Same-name custom artwork, other palettes and explicit
named add-on skyboxes retain their existing selection. Independent native BSP
face/texinfo inventory and source hashes are in
`evidence/milkyway-sky-2026-10-18/identity.json`; archive occurrences include
overrides/duplicates and must not be described as distinct playable levels.

## Reuse, rendering and lifecycle

The main renderer retains its existing sky surface meshes and depth/fog/glow
contracts. `r_milkywaysky.js` supplies a background material sampling the original
4096×2048 equirectangular JPEG by unflattened camera-relative world direction.
It uses a documented conventional Z-up orientation: +X at image seam U0, -Y at
U.25, -X at U.5, +Y at U.75, north V1 and south V0. This tests the chosen projection
convention, not an exact reproduction of the archive's separate glTF sphere UVs.
Stars remain stationary as native cloud UVs scroll independently.

The original alpha texture remains the cloud mask. Its color is lightened toward
a cool neutral tint in the shader, at opacity 0.012. The initial 0.08 blend looked
too prominent on actual hub GPU output; the final faint blend was inspected on
the same native geometry. No native texture pixels are edited. Native cloud
movement, existing sky fog and glow behavior remain in use. Level lighting and
its native sky cookies are preserved; this change does not silently rebalance
map lighting.

Neighbor levels viewed through portals already have a separate sky shader.
That existing shader now uses the same panorama direction and faint-cloud helper,
per-model identities and per-material uniforms; its MRT outputs, native fallback,
cloud movement and glow remain intact. Preview loading never overwrites the
active map's native sky globals. Explicit worldspawn sky names keep precedence.

Newer Game and its texture switch control the replacement. Classic Game and the
Classic half of the title demo retain their original sky. One global panorama
loads lazily only for matching artwork. Until success, or on failure, the native
sky draws. Loading is bounded at 30 seconds; a failure does not retry every frame.
Map clear disposes only map-owned materials and may rearm a failed request. The
single successful/shared image remains reusable across levels. Late callbacks
cannot attach a replacement to a disposed material or a nonmatching world.

## Supplied asset and license

`newer/textures/skies/milkyway.jpeg` is a byte-identical copy of the archive's
`textures/lambert1_emissive.jpeg`. The original glTF mesh is unnecessary for the
engine's direction-based sky surfaces. The full original license, author credit
and archive/image hashes are retained beside the asset and in the texture credits.

The archive identifies “Sky Pano - Milkyway” by MozillaHubs as CC-BY-NC-SA-4.0,
requiring attribution, noncommercial use and share-alike for modifications.
The trial displays the credit/license. These supplied terms do not become the
repository's general code license. Public/commercial distribution must respect
that separate asset license; no commercial-use clearance is claimed.

## Verification and owner trial

Independent public checks cover the real shareware sky1 and both distinct/matching
sky4 cases, full JPEG hash/dimensions, chosen UV direction anchors, lazy success
and failure, map clear, late callbacks, no native mutations, existing sky-chain
mesh reuse/cloud motion, Classic and named-sky precedence, and actual public
R_BuildLevelView MRT/identity behavior. Related skybox, post-sky and hook checks
also run. Logs and independent review are retained in the evidence directory.

The browser trial uses actual shareware BSP geometry and production
R_BuildLevelView materials, not a sky mockup. It offers the welcome hub, a matching
Gloom Keep sky and a different Slipgate Complex sky, drag-to-look and an original
sky toggle. Actual Chrome GPU compilation, screenshots and pixel evidence are
retained in `browser.json`, `hub-milkyway.png` and `hub-original.png`. Main
R_DrawSkyChain integration is independently checked through its public boundary.
This is a working trial; it does not claim a played campaign or owner acceptance.

Try the open local preview, or serve this worktree and open
`tests/milkyway_sky_trial.html`. The source integration applies in normal Newer
Game as well. The generated web build is a separate runnable product artifact;
its inventory and source-input hashes establish which working files it contains.
An uncommitted working-tree build is not an exact-index release receipt.

## Coordination and delivery ledger

Responsible owner: this Codex session. Scope is the supplied sky replacement,
source integration, verification, documentation and an owner-visible working
trial, in the reused worktree
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, based on sound delivery
`ab430e348a1b16c4e93df3c518cebcdb8ad2a1cc`. The primary checkout's unrelated work
is preserved. This new sky request does not itself ask for a commit/push or release.

The supported Bluey agent_whoami call failed with enrollment storage_error,
correlation `ab2afadc968849219ee2423563615a3f`; mutation outcome was unknown and
no card update is claimed. This ledger retains the obligation, actual evidence,
responsible owner and next action until the existing appropriate sky card can be
reconciled when the service returns. Independent planning, public-interface
verification and review are coordinated live within this session. No durable
worker handoff is claimed.

Final verification: 21/21 combined public/regression checks and 58/58 distribution
contracts pass. Actual Chrome renders the hub's neighbor-view materials and all
72 native main-renderer sky faces with no page/shader errors. The HDR off/on trial
caught a real shader cache specialization error: changing depthWrite initially
reused the opaque shader's albedo/height packets. The final material cache key
includes depthWrite and transitions mark needsUpdate. GPU readback now verifies
zero normal/albedo/height packets for the HDR sky; the new public regression
covers off → on → off, stable geometry and reversible program variants.

The final web build succeeds and includes the unchanged original JPEG and license
at priority 0. Its source-input hashes match the implemented renderer files; see
`web-build.json`. The prior web output was retained at
`dist/retained-web-abb027ab615afc80`, and intermediate build/capture/failure logs
remain in the evidence directory. No universal Mac gate or exact-index release
is claimed for this working tree.

Current next action: owner visual acceptance of the sky and cloud strength through
the running local preview at `http://127.0.0.1:52187/tests/milkyway_sky_trial.html`.
The local preview helper is exec session 87991, started by this session; it is not
a durable worker handoff. Changes remain in this worktree for review. Reconcile
the existing sky card when Bluey becomes available. Publication remains a separate
outcome subject to the supplied asset's noncommercial license.


### Subsequent distribution authority

The owner's later request on 18 October explicitly requires all latest project
work to be merged into Dev before creating the complete distribution. That now
authorizes including this tested sky change in the combined integration and Dev
push. The full-distribution ledger supersedes the earlier uncommitted-review next
action; subjective visual acceptance remains separate from build verification.
