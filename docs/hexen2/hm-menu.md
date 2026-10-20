# HM: unified vector menu candidate

Scope: owner-authorised HM, 20 October 2026, worktree `/Users/bri/worktrees/Quaked/hexen2-unified/hm`, base
`78037c41`. All changes remain uncommitted. No release, other-worktree writes or game-data redistribution.

Architecture: the native pages remain the sole input/layout owners. `menu_animation.js` extracts their existing
ScrollTitle state machine as a reusable page-owned clock, with static Quake and sliding Hexen configurations.
`menu_font_trace.js` traces installed 20x19 glyph ink, fits closed quadratic contours and rasterises those outlines
into the existing SDF/metrics contract. The atlas encodes and publishes precisely Quake's 16/256 range per em.
Bigfont rows use native pair advances, preserving cell-to-ink bearings. Title images supply dimensions only; shared
panel/text commands rebuild the sign slab, chains, horned skull and vertical HEXEN II. The selector is a glyph variant
of the shared selector command. Small text, boxes and sliders remain native. Portrait/help artwork remains artwork.

Independent planning review: `/root/hm_review` checked architecture, reference source and installed title words.
It identified the old SDF radius mismatch (1.1875 encoded, 2.5 published), the ink-origin versus cell-origin contract,
contour counter/saddle handling, native title dimensions and generator parity. Implementation review remains due.

Coordination outage: Bluey `agent_whoami` returned `storage_error`, mutation outcome unknown, correlation
`05c587c0a80541f9962908517d05018a`; read attempt `agent_inbox` also failed, correlation
`55c0f6e55c0f4b9caa1117ee3ecb8e4d`. Reviewer identity failed with correlation
`e15b0cccd0c248288691f795787d8b5f`. No board assignment/update or durable worker execution is claimed.
Responsible implementation owner: this HM session; integration/acceptance owner: project orchestrator and owner.
Reconcile this record with the existing HM card when access returns. No independent feature follow-up campaign
has been commissioned; the remaining work belongs to this package.

Verification in progress: `dist/verification/hm/red-font-animation.txt` records 0/2, then
`green-font-animation.txt` records 10/10 including the existing native menu suite. Font/animation RED assertions
were run before implementation. Shared command regression, browser captures and broad maintained suites remain due.

Known build input: `quake-menu-final.html` is absent in this slim checkout. The renderer generator cannot run here
without its donor input. Keep generator/source changes equivalent and check the generated module digest; the
orchestrator must run the full extraction/distribution contracts with authoring inputs at integration.

## Final candidate and invariants

The default atlas is 1024×2048, one byte per texel, built only from installed data at runtime. There are 27 traced
letter glyphs, a blank space and three authored ornament glyphs. Letter contours retain one connected foreground
and the native stable counters: A/D/O/P/Q/R one, B two, the others zero. The saddle convention leaves K/N's diagonal
background passages open. RDP has a 0.75-source-pixel bound, with an area/collapse guard for tiny counters; quadratic
corner fitting joins the remaining edges tangentially. A synthetic diagonal regression initially retained pixel
steps at 0.55; 0.75 passes while all 27 raster topology checks still pass. No bitmap conchars atlas remains.

Bigfont em is 19 and encoded/published range is 19×16/256 = 1.1875; ornaments use em 20 and range 1.25. Plane/ink
metrics are normalised to em; atlas rectangles are texels. `MenuSkin_BigfontAdvance` shares native pair spacing and
C/P +3 from uHexen2 `engine/hexen2/menu.c:465-505`. The source-ink mask excludes indices 0 and 255. Independent review
caught the missing blank space (which would have rendered A in VIDEO MODES); a retained regression now covers it.
Title words were verified from the owner's installed art: title0 MAIN, title1 SINGLE, title2 CLASS, title3 OPTIONS,
title4 MULTIPLAYER, title5 DIFFICULTY, title6 CUSTOMIZE, title7 VIDEO MODES, title8 RANKINGS, plus LOAD and SAVE.

The renderer's only behavioural extension is allowing `selector` with `variant: 'glyph'` through its existing glyph
path. Quake's normalised snapshot hashes remain 2157577950/3551365704; additional complete unrounded JSON command
hashes, measured against base `78037c41`, are 1987595902/840811737 (main/options respectively). SHADOW and Quake's atlas,
shaders, layout arithmetic and composite order are retained. Hexen's selector now receives the same SHADOW as its
letters and panels. The native eight-frame selector phase drives a slight glyph turn-width variation.

Independent implementation review `/root/hm_review` reran the focused public suites: 8/8. It independently checked
27-glyph topology, shared rendering/shadow, source/template anchors and the 1×/8× comparison. The reviewer did not
approve browser material, positioning, shadow or owner acceptance. Its generator JSDoc parity finding was corrected;
the newly added generated README is evaluated directly from the generator's README template. A source check verifies
all public method JSDoc templates, the source delta and SHA. Full donor replay still needs the absent authoring input.

## Commands and results

From this worktree (dependencies were present; no npm install was run):

```sh
export QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js
node tools/run_tests.mjs tests/hexen2_*_test.js tests/menu*_test.js tests/newer_*_test.js tests/visual_options_test.js tests/options_order_test.js tests/hooks_test.js
node tools/distribution/engine-tests.mjs
node tools/run_tests.mjs tests/hexen2_menu_vector_test.js tests/hexen2_menu_skin_test.js
node tools/distribution/hexen2-menu-font.mjs
```

- Broad first run: 301 reported checks passed, process exit 1 because `hexen2_catalogue_test.js` could not bind its
  HTTP fixture before registering tests. Final run: **302 reported checks passed, exit 1 for that same fixture**.
  Its four catalogue tests did not run. Raw final log: `dist/verification/hm/package-final.txt`.
- Maintained engine list, first and final: **211/212, exit 1**. `serve_py_test.js` fails "the server started" because
  Python's localhost bind is denied. Final log/receipt: `engine-final.txt`, `engine-final-raw.txt` and
  `engine-final-receipt.json` under `dist/verification/hm/`. No maintained check was weakened or skipped.
- Focused final and independent rerun: **8/8, exit 0** (`focused-final.txt`). This includes the full unrounded Quake
  command snapshots, all 27 glyphs and counters, native pair advances, title clocks for both configs, every existing
  Hexen page's shared commands/native small text and the synthetic detached-ink/hole/diagonal case.
- Initial font/animation RED: **0/2**; first GREEN including existing native menu suite: **10/10**.
- Updated shared-path suite against the base UI modules: **3/5**, with expected new atlas/image-path failures and the
  Quake snapshots passing. Base exact hashes are retained in `base-exact-snapshots.txt`.
- Blank-space RED: **1/2** (`red-space.txt`), then GREEN. Diagonal smoothing RED with the previous 0.55 tolerance:
  **2/3** (`red-diagonal-smoothing.txt`), then GREEN.
- Base environment failure checks, using base UI modules through a loader without changing the checkout:

```sh
NODE_OPTIONS='--import ./dist/verification/hm/base-loader.mjs' node tools/run_tests.mjs tests/serve_py_test.js
NODE_OPTIONS='--import ./dist/verification/hm/base-loader.mjs' node tools/run_tests.mjs tests/hexen2_catalogue_test.js
```

  `base-serve-py.txt`: 0/1, same failure. `base-hexen2-catalogue.txt`: fixture crashes at localhost listen EPERM,
  0/0 registered, exit 1. `tools/serve.py`, both fixture tests and the catalogue implementation are unchanged from
  `78037c41`; this is an environment failure, not a claimed clean full-base gate.
- `node --check` passed for the adapter, generated renderer, trial and comparison tool; Python AST parsing,
  source/template/SHA checks and `git diff --check` passed. `source-checks.txt` retains the detailed limits.
- `python3 tools/extract_menu_webgl.py` could not run: donor `quake-menu-final.html` is absent. The generated module
  has only the mirrored selector branch and API comment change; no full regeneration is claimed.

## Visual evidence and remaining acceptance

`dist/verification/hm/font-comparison.png` (about 92 KB) shows every installed ink silhouette beside its fitted
vector silhouette at 1× and 8×. Both implementation and independent review inspected it: source forms/serifs and
counters remain recognisable, with smooth diagonals. `font-report.json` records per-glyph outline/counter counts,
vertices, advances and range/em. This is CPU silhouette evidence, not a browser screenshot or shader qualification.

**Browser screenshots captured: none.** The requested command was attempted:

```sh
HEXEN2_TRIAL_ONLY=menus node tools/distribution/hexen2-trial.mjs '/Users/bri/quaked' dist/verification/hm/initial-browser
python3 tools/serve.py 8264 --game-root /Users/bri/quaked
```

The first exits 13 at an unsettled top-level await in its port listener (`browser-first.log`); direct Python startup
confirms `PermissionError: [Errno 1] Operation not permitted` on bind. The environment does not permit localhost
listeners, and approval is unavailable. No alternative permission path was used.

The existing trial now accepts a viewport and an optional exhaustive menu pass, including class/difficulty,
multiplayer/setup, load/save, video, help, credits and keys, plus Quake's main menu. Save is opened after starting a
local game, without writing a save. On an authorised host that can bind localhost, run:

```sh
HEXEN2_TRIAL_ONLY=menus,quake-menu HEXEN2_TRIAL_MENU_ALL=1 HEXEN2_TRIAL_VIEWPORT=1280x800 node tools/distribution/hexen2-trial.mjs '/Users/bri/quaked' dist/verification/hm/1280x800
HEXEN2_TRIAL_ONLY=menus,quake-menu HEXEN2_TRIAL_MENU_ALL=1 HEXEN2_TRIAL_VIEWPORT=800x600 node tools/distribution/hexen2-trial.mjs '/Users/bri/quaked' dist/verification/hm/800x600
```

These new optional capture branches were syntax-checked, not executed. Check stone lettering weight/brightness,
sign and column geometry throughout opening/retraction, skull/chains, selector phase, SHADOW over the demo, native
small-text legibility (particularly rows below signs), and Quake comparison. Owner acceptance remains pending.
No rendering changes beyond those justified by CPU/source evidence were guessed to compensate for the missing GPU run.

Integration owner must also run full donor extraction/check, the staged app build and the distribution suites through
the normal integration hook. No texture or skin-identity suite is affected; `tests/distribution_contract_test.mjs`,
`tests/authoring_images_contract_test.mjs` and the normal resource inventory/embedded asset gates remain integration
checks. This worktree did not run `npm run test:distribution`, precommit, app builds or texture suites.

## Files and handoff

Modified:

- `src/engine/client/menu_hexen2.js`
- `src/newer/ui/menu_skins.js`
- `src/newer/ui/menu_webgl.js`
- `src/newer/ui/menu_webgl_source.js`
- `tests/hexen2_menu_skin_test.js`
- `tools/extract_menu_webgl.py`
- `tools/distribution/hexen2-trial.mjs`
- `docs/newer/menu-webgl/SOURCE.json`

Added:

- `src/engine/client/menu_animation.js`
- `src/newer/ui/menu_font_trace.js`
- `tests/hexen2_menu_vector_test.js`
- `tools/distribution/hexen2-menu-font.mjs`
- `docs/newer/menu-webgl/README.md`
- `docs/hexen2/hm-menu.md`

All evidence under `dist/verification/hm/` is ignored and must not be committed. No git add/commit/push, game-data
copy into source, other-worktree write, release or owner acceptance occurred. Final Bluey checkpoint read also failed
with storage_error correlation `c81fc3751473493588d0795ed6480edc` (`bluey-checkpoint.txt`). The responsible next owner
is the project orchestrator: reconcile the existing HM card, run the blocked listener/GPU and donor gates, review the
uncommitted diff, integrate under its own authority and seek explicit owner acceptance. This is an implemented local
candidate with successful focused tests and retained environment failures; it is **not a qualified delivery**.

Final independent narrow readback confirmed exact README/template match, selector branch and JSDoc parity, module
SHA receipt and full Quake baseline assertions. No remaining actionable code finding was reported in that bounded
review. Its last focused run remains 8/8; browser/donor/owner acceptance gates remain open.
