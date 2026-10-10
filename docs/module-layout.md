# Source layout: where each module lives

Cards [44b] to [44f]. `src/` is being sorted from one flat folder into the folders the
[architecture baseline](architecture-baseline-2026-10-10.md) proposes, one increment at a time. This page says what has
moved, how a move is made, and what stays behind for code not yet updated.

## The folders

| Folder | What it holds | Increment | Moved |
|---|---|---|---|
| `src/engine/common` | The original engine's shared core: commands, cvars, files and paks, memory, maths, console, protocol | [44b] | yes |
| `src/engine/progs` | The QuakeC virtual machine and its built-ins | [44b] | yes |
| `src/engine/server` | Host, server, world, physics, player movement | [44b] | yes |
| `src/newer/gameplay` | Newer Game's server-side rules and the records they save | [44b] | yes |
| `src/engine/net`, `src/engine/client`, `src/engine/sound`, `src/platform` | Networking, the client, sound, browser input, touch and WebXR | [44c] | not yet |
| `src/engine/render`, `src/newer/render` (models and animation) | The GL renderer port; poses, skins, held weapons, bodies, level windows | [44d] | not yet |
| `src/newer/render` (the rest), `src/newer/assets` (prepared data) | Effects, materials, post-processing, portals, vision; bakes and their formats | [44e] | not yet |
| `src/newer/ui`, `src/newer/sound`, `src/newer/assets` (preparation) | Menu, loading, HUD, Bestiary; ambient music; asset preparation | [44f] | not yet |

Every module's folder is decided by `tools/architecture_classify.mjs` (by its name, so a module already moved is placed
the same). Each moved module starts with a `@module` JSDoc block: what it is, what state it owns and for how long, and
how it fails.

## How a move is made

```sh
node tools/move_modules.mjs 44b --dry   # what would move, and how many paths in which files would be rewritten
node tools/move_modules.mjs 44b         # do it (refuses if any file it would touch has uncommitted changes)
```

`tools/move_modules.mjs` moves every module the classifier gives that increment, with `git mv`, and:

* rewrites every literal path that resolves to a moved module, wherever it is: imports, re-exports, dynamic imports
  (with or without a query string), `new URL( …, import.meta.url )`, import map entries (`/src/…`), source reads, and
  `src/…` paths in tools, Python and the JSON records keyed by them;
* recomputes a moved module's own relative paths from its new folder;
* rewrites a literal only when it resolves to a file or folder that exists, so other strings are left alone;
* leaves a one-line adapter at each old path:

  ```js
  // Moved to src/engine/common/cmd.js (card [44b]); kept for paths built at run time.
  export * from './engine/common/cmd.js';
  ```

  An adapter re-exports the live bindings of the one module instance, so nothing loads twice. It is there for paths
  built at run time (`import( '../src/' + name + '.js' )` in a few trials), which no tool can rewrite. Adapters are
  deleted in [44g], once the graph shows no consumer.

Prose that mentions a path (a provenance note, the docs) is not rewritten by the tool; [44b] updated
`newer/effects/shotgun/provenance.json` by hand, and the docs that cite `src/` paths are one pass in [44g].

## [44b]: what moved

50 modules: 14 into `engine/common`, 6 into `engine/progs`, 9 into `engine/server`, 21 into `newer/gameplay`.

* 1,738 literal paths in 347 files were rewritten (main.js, the server, src, tests, tools and trial pages).
* `tools/check_distribution_policy.py` now reads `src/` recursively (it read only `src/*.js`).
* Debt D7 is closed: the three trial pages with `<base href="../">` import `./src/…` and `./main.js`, which resolve
  against their base under any sub-path; the graph tool no longer exempts them.
* The module graph is unchanged: both architecture tools pass; 206 modules (and 50 adapters); the same cycles (83, 4, 2,
  2; the engine's own 41); the room server and the page load the same modules (198 and 202, as before with the face
  overlays).

## Checks for each move

* Both architecture tools pass (no unscanned module, no unexpected unresolved import, no unassigned module) and the
  cycles do not grow.
* The full suite against the recorded baseline.
* The room server's modules import under Node (`server/test_imports.js` and every module `server/game_server.js`
  imports), since Deno is not installed here.
* The page starts Newer Game and Classic in the browser with no error and no failed `src/` load, and the D7 pages load.
