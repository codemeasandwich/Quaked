# Independent artwork consolidation review — 19 October 2026

The current change is limited to original-byte artwork consolidation, four new runtime PNG faces, retirement of the q30 screenshot collage from box roles, and an authoritative active inventory. The runtime JavaScript diff changes only GAME_BOXES constants: Machine JPG front becomes PNG front/back/spine; Quoth gains its genuine front; the q30 default entry is removed. Existing loader, override, failure handling, startability and input behavior are unchanged. No blocking source finding remains in this reviewed change.

## Current verification

- Maintained shelf public tests: **13/13**, `/private/tmp/quaked-box-consolidation-public-first-20261019.log`.
- Consolidation/packaging contracts: **3/3**, plus existing catalogue contracts **3/3** in `/private/tmp/quaked-box-consolidation-contract-first-20261019.log`.
- Focused current UI receipt: **6/6** mapping/default/override/error assertions, `/private/tmp/quaked-box-consolidation-focused-20261019.json`.
- The already-running adapted browser harness completed **29/29** reused checks with zero page, console or HTTP errors. No additional behavioral permutations or repeated UI rounds were added after the coordinator narrowed this task to the mapping change. The complete receipt remains `/private/tmp/quaked-box-consolidation-browser-20261019.json` and its log is `/private/tmp/quaked-box-consolidation-browser-final-20261019.log`.

The fresh actual desktop-adapter/defaults phase has an empty native artwork map and zero local-art conversions. It decodes current project image URLs, requires Quoth front and all three Machine PNG faces, and prints every q30 face. TURN OVER displays the new Machine back. Manual inspection confirmed the genuine Quoth front, Machine front/back and its spine beside Quoth, and q30's opaque printed front. A quick existing positive control overrides only Shareware's back through the doubled local endpoint while its front/spine remain shipped. The harness now reads a project PNG for that override; **no game-folder artwork is required or read by this final trial**.

## Identity, preservation and packaging contracts

`assets/boxes/manifest.json` is current authority: exactly **29 runtime game/face/path roles**, 29 unique paths and 29 unique original byte hashes. The maintained test has an explicit expected mapping, and only the three approved discovered ids remain: `mod_quaked`, `mod_hexen_2`, and `mod_hexen_2_portal_of_praevus`. No broad regex permits unrelated default entries. New image identities are pinned independently of the manifest:

| Role | SHA-256 |
| --- | --- |
| Quoth front | `e2a33f0eca75fce9505df1534807e74c554579ac477fcfc9ca0b8ccc642d76c1` |
| Machine front | `dd5dc40420b93912a79d03898d903dae0dcb5098d86b4762fc12b8483082b93e` |
| Machine back | `fdea1c72d809c5ebd6407553e6f005d6cec8af4ee56484e8daeccc4ce0ad091f` |
| Machine spine | `b93a28e9ff25427b79267d5f4c005b63dd6513e46f4ed24aae9e3b6248ee090d` |

The new Quoth front is distinct from the previously misfiled Quaked image. The q30 blob `c2689921...` is preserved only at `assets/authoring/box_art/q30a1024/screenshots.png`. The old Machine JPG `55e0245b...` is preserved at `assets/authoring/box_art/mg1/front-previous.jpg`. The historical fourteen-import receipt remains historical; tests no longer require inactive artwork from it to be live.

Move-plan destination verification covers **41 planned local paths / 29 unique blobs / 12 redundant local copies** without reading those external source paths. The **13 source-only archive blobs** retain their recorded original hashes and sizes. The union is exactly **42 unique canonical project image paths**, with one project path per blob. Recursive image inventory asserts no old duplicate runtime images remain. The held Quake launch poster is explicitly outside the move list. These are preservation/readiness checks, not proof that external source unlinking has happened.

The actual desktop collector includes every active role, excludes `assets/authoring/box_art/`, excludes inactive Machine JPG/q30 PNG paths, and continues to reject original game archive imports. Maintained tests read project files and receipts only, so CI does not depend on `/Users/bri/quaked`.

## Frozen source and evidence identities

| Input | SHA-256 |
| --- | --- |
| `src/newer/ui/game_shelf.js` | `a09369396721c85fe0646839469799d363ac117cd1696fe836115603a77e5804` |
| `assets/boxes/manifest.json` | `20d4297d8deb33a44f91b404a9d697b5ccb3af0d755cfb5e2eb6c53d42b621ff` |
| `docs/evidence/box-art-consolidation-2026-10-19/move-plan.json` | `999c66cf2c5945c15a6b1e7c0c97cebadb9f20fb249789a91347f2f63444600f` |
| `tests/game_shelf_test.js` | `b30f493df48e17618b6b4e65196b86811d0f029be79c5058ca32c995a922d12c` |
| `tests/box_art_contract_test.mjs` | `60ee8cafdcdc6673341802b35149a89b6e2cbcbc60fca0c8eff9f4e8d4717b5a` |
| Complete browser receipt | `3d4044639999ad97bb2d0770568199c859006237d18b17839ffb90e6e10483ef` |
| Browser harness | `4a22c18c1a805a871e07de1b8860176133a134654dbebc1b6cd34bbf340e384c` |

The complete browser receipt also binds unchanged main.rs, native library and desktop adapter identities. Source/test files are frozen. Only the two authorized test files were edited by this worker; no production, asset, Git index, commit or cleanup mutation was made.

## Reproduction and limits

Harness: `/private/tmp/quaked-box-consolidation-browser-20261019.mjs`. It imports the actual desktop adapter/catalogue/shelf, doubles official Tauri IPC/converter endpoints with binary ArrayBuffer replies, starts a fresh headless Chrome profile and a loopback-only exact-file server, and closes both in `finally`. Synthetic PAK directories are not actual game-startup evidence. The deliberate corrupt temporary PNG from the prior harness is `/private/tmp/quaked-shelf-corrupt-art-20261019.png`; it contains the exact text `independent invalid PNG decoder fixture` and a newline. Preserve current evidence before replay because output names are fixed.

```sh
cd /Users/bri/SOURCE/Quaked
QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_shelf_test.js
node --test tests/box_art_contract_test.mjs tests/native_library_contract_test.mjs
node /private/tmp/quaked-box-consolidation-browser-20261019.mjs
```

Screenshots use `/private/tmp/quaked-box-consolidation-browser-20261019-`, notably `mg1-front.png`, `mg1-back.png`, `quoth-front.png`, `quoth-back.png`, and `mod_q30a1024-front.png`. The adapted harness retained previous inexpensive controls; the current focused receipt distinguishes the assertions relevant to this mapping-only change. Earlier wrong-IPC-mock and transparent-placeholder failures remain described in the preceding retained review records and are not relabeled as current regressions.

Native asset transport, a qualified packaged build, commit/push, last-moment source hash checks and external game-folder cleanup remain coordinator-owned. The move plan's cleanup fence requires pushed, verified destination preservation before external unlinking and preserves changed/unplanned files and all directories. This worker has not performed or independently witnessed that cleanup, does not claim owner acceptance, and does not infer game compatibility from artwork. No image generation, cropping, resizing or encoded-pixel transformation was performed in this consolidation verification.
