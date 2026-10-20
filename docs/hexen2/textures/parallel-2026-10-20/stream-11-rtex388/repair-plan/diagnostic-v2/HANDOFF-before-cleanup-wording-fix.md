# rtex388 source-only binary-path diagnostic

This is a working **diagnostic increment**, awaiting root's independent code/path review. It does not repair or qualify a texture. F1 and peer rtex080 remain HOLD; no parent/X/Y/corner ownership atlas or material composite exists.

## What actually ran

`source_path_diagnostic.py` implements the root-approved finite plan. It reads the unchanged 512-square registered RGB and approved source seals, checks the 80-file freeze and independent plan, then considers exactly C0(256,256), C1(128,384), C2(384,128). The 48-pixel maximum collar and protected central rectangle remain unchanged. No wider donor search, reroll, generation, RGB transport output, height or tier operation ran.

Fourteen isolated fixtures pass. They compare monotone three-neighbour DP against an exhaustive small oracle (including true lexicographic path ties), exercise fixed endpoints, X/Y orientation and bounds, paired cap anchors, actual RGB/gradient costs, cumulative-budget refusal, changed-input/initial-witness protection, no clobber and exact unmarked source crops. The fixture suite is small Python asset-diagnostic testing, not an application/native build.

The one actual run used **844,800** of the reserved **1,000,000** lattice states. It retained four long side paths and the best three paired-anchor suggestions for each of four caps, for each approved donor pair. There are **84 retained path halves/paths, 8,448 retained lookup nodes, 48 separate A/B evidence PNGs**. The result JSON is about 1.93 MB and the PNGs total about 3.49 MB. No cost/DP NPY scratch was written; working arrays stayed in memory. The actual-run journal is complete with 155,200 reserved states unused. It deliberately blocks automatic reruns or budget renewal.

## Start here

- `runs/actual-v1/result.json`: complete path coordinates, columns, node costs, exact source A/B lookup coordinates, cap anchors, source hashes and unresolved junctions.
- `fixture-report-v2.json` and `fixture-run-v2.log`: actual 14-test PASS and exact code/test bindings.
- `actual-retained-path-audit.json`: an independent expression recomputes all retained node costs (maximum difference 5.55e-17, tolerance 1e-14), checks integer source mappings/path adjacency/cap anchors, all 48 evidence hashes and pixel-exact source content for all 24 unmarked source pairs. This audit runs no DP or new offset search.
- `runs/actual-v1/C2-side-*-annotated.png` and corresponding `*-unmarked.png`: full source overlaps and selected side cuts. C0/C1 equivalents are retained for comparison.
- `runs/actual-v1/C2-cap*-annotated.png`: up to three cap suggestions. Pink is rank1, cyan rank2, orange rank3; coincident paths are overdrawn, so consult JSON for all anchor choices. All displayed pictures are separate original crops, not a repaired material.
- `focus-C2-*.png`: the retained highest-cost side nodes and their original A/B contexts. They expose remaining broad-fibre concerns rather than claiming those cuts are natural.

## Actual findings and remaining decisions

The algorithm supplies bounded, curved paths without demanding pixel-identical hairs. Its costs are suggestions, not material or ART acceptance. C2's worst retained side nodes are:

| Side | Destination / source A | Source B | Node cost |
|---|---|---|---|
| X+ | (28,395) | (412,395) | .28296 |
| X- | (474,389) | (346,389) | .28626 |
| Y+ | (61,39) | (61,167) | .37152 |
| Y- | (439,469) | (439,85) | .34261 |

Actual focus crops still show broad blade/crossing differences. Natural broken fibres or plausible occlusions may be acceptable; coherent new cut lines, ghosting, stretched/mirrored fibres, orientation stripes and repeated patch stamps are not. No composite trial was authorized or created to decide this final appearance.

Cap halves share the same anchor ordinate across the torus wrap and read adjacent interior source cells. However, suggested cap paths are **not merged with side paths into a single disjoint parent/X/Y/corner ownership atlas**. All four junction quadrants remain explicitly unresolved. Root must review the actual paths and choose or reject compatible boundaries before any canonical compositor.

Coordinate convention needs care: cut-node domains use closed integer boundary coordinates, including48. Read-only cost probes, central-gradient neighbours and crop context can therefore extend past a half-open future donor-copy rectangle. These are source samples, never changed-pixel or transport-ownership assertions. Clarify final pixel-edge ownership in a later approved atlas; this diagnostic never writes a changed RGB pixel.

## Verification, failures and preservation

All 80 frozen candidate files and all extra first-observed plan/code inputs were checked before and after actual publication and again after the node audit. They remain exact. The output directory is exclusively claimed with native mkdir and every evidence file uses exclusive creation; source change during publication leaves failure evidence and no qualified result. The original first-input witnesses are never replaced by changed rereads.

The first isolated fixture run exposed an editing recursion in approval validation before any actual run or budget issue. Its failed source and `fixture-failure-v1.json` are preserved; the corrected exact source passed the same meaningful tests. A later read-only post-audit script had a parse typo, preserved separately, fixed and then actually executed without any DP rerun. Neither was an asset repair or an F1 closure.

Fixture temporary directories were automatically removed. Two owned bytecode files were inventoried and removed after all processes completed; no shared cache or build was touched. See `owned-cleanup-receipt.json`. No Git, registry, provider, app/native/full build or child-agent action occurred.

The isolated fixtures may be repeated without consuming the actual-source allowance:

```sh
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 -m unittest discover \
  -s docs/hexen2/textures/parallel-2026-10-20/stream-11-rtex388/repair-plan/diagnostic-v2 \
  -p test_source_path_diagnostic.py -v
```

Do not rerun the actual source CLI or overwrite sealed post-audit outputs blindly. Its issued/completed journal and bounded allowance must be reconciled by root. If further independent computation is necessary, scope that next increment explicitly. Root owns the independent code/path decision and existing Bluey/fallback accountability; this supervised helper is not a durable worker queue.
