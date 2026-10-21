# Independent review — The Immortal Lock increment

Reviewer: supervised lane `art_contract_update`. Scope is the newly arrived owner-supplied wrap and the minimal three-face/default-folder increment after retained Dev commit `6e3e0237e9a1c3b520689b10ab824fc737e04b5c`. Earlier 53-face receipts remain unchanged and prove that earlier candidate only.

## Initial review finding: seam correction required

The proposed back/spine seam at x=792 bisects the bottom **PC / MAC** spine label. Direct inspection of actual runtime panels shows a partial white P at the back panel's lower-right edge and the missing left edge of P on the spine. This is a real source-panel boundary defect despite exact dimensions and passing automated tests. Move the back/spine cut left enough to retain the full label on the spine (suggest source x=780, yielding back width780, spine width137, front width742 at unchanged x917). Inspect the corrected source boundary and final runtime panels before qualification. No AI repair is needed. Main back prose, front title/emblem and the front/spine boundary appear intact.

The initial independent plan accepted x792 after viewing the whole wrap; full-panel review caught the small label crossing that boundary. This finding supersedes that initial boundary recommendation and is retained rather than treating automated checks as visual acceptance.

## Wiring, provenance and checks

The source is retained unchanged at `assets/authoring/box_art/import-2026-10-20/mod_the_immortal_lock/cover.png`, SHA-256 `0d3f49b0a84ec1990c81de336f864868b1d1f13ad7d0752dd789c888664c5467`, 1659×948. The schema has 49 source records and 56 runtime roles over19 titles. Verified all53 prior manifest rows remain byte-for-byte identical to the first retained candidate; no previous selected face was reauthored for this increment.

The production source changes only add three canonical `GAME_BOXES.mod_the_immortal_lock` face paths and append The Immortal Lock to the existing `BOXED_FOLDERS` display retention rule. No game catalogue support, pack mounting, playability, local override or error/fallback code changes. The maintained native regression now includes this empty retained folder; compilation is reserved for the subsequent ordinary exact-index gate.

Commands actually run on this initial incremental snapshot:

```sh
node --test tests/box_art_contract_test.mjs
QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_shelf_test.js
```

- `immortal-lock-maintained-contract.log`: **3/3 pass**, including all56 active mappings/hashes, WebP dimension metadata, archived original custody and real desktop collector rules.
- `immortal-lock-maintained-shelf.log`: **13/13 pass**, including existing independent overrides and unplayability boundaries.
- Test edits are restricted to the three assigned maintained files. No native build, commit, push or source move was performed by this lane during this incremental review.

Initial inspected snapshot (includes seam defect; final correction must receive its own entry):

| Path | SHA-256 |
|---|---|
| `src/newer/ui/game_shelf.js` | `d80e87632a25d3c543e1e5be5a0c64bc2e075112866f2e10d68d9b216d10d22a` |
| `src-tauri/src/library.rs` | `d81c38765e9a1f285ca2283d1ee6a8c4d59d8b5ae4310728994f9fc2472e5904` |
| `tests/box_art_contract_test.mjs` | `7370552c63f4dd1886af8d222935c80a80dead8c61ed826bd7d5c8e70c86008c` |
| `tests/game_shelf_test.js` | `fce7516cb6a5bccc5b610c12da120f0d7a5f40d2d051f1bf2b9b3c5146ba605e` |
| `src-tauri/tests/library_contract.rs` | `067ae1e9be0275fad4232216921eac4cc70483440932bc551ea47bb680ec798c` |
| `assets/boxes/manifest.json` | `aa399f8cccb2a61c87100797735fd57eda8854422df325703b3fd08fa026781a` |
| `assets/authoring/box_art/import-2026-10-20/mod_the_immortal_lock/cover.png` | `0d3f49b0a84ec1990c81de336f864868b1d1f13ad7d0752dd789c888664c5467` |
| `assets/boxes/mod_the_immortal_lock/front.webp` | `84f9716ea95847e842eabc770268234bdbf5013f81d88a972afdede074eb7462` |
| `assets/boxes/mod_the_immortal_lock/back.webp` | `2721a429eb66090b35c9d2af8c584fe512f04f849213c8712e0a204712d92185` |
| `assets/boxes/mod_the_immortal_lock/spine.webp` | `3e34798aaf3119fac46db7036904c37e63c818353b67cd443e528882b8c46cb4` |
| `docs/evidence/box-art-standardization-2026-10-20/derivation.json` | `dae4d5b645a20da42978c923bb93f0c9bfeed1d4f89e743861e673a17d47f7d2` |

Native gate, packaged56-face proof, pushed retention, exact-source cleanup and owner appearance acceptance remain separate obligations. The implementation owner retains the seam correction and subsequent verification.

## Correction resolved — final focused re-review

**PASS: no remaining source/panel finding in this increment.** The final back/spine seam is x770: back x0–769 (770 pixels), spine x770–916 (147 pixels), front x917–1658 (742 pixels), all full source height948. This gives the original PC / MAC lettering useful left margin within the spine. Direct full-panel inspection confirms the entire P and complete PC / MAC label are now visible on the spine; no label fragment remains on the back. The back headline, body, bullets, credits and requirements remain complete. The front is unchanged from the inspected source-faithful initial panel. All three final roles preserve source proportions and remain within their standard canvases.

The failed recipe and bad-panel evidence remain retained separately under `immortal-lock-seam-failure`; this resolution does not overwrite or erase the initial finding. No AI edit was used. Rechecked that all53 first-batch manifest rows remain exactly equal to retained commit `6e3e0237e9a1c3b520689b10ab824fc737e04b5c`.

Final focused reruns after seam repair:

- `node --test tests/box_art_contract_test.mjs`: **3/3 pass**, saved in `immortal-lock-maintained-contract-final.log`.
- `QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_shelf_test.js`: **13/13 pass**, saved in `immortal-lock-maintained-shelf-final.log`.

No compiled native check was run for this focused re-review. The expanded empty-folder case requires the ordinary subsequent exact-index native gate. Independent public browser/complete pixel-decoding evidence belongs to the separate public tester. Current crop/text review passes; native packaging, pushed retention, exact move, owner acceptance and any release remain separate.

Final focused snapshot:

| Path | SHA-256 |
|---|---|
| `src/newer/ui/game_shelf.js` | `d80e87632a25d3c543e1e5be5a0c64bc2e075112866f2e10d68d9b216d10d22a` |
| `src-tauri/src/library.rs` | `d81c38765e9a1f285ca2283d1ee6a8c4d59d8b5ae4310728994f9fc2472e5904` |
| `tests/box_art_contract_test.mjs` | `7370552c63f4dd1886af8d222935c80a80dead8c61ed826bd7d5c8e70c86008c` |
| `tests/game_shelf_test.js` | `fce7516cb6a5bccc5b610c12da120f0d7a5f40d2d051f1bf2b9b3c5146ba605e` |
| `src-tauri/tests/library_contract.rs` | `067ae1e9be0275fad4232216921eac4cc70483440932bc551ea47bb680ec798c` |
| `assets/boxes/manifest.json` | `6334be1382ee65a45f85dce5b9053823a90b7c7f3597c61cc345addbe28b5dcd` |
| `assets/boxes/mod_the_immortal_lock/front.webp` | `84f9716ea95847e842eabc770268234bdbf5013f81d88a972afdede074eb7462` |
| `assets/boxes/mod_the_immortal_lock/back.webp` | `a1f7ab02e864a8cd750827d38405e016c76967a324a5a97af1185b77fb5f0799` |
| `assets/boxes/mod_the_immortal_lock/spine.webp` | `fed5355b046691cfc7dbba2a6da83bfe4245c497f4ee63fd4310f7699aab0909` |
| `docs/evidence/box-art-standardization-2026-10-20/derivation.json` | `e0956d785d1859812fa3264addded3e30feae201688ed476ba9ee60e1eb33005` |
