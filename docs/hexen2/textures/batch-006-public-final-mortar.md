# Final batch006: classified mortar witnesses

The independent art reviewer classified five actual canonical RGB brick-face/mortar pairs, excluding facing/interface bevel. All five show lower mortar at the center pixel and unweighted3×3 decoded-height patch mean in both tiers. These are measured local witnesses, not an all-pixel mortar guarantee.

| Witness | Mid face / mortar mean | High face / mortar mean |
| --- | ---: | ---: |
| Lupper | 0.393464 / 0.356863 | 0.393028 / 0.356863 |
| Lmid | 0.380392 / 0.356427 | 0.374728 / 0.358170 |
| Llow | 0.372549 / 0.357734 | 0.366013 / 0.356427 |
| Rupper | 0.382135 / 0.357734 | 0.383442 / 0.356863 |
| Rmid | 0.396078 / 0.356427 | 0.396078 / 0.357734 |

Values are decoded scalar heights on0–1 scale. The receipt records native128 coordinates, output factors, central pixels, half-open ROI bounds and patch min/max. Patches are3×3 output pixels at each tier, so their native footprints differ; no resampling is used.

Measured decoded height bands also keep all pure-mask facing pixels above pure-mask substrate pixels: minimum gaps0.184314 Mid and0.180392 High. Mid blocks containing both structural classes are excluded (1118 pixels); the recipe mask’s semantic alignment remains a separate art judgment. Normals are bound through the already qualified actual derivation proof.

- Receipt: `batch-006-public-final-mortar-v1.json`, SHA256 `f3a6529f4fbcce771b1f642c2ce282ec4c7818e4972dbf9e210c69b5172134c1`.
- Retained reviewer annotation: `batch-006-final-mortar-witnesses.png`, byte-identical to the reviewer’s temporary original.
- Canonical colour, full-precision height, master/tier manifests, recipe/source inputs and all10 maps are hash-bound. Source/map bytes stayed unchanged.
- Initial and final technical receipts remain intact. No asset, core code, runtime binding or Git change. Final artistic/owner/runtime/landing/release acceptance remains separate.
