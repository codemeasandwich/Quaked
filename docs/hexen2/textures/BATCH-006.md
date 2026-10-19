# Batch 006: eight reviewed native bindings

Eight Hexen II/Portal WORLD identities now have reviewed Mid4× and High8× interpretations from seven retained single-generation sources. Portal `ttex021` is a source-proven exact-content peer of base `rtex029`, so it references that package while retaining its own native identity and unchanged Low. This adds seven master packages and 70 physical enhanced maps, with 80 native map bindings. The active catalog now contains 37 native bindings, 32 unique masters and 320 physical maps. The full campaign remains active; 850 ordinary WORLD variants and the other native texture families remain unqualified.

| Native identity | Edition | Native size | Interpretation |
|---|---|---|---|
| rtex001 | Base | 128×128 | Broken facing above exposed masonry |
| rtex040 | Base | 64×128 | Staggered flagstones |
| rtex029 | Base | 64×128 | Grey/ochre mineral surface |
| rtex095 | Base | 64×64 | Fine cool/umber interlaced surface; historical material uncertain |
| rtex439 | Portal | 64×128 | Dark vertical timber; distinct from base rtex439 |
| rtex488 | Portal | 128×128 | Pale staggered rough stone with red-brown mortar |
| ttex021 | Portal | 64×128 | Proven exact peer of this batch's rtex029 |
| ttex018 | Portal | 64×128 | Grey/ochre slab and fracture surface |

Each source is large enough for at least 8× native dimensions. The final active RGB and float32 relief master produces both tiers directly. All enhanced diffuse, height and separate XYZ normal maps are lossy WebP Q92/method 6. The unchanged original remains Low. The shared standard applies to new Quake and official-expansion assets as well as Hexen; see [the common contract](../../texture-tier-standard.md).

## Try the reviewed material sheets

Open [the final review index](../../../assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-006/review-final/index.html). Every native binding has Mid and High colour/distance/repeat and relief sheets. The authoritative asset paths are in `batch-006/batch-final.json`; reviewed registration and actual per-file hashes are in the active `catalog.json`. Sealed manifests keep their pre-review status text as historical production evidence; the catalog and review receipts record the later qualification.

This is offline authoring delivery. No runtime pack registration, GPU/POM displacement, in-game acceptance, owner acceptance or new release is claimed by these checks.

## Findings and same-source repairs

Initial art review held three materials. Their original receipts and necessary failure images remain preserved; no extra GPT call or independently authored tier was used for a repair.

- **rtex001:** brightness-derived relief incorrectly elevated exposed-brick edges above the facing. The source-bound layered adapter reuses the existing layered-veneer masks, wrapped blur and ordered planes. Facing is above substrate; bounded photographic detail is composed in full precision with one final float32 cast. RGB is unchanged. The final mask includes the complete lower left exposed brick and central vertical substrate block. Five independently classified adjacent brick-face/mortar pairs have the intended decoded ordering in both tiers. These samples do not establish all-pixel mortar ordering.
- **rtex095:** the initial coarse one-way diagonals obscured the native fine cool interlace. A stronger coarse colour registration (.90/.35) from the same raw restores half/quarter similarity while retaining photographic fine detail.
- **Portal rtex439:** the initial Y repeat showed a horizontal timber stitch. The qualified master-only periodic boundary correction closes that join without moving features; both edge axes, corners, clipping, distance appearance and decoded relief were reviewed.

The plan, formula, source validation and public-interface tests for the layered adapter are retained in `BATCH-006-REPAIRS.md` and the corresponding public receipts. Eight portable test groups and the actual package replay passed. The existing generation, finishing, scalar-detail and tier-derivation tools remain unchanged.

## Verification and retained limits

- `batch-006-art-review-v2.json`: independent final ART PASS, all 80 map bindings rehashed; fresh changed-material half/quarter comparisons, photographic detail, X/Y/corner repeats and opposed-light relief. Five unchanged bindings retain their prior PASS through exact source/master/map custody.
- `batch-006-public-final-actual-v1.json`: independent source, codec and mathematical reconstruction PASS for seven physical packages/70 map files and 80 native references. Final masters replay from retained source and recipe data without obsolete master/map binaries.
- `batch-006-public-final-preview-v1.json`: all 272 material/label panels exact. JPEG reconstruction varies only in the documented empty 40×16 tail padding; actual WebP maps are byte-exact. This is not a tolerance on artwork pixels or maps.
- `batch-006-public-final-mortar-v1.json`: all five classified central and 3×3 mean face samples exceed adjacent mortar at both tiers; pure-mask facing/substrate bands remain ordered. Mixed interface pixels and the sample limits are explicitly recorded.
- `batch-006-alias-public-source-proof.json`: all four native mip levels, palette, indexed/RGBA data, dimensions, flags and 37 source occurrences prove the rtex029/ttex021 peer relationship.

`batch-006-retirement.json` inventories 104 untracked obsolete files retired after final qualification, releasing 40,206,805 bytes before archived evidence costs. It pins 171 remaining batch files and 14 failed-preview/index copies. All original Low images, raw generations, prompts, final packages/maps, historical recipe JSON and sealed receipts are retained. The undersized earlier ttex098 source remains unqualified, with no master/tier or upscale.

The post-cleanup public audit replays all 80 final map bindings and verifies all 37 catalog identities (32 masters/320 physical maps/370 bindings), 727 custody inputs and all 32 final preview hashes. The 104 retired paths are absent and the 171 protected files plus 14 archives match. Independent earlier witnesses cover 71 deleted identities; the 33 intermediate previews/draft PNG without earlier independent observations rely explicitly on the coordinator's pre-deletion identity receipt. See `batch-006-public-final-post-cleanup.json`, `batch-006-public-catalog-post-cleanup.json` and `batch-006-public-retirement-audit.json`.

Exact selected initial/final art inspection evidence is copied into `batch-006-art-evidence/` with a source-to-durable path/hash map. The sealed review receipts are unchanged; unneeded generic intermediate grids are explicitly excluded.
