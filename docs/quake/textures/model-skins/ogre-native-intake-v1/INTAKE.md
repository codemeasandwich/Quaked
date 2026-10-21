# Original Quake Ogre: bounded native skin intake

**Native intake verified; no new enhanced texture qualified.** This advances one non-WORLD source audit under the existing full Quake/official-expansion mission. It covers the original Quake `progs/ogre.mdl`, skin0/frame0 only. Rogue's multi-grenade Ogre, its second skin, detached `h_ogre`, other monsters and other native families remain separate. No provider call, asset replacement, engine edit, build, GPU/browser run, source selection or release occurred.

## Actual native source and precedence

The current source-web base-game mount path is `main.js:82-124`: owner Quake `pak0` first, bundled shareware `pak0` last. `COM_AddPack` prepends; `COM_FindFile` searches the resulting PAK order before preloaded virtual loose files (`src/engine/common/pak.js:281-350`). This is the actual project behavior, not an assumed generic “loose files win” rule. Add-on folder mounting separately mounts loose content below its PAKs (`game_selection.js:160-185,295-315`). Desktop mounting and a running game's actual state were not exercised.

I read the actual owner `/Users/bri/quaked/Quake/pak0.pak` and checkout `games/shareware/pak0.pak`, hashed their complete bytes, validated their PAK directories/member bounds, and checked `progs/ogre.mdl` and `gfx/palette.lmp` loose candidates under both roots: all four loose candidates are absent. Each root currently has only `pak0.pak`; no later numbered PAK was omitted from the inventory. Both archives contain byte-identical Ogre and palette payloads. For this source-web profile the bundled copy wins; the owner copy proves the same identity independently. Newer packs could override native members in a running Newer session; no such loaded-pack state is claimed here.

| Item | Actual effective source | SHA-256 |
|---|---|---|
| MDL | bundled pak0 offset4364088, length162036 | `d7e65c136645747dacb3901e61a4117bc9cdd062669d0f64fa562872d2bd0d4e` |
| Palette | bundled pak0 offset6832530, length768 | `6b20b5bc4ea965ef1852b05670d043ca16148a0ecad4e63028121c8aebc268fe` |
| Raw skin indices | MDL offset88, length51216 | `cb2e91828469b32d804ac8330a8455697a475c4bb1fda809ab3029217a5c3074` |
| Raw palette-expanded RGBA | 264×194, alpha255 | `ff523fac299825cef6a732dc9884816d2b56e9a8cdd734c29bf778e256f1d8dd` |

The local intake identity `ef9b13592e7e98a234a2f98e067f15efeb57d095f29951bef5e0d1f64ad6d235` canonically binds model hash, skin/frame, dimensions, indexed/palette/RGBA hashes; its exact schema is in [native-intake.json](native-intake.json). It is a proof namespace identifier, not a newly installed catalog identity. The actual runtime identity predicate uses the full loaded MDL hash.

Unchanged native extraction is retained as [indexed PNG](native-skin0-frame0-indexed.png) with the exact native palette and [RGBA PNG](native-skin0-frame0-rgba.png). [Nearest3 view](native-skin0-frame0-nearest3.png) is a labelled inspection enlargement only, never an adequate authoring source.

## MDL and UV facts

Parsing follows the actual `gl_model_alias.js` MDL6 layout and `update_enemy_heights.native_skins`, with bounds and an exact-EOF check. This is `IDPO` version6, one ungrouped skin with one frame at264×194; 169 geometry vertices,326 triangles,147 single frame/pose records; synctype1 and flags0. Skin animation groups and interval arrays are absent for this identity. Skin0's four renderer animation slots reference that same skin;147 geometry poses do not mean147 distinct skin frames. All frame records were walked through exact member EOF162036.

The model uses102 `onseam` vertices. The actual `gl_mesh.js:299-302` formula is `u=(s+0.5+(skinWidth/2 if !facesfront && onseam else0))/skinWidth`, `v=(t+0.5)/skinHeight`. The165 front and161 back triangles share489 two-sided mesh edges;109 edge correspondences use discontinuous atlas coordinates. Those corresponding mesh edges, not the rectangular image boundary, define which visible surface contacts must match.

[UV overlay](native-uv-overlay-nearest3.png) and [footprint](native-uv-footprint.png) retain that formula. At native raster resolution, the footprint has27168 pixels and six connected components: two large front/back body regions, two upper chainsaw regions and two lower auxiliary weapon regions. These anatomical readings are inspection interpretations; the exact component boxes and mesh-edge pairs are retained in JSON. Native4-connected raster components are not a substitute for mesh topology or a semantic authoring mask. The native artwork shows pale bloodied skin, dark brown clothing/leather and weapon surfaces; a future material plan must preserve body/weapon landmarks and independently decide physical cues.

The raw native has no indices224..255 and no transparent texels. The production loader passes `alpha=false` for alias skins. Its flood fill is consequential: top-left raw index143 triggers background filling before upload, while the loader copies original model bytes for identity first. The actual CPU loader changed22113 RGB pixels from raw native palette expansion to the DataTexture input. Therefore the unchanged extraction here is **raw Low/source evidence**, not a claim of byte identity with the renderer's post-flood-fill upload. Original raw and renderer handling both need preservation.

A model atlas requires appropriate colour/height bleed around every used UV island, matched anatomy/pigment and relief across paired mesh edges, consistent front/back orientation, safe mip/filter donors, and inspection on deformed poses under opposed lights. A 2×2 image repeat cannot qualify it. Existing `RepeatWrapping` on skin textures also does not make this atlas an ordinary seamless WORLD tile.

## Existing enhancement and exact binding

There is already a viable Ogre skin pipeline and consumer; preserve it.

- `assets/game/enemies/index.json` binds skin0 to `ogre/custom/diffuse.webp` and `height.webp`, both1056×776. Actual WebP payload chunks are VP8L (lossless). The diffuse SHA is `85c05c35ca01a665251feb351262ff1c0cfa68719f3bc7753a334f6b7aa16cc3`; height `8b8071e22422789c9701e125676be34fd48b0bc92c87aa99ab24ed5b7ae06840`.
- `ogre/custom/SOURCE.json` pins this exact base MDL, the selected owner source `ogre-owner-base.png` (`dd36fe10a6494e040a14c18966cc3dd8819ecc63c373c107fd084a8f867d9912`,1448×1086), factor4, unchanged UVs/top-row-first and six fitted regions. That source resolves through existing `assets/layout.json`; do not restore duplicate legacy paths. Historical owner selection is recorded by that receipt; this intake adds no new owner acceptance.
- The runtime base variant itself currently has **no** `nativeModelSha256` constraint; it is filename/skin0 compatible. This is distinct from the SOURCE receipt and game-pack membership table. `R_NewerVariantMatchesModel` therefore accepts the actual base model; identity-bound `ogre/rogue1` skin1 (`2bd7...`) rejects it. Both predicates were actually exercised CPU-only. This audit neither silently adds a constraint nor treats a name match as native alias proof.
- Native height `heights/ogre/skin0_0.webp` is264×194 and lossless; it is enhanced relief for the native diffuse, not a replacement Low skin or an8× package.
- Existing randomized face sheet/patches are part of the selected Ogre variant and must survive tier work. Their normalized `atlasSize:[1056,776]`/patch relationships are not a separate body skin or permission to discard faces. The current runtime and SOURCE metadata, exact files/dimensions/hashes are bound in JSON.

Required unchanged Low is264×194, default Mid4×1056×776, High8×2112×1552. Current bindings provide the old4× colour and8-bit height only. They do not expose a qualified single adequate RGB/full-float master, both direct tiers, separate canonical XYZ exports or a tier selector. Existing VP8L colour also does not itself satisfy the current Quake Q92 colour contract; retain it as historical selected work until a qualified successor is accepted. Do not overwrite it merely to change codec.

All six retained Ogre source PNGs found in the current fidelity folder are1448–1463×1075–1086; none supports2112×1552. The observed new built-in1254×1254 return is short in **both** required High axes. This proves that particular output is inadequate, not a universal maximum of the image tool. Enlarging the old source, old4× diffuse, native inspection zoom or1254 return would violate the mission. No provider/API/fallback/credential action was attempted.

## Existing loader to shader to public trial

The source-bound chain is:

1. `COM_FindFile` → `Mod_ForName`/`Mod_LoadAliasModel`: actual loaded-byte SHA, native palette/flood-fill, stverts/triangles and poses. `gl_mesh` builds native UV/pose geometry and selects the actual entity's skin.
2. `gl_mesh.js:649-677` asks `R_NewerAliasMaterial` first, otherwise uses the selected native skin/animation slot and `R_EnemyAliasMaterial`. Pending/missing replacement art retains native fallback.
3. `r_newerskins.js:280-420` loads existing manifest assets through `COM_NewerURL`: top-row-first `flipY=false`, diffuse sRGB, data NoColorSpace. It validates height dimensions against actual diffuse; a mismatch discards that height and falls back to generated relief. Stored height → `EnemyHeightScalars` → `R_NormalPrepare`/`R_NormalMapFor` yields packed tangent normalRGB with height in alpha.
4. `FRAGMENT_NORMAL` at `r_newerskins.js:601-619` derives the tangent frame from screen-position and actual UV derivatives. Supplied normal maps may flip green; generated normals use `uFlipGreen=0`. The patched material writes normal/albedo/height-shadow buffers. This is one existing model renderer; do not add another preview renderer.
5. Existing `tests/rogue_skin_gpu_trial.html?model=ogre_base&externalGames=1` uses the production PAK/model/mesh/material/post paths, front/back/oblique views, every native pose, Classic/native controls, normal readiness and randomized Ogre face closeups. It already has a base-MDL hash assertion. Its expected1056×776 dimensions are4× specific and need a narrow reviewed update when both tiers exist. `tests/enemy_height_trial.html` is an additional existing interactive material/height viewer. **Neither browser trial was run in this intake.** The coordinator's browser availability/hardware gate remains unresolved.

The current skin consumer does not directly read the WORLD deriver's separate `normalX/Y/Z` files or its manifest. With a height present, `refreshHeight` regenerates normals from decoded8-bit stored height and may replace a separately loaded normal. Existing `gl_normals` supports an `authoredNormal` donor, but this skin binding does not currently populate it. Consequently a future direct-float canonical normal export cannot be declared the runtime normal merely because the files exist: the exact chosen tier, packednormal/height data, tangent convention and shader binding need narrow existing-path wiring and actual public verification. No normal/tangent orientation claim is accepted from this source read alone.

## Smallest next increment and concrete blockers

Reuse the exact-model recipe in `tools/texture_sheets/sources/fidelity-2026-10-12/ogre-owner-base.json` and existing `fit_rogue_skins.fit_one`, `uv_footprint`, source-component fitting and donor `spread` behavior. That importer already validates full MDL/source hashes, exact native layout and six-island coverage. Preserve original geometry, all147 poses, skin selection and face overlays. The existing helper supports explicit source recipes through its Python function; its fixed CLI model choices do not by themselves expose the base owner recipe.

Two source/tool constraints must be handled in a bounded independent plan before a new call:

- Obtain/select one genuinely adequate retained source in the native atlas relationship, sufficient for2112×1552 after all registration and island fitting. Current selected/generated sources do not meet this gate. Do not spend a call on another known-inadequate1254 return or infer provider/size authority from this intake.
- Extend the existing skin preparation/derivation path narrowly to retain one full-float scalar master alongside one adequate RGB master, then derive both tiers with model-island bleed and mesh-edge semantics. `height_for` currently quantizes to8-bit WebP without retaining its float output. The generic `prepare_texture_master.py:66-73` and `derive_quake_texture_tiers.py:81-85` reject194 because both native axes must be divisible by4; their periodic RGB and cyclic normal treatment is WORLD-oriented. Ogre's half view is132×97 while its mathematical quarter is66×48.5, so a same-filter integer quarter-view convention also needs an explicit recorded decision. Do not crop/pad/change the native to satisfy the existing guard or run the ordinary deriver unchanged and call the atlas qualified.

The existing codec helpers, scalar reduction/math where valid, source journal/selection custody, skin fitting, model-aware material consumer and public GPU trial are reuse points. Qualify the small atlas-specific adaptation and exact runtime normal binding with independent plan/code/public tests; do not clone a second pipeline. Preserve lossyQ92/method6 colour and lossless/method6 height/XYZ data under the revised mission. The older `finish_runtime_skin` can optionally encode **height as lossy Q92**; that option is not compliant with the new Quake data-map rule and must not be applied wholesale.

Responsible next owner is the coordinator: record this single native intake and its size/atlas/consumer blockers in the existing campaign ledger, retain selected historical Ogre assets, and commission the narrow plan once adequate-source authority/feasibility is resolved. This is source understanding and reproducible native proof, not new material coverage, qualified8× delivery, owner acceptance, operational closure or release. The coordinator retains Bluey's reported storage-error reconciliation and fallback ledger; this supervised helper has not submitted or acknowledged a board mutation/durable followup job.

## Verification retained

[Native proof verification](native-proof-verification.json):62 checks passed for actual source/member bounds, unchanged raw index/palette/RGBA extraction, exact hashes and current source/asset/diagnostic bindings. [Public production-loader verification](public-loader-verification.json):16 CPU-only checks passed for actual PAK precedence, native header/poses, pre-floodfill model identity, opaque upload, and base/Rogue variant predicates. No DOM/GPU/material-render/animation-loop/browser or build was involved. Exact installed Three0.183.0 was read through a diagnostic-only Node resolver hook, with no install, symlink or repository dependency change.

Two diagnostic setup failures are retained in [diagnostic-failures.json](diagnostic-failures.json): missing local `three`, then missing Newer hook installation. The final helper reuses the exact installed version read-only and the same `src/newer/install.js` bootstrap as the public trial. No failed attempt affected an asset or counted as provider work. Replay the two proof scripts only from this folder; outputs remain in this proof namespace. `native-intake.json` binds exact parser/consumer/recipe source bytes; it is not a general all-family inventory.
