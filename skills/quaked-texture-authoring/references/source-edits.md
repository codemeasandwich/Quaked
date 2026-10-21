# Tracked edits of a shared photographic source

Read this when an actual source defect needs a GPT image-editing revision. The owner allows revisions while requiring one final shared RGB/scalar master for Mid and High. This does not authorize a new provider, separate tier generation, hidden retries or relaxation of the material gate. Keep the current campaign's literal game/demo scope.

## Issue, retain and qualify

1. Inspect the exact native and candidate images. Name the specific defect and the change requested; explicitly preserve material, colour, composition, scale, unaffected regions and intended wraps. Use the built-in image-edit tool and imagegen skill. An edit can start from a retained earlier revision rather than inheriting a later failed revision, but record that actual parent. Do not feed softened registration output when the original photographic raw is the intended parent.
2. Preserve the primary `selection.json`, primary raw and all pinned prior recipes/evidence. Before the call, create a new exclusive `revisions/rN/issued.json` containing the full native identity, revision ID, timestamp, exact parent file/hash, native file/hash, primary-journal file/hash, exact prompt file/hash, reference roles, authority and model-call counts. Include previous issued revisions, even if an edit branches from an earlier raw. Record original-generation calls, edit calls and total model calls separately. Seal this issued file; never overwrite it with completion state.
3. Issue only that recorded call. If unresolved, resume the same handle or reconcile the actual transcript/output; do not issue a replacement. On return, copy the exact tool-reported file bytes into this revision directory without resizing, conversion or deleting the default output. Write an exclusive `retained.json` referencing the issued file/hash, actual reported output path, copied file/hash, dimensions, format, mode, timestamp and the truthful call counts. An undersized, wrong-aspect or unsupported-format return is still retained but unqualified; never upscale it.
4. Review the actual source at literal resolution and at native/2 and native/4. Check the intended repair AND unaffected material, forms and edges. A layout correction that replaces matte stone pores with glossy cellular grooves is a material HOLD. Retain the precise failure and do not automatically launch another call. A further targeted revision needs a concrete reviewed correction within existing owner authority, not a new owner confirmation merely because it is another edit.
5. Only after the source gate passes, seal a new immutable `source-selections/sN.json` using the fields below, then atomically update `active-source.json` to point to that record. This selects a source; it is not final tier acceptance. Use that selected lossless source and its exact prompt in a new master package. Author matching full-precision relief, derive BOTH tiers directly and repeat all independent source/math/codec, physical material, similarity, tiling and relief gates. Never carry old RGB/scalar proofs forward to different source bytes.

The first tracked campaign edits predate these standard filenames. Preserve their sealed paths/hashes (including exact `source-revision-r1-issued.json` snapshots) and reference their real records; do not rewrite them merely to match this naming example. A mutable completion sidecar is insufficient by itself if it loses the pre-call issued bytes.

## Immutable source selection and existing CLI mapping

Every file reference below contains the actual repository-relative `file` and SHA-256 of its bytes. Create the selection record exclusively; do not overwrite an earlier selection. Its required fields are:

| Field | Meaning |
|---|---|
| `schemaVersion`, `selectionID`, `nativeIdentity` | Version 1, unique selection name and full native identity |
| `original`, `primaryJournal` | Unchanged Low PNG and the retained primary generation journal |
| `generated` | Exactly one selected retained RGB PNG, with actual `dimensions` and `mode` alongside file/hash |
| `prompt` | Exact prompt that produced the selected return, not a rewritten primary prompt |
| `issuedRevisions`, `retainedRevisions` | Ordered file/hash references for the actual issued history and returned custody, including rejected branches |
| `sourceGate` | Reviewed actual material/layout/distance/edge gate for this selected source |
| `modelCalls` | Integer `originalGeneration`, `edits`, `total`; sum and history must agree |
| `supersedesSelection` | Previous immutable selection file/hash, or null for the first selection |

`active-source.json` contains only `schemaVersion: 1` and a `selection` file/hash reference to the currently chosen immutable record. Proofs bind the immutable selection, not the mutable pointer. A later legitimate selection must not invalidate an earlier proof by changing the file whose bytes that proof pinned. Preserve previous selection records and their inputs rather than copying a changed pointer over old evidence.

For an explicitly owner-requested art-variant family, include a stable `artVariantID` in the immutable record and namespace each variant's selection/pointer. They share the unchanged native identity/Low, not a misleading new native identity. Branching from an earlier source does not reset issuance history. Counts in an immutable selection describe history at its sealing time; the campaign ledger retains the current total across all branches. Do not rewrite a sealed baseline's counts when a later variant is issued. A derived registration PNG must additionally bind its exact parent return, processing recipe, code/environment and independent pixel replay; never describe it as byte-identical to the tool return.

Existing guarded semantic wrappers select proof rows by native identity and require exactly one match. A combined verification containing several art variants of that identity cannot directly satisfy this guard. Preserve the combined proof and have the independent verifier emit a genuine one-row receipt for each verified variant, binding its own actual package, the combined proof, actual replay evidence and freshly checked input hashes. Do not change the guard, invent another native identity or manufacture a PASS by copying an unverified row. Each variant still needs actual physical review. Use separate one-item review batches/directories when their shared native name would otherwise collide in generated review filenames.

Map the selected record to the existing prepare CLI directly: `--original` uses its unchanged `original.file`, `--generated` uses its selected `generated.file`, and `--prompt` uses its exact `prompt.file`. Keep source labels, native dimensions and measured controls source-specific. The primary-only `generation_journal.py` remains unchanged; never reset or repurpose its `selection.json` to make an edited return look like the primary raw.

Build the review batch from the new master and its two direct tier receipts using the existing batch shape. Both tier items must bind that same new RGB/float package. The complete source proof separately binds the immutable selection and revision history, verifies the actual selected file equals the prepare input, and independently reconstructs new RGB/float outputs and direct tier bytes. An old verification script that assumes `primary.generated == master.inputs.generated` must be adapted narrowly for this recorded selection before it can qualify an edited source; do not bypass that mismatch, rewrite the primary journal or relabel an old proof. This contract adds custody records, not another image or tier producer.

## Verification and accounting

Source proof must bind the native identity, unchanged primary journal/raw, every recorded edit issuance and actual return, actual parent lineage, final selection, exact producer inputs and new uncompressed RGB/float output. Validate files and hashes from bytes rather than trusting a `PASS` label or call-count field. Source custody, numerical reconstruction, visual qualification, registration, runtime and owner acceptance remain separate.

Keep counts distinct: primary source chains, issued edit calls, retained edit outputs, registered distinct materials, native bindings and physical map files. An edit does not add another distinct material or another registered master. An unresolved issued edit counts as a call issued, never as a retained output or a successful asset. The canonical prepare CLI's local single-input metadata is not the complete model-call history; retain that history in the revision/source proof without falsifying or resetting the primary generation journal.
