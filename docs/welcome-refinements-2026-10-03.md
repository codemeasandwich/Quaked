# Welcome hub refinements — 2026-10-03

The owner requested four times the default shaft intensity, destructible pinned
zombies, emissive lava that lights nearby surfaces, and the supplied SVG carved
into the welcome arch. These are working Newer Game changes, not a committed
release or owner acceptance. Classic artwork and combat remain native.

## Carving into the existing wall

The START arch's two original `quake` faces cover x400..688, y768,
z264..328. The adjacent wall and pillars use `wizmet1_2`, a 64×64 native
material upgraded to 256×256. Their native texture coordinates are S=x,
T=-z+8; the former logo faces use S=x-112, T=-z+8 and a 288×64
image. The 1152×256 replacement therefore samples the existing enhanced
wall at `(x+64)%256, y%256`. Every albedo texel comes directly from that
material. There is no plaque-colored rectangle, dark logo pigment, font
substitution, or reused original lettering.

`tools/build_hub_logo.mjs` rasterizes the actual `logo.svg` alpha, fits its
trimmed shapes within the original region, and subtracts 0.56×alpha from
the corresponding wall height, clamping at zero. Outside those strokes,
the wall height is unchanged. Geometry, collision, face UVs, scale and native
lightmaps stay unchanged. Existing authored offsets on neighboring faces are
preserved; this does not globally retile the level.

Normal strength compensates for the wider image: 1.2/sqrt(4.5), preserving
the surrounding material's normal slope. Optional `edgeSource` metadata
loads the existing wall height through the existing picture loader. Five
pixels of temporary neighboring height cover the two smoothing passes and
normal derivative, so the carving does not wrap its opposite edge into its
border. The default normal pipeline is unchanged for all other textures.
The existing parallax shader uses a common tangent scale, naturally reducing
horizontal UV displacement for the wider plaque; it keeps virtual depth in
the same world units. This is shader relief, not actual cut geometry.
The live head-on view showed that bevel normals alone made the cut too faint.
A smoothed reference of the unchanged wall height now provides local occlusion:
`depth = max(0, referenceHeight - carvedHeight)` and
`AO = clamp(1 - depth*3, 0.08, 1)`. Only lit reflected radiance is attenuated;
original albedo and emissive radiance are preserved. Uncarved areas have zero
depth and unchanged lighting. Classic bypasses the factor. The reference is
disposed with its normal map, and cached carved shader variants share updated
uniform holders across texture/mode changes. This is a bounded approximation
of light blocked inside a recess, not a ray-traced shadow guarantee.
Following the owner's request for a deeper shader cut, these two faces march
`(1-referenceHeight) + 8*max(0,referenceHeight-carvedHeight)` over a depth
range of six with 60 samples. The UV step and depth step both use six/60.
The unchanged wall contributes its original depth; only the cut is deepened.
Other materials retain the original ten-layer parallax path. This creates a
deep virtual inset without displacing the actual arch or collision. Its extra
samples are confined to carved faces, but general performance and all grazing
angles remain unqualified by the small working trial.
The first live flashlight view also exposed a deferred-lighting gap: added
flashlight radiance bypassed the material's recess occlusion. The original
RGB albedo now carries a separate byte-safe alpha tag for carving AO in
0.1312..0.49. Rock sun visibility keeps its existing 0.51..1 band, ordinary
opaque surfaces stay at one, and unavailable data stays zero. Deferred point,
sun, bounce and flashlight additions and reflection receivers decode the cut
factor; the already-shaded scene is not attenuated a second time. Bounce
source flashlight estimates use the same tag. Pixel availability checks now
accept valid carving tags. Original texture RGB remains unchanged.

Async texture arrival now dispatches a Three texture update event. Existing
detail materials refresh their normal maps through their registered texture
listener. Animation rebinds the listener and material disposal removes it.
This avoids a reverse renderer import that caused a real fresh-browser
`vrect_t` initialization failure during verification. The initial harness
preimport masked that failure; a new isolated entry-graph check explicitly
does not use that preimport. It holds back only `main()` itself, so it proves
module evaluation, while the fresh browser proves actual startup separately.

## Lighting and combat

The common volumetric compositing gain is four at the unchanged nominal
shaft slider setting of 0.5. Sun, point and flashlight shafts share that gain
once. Lava uses its native unlit texture and bounded pulse with a base glow
of four. Local polygon-patch emitters reuse the existing bounded light
database and illuminate adjacent opaque receivers. See
[lighting contracts and GPU measurements](lava-and-shafts-2026-10-03.md).

Native crucified zombies receive real weapon damage in Newer Game. Their
nonlethal hits retain the attached pose; lethal damage runs native zombie
head/gib death. Fresh maps and older saves are covered. See
[combat and save behavior](pinned-zombies-2026-10-03.md).

## Try and verify

Run the existing local server and open
`/tests/rockfield_gameplay_trial.html?level=start&pos=544,448,24.031&angles=-38,90,0`
for a safe standing view of the carved arch. The trial runs one ordinary
client/server. Enter the Hard hall to shoot a pinned zombie, or inspect its
lava pool. Normal Newer Game uses the same production paths.
The START-only **Inspect carving** button holds the real client at plaque
height with the flashlight on for visual inspection. **Hard entrance** or
**Restart level** restores ordinary movement. This elevated inspection view
is distinct from the standing gameplay view.

The initial combined 67/67 result is preserved in
`evidence/welcome-refinements-tests-2026-10-03.txt`; it predates the final
wall-continuation refinement and is not evidence for that later asset.
`evidence/hub-logo-assets-2026-10-03.json` records source provenance and the
current exact asset transform. Public tests compare every installed albedo
and height texel against the wall and SVG, inspect source-matched normals
including boundaries, test async refresh and Classic restoration, and
evaluate the fresh production module graph. Final combined evidence and
live images are retained alongside this document.
The earlier wall-continuation gate passed **69/69** in
`evidence/welcome-refinements-final-tests-2026-10-03.txt`; the independent
logo, fresh-entry and existing texture pipeline checks passed **10/10** after the deep-cut refinement.
`evidence/welcome-refinements-identity-2026-10-03.json` ties the production
files and generated assets to this uncommitted snapshot.
The ordinary parallax sampler still repeats the carved image at its outer
UV boundary; the exact source-phase/normal tests do not establish seam-free
GPU appearance at every grazing angle across that boundary.

The bounded GPU fixture separately measured approximately 4.39× lava source
radiance, fourfold shaft gain, and 97 brighter neighboring receiver pixels
with zero GL errors. Native QuakeC weapon tests prove pinned-zombie damage
and death. These checks do not establish general GPU performance, arbitrary
mod compatibility, or owner visual acceptance. No commit or push was made.

## Current result

The final six-inch-appearance shader snapshot passed **70/70** combined
checks in `evidence/welcome-refinements-six-inch-tests-2026-10-03.txt` and
**10/10** independent logo/entry/texture checks. The fresh live START game
confirmed a compiled carved program, actual 1152-wide normal sampler,
256-wide reference sampler and Classic uniform zero. The visibly cut logo
and deep interior shadow are saved in
`images/hub-deep-carving-2026-10-03.jpg`; sampler bindings are saved in
`evidence/hub-deep-carving-live-bindings-2026-10-03.json`.

The virtual cut reaches approximately 5.7 Quake units for the full .56
height difference, intended to read as roughly six inches. It is not a
physical measurement or geometry change. The earlier mild-AO live view
remained too faint, so it did not qualify the requested appearance; the
final deep-AO view visibly shows the cut. Owner aesthetic acceptance remains
separate. Head-on rendering is observed; arbitrary grazing angles and
general performance have not been established. The local server and one
real trial tab remain available. No commit or push was made.
