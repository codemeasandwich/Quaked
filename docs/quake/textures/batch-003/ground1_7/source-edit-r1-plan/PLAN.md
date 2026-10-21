# ground1_7 targeted source-edit r1 proposal

**PROPOSED, NOT ISSUED.** This folder contains an exact prompt and its bound plan for independent review. The coordinator will issue at most one built-in edit only after that review passes. No provider call, issuance record, source selection or asset mutation has occurred in this lane.

## Defect and proposed material

The current [independent offline review](../independent-offline-art-v1/REVIEW.md) holds the dominant brown material. I opened the actual retained 1254 RGB raw, its 1:1 detail, enlarged native64 and both-input BOX32/16 panel. The large brown crossing and diagonal bands have rounded cord profiles with lengthwise fibrous marks, which read as roots/bark around convincing cool grey stone. Broad colour and feature scale remain useful. The native itself does not establish historical geology; this edit makes the chosen physical interpretation explicit.

The single change is to make the surface depict **weathered rocky ground with compact dark-ochre earth/mineral matrix between angular cool-grey stones**, with the existing brown footprints forming low irregular compact masses rather than woody tubes. Sparse embedded grit, matte erosion/mineral-fracture structure, small broken edges and shallow restrained fissures should establish that material. New cracks must not dominate the native pattern. The prompt permits the local surface-form change needed to eliminate cylindrical/fibrous root cues while retaining the coarse brown footprint, island placement and scale. It does not freeze the defective tube contours or demand an impossible material correction from sharpening alone.

The existing grey stones remain the unaffected material reference. Their positions, angular broken faces and scale, the brown/grey proportions, muted very dark palette, dark interstices, orthographic albedo framing and X/Y/corner phase are explicit visual invariants. A generative instruction does not guarantee byte preservation; independent review must inspect these invariants on the actual return. No new broad soil field, regular paving, added debris or extra dominant stone islands are requested. Cellular grooves, synthetic grain or a new rootlike result remain HOLD.

## Exact reference order and proposed tool mapping

The reviewed [prompt-r1.txt](prompt-r1.txt) is the complete intended prompt. [plan.json](plan.json) pins its SHA-256 and current input bytes.

| Reference order | Role | Input |
|---|---|---|
| Image 1 | Edit target and actual parent | `assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-003/ground1_7/generated/ground1_7-source-v1.png` |
| Image 2 | Native palette/coarse-layout/scale guide only | `assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-003/ground1_7/originals/native-ground1_7.png` |

Use the built-in `image_gen.imagegen` interface. At execution time the coordinator must inspect both exact local inputs, pass the exact prompt text as `prompt`, the two absolute paths above in that order as `referenced_image_paths`, and `transparent_background: false`. Omit `num_last_images_to_include`. Do not add undocumented model/size/mask/quality/destination arguments or switch to API/CLI. A square 1024 source is requested by the prompt; actual returned dimensions govern qualification. Minimum adequate size is 512×512 for native64, with square aspect and supported opaque RGB PNG. Retain an inadequate return unchanged and HOLD; never enlarge it.

The parent is the original photographic raw, SHA-256 `0ee396b24e4e9afd3fdfa2b5f523e26b098be0cd9805706b03d1fef0c7cb3fa5`. Do not substitute the softened registered master, a decoded tier, a schematic, another revision or an arbitrary latest generated file.

## Existing custody contract, without another pipeline

The working copy lacks `skills/quaked-texture-authoring/references/source-edits.md`; this plan read the exact contract through `git show 6565be3f:skills/quaked-texture-authoring/references/source-edits.md`. The full commit and contract-byte hash are pinned in `plan.json`. The imagegen skill was read for prompt/reference discipline. No Git mutation or policy file restoration was performed.

The material's primary `selection.json` currently records one issued and retained original generation, zero prior known sources, the exact raw hash/dimensions and actual built-in return path. Preserve that journal, original raw, native, initial prompt, held master/tiers, all failed math evidence and the complete initial ART HOLD. Do not reset generation count or rewrite the primary generated pointer to disguise an edit as the original call.

After plan approval and immediately before the one actual edit, the coordinator creates a new exclusive `revisions/r1/issued.json` under the existing material asset directory. It must contain actual timestamp, native identity, revision ID, exact parent/native/primary-journal/prompt file hashes, ordered reference roles, approval/authority references, all earlier issuance references (currently none found) and truthful original/edit/total counts. Seal it; completion must not overwrite its pre-call bytes. At this proposal time counts are original=1, edits=0, total=1. Once issued, counts become original=1, edits=1, total=2 even if the return is unresolved or rejected. The campaign ledger must separately add this actual issued edit to its cumulative total.

Issue that one call. If observation is interrupted, resume the same handle or reconcile its actual transcript and reported output. No hidden retry or replacement call is permitted by this proposal. On return, retain the exact tool-reported PNG bytes in the same revision directory without conversion/resizing or removal of the default output. Write exclusive `retained.json` binding the sealed issuance, actual reported path, copied bytes/hash, actual dimensions/mode/format/timestamp and call counts. The proposed paths in `plan.json` are reservations only; no future return path, timestamp, hash or successful result is invented.

Only after the actual revised source passes independent material/layout/distance/wrap review, seal immutable `source-selections/s1.json` and atomically update `active-source.json` following the existing contract. Bind the selected r1 PNG, exact r1 prompt, unchanged primary journal/native and complete issued/retained history. Use the immutable selection in proof. No current source selection or catalog admission is authorized by a proposed prompt.

## Gates after the actual return

1. Verify exact issuance/return lineage and unchanged primary inputs, actual PNG format/opaque RGB/square dimensions≥512, and absence of an unresolved duplicate call. Count an unresolved issued call honestly.
2. Inspect actual revised raw at literal 1:1 and useful context. The former brown cords must now read as coherent compact earth/mineral crust, without fibres, bark, rope/tube silhouettes, cellular grooves or uniform grain. Inspect the whole brown network, including former crossing and lower diagonal routes, not only a corrected crop. Recheck the grey stones and palette as carefully as the requested change.
3. BOX-reduce both the unchanged native and actual revision independently to 32×32 and 16×16. Compare broad island positions, brown/grey balance, forms and feature scale. Similarity cannot overrule a material failure.
4. Inspect literal full-resolution X/Y joins, all four corners and 2×2 repeats of the actual revision. Ensure physical features continue across each edge, without a softened edge strip or invented border. Existing initial bounded no-dominant-seam observations do not transfer to new bytes.
5. If source gates pass, map the one immutable selected source and its exact edit prompt to the existing `prepare_texture_master.py` route in a fresh output directory, with one 512 RGB/full-precision scalar master. Reclassify actual RGB for physical relief before sampling; the prior source's face/interstice witnesses and math/ART receipts do not accept this revision. Inspect float height/XYZ and opposed lights; compact earth must not become a granular raised rope merely because it is brown or bright.
6. Derive default Mid256 and High512 directly from that same master using existing `derive_quake_texture_tiers.py`. Diffuse remains lossy Q92/method6; height/XYZ data are lossless/method6 with intended eight-bit channel equality. Independently verify the actual selected-source/producer/math/codec chain and inspect both decoded tiers at 1:1, native BOX32/16, repeats/corners, height/XYZ/opposed lights. The existing verifier's primary-only input assumption needs the contract's narrow selected-source binding before it can qualify edited bytes; do not relabel its old PASS or bypass the mismatch.

A failed revised source remains retained on HOLD and consumes its issued call. This proposal includes no automatic second edit. Catalog/runtime/POM, owner acceptance, Dev/CI landing and release remain separate coordinator-owned checks.

## Handoff

This lane writes only this new `source-edit-r1-plan/` folder. The companion JSON records the exact retained inputs, initial held evidence and proposed future paths. Responsible next owner: coordinator and its independent plan reviewer, for exact prompt/reference/material review before issuance. The coordinator retains the Bluey fallback obligation; no child session or proposed revision is a durable service job.
