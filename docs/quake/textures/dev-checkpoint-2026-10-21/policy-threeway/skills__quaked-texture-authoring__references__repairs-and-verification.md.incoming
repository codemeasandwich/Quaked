# Repairs and verification contracts

Use a repair only for a demonstrated defect in an unqualified candidate, within the current task's authority. Preserve the native source, generated raw, exact prompt, source recipe, required findings and code/test evidence. Keep one active final master for both tiers. Do not turn one historical example's values into a universal recipe.

## Real-material failure

First decide whether the image actually depicts a recognisable real-world material. High resolution, crisp marks, texture visibility and numerical similarity cannot rescue an abstract or grainy source. Identify concrete cues in the actual image and their relation to the native feature scale. Label uncertain historical materials as interpretations, while still choosing a tangible material to render.

A palette correction can align a photographic material; it cannot create missing stone structure, coherent wood grain or convincing corrosion from synthetic noise. Do not add procedural grain, sharpen pixel contours or invent a border to pretend the defect is closed. Keep such a source on HOLD and resolve its authoring decision under the owner's existing restrictions. Do not infer a failed image call from a timeout or generate a separate source for a tier.

## Coarse colour or measured feature alignment

`prepare_texture_master.py` reuses `finish_official_texture.py` and authors float relief at the canonical master size. Its ordinary photographic fit uses half-native colour fields; quarter-native is a farther comparison, not a new source. Existing `--color-strength` and `--field-sigma` controls may address coarse drift. Measured `--landmarks` accepts an x/y axis and strictly increasing native-to-generated coordinates; use actual measured landmarks, not automatic feature guesses.

Do not switch the whole image to the historical strict mode to make a score pass. The user explicitly wants natural continuous material and allows artistic interpretation. A sharper native colour field may still fail a missing distinguishing form; inspect it. A failed .90/.35 trial on rtex322 did not recover its inner olive rectangles and remained on HOLD.

## Introduced Y repeat discontinuity

```sh
/usr/bin/python3 tools/texture_sheets/register_texture_boundary.py \
  --package "$UNQUALIFIED_SOURCE_MASTER/master.json" --output "$NEW_MASTER_DIRECTORY"
```

This replays the source, applies the qualified Y-only zero-mean periodic boundary correction, then authors relief from the corrected master. It does not move features, clone strips, invent a frame or consume compressed tiers. It is not a universal tiler or a score-based acceptance shortcut. Inspect local clipping, both axes/corners, native band identities, close material detail, distance appearance and both-tier relief. An intentional native joint or different band endpoint is not automatically a defect.

## Semantic facing/substrate or pale-mortar depth

```sh
/usr/bin/python3 tools/texture_sheets/prepare_layered_texture_master.py \
  --recipe "$SOURCE_BOUND_LAYER_RECIPE" --output "$NEW_MASTER_DIRECTORY"
```

It reuses the established layered-veneer mask, wrapped blur and ordered planes with full-precision photographic detail and one final float32 cast. RGB remains unchanged. Do not invoke the old fixed-4× official encoder in `update_level_sheets.py`; only its proven scalar/mask policy is reused here.

The recipe pins schema/policy, native identity, name/edition/dimensions, source MP path/hash, independent source-verification file/hash, original hash, registered diffuse hash, master dimensions and source-specific regions/planes. Read the actual CLI/schema and an existing retained recipe before authoring one. `bevelPixels` has a **256-reference** meaning: 1.5 at a 1024 px square master means 6 master pixels, not 1.5 native pixels. This affects intended material interfaces, never an added image-perimeter bevel.

The verifier must have actually qualified the generated source and master. Its relevant row shape is:

```text
verdict: PASS for the explicitly stated source/master replay scope
materials[]:
  nativeIdentity: actual native ID
  name / edition: actual selected material
  masterPackage:
    file: actual verified master package path
    sha256: actual verified package bytes
```

This is a schema description, **not a proof to copy or fabricate**. A native-only inventory proof made before generation does not contain the future master row. If tonal height fails before tier encoding, obtain an independent source/master-only replay proof with that row, explicitly leaving semantic relief/art unaccepted. Then use the guarded semantic wrapper. Do not encode known-bad maps first or weaken the guard to admit the native-only proof.

Review regions against actual registered RGB and native intention; do not copy another asset's polygon coordinates or depth planes. Plane separation proves a mathematical hierarchy, not that the mask labels physical stone/brick/mortar correctly. Independently classify actual face and joint samples, check decoded central and neighborhood heights at both tiers, inspect mixed interfaces and opposed lighting. Bright pale mortar must not become raised solely because it is bright. Keep source/master qualification, semantic sampling, art and runtime displacement distinct.

## Introduced X/Y seam in an already layered candidate

```sh
/usr/bin/python3 tools/texture_sheets/register_layered_texture_boundary.py \
  --package "$UNQUALIFIED_LAYERED_MASTER/master.json" --axis x \
  --output "$NEW_MASTER_DIRECTORY"
```

Use only for a demonstrated intensity discontinuity after source-specific layered relief has been authored. The ordinary Y-only CLI does not accept a layered package, and the layered CLI does not accept a prior boundary correction. This adapter reuses their existing mechanisms without changing the historical producers. It requires the actual parent RGB/float NPY, source-bound recipe/proof and tool hashes; the unchanged guarded layered CLI must reproduce the parent RGB, NPY and package bytes exactly. A prior periodic-correction key, even null/empty, is rejected. Never remove metadata to bypass a refusal.

The adapter applies the unchanged zero-mean Poisson function, transposing only for X. It changes intensity, not feature placement: it cannot realign an incorrectly placed crack, invent missing material or guarantee a seamless result. It then computes fresh float64 detail from corrected uncompressed RGB, reuses the same physical mask/planes, and casts once. The successor uses `periodic-layered-veneer-v1`, records the parent and original recipe as historical facts, and recomputes current statistics. The original recipe's diffuse hash describes the baseline, not the corrected RGB. Keep generation count one; this command never calls a generator or authors tiers.

Inspect actual corrected material, clipping, semantic samples and opposed lights before deriving Mid/High directly. Then independently replay source/parent/correction/layer math, the actual CLI, both tiers' Q92/method6 maps, normals and public previews. Review literal full-resolution strips across every relevant course, both axes and corners against native intent. A small repeated thumbnail or lower wrap error can hide a straight cut; an intentional native mortar joint must remain. The rtex499 case qualified an X correction through continuous stone faces while preserving the alternating rows' real mortar contacts. Its coordinates, inferred hidden contact and restrained relief are not universal recipes.

The output parent must already exist. Publication uses a native atomic no-replace rename and refuses existing destinations, including a late empty directory or symlink. Unsupported platform/filesystem publication fails closed. macOS is runtime-qualified in the current campaign; Linux support requires its own platform evidence. Keep the parent RGB/NPY guard inputs until separate retirement/replay evidence proves they can be removed. Preserve first input observations; a changed reread must reject, not replace the stability witness.

Run `/usr/bin/python3 tests/texture_layered_boundary_test.py` for this adapter. Its isolated fixtures cover nonsquare X/Y orientation, full-float composition and direct tier bytes, no-op/clipping, changed source after a real guarded replay, malformed/repeated packages and no-clobber output. Fixture/code PASS is distinct from actual texture ART qualification. Preserve sealed failures and the exact successor-specific final reviews.

## Missing flat colour motif inside accepted geometry

```sh
/usr/bin/python3 tools/texture_sheets/prepare_motif_texture_master.py \
  --recipe "$SOURCE_BOUND_MOTIF_RECIPE" --output "$NEW_MASTER_DIRECTORY"
```

Use when the geometry/physical relief is accepted and the missing identity is a flat chromatic mark. It reuses the full-native periodic colour-field approach and smooth bounded compositor, without spatially resampling generated detail. It source-replays the INITIAL verified master and preserves its full-precision height bytes, rather than embossing the restored pigment.

The source/proof/identity/dimension/hash binding follows the guarded master recipe. `policy` is `native-colour-motifs`; its `motifs` object contains `referenceSize`, `regions` (native pixel-edge rectangles), `featherNativePixels`, `fieldSigmaNativePixels`, `strength` and `heightPolicy: preserve-initial-float32`. Regions must be bounded, disjoint and strictly interior. The implementation refuses already revised packages or correction-key presence, including null/false markers; never remove metadata to get past it.

The algorithm evaluates native coordinates at master texel centres, multiplies four inward cubic smoothstep edge ramps, and applies one smoothed full-native colour delta only inside that support. The rtex322 case used two source-measured supports, feather .5, sigma .35 and strength .95; those numbers and coordinates apply only to that reviewed case. Native samples and intended shapes determine a new recipe.

Prove canonical outside-support RGB, all four image edges and unrelated ornament remain byte-identical. Preserve the initial float NPY. Re-derive both tiers from the final master: its eight height/XYZ files should remain identical while diffuse changes. Do not use old compressed maps as authoring inputs. Lossy diffuse encoding can spread changes outside canonical support, so independently replay the entire encoded image and review actual repeats/corners and ROI transitions. Check the small form at close range and both native/2 and native/4; a diffuse centre tint alone does not restore a missing rectangle.

## Rounded hardware on a near-flat plate

Use `prepare_rounded_cap_texture_master.py --recipe SOURCE_BOUND_JSON --output NEW_DIRECTORY` when actual native and photographic forms support rounded heads above a plate. This is a small scalar adapter, not another image/tier producer. It replays an unrevised initial photographic package through the fixed prepare CLI, requires all three baseline files to match and preserves RGB bytes. Never remove revision/correction metadata to make an incompatible source pass.

The closed recipe has `schemaVersion: 1`, `policy: rounded-caps-v1`, native identity/name/edition/dimensions, `sourceMasterPackage` and its hash, genuine `sourceVerification` file/hash, `originalSha256`, `authoringDiffuseSha256`, `authoredAtMasterDimensions`, original `baselineProfile` and `caps`. The cap fields are `referenceSize`, `profile: paraboloid`, `plateHeight`, `capAmplitude`, `microAmplitude` and `heads`; each head has a unique `label`, native pixel-edge `centre` and `radii`. Measure the visible source geometry rather than copying another texture's recipe. Finite non-Boolean values, clipping-safe bounds, bounded evaluation cost, resolved radii and disjoint strictly interior supports are required.

At canonical texel centres `(i+.5)/8,(j+.5)/8`, compose `plate + capAmplitude*max(0,1-rSquared)` with the verified unquantized craft microdetail in float64, then cast once to float32. Contact is C0, not C1; this is relative artistic depth, not a calibrated hemisphere. The cap and plate ranges meet at contact, so a global assertion that every head pixel exceeds every plate pixel is invalid. Bounded micro amplitude does not bound slopes: inspect the analytic base separately and then the actual final height, XYZ and opposed lights. Reject pointed, edge-dominated or noisy hardware even when the equation and broad centre/shoulder/plate ordering pass.

Run `tests/texture_rounded_cap_master_test.py`, independently reconstruct the actual source-specific float field and retain no-clobber publication/source custody. Derive both tiers only after actual physical review, then requalify decoded relief, material, distance and wraps. The public synthetic interface and an actual scalar replay do not themselves establish artistic acceptance.

## Public checks and exactness

Run the relevant maintained interface tests when changing a tool, then the actual source/package replay. Current tests include `prepare_texture_master_test.py`, `hexen2_texture_tiers_test.py`, `texture_batch_review_test.py`, `texture_boundary_registration_test.py`, `texture_layered_master_test.py`, `texture_layered_boundary_test.py`, `texture_motif_master_test.py` and `texture_rounded_cap_master_test.py` under `tests/`. Inspect each invocation/env contract. Portable fixture PASS or skipped owned-asset integration is not an actual texture pass. Do not rerun unrelated broad suites as a substitute for the missing material evidence.

Source/codec verification must independently check actual original/raw/prompt/master bytes, source dimensions/aspect, finite float relief, direct tier reductions, UV-scaled normal math and Q92/method6 encoding. Capture the actual environment. Reproduce preview panels from the bound decoded maps, not screenshots of unrelated files. Existing JPEG replay has a narrowly documented empty-tail padding allowance; it is never a tolerance on material/label pixels or WebP output. If a current replay is byte-identical, report that stronger result accurately.

Do not alter an old sealed HOLD receipt. Preserve a failing verifier source and test result when a verifier defect is fixed; distinguish a tuple/list representation bug or malformed-source guard failure from an actual artwork failure. Correct required failures, rerun the same meaningful checks and bind the successor source/hash. A guard-only source change still needs a fresh producer replay or exact output custody before claiming its artifacts were produced by the new version.

Independent art review must inspect actual decoded Mid and High images, material identity/finish, distinguishing forms and scale, half/quarter comparisons, intended edge relationships, repeats/corners and physical relief. No numerical aggregate can overrule an introduced seam, lost marking, wrong depth or synthetic/noisy material. Carry forward unchanged passes only through exact native/master/tier/map custody. Aliases additionally require full native equivalence and the prior accepted target's actual bytes; no duplicate generation or artwork is needed for truly identical content.

After a final successor passes, register only current canonical paths and hashes. Retain failed source/recipe/decisive-view evidence and a source-to-durable path map where needed. Inventory retired owned files and protected files, then prove source replay and catalog integrity after deletion. Partial material passes are legitimate progress while another asset is held, but they do not shrink the full objective or establish release/owner/runtime acceptance.
