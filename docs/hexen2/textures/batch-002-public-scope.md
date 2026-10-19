# Native source coverage audit

19 October 2026. Independent read-only audit of the four retained retail PAK
archives, with each archive's complete SHA-256 checked against the current world
inventory before member reads. The base layer is `data1/pak0.pak` then
`data1/pak1.pak`; each expansion profile overlays its own `portals/pak3.pak`.
The two expansion archives have identical bytes but retain separate installation
identities. No relevant loose map/model/gfx override was present.

The world inventory's **980 native variants** (887 ordinary, 72 animated, 12
liquid, five sky, four utility) covers embedded BSP miptex only, including brush
submodels. Finishing its ordinary queue cannot establish all-texture coverage.

| Effective profile | Model files / formats | Model skin images | Sprite files / top-level slots | WAD lumps | gfx LMP files |
| --- | --- | --- | --- | --- | --- |
| Base | 367 IDPO version 6 | 465 | 50 / 369 | 17 | 297 |
| Portal of Praevus | 343 IDPO version 6 + 100 RAPO version 50 | 553 | 66 / 573 | 17 | 324 |

The Portal totals include inherited base resources: do not add those rows or
count the second identical Portal installation as extra unique work. Retaining
native logical model name, dimensions, skin slot, group index and indexed pixel
hash gives **555 distinct source-bound model skin images across the profiles**.
None of the inspected model skin slots was a skin group. Model files include
enemies, classes, weapons, pickups and effects; these counts are not enemy counts.

Sprite slots are not flattened frame counts, WAD lumps are not necessarily
decorative images, and gfx LMP files include palette/colormap and other data.
They require classification before calling any total a texture inventory.

## Remaining scope

Continue the ordinary world material queue while retaining explicit separate
queues for animated families, sky/liquid semantics, native model skins, sprite
single/group frames and WAD/gfx pictures/fonts/masks. Model and sprite work must
preserve native UV registration, cut seams, origins, animation relationships,
transparency and class tint masks. Universal repeat-tiling assumptions are not a
substitute for a model UV seam review. Utility markers require semantic review;
unchanged Low may be the intended result rather than decorative enhancement.

`batch-002-public-scope-audit.py` reproduces the bounded source audit and writes a
new receipt; the default receipt is `batch-002-public-scope-audit.json`. It does
not alter sources, generate images, flatten sprite groups, validate geometry or
qualify any engine path. Art acceptance, decoded-tier validation, runtime
integration and owner acceptance remain separate.
