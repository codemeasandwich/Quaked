# Source layout: where each module lives

Cards [44b] to [44f]. `src/` is being sorted from one flat folder into the folders the
[architecture baseline](architecture-baseline-2026-10-10.md) proposes, one increment at a time. This page says what has
moved, how a move is made, and what stays behind for code not yet updated.

The increments only move modules; the debts the baseline lists (cycles, the engine importing Newer Game, the TypeScript
server's copies and the rest) are closed in [44g], after the moves. See the baseline's "Change of plan".

## The folders

| Folder | What it holds | Increment | Moved |
|---|---|---|---|
| `src/engine/common` | The original engine's shared core: commands, cvars, files and paks, memory, maths, console, protocol | [44b] | yes |
| `src/engine/progs` | The QuakeC virtual machine and its built-ins | [44b] | yes |
| `src/engine/server` | Host, server, world, physics, player movement | [44b] | yes |
| `src/newer/gameplay` | Newer Game's server-side rules and the records they save | [44b] | yes |
| `src/engine/net`, `src/engine/client`, `src/engine/sound`, `src/platform` | Networking, the client, sound, browser input, touch and WebXR | [44c] | yes |
| `src/engine/render`, `src/newer/render` (models and animation) | The GL renderer port; poses, skins, held weapons, bodies, level windows | [44d] | yes |
| `src/newer/render` (the rest), `src/newer/assets` (prepared data) | Effects, materials, post-processing, portals, vision; bakes and their formats | [44e] | yes |
| `src/newer/ui`, `src/newer/sound`, `src/newer/assets` (preparation) | Menu, loading, HUD, Bestiary; ambient music; asset preparation | [44f] | yes |

Every module's folder is decided by `tools/architecture_classify.mjs` (by its name, so a module already moved is placed
the same). Each moved module starts with a `@module` JSDoc block: what it is (written by hand), and, taken from its code,
its exported classes (types), its state (mutable exports, module-level variables and collections, browser storage) and
how it fails (`Sys_Error`, `throw`, `Host_Error`, `PR_RunError`, caught errors), with notes checked against the code.

## How a move is made

In a clean worktree (not the owner's checkout, whose ignored local files the tool must not touch):

```sh
node tools/move_modules.mjs 44c --dry     # what would move, and how many paths in which files would be rewritten
node tools/move_modules.mjs 44c           # move the files and rewrite the paths
git commit …                              # the moves, recorded by git as renames
node tools/move_modules.mjs --adapters    # an adapter at each old path the last commit moved
git commit …
```

`tools/move_modules.mjs` moves every tracked module the classifier gives that increment, with `git mv`, and:

* rewrites every literal path that resolves to a moved module, in every tracked text file: imports, re-exports, dynamic
  imports (with or without a query string), `new URL( …, import.meta.url )`, import map entries (`/src/…`), source reads,
  and `src/…` paths in tools, Python and the JSON records keyed by them;
* recomputes a moved module's own relative paths from its new folder, and a page's against its `<base href>`;
* rewrites a literal only when it resolves to something that exists, so other strings are left alone (a folder URL is
  rewritten when written without a trailing slash);
* refuses, before writing anything: uncommitted changes to a file it would touch; an untracked or ignored file that names
  a moved module (the owner's local files, below); a destination that exists. An untracked module is never moved.

The adapters:

```js
// Moved to src/engine/common/cmd.js (card [44b]); kept for paths built at run time.
export * from './engine/common/cmd.js';
```

An adapter re-exports the live bindings of the one module instance, so nothing loads twice. It is there for paths built
at run time (`import( '../src/' + name + '.js' )` in a few trials), which no tool can rewrite. The graph tool fails if any
literal import, URL or read in a tracked file names an adapter, so no new code comes to depend on one (an untracked local
file that does is only reported); adapters are deleted in [44g].

What the tool cannot do, and is checked by hand at each move:

* Prose that mentions a path (a provenance note, the docs). [44b] updated `newer/effects/shotgun/provenance.json` by
  hand; the docs that cite `src/` paths are one pass in [44g].
* Source read through a path built at run time: `tests/unseen_gun_test.js` ( `'../src/' + f` ) and
  `tests/normal_inputs_trial.js` (which hashes the sources it reads into its receipt). Once a module moves, they would read
  the adapter's one line; their paths are updated with the move ([44d]: `gl_rmain`; [44e]: `r_powervision`, and the
  trial's whole list).
* A module URL built from a name inside a moved module ( `new URL( '../' + … , import.meta.url )` ): it resolves one
  folder too deep once the module is deeper ([44e]: `r_fireball`; [44f]: `r_bestiary`, `r_folio`, `r_playerface`).
* Generated modules (`*_bakes.js` and others): their generator writes the module, so the generator writes the `@module`
  header too, or a re-bake would drop it ([44e]: the four bake tools).
* Records that hash a module's source (the rock manifest and `tests/rockfield_bakes_test.js`, the displacement manifest):
  the moved module's new header changes its hash, so those records are rebuilt with it ([44d], [44e]).
* The owner's local files, which git does not track: in the owner's checkout, `src/normal_bundle.js`,
  `src/normal_startup_packs.js`, `src/loading_trace.js` and `tests/normal_bundle_test.js` import modules that move
  (`./pak.js` moved in [44b]: they keep working through its adapter). They are the owner's to update; the tool refuses to
  run where they are.

## [44b]: what moved

50 modules: 14 into `engine/common`, 6 into `engine/progs`, 9 into `engine/server`, 21 into `newer/gameplay`.

* 1,673 literal paths were rewritten (main.js, the server, src, tests, tools and trial pages); the tool's first version
  reported 1,738, counting unchanged paths inside moved files.
* `tools/check_distribution_policy.py` now reads `src/` recursively (it read only `src/*.js`).
* Debt D7 is closed: the three trial pages with `<base href="../">` import `./src/…` and `./main.js`, which resolve
  against their base under any sub-path; the graph tool no longer exempts them.
* The module graph is unchanged: both architecture tools pass; 206 modules (and 50 adapters); the same cycles (83, 4, 2,
  2; the engine's own 41); the room server and the page load the same modules (198 and 202, as before with the face
  overlays).

## [44c]: what moved

26 modules: 13 into `engine/client`, 4 into `engine/net`, 5 into `engine/sound`, 4 into `platform`.

* 691 literal paths in 203 files were rewritten, among them the TypeScript server's import of `src/net.js`, two source
  reads (`fireball_test` reads `cl_main.js`, `studio_logo_test` reads `menu.js`) and two import map entries in
  `tests/rend_veil_gameplay_trial.html`.
* The moves and the adapters are two commits, written by the tool's two steps.
* Unchanged: both architecture tools pass; 206 modules (and 76 adapters); the same cycles; the room server and the page
  load 198 and 202 modules. In the browser the page starts Newer Game and Classic, and the menu answers the keyboard.

## [44d]: what moved

31 modules: 15 into `engine/render`, 16 into `newer/render` (the model and animation side: poses, skins and faces, held
weapons, the axe's halves, level windows, shells).

* 1,100 literal paths in 322 files were rewritten, among them source reads (`fireball_test`, `startup_collector_test`,
  `torchfire_test` read `gl_rmain.js`), query imports of `r_newerskins.js`, the import maps of the face and rend-veil
  trial pages, `tools/bake_displacement.mjs`'s source list and the displacement manifest's keys.
* By hand: `tests/unseen_gun_test.js` builds its source path at run time; it reads `engine/render/gl_rmain.js` now.
* The displacement manifest (`newer/displacement/manifest.json`) records the hashes of the sources that made the
  bakes. Its keys follow the moves; its values are left as recorded. For `gl_model.js` and `gl_rsurf.js` they were already
  out of date before the move (both files changed after the bakes), as `tests/helpers/prepared_corpus_audit.mjs` (run by
  hand, not in the suite) reports; a re-bake records new ones. (Renaming the keys changed the hash of the sources, which
  each level's `generatorFingerprint` records: restated in [44f], see [44e] below.)
* Unchanged: both architecture tools pass; 206 modules (and 107 adapters); the same cycles; the room server and the page
  load 198 and 202 modules. In the browser: Newer Game and Classic start, the menu answers, and the face trial draws
  grunts, ogres and knights with their faces and keeps all 23 through save and load.

## [44e]: what moved

71 modules: 46 into `newer/render`, 8 into `newer/render/rend_veil`, 17 into `newer/assets` (prepared data and its
formats).

* 703 literal paths in 290 files were rewritten, among them query imports, the quad vision trial's source fetch, the
  displacement trial's imports through a helper, the bake tools' paths, and the keys of the rock and displacement manifests
  and the local-only registry (`docs/distribution-local-only.json`).
* By hand: `r_fireball.js`'s module URL built from a name; `unseen_gun_test` and `normal_inputs_trial` source paths; the
  summoning provenance's `src/rend_veil` folder.
* The four bake tools write the new `@module` header into the modules they generate (checked: what each writes equals
  the module's header).
* Recorded source hashes: the rock manifest's four sources and the displacement manifest's two moved ones were re-hashed
  (code unchanged; `tests/rockfield_bakes_test.js` regenerates a real tile for every chart against the bakes and passes).
  Each level's `generatorFingerprint` is the hash of its manifest's sources, so it was restated with them ([44f]), in the
  manifests and in the registry modules (`rockfield_bakes.js`, `demon_bakes.js`); nothing at run time reads it. Each
  manifest says why in `sourcesNote`, which a real re-bake removes.
  * The manual audit (`node tests/helpers/prepared_corpus_audit.mjs`) walks all 159 maps again. It reports the two
    stale displacement sources below, and one gap of its own that predates the moves: it does not know the `quake:`
    namespace of the Vore's normal map entry.
* Headers: every moved module's facts were regenerated with multi-name declarations split (`gl_rmain.js` gained `gly`,
  `glwidth`, `glheight`) and the origin private file system counted as browser storage.
* Unchanged: both architecture tools pass; 206 modules (and 178 adapters); the same cycles; the room server and the page
  load 198 and 202 modules. In the browser: Newer Game and Classic start; a fired rocket loads the fireball's textures from
  their new relative URL; the face trial keeps 23 seeds through save and load; the GPU water trial passes (its toxic vapour
  check failed once while the full suite loaded the machine, and passed twice on a rerun).

## [44f]: what moved

28 modules: 19 into `newer/ui`, 3 into `newer/sound`, 6 into `newer/assets` (preparation). With them every module has
moved: `src/` itself now holds only the 206 adapters (198 at its root, 8 in `src/rend_veil/`).

* 255 literal paths in 139 files were rewritten, among them the two starts of the rock worker, query imports of
  `r_bestiary.js`, `r_playerface.js` and `normal_prepare.js`, and the generators' output paths.
* By hand: the module URLs built from names in `r_bestiary.js`, `r_folio.js` and `r_playerface.js` (three folders up
  now); `normal_inputs_trial`'s path list.
* The four generators (`build_startup_pak.py`, `build_startup_normal_prefetch.mjs`, `prepare_corpus.mjs`,
  `extract_menu_webgl.py`) write the `@module` header into the modules they generate. `extract_menu_webgl.py --check`
  passes; its receipt (`docs/newer/menu-webgl/SOURCE.json`) records the generated module's new hash.
* Unchanged: both architecture tools pass; 206 modules (and 206 adapters); the same cycles; the room server and the page
  load 198 and 202 modules. In the browser, with no failed request: the loading screen and split title demo, the WebGL
  menu with the studio logo, Newer Game and Classic, the Bestiary's images and pencil replay (ready), the player face
  (ready, 270 images) and the ambient music's file.

## [44g], step 1: the adapters removed

With every module moved, 199 of the 206 adapters are deleted, and `src/rend_veil/` with them.

* The four trials that built a module's path from its name (`credits_trial`, `bestiary_navigation_trial`,
  `oldone_gameplay_trial`, `loading_performance_trial`) name each module's real path now. In the browser each still loads
  its modules (197 to 201 of them) with no missing file, as does `normal_inputs_trial`.
* **Seven adapters stay**, each saying why in its comment: `src/pak.js`, `src/displacement_store.js`,
  `src/normal_bakes.js`, `src/normal_bake_format.js`, `src/normal_transport.js`, `src/r_normalprefetch.js` and
  `src/startup_normal_bakes.js`. The owner's untracked normal-bundle experiment (`src/normal_bundle.js`,
  `tests/normal_bundle_test.js`, `tests/normal_startup_packs_test.js`, `tools/build_normal_startup_packs.mjs`; recorded
  as an unused experiment in `docs/distribution-local-only.json`, with preservation hashes) imports those old paths, and
  its files are not this work's to edit. They go when the owner retires or updates the experiment. No tracked file
  imports them: the graph tool fails if one does.
* Dated receipts under `docs/evidence/` that recorded the hashes of `index.html`, some test pages or docs describe those
  files at their own commits; the prose rewrite changed some of those files after them (no tool checks the receipts
  against today's files).
* Prose that named the old flat paths was updated to the real ones: 67 documents, and comments in seven test pages, two
  tools and `index.html`. Left as written: the architecture baseline (a record of the flat layout), this page, and
  everything under `docs/evidence/`.
* Unchanged: both architecture tools pass; 206 modules (and 7 adapters); the same cycles.

## [44g], step 2: the Newer/Classic switch in its own module (debt D2)

`src/newer/mode.js` holds the switch: `R_NewerGame`, `R_IsNewer`, `R_NewerLightingActive`, the classic half of the split
title demo (`R_AnimSetClassicPass`, `R_ClassicPassActive`), the setters, and the feature switches (`r_newer_lighting`,
`_normals`, `_water`, `_enemies`, `_portals`, `_textures`, `_hud`, `_shadows`, `_crates`). It imports only the engine's
cvars and file system. `r_anim.js` keeps the animation (`R_AnimEnabled` now asks `R_IsNewer`) and `r_lerpmodels`.

* 174 files take those names from `mode.js` now (named imports split, namespace uses moved to a `mode` namespace), so
  only three modules import `r_anim.js`, all for animation.
* D2's check holds: every mode name is declared once, outside `r_anim.js`, in a module that does not reach it; no
  importer takes only mode names from `r_anim.js` (`modeHome`, `modeOnly`).
* The graph now counts 207 modules (`mode.js` is new) and 7 adapters; the room server and the page load 199 and 203
  modules (both reach `mode.js`). The cycles are unchanged.

## [44g], step 3: no engine work as modules load (debt D10)

* `gl_post.js`'s G-buffer patch on `THREE.Material.prototype.onBeforeCompile` is installed by
  `R_PostInstallGBufferPatch()`, which `R_Init` and every `R_PostBegin` call (idempotent). One test that composes a
  material without the renderer's start-up installs it the same way.
* `sv_main.js` gives seamless travel the engine's model functions in `SV_SpawnServer`, before a level exists (in `SV_Init`
  at first: seven suites that build a server without `SV_Init` showed that was too late for them).
* Neither statement remains at the top of its module; the remaining top-level statements fill fixed tables.
* In the browser the Newer and Classic frames are identical to before (mean differences 0.003 and 0), the face trial and
  the GPU water trial pass; the full suite is back to its baseline.

## [44g], step 4: Newer Game's own cycles broken (debt D1c)

* `gl_post` → `r_bestiary`: the renderer (`gl_rmain.js`, which already imports the Bestiary) hands the portrait light to
  post-processing each frame (`R_PostSetPortraitLight`) before the lights are chosen; `gl_post` no longer imports the
  interface.
* `gl_normals` ↔ `normal_prepare`: the pure maths moved to `src/newer/render/normal_math.js`; `normal_prepare` imports it,
  and `gl_normals` imports and re-exports it, so its public names are unchanged.
* `r_demosplit` ↔ `r_perf`: the profiler is given `R_DemoSplitEnd` in its host (`main.js`) instead of importing it.
* The cycles are now 83 and 4 (the engine's own, with the Newer modules it pulls in, and `cmd`/`common`/`cvar`/`pak`);
  `cycles.newerCycles` is empty. The graph counts 208 modules (with `mode.js` and `normal_math.js`) and 7 adapters; the
  page reaches 204 modules and the room server 202.
* `main.js` now imports `R_DemoSplitEnd`; the tests that evaluate `main.js` with stubbed imports (`startup_preload`,
  `weapon_preload`) stub it too.
* Tests that call these pieces directly (the Bestiary's light selection, the profiler's two hosts) hand over the same
  values the game does. Not exercised in the browser: a real first sighting's portrait light (a scripted sighting did
  not start on Dev either); the light's hand-over is covered by `bestiary_native_test`.

## Checks for each move

* Both architecture tools pass (no unscanned module, no unexpected unresolved import, no unassigned module) and the
  cycles do not grow.
* The full suite against the recorded baseline.
* The room server's modules import under Node (`server/test_imports.js` and every module `server/game_server.js`
  imports), since Deno is not installed here.
* The page starts Newer Game and Classic in the browser with no error and no failed `src/` load, and the D7 pages load.
