# Independent fresh-agent forward test

Scope: skill-creator behavioral validation of explicit fixtures only. Read SKILL.md, linked workflow/repair contracts, shared tier standard, repository AGENTS.md and standing owner instructions. Root supervises this short helper and owns production/Bluey records. No generation/API/model calls, network, provider launches, Git mutations, production writes or global config writes were performed.

## Observed decisions and operations

- **source-a: HOLD.** Viewed actual native (64×64 flat gray) and returned PNG (256×256 flat gray). This is below required 512×512, and has no recognizable material structure. The request was already issued; did not issue again. Ran documented `retain` with the fixture root, exact returned file and `source-a/generated/931cf071b84500a899bb27bf78185174bc909a0db93670c815c6ff26feeb2bf8.png`. Exit 0: count remains 1, state becomes `generated-retained-unqualified-dimensions`, dimensionsAdequate=false, adequateFor8x=false, materialQualityAccepted=false. Exact returned bytes retained, SHA 150acf3567487932f966c847a2ec614f21bc56b919e20fc8dff02ceb0d885a67. No upscale, master, tiers or registration justified.
- **source-b: HOLD.** Viewed actual 512×512 returned RGB image at its native resolution. It is dense multicolored synthetic noise with no coherent pores, fracture, fibers, joints or convincing physical material. 8× adequacy does not override that finding. Already `generated-retained`, count 1; checked native, prompt and raw hashes against the journal and dimensions from the actual file. Did not retain again, reissue, author a noise-derived master/relief or derive tiers. Retained raw SHA bacac053259721a4ed88a10467b4b1c8704be11bd55755101be7d9699377db99.
- **Relief routing:** neither source reaches semantic relief authoring. No justified physical face/joint classification can be made from these images. Brightness must not create relief; boundary, layered and motif repairs cannot manufacture missing material identity. Existing prompt is generic ("weathered architectural material") and native is ambiguous. A future owner-authorized replacement would need a concrete reviewed material interpretation, native feature/scale analysis and an exact revised/sealed prompt; no replacement is authorized in this test.
- **Alias: rejected.** fixture-native-c and fixture-native-d share name/dimensions/palette/indexed/RGBA/base mips and flags, but mip 3 is `source-3` versus `target-3`. Full native equivalence fails. No alias reuse or redundant generation performed. These labels are fixture assertions, not native provenance or accepted-package proof; target package/maps/reviews are not supplied either.

## Ordinary issue → retain and duplicate behavior

Created `ordinary-journal/` with a separate synthetic journal, copied unchanged native, exact retained fixture prompt and the already inspected 512×512 noise fixture as a stand-in returned file. Its native-like SHA is explicitly a test identity, not production source proof. No generation occurred.

Exact argv, exit codes, stdout/stderr and before/after journal SHA are in `ordinary-journal-operations.json`:

1. `issue`: exit 0, count 0→1, exact prompt/reference returned; kept `selection-issued.snapshot.json`.
2. Duplicate `issue` while unresolved: exit 1, instructs reconciliation; journal hash unchanged.
3. `retain`: exit 0, exact byte copy into `ordinary-journal/generated/raw.png`; dimensions 512×512 RGB, adequateFor8x=true, materialQualityAccepted=false. This remains material HOLD because the actual image is noise.
4. Duplicate `issue` after retention: exit 1; journal unchanged.
5. Duplicate `retain`: exit 1, no unresolved request; journal unchanged and no duplicate file written.

`fixture-integrity.json` records actual source-a/source-b original/prompt/raw hash checks (all true), dimensions, modes and final journal states. `/usr/bin/python3` reports Pillow10.1.0, NumPy1.26.2, libwebp1.3.2, matching the documented observation.

## Followability and defects

The skill gave enough routing to stop unsafe downstream work, preserve returned bytes, reject aliases with a late-mip difference, avoid treating dimensions as art acceptance and resume without reissuing. No blocking script defect was observed in exercised issue/retain/duplicate paths.

One command-path caveat was exercised: literal documented `--root "$REPO"` with a selection outside the repository fails safely with `Generation journal refused: Path escapes the selected workspace/batch` (exit1, no mutation). Using `--root /private/tmp/quaked-texture-skill-forward-ssew5dj3` works because stored input paths are relative to that root. This is expected containment, not a bug; documenting that `--root` also defines the stored path base would make external-fixture testing easier. The workflow currently describes repository-root production commands rather than external fixtures.

Concrete documentation defect: repair reference contains fused words/numbers in the bevel example (`meaning:1.5 at a1024px ... means6masterpixels, not1.5nativepixels`). Meaning is recoverable, but should be spaced for reliable reading. No repository correction was made by this tester.

Resume: source-a's raw and undersize/material failures are retained; source-b's existing raw and material HOLD remain intact; ordinary-journal count1 is retained and must not be reissued. Root is responsible for carrying these validation findings into the skill feature record. No fixture is qualified texture delivery, runtime acceptance, release or production native proof. No removal/cleanup was performed.
