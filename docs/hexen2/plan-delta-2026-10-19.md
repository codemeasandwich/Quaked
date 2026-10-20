# Hexen II plan delta — 19 October 2026

> **Historical record — the parallel host is retired.** This document describes the `h2` branch's parallel Hexen II
> host (`hexen2_page.js`, its private 1019 protocol and its private wire/session modules) as it stood before package
> U10. That host and those modules were deleted when Hexen II moved onto the shared host; file, module and test names
> below are evidence of that earlier work, not current entry points. The current architecture is
> [unified-host.md](unified-host.md).

Status: **working delta; its first version received an independent PASS WITH NOTES review (section 8). This expanded
version, including the demo-detection and G1-smoke changes, is not yet independently reviewed.** This record adds facts the approved plan and its frozen input
inventory could not contain on 18 October 2026. It edits no approved plan text and does not rewrite the approved
inventory. It is not an implementation gate, owner trial, qualification or release receipt.

Approved identities (unchanged by this record):

| Record | SHA-256 |
| --- | --- |
| `docs/hexen2-support-plan.md` | `7040e450ed4d2f6993b91b8a19900b29b905d1a1251eeda352bed123280bb48a` |
| `docs/hexen2/plan-inputs.json` | `6a3c0487c94f46118154b91a43881b199169b9646d55228147663707f38c13c0` |
| `docs/hexen2/uqe-overlap-review.md` | `95dacc4014916c2fd9f2f1643bfdeb1fa89f82dac0e0eea5342abf78eeb5bb62` |

Because changing `plan-inputs.json` would invalidate the approved inventory hash, the new fixture identity is recorded
in [demo-fixture-2026-10-19.json](demo-fixture-2026-10-19.json). **This supersedes
`plan-inputs.json.genuineHexenDemoFixtureAvailable`, which still says `false`, and its `ownedFixtureIdentity` list,
which has no demo entry; those fields are frozen approved artifacts and must not be read as current demo state.** The
plan's line “The supplied Shareware directory is Heroes II data. A genuine demo fixture is currently absent”
([support plan §3](../hexen2-support-plan.md#L57)) is now factually superseded. Any change to the plan text or the
inventory itself requires a separate amendment and re-review.

## 1. Genuine demo fixture acquired and verified

The owner's extracted fixture is at `/Users/bri/quaked/Hexen 2 Shareware/hexen2-demo`. It was absent when the plan was
reviewed. I verified it against the pinned uhexen2 demo signature in
`engine/h2shared/quakefs.c` (commit `475c048b1c8b0806b8585f5cd2715f3ad60bf393`):

| Property | Verified value | Pinned expectation |
| --- | --- | --- |
| Source installer | `h2demo.exe`, 15,334,912 bytes, SHA-256 `b349824ba09ddf0e95ca8a0f1783640d745c560b67da20a9cc31d1e816e63ab8` | Hexen II v1.11 shareware demo, 1997-11-07 |
| `data1/pak0.pak` size | 27,750,257 bytes | 27,750,257 |
| `pak0.pak` directory entries | 797 | 797 |
| Directory CRC-16 (CCITT `0x1021`, init `0xffff`) | 22780 | 22780 |
| `pak0.pak` MD5 | `8e598d82bf53436ed7a0e133aa4b9f09` | `8e598d82bf53436ed7a0e133aa4b9f09` |
| `pak0.pak` SHA-256 | `0d4aa01a9909771dfa8e5be27db5d6628dc92f1406998c1a89c27d4748aaf151` | not pinned upstream; recorded here |
| `data1/progs.dat` | 952,888 bytes, version 6, layout CRC 38488, SHA-256 `5d1b658ef8828a4e9437164b19341e1a5ae111618126b9c45258998231395c8d` | version 6; demo layout was previously “not yet verified” |
| Licence | Activision `HEXEN-II-SUBLICENSE.txt` and signed `.doc` in `docs/` | required before relying on the fixture |

The uhexen2 CRC is a non-reflected CCITT CRC over the directory bytes, not the reflected CRC-16/ARC used by many PAK
readers. I computed 22780 independently from the acquired PAK; that and the upstream MD5 establish the fixture's
identity. The fixture is **not** in the repository and must not be committed, bundled, or redistributed. Its licence
also prohibits copying and network distribution; it is a local, owner-supplied test input.

The demo program's layout CRC is 38488, the same layout as the base game. The previous `layoutCrc: null` in
`HEXEN2_PROFILES['hexen2-demo']` and the comment “The demo layout is not yet verified, so it has none.” are now stale
and are corrected by the demo-detection increment.

Evidence: [fixture manifest](demo-fixture-2026-10-19.json), the fixture's own `README.md` and `checksums.sha256`.

## 2. Source and branch drift from the frozen baseline

The approved plan froze starting HEAD `616ee09ca4eae3121d5417b081623a144f498671`, reviewed Dev
`ab554cf61a2650c7ae84ed5dc96dcc45c4cb1010`, and required a documented delta before later changes enter the
implementation candidate ([support plan §2](../hexen2-support-plan.md#L27)).

Observed on 19 October 2026:

| Identity | Value |
| --- | --- |
| `h2` HEAD | `7f5c01b0baa13f9e95337d0e1c33c01df7d49517` |
| `h2` working tree | **Dirty.** Before this delta, three product/test files were modified: `src/engine/client/hexen2_native_ui.js`, `src/engine/client/hexen2_page.js`, `tests/hexen2_native_ui_test.js`. The delta itself adds this record and the fixture JSON and edits the G1 record; the demo-detection increment then adds further product/test changes. No single count is asserted here — see the worktree manifest receipt. |
| Commits from frozen baseline `616ee09` to `h2` | 222 |
| `h2` merge-base with `origin/Dev` | `fdeb5a25` (tag `v0.132.5`) |
| `h2` ahead of / behind `origin/Dev` | 103 ahead / 7 behind |
| `origin/Dev` HEAD observed | `713b47d3` |
| Frozen-baseline source hashes changed | 19 of 24 entries in `plan-inputs.json.sources` |

The 19 changed entries are: `main.js`, `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`,
`src-tauri/Cargo.lock`, `src-tauri/src/library.rs`, `src/platform/desktop.js`, `src/engine/common/pak.js`,
`src/engine/common/protocol.js`, `src/engine/common/game_catalogue.js`, `src/engine/common/game_selection.js`,
`src/engine/progs/pr_exec.js`, `src/engine/progs/pr_edict.js`, `src/engine/server/host_cmd.js`,
`tools/distribution/engine-tests.mjs`, `tools/distribution/browser-trial.mjs`, `tools/distribution/precommit.mjs`,
`.github/workflows/distribution.yml`, `assets/layout.json`.

The approved plan's baseline is therefore historical provenance, not the current candidate identity. A re-frozen
source tree and an amended coverage statement are required **before these changes enter the implementation candidate**
(plan §2), and therefore before G5. This delta records the drift; it does not claim the drift was reviewed or that the
7 Dev commits are integrated.

## 3. External reference audit

All six pinned references resolve and their content was checked on 19 October 2026. The clones were read-only and
kept outside the repository.

| Reference | Pin | Checked |
| --- | --- | --- |
| jsHexen2-progs | `621f4a9b0f0ff776610ecc4f459aa2b3c0bcdcdf` | Top level is `portals/` (138 files) plus README/licence, **not** base `gamecode/hc/h2`. The changelog has 49 rows and maps one-to-one to F01–F49; all 50 referenced fix commits exist. |
| uhexen2 | `475c048b1c8b0806b8585f5cd2715f3ad60bf393` | Base `gamecode/hc/h2` (107 files), `gamecode/hc/portals`, `utils/hcc`, protocol constants 18/19/20, demo signature and CRC in `quakefs.c`. |
| Raven source | `eac5fd50832ce2509226761b3b1a387c468e7a50` | `H2MP/hcode` (139 files), `H2W`, `EULA - Source Code.doc`, `gnu.txt`. |
| jlquake | `69498ea1ea09482b096f06ab7b433e715b7802a8` | Contains Hexen II and HexenWorld client parsing (`source/client/game/hexen2/parse.cpp`), so it is a real comparison reference. |
| uqe-quake | `05e1285887683cb235a1a29cb625d72df2a0bcf2` | 110 `.c`/`.h` files under `engine/code`. |
| uqe-hexen-ii | `333c0b30c410e9416f9f26d19eba3eb9e7e1fc52` | 114 `.c`/`.h`; 107 relative names common; 5 identical after CRLF normalisation (`glext.h`, `unzip.c`, `unzip.h`, `vid_gamma.c`, `wglext.h`). Protocol 20, CALL1/CALL2+ operand copies, unsigned data operands, signed branches, encoded array bounds, RAPO dispatch, eight hulls and the invalid-BSP sentinel are present at the cited lines. |

Two applicability caveats belong in the fix catalogue before G3:

1. **F17, F18 and F47** touch `newai.hc`, `shield.hc`, `flameorb.hc` or `lightwp.hc`, which are absent from the base
   `gamecode/hc/h2` tree. Their `requiredProfiles` entries must split shared code from expansion-only code rather than
   force a nonexistent base backport.
2. No `hcc` build, deterministic base/expansion `progs.dat`, independent native oracle, or source-derived golden set
   exists yet. Those remain required G0/G3 inputs.

## 4. G1 ledger corrections

The G1 acceptance record predates later `h2` commits and the current uncommitted work, and it contained several stale
statements. Corrected facts:

| Claim | Corrected state |
| --- | --- |
| Suite count | **142/142 Hexen assertions across 79 suites plus 14/14 native library contracts** on the current tree; the stored command/exit receipt is [hexen2-suites-2026-10-19.json](../evidence/hexen2-suites-2026-10-19.json). The earlier handover's “110/110 across 59” and the pre-increment 113/113 are stale. |
| Public native smoke | The owner executed the packaged shelf → class → `demo1` path; the browser product host covers all four base classes with real canvas/HUD pixels and dozens of mixer sources, and the packaged app autostarted all four classes plus the base/demo editions. Missing: packaged user-gesture audio and a physical audio device. |
| Working tree | **Dirty**, not “clean after the latest commit”. The pre-delta product changes are recorded in section 7; this delta and the demo increment add more. |
| Demo edition | The fixture is acquired and verified (section 1), and detection is implemented (section 5); the packaged catalogue reports `hexen2-demo:111` and the demo edition autostarts. |

The G1 record is updated alongside this delta. The demo fixture does not retroactively satisfy G1's Paladin slice; it
satisfies the input prerequisite that gates demo work in G2.

## 5. Demo detection implementation

The increment adds the catalogue/native wiring the earlier module-level check lacked:

- `Hexen2_PakDirectorySignature` computes the native non-reflected CCITT CRC over a PAK directory;
  `HEXEN2_DEMO_SIGNATURE` and `Hexen2_DemoSignatureProblems` hold the pinned 797/22780/27,750,257 identity.
- `GameCatalogue_ProbePack` records each valid pack's signature; the demo entry is playable only when that signature,
  `progs.dat`, `maps/demo1.bsp` and a version-6 **base-layout** program are present. A synthetic or short archive is
  refused with the named mismatch.
- `Hexen2_ReadProgHeaderSummary` checks the 60-byte program identity without pretending the sections are present.
- Native discovery accepts `hexen2-demo`, `Hexen 2 Demo`, `Hexen 2 Shareware` and the nested
  `hexen2-demo/data1` wrapper; Portal discovery is still absent.

Evidence: `hexen2_filesystem_test.js` (10/10, including the real PAK signature), `hexen2_catalogue_test.js` (3/3,
including the real fixture and short/missing-program negatives), native library contracts (14/14, including the owner
fixture when present), and the packaged demo trace
[hexen2-native-demo-2026-10-19.log](../evidence/hexen2-native-demo-2026-10-19.log) (`progs 952888`, class 1,
`hud ops=13`, `host result ok=true`).

## 6. Amended coverage for this increment

This is an incremental coverage statement, not the full amended inventory that plan §2 still requires before the
candidate.

| Plan area | Effect of this delta/increment |
| --- | --- |
| §3 discovery and edition detection | The genuine demo input is verified; catalogue/native detection covers the demo layout and refuses lookalikes. Base and Portal detection are unchanged. |
| §8 T01 | New positive/negative assertions for the demo archive and program; the 62-suite receipt records the full run. |
| §8 T06 (public controls/presentation) | Four-class browser product-host coverage with HUD pixels and audio sources; packaged base/demo/four-class autostart. Packaged user-gesture audio remains open. |
| §9 G0/G1 | Source drift is recorded (section 2), not re-frozen. G1 remains incomplete; demo gameplay is G2. |
| E01–E27 | No row changes status and no enhancement is claimed by this increment. The menu/animation/RPG playability increment is recorded separately in [playability-2026-10-19.md](playability-2026-10-19.md). |
| §10 documentation | The docs-index obligation remains open; no index was recreated. |

## 7. Receipts and recoverable worktree manifest

| Receipt | State |
| --- | --- |
| Suite run | [hexen2-suites-2026-10-19.json](../evidence/hexen2-suites-2026-10-19.json) — 79 suites, 141/141, exit statuses and timings. |
| Native library | `cargo test --locked --manifest-path src-tauri/Cargo.toml --test library_contract` — 14/14, with an isolated `CARGO_TARGET_DIR`. |
| Browser product host | [hexen2-product-host.json](../evidence/hexen2-product-host.json) plus `hexen2-product-{paladin,crusader,necromancer,assassin}.png` and `-menu.png`; four classes, HUD pixels, weapon/entity frames, menu panels, 50 audio sources. |
| Packaged autostart | [hexen2-native-classes-2026-10-19.json](../evidence/hexen2-native-classes-2026-10-19.json) and the four class traces `hexen2-native-{paladin,crusader,necromancer,assassin}-2026-10-19.log`; base trace [hexen2-native-autoplay-2026-10-19.log](../evidence/hexen2-native-autoplay-2026-10-19.log); demo trace [hexen2-native-demo-2026-10-19.log](../evidence/hexen2-native-demo-2026-10-19.log). AudioContext suspended in all scripted runs. |
| External reference audit | [hexen2-reference-audit-2026-10-19.json](../evidence/hexen2-reference-audit-2026-10-19.json) — pins, observed counts and commands. |
| RED controls | [red-controls-2026-10-19.md](red-controls-2026-10-19.md) C4–C5 retain the reversed-fix failures for sound origin and item spin; C6 is recorded as an invalid control. |
| Worktree | [hexen2-worktree-2026-10-19.json](../evidence/hexen2-worktree-2026-10-19.json) lists every changed/untracked file with SHA-256; [hexen2-worktree-2026-10-19.patch](../evidence/hexen2-worktree-2026-10-19.patch) holds the tracked diff and text untracked files. Screenshots and other binaries are identified by hash only. Build outputs and the temporary dependency link are not part of the manifest. |

## 8. Independent review and resolutions

An independent read-only review of the first delta returned **PASS WITH NOTES** on 19 October 2026. It confirmed the
fixture hashes/CRC/MD5, the source-drift counts, the 19 changed inventory paths and all six external pins. Its notes
were resolved as follows:

| Note | Resolution |
| --- | --- |
| “3 modified files” was self-refuting/stale | Replaced with a dirty-tree statement, the pre-delta product file list and a worktree manifest (section 7). |
| “written before the last seven commits” was unsupported | Removed; the record now says later commits without a false boundary. |
| Module-level demo check existed; only catalogue/native wiring was missing | Corrected in the G1 record and section 5. |
| 113/113 had no stored receipt | Replaced by the 142/142 JSON receipt with commands and exit statuses. |
| `plan-inputs.json` still says the demo is absent | Explicitly named as a frozen superseded field; the delta and fixture JSON are the current source. |
| Amended coverage was deferred to G5 | Corrected to “before these changes enter the implementation candidate (plan §2)”; section 6 gives the incremental coverage statement. |
| Missing reference audit and worktree receipts | Added in section 7. |
| “two contradictions” undercounted | Corrected to “several stale statements”. |

Still open from that review: the full re-frozen source/coverage inventory, the docs-index reconciliation
(`docs/index.md` is still missing), and the Portal discovery/audio/packaged receipts noted above. None of these is
claimed as satisfied.

## 9. Limits

- This delta now includes product/test changes for demo detection and G1 smoke; it is not documentation-only.
- No purchased data was copied into the repository.
- The external clones are research copies, not runtime dependencies; they were not built.
- The independent review checked the delta's evidence, not the product implementation; no owner acceptance or
  qualification is claimed.
- No owner deadline has been supplied and none is invented.
