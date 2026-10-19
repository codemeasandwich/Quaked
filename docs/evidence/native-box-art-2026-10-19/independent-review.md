# Independent shipped box-art verification — 19 October 2026

The final owner contract is shipped defaults from all fourteen usable local imports, with optional local overrides per face. This supersedes the earlier local-only artwork acceptance record. Final independent results: **12/12 shelf JavaScript tests**, **2/2 box-art packaging contracts**, **3/3 existing desktop catalogue JavaScript contracts**, and **29/29 checks across two fresh browser phases**, with zero page, console or HTTP errors. No remaining blocking finding was identified in the reviewed source.

## Preserved boundaries and review conclusion

The fourteen imported files are byte-identical to their recorded import manifest; the new packaging test compares every destination's size and SHA-256 to that record. GAME_BOXES uses the explicit expected game/face destinations. Added discovered-title defaults are limited to `mod_q30a1024`, `mod_quaked`, `mod_hexen_2`, and `mod_hexen_2_portal_of_praevus`; the test does not broadly admit arbitrary ids through a regex. Existing Quake art remains. Shareware now has its own front/back/spine; both mission packs have shipped spines; Quoth has back/spine and deliberately lacks a front. The misfiled Quaked front is never used for Quoth.

Native `BOXED_FOLDERS` admits only the three named existing display-only folders when no local image or native game file is available. It produces discovered metadata without invented pack tokens. The current desktop adapter retains strict startability, labels these absent-file entries with neutral kind `unavailable` / text `Game`, and supplies `No supported game files found`; it does not call Hexen II a Quake add-on or imply engine compatibility. The native scanner still canonicalizes and bounds local image paths; `main.rs` still grants/revokes exact files through the existing scope chain, never directories. No new engine integration or native permission widening is introduced.

Optional local artwork overlays only its supplied face. Missing faces retain shipped defaults. Decoder failure tries a bundled face once and then a printed placeholder. Printed faces retain the existing opaque CSS gradients. Native asset URLs pass through the existing packaged resolver. The actual desktop collector includes every current GAME_BOXES front/back/spine and the artifact inventory still excludes original game archives.

## Source identities

| File | SHA-256 |
| --- | --- |
| `src-tauri/src/main.rs` | `dfc4996696545d39a586b048f377043df791112eeb47425734f4536ca6cfc403` |
| `src-tauri/src/library.rs` | `6838b98c5c8fd4f978405c8cd2276ab3f18e4e39ed42830f9e49939464eca4ec` |
| `src/platform/desktop.js` | `75de063e794545350665cf915e98da17530fe65fd80b144566ae6d4f969a141d` |
| `src/newer/ui/game_shelf.js` | `85dfe2d8b067bef60cb80d7cade5cf3f92409744b58eff090e8dd859c58144b1` |
| `tests/game_shelf_test.js` | `4fbcc8042f6293f32ae354df7a62ef1053441ba8a7b0c24a5794ac04ad394792` |
| `tests/box_art_contract_test.mjs` | `e67e70dd7a6a1ca730140069f2ec941dcad4ff79141ba8c9075762e2046e07c5` |
| `docs/evidence/native-box-art-2026-10-19/bundled-import.json` | `1e7cd4bda5f22ac5ae0cdc8f494bbd2f478135805479f2a7d78efa1c0986f477` |

Only the two authorized test files were edited by this independent worker. No production source, Git index, commit or build mutation was made by this worker. The coordinator had staged an earlier shelf-test revision during work; the final file hashes above identify the current versions that must be retained/staged.

## Maintained tests

`tests/game_shelf_test.js` passes 12/12. Existing selection, folder, URL and local-player contracts remain. Expectations now explicitly require shipped mission-pack spines and all imported face mappings. Added checks cover local per-face overrides with untouched other defaults; canonical stem and extension ordering; top-level supported image discovery without input mutation; explicit discovered ids; empty-local-image defaults; disabled unsupported titles; and neutral display-only labels.

`tests/box_art_contract_test.mjs` passes 2/2. It verifies the exact fourteen import destinations, hashes, byte lengths and active default mappings; checks only the four approved discovered ids are used; rejects the misfiled Quoth front; and invokes actual `collectAssets({profile:'desktop'})` to prove every face enters the desktop inventory, with no original game archive import. This is read-only inventory verification, not a package build.

The existing `tests/native_library_contract_test.mjs` passes 3/3. Despite its filename, these are JavaScript parser/selection contracts, not Rust scope or native protocol tests.

## Actual browser phases

The harness imports the real desktop adapter, Newer hook installation, bounded-range catalogue, strict selector and shelf. Official Tauri IPC and converter endpoints are doubled. Native binary responses are ArrayBuffers; six small synthetic PAK directory fixtures must actually validate and become playable through production parser policy. Hexen II, Portal of Praevus and Quaked have no pack tokens and must remain absent, unvalidated and unplayable.

1. **Defaults:** native artwork map is empty and there are zero local-art conversions. Shareware's three PNG faces, Quake's existing faces, both mission spines, Quoth's back/spine, q30a1024's front and the shipped Hexen/Portal/Quaked faces load through actual source asset URLs and decode. Quoth's missing front and other genuinely missing faces print opaque placeholders. Hexen/Portal/Quaked Play controls stay disabled and their labels say `Game`, never `A Quake add-on`.
2. **Overrides/failure handling:** only Shareware's back receives one successful local override; its front and spine remain shipped. Two explicit corrupt-image probes test local failure without a bundled front and local failure followed by a deliberately broken bundled back. Both reach printed opaque placeholders. The other shipped defaults and all startability gates remain intact.

Both phases exercise real TURN OVER buttons and return, keyboard selection, and disabled Play. Screenshots include defaults and override Shareware front/back plus Quoth, q30a1024, Hexen II, Portal of Praevus and Quaked front/back. Manual inspection confirmed Shareware's shipped back with the mission spines beside it, and Hexen II's actual default front with neutral `Game — not playable yet` text and disabled Play. All used images decode; every printed placeholder has a computed CSS gradient.

## Retained reproducible evidence

- Harness: `/private/tmp/quaked-box-defaults-browser-20261019.mjs`
- Harness SHA-256: `8745cbfa35154be1c257d26a9f52c7e6bbc2e032e82159f3bcdc31e91b0fc6be`
- Final receipt: `/private/tmp/quaked-box-defaults-browser-20261019.json`
- Final browser log: `/private/tmp/quaked-box-defaults-browser-final-20261019.log`
- Receipt/log SHA-256: `6360be860caa1f5288e87f705131b6cf1a2cff502ec178a09b8cc274a8b252f6`
- Shelf-test log: `/private/tmp/quaked-box-defaults-public-final-20261019.log`
- Packaging/catalogue-test log: `/private/tmp/quaked-box-defaults-contract-final-20261019.log`
- Screenshot prefix: `/private/tmp/quaked-box-defaults-browser-20261019-`.
- Deliberate invalid local PNG: `/private/tmp/quaked-shelf-corrupt-art-20261019.png`, SHA-256 `8bf6db3c11dc04c434dc01f8ae767176cdf109c05861e0a4538a7fcc1ec0eb05`.

The browser replay requires only the current checkout/dependencies, local Chrome, `/Users/bri/quaked/Quake shareware/back.png` for the successful override, and the deliberate temporary PNG. Shipped defaults do not depend on owner-library image files. Preserve/copy current receipts first: the tested harness writes fixed output names. The exact corrupt fixture can be recreated without touching owner art:

```sh
printf '%s\n' 'independent invalid PNG decoder fixture' > /private/tmp/quaked-shelf-corrupt-art-20261019.png
cd /Users/bri/SOURCE/Quaked
QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_shelf_test.js
node --test tests/box_art_contract_test.mjs tests/native_library_contract_test.mjs
node /private/tmp/quaked-box-defaults-browser-20261019.mjs
```

The browser command may require managed-sandbox permission to bind loopback and start the isolated browser. It does not install dependencies, open an existing browser profile or inject an existing app. It starts its own loopback-only server/fresh browser profile, serves current checkout files plus two exact decoder/local-override paths, and closes browser/server in `finally`.

## Earlier failure provenance and present limits

The earlier local-only campaign's failure history remains documented in `/private/tmp/quaked-local-shelf-independent-review-20261019.md`: the wrong number-array IPC mock was corrected to binary ArrayBuffer; a concurrent intentional canonical-art rename triggered a retained ENOENT; corrupt local art initially lacked fallback; and manual inspection caught transparent placeholders caused by inline `backgroundImage='none'`. Those visually rejected receipts/screenshots remain retained. The final gradient oracle was strengthened; no automated pre-fix RED is falsely claimed from the run named `opaque-red`, which loaded the fix before executing.

The first shipped-default two-phase run passed 27 checks but may have straddled the coordinator's final neutral-label change; it remains preliminary at `/private/tmp/quaked-box-defaults-browser-first-20261019.log` and `/private/tmp/quaked-box-defaults-browser-pre-final-label-20261019.json`. Both phases were then freshly rerun with explicit neutral-label checks, yielding this final 29/29 receipt against the source identities above.

This worker did not execute the separately owned native Rust scanner suite or installed Tauri/WebKit transport trial. The coordinator reports native 15/15 evidence; it is not relabeled as this worker's execution. Actual native permission enforcement, bundled package generation, binary transport, game startup, qualified delivery and owner acceptance remain distinct. Synthetic PAK directory fixtures do not establish engine compatibility for Hexen II or other artwork-only titles. The coordinator owns final source staging, native build/trial qualification, evidence retention, landing and owner-facing completion.
