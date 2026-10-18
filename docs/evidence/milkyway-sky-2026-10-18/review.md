# Independent review: welcome-sky identity and Milky Way composition

Reviewed 18 October 2026 in
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, based on
`ab430e348a1b16c4e93df3c518cebcdb8ad2a1cc`.

The reviewer independently inspected the native archive data, existing main and
neighbor-view sky architecture, supplied panorama archive, final implementation,
retained tests and GPU trial. The reviewer authored only `identity.json` and
this report. Another independent agent authored the public-interface tests;
the coordinator implemented the product change.

## Source conclusion

No outstanding blocking source findings. The implementation reuses existing
sky surface meshes, native cloud textures and motion, existing sky fog/glow/depth
rules and neighbor-view MRT shaders. It replaces only the identified artwork
in Newer mode with enhanced textures enabled. Classic, the Classic split pass,
unrelated skies and explicit named skyboxes retain their existing behavior.

Current verification establishes source/public-interface behavior, an actual
neighbor-view GPU trial and actual main sky-chain GPU rendering against
controlled HDR targets. A complete postprocessed played-game session, full
product build and owner visual acceptance remain separate receipts.
The latest request did not grant a new commit, push or release authority.

## Independently established identity and scope

Shareware `maps/start.bsp`, the owned Quake 2021 start map and the enhanced
`newer/maps.pak` welcome hub all contain the same **256x128** `sky1` artwork.
Its mip-zero indexed-pixel SHA-256 is:

`40d6d0aad0622e29dedfcbfbca4f7c3794e7ec188cd62190a4ac522332a96b2b`

The same artwork occurs under `sky4` and additional add-on aliases. A name-only
replacement would either miss real uses or affect unrelated same-name artwork.
The runtime correctly compares both complete native split RGBA layers through
the existing `R_GlassTextureKey` helper. The reviewer independently reconstructed
those layers from the actual native pixels and palette and reproduced both
runtime keys:

- Solid: `128x128:5ad746b445c2c41e`
- Alpha: `128x128:b7a1ae6d577f3ae7`

This includes palette-derived colors and the native transparent fringe color;
source palette bytes, indexed pixels and cloud masks are not mutated.

`identity.json` records the actual archive/map/texture index/name, dimensions,
mip-zero and all-mip hashes and number of referring faces. The read-only scan
covered **30 PAK archives and 765 Quake-format BSP members**, excluding
Hexen/Heretic archives. It found **119 face-referenced archive occurrences**:
111 in the installed owned Quake archives, seven in the distribution-cache
shareware input and one enhanced welcome hub. The installed base Quake archive
alone contains 31 matching map occurrences; shareware contains start and
E1M2 through E1M7.

The observed aliases are `sky1`, `sky4`, `sky10`, `sky1_azad`, `sky_sep`,
`sky_seprain` and `skymon`. Lower mip data has two variants while the rendered
mip-zero artwork is identical. Comparing the actual split layers correctly
recognizes that shared rendered artwork.

These are **archive occurrences**, retaining duplicate/overridden map members,
not 119 independently selected gameplay maps. Thirty-six have an explicit
worldspawn sky name; their skybox precedence must be assessed separately. The
other 83 are candidates without a named override. The inventory does not claim
PK3/loose-file coverage or override resolution, and a different active palette
can still cause the stricter runtime RGBA match to reject indexed lookalikes.

## Main, neighbor and lifecycle boundaries

The regular texture replacement path deliberately skips skies. The final change
therefore selects the new material at `R_DrawSkyChain`, preserving the existing
geometry and separate native cloud mesh. It also updates the distinct
`R_BuildLevelView` sky shader so the same matching artwork changes in neighbor
views without letting a preview replace the active world's sky globals.

The shared lazy JPEG is selected only by a current eligible draw. Until it is
ready, or after failure, the original sky remains visible. A late callback after
map clear can populate the shared image cache but cannot attach it to an old or
nonmatching material. Failure is observable through status, does not retry every
frame and rearms at explicit map clear. Map clear disposes owned replacement
materials exactly once and retains the shared source image plus borrowed native
textures. The matching cache follows the immutable native texture pair.

Native cloud UVs retain their original flattened-dome projection and timing.
Stars use the unflattened camera-relative world direction and remain stationary
in world orientation. The current cloud opacity is **0.012**, with a lightened
cloud color and the existing native alpha mask. Earlier 0.08 assertions and the
initial visual tuning are superseded by the current independent rerun.

The neighbor shader retains its own native textures, per-material uniform
holders, current visual eligibility and existing `gNormal`, `gAlbedo` and
`gHeightMask` outputs. No panorama or neighbor image is installed as a global
sky command or worldspawn override. The extracted `R_SkyBoxMapName` function
preserves the existing key parsing and named-sky selection behavior.

## Panorama source, orientation and license

The reviewer independently verified the runtime JPEG is byte-identical to
`textures/lambert1_emissive.jpeg` in the supplied
`/Users/bri/SOURCE/QuakedResources/sky_pano_-_milkyway.zip`: **4376252 bytes**,
**4096x2048**, SHA-256:

`a77472cc4237fb0b5655cd344cf0768a547102ab0cebe67ab053e66749e92755`

The archive hash, image hash, native identity and source palette hash are
retained in `identity.json`. No generated replacement art, re-encoding or
resolution reduction was substituted.

The engine intentionally uses a conventional native Z-up equirectangular
lookup and six documented projection anchors. It uses the source image, not the
supplied sphere mesh. Inspection found that the sphere's own UVs have an
approximately 0.02 horizontal offset (about 7.2 degrees) relative to that chosen
convention. The selected renderer orientation is consequently a deliberate
mapping choice, not an exact reproduction of the supplied glTF mesh alignment.
The independent test wording was corrected to reflect this distinction.

The actual supplied license identifies MozillaHubs and CC-BY-NC-SA-4.0. Its
original text and provenance are retained, credits were added to the texture
credits, and the GPU trial visibly displays attribution and a license link.
This review records those source terms; it does not certify commercial
redistribution or authorize publication.

## Verification inspected and proof limits

The independent agent reran the final opacity/orientation assertions plus the
new main HDR cache-transition regression and reported **12/12 passing**, exit
zero, in
`/private/tmp/milkyway-sky-tests.log`. The reviewer inspected that log and the
tests. The checks use actual native `R_InitSky` data: start `sky1` and E1M5
`sky4` qualify, while unrelated E1M1 `sky4` remains native. They cover altered
pixels, all visual gates, lazy loading/failure/retry, late callbacks, image
identity/dimensions, original texture preservation, material cleanup, chosen
projection anchors, fog, actual public sky-chain mesh reuse/cloud movement,
explicit cube-sky precedence, actual neighbor-view uniform/MRT contracts and
main sky-chain depth-mode program transitions without material/geometry churn.
Only JPEG transport is doubled; these Node checks do not claim GPU rendering.

The reviewer also inspected `/tmp/quaked-milkyway-baseline.log`: **9/9 passing**
existing skybox, sky-analysis and hook checks. No broad compiler/build operation
was run by this reviewer.

The reviewer read `browser.json` and visually inspected `hub-milkyway.png`.
They establish a successful actual Chrome GPU trial of real shareware welcome
BSP geometry through the production **R_BuildLevelView neighbor shader**, with
the panorama ready and no reported errors.

The initial main-renderer GPU check found a real implementation failure:
`/private/tmp/quaked-milkyway-main-mrt-initial.log` reports the HDR sky retaining
opaque surface packets after a non-HDR-to-HDR transition. Its sampled MRT
packets included albedo `[20,17,22,255]` and height `[255,255,255,255]` where HDR
sky requires unavailable-surface zeros. The earlier neighbor-only GPU trial did
not exercise that material/program boundary; the failure is retained plainly.

The coordinator fixed both necessary cache conditions: the new background
material's program key includes its current `depthWrite`, and the main sky
selector marks that material `needsUpdate` only when depth writing changes.
Independent source review confirmed why both are required: the shared G-buffer
patch specializes on depth writing at compile time, while Three must be told
to choose the correct distinct variant. The existing fog-key wrapper preserves
the dynamic key. Repeated draws in one mode do not force program churn.

The final actual Chrome run in
`/private/tmp/quaked-milkyway-main-mrt-final.log`, also retained as
`browser.json.mainSky`, passed both modes using **72 actual native hub sky
faces through production R_DrawSkyChain**. The non-HDR draw has depth writing
and its expected sampled albedo/height packets. The controlled HDR draw has
`depthWrite:false` and sampled normal/albedo/height packets all zero. Both
rendered nonempty sky coverage, retained cloud opacity 0.012 and reported no
browser errors. The independent public regression additionally exercises the
same mesh/material/geometry across false-to-true-to-false HDR transitions,
program-key/material-version changes and the actual compiled G-buffer packet
assignments. This closes the previous main-material GPU evidence gap.

The earlier before/after record was not accepted because its nested frame
metadata still said `original:false`. The current capture now records verified
state at capture time: Milky Way `current.original:false, current.enabled:1`
and native baseline `current.original:true, current.enabled:0`. Those explicit
snapshots supersede the stale initial frame label and support the retained
visual comparison.

Owner acceptance, a complete postprocessed played-game session, a working
distribution build and any later qualified release remain distinct from the
bounded main/neighbor GPU trials and this source review. No additional source
changes are requested by this review.

The bounded GPU checks and public tests do not qualify the universal Mac build
gate. Any coordinator web-build or distribution-test success must retain its
own receipt; it is separate from a Mac gate, commit/push, deployment, release
and explicit owner acceptance. No new publication authority is inferred from
this sky request.
