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

## [44g], step 5: one client ray cast (debt D6)

`src/engine/render/r_trace.js` is the client's one helper for lines through a model's BSP: `R_TracePoint` (hull 0, a
reusable trace reset on every call) and `R_TraceSwept` (a small sphere as seven point lines, the nearest hit kept).

* The chase camera (`chase.js`, still loaded lazily to keep out of the import cycle), depth of field's focus (`r_dof.js`),
  the wall burns' contact (`r_wallburn.js`) and the shells' collision (`r_shelltrace.js`, whose brush-entity loop stays)
  use it; none of them walks the hull itself any more.
* Tested once (`tests/r_trace_test.js`, on E1M1's real BSP), and through the callers' suites (depth of field, wall burns,
  shotgun shells, the Bestiary's line of sight), which pass unchanged.
* In the browser the chase camera ends at exactly the same point as before. Its look-at line starts as chase.c's
  zeroed trace did (`allsolid` false, the helper's last parameter), so a line from inside a wall still strikes its first
  plane; the other callers keep the server's `allsolid` true, as they did.
* The graph counts 209 modules; `r_trace.js` joins the large cycle (it imports `world.js`, and Newer modules in the
  cycle import it), so that cycle is 84 modules for now.

## [44g], step 6: the room server starts again (debt D4)

Run for the first time in this work, with a Deno 2.5.6 kept outside the repository, the room server did not start on
`Dev` either: `server/browser_shim.js`, a hand-kept stand-in for `three`, lacked `Vector4`, which
`r_weapon_surface.js` constructs as it loads. The server's import graph reaches 203 modules, the renderer's among them;
they use 85 of `three`'s names, and the stand-in had 31.

* Both import maps (`deno.json`, `server/deno.json`) now give `three` the browser's own module, the version
  `index.html` pins (0.183.0, from jsDelivr; Deno caches it after the first start). The stand-in is deleted. The tests
  already load the engine on that real module under Node.
* The root task `server` runs `game_server.js` from `server/` (where it reads `../pak0.pak`) with the root import map.
* Checked: `deno task server -direct` at the root loads the start map and runs; a browser connected to it over
  WebTransport (Chrome with a self-signed ECDSA certificate) reached sign-on 4 on `maps/start.bsp` and the server
  reported the player in the game. The lobby spawns rooms with the same command and file; the lobby-to-room hand-off
  itself was not run.
* The root `deno.lock` is committed (review of step 6): it pins `three.module.js` and `three.core.js` by hash (the
  same files the tests load), and without it Deno fails to start where the install directory is read-only.
* Deno 2.1 starts the server but never listens (no `Deno.QuicEndpoint`); `server/README.md` now asks for 2.2 or later
  and quotes the `connect` address (the console splits a bare word at `:`).
* `tests/server_config_test.js` pins both import maps to `index.html`'s `three` and the task to `server/`; it fails on
  the old configuration.

## [44g], step 7: the engine calls Newer through named hooks (debt D1b)

No module in `src/engine` or `src/platform` imports `src/newer` any more. Where 30 of them imported 407 Newer names
(179 import statements: functions, cvars, classes and tables), they import the same names from
`src/engine/common/hooks.js`, and `src/newer/install.js` fills them once at startup with Newer's own exports.

* Why a new module, when the plan says to reuse what exists. The baseline's plan for this debt names it. The
  `R_DecalsSetup` / `R_WallBurnSetup` hand-overs run from the engine into Newer (the engine imports the Newer module
  and gives it engine functions), the direction this debt removes. Correction (step 9): the engine does have a way
  for a module to call one above it, each module's `X_SetExternals`, which the host wires; step 9 uses it. For
  Newer the hooks module was kept: 407 names in 30 modules would have meant rewriting every call site to a nullable
  variable, where live bindings keep them unchanged and `Hooks_Install` refuses an incomplete install. The hooks are `export let` live
  bindings, so no call site changed: only each import's source (a trailing comment names the Newer module that
  installs it). Calls cost nothing more.
* Two Newer values the engine used as its modules loaded, before any install can run, are moved instead: `ANIM_STEP`
  (Quake's own 0.1 s frame step) is in `engine/common/quakedef.js` (re-exported by `r_anim.js`), and the menu builds
  Newer Game's default commands when they are used.
* Every entry point that runs engine code installs Newer: the page (`main.js`), the room server, the test harness
  (after its renderer bootstrap), the trial pages and the bake tools (those with a module loader install after it).
  Each one that reached Newer before installs it now, so every page, tool and server loads what it loaded before.
  Until installed, a function hook throws, naming itself; `Hooks_Install` refuses a table with a hook missing or
  unknown.
* The graph: engine → Newer and platform → Newer are empty; the large cycle is 44 modules, the engine's own (D1a),
  where it was 84.
* Checked: `tests/hooks_test.js` (nothing imports Newer; every hook installed with Newer's own export; a partial or
  unknown table refused); the full suite; the page starts Newer Game and Classic; all 70 trial pages load with the same errors as on `Dev`
  (which also found a trial step 2 had missed, fixed on its own; that commit, 86a269d, imports `install.js`, which only
  the next commit adds, so the trial loads from 813a6eb on);
  a browser joined the room server (sign-on 4); two bake tools re-run give byte-identical output.
* Not changed: the room server still installs all of Newer, as it loaded all of it before. Installing only what it
  needs (no renderer) is now one import to change, but needs hooks with Classic defaults first.

## [44g], step 8: the unfinished server and three unused modules retired (debts D5 and D9, by the owner's decisions)

* D5: `server/main.ts`, the TypeScript server whose `host_server.ts`, `mod_server.ts` and `pak_server.ts` copied parts
  of the engine, never started (`host_server.ts` imported a `net_message` the driver never exported, since the commit
  that added both) and its own README called it unfinished. The live servers already run the engine itself: the room
  server (`game_server.js`) and the lobby (`lobby_server.js`). The owner chose to retire it rather than rebuild it on the
  engine (decision 278fcde5). Deleted with `rooms.ts`, which only it used; `server/deno.json`'s tasks now start the room
  server and the lobby; `server/README.md` describes those two. The graph: the three copy files are gone
  (`hidden.serverCopyFiles` null for each), `hidden.serverFunctions` is 65 (at most 86 required), no engine-prefixed
  copy is left, and what remains of `hidden.serverReimplements` is the server's own WebTransport driver.
* D9: `screen.js` (WinQuake's software-renderer screen), `snd_mix.js` (WinQuake's mixer; Web Audio mixes) and
  `r_quadparticles.js` (a Quad Damage adapter never wired in) were never imported, and the page fetched none of them
  (204 modules fetched over the menu, Newer Game and Classic). Deleted by the owner's decision (23931574); git history
  keeps them. `unreached` is empty.
* Checked: the lobby started from its new task answers a browser's room list over WebTransport; the room server and
  `server/test_imports.js` load under Deno; the suites that name these areas pass.

## [44g], step 9: no engine cycle crosses folders (debt D1a)

The engine's own cycle (44 modules across 8 folders) is gone: `cycles.crossFolder` is empty. What remains are cycles
inside one folder (8, 5, 4, 4, 3 and 2 modules), which the plan allows. Each upward reference was handled as what it
is:

* Shared state moved down into leaves under `engine/common`: the host's clock and noclip flag (`host_state.js`:
  `realtime`, `host_frametime`, `host_framecount`, `noclip_anglehack`) and where keys go (`key_dest.js`). Only their
  owners write them, through setters; `host.js`, `host_cmd.js` and `keys.js` re-export them, so their other importers
  are unchanged. `sv` is taken from `server.js`, its home, not through `host.js`.
* State-only functions moved to their state: `CL_AllocDlight` and `CL_PlayerLightning` read only the client's lights
  and beams, and live in `client.js` (`cl_main.js`, `cl_tent.js` re-export them). The server's rule cvars (`skill`,
  `deathmatch`, `coop`, `teamplay`, `fraglimit`, `timelimit`) are declared in `server.js`, which no longer re-exports
  them from the host.
* A module in the wrong folder moved: `pr_cmds.js`, the QuakeC built-ins, which call the server throughout (WinQuake's
  `pr_cmds.c` is the server's), is in `engine/server` (`tools/move_modules.mjs 44g` rewrote its 51 paths). `PR_Init`'s
  callers, the host and the room server, install the built-ins, so the VM does not import the server.
* The calls that really go up use the engine's own mechanism, each module's `X_SetExternals`: the console's typed line
  and drawing size (`Con_SetExternals`), the screen's menu and touch inset (`SCR_SetExternals`), the status bar flag
  (`Draw_SetExternals`), the menu's fullscreen exit (`M_SetExternals`), and four new ones of the same form:
  `R_SetExternals` (the view blend), `CL_SetExternals` (the host's error, shutdown and memory clear; the platform's
  movement), `CL_Parse_SetExternals` (the host's error and end of game) and `WT_SetExternals` (the menu's connection
  error and main menu). `host.js` wires these as it loads, so wherever the host is loaded they behave as the imports
  they replace; unwired, an error still throws as `Host_Error` does and the rest do nothing.
* Checked: the classifier (`D1a cross-folder engine cycles:` empty); the full suite; the page, the trials and the room
  server as before (below). A first version wired the new externals in `Host_Init`, which no test calls; a save/load
  test failed (`Host_ShutdownServer` did nothing), which wiring at load fixed.

## [44g], step 10: suites skip a missing local input (debt D8); the large modules are cards (debt D3)

* D8: `tools/run_tests.mjs` reports a test as `SKIP <name>: missing local input <path>`, and a suite that cannot load
  as `SKIP (whole suite) missing local input: <path>`, when it fails only because one of the baseline's listed local
  inputs, at its own location, is really absent (the PAK3, outside the repository, also when it cannot be read here) (the donor zips, the owner's local pages, `newer/hud/playerface/blood.png`,
  `resources/`, `~/Downloads/Quake/Id1/PAK3.pk3`, the rockfield pages) or because the tree has no git history. A skip
  is never counted as a pass (`RESULT 6/6 passed, 1 skipped`); any other error still fails, including a missing file
  not on the list, a wrong name under an input that is present, and a refused write (review of step 10). Here the four suites that needed donor files now read as skipped, each naming its zip or
  the PAK3. `tests/run_tests_skip_test.js` pins all of this. The missing settings (`QUAKED_THREE_MODULE` and the
  others) already stop the harness with a message naming them. Whether the local inputs return, and whether the
  owner's deletion of the rockfield pages is committed, stays the owner's.
* D3: not split here, as the plan says. One Backlog card per large module, each with its acceptance: [44h]
  `gl_post.js` by stage (2f58ccdc), [44i] `gl_rsurf.js` (789b260d), [44j] `menu.js` by screen (81b1ce01), [44k]
  `gl_model.js` by format (a9bab461), and [44l] `normal_bakes.js` loaded as data (380f4ca6; with the owner's
  untracked normal-bundle experiment, which works in that area).

## [44g]: function JSDoc

Every exported function, class constructor and public method in `src/` has a JSDoc block: what it does and when it
runs, `@param` with types and units for every parameter, `@returns`, `@throws` only where `Sys_Error`, `Host_Error`
or `throw` really runs, and lifetime or persistence where it is real (1,681 of them: 760 in Newer, 908 in the engine
and platform, and 13 that [44g] itself added: the hooks, the two leaves and the new SetExternals). The existing comments were kept in the blocks, with their provenance (WinQuake sources, cards,
owner dates); WinQuake's `/* ===== Name ===== */` banners stay.

* Comment-only: every changed file's code tokens equal its previous version's (acorn's tokenizer, comments ignored).
* `menu_webgl_source.js` is generated: its blocks come from `tools/extract_menu_webgl.py` (`QUAKEMENU_JSDOC`), whose
  `--check` passes; `docs/newer/menu-webgl/SOURCE.json` is regenerated.
* Five sources the bake manifests hash gained comments; `newer/rockfield/manifest.json` and
  `newer/displacement/manifest.json` re-hash them and say so in their `sourcesNote`.
* Where reading the code showed a comment was wrong, the block says what the code does; where it showed a likely
  defect (an export nothing calls, a missing import), the block notes it and card [44m] lists them; no code changed.

## [44h]: `gl_post.js` split by stage (debt D3)

`src/newer/render/gl_post.js` was 4,192 lines holding the whole post pipeline. It is now 257 lines: the sequencer
(`R_PostBegin`, `R_PostBind`, `R_PostLightsFrame`, `R_PostFinish`, `R_PostShutdown`), which calls each stage in
the order it always did. It re-exports every public name from the stages, so none of its importers changed (install.js's
hook table among them).

| Module | Lines | What it holds |
|---|---|---|
| `r_post_config.js` | 95 | the cvars and the tunables the stages share |
| `r_post_state.js` | 68 | the shared flags and the pipeline (`postState`), and the uniform holders `lightCurve`, `lightingLook`, `classicLook` |
| `r_post_gbuffer.js` | 521 | emissive glow and the lava pulse, surface detail, the G-buffer compile patch |
| `r_post_lights.js` | 662 | the light database (`R_BuildWorldLights`), the frame's selection, the light uniforms |
| `r_post_sky.js` | 320 | the sky's light, colour and cookie, the sun's direction, the sky flags (`skyState`), the sun uniforms |
| `r_post_liquids.js` | 390 | water and slime by name, their looks, the level's pools and links, the probes, the liquid uniforms |
| `r_post_shadows.js` | 277 | the sun occluder and shadow map, the frame's point, near-sun, spot and height shadows |
| `r_post_shaders.js` | 1,449 | the passes' GLSL, byte for byte |
| `r_post_targets.js` | 436 | dynamic resolution, the render targets and pass materials, the full-screen pass |
| `r_post_composite.js` | 236 | the shafts and bloom passes, the composite and present passes, the title demo's split |

* **Shared state.** What the stages read of one another is in two objects: `postState` and `skyState`. Each field
  has one writer, named in the module's header. The sun's direction is reassigned per map, so it is always read
  through `skyState`. The frame's light selection is one array, `_selected`, whose count is read and set through
  `R_PostSelectedCount` and `R_PostSetSelectedCount`. Objects given to shaders as uniforms stay the same objects.
* **One-way imports.** config → state → sky, liquids, G-buffer → lights → shadows → shaders → targets → composite →
  gl_post. No stage imports gl_post.js. The architecture tools' cycles are unchanged (8, 5, 4, 4, 4, 2) and Newer
  Game has none of its own. `tools/architecture_classify.mjs` assigns `r_post_*.js` to newer/render, [44h].
* **Proof that the frames are the same:** `tests/post_split_frames_trial.html`, run headless by
  `tools/post_split_frames.mjs`.
  * Eight native E1M1 views go through the whole pipeline: the start, the open air, over and under the water, over
    the slime, the flashlight, depth of field and the split. The page clock and the game time are fixed.
  * It hashes every view's pixels, and every post pass's shader and uniforms.
  * Measured on the commit before the split (82665637) and after every step, the digest is the same. Changing one
    tunable by 0.01 changes every view.
  * Two digests are known on the unchanged pipeline, 4e633bcf… and f216c748…. They differ only in the view under the
    water, by at most 15 levels across a very dark frame, with the same passes. That race is card [44o]. A step is
    accepted only at one of them.
* **A test for each stage**, through its own public interface:
  * `r_post_liquids_test`, `r_post_shaders_test`, `r_post_gbuffer_test`;
  * `r_post_sky_test`, `r_post_lights_test` and `r_post_shadows_test`, on E1M1;
  * `r_post_targets_test` and `r_post_composite_test`.
  * The 36 existing suites that use gl_post.js's exports pass unchanged.
* **Found on the way and fixed, each in its own commit:**
  * the graph tool did not know the owner's mission-pack paks, which [34e]'s test reads;
  * the classifier had no rule for local play's and the game shelf's modules ([37a], [M1]).

## [44i]: `gl_rsurf.js` split by stage (debt D3)

`src/engine/render/gl_rsurf.js` was 3,859 lines holding the whole world renderer. It is now 187 lines: the two
sequences, the frame's (`R_DrawWorld`) and the map load's (`GL_BuildLightmaps`), which call each stage in the order
they always did. It re-exports the same 40 public names, so none of its importers changed.

| Module | Lines | What it holds |
|---|---|---|
| `gl_rsurf_state.js` | 41 | the world's two groups (`worldState.group`, `worldState.renderGroup`) and `R_EnsureWorldGroup` |
| `gl_rsurf_lightmaps.js` | 879 | the atlases: allocation, `R_BuildLightMap` with the styles and dynamic lights, the blend, the uploads; the surface polygons (`BuildSurfaceDisplayList`); the Classic pass's grayscale copies |
| `gl_rsurf_materials.js` | 397 | the lit material, texture animation, a polygon's triangles alone or merged by material |
| `gl_rsurf_liquids.js` | 833 | liquid materials and meshes, the turbulent warp, clear water's light, the sky's two layers |
| `gl_rsurf_batches.js` | 657 | the world's batched meshes, leaf marking (`R_MarkLeaves`), their visibility, the demon relief, the arch and the sun's occluder |
| `gl_rsurf_world.js` | 731 | the BSP walk, the texture chains, a surface's own drawing, the lightmaps that change under styles and lights |
| `gl_rsurf_brush.js` | 545 | brush entities: each a group of meshes kept on its entity, with the demon relief on its demon surfaces and its liquid and teleporter faces |

* **Shared state.** The world's group and the group the surface renderers add to were two variables written from
  several places; they are `worldState`, and the group is made in one place (`R_EnsureWorldGroup`, before in two).
  What the sequences used to write in another stage's variables (the atlas format, the model being built, the liquid
  and brush sets, the batches' flags) is now a call to that stage: `R_LightmapsSetFormat`, `R_LightmapsSetModel`,
  `R_LiquidsBeginFrame`, `R_BrushBeginFrame`, and one clear function a stage for the map load.
* **One-way imports.** state, lightmaps, materials, liquids, batches, world, brush, then gl_rsurf.js; each stage
  imports only those before it, and none imports gl_rsurf.js. `tools/architecture_classify.mjs` assigns
  `gl_rsurf_*.js` to engine/render, [44i].
* **The render cycle grew from 5 to 12 modules**, by the owner's decision (option a, 10 Oct 2026: accept a larger
  cycle rather than move gl_rmain.js's state first). Every stage reads gl_rmain.js's frame state (the current entity,
  the frame counters, the scene), and gl_rmain.js reaches every stage through gl_rsurf.js, so all seven are in it; the
  plan had estimated 10. The other cycles are unchanged (8, 4, 4, 4, 2) and Newer Game has none of its own.
* **Moved, not rewritten.** Each move was made by a tool that cuts whole top-level statements with their comments,
  gives the new module exactly the imports its code uses, and refuses a move that would leave a write to a moved
  variable or a use of code left behind. A count of every line before and after accounts for all of them (only blank
  lines differ). The 12 functions that became exports gained JSDoc; the 11 new stage functions have it.
* **Proof that the frames are the same:** `tests/world_split_frames_trial.html`, run headless by
  `tools/world_split_frames.mjs`.
  * The real application replays the native demo1 to packets 300, 600 and 850 and draws each view with its own
    `SCR_UpdateScreen`, which runs the real order (R_MarkLeaves, R_DrawWorld, the brush entities, the liquids, the
    render, R_CleanupWaterMeshes). The views are Classic and Newer at two game times, a changed light style with a
    dynamic light, and Classic with `gl_texsort 0` and `r_wateralpha .5`.
  * A view's digest covers its pixels, every lightmap atlas byte, gl_rsurf's own objects (the world's group and each
    brush entity's, with visibility, draw ranges and every geometry attribute, liquid and sky texture coordinates
    included) and `c_brush_polys`.
  * What is not the frame's own is pinned: the page clock, `realtime`, the frame time, `Math.random` and
    `crypto.getRandomValues` (enemy faces, decals), the particles, the damage flash, the stair smoothing. The torch
    fire and the point shadows are off: both keep history from earlier frames.
  * On the commit before the split (897e3ba6), the world digest is e5de8891… in ten runs of ten. The full digest is
    1b245eb2… or 6bcfc8b1…, about half each: the Newer views at packets 600 and 850 settle one of two ways in their
    torch-lit areas, a choice made in the post pipeline's lighting. Every step gave the same world digest and one of
    the two full digests; changing the liquid warp or the lightmap builder changes the world digest.
* **A test for each stage**, through its own public interface, on the shareware E1M1 where a map is needed:
  * `gl_rsurf_state_test`, `gl_rsurf_materials_test`;
  * `gl_rsurf_lightmaps_test` (one-byte and coloured texels, E1M1's atlases), `gl_rsurf_liquids_test` (the warp, a
    liquid mesh's life);
  * `gl_rsurf_batches_test` (the batches, the view's visible set, a probe's "show all"), `gl_rsurf_world_test` (a
    changed style rebuilds the atlas), `gl_rsurf_brush_test` (a door's group kept, taken out, thrown away).
  * Breaking the upload, the liquid clean-up, "show all" or the style rebuild fails its test.
  * The suites that use gl_rsurf.js's exports pass unchanged.
* **Bakes.** `newer/displacement/manifest.json` keeps gl_rsurf.js's bake-time hash (no key changes) and says so in
  its `sourcesNote`; `tools/bake_displacement.mjs` now hashes the seven stages too.

## [44j]: `menu.js` split by screen family (debt D3)

`src/engine/client/menu.js` was 3,766 lines holding every menu screen. It is now 400 lines: the menu's entry points
(`M_Init` and its `menu_*` commands, `M_Draw`, `M_Keydown`, `M_ToggleMenu_f`, the touch input) that dispatch on
`m_state` to the screen families. It re-exports the same 45 public names, so none of its importers changed, and
exports the state's setters and `menuOpeners` beside them.

| Module | Lines | What it holds |
|---|---|---|
| `menu_common.js` | 610 | the screen ids, `m_state` and the shared flags with their setters, `menuOpeners`, the host's drawing, sound and clocks (`M_SetExternals`), the drawing helpers, the player colour table, `M_InGame`, the episodes and levels, the Newer defaults |
| `menu_main.js` | 822 | main, single player, load and save, the Bestiarium, credits, quit |
| `menu_levelselect.js` | 343 | level select |
| `menu_multiplayer.js` | 1,276 | the multiplayer choice, local play, online rooms, LAN config, game options, setup, a failed connection's return |
| `menu_options.js` | 966 | options and their sliders, Newer's options, the key bindings, cheats, video |

* **Shared state.** `m_state`, `m_entersound`, `m_recursiveDraw`, the three return fields and `m_save_demonum` were
  assigned from every family (71 places). Each now has one setter in menu_common.js (`set_m_state` and so on); a
  tool rewrote the plain assignment statements and refused anything else.
* **One-way imports.** menu_common.js imports no family; menu_main.js imports common; level select, multiplayer and
  options import common and main (their ESC returns to the main or single-player menu). The main menu reaches the
  three later families through `menuOpeners`, which menu.js fills as it loads, so no family imports a later one.
  `tools/architecture_classify.mjs` assigns `menu_*.js` to engine/client, [44j].
* **The client cycle grew from 8 to 13 modules**, by the owner's decision (option a, 10 Oct 2026). Every family reads
  keys.js (the key numbers and destinations), which is in the cycle with the client, so all five joined it. The other
  cycles are unchanged (12 render, 4, 4, 4, 2).
* **Moved, not rewritten.** The same tool as [44i]'s moved whole statements with their comments; a count of every line
  before and after accounts for all of them (blank lines and the multi-line imports it rewrote on one line aside).
  The 78 functions the split exported have JSDoc, added as a comment-only step (code tokens unchanged).
* **Proof that the menus draw and behave the same:** `tests/menu_split_trial.html`, run headless by
  `tools/menu_split_frames.mjs`.
  * The real application, frozen on a demo1 frame as the menus' background, runs 16 scripts of menu commands and keys
    (244 steps) through the menu's own entry points, Classic and Newer. No step starts a game, quits or resets the
    configuration.
  * A step's record: menu.js's drawing and sound calls (recorded through `M_SetExternals`, which also pins its two
    clocks), the WebGL menu's own commands (`MainMenu_Frame`), `m_state`, the key destination, every archived cvar,
    the key bindings and the world's pixels. The 2D overlay's pixels are left out: compositing the WebGL menu onto it
    changes a few pixels from one identical draw to the next.
  * The digest is e38d89be… on the commit before the split (fa1ef637) and after every step. Changing one label or
    one key's cursor step changes it. (Its first version stopped the application before the startup's commands had
    always run; it now waits for the host's third frame.)
* **A test for each family**, through its own public interface: `menu_common_test` (the setters, `M_InGame`, the
  helpers' placement, the colour table), `menu_main_test`, `menu_levelselect_test`, `menu_multiplayer_test` (a
  failed connection's return), `menu_options_test` (a slider's steps and ends). Breaking the colour table, the main
  cursor, the return flag or the slider's step fails its test. The 13 existing menu suites pass unchanged.
* **Found on the way, not changed** (card [44p]): quit opens the project page instead of quitting, unguarded where
  there is no `window`; Continue leaves the demo loop held; several touch areas are off (the scrolled room list, the
  game options' bands, the key-binding wait, setup has none); level select's cursor is not clamped after an episode
  change; minor dead code.

## [44k]: `gl_model.js` split by format (debt D3)

`src/engine/render/gl_model.js` was 3,396 lines holding every loader. It is now 519 lines: `Mod_Init`, `Mod_ForName`,
`Mod_LoadModel` (which picks the loader by the file's first four bytes), the cache, the PVS and leaf lookups and the
preview load. It re-exports the same 92 public names (and the two sky textures' setters), so none of its importers,
the room server among them, changed.

| Module | Lines | What it holds |
|---|---|---|
| `gl_model_types.js` | 689 | the formats' constants and the structures the loaders fill (72 names) |
| `gl_model_common.js` | 298 | the model being loaded, the known-model table (`Mod_FindName`), `GL_LoadTexture`, the placeholder and sky textures, `readString`, `RadiusFromBounds` |
| `gl_model_bsp.js` | 1,336 | the BSP loader: the lumps, BSP2 and 2PSB, the hulls, the inline models, the sky, the crate variants |
| `gl_model_alias.js` | 537 | the alias loader: header, skins, frames, display lists, and the shared arrays gl_mesh.js reads |
| `gl_model_sprite.js` | 195 | the sprite loader |

* **Shared state.** `loadmodel`, `previewLoad`, `r_notexture_mip` and the two sky textures were written from more
  than one part; each has one setter in gl_model_common.js. The state only the BSP loader uses (`mod_base`, the BSP2
  flags) moved with it.
* **One-way imports.** types import nothing of these; common imports the types; each loader imports the types and
  common; gl_model.js imports them all and none imports it. `tools/architecture_classify.mjs` assigns `gl_model_*.js`
  to engine/render, [44k].
* **Cycles.** The render cycle grew from 12 to 13 modules, by the owner's decision (option a): the alias loader reads
  gl_mesh.js, which is in the cycle. The types, common, BSP and sprite modules are in no cycle.
* **Moved, not rewritten,** by the same tool as [44i]: whole statements with their comments, every line accounted for.
  The 6 functions that became exports have JSDoc.
* **Proof that maps and models load identically:** `tests/model_load_digest_test.js` loads every model of the
  shareware pak through `Mod_ForName` (its maps with their inline models, the alias models and the sprites: 699) and
  serialises each whole: every own property, objects numbered as first met (so the tree's shared and parent links
  count), typed arrays and texture pixels by their bytes, three.js `uuid` and `version` left out. A map and its inline
  models are digested as soon as it loads (the next map writes over the shared `*1`, `*2` ... entries); the alias models
  and sprites once all are loaded. It prints one digest: 388fdfc6… on the loader before the split (5d9630d8) and after
  the split, the same in two runs; every step was also checked with the first version of the test (f8f766d0…, which
  digested the inline models only as the last map left them). Changing a map's frame count or an alias model's flags
  changes it.
* **A test for the parts**, through their own interfaces: `gl_model_common_test` (the table, the readers, the
  radius) and `gl_model_loaders_test` (E1M1's lumps, hulls and inline models and a refused version; the player's
  frames; an explosion's frames). Breaking `readString` or a sprite's frame count fails them. The model suites, the
  BSP2 server test and the room server's imports pass unchanged.
* **Found on the way, not changed:** the alias loader reads `mod.flags` twice, first from the wrong offset (72, the
  sync type); the second read (76) wins, so it is harmless.

## Checks for each move

* Both architecture tools pass (no unscanned module, no unexpected unresolved import, no unassigned module) and the
  cycles do not grow.
* The full suite against the recorded baseline.
* The room server's modules import under Node (`server/test_imports.js` and every module `server/game_server.js`
  imports). From [44g] step 6 the room server is also started under Deno (2.5.6, kept outside the repository).
* The page starts Newer Game and Classic in the browser with no error and no failed `src/` load, and the D7 pages load.
