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
