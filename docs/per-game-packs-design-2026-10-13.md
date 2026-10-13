# Per-game data packs: design

Owner rulings, 13 October 2026: split the high-resolution data by game, expansion or mod
("shareware ... the rest of the full game ... the Dissolution expansion ... Armagon ..."),
so the HTML pulls only the shareware pack and the Tauri app downloads the packs that match
the games the user actually has, "trading having a standalone file that contains everything
for a more modular lazy loading approach". The app's packs are GitHub Release assets; while a
game's pack is not yet downloaded the app **waits on a progress screen**, then starts in
Newer Game. This document is the plan; it changes as it is built.

## Packs

Every shipped Newer asset belongs to exactly one pack:

- `core`: everything not tied to one game's levels or models: menus, HUD, UI, bestiary,
  weapons, effects, music, credits, `startup.pak`. The HTML embeds or ships it; the app
  bundles it, so menus and the shelf work before any download.
- `shareware`: Episode 1 and the hub: their prepared level data (normals, rock, sculpted
  surfaces), the textures they use and the skins of the shareware monsters.
- `quake`: the rest of the full game, excluding anything already in `shareware`.
- `hipnotic` (Scourge of Armagon), `rogue` (Dissolution of Eternity), `dopa`, `mg1`, and one
  pack per supported add-on that has Newer data: what each needs beyond its base game.

Pack names are the game catalogue's IDs (`src/engine/common/game_catalogue.js`). A game
needs its own pack and its ancestors' (`shareware` < `quake` < each mission pack, episode or
add-on). An asset used by several games goes to their nearest common ancestor, so nothing is
duplicated and no game needs a sibling's pack: one used by Scourge of Armagon and
Dissolution of Eternity goes to `quake`. Normals and prepared levels are classified by their
manifest namespace; skins and textures by a committed index of which games' models and BSPs
use each name (`newer/packs/games.json`, written by a tool run against the owned PAKs, as the
repository's other baked manifests are), because CI has no owned game data.

## Files, hosting and integrity

A pack is its category data in content-named parts of at most 32 MB, exactly as the web
data files are now (`data/<pack>-<sha prefix>.bin`), with a per-part SHA-256. The web site
keeps serving `core` and `shareware` beside `index.html` on GitHub Pages. The app's packs
are assets of a GitHub release (`data-<date>`), never deleted, so every app version keeps
working; parts that do not change keep their names and are not re-uploaded. Each app build
embeds the list of packs, parts, sizes, hashes and release URLs it expects.

## In the app

- After the shelf selects a game, the app checks its packs in the app data folder
  (`~/Library/Application Support/Quaked/packs/<part sha>.bin`).
- Missing parts are downloaded natively (Rust, so no browser cross-origin limits), verified
  by SHA-256, written atomically, with a progress screen; the game starts in Newer Game when
  all are present. A failed or interrupted download says so, keeps verified parts and can be
  retried; nothing unverified is ever used.
- Stored parts are reused offline. Parts no longer named by the app are cleaned up later.
- The app bundle shrinks to the engine plus `core`.

## Checks

Contract tests: every shipped asset is in exactly one pack; a game's packs plus its bases
cover every asset its levels and models need; no duplicates. Browser and native trials:
the HTML with `core` + `shareware`; the app with a game whose pack must be downloaded (from
a local stand-in for the release host), verified, cached and reused offline, including an
interrupted and a corrupted part.

## Order

1. Classifier and contract tests; pack sizes measured.
2. Web: `core` + `shareware` packs (same files the HTML already loads).
3. Release workflow: build and upload packs as release assets when they change.
4. App: pack list in the build, native download/verify/cache, wait screen; bundle shrinks.
5. Trials, docs, independent review, owner trial.
