# Shared Quake / Hexen two-tier authoring delivery

The owner’s single-master standard is now implemented in `tools/texture_sheets/derive_texture_tiers.py` and documented in `docs/texture-tier-standard.md` for Quake, its official expansions, Hexen II and Portal of Praevus going forward. Low is unchanged native game art; Mid is default4×width/height and High is8×. This is an offline authoring increment, not an engine quality-setting change or runtime release.

## Current reviewed materials

| Native identity | Edition | Native Low | Mid default | High |
|---|---|---|---|---|
| rtex337 | Hexen II |64×128|256×512|512×1024|
| rtex450 | Portal of Praevus |128×128|512×512|1024×1024|
| rtex041 | Hexen II |64×128|256×512|512×1024|
| ttex016 | Portal of Praevus |64×128|256×512|512×1024|

`assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/current.json` is the active asset/review catalog. It references `tiers/batch.json`, one canonical RGB/float-height master package per material, both tier manifests and all40 map files. `tiers/index.html` is the saved selector/repeat/distance/relief preview, and `tiers/four-materials-mid-preview.jpg` provides a direct visual overview. Prompt paths and raw generation hashes are pinned in each master package. Exactly two new built-in GPT generations were used, one each for wood and red earth; the existing sandstone and grey-masonry generation outputs were reused without regeneration.

Each canonical colour master is exactly8× native. Coarse photographic colour fitting and the measured sandstone joint registration happen once at master resolution. A full-precision float32 scalar relief source is authored once, without the older8-bit height rounding. Mid and High RGB/height are reduced independently from the same master package; normal derivatives use each uncompressed tier-height reduction with the existing resolution-scaled cyclic math. Neither tier, nor its normals, uses a compressed tier map as an authoring source. Every enhanced diffuse, height and normal XYZ map is directly encoded lossy WebP quality92/method6.

## Verification

Independent plan and code review passed. Six independent public CLI test groups passed, including exact payload replay, forbidden chaining controls, nonsquare analytic gradient invariance, invalid master/height rejection, source preservation and overwrite refusal. The small opt-in `craft(...,quantize_height=False)` change preserves the entire prior default computation and normal function; captured prechange height/normal bytes match the postchange default exactly. Exact golden fixture profile overrides are retained separately for reproducibility.

Independent actual-asset checks replayed all four colour/relief masters and all40 enhanced-map bytes using the pinned authoring environment (Python3.9.6, Pillow10.1.0, NumPy1.26.2, WebP1.3.2). Synthetic tests used another recorded codec environment; cross-codec byte identity was never assumed. Original PAK/nativeRGBA identity, master size/lineage, half/quarter original-dimension BOX comparisons and all three angular diagnostic paths passed. The first verification HOLD came only from reconstructing an incompletely documented golden-test profile; its exact .3strength/.5cap clarification resolved that check without changing any asset or rewriting the prior receipt.

All eight actual enhanced surfaces passed independent photographic, half/quarter-distance, repeated-edge and decoded-relief review. ActualHigh files and close cyclic/normal/light views were inspected, beyond the overview JPEGs. No further master repair was required. The source’s intended masonry/plank edge joints were conserved; seam diagnostics were not misused as automatic artistic acceptance.

The public preview passed71 byte-exact HTTP resource checks. A real browser also confirmed defaultMid, unchangedLow, High and restoredMid, including all four actual image dimensions/paths. Temporary browser tab and exact owned loopback server were closed; no process-group or foreign-process termination was used. Direct file navigation in the in-app browser was blocked by its URL protocol policy and was not bypassed; the saved HTML/images and HTTP proof remain available.

## Boundaries and next action

The new derivation tool is shared by Quake and Hexen. Existing Quake deliveries are not silently retrofitted: future assets must have adequate retained masters, never an upscaled/transcoded4× file. This current four-material art batch is Hexen/Portal-specific and remains in authoring storage, outside Quake runtime packaging. Opaque RGB/scalar-height work does not qualify alpha/glass/emission/animation/liquid/sky semantics.

No Hexen gameplay, in-engine integration, packaging, complete campaign coverage, commit, push or new release is claimed. Foreign renderer/audio/gameplay work and its staging were left to its actual owner; only the shared height tool’s isolated opt-in was changed here. Owner acceptance remains distinct from independent review. The next batch follows the native identity inventory and the same single-master standard. Bluey still refuses the retired session and its prior registration outcome is unknown; the initiating coordinator retains this ledger for reconciliation after service-owner identity/storage repair, without claiming a board mutation or background durable worker.
