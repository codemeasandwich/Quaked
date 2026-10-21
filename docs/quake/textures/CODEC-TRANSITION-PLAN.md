# Quake codec transition: independent implementation plan

20 October 2026. Plan only; implementation, exports and qualification remain pending. The machine-readable contract, source hashes, actual candidate bindings and detailed regression cases are in [codec-transition-plan.json](codec-transition-plan.json).

## Decision and source evidence

Add `derive_quake_texture_tiers.py` as a narrow Quake entry adapter importing the existing bounded input, image/scalar loading, periodic RGB reduction, float height reduction, normal math and diagnostic helpers. Keep `derive_texture_tiers.py` and all existing producer/repair files byte-for-byte unchanged. Call its existing `encode` for diffuse. Add only an explicit `encode_role(image, role)` lossless branch using the same Pillow/BytesIO WebP architecture for data roles.

An optional flag or refactor inside the shared deriver is smaller by line count but changes its source SHA. All nine current Quake master records and 51 of 55 current Hexen master records pin `ac7f61b22ffaa78b16aeb0088ae3221b9abc32204b5cbe931e1e56bb935ea8d9`. Boundary, layered and motif tools check exact producer paths and hashes before replay. Default byte compatibility does not preserve that guard. The remaining four Hexen records have a different recorded shape; this plan makes no validity claim about them.

Do not monkeypatch encoders, infer roles from image mode/filename, duplicate numerical implementations, run legacy main to create temporary lossy maps, or add another source registry. The adapter duplicates only the small CLI/output orchestration needed to select the current policy without changing historical producers.

The current review builder also says every map is lossy. Add `build_quake_texture_batch_review.py`, which validates current batch/manifest bindings then imports its unchanged `build(item, root, output)` panel function. Its small HTML wrapper states the mixed policy accurately. This preserves both panel implementation and historical source/HTML replay.

## Data and receipt contract

Low remains the unchanged native bytes; Mid defaults to 4× and High to 8×. Each calls the existing reduction helpers directly on the same lossless RGB/full-precision scalar master. Normals use the uncompressed reduced scalar. Current native inputs may be RGB or fully opaque RGBA: actual `metal9_4` and `wwall1_1` originals are RGBA with alpha 255. Reject transparency instead of flattening it.

Diffuse stays lossy WebP Q92/method 6. Height and separate normal X/Y/Z use lossless WebP/method 6. Passing quality 92 in lossless mode is recorded as compression effort, never permission to alter pixels. A whitelisted mask encoder role may share the policy, but this CLI has no mask authoring path and qualifies no native alpha/mask family.

Retain the existing quantization exactly: height is `round(height × 255)`; normal components are `round(clip(normal × .5 + .5, 0, 1) × 255)`, both NumPy ties-to-even uint8. Record the existing float32 BOX stage when reduction is needed. Parse actual RIFF chunks; require VP8 for colour and VP8L for data. Compare every decoded RGB sample against the intended scalar L image replicated into RGB. Data mismatch count, integer compression MAE and maximum must all be zero. Float-to-8-bit quantization and resulting angular error remain separate nonzero-capable diagnostics.

Use tier manifest schema 2 with explicit per-role encoding, intended/decoded channel hashes, quantization diagnostics, actual codec environment and adapter/shared-deriver/normal-math hashes. Keep legacy schema 1 unchanged. Use batch descriptor schema 3 with `encodingByRole` and new tier-receipt bindings; retain the existing native/master/tiers structure without a contradictory blanket `lossless:false`. Legacy schema 2 remains historical. Recheck source/tool bytes before publishing a manifest; retain a failed new directory without reporting success.

## Qualification sequence

1. Root reviews this independent plan before implementation. Implement additive adapters and public subprocess tests; preserve protected producer hashes.
2. Run the unchanged legacy tier, boundary, layered, motif and review suites. Snapshot all current Quake/Hexen masters and legacy assets/receipts. Verify old actual output and review replay still matches exactly.
3. Test independent non-square >8× fixtures, float64/tie/end-point scalar values, independent scalar/normal oracles, per-role RIFF structure and exact decoded channels. Prove no compressed-tier chaining or normals derived from quantized height. Exercise existing malformed-input/output/source guards plus transparent-native and explicit-role rejection.
4. Obtain independent public testing and code review. Test the new review CLI against actual decoded pixels and bound manifests; reject wrong policy, missing roles, escaped paths and tampered maps.
5. Re-export church1, maya1_9, city8_2, rock3_2 and wwall1_1 directly from retained masters into new sibling directories. Both diffuse files per material must match legacy bytes under the recorded environment; all eight data files require exact intended decoded values. Regenerate affected relief/lighting reviews. Preserve individual art/edge HOLD findings and the unencoded metal relief holds. A codec pass is not art acceptance.

The JSON lists exact planned commands; new commands do not exist yet. This planning run read code/records and hashed current producers, with `/usr/bin/python3`, Pillow 10.1.0, NumPy 1.26.2 and libwebp 1.3.2. It ran no suites, generated/exported no image, changed no masters/assets/Hexen files and performed no Git operation. Root owns Bluey fallback reconciliation, integration, runtime/owner acceptance and authorized Dev checkpoints.
