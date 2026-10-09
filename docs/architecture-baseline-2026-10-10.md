# Architecture baseline: subsystems, cycles and the debt to close

Card [44a]. A plan and a measured baseline, not a reorganisation: no module has moved. It is the context the migrations
[44b] to [44f] work from, and [44g] closes against. Everything below was measured at Dev `57361b2` by
`tools/architecture_graph.mjs` and `tools/architecture_classify.mjs`. The full numbers, the proposed path of every
module and the edge lists are in [evidence/architecture-baseline-2026-10-10.json](evidence/architecture-baseline-2026-10-10.json).

```sh
node tools/architecture_graph.mjs . /tmp/graph.json        # imports, cycles, fan-in/out, outside consumers
node tools/architecture_classify.mjs /tmp/graph.json /tmp/map.json   # proposed subsystem of each module
```

## What there is

* **207 modules in `src/`**: 199 flat files, plus `src/rend_veil/` (8 files). 613 source, test, tool and server files
  were scanned for static imports, re-exports, dynamic `import()`, `new URL( …, import.meta.url )` and `<script src>`.
* **Entry points**:
  * the page, `index.html` loading `main.js`;
  * the dedicated server, `server/main.ts` (`deno task start` in `server/`; it imports 21 `src/` modules through
    `server/browser_shim.js` for three.js) and `server/game_server.js`;
  * the workers, `src/rockfield_worker.js` (started from `r_rockfield.js` and `rockfield_prepare.js`);
  * the test runner, `tools/run_tests.mjs`, which runs the Deno-style tests under Node;
  * the asset tools in `tools/`.
* **Outside consumers** of `src/` modules: 2,639 import references from `tests/`, 47 from `tools/`, 29 from `server/`
  and 25 from root files. The most imported from outside are `cvar.js` (169), `gl_post.js` and `r_anim.js` (126 each),
  `client.js` (121) and `gl_rsurf.js` (114). Every path a migration changes has to keep these working.

## Subsystems (proposed folders)

Each module is classified by its role. The proposed folder is where the migrations would put it.

| Proposed folder | Modules | Lines | What it is |
|---|---:|---:|---|
| `src/engine/common` | 14 | 5,248 | The original engine's shared core: commands, cvars, files and paks, memory, maths, console, protocol |
| `src/engine/progs` | 6 | 4,873 | The QuakeC virtual machine and its built-ins |
| `src/engine/server` | 9 | 9,881 | Host, server, world, physics, player movement |
| `src/engine/net` | 4 | 3,127 | Networking: loopback and WebTransport |
| `src/engine/client` | 14 | 13,310 | Client state and parsing, view, keys, status bar, screen, the native menu |
| `src/engine/sound` | 4 | 2,141 | Sound mixing and loading |
| `src/engine/render` | 18 | 21,981 | The Three.js port of the GL renderer (`gl_*`), video, particles, lit files |
| `src/platform` | 4 | 2,604 | Browser input, touch, WebXR |
| `src/newer/gameplay` | 26 | 3,959 | Newer Game's server-side rules (`sv_*` additions), respawn, Rend the Veil state, records |
| `src/newer/render` | 58 | 14,008 | Newer Game's renderer features and effects (`r_*`), vision modes |
| `src/newer/ui` | 14 | 2,810 | The WebGL menu, loading screens, Newer status bar and face, the Bestiary book |
| `src/newer/sound` | 3 | 382 | Ambient music and the exit machine |
| `src/newer/assets` | 25 | 25,374 | Prepared data: normal, rock, demon and mesh bakes, startup packs, transports, workers |

## Cycles

Four strongly connected groups of modules import each other (static imports and re-exports only):

* **83 modules**: nearly all of the client, server, QuakeC VM, renderer, input and menus, together with the Newer
  modules they import (the full list is in the evidence file).
* `cmd`, `common`, `cvar`, `pak` (4).
* `gl_normals`, `normal_prepare` (2).
* `r_demosplit`, `r_perf` (2).

The big one is held together by the engine importing Newer Game. **31 native engine modules import Newer modules, 199
import edges** (for example `gl_rmain.js` 45, `gl_post.js` 29, `cl_main.js` 11, `host.js` 9, `pr_exec.js` 6,
`sv_phys.js` 6), while the Newer modules import the engine back. Its symptoms today:

* Tests must import `gl_rsurf.js` first so the cycle evaluates in a safe order.
* A module-level table that reads another module's exports at load can fail with "Cannot access … before
  initialization". Card [36]'s gamepad button table, built from `keys.js` constants, had to be built lazily for this
  reason today.

## Technical debt, with evidence and an acceptance check

| # | Debt | Evidence | Severity | Acceptance check |
|---|---|---|---|---|
| D1 | The native engine imports Newer Game directly (199 edges from 31 engine modules), forming the 83-module cycle | `engineModulesImportingNewer` in the evidence file | High: import order is fragile; the dedicated server loads Newer code it never uses | Engine modules call Newer features through registered hooks (as `R_DecalsSetup`, `R_WallBurnSetup` already do); `tools/architecture_graph.mjs` reports no engine → Newer static edge and the big cycle gone |
| D2 | The Newer/Classic mode switch (`R_NewerGame`, the classic pass) lives in `r_anim.js`, an animation module, which is why 49 modules import it | `fanIn` | Medium: a misleading owner; animation changes touch everything | The mode moves to its own small module (`src/newer/mode.js`, with a re-export left in `r_anim.js` until callers move) |
| D3 | Very large modules: `normal_bakes.js` 17,023 lines (generated data in source), `gl_post.js` 3,842, `gl_rsurf.js` 3,582, `menu.js` 3,324, `gl_model.js` 3,184 | `lines` | Medium | Generated tables live under generated data (loaded, not imported as source); the post pipeline's passes split by stage, each with its own test |
| D4 | The root `deno.json` task `server` runs `game_server.js`, which is not at the root; `server/game_server.js` reads `../pak0.pak` relative to the working directory, so it is meant to run from `server/` (its header: `deno run … --config ../deno.json game_server.js`) | `deno.json`; `server/game_server.js` lines 4-5, 58 | Low: a broken convenience command (the documented server is `deno task start` in `server/`) | `deno task server` at the root starts the server. Not changed here: Deno is not installed on this machine, so a fix could not be run; the task needs to change directory, or the pak path needs to resolve from the file, and either must be tried |
| D5 | Several client-side BSP ray casts written separately: `r_shelltrace.js` `traceHull`, `r_wallburn.js` `R_WallBurnTrace`, `r_dof.js` `traceFraction` | source | Low | One client trace helper (point and swept) used by all three, with its own tests |
| D6 | Known failing or unrunnable suites from missing local inputs: rockfield pages deleted by the owner (4 suites), donor zips absent (`weapons_refinement`, `weapons`), and others listed as the baseline | the full-suite list kept on the cards; `missing` in the evidence | Low (not code defects) | Each either gets its input back or is retired with the owner's agreement; not relabelled as passing |

Not debt: features not yet built (split-screen [37], the games folders [34]) and choices waiting on the owner
([W2], [M1], [42]) have their own cards and are not repeated here.

## How the migrations move modules

* **One increment per card.** [44b] native runtime, server and QuakeC (`engine/common`, `engine/progs`,
  `engine/server`, `engine/net`, `newer/gameplay`). [44c] client, networking, input and session (`engine/client`,
  `platform`). [44d] the world, model and animation renderer (`engine/render`, with the model and animation parts of
  `newer/render`). [44e] materials, effects, post-processing and resources (the rest of `newer/render`, and
  `newer/assets`). [44f] gameplay, HUD, Bestiary, menus and asset preparation (`newer/ui`, `newer/sound`, the
  remaining `newer/gameplay`). [44g] closes the debt above and the JSDoc.
* **Old paths keep working while callers move.** Each moved module leaves a one-line adapter at its old path
  (`export * from './engine/client/keys.js';`). Tests (2,639 references), tools, the server and the workers keep their
  imports until their own increment updates them, and the adapter is deleted when nothing imports it
  (`tools/architecture_graph.mjs` lists the consumers). `export *` does not carry a default export: the few modules with
  one keep it explicitly.
* **URL-based references move with their files.** The worker (`rockfield_worker.js`), the WebGL menu source loaded by
  `import()`, `chase.js` and `world.js` loaded by `import()`, and the three asset URLs resolved from `import.meta.url`
  (`r_quadparticles.js`, `s_ambientmusic.js`, `studio_logo.js`). Each must be rechecked in the browser after its move,
  because a wrong relative URL fails only at run time.
* **Behaviour is unchanged by a move.** Each increment's check is the full suite against the recorded baseline, the
  module graph test (`tests/main_module_graph_test.js`), a browser start of Newer and Classic, and the dedicated server's
  imports.

## Checks made for this baseline

* The graph tool ran over the checkout. Its "missing" references were checked by hand:
  * Six are real: the four owner-deleted rockfield pages, and the axe test's deliberate absence checks.
  * The rest are query-string cache-busters on test imports, which resolve.
* The full suite, run at `4d5233a` earlier the same day, shows only the known baseline failures.
* The server entry point is inconsistent as shown in D4. It was not run: Deno is unavailable here.
