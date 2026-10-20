# Independent review — box-art standardization, 20 October 2026

Reviewer: supervised independent implementation-review lane `art_contract_update`, in `/Users/bri/SOURCE/Quaked`. This lane changed only the three assigned maintained test files and the new review/test receipts. The implementation owner controls runtime mappings, artwork derivation, native compilation, landing and source cleanup.

## Current disposition

**Source and artwork corrections resolved on final re-review.** Final maintained automated checks pass. Native test qualification is currently blocked by the ordinary missing desktop resource prerequisite described below; no native assertion has run yet. The initial findings below are retained as review history. Runtime dimensions and tests do not establish owner acceptance.

1. **Resolved: preserve Malice's original century.** `assets/authoring/box_art/import-2026-10-20/malice/side.png` reads **23RD CENTURY ULTRACONVERSION FOR QUAKE**. The AI prompt and current runtime `assets/boxes/malice/spine.webp` say **3RD CENTURY ULTRACONVERSION FOR QUAKE**. Restore the leading `2`, update the derivative hash/manifest/provenance and visually recheck the result. Quoth's **QUOTH / AN EXPANSION MOD FOR QUAKE** matches its source.
2. **Resolved: update current source documentation.** At this inspection, `assets/boxes/SOURCES.md` still describes 29 live faces, no cropping/edits/generation, and placeholders for supplied Dopa/Arcane Dimensions/Abyss/Quaked faces. Record the 53-face standard, split wraps, two AI spine reflows, retained originals and sole missing retail Hexen II back among these 18 defaults.
3. **Resolved evidence presentation correction:** `spine-contact.png` crops vertical preview content. Actual 340×2000 runtime panels do not have the same clipping. Use proportional contain thumbnails so the review artifact accurately represents complete runtime content.

## Source and artwork review

The production diff is small: the existing `GAME_BOXES` mapping switches existing defaults to canonical `front.webp`, `back.webp`, `spine.webp`, adds six artwork IDs and missing supplied faces, and preserves Shareware's sticker. Existing per-face overrides, alias priority, failure fallbacks, selection and playability code are unchanged. `BOXED_FOLDERS` adds Alkaline, Tremor and Hexen 2 Shareware to the existing display-only folder retention rule. The existing scanner still requires real mountable files before emitting pack tokens, skips unknown empty folders and does not fabricate absent folders. No parallel shelf/art API, persistence mechanism or engine-compatibility path was introduced.

The initially reviewed derivation record contained 53 roles for 18 IDs and 47 source records, explicit original hashes, source-only archive paths, crop rectangles, contain-fit content bounds and all 29 former runtime-original resolutions. Generated Malice/Quoth layouts are explicitly marked `origin: generated`, point to retained `editedFrom` source paths, identify `image_gen.imagegen` and retain their prompts. Original runtime files, supplied wraps and separate artwork remain byte-verifiable. Runtime derivatives are excluded from the original-byte identity assertions; original custody assertions remain exact.

Inspected every front and supplied back on the full contact sheets and all 18 runtime spines on a temporary correctly proportioned 85×500 contain sheet. Also inspected actual Malice, Quoth and Alkaline runtime spines at full height and compared both AI-edited spines with their original sources. No whole wrap is assigned as a live front. Titles/logos are within the runtime panels; meaningful text is not cut by the source-panel boundaries in the reviewed previews. The Malice semantic defect was material despite correct crop geometry; it has now been repaired and rechecked, as recorded below. Retail Hexen II's back is absent and retains its printed placeholder. Restraining geometric padding preserves proportions; it does not recover source detail in the older small retail scans.

The standardized canvas ratios (.82 front/back and .17 spine) match the existing shelf geometry. Existing CSS background cover cannot crop a standard bundled face merely because of an aspect mismatch. Local user images retain existing behavior and are outside the bundled normalization contract.

## Maintained checks actually run

`tools/distribution/engine-tests.mjs` has a fixed full-suite list and does not support a targeted suite argument. Used its underlying maintained `tools/run_tests.mjs` entry point for the targeted shelf suite, with the same Three module setting. No owner game archives, builds, native executable or cleanup were used in these two commands.

```sh
node --test tests/box_art_contract_test.mjs
QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_shelf_test.js
```

- `maintained-box-contract.log`: **3/3 pass**. All 53 runtime hashes/bytes, WebP format/dimension metadata, mappings and derivation correspondence; all historical original byte/hash identities and one canonical archive per original blob; retained 41/29/12 move-plan and 13-relocation invariants; all 42 historical canonical original identities; held poster and screenshot-collage exclusions; real desktop collector runtime inclusion/source-only exclusion.
- `maintained-shelf.log`: **13/13 pass**. Defaults without local art, independent local overrides, aliases/canonical priority, missing faces, unavailable-title labels and game-selection/playability boundaries.
- Scoped `git diff --check`: pass.
- Added native filesystem regression `retained_new_boxed_folders_remain_visible_after_original_art_is_imported`; **not compiled/run in this lane**. Parent owns the serialized native gate.

Historical 19 October receipts remain unchanged. The preserved baseline runtime manifest is checked against their immutable SHA-256 pin. Public-interface full-pixel decode, browser turnover and viewport receipts belong to the separate independent public tester and are not claimed as this lane's execution.

## Reviewed snapshot

These hashes identify the snapshot in which the findings above were detected. Any repaired image must receive a subsequent review entry before this report can close.

| Path | SHA-256 |
|---|---|
| `src/newer/ui/game_shelf.js` | `5041dcad95ad8f20904c45ae0041293cc8ac7ae1264a531f7ebf1f0371226b49` |
| `src-tauri/src/library.rs` | `557df13566ad3b9ccf6cd5b9ff44d02496057171637b1fbdc151d798e0089d37` |
| `tests/box_art_contract_test.mjs` | `db166b89314c9f80f930305ae37b606e038689a00ec94b97adc29702e168cef6` |
| `tests/game_shelf_test.js` | `3a900a6820fd1e20ea2185795ccc6e42a1561776ef914a182810d82838fb975d` |
| `src-tauri/tests/library_contract.rs` | `e1a393c499fffe9e7aabeae75879480be5ee594690b285402c988cccac44731f` |
| `assets/boxes/manifest.json` | `55587f092ffa3453ff2a97024596749176af7d3c12fef1b95d01043bbf769b03` |
| `assets/boxes/malice/spine.webp` | `c0bd9c4ef54b476f122afa8058e00ebe53792feac8f1b86a2d50b4f3a630d196` |
| `assets/boxes/quoth/spine.webp` | `dad7d1615a370ee9b5ff62eef4f5d7eaa2e09759df9dee5bba247cbb14d15350` |
| `docs/evidence/box-art-standardization-2026-10-20/derivation.json` | `45222aed01f6777ad010ac3c6d11c1db089b4b057b17225e9d1ba75b91dd50cc` |

## Boundaries

This review is neither owner visual acceptance nor a native packaged-app trial, landing receipt, source deletion authorization or release. Bluey is unavailable with the implementation owner's recorded storage error; no board mutation is claimed. The two required corrections and evidence-thumbnail correction are resolved in the final re-review below. The implementation owner retains native qualification, delivery gates and owner acceptance through the normal project workflow.

## Final correction re-review

Inspected the corrected runtime Malice spine at full 340×2000 resolution. It now reads **23RD CENTURY ULTRACONVERSION FOR QUAKE**, agreeing with the retained owner original. MALICE, PC CD-ROM and quantum access remain complete. The corrected source is retained separately as `edits-2026-10-20/malice/spine-layout-corrected.png`; the initial failed layout and original prompt are unchanged and explicitly marked rejected. The final derivation has **48 source records: two selected AI edits plus one retained rejected AI candidate**, in addition to originals. The correction prompt and `corrects` relationship preserve the failure/repair chain; no rejected image supplies a current runtime face.

Re-read current `assets/boxes/SOURCES.md`: 53/18 counts, dimensions, lossless WebP, exact recipes, split wraps, AI exceptions, retained originals, source-only exclusions, missing Hexen II back, local aliases and unplayability boundaries are now described accurately. Re-inspected regenerated `spine-contact.png`: proportional 85×500 contain thumbnails display complete panels and match actual runtime assets. All three review findings are resolved.

Reviewed `tools/box_art/standardize.mjs`: it uses exact recorded crops, hashes every retained source before derivation, proportionally fits with Lanczos to the standard canvas, records centered content bounds and emits lossless WebP plus current hashes. Preflight rejects invalid game/face names, noncanonical or repeated runtime destinations, out-of-authoring archive paths and traversal components before writing images. Optional selection preserves unselected recorded identities. It does not mutate or delete owner-library files. No new runtime API or storage mechanism was introduced. The recipe is a reviewed project artifact, not an untrusted public upload surface.

Final maintained reruns after the Malice repair:

- `node --test tests/box_art_contract_test.mjs`: **3/3 pass**, `maintained-box-contract-final.log`.
- `QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_shelf_test.js`: **13/13 pass**, `maintained-shelf-final.log`.
- Scoped `git diff --check`: pass.

Authorized native gate attempted exactly:

```sh
CARGO_TARGET_DIR=/Users/bri/build/quaked-distribution cargo test --locked --manifest-path src-tauri/Cargo.toml --test library_contract
```

**Exit 101 before test execution.** Tauri's ordinary `tauri_build::build()` failed because resource path `../dist/desktop-assets` does not exist. Full output is retained in `native-library-contract.log`. No native assertions passed or failed: the test binary was not reached. No bypass, configuration weakening, fake resource directory or cleanup was attempted. Parent owns preparing the existing desktop distribution prerequisite and then repeating this exact native gate. Available disk was checked at approximately 14 GiB before/after this short compilation attempt; no insufficient-space error occurred.

Final reviewed hashes:

| Path | SHA-256 |
|---|---|
| `src/newer/ui/game_shelf.js` | `5041dcad95ad8f20904c45ae0041293cc8ac7ae1264a531f7ebf1f0371226b49` |
| `src-tauri/src/library.rs` | `557df13566ad3b9ccf6cd5b9ff44d02496057171637b1fbdc151d798e0089d37` |
| `tests/box_art_contract_test.mjs` | `db166b89314c9f80f930305ae37b606e038689a00ec94b97adc29702e168cef6` |
| `tests/game_shelf_test.js` | `3a900a6820fd1e20ea2185795ccc6e42a1561776ef914a182810d82838fb975d` |
| `src-tauri/tests/library_contract.rs` | `e1a393c499fffe9e7aabeae75879480be5ee594690b285402c988cccac44731f` |
| `tools/box_art/standardize.mjs` | `4a749d1101fd32c7765396259548bcbe207ea43377218421a7e98b346ccafb0a` |
| `assets/boxes/SOURCES.md` | `977631a42ee90da936a8648d993f6f62c1ad6ada6b8b99d33451178b2a522989` |
| `assets/boxes/manifest.json` | `803ed0ce128f41626e1dca950d044f183639bcfc72f0b7abfe21dad88bf86506` |
| `assets/boxes/malice/spine.webp` | `05142187e5e0f02c85f409d901f1d0e7ec2b92a27b19b43d111f6abe8bfa38f6` |
| `assets/boxes/quoth/spine.webp` | `dad7d1615a370ee9b5ff62eef4f5d7eaa2e09759df9dee5bba247cbb14d15350` |
| `docs/evidence/box-art-standardization-2026-10-20/derivation.json` | `347e517a35284bbd2ac26c27958bed0a16f1b4385b9463c4f6f9e829c5453604` |
| `docs/evidence/box-art-standardization-2026-10-20/malice-correction-prompt.json` | `b2be328f4f39b8dadd6951e3da24ab55094877bf31ff48de81b3d72bda078c3b` |
| `docs/evidence/box-art-standardization-2026-10-20/spine-contact.png` | `714bd1d854a691eff19ddd70376285214d584916108a27aedb522372177d4bea` |
