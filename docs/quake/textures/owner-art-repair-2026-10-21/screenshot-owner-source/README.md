# Screenshot owner artwork source lineage — 21 October 2026

Read-only provenance and repair planning in worktree `/Users/bri/.codex/worktrees/fc24/Quaked`, HEAD `713b47d322f0674f154a70ec4baebd4566905d41`. This lane owns only new files in this directory. No artwork, runtime catalogue, engine, Git index/ref or foreign Hexen files were changed; no generation, build, browser trial, release or owner acceptance occurred. Root reported Bluey `storage_error` with unknown identity mutation outcome and disabled automatic retry; this lane did not bypass or retry that operation. Responsible next owner is the Quake coordinator in the initiating session.

## Actual family in the supplied screenshots

The screenshots at `/Users/bri/Desktop/Screenshot 2026-10-21 at 08.09.45.png` and `08.10.01.png` show the established early enhanced artwork. Gold/olive framing and pale red-streaked louvers are **parts of the same `tech08_1` artwork**, not two separately authored materials. `tech09_3` is the closed PURPUR 05 control panel and `tech11_2` its machinery counterpart. `tech10_1` is the smaller square of densely pitted bronze metal with two edge rivet columns; it is visibly warmer/coarser where it meets the larger panels. `tech07_2` and `tech10_3` are related upright plate/louver strips. `twall1_2`/`twall3_1` are the other X-frame/louver family, retained here as an identification comparison, not a proposed replacement.

The [current contact sheet](current-metal-contact.png), [retained lineage views](lineage-contact.png), [literal current/native tech08 comparison](tech08-native-vs-bound.png) and [half/quarter BOX comparison](half-quarter-BOX.png) were inspected. BOX images reduce native and decoded replacement to exactly the same native/2 and native/4 dimensions. For readable evidence only, the saved comparison then enlarges each result by 2 with NEAREST; it does not create authoring detail.

The separate native scene investigator's `../screenshot-scene-intake/scene-proof.json` records actual face/neighbor relationships, source PAK/map/palette and four-mip native proof. Its report says shareware scene 2 places `tech09_3` on door face 796 at y2816, with surrounding `tech08_1` sharing S phase and T differing by128 (zero modulo their128px native height). Use those actual UV relationships for candidate neighborhood views; do not infer a common edge from filenames.

## Retained source and precise limits

The initial `tech_computers_1` import is commit `7259378011fa4d85cf9aa4d28a22d68c7b0854d2` (30 September). Commit `f4a260ecc325ccd6150ac1209e6ef2bedc2c4d48` replaced six panels with larger versions. Its 768px square crops are the earliest retained larger authored images in Git, before subsequent offset and seam corrections. Commit `0abd6528ae9d1a1df5e69dbe4d937fd8ec1a1da9` moved enhanced pictures back toward native layout using wrapped resampling, then `c865b7540c89251aa17a68d5c2aeb3e995217c43` repaired dark edge lines. The current retained `legacy-tech-pre-4x/diffuse/*.webp` files match the c865 blobs exactly. Thus these are already processed owner-art crops, not pristine generated returns.

Commit `73307bb3a9015afcbf6a3be9370b12e28a9747c4` reduced these crops to4×. The later `legacy-tech-twelve-q92-v1.json` receipt retained lossless PNG resampling intermediates and encoded the same artwork as Q92 colour and historical lossy height. Runtime currently selects those `official/owner-tech*` paths. The receipt's original label says “uninstalled”; installation status must be determined from the current `assets/game/textures/index.json`, which this audit reads. Current file hashes and master-file hashes match the receipt. This is format lineage, not new generated artwork or current lossless-data compliance.

| Native name | Native | Retained larger crop | Current colour | Adequate8× source? |
|---|---:|---:|---:|---|
| tech04_3 |16×128|96×768|64×512|No,6×|
| tech07_2 |128×128|768×768|512×512|No,6×|
| tech08_1 |128×128|768×768|512×512|No,6×|
| tech09_3 |128×128|768×768|512×512|No,6×|
| tech10_3 |32×128|192×768|128×512|No,6×|
| tech11_2 |128×128|768×768|512×512|No,6×|
| tech10_1 |64×64|256×256 import only|256×256|No,4×|

`tech10_1` has a different retained lineage. Initial commit `bdae4c5c` imported it under `newer/textures/metalt2_3.webp`. Commit `1d6f47c1e7ad39559b8ca7bb30b61c0fb3c83be3` explicitly states that the supplied “metal_2” sheet was actually `tech_computers_2`; it renamed this crop to `tech10_1.webp` with100% byte identity. The current file is byte-identical to that original imported crop: SHA256 `83d0b4bb09cb912760a1c2ad26b8eef566b4a71f73b5627b723ad6a17cb4bb63`. Neither the initial raw upscaled atlas nor a larger/lossless source was located. Its four-times resolution is a source limit, not a reason to upscale it.

The original owner-upscaled `tech_computers_1.png`/`tech_computers_2.png` and original `wall-sheets/manifest.json` are absent from the current worktree and primary checkout. The retained Oct17 plan independently recorded the same absence. Git retains imported crops but no original atlas path. The `level-2026-10-02` atlas has City/Church and Wizard material; it is not this screenshot's source. No unverified claim of a recovered original HD atlas or exact HD-atlas crop coordinates is made.

For source geometry, existing `make_sheets.py` was run against tracked shareware `games/shareware/pak0.pak` into `native-sheets/`. This is a **new deterministic reconstruction of the native reference atlas**, not recovered owner art. It reproduces `tech_computers_1.png`384×344 and the native coordinates: tech04_3(4,4,16,128), tech07_2(28,4,128,128), tech08_1(164,4,128,128), tech09_3(4,140,128,128), tech10_3(140,140,32,128), tech11_2(180,140,128,128). `tech10_1` occupies(244,292,64,64) in native `tech_computers_2.png`384×384. The full matching manifest and native sheets remain in this evidence directory. All available retained `native-tech*.png` were independently compared with reconstructed atlas pixels and matched exactly.

## Smallest justified repair

Preserve the exact current artwork and compare each candidate to its own native appearance, then inspect the **actual adjacent family**. `tech10_1` is especially relevant: current-minus-native average RGB at native/2 is(+24.76,+15.41,+5.46), versus tech08_1(+9.66,+10.69,+7.06), tech09_3(+12.56,+13.55,+11.91), tech11_2(+6.10,+8.32,+7.37). Its bias is distinctly warmer. These whole-image means are diagnostic only: panel machinery and louver areas differ, so forcing all family tiles to the same average would be incorrect. Compare corresponding plate surfaces and retain each tile's native coarse colour field.

A bounded **colour-only** trial should reuse `finish_official_texture.finish` in its photographic mode at the current4× size, with `edge_anchor=False` and no landmarks, starting from a protected lossless PNG decode of each exact selected legacy artwork. Strength0 reproduces the unchanged RGB baseline when input/output size agrees. A modest source-specific `color_strength` and existing `field_sigma` can correct coarse drift while preserving photographic detail. Start with the owner-selected scene family and include `tech10_1` before claiming family palette consistency. No new noise, sharpening, synthetic detail or new material generation is justified. Quantify clipping and preserve flat printed markings.

Current tech08_1 also has a visible narrow upper wrapped band/cut rivets, absent from the earlier f4 crop view. The actual native has different intended features at top/bottom; a self-repeat seam score cannot authorize flattening them. This is an **edge/phase finding awaiting exact scene-based landmark measurement**, not a proven numeric shift prescription. Existing photographic landmark registration accepts measured monotonic Y landmark pairs (X through the established transpose wrapper); use it only if actual native and neighboring texture contacts prove a displacement or spacing error. `fix_offsets.py` has an import-time dependency on absent `wall-sheets/`; do not run its default in-place catalogue-mutating path merely to repair one tile. No source-generation or universal tiling repair is called for.

The6× larger retained crops and4× tech10_1 source cannot qualify8×. A bounded legacy correction remains a legacy trial under the current mission's explicit owner-priority amendment. Historical lossy height maps do not become current lossless scalar masters because colour was adjusted. Palette-only candidates may preserve exact existing relief for isolation, with that historical limitation stated; geometry/relief revision needs its own source-bound proof and review.

## Reproduce and continue

`/usr/bin/python3 audit.py` from this directory reads the current root via the script location and regenerates `lineage.json` and `half-quarter-BOX.png`. It hashes actual current diffuse/height bytes, native identity guards, retained pre4× crops, all named historical Git blobs and current PNG intermediate files. `lineage.json` contains exact file/hash/dimensions and source guards for all9 inspected names. It records no repair or acceptance PASS. Existing source-master and runtime files were read only.

The coordinator should retain candidate-before custody, choose the smallest colour trial, then inspect native/2, native/4, literal detail and the actual BSP neighbor assembly. Independent replay/public-interface review, source/height preservation, runtime tryout and explicit owner acceptance remain separate gates. This document does not claim implementation completion.
