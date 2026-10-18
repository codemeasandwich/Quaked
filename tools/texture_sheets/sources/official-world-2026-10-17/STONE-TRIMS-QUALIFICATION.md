# Eight photographic stone and trim counterparts

The candidate adds eight original-pixel-key bindings and forty runtime images at
index version 2026101811 (SHA-256 `4bdc95a3a622fbb0ba71afb6aacde1d0504bfe3c4282b91e8dc2be872eb85faa`).
It was prepared on Dev `28765ac38a3da144a7c73986de7d953a76e8d1f1`, then
integrated with `ab554cf61a2650c7ae84ed5dc96dcc45c4cb1010`. Final staged review,
the maintained commit gate and periodic Dev publication remain separate.
The shared root checkout and incoming Dev work are preserved.

| Native material | Runtime dimensions | Normal strength |
| --- | --- | --- |
| br_trim1_1 | 512×256 | 0.2 |
| br_trim1_2 | 256×256 | 0.2 |
| wstone_17_JM | 1024×1024 | 0.06 |
| wstone_11_JM | 1024×1024 | 0.06 |
| wstone_13_JM | 1024×512 | 0.06 |
| TF_Metal3_04 | 512×512 | 0.2 |
| TF_Stone_03 | 512×512 | 0.2 |
| metal5_83_JM | 512×64 | 0.06 |

All image roles are lossy WebP quality 92, exactly four times native width and
height; each normal uses cap 0.5. XYZ components are stored as separate grayscale
images to avoid colour-chroma mixing. The engine reads these through its existing
ordinary texture and normal paths, preserving native UVs and Classic originals.

## Source and photographic detail

Builtin GPT image generation supplied new photographic brick and stone material.
Versioned prompts and raw photographs remain beside the source references.
Accepted photographs retain sharp material detail and original feature scale;
soft, gritty or geometrically incorrect drafts remain recorded as held.
Approved steel geometry supplies the 48-head metal variant through a separate
source-colour fit. A recorded 512×64 crop supplies the plain copper strip without
squeezing a square picture into a strip.

The corrected brickwork has solid plain returns, no missing-square cavities and
clean interfaces on both sides. The complete narrow original is byte-identical
to wide native columns [0:32] plus [96:128]. `compose_solid_brick_modules.py`
applies that exact crop at 4×, preserving brick and side-block dimensions. Only
columns 96..159 around the narrow internal join receive existing colour-only
quiet-edge balancing. Its first and last 96 columns remain byte-exact to the
composed photograph. Both variants are then individually fitted to their own
original colours and checked at half- and quarter-native resolution.

## Ordered height, not colour-derived depth

The new optional `--height-layering` encoder input reuses the established
`authored_height(..., 'layered-veneer', ...)` function. Only these two bricks use
this input. Source/name/diffuse hashes and finite, bounded regions are checked
before outputs are written. Pair-transition and layering inputs are exclusive.
Without the option, every prior encoder path retains its existing image bytes.

The plain facing is set to 0.78, inset center to 0.38, with a facing-side chip
floor 0.66 and bounded microrelief amplitude 0.025. Inclusive region endpoints
stop one runtime texel before half-open native row boundaries. Both variants
use a 1.5-runtime-pixel interface transition despite their different areas.
There is no bevel at the outside image boundary.

After lossy encoding, every facing-mask pixel remains above every inset-mask
pixel: wide minimum 158 exceeds center maximum 107; narrow minimum 162 exceeds
107, in decoded red-channel units. Normals derive from that decoded height.
The real loader puts the same height into normal alpha, which drives existing
parallax. This produces surface depth without changing the BSP mesh, collision
or silhouette. `STONE-TRIMS.md` documents the owner correction and runtime path.

## Verification and limits

* Independent scoped photographic review binds all forty current maps in
  `verification/stone-trims-eight-current-v3-art-aggregation.json`.
* Fifty public checks pass, including all 111 actual encoder reproductions,
  114 bindings at 768 PAK occurrences, source guards, decoded XYZ/height alpha,
  unchanged UVs, Classic, cache reuse and the retained unknown/steel/rock controls.
  `verification/stone-trims-installed-public-input-hashes.json` pins 2,173 inputs
  and six whole PAK hashes. A named transposed-landmark source assertion failure
  and its corrected full run are retained.
* Three additional independent CLI tests replay both new five-map sets, prove
  decoded plane ordering, preserve diffuse/height when normal strength changes,
  and reject nine bad recipes plus two conflicting argument combinations before
  output-directory creation. The initial file-handle warnings and clean
  successor log are both retained.
* The actual engine material trial passes 176 preparation checks and records 33
  finite draws without shader or console errors: eight front close views,
  sixteen half/quarter comparison-panel views with GPU 3×3 repetition, eight
  brick oblique ±55-degree relief-on/off views and one initial oblique draw.
  Half/quarter selectors resize the two reference panels; they do not change the
  GPU camera distance. The oblique check is planar parallax/normal response,
  not mesh displacement or all-map gameplay qualification.
* The owned preview server exited 143, tab 17 closed and port 8017 was released.
  Images, exact draw records and 109 inputs are retained in
  `verification/stone-trims-gpu-inputs-cleanup.json` and `verification/stone-trims-gpu/`.

To try the finite material comparison, serve this checkout on loopback and open
`tests/official_texture_trial.html?batch=stonetrims`. Select a texture, compare
half/quarter repeated panels, then use Material angle and Height-derived relief.
This diagnostic uses candidate paths; normal game selection uses the exact
original source key recorded in `stone-trims-eight-registration.json`.

The exhaustive refreshed inventory reports 967 ordinary missing counterparts,
with no inventory errors. `remaining-ordinary-textures-all111.csv` is the next
work list. The 111 generated artworks and 571 selected generated/format image
maps are a qualified subset, not completion of all original/expansion textures.
Older catalogue formats/provenance, special surfaces and enemy texture obligations
remain open. The retained unbound twelve quality-95 images still enter broad
asset collection; all-shipped-quality-92 is not claimed.

## Current Dev renderer successor

The disjoint Lava Man/heat update on Dev ab554cf6 is preserved. Of the 2,173
previous public inputs, 2,171 remain exact and only two match incoming Dev blob
successors. Fresh pack checks and all 571 companion paths pass again; the earlier
fifty-check result remains evidence on its original 28765 base. Producer,
source-key, scalar-height and authored-normal inputs are unchanged, so no
unnecessary encoder rerun is claimed.

The actual updated renderer also passed 176 preparation checks and 24 new draws:
eight close front views, eight quarter-size 2D comparisons with GPU 3×3 repetition,
and eight brick ±55-degree relief-on/off views. All 24 engine-canvas regions match
the corresponding approved prior views exactly. This confirms the scoped cold
material trial after integration; it does not qualify Lava Man heat or all-map
gameplay. `verification/stone-trims-ab55-gpu-inputs-cleanup.json` records 113
inputs, the new screenshots, server exit 143, closed tab 18 and released port.
The independent visual and public successor receipts retain their exact scopes.
