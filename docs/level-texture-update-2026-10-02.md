# City/Church and Wizard texture updates

The two owner-supplied PNG atlases replace **26 existing level textures**: fourteen from the native `city_church_2` sheet and twelve from `wizard_1`. The atlas PNGs are retained byte-for-byte under `tools/texture_sheets/sources/level-2026-10-02`; the reviewed recipe records their hashes, exact per-cell crop rectangles, material policies and periodic registration offsets.

The original PAK sheets were independently reconstructed to confirm every name and row order. All native textures are 64×64, and each replacement remains 256×256. The supplied sheets have nonuniform cell sizes and changed gutters, so whole-sheet proportional slicing would include adjacent artwork or padding. Explicit crops exclude a bright neighboring strip below `city5_1` and the dark separator below `column1_2`; authored dark stone/checker mortar is retained rather than indiscriminately black-trimmed.

| Supplied sheet | Row 1 | Row 2 | Row 3 |
| --- | --- | --- | --- |
| City/Church | city5_1, city5_3, city5_4, city5_6, city5_7 | city5_8, city6_4, citya1_1, column1_2, column1_5 | stone1_3, wall16_7, wall9_8, wbrick1_5 |
| Wizard | wiz1_1, wiz1_4, wizmet1_1, wizmet1_2, wizmet1_3 | wizmet1_7, wizmet1_8, wizwood1_3, wizwood1_4, wizwood1_5 | wizwood1_7, wizwood1_8 |

## Position, scale and repeating edges

Each reviewed cell is cropped, rectified to its native square aspect and resampled once to 256×256. Twelve clear structural matches receive small periodic shifts in native texel units, verified independently against the original PAK by periodic luminance correlation and landmark inspection. Examples include the medallions, checker grout, crossbrick joint, corrugated metal and plank seams. Ambiguous grain/mesh textures remain unshifted. Pixel shifts wrap within the tile; no map UV, world position, geometry, native texture width/height or flip flag changes.

The existing engine still calculates UVs from the original 64×64 miptex footprint and updates the pixels of the existing texture object. One repeat therefore covers the same 64-unit span. `flipY=false` and the original orientation remain. Stored crops/phase settings reproduce the output; the old wizard-sheet shifts are not reused. Diffuse WebP storage is lossless, preserving the reviewed resampled/registered pixels.

[Registered diffuse gallery](images/level-textures-2026-10-02/diffuse-gallery.png), [medallion repeat](images/level-textures-2026-10-02/city5_1-repeat.png), [checker repeat](images/level-textures-2026-10-02/wall9_8-repeat.png), [mesh repeat](images/level-textures-2026-10-02/wizmet1_8-repeat.png), [wood repeat](images/level-textures-2026-10-02/wizwood1_4-repeat.png). Supplied pattern edges remain authored artwork; the importer does not repaint them to invent seamless patterns.

## Height and normal maps

All 26 prior heights are replaced so relief matches the new diffuse. The existing material-aware `craft_normals.py` algorithm removes broad baked illumination, combines detail bands and uses wrapping derivatives. The renderer derives tangent normals from the stored grayscale height with its existing `R_NormalsFromCraftedHeight`; this same height supplies parallax, avoiding independently drifting normal/height assets. Source PNGs and diffuse pixels are not modified by height authoring.

Material review supplies local exceptions without changing unrelated crafting profiles:

- `city5_1` is an upper patterned facing chipped away to reveal lower brickwork. Reviewed registered polygons/ellipses cover four corner patches, the large opening and three small holes, including wrapped pieces. Facing height is 0.78 and substrate height 0.38, with microrelief bounded to ±0.035. The chip bevel stays on the facing side and has a 0.48 floor, keeping every labeled facing texel above even the brightest labeled brick. Colour does not determine the layer ordering; warm gold/brown facing remains on top. Diffuse bytes remain unchanged. [Structural region overlay](images/level-textures-2026-10-02/city5_1-layer-regions.png), [updated layer relief](images/level-textures-2026-10-02/city5_1-layered-relief.png).
- Polished `column1_2` marble has flat height 1 and strength 0. Veins remain pigment; normals are flat and parallax depth is zero, avoiding false engraving or a view-dependent shift of a flat tile.
- `wall9_8` checker tiles use fine/crack bands without broad colour bands. Interior height means differ by less than 0.01 in the four panels, so brown/blue colour differences do not create whole-quarter platforms.
- `city5_6` uses rounded carved-stone relief for the skull band; `wall16_7` uses restrained pebble detail.
- `wizwood1_7` uses roots-over-stone relief despite its wood-prefixed name. Remaining masonry, metal, bark and plank textures retain their established material profiles.

Height WebPs are lossless grayscale data. The runtime catalogue includes matching filenames, strengths and caps; its version changes to invalidate cached images. [Diffuse/normal/lit preview](images/level-textures-2026-10-02/relief-gallery.png), [marble repeat](images/level-textures-2026-10-02/column1_2-repeat.png).

## Reproduce and try

```sh
python3 tools/texture_sheets/update_level_sheets.py
```

Use `--output /tmp/texture-candidates --preview /tmp/texture-previews` for a dry run. Source hash, crop bounds, orientation and catalogue-name guards reject unreviewed inputs. A production run updates only the 26 diffuse files, their 26 height files and the existing catalogue. Inspection confirmed exactly those **53** runtime files changed, with no unrelated texture or renderer changes. Existing native/classic art, fullbright masks and gameplay remain on their original paths.

Reload Newer Game to fetch the updated version and inspect City/Church and Wizard surfaces. The current changes remain a local working increment; public push is still awaiting the earlier asset-rights clarification. Concurrent source-archive deletions remain untouched. Normal/height interpretation is material-aware authoring from supplied colour artwork, not a claim of measured physical geometry. Owner visual acceptance remains separate from the verification records.

## Verification

Independent asset and public-interface review passed **6/6 focused cases**. The broader normal/classic/world-material run passed **23/23 JavaScript checks**, and asset checks passed **3/3 Python checks**: **26/26** overall. The runtime fixture decodes the actual installed WebPs and exercises all 26 texture upgrades, versioned diffuse/height requests, generated normal maps, original 64×64 fallback, unchanged UV offsets and classic rollback. A wrapped analytic height verifies derivative direction and stored height alpha. Asset checks prove exact source crop/resample/periodic-shift pixels, matching diffuse/height dimensions, correct names, guarded source hashes and the exact 53-file boundary.

The entire independently rasterized `city5_1` footprint is checked, not only sample points: **18,767 brick texels** have maximum stored height **0.415686**, while **46,769 facing texels** have minimum **0.447059**. Intact facing interiors remain near 0.78, exposed brick near 0.38, and the facing-side chip bevel preserves ordering everywhere. All eight openings, wrapped corner branches and diffuse preservation are verified. [Asset results](evidence/level-texture-asset-tests-2026-10-02.txt), [runtime/regression results](evidence/level-texture-runtime-tests-2026-10-02.txt), [source/asset identity](evidence/level-texture-identity-2026-10-02.json).

These are actual asset-loading and renderer-interface checks plus software relief previews; no new complete-game GPU/FPS or every-map visual acceptance is claimed. No extra game instance was started for this texture increment. The stored original PAK data and all unrelated replacement pixels remain unchanged.
