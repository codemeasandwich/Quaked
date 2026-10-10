# Architecture baseline: subsystems, cycles and the debt to close

Card [44a]. A plan and a measured baseline, not a reorganisation: no module has moved. It is the context the migrations
[44b] to [44f] work from, and the one [44g] closes against.

All figures are from a clean export of commit `847db8f` (no ignored local files). Two tools produce them:
`tools/architecture_graph.mjs` (the imports, cycles, consumers, entry points and module state) and
`tools/architecture_classify.mjs` (every module's proposed folder and owning increment, and the subsystem measurements).
Their combined output is in [evidence/architecture-baseline-2026-10-10.json](evidence/architecture-baseline-2026-10-10.json).
An earlier version of this page (at `762b70a`) was rejected by independent review; what it got wrong is listed at the
end.

```sh
git archive HEAD | tar -x -C /tmp/q
node tools/architecture_graph.mjs /tmp/q /tmp/graph.json        # fails if a src module is missed
node tools/architecture_classify.mjs /tmp/graph.json /tmp/map.json   # fails if a module has no folder or increment
```

## What there is

* **205 modules in `src/`**: 197 flat files and `src/rend_veil/` (8).
* **652 files scanned**: `src/`, `main.js`, `server/`, `tests/`, `tools/`; `.js`, `.mjs`, `.ts`, `.html` and `.py`.
  The scanner reads static imports, re-exports, literal dynamic `import()`, `new URL( literal, import.meta.url )` and
  `<script src>` (resolved against a page's `<base href>`). That gives 4,073 distinct module pairs from 4,242 statements.
* **Entry points**, and the `src` modules each loads (directly, then transitively):

  | Entry | Direct | Transitive | Notes |
  |---|---:|---:|---|
  | `main.js` (the page, from `index.html`) | 25 | 201 | everything but a few tools-only modules |
  | `server/game_server.js` (a dedicated game room) | 15 | 197 | it loads all of Newer Game through the cycle below |
  | `server/main.ts` (the TypeScript server) | 0 | 8 | only through `src/net.js`; its own `host_server.ts`, `mod_server.ts`, `pak_server.ts` re-implement parts of the engine |
  | `server/lobby_server.js` | 0 | 0 | spawns `game_server.js` rooms (`room_process_manager.ts`) with `--config <root>/deno.json` |

* **Workers.** `src/rockfield_worker.js` (from `r_rockfield.js` and `rockfield_prepare.js`). The tools use Node
  `worker_threads` (`bake_rockfield.mjs`, `prepare_folio.mjs`).
* **Outside consumers** of `src` modules: 2,731 distinct (module, file) pairs. 2,632 are tests, 45 tools, 29 server
  files and 25 `main.js` imports. Query strings are stripped, so `?case` imports count as the file they name.

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
| `src/newer/render` (models, animation) | 16 | | [44d] | Poses and skins, held weapons, cut and lying bodies, levels drawn in windows (listed in the classifier) |
| `src/newer/render` (the rest) and `rend_veil/` | 54 | 20,194 (all of `newer/render`) | [44e] | Effects, materials, post-processing (`gl_post`), portals (`gl_portal`), normal maps (`gl_normals`), vision modes |
| `src/newer/assets` (prepared data) | 17 | 23,196 (all of `newer/assets`) | [44e] | Bakes, their formats and transports, the displacement store |
| `src/newer/assets` (preparation) | 6 | | [44f] | Normal and rock preparation, the rock worker, the prepared corpus, the startup packs |
| `src/newer/ui` | 18 | 3,341 | [44f] | The WebGL menu, loading screens, Newer status bar and face, the Bestiary and its book, the pencil replay |
| `src/newer/sound` | 3 | 379 | [44f] | Ambient music and the exit machine |

By increment: [44b] 50 modules, [44c] 26, [44d] 31, [44e] 71, [44f] 27.

## Cycles

There are four strongly connected groups of modules that import each other (static imports and re-exports): **83, 4, 2
and 2 modules**.

* **The engine is a cycle by itself.** Engine modules alone form a **41-module** cycle: client, server, QuakeC VM,
  renderer, sound, net and console, as the original C files called each other through shared headers. With the
  platform (`in_web`, `touch`, `webxr`) it is 44. This is what makes import order fragile.
  * Tests import `gl_rsurf.js` first (`tools/run_tests.mjs`).
  * Card [36]'s gamepad table (`in_web.js` reading `keys.js` constants) and card [38]'s trace object (`r_dof.js`
    reading `world.js`) had to be built lazily the same day, because both sit inside that cycle.
* **The engine also imports Newer Game**: 165 distinct module pairs (173 statements) from 28 engine modules. The largest
  are `gl_rmain.js` (41 Newer modules), `cl_main.js` (11), `host.js` (9) and `view.js` (8). This pulls 39 Newer modules
  into the 83. Removing every engine → Newer import still leaves a **59-module** cycle: the engine's own, plus Newer
  modules that import each other.
* The small ones: `cmd`, `common`, `cvar`, `pak` (4); `gl_normals`, `normal_prepare` (2); `r_demosplit`, `r_perf` (2).

## Module state

Things a migration must keep in one instance, in its order of initialisation:

* **226 mutable exported bindings** (`export let`) in 30 modules. Importers see their live values.
* **Module-level Maps and Sets** in 49 modules.
* **Browser storage** in 6 modules: `bestiary_state`, `cvar`, `displacement_store` (the origin private file system),
  `host`, `host_cmd`, `menu`.
* **Code that runs at import**: for example, `cvar.js` registers at load, and `sv_main.js` builds tables.
  `topLevelCalls` in the evidence counts such statements per module.

A module moved behind an adapter keeps all of this, because `export *` re-exports live bindings of the one module
instance. A module imported under two different paths would split its state.

## Consumers a move must update

The import scan sees most consumers. These it cannot follow by itself, so each is listed with the increment that owns
the move:

| Consumer | Where | What breaks after a move | Owner |
|---|---|---|---|
| Query-string imports (`r_newerskins.js?case` and similar; 77 in 27 test files) | `tests/*_test.js` | An adapter makes every `?case` the same inner module, so cases share state: these imports must be retargeted to the new path in the same increment | the module's |
| Generators that write `src` modules | `bake_alias_meshes.mjs`, `bake_displacement.mjs` and `split_prepared_bundles.mjs` (both write `demon_bakes.js`), `bake_normals.mjs`, `bake_rockfield.mjs`, `build_startup_normal_prefetch.mjs`, `build_startup_pak.py`, `prepare_corpus.mjs` | Re-running one would overwrite the adapter at the old path | [44e] / [44f] |
| Manifests keyed by `src` paths (source hashes) | `newer/displacement/manifest.json`, `newer/rockfield/manifest.json` (checked by `tests/rockfield_bakes_test.js`) | The recorded paths and hashes no longer match | [44e] |
| Module-relative URLs built from computed names | `r_bestiary.js`, `r_fireball.js`, `r_folio.js`, `r_playerface.js` (`new URL( '../' + … , import.meta.url )`) | They resolve one folder too deep | [44e] / [44f] |
| Literal module-relative URLs | `r_quadparticles.js`, `s_ambientmusic.js`, `studio_logo.js`, the rock worker | The same | the module's |
| Computed source paths | `bestiary_navigation_trial.js`, `credits_trial.js`, `loading_performance_trial.js`, `oldone_gameplay_trial.js` (`import( '../src/' + n + '.js' )`), `unseen_gun_test.js` (reads source text by name), `quadvision_gpu_trial.html` (fetches source) | They load the adapter, or read its text | the module's |
| A flat source glob | `tools/check_distribution_policy.py` (`src/*.js`) | Goes blind to moved modules | [44b] (first move) |
| The server's room spawning | `server/room_process_manager.ts` (finds `game_server.js` and the root `deno.json` from its own folder) | Moving `server/` or the root config | [44b] |

## Technical debt, with evidence and an acceptance check

| # | Debt | Evidence | Severity | Acceptance check |
|---|---|---|---|---|
| D1a | The engine's own import cycle (41 modules; 44 with the platform) | `cycles.engineAlone` | High: evaluation order is fragile and new module-level tables fail at load | `cycles.engineAlone` lists only an agreed, documented set; [44b]/[44c] break the client ↔ server ↔ renderer edges by moving shared state into leaf modules |
| D1b | The engine imports Newer Game (165 pairs from 28 engine modules) | `engineToNewer` | High: the dedicated room server loads all of Newer Game; Classic depends on Newer modules loading | Zero engine → Newer static edges: a neutral hooks module (`src/engine/hooks.js`: named hook points the engine calls and Newer registers into at startup). The existing `R_DecalsSetup` / `R_WallBurnSetup` calls are the opposite direction (the engine imports the Newer module and hands it engine functions) and are themselves edges to remove |
| D2 | The Newer/Classic mode switch (`R_NewerGame`, the classic pass) lives in `r_anim.js`, an animation module, which 49 modules import (45 for the mode alone) | `fanIn`; import lists | Medium | The mode moves to its own leaf module (`src/newer/mode.js`), with a re-export left in `r_anim.js` until callers move |
| D3 | Very large modules: `normal_bakes.js` (generated data in source), `gl_post.js`, `gl_rsurf.js`, `menu.js`, `gl_model.js` (3,000 to 17,000 lines) | `lines` | Medium | Generated tables loaded as data, not imported as source; the post pipeline split by stage with a test each |
| D4 | The root `deno.json` task `server` runs `game_server.js`, which is not at the root; the room server it means reads `../pak0.pak` from its working directory (run from `server/`). The same file's import map (`three` → `server/browser_shim.js`) is used by every room the lobby spawns, so it is not a convenience file | `deno.json`; `server/game_server.js` lines 4-5, 58; `room_process_manager.ts` | Low (a broken shortcut) | `deno task server` at the root starts a room. Owner: [44b], next action: change the task to run from `server/` and try it where Deno is installed (it is not on this machine) |
| D5 | The TypeScript server re-implements engine functions (`SV_RunClients`, `SV_DropClient` in `server/host_server.ts`) beside the engine's own | `server/host_server.ts` lines 292, 335 | Medium: fixes to one are missed in the other | One implementation, imported by both servers; owner [44b] |
| D6 | Client-side BSP ray casts written separately: `chase.js` `TraceLine`, `r_shelltrace.js` `traceHull`, `r_wallburn.js` `R_WallBurnTrace`, `r_dof.js` `traceFraction` | source | Low | One client trace helper (point and swept), tested once |
| D7 | Trial pages whose inline imports resolve above the served root (`demo_resolution_trial.html`, `enemy_height_trial.html`, `wizard_texture_trial.html`: `<base href="../">` with `../src/` imports) | `missing` in the evidence | Low | Each fixed or retired |
| D8 | Suites that need files a clean checkout lacks: the owned full-game `resources/id1/pak0.pak` (3 suites), the owner's local `fieldlab-fx-3d-updated.html` (3) and `arc-weapons-wall-canvas-shotgun.html` (1); donor zips (`weapons_refinement`, `weapons`); the owner-deleted rockfield pages (4 suites, still tracked at this commit) | `missing`; the suite log | Low (not code defects) | Each skips with a clear message when its input is absent, or gets its input back with the owner's agreement; not relabelled as passing |

Not debt here: features not yet built (split-screen [37], the games folders [34]) and choices waiting on the owner
([W2], [M1], [42]) have their own cards.

## How the migrations move modules

* **One increment per card**, by the owner column above.
* **Old paths keep working while callers move.** Each moved module leaves a one-line adapter at its old path
  (`export * from './engine/client/keys.js';`; no `src` module has a default export, so nothing is lost). Tests, tools,
  the server and the workers keep their imports until their own increment updates them. The adapter is deleted when the
  graph shows no consumer.
  * The exceptions, from the table above, are retargeted in the same increment as the move: query-string imports,
    generators, manifests, computed URLs and source paths.
* **Behaviour is unchanged by a move.** Each increment's check:
  * the full suite against the recorded baseline;
  * both tools (no missed module, no unassigned module, cycles only shrinking);
  * the module graph test;
  * a browser start of Newer and Classic;
  * a dedicated room's start where Deno is available.

## Checks made for this baseline

* **The tools on a clean export of `847db8f`.** They found no unscanned module and no unassigned module. Their
  unresolved references were checked by hand:
  * the axe test's two deliberate absence checks;
  * the three trial pages of D7;
  * the local inputs of D8.
* **The full suite at `da8345f`.** It shows exactly the known baseline failures; the log is in the evidence file.
* **The server entry point** is inconsistent as D4 says. It was not run: Deno is unavailable here.
* **An independent review of the first version** found the faults this version corrects:
  * it blamed the engine → Newer imports alone for the big cycle;
  * its tool skipped any folder named `newer` or `assets` (so it would not have seen modules moved into the proposed
    folders);
  * its edge lists and engine → Newer counts came from an uncommitted script;
  * it missed query-string imports, generators, manifests and computed URLs among the consumers;
  * it left `rend_veil/` unassigned and misplaced `gl_post`, `gl_portal`, `gl_normals`, `face_state` and `cd_audio`;
  * it described the servers wrongly;
  * it counted statements as edges and a dirty working tree as the commit.
