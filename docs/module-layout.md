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
| `src/engine/render`, `src/newer/render` (models and animation) | The GL renderer port; poses, skins, held weapons, bodies, level windows | [44d] | not yet |
| `src/newer/render` (the rest), `src/newer/assets` (prepared data) | Effects, materials, post-processing, portals, vision; bakes and their formats | [44e] | not yet |
| `src/newer/ui`, `src/newer/sound`, `src/newer/assets` (preparation) | Menu, loading, HUD, Bestiary; ambient music; asset preparation | [44f] | not yet |

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
* Source read through a path built at run time, such as `tests/unseen_gun_test.js` ( `'../src/' + f` ): once its module
  moves, it reads the adapter's one line. Move those reads with the module ([44d]: `gl_rmain`, [44e]: `r_powervision`).
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

## Checks for each move

* Both architecture tools pass (no unscanned module, no unexpected unresolved import, no unassigned module) and the
  cycles do not grow.
* The full suite against the recorded baseline.
* The room server's modules import under Node (`server/test_imports.js` and every module `server/game_server.js`
  imports), since Deno is not installed here.
* The page starts Newer Game and Classic in the browser with no error and no failed `src/` load, and the D7 pages load.
