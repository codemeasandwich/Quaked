# Architecture baseline: subsystems, cycles and the debt to close

Card [44a]. A plan and a measured baseline, not a reorganisation: no module has moved. It is the context the migrations
[44b] to [44f] work from, and the one [44g] closes against.

Every figure on this page is computed by two tools, run on a clean export (no ignored or uncommitted local files):

* `tools/architecture_graph.mjs`: the imports, cycles, consumers, entry points, module state and the consumers an import
  scan cannot follow.
* `tools/architecture_classify.mjs`: every module's proposed folder and owning increment, and the subsystem
  measurements.

Their output, with the full edge lists, is in
[evidence/architecture-baseline-2026-10-10.json](evidence/architecture-baseline-2026-10-10.json). The figures are from
`git archive 7633c31` with this page's tools; the export of the commit that adds this page gives the same figures. Three
earlier versions of this page were rejected by independent review, and a fourth accepted with corrections; what they
got wrong is listed at the end.

```sh
git archive <commit> | tar -x -C /tmp/q                             # a commit, not a dirty working tree
node tools/architecture_graph.mjs /tmp/q /tmp/graph.json             # exit 1: a src module not scanned, or an unexpected unresolved import
node tools/architecture_classify.mjs /tmp/graph.json /tmp/map.json   # exit 1: the graph run failed, or a module with no folder or increment
```

Both tools fail closed.

* The graph tool walks `src/` itself and fails if any module there was not scanned.
* It fails if a reference does not resolve, unless it is on its list of known ones, each named by the file that makes
  it and its target: the axe test's absence checks, the local inputs of D8, and D7's three pages. A wrong-depth
  `../../src/…` import in a new test fails it.
* An import's specifier must start `./`, `../` or `/`, or be named by the page's import map. A bare `src/x.js` is
  unresolved, as browsers and Node treat it.
* The classifier refuses a graph whose run failed.
* The classifier matches a module by its name, not its folder, so a module already moved is classified the same.
* A module whose only line is `export * from …` (an adapter left at an old path) is measured through, following chains
  of adapters, and not counted.

## What there is

* **205 modules in `src/`**: 197 flat files and `src/rend_veil/` (8).
* **652 files scanned**: `src/`, `server/`, `tests/`, `tools/`, and at the root `index.html`, `main.js`,
  `rockfield-v1.0.0.html` and `rockfield-v1.6.0.html`; `.js`, `.mjs`, `.ts`, `.html` and `.py`.
* **What the scanner reads**:
  * static imports, re-exports and literal dynamic `import()`;
  * dynamic imports built from a literal and a variable (`'../src/r_newerskins.js?case-' + n`), or passed through a
    helper (`import( dependency( '../src/…' ) )`);
  * `new URL( literal, import.meta.url )`, and source read through one (`readFileSync( new URL( '…js' ) )`, counted once);
  * source fetched by a page (`fetch( '../src/…' )`);
  * `<script src>`, resolved against a page's `<base href>`;
  * HTML import maps, whose keys are taken as written.

  Query strings are stripped, so `?case` imports count as the file they name. That gives **4,105 distinct module pairs
  from 4,279 statements**. 28 references do not resolve, all expected: the axe test's two deliberate absence checks, the
  three trial pages of D7 (19) and the local inputs of D8.
* **A catch-all.** Every `src/…js` path written as a string in a test, tool, server file or page, outside the text an
  import or URL pattern above has read, is listed (`hidden.srcLiterals`, 31). So a file that imports a module and also
  reads or hashes it by path is listed for the second use. Each of the 31 is in the consumer table below.
* **Entry points**, and the `src` modules each loads (directly, then transitively):

  | Entry | Direct | Transitive | Not loaded |
  |---|---:|---:|---|
  | `main.js` (the page, from `index.html`) | 25 | 201 | the three orphans (D9), and `rockfield_worker.js` (started by URL as a worker) |
  | `server/game_server.js` (a dedicated game room) | 15 | 197 | the same four, and `loading_screen`, `r_normalprefetch`, `startup_normal_bakes`, `startup_pack` |
  | `server/main.ts` (the TypeScript server) | 0 | 8 | all but `src/net.js` and its 7 imports; its own `host_server.ts`, `mod_server.ts`, `pak_server.ts` re-implement parts of the engine (D5) |
  | `server/lobby_server.js` | 0 | 0 | spawns `game_server.js` rooms (`room_process_manager.ts`) with `--config <root>/deno.json` |

  The room server loads 197 modules, nearly all of Newer Game's renderer and interface, through the cycle below.
* **Workers.** `src/rockfield_worker.js`, started by `r_rockfield.js` and `rockfield_prepare.js`. The tools use Node
  `worker_threads` (`bake_rockfield.mjs`, `prepare_folio.mjs`).
* **Outside consumers** of `src` modules: 2,770 distinct (module, file) pairs. 2,671 are tests, 45 tools, 29 server
  files and 25 `main.js` imports.

## Subsystems and owning increments

Each module is classified by its role. `tools/architecture_classify.mjs` holds the rules; every module's proposed path
and increment are in the evidence file.

| Proposed folder | Modules | Lines | Increment | What it is |
|---|---:|---:|---|---|
| `src/engine/common` | 14 | 5,234 | [44b] | The original engine's shared core: commands, cvars, files and paks, memory, maths, console, protocol |
| `src/engine/progs` | 6 | 4,867 | [44b] | The QuakeC virtual machine and its built-ins |
| `src/engine/server` | 9 | 9,872 | [44b] | Host, server, world, physics, player movement |
| `src/newer/gameplay` | 21 | 3,434 | [44b] | Newer Game's server-side rules (the `sv_*` additions) and the records they save |
| `src/engine/net` | 4 | 3,123 | [44c] | Networking: loopback and WebTransport |
| `src/engine/client` | 13 | 12,823 | [44c] | Client state and parsing, view, keys, status bar, screen, the native menu |
| `src/engine/sound` | 5 | 2,630 | [44c] | Sound mixing and loading, CD music |
| `src/platform` | 4 | 2,613 | [44c] | Browser input, touch, WebXR |
| `src/engine/render` | 15 | 16,730 | [44d] | The Three.js port of the GL renderer (`gl_*` but `gl_post`, `gl_portal`, `gl_normals`), video, particles, lit files |
| `src/newer/render` (models, animation) | 15 | | [44d] | Poses and skins, held weapons, cut and lying bodies, levels drawn in windows |
| `src/newer/render` (the rest), with `rend_veil/` (8) | 54 | 20,136 (all of `newer/render`) | [44e] | Effects, materials, post-processing (`gl_post`), portals (`gl_portal`), normal maps (`gl_normals`), vision modes, `v_shamblersteps` |
| `src/newer/assets` (prepared data) | 17 | 23,196 (all of `newer/assets`) | [44e] | Bakes, their formats and transports, the displacement store |
| `src/newer/assets` (preparation) | 6 | | [44f] | Normal and rock preparation, the rock worker, the prepared corpus, the startup packs |
| `src/newer/ui` | 19 | 3,415 | [44f] | The WebGL menu, loading screens (with `r_demoloading`), Newer status bar and face, the Bestiary and its book, the pencil replay |
| `src/newer/sound` | 3 | 379 | [44f] | Ambient music and the exit machine |

By increment: [44b] 50 modules, [44c] 26, [44d] 30, [44e] 71, [44f] 28.

## Cycles

There are four strongly connected groups of modules that import each other (static imports and re-exports): **83, 4, 2
and 2 modules**. The 83 is three things on top of each other:

* **The engine's own cycle: 41 modules** (engine modules alone). Client, server, QuakeC VM, renderer, sound, net and
  console call each other, as the original C files did through shared headers. With the platform modules `in_web`,
  `touch` and `webxr` it is **44**. This is what makes import order fragile:
  * Tests import `gl_rsurf.js` first (`tools/run_tests.mjs`).
  * Card [36]'s gamepad table (`in_web.js` reading `keys.js` constants) and card [38]'s trace object (`r_dof.js`
    reading `world.js`) had to be built lazily the same day, because both sit inside that cycle.
* **The native side imports Newer Game.**
  * The engine: **165 distinct module pairs (173 statements) from 28 engine modules**. The largest are `gl_rmain.js`
    (41 Newer modules), `cl_main.js` (11), `host.js` (9) and `view.js` (8).
  * The platform: **3 pairs**. `in_web.js` imports `r_anim.js` and `r_bestiary.js`; `touch.js` imports
    `r_bestiary.js`.
  * Together these pull 39 Newer modules into the 83.
* **Removing only the engine → Newer imports leaves 59**, not the engine's 44. The other 15 are Newer modules reached
  through the platform's three imports: `in_web`/`touch` → `r_bestiary` → `sv_seamless` → `r_levelview` → `gl_post` →
  the renderer. They are `gl_portal`, `gl_post`, `r_axecorpses`, `r_bestiary`, `r_dof`, `r_levelents`, `r_levelview`,
  `r_newerskins`, `r_quadvision`, `r_shelltrace`, `sv_faceevents`, `sv_rendveil`, `sv_seamless`, `sv_shotdelay`,
  `sv_shotrays`.
* **Removing every engine and platform → Newer import leaves 44, 5, 4, 2 and 2.**
  * The 44 is the native cycle above.
  * The 5 is Newer's own: `gl_post` → `r_bestiary` (`R_BestiaryPortraitLight`) → `sv_seamless` → `r_levelview` →
    `gl_post`, and through `r_axecorpses`.
* The small ones: `cmd`, `common`, `cvar`, `pak` (4); `gl_normals`, `normal_prepare` (2); `r_demosplit`, `r_perf` (2).

## Module state

Things a migration must keep in one instance, in its order of initialisation. They are counted by pattern, per module,
in the evidence's `state`:

* **226 mutable exported bindings** (`export let`) in 30 modules. Importers see their live values.
* **96 module-level Maps and Sets** in 49 modules.
* **Browser storage** in 6 modules: `bestiary_state`, `cvar`, `displacement_store` (the origin private file system),
  `host`, `host_cmd`, `menu`.
* **Code that runs at import.** A depth-tracking scan of top-level statements that are not declarations, imports or
  exports finds 58 in 27 modules.
  * The count is approximate: about four are a regular expression or comment the scan misreads (in `gl_rsurf`,
    `r_levelgraph`, `sv_seamless`).
  * Most fill fixed tables (`client`, `sbar`, `world`, `net`).
  * These matter for a move:
    * `gl_post.js` replaces `THREE.Material.prototype.onBeforeCompile` as it loads (D10).
    * `sv_main.js` calls `SV_SeamlessUseModels( … )` as it loads, registering engine functions into a Newer module (D10).
    * `menu_webgl.js` adds a window listener; `r_folio.js` fetches its index; `r_rockfield.js` makes its placeholder
      textures; `rockfield_worker.js` installs its message handler.

A module moved behind an adapter keeps all of this, because `export *` re-exports the live bindings of the one module
instance. A module imported under two different paths would split its state. A query-string import has the opposite
problem: through an adapter, every `?case` reaches the same inner module, so cases meant to be fresh share state (below).

## Consumers a move must update

The import scan sees most consumers. These it cannot follow by itself; each is listed, from the tool's output
(`hidden`, `counts`), with the increment that owns it:

| Consumer | Where | What breaks after a move | Owner |
|---|---|---|---|
| Query-string imports: 53 in 27 test files, 14 of them built from a variable (`'../src/r_newerskins.js?enforcer-public-' + n`) | `tests/*_test.js`; `counts.queryImports`, `hidden.computedSource` | Through an adapter every `?case` reaches the same inner module, so the cases share state: retarget to the new path in the moving increment | the module's |
| An HTML import map: 25 entries mapping `src` paths | `tests/rend_veil_gameplay_trial.html` | Maps to the old paths | [44e] (`rend_veil`) |
| Generators that write `src` modules | `bake_alias_meshes.mjs`, `bake_displacement.mjs` and `split_prepared_bundles.mjs` (both write `demon_bakes.js`), `bake_normals.mjs`, `bake_rockfield.mjs`, `build_startup_normal_prefetch.mjs`, `build_startup_pak.py`, `extract_menu_webgl.py` (`menu_webgl_source.js`), `prepare_corpus.mjs` | Re-running one would overwrite the adapter at the old path | [44e] / [44f] (the generated module's) |
| Readers of source text | Python: `import_nailgun.py` reads `anorm_dots.js`. JavaScript: the `bestiary_book`, `fireball`, `respawn_notice_screen`, `startup_collector`, `studio_logo`, `torchfire` and `unseen_gun` tests read module source by path; `normal_baker_inputs_test.js` reads `vid.js`'s text and matches it. `tests/helpers/prepared_corpus_audit.mjs` parses the registries in `rockfield_bakes.js`, `demon_bakes.js` and `normal_bakes.js` as text | They read the adapter's one line, and the audit's registry check fails | the module's |
| Source hashed as proof | `tools/bake_rockfield.mjs` hashes `rockfield.js`, `rockfield_presets.js`, `r_rocksurfaces.js` and `rockfield_bake_format.js` into the rock manifest, and `tests/rockfield_bakes_test.js` hashes them again to check it. `tools/bake_displacement.mjs` hashes `r_demonrelief.js`, `demon_bake_format.js`, `gl_model.js` and `gl_rsurf.js` into the displacement manifest. `tests/displacement_store_trial.js` imports `displacement_store`, `demon_bake_format` and `r_demonrelief` through a helper and fetches and hashes the same three | They hash the adapter, so the recorded proof is of the wrong file | [44e] |
| A tool importing by a joined path | `tools/prepare_folio.mjs` (`path.join( ROOT, 'src/bestiary_state.js' )`) | Loads the adapter (works), and breaks once the adapter is deleted | [44f] |
| Records keyed by `src` paths | `newer/displacement/manifest.json` (4 paths and hashes); `newer/rockfield/manifest.json` (4, checked by `tests/rockfield_bakes_test.js`); `newer/effects/shotgun/provenance.json` (1); `tools/summoning_reference/provenance.json` (`src/rend_veil`); `docs/distribution-local-only.json` (6, the registry `tools/check_distribution_policy.py` reads) | The recorded paths (and hashes) no longer match | the module's |
| Module-relative URLs built from computed names | `r_bestiary.js`, `r_fireball.js`, `r_folio.js`, `r_playerface.js` (`new URL( '../' + … , import.meta.url )`) | They resolve one folder too deep | [44e] / [44f] |
| Literal module-relative URLs | `r_quadparticles.js`, `s_ambientmusic.js`, `studio_logo.js`, the rock worker | The same | the module's |
| Source paths built from a name | `bestiary_navigation_trial.js`, `credits_trial.js`, `loading_performance_trial.js`, `normal_inputs_trial.js`, `oldone_gameplay_trial.js` (`import( '../src/' + n + '.js' )`), `quadvision_gpu_trial.html` (fetches source) | They load the adapter, or read its text | the module's |
| A flat source glob | `tools/check_distribution_policy.py` (`src/*.js`) | Goes blind to moved modules | [44b] (the first move) |
| Docs citing `src/` paths | 68 files under `docs/` (`hidden.docsCitingSrc`) | Stale links; not code | [44g] (one pass at the end) |
| Ignore rules keyed by `src` paths | `.gitignore`: `/src/loading_trace.js`, `/src/normal_bundle.js`, `/src/normal_startup_packs.js` (`hidden.gitignoreSrc`) | A local file moved into a folder is no longer ignored | [44e] |
| The server's room spawning | `server/room_process_manager.ts` (finds `game_server.js` and the root `deno.json` from its own folder) | Moving `server/` or the root config | [44b] |

## Technical debt, with evidence, owner and acceptance check

| # | Debt | Evidence | Severity | Owner and next action | Acceptance check |
|---|---|---|---|---|---|
| D1a | The engine's own import cycle (41 modules; 44 with the platform) | `cycles.engineAlone`, `cycles.engineAndPlatform` | High: evaluation order is fragile and new module-level tables fail at load | [44b] breaks the server ↔ client and progs ↔ server edges by moving shared state into leaf modules under `engine/common`; [44c] the client ↔ renderer and platform edges; [44d] the renderer ↔ client edges | No engine or platform cycle spans more than one proposed folder: `cycles.crossFolder` is empty (today one, of 44 modules across 8 folders). A cycle inside one folder, such as `cmd`/`common`/`cvar`/`pak` in `engine/common`, is allowed |
| D1b | The native side imports Newer Game: 165 engine pairs from 28 modules, 3 platform pairs | `engineToNewer`, `platformToNewer` | High: the dedicated room server loads Newer's renderer and interface; Classic depends on Newer modules loading | [44b] adds a neutral hooks module (`src/engine/hooks.js`: named hook points the engine calls and Newer registers into at startup) and removes the server's and progs' imports; [44c] the client's and the platform's; [44d] the renderer's (`gl_rmain` 41). The existing `R_DecalsSetup` / `R_WallBurnSetup` calls go the same direction (the engine imports the Newer module and hands it engine functions) and are removed with them | `engineToNewer` and `platformToNewer` are empty |
| D1c | Newer's own cycles: `gl_post` → `r_bestiary` → `sv_seamless` → `r_levelview` → `gl_post` (5 modules), `gl_normals`/`normal_prepare` and `r_demosplit`/`r_perf` | `cycles.newerCycles` | Medium | [44e]: `gl_post` takes the portrait light as a value instead of importing `r_bestiary`, and breaks the two pairs | `cycles.newerCycles` is empty: once the native side imports no Newer module, no cycle holds a Newer module |
| D2 | The Newer/Classic mode switch (`R_NewerGame`, the classic pass) lives in `r_anim.js`, an animation module, which 49 modules import, 36 of them for the mode alone | `counts.animImporters`, `counts.animModeOnly`, `modeOnly` | Medium | [44d] (`r_anim`'s increment): the mode moves to its own leaf module (`src/newer/mode.js`), with a re-export left in `r_anim.js` until callers move | Every mode name is declared (not re-exported) outside `r_anim.js`, in a module that imports nothing from it (`modeHome`: today all 11 are in `r_anim.js`); and `modeOnly` is empty. Not met by shortcuts: imports are matched by what they resolve to, through adapters, so moving files does not empty it (checked: a mode-only importer moved behind an adapter still counts); a namespace import takes everything; a forwarding module ( `export { R_NewerGame … } from './r_anim.js'` ) counts as a mode-only importer (checked); and if `r_anim.js` is renamed, the tool fails until its `ANIM` is updated (checked) |
| D3 | Very large modules: `normal_bakes.js` (generated data in source), `gl_post.js`, `gl_rsurf.js`, `menu.js`, `gl_model.js` (3,000 to 17,000 lines) | `lines` | Medium | Not split by a move. [44g] files one card per module after the moves; `normal_bakes.js` is [44e]'s to load as data | Generated tables loaded as data, not imported as source; the post pipeline split by stage with a test each |
| D4 | The root `deno.json` task `server` runs `game_server.js`, which is not at the root; the room server it means reads `../pak0.pak` from its working directory (run from `server/`). The same file's import map (`three` → `server/browser_shim.js`) is used by every room the lobby spawns, so it is not a convenience file | `deno.json`; `server/game_server.js` lines 4-5, 58; `room_process_manager.ts` | Low (a broken shortcut) | [44b]: change the task to run from `server/` and try it where Deno is installed (it is not on this machine) | `deno task server` at the root starts a room |
| D5 | The TypeScript server declares 53 functions that `src/` also declares (exported or not). 32 are engine logic: `SV_*` (6), `Host_ServerFrame` and `MSG_*` (3) in `host_server.ts`; `Mod_*` (16, the BSP loaders among them) in `mod_server.ts`; `COM_*` (6) in `pak_server.ts`. The other 21 are the server's own platform layer (`Sys_*`, `WT_*` and three helpers), as the C engine's `sys_*.c` and `net_*.c` are | `hidden.serverReimplements`, `hidden.serverEnginePrefixed` | Medium: fixes to one are missed in the other | [44b]: make `server/main.ts` import the engine's server, model and file functions (it reaches `src/net.js` already), delete the copies, give the server's own glue (`Host_Init_Server`, `SV_GetServerInfo` and three more) a name of its own, and start the TypeScript server where Deno is installed | `hidden.serverEnginePrefixed` is empty: no server `.ts` function has an engine prefix (`SV_`, `Host_`, `MSG_`, `Mod_`, `COM_`; 37 today), so a renamed copy still counts (checked); and `server/main.ts` reaches `sv_main.js`, `gl_model.js` and `pak.js` (`entries`) |
| D6 | Client-side BSP ray casts written separately: `chase.js` `TraceLine`, `r_shelltrace.js` `traceHull`, `r_wallburn.js` `R_WallBurnTrace`, `r_dof.js` `traceFraction` | source | Low | [44d]: one client trace helper in `engine/render`, then [44e] moves the three Newer callers onto it | One helper (point and swept), tested once |
| D7 | Three trial pages (`demo_resolution_trial.html`, `enemy_height_trial.html`, `wizard_texture_trial.html`) set `<base href="../">` and import `../src/…`. Served from an origin's root this works, because the browser clamps the path at the root. Served under a sub-path (`/quaked/`), they load from above it and fail | 19 of the 28 unresolved references in the evidence | Low | [44b]: write the imports as `./src/…`, which an inline module script resolves against the document's base (a bare `src/…` would be rejected by the browser), since those modules move first | The graph tool resolves them: 19 fewer unresolved references, and D7's entry removed from its known list. A bare `src/…` is reported unresolved, so it cannot pass |
| D8 | Suites that need inputs a clean checkout lacks. Files: the owned full-game `pak0.pak` (`QUAKED_OWNED_PAK` and `resources/`) and other owned paks (`resources/dopa`); the owner's local pages (`fieldlab-fx-3d-updated.html`, `arc-weapons-wall-canvas-shotgun.html`, `demon-vision.html`, `player-face-layers-v4.4.0.html`); ignored art (`newer/hud/playerface/blood.png`); donor zips (`rocketlauncher`, `thuderbolt`, `supershotgun`, `supernailgun`, `supernailgun2`); `~/Downloads/Quake/Id1/PAK3.pk3`. Settings: `QUAKED_THREE_MODULE`, `QUAKED_CANVAS_MODULE`, `QUAKED_SHARP_MODULE`, `QUAKED_PYTHON` (a Python with Pillow). Git history, which an export has none of. Separately, `rockfield-v1.0.0.html` and `rockfield-v1.6.0.html` are tracked at this commit but deleted (uncommitted) in the owner's working tree, so their suites cannot run there | `missing`; the suite logs | Low (not code defects) | The owner: whether the local inputs return and whether the rockfield pages' deletion is committed. Then [44g]: each suite skips with a clear message when its input is absent | Not relabelled as passing: a missing input reads as skipped, with the input named |
| D9 | Three modules nothing imports: `r_quadparticles.js`, `screen.js`, `snd_mix.js` (no importer in `src/`, `main.js`, `server/`, `tests/` or `tools/`) | `orphans`, `unreached` | Low | [44c] (`screen`, `snd_mix`), [44e] (`r_quadparticles`): confirm each is unused in the browser, then delete or wire it into the game, with the owner's agreement for deletion | `unreached` is empty: every module is loaded by the page or the room server, by imports, dynamic imports or `new Worker( new URL( … ) )`. A test importing a module does not count, nor does a URL built and not used (checked) |
| D10 | Engine work done at import: `gl_post.js` patches Three.js's `Material.prototype` and `sv_main.js` registers engine functions into `sv_seamless` as they load, so their import order decides behaviour | `state[…].topLevelExamples` | Medium | [44e] (`gl_post`: install from the renderer's start-up); [44b] (`sv_main`: through the hooks module of D1b) | Neither statement remains at top level |

Not debt here: features not yet built (split-screen [37], the games folders [34]) and choices waiting on the owner
([W2], [M1], [42]) have their own cards.

## How the migrations move modules

* **One increment per card**, by the owner column above.
* **Old paths keep working while callers move.** Each moved module leaves a one-line adapter at its old path
  (`export * from './engine/client/keys.js';`; no `src` module has a default export, so nothing is lost). Tests, tools,
  the server and the workers keep their imports until their own increment updates them. The adapter is deleted when the
  graph shows no consumer.
  * The exceptions, from the consumer table, are retargeted in the same increment as the move: query-string imports,
    the import map, generators, source readers, records keyed by path, computed URLs and source paths.
  * Checked in scratch exports: `cmd.js`, and separately a mode-only importer (`cl_main.js`), moved into a folder behind
    an adapter. Both tools ran; the moved module kept its folder and increment; every cycle, D2 count and classified
    count was unchanged. The graph's file count rises by one, for the adapter.
* **Behaviour is unchanged by a move.** Each increment's check:
  * the full suite against the recorded baseline;
  * both tools (no unscanned module, no unexpected unresolved import, no unassigned module, cycles only shrinking);
  * the module graph test;
  * a browser start of Newer and Classic;
  * a dedicated room's start where Deno is available.

## Checks made for this baseline

* **The tools on a clean export** (`git archive 7633c31` with this page's tools): no unscanned module, no unexpected
  unresolved import, no unassigned module. The 28 expected unresolved references were checked by hand.
* **The guards were tried and fail**: a test importing `../../src/cmd.js` (a wrong depth); a D7 page importing a bare
  `src/vid.js`. Moves behind adapters are covered under the migrations above.
* **The full suite, run twice.** Every failure in both runs is classified in the evidence (`suiteCleanExport`,
  `suiteAllInputs`): a named missing input, or a real failure.
  * **A clean export of `d514db5`, without the owned pak**: 227 suites. 196 pass, 27 fail, 4 give no result.
    * 17 failures are missing inputs, each named in its failure: the owned paks (12 suites), git history
      (`axe_original`, `demon_face_relief`), the owner's local page `demon-vision.html` (`powervision_state`), the donor
      zips (`weapons`, `weapons_refinement`).
    * The 4 no-results are missing inputs too: `player-face-layers-v4.4.0.html` (`face_v44_composition`), the owned
      pak (`glass_native_interface`), the Quake install in `~/Downloads` (`nailgun_source`), a donor zip
      (`supernailgun_profile`).
    * **10 were real failures, now fixed.** Each is a test left behind by a source change, not a game defect; each was
      checked against the source change that broke it:
      * `43a3641`: `rockfield_runtime` (the sun expression gained `glass`); `rockfield_required_materials` (the E1M4
        door's pages now come from the shipped bake, not workers). Both were hidden in the owner's working tree, where
        the rockfield pages are deleted (D8).
      * `8e98cdc`: `gl_model`, `r_anim`, `gl_rlight` (fakes without the `userData` real objects have);
        `glass_materials` and `glass_region_assets` (the pigment footprint became two texels); `shotgun_source`
        (in-between frames are Newer Game's, and the test never turned Newer on); `emissive_lights` (the light term
        gained `pointCone`); `hub_logo` (four shader texts moved on).
      * These had been listed as "baseline failures" in earlier work. The review was right that this relabelled
        failures as expected.
  * **A clean worktree of `8e98cdc`**, with git history and every input this machine has: the owned paks, the owner's
    local pages and ignored art (linked, read only) and the four settings. 227 suites: **223 pass, 2 fail, 2 give no
    result.** (`face_v44_composition` first failed for want of the ignored `newer/hud/playerface/blood.png`; linked, it
    passes 8/8.) All 4 lack an input that is not here or not reachable:
    * `weapons`, `weapons_refinement`, `supernailgun_profile`: donor zips not on this machine;
    * `nailgun_source`: the Quake install in `~/Downloads`, which this session's sandbox may not read.

    This run is the baseline each increment compares against.
* **The server entry point** is inconsistent as D4 says. It was not run: Deno is unavailable here.
* **The independent review of the first version** found that:
  * it blamed the engine → Newer imports alone for the big cycle;
  * its tool skipped any folder named `newer` or `assets`;
  * its counts came from an uncommitted script;
  * it missed query-string imports, generators, manifests and computed URLs;
  * it left `rend_veil/` unassigned and misplaced five modules;
  * it described the servers wrongly;
  * it counted statements as edges and a dirty tree as the commit.
* **The review of the second version** found:
  * computed query imports invisible to the scan;
  * the 59-module remainder misexplained (it is the platform's imports, not Newer's own cycle);
  * no fail-closed check that every module was scanned;
  * a classifier that would crash on a moved module and count adapters;
  * consumers missed: `extract_menu_webgl.py`, the distribution registry, source readers, computed loads, the import map;
  * counts (query imports, mode-only importers) not computed by the tools;
  * D7 overstated; D8 self-contradictory; debts without owners; orphans unlisted; top-level statements undercounted;
  * suite evidence from a dirty tree.

* **Planned modules are classified.** `src/engine/hooks.js` (D1b) and `src/newer/mode.js` (D2) have rules
  (`engine/common` [44b], `newer/render` [44d]), so creating them does not fail the classifier.
* **The review of the third version** reproduced every figure and cycle, and found:
  * the suite evidence misdescribed: real failures among those called missing inputs (blocking);
  * the D2 check met by moving files alone;
  * D7's remedy (`src/…`) a bare specifier that browsers reject, and the tool resolving it anyway;
  * hidden consumers missed: the displacement trial, the corpus audit, `prepare_folio`, the rock manifest's source
    hashes, `.gitignore`;
  * an exemption for any `../` reference, which let a wrong-depth import pass;
  * debts without a next action or a checkable acceptance (D5, D1a, D9, D1c);
  * nits: query-string state wording, reads counted twice, folders passing as files, adapter chains, the classifier
    accepting a failed graph, import map wording, the count after a move, `docs/evidence/` skipped.

  Each is corrected above.
* **The review of the fourth version** accepted it, with three should-fix items, each corrected above:
  * D2's check passed with a forwarding module and failed open if `r_anim.js` was renamed;
  * D5 matched only exported names (32 engine-logic copies, not 21), and renaming defeated it;
  * the catch-all skipped a file's literals for any module the file imported, so two consumers were missing
    (`normal_baker_inputs_test.js`, `bake_displacement.mjs`'s source hashes).

  Its nits are corrected too: D9 counted a URL merely built, Node built-ins counted as bare, the planned modules had no
  rule, `blood.png` was not linked, no-result suites kept no output, and three test fixes were looser than they needed to
  be (`shotgun_source` now restores the prior mode; `hub_logo` checks the exact key and guard).
