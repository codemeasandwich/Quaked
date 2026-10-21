# Operational workflow

Commands below run from the repository root. Set `REPO` to `git rev-parse --show-toplevel`, `BATCH` to the actual selected batch directory, and `MASTER` to its new master output directory. `--root` is also the base for paths stored in the journal; it must contain that batch. Use the isolated fixture root for fixture testing, never a production root to admit external test paths. Use actual source IDs and paths; examples are command shapes, not fixed batch IDs or acceptance evidence.

## 1. Current authority and inputs

Read the repository `AGENTS.md`, shared owner instructions and current task/goal. Use Bluey's supported identity/checkpoint/task-context/workflow reads and preserve its actual ownership. An unread message, checkpoint or free capacity grants no new assignment. If the service is unavailable or a mutation has unknown outcome, retain the exact failure, work, responsible owner and next action in the project ledger; do not invent a replacement identity or claim a mutation succeeded.

Inspect `git status`, current branch/head and worktrees before writes. Follow the current owner-approved branch arrangement; the ongoing campaign uses Dev and preserves the separate trial. Never reset, force-push, stage unrelated work or silently publish another unfinished checkout. A skill invocation is not release authority.

Locate the live Hexen records through `docs/hexen2/textures/GOAL.md`, `progress.json`, `campaign-status.json`, `world-queue.csv` and the `currentAssets` catalog path. For Quake use the current official source/inventory/pack records. Follow `docs/resource-layout.md` and the existing resource resolvers instead of restoring legacy duplicate directories. Do not copy historical coverage numbers into new claims.

Choose a bounded set that can be fully inspected and reviewed. Find existing accepted and pending sources before generating anything. Use exact native IDs, not filenames alone. Keep the whole campaign scope intact; ordinary WORLD completion does not imply models, skins, sprites, animated/liquid/sky/utility surfaces, WAD or gfx completion.

## 2. Native audit and retained originals

Reuse `tools/audit_hexen2_textures.mjs` for Hexen II/Portal WORLD sources. Its read-only inputs are the actual owner-supplied game roots; get their current locations from existing source records and verify them. It probes PAKs across gaps and honors expansion/loose precedence. Never treat duplicate Portal installations as additional unique textures.

```sh
node tools/audit_hexen2_textures.mjs \
  --base "$BASE_DATA1" --expansion "$PORTALS_ROOT" \
  --output "$NEW_EVIDENCE_DIRECTORY" \
  --originals "$BATCH/originals" --select "$NATIVE_IDS_COMMA_SEPARATED"
```

Repeat `--expansion` only when independently retained installations are part of the source proof. Outputs must be new directories. Use the existing Quake native audit/extraction tools for Quake sources, not the Hexen parser by assumption.

A normal new batch retains:

```text
native-selection.json       Immutable IDs, dimensions, original hashes/provenance
selection.json              Mutable issue/retain journal, per-source prompt/profile
originals/                  Unchanged native PNGs and inspection contact
prompts/                    Exact generation requests
generated/                 Raw built-in outputs (directory name: generated)
masters/ASSET_KEY/           color.png, float height.npy, master.json
tiers/ASSET_KEY/            Both tiers' maps and manifest.json
review/                     Actual decoded colour/distance/repeat/relief sheets
```

Keep failed/revised recipes versioned, then retain only one active registered package when final variants qualify. Keep a separate immutable journal snapshot if a review pins its file hash; do not overwrite that snapshot with later request states.

For a proposed WORLD alias, independently compare dimensions, palette, indexed pixels, RGBA pixels, every embedded mip, ordinary/material flags and all applicable source provenance. Check the actual accepted target package, Low, maps and reviews. A matching name, screenshot, nearest-looking material or base-level hash alone is insufficient. Other families need their own native-level, UV/frame/tint/mask checks. Aliases retain their own native ID and Low; count unique physical maps separately from native references.

## 3. Exact material brief and prompt

View each actual native with `view_image` before using it as a local image-generation reference. An enlarged contact helps interpretation but does not replace native identity proof. Inspect original feature boundaries and source usage where material interpretation is consequential; orientation/usage counts do not by themselves identify a material.

Write a concrete material interpretation, finish and observable physical cues. Preserve uncertainty as provenance, not as permission for visually indeterminate output. Specify:

- Native palette/value relationships, coarse forms, distinguishing small marks and their scale.
- The real material and coherent natural surface structure that should be visible at close range.
- Existing joints, bands, edge intersections and intended repeat directions.
- Flat orthographic texture capture with even diffuse light, restrained material response and no scene/background, text or presentation board.
- No invented edge bricks, perimeter bevel/shading, large new damage, objects, pixel contours, uniform grain, noise overlays or sharpening halos.
- ONE colour source, exact native aspect and a stated minimum of native width×8 by height×8. Never request separate Mid/High outputs or generated normal-map variants.

Obtain independent plan review of the exact native/prompt/relief interpretation required by owner instructions. Preserve the reviewed prompt bytes/hash. Version a changed prompt after it has been sealed; do not rewrite a prompt already used for a generation or misattribute an output to a new prompt.

## 4. Guarded primary generation journal and shared source

The skill's `scripts/generation_journal.py` uses the existing batch `selection.json`; it is not another registry or an image API client. Each item must have `id` (full native SHA-256 identity), `name`, `edition`, `nativeDimensions`, `original`, `originalSha256`, `prompt`, `promptSha256`, `generationCount: 0` and `generationState: "not-issued"`. Original PNG and prompt TXT must be retained under that batch. Use reviewed real hashes, never placeholder IDs as evidence.

Immediately before one built-in call:

```sh
/usr/bin/python3 skills/quaked-texture-authoring/scripts/generation_journal.py \
  --root "$REPO" --selection "$BATCH/selection.json" issue "$NATIVE_ID"
```

This records count=1 and returns the exact prompt/reference. Pass them as structured image-tool arguments, with the local native as the reference and `transparent_background: false` for the qualified opaque workflow. Follow the imagegen skill's built-in mode. Do not interpolate prompt contents into shell commands.

After the tool returns, retain its exact reported output path, not an arbitrary “latest” cache image:

```sh
/usr/bin/python3 skills/quaked-texture-authoring/scripts/generation_journal.py \
  --root "$REPO" --selection "$BATCH/selection.json" retain "$NATIVE_ID" \
  --generated "$RETURNED_BUILTIN_PNG" \
  --destination "$BATCH/generated/$NATIVE_ID.png"
```

The helper copies bytes without resizing/conversion, records actual hash/dimensions/mode and keeps the default output in place. It uses a short exclusive journal lock and an atomic metadata replacement. Do not hand-edit the journal concurrently or remove a lock solely by age. Preserve an unreferenced copied raw if an external concurrent change prevents metadata commit, then reconcile.

`adequateFor8x` proves only dimensions/aspect/current RGB format. It never accepts material quality. Undersized or unsupported PNGs are retained and marked unqualified; do not feed them to master preparation, upscale, crop away structure or derive High from compressed Mid. Do not silently change to the CLI/API: the imagegen skill requires its explicit authorization and local credential. Never expose credentials in output.

If a call or observation times out, poll the SAME live handle or inspect authoritative terminal state. An issued count=1 is not proof of a failed request. Do not reset it or create another journal to hide an unresolved request. Reconcile the actual returned file/transcript first. A genuinely rejected source stays visible; any deliberate source-replacement decision must respect the owner's existing constraints and retain supersession provenance, never create independent tier sources.

The owner permits targeted GPT edits of the shared source. Keep the primary generation journal unchanged and follow [tracked source edits](source-edits.md) for separate issued/returned revision records and final-source selection. The primary `generationCount: 1` describes that original request; it must not conceal additional edit calls. Existing master producers consume one selected input and do not observe model-call history; their local `generationCount: 1` is not a campaign call-count receipt. Independent source proof must verify the complete revision chain and actual total before accepting an edited input. Do not rewrite old producers or historical proof hashes to make a new source appear to be the original return.

Before proceeding, assess the actual source for recognisable physical material, natural detail and native fidelity. An adequate but abstract/noisy source remains on HOLD. Same-source finishing is appropriate for palette/registration repairs; it cannot manufacture missing real-world material structure.

## 5. Shared master and semantic depth

Use the verified asset-codec environment. The current production receipts use `/usr/bin/python3` with Pillow 10.1.0, NumPy 1.26.2 and libwebp 1.3.2. These are byte-reproduction observations, not permission to install a global dependency or silently change historical codecs. Record the actual environment, and explain/requalify codec differences rather than weakening exact checks.

```sh
/usr/bin/python3 tools/texture_sheets/prepare_texture_master.py \
  --original "$ORIGINAL" --generated "$RAW_SOURCE" --prompt "$PROMPT" \
  --name "$NAME" --edition "$EDITION" --profile "$REVIEWED_PROFILE" \
  --color-strength .65 --field-sigma .75 --output "$MASTER"
```

The qualified ordinary starting fit is .65/.75; these are adjustable existing controls, not universal material laws. Preserve a new receipt when changed. Canonical authoring is 8× native; the raw must be at least that large and match aspect. Profiles are numerical shaping weights, not proof of historical material identity. Use measured landmark registration only when an actual source alignment defect warrants it.

Inspect RGB before authoring further outputs. Check physical meaning of scalar relief before either tier is encoded: faces above mortar, facing above exposed substrate, inset below frame, pigment flat where appropriate. Pale colour does not imply raised geometry. Use independently classified actual face/joint samples and actual opposed lights, not only scalar ranges or algebraic bounds.

If a semantic correction is needed before tier derivation, the guarded layered wrapper requires an independent PASS **source/master-only** proof row binding the actual native ID, name, edition, master package path and SHA. A prior native-only inventory proof lacks that future master row. Qualify the source/master first without pretending its current height is artistically accepted; then use a source-measured reviewed semantic recipe. Do not encode known-bad tiers, fabricate a PASS row or relax the guard. See the repair reference.

## 6. Derive both tiers directly

```sh
/usr/bin/python3 tools/texture_sheets/derive_texture_tiers.py \
  --original "$ORIGINAL" --master "$MASTER/color.png" \
  --height-master "$MASTER/height.npy" --output "$NEW_TIER_DIRECTORY"
```

The CLI independently reduces RGB and uncompressed full-precision scalar height for Mid4× and High8×. Normals use uncompressed reduced height and UV-scaled slopes. It emits diffuse, height and separate XYZ maps at Q92/method6 with hashes/diagnostics. Never use an old fixed-4× official encoder, decoded lossy height or a compressed tier as its authoring input.

Bind a batch descriptor with `schemaVersion:2`, `pathsBase:"repository"`, family, default Mid, factors4/8, quality92/method6/lossless=false and `items`. Each item binds native identity/dimensions/palette/indexed/RGBA hashes, unchanged `original`, generation count, master/tier receipt paths+hashes and each tier's factor/dimensions/role file paths. Current worked shape: the final batch007 descriptor in the authoring catalog's library. Adapt to the actual items; do not copy its IDs or fixed counts.

```sh
/usr/bin/python3 tools/texture_sheets/build_texture_batch_review.py \
  --batch "$BATCH_DESCRIPTOR" --paths-root "$REPO" --output "$NEW_REVIEW_DIRECTORY"
```

## 7. Verification, registration and completion

Independent public checks must bind actual originals/raw/prompts/recipes/tools, reconstruct master/height/normal and direct Q92/method6 outputs, and verify review-panel provenance. Reuse `tests/hexen2_texture_tiers_test.py` oracles and bounded existing public-verifier examples; do not copy a historical PASS receipt or assume a batch-specific verifier is generic. Inspect retained HOLD causes, distinguish verifier bugs from actual asset findings, and rerun unchanged meaningful tests after repairs.

Review each tier's 1:1 real-material cues, decoded colour/forms/scale at native/2 and native/4 with BOX on BOTH inputs, intended repeated tiles and corners, decoded height/XYZ and opposed lights. Example: native64 and High512 both reduce to32 and16. A numerical score cannot accept unreadable material, a missing distinguishing form or a visible introduced join. Preserve intentional native joints and band endpoints instead of forcing a different layout.

Register only individual passes and fully proven accepted-art aliases in the active catalog. A receipt may hold one texture while other named materials pass; never promote its overall HOLD to a batch-wide PASS. Record unique physical packages/maps AND native bindings, keep unfinished native families/holds visible and preserve the full objective. Authoring qualification, runtime/pack/GPU behavior, owner acceptance, Git landing, CI and release are separate claims.

The maintained Hexen catalog guard requires changed registrations to link PASS receipts with the filename markers `actual-`, `preview-`, `art-review` and `final-custody`. They must collectively bind the current package, tier receipt and every map. If actual preview verification is part of a combined technical proof, the independent verifier can issue a preview-specific receipt binding that completed replay and fresh output hashes; do not invent a PASS, rename an unrelated proof or relax the guard. Preserve a failed admission and re-run the unchanged guard after correcting the records.

Before cleanup, inventory exact owned superseded paths/sizes and active consumers. Preserve Low, one canonical final package, raw/prompt/recipes, code provenance and decisive failure evidence. Check protected paths/hashes before/after; prove replay without retired intermediates. Do not delete other agents' data, shared targets or trial worktrees. The owner's cleanup authority is not a blanket permission for unrelated deletion.

Periodically stage an explicit owned scope on Dev, preserve other staged/unstaged work and run the maintained commit hook on the exact index. Verify commit parent/tree, staged build receipt and terminal success. A permission/observation failure is not a started or completed build; do not bypass hooks. Push only within existing authority using normal fast-forward history and verify exact remote commit/CI. Prod accepts the controlled promotion of a specific tested Dev commit; this skill never grants direct Prod commits, protected-tag creation or release/Pages authority.

The owner explicitly approved texture and HTML checks for Dev and prohibited full builds as part of texture work. The maintained hook now has a default exact-index texture/HTML route: the maintained texture suites, sealed snapshot catalog custody, distribution contracts, web build and site verification; no desktop, Cargo, LAN or Tauri build. It rejects mixed scope rather than silently launching native builds. Gate-control changes require an independent exact-blob bootstrap review. Output is exclusively reserved under `dist/texture-checkpoints/<tree>/`; it does not replace shared `dist/staged`. Follow the current approved gate instructions in `docs/hexen2/textures/checkpoint-63-preflight/IMPLEMENTATION.md`. Release/CI checks remain separate; do not trigger native CI as part of this HTML-only campaign.

The owner tests through HTML and has asked to remove this lane's unneeded build artifacts. After required gates, retain their receipts, inventories, logs and needed runtime evidence, then retire inactive owned native payloads and obsolete build copies. Preserve the current HTML build, authoring reviews and source/master/map assets. Prove ownership from exact checkpoint trees and inventories; check active use and path identities before deletion. Shared caches, a running app and other agents' outputs remain protected. A retained build receipt describes a historical success after its payload is retired; record that boundary rather than claiming the binaries still exist. Do not weaken required gates or retain whole compiled copies merely as a substitute for small verification records.
