# Bubbled stained glass — base game and resource expansions — 2026-10-05

The owner requested the rounded, shiny stained-glass panes in the supplied
reference, then extended normal-map coverage to all expansion packs in
`resources`. The reference matches the supplied `window02_1` material.

This increment installs source-bound window normal, height and gloss assets and
uses the existing Newer texture upgrade, normal-map, lightmap material and HDR
lighting paths. It adds rounded-pane highlights from the current point lights,
sun and flashlight. Native BSP geometry, collision, UV/lightmap periods,
fullbright separation and gameplay are unchanged. The earlier white Quad flame
and imported blue Quad particles remain intact.

## Coverage and identity

The inventory scans **535 effective BSP maps** from base plus all nine resource
expansions: Scourge of Armagon (`hipnotic`), Dissolution of Eternity (`rogue`),
Dimension of the Past (`dopa`), Dimension of the Machine (`mg1`), Arcane
Dimensions (`ad`), Quoth, Abyss of Pandemonium (`aopfm_v2`), Malice and X-Men.
Engine/client/HUD packs containing no campaign BSPs are outside the window
inventory. It finds **133 named native pixel/palette variants**, resolving to
**130 registered window materials** after equivalent RGBA variants are shared.
One turbulent `*glass01` asset stays on the existing liquid path; its generated
maps are retained in provenance, without replacing that renderer.

All 133 candidates receive normal/height outputs. Thirteen inventory variants
reuse matching supplied authored maps; the other 120 receive generated maps.
Stained/leaded panes use connected-pane distance caps. Plain, control and the
six visually uncertain decorative candidates receive matte relief with zero
gloss. Classification is explicit and source-bound; it is not a rule that
turns every name containing "glass" into a shiny window.

See [source inventory and output hashes](../newer/textures/glass/provenance.json)
and [visual source sheets](evidence/glass-candidates-0-2026-10-05.png).

Names are insufficient: AOP uses blue serpent artwork under names also used by
base orange/red windows; `window03` differs even within base maps. The manifest
`glass` table matches native dimensions and a double-byte hash of reconstructed
original RGBA, including fullbright pixels. Palette hashes and source indexed
pixel hashes are retained. Palette index255 follows the renderer's black RGB
convention. Unknown variants of known glass names retain native art rather
than taking a conflicting global replacement.

## Source and renderer contract

`r_newertextures.js` selects only an exact variant, loads its diffuse, opaque
normal RGB, grayscale height and gloss through the existing pack-aware bounded
loader, and assembles normal RGB plus height alpha in typed data. Storing height
as PNG opacity loses RGB through canvas premultiplication; the separate files
avoid that loss, including zero-height normals.

`gl_normals.js` reuses the supplied/generated tangent normals directly and owns
the optional gloss texture with the normal. Missing/mismatched normal assets
fall back to generated relief; missing/mismatched gloss stays matte. Existing
texture-update events refresh the registered material's stable sampler holder
and shader variant. Disposal follows the existing texture/material lifecycle.

`gl_post.js` uses the existing opaque material and shadowed live-light paths.
The binary glossy-pane tag is RGBA8 alpha0.5, in the gap between carving and
rock metadata; actor/held tags remain separate. Supplied gloss selects panes;
lead/frame pixels keep their ordinary material tag. Glass uses the full normal
response and the existing specular calculation, scoped to that tag. Other
materials preserve their prior lighting and normal response. Normal-off removes
the tag; native Classic rendering has no glass layer.

The archive's window shader credits QRP, Seven and Nahuel. Matching donor
normal/gloss/diffuse entry hashes are retained per output. Authored normal alpha
is preserved without stretching its range; green is inverted once to agree
with Quaked's tangent convention. Expansion-specific material artwork and
palette are retained for generated variants. Source-aligned authored donor
sets retain the supplied artwork.

This reproduces pane relief and live-source sheen. It does **not** port the
source engine's `dp_reflect` environment capture or introduce transparent,
refractive world geometry. Generated expansion pane masks are an authored
approximation requiring visual acceptance, especially composite windows.

## Trying it and authoring

Open [the local trial](http://127.0.0.1:8027/tests/glass_materials_trial.html).
Move the light, turn the view, compare normals, or select another campaign's
window. Its 130 entries use original native pixels to exercise the real upgrade
and `createQuakeLightmapMaterial` paths. The default is the reference's base
`window02_1`. In normal Newer Game, windows using these native identities receive
the treatment automatically. Reload the browser to load the new manifest.

The generation tools live in `tools/glass_materials`. Run inventory then
material generation with Python, NumPy and Pillow:

```
python3 tools/glass_materials/inventory.py --out /tmp/QuakedGlass
python3 tools/glass_materials/generate.py --out /tmp/QuakedGlass --archive /Users/bri/Downloads/Quake/Id1/PAK3.pk3
```

These write a staging directory, not the checkout. Review new/uncertain
classifications and the generated images before installing them. Keep the
manifest's ordinary texture/height entries, merge only the `glass` table and
advance its version. Preserve opaque normal RGB plus separate height files;
regenerating a normal-with-height PNG as opacity would reintroduce the decoder
failure. Keep pack content names and native identity keys unchanged.

## Owner corrections: current pane-only implementation

The first increment used whole-texture inference and its masks were too broad.
The owner rejected overexposed sheen/lead washout and then demonstrated sheen
on stone and frame around a red roundel. Earlier GPU receipts prove that older
implementation's rendering, not correct glass-region selection. The following
regional version supersedes those appearance and scope claims.

Both source reviewers inspected all130 actual replacement images, including
individual circular and composite windows.96 contain identified glass and34
contain no identifiable glazing. The explicit source-bound review in
`region-review.json` excludes masonry, wood, metal surrounds, crests, sculpture,
opaque panels and controls. The red `window03` mask covers its central red panes,
not its carved surround or wall. Multi-window textures have separate regions.

Only glass pane pixels receive donor/recomputed pane normals and height. All
other pixels—including internal dark lead—use the canonical ordinary
`R_GenerateNormalData` baseline on the unchanged actual diffuse image. The
current glossy map uses R for reflective panes and G for the reviewed glazing
opening (including lead). G sharpens pigment sampling only inside that opening;
R*G allows full pane normals/highlights only there. Outside remains ordinary
normal softness and four-texel pigment filtering. Original diffuse plus emissive
pigment guards dark leading, and glass specular gain is reduced from.55 to.12.
No global exposure or other material lighting changes were made.

Inspection lighting in the small trial was raised to make colors/frames legible;
that fixture change does not alter game lighting. Reload the game/browser to
load manifest2026100502 and the corrected shader/assets.

The raw generation command above is preparation only. Before installing outputs,
run the mandatory ordinary baseline and reviewed-region stages:

```
# Real Three.js183 and @napi-rs/canvas must be available (same runtime as tests).
QUAKED_THREE_MODULE=/absolute/three.module.js QUAKED_CANVAS_MODULE=/absolute/@napi-rs/canvas/index.js node tools/glass_materials/baseline.mjs --stage /tmp/QuakedGlass
python3 tools/glass_materials/apply_regions.py --stage /tmp/QuakedGlass
```

`regions.json` binds each review to source identity and diffuse SHA256. Unknown
or changed art is rejected for new visual review; raw whole-texture maps must
never be installed directly. Opaque normal RGB/separate height remains required.
Runtime image filenames are under the55-byte PACK name limit; byte-identical
shortened paths were checked through the real pack loader and Blob URLs.

## Verification and acceptance

- Independent planning and review checked architecture reuse, identity,
  palette handling, Classic separation and shader/resource ownership.
- [Focused regression/interface gate](evidence/glass-tests-2026-10-05.txt):
  39/39 pass. The independent glass suite includes actual update events,
  malformed assets, cache/disposal, fullbright key reconstruction, source
  mismatch rejection and zero-height RGB preservation.
- [Native public-loader receipt](evidence/glass-native-interface-2026-10-05.json):
  all ten campaign sets and 62 actual BSP window materials pass, including
  seven fullbright AOP materials and custom Malice/X-Men palettes.
- [Base GPU receipt](evidence/glass-gpu-2026-10-05.json): decoded normal bytes
  exactly match the output hash; moving-light and normal-toggle changes are
  nonvacuous, Classic changes zero RGB components, and all GL errors are zero.
- [Expansion GPU receipt](evidence/glass-expansion-gpu-2026-10-05.json) records
  bounded material samples, not full campaign playthroughs.
- [Implementation identities](evidence/glass-source-2026-10-05.json) bind the
  current source/assets to the verification. [Preview](evidence/glass-preview-2026-10-05.png).

Retained negative tests reproduce the decoder and unknown-name fallback bugs
before their corrections. The first GPU Classic comparison incorrectly used
the enhanced compositor on native artwork; the corrected oracle uses the
existing native Classic material/render path. An initial oversized AD public
loader candidate hit the existing512-model limit; the recorded bounded native
trial uses supported `ad_akalakha`. These are material tests, not qualification
of every expansion map's engine compatibility or sustained frame rate.

Owner appearance acceptance remains open: inspect the base reference and the
expansion windows, especially generated composite masks. No commit, push or
release is implied. No expansion gameplay system was added by this increment.


### Current regional receipts

-42/42 focused regression, native interface, compiler and actual-image checks
pass. The independent regional checks cover all130 materials;16,933,079pixels
outside glass panes (including4,446,002leadpixels) match the ordinary baseline
exactly in all four normal RGBA channels. Reflection masks do not escape reviewed
openings; all34 no-glass materials have zero masks. [Current tests](evidence/glass-region-tests-2026-10-05.txt),
[actual-image receipt](evidence/glass-region-assets-2026-10-05.json).
- The current mosaic and red-roundel production GPU checks pass with exact
normal decoding, moving-light/normal response, zero Classic RGB changes and
zero GL errors. The red roundel has9,455tagged glass pixels; the GPU oracle measures102,631ordinary wall/framepixels andzero falseglass tags (2%UVboundary allowance). [Roundel receipt](evidence/glass-roundel-regions-2026-10-05.json),
[current preview](evidence/glass-roundel-regions-2026-10-05.png).
- Source/ROI overlays are retained for all130 materials; current asset hashes
live in provenance and region-proof. Earlier unrestricted and calibration
receipts remain historical. No full campaign playthrough or sustained frame-rate
qualification is claimed. Owner visual acceptance of the corrected sheen and
regions remains open.


## Commit isolation scope

The chat commit excludes the separate BSP2/loading/prepared-normal work.
Its isolated native/source boundary is 8 natively accepted BSP29 samples and
2 correctly rejected BSP2 samples with source-only material verification.
Earlier ten-native-campaign receipts belong to the combined working tree.
[Exact commit scope and receipts](chat-art-commit-2026-10-05.md).
