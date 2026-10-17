# Shared data distribution plan — 17 October 2026

This replaces the “snapshot the existing per-game pack build” plan. The goal is now a
**shared, incrementally updated data set** used by both the Mac app and the HTML, with
the app caching it under `~/quaked/.data/`.

## 1. Goals

- Ship a new app and a new HTML per release.
- Only data files whose content changed get a new timestamped name; unchanged files
  keep the name already downloaded, so browsers and the app reuse them.
- The app and the HTML use the same data files, the same logical names and the same
  manifest.
- The app resolves data in this order:
  1. an explicit override (`QUAKED_DATA_DIR`, for development/tests);
  2. a `data/` directory beside `Quaked.app`;
  3. `~/quaked/.data/`;
  4. download into `~/quaked/.data/`.
- Add-ons and game PAKs stay in `~/quaked/<game>/`; `.data` is hidden from the game
  shelf scan (the existing scan already skips dot-directories).
- The published app does not ship the data; the ZIP contains `Quaked.app` only.

## 2. Hard constraint: the HTML cannot read the GitHub release

GitHub release asset downloads do not send `Access-Control-Allow-Origin`; this was
checked on 13 October 2026 (`docs/per-game-packs-design-2026-10-13.md`, lines 117–118).
A browser page therefore cannot fetch bytes from a release asset. The Mac app can,
because its downloader is Rust (`src-tauri/src/packs.rs`), not a browser fetch.

Consequence: the HTML needs the **same files mirrored somewhere with CORS**. The
existing GitHub Pages site already does this (`Access-Control-Allow-Origin: *` on the
tested path). The plan is:

- **Mac app:** downloads from the release `data` tag.
- **HTML:** downloads from GitHub Pages (or another CORS-enabled mirror).
- Both use the **same filenames, hashes and manifest**; CI uploads changed files to
  both places.
- Pages' 1 GB site limit is fine for the web subset (`core`, `shareware`, `pak0`,
  about 584 MB today). Full game data stays on the release and is app-only.
- If the HTML is later expected to carry every game, a CORS-enabled object host
  (Cloudflare R2/S3/CDN) is needed; GitHub Pages cannot hold it.

If “release-only for both” is non-negotiable, the HTML cannot fetch the data; the only
alternatives are embedding it again (the old ~1 GB monolith), a CORS proxy, or a
local server. This plan assumes a Pages mirror for the HTML.

## 3. Data units and names

### Recommended: per-game data packs, not category files

The current build groups assets into per-game packs (`core`, `shareware`, `quake`,
`hipnotic`, `rogue`, `dopa`, `mg1`, and catalogue add-ons). That is the right download
unit because:

- the app downloads only the packs for the game the player starts;
- shared assets live at the nearest common ancestor instead of being duplicated;
- a changed texture re-downloads one 32 MB part of one pack, not every texture.

A single `sounds-*.data`, `textures-*.data`, `models-*.data` set is simpler to picture
but much coarser: one changed sound invalidates the whole sounds file, and every player
downloads all sounds whether or not their game uses them. The manifest can still carry
a `category` field so the data can be browsed by sounds/textures/models without making
those categories the download unit.

If category files are still wanted, they should be **per game and per category**
(`hipnotic-textures-<ts>.data`), which is effectively the per-game pack design again.

### File names

Use a logical name plus a timestamp and a short content hash:

```
<group>-<YYMMDDHHMMSS>-<sha8>.data
```

Examples:

```
shareware-261017185400-1476aa98.data
hipnotic-261017185400-148632c6.data
core-261015090000-183a9344.data      # unchanged: old name kept
```

- A file gets a **new timestamp only when its SHA-256 changes**.
- Unchanged files keep their previous timestamp and name.
- The hash in the name is a quick integrity/cache identity; the full SHA-256 is in the
  manifest.
- `changes-<ts>.data` is not a data blob. The equivalent is a small `changes.json`
  (or `manifest.json`) listing new, changed and removed files versus the previous
  release. The app/HTML fetch only the changed files.

### Manifest

`manifest.json` (and a versioned copy if needed) contains:

```json
{
  "version": "0.131.138",
  "build": "20261017T185400Z",
  "dataVersion": "20261017T185400Z",
  "base": { "release": "https://github.com/.../releases/download/data/", "web": "https://codemeasandwich.github.io/Quaked/data/" },
  "files": [
    { "name": "core-...-....data", "group": "core", "category": "core", "bytes": 123, "sha256": "...", "parts": [...] }
  ],
  "packs": { "shareware": ["shareware-...data"], "hipnotic": ["hipnotic-...data"] },
  "changed": ["hipnotic-...data"]
}
```

The app and HTML embed this manifest (or a manifest URL and expected version) so they
know exactly which files their build needs. Embedding avoids an extra network request
and works offline; the same filenames are used by both.

## 4. Dist layout

The published artifacts stay separate; the local `dist` build folder mirrors the
intended side-by-side layout:

```text
dist/
  builds/
    20261017T185400Z/
      Quaked.app                  # canonical bundle name; version is in Info.plist
      index.html                  # the web HTML
      data/                       # shared data for app and HTML
        manifest.json
        changes.json
        core-...data
        shareware-...data
        ...
      release/
        Quaked_0.131.138_universal.zip
        mac-archive.json
  current -> builds/20261017T185400Z
  archive/                        # older builds, old model, receipts
```

- The `.app` and `index.html` are at the same level, with `data/` beside them.
- The app looks for `data/` beside `Quaked.app`; the HTML looks for `data/` beside
  `index.html` when served over http(s).
- The release ZIP contains `Quaked.app` (not a timestamped `.app`). The downloaded
  HTML is `index.html`. The data is downloaded on demand, not inside the ZIP.
- If an offline bundle is wanted, produce a separate `Quaked_<version>_offline.zip`
  containing `Quaked.app`, `index.html` and `data/`; it is a convenience artifact, not
  the standard download.

The build scripts currently write `dist/web`, `dist/desktop`, `dist/desktop-assets`,
`dist/packs` and `dist/release`. Add an assembly step (`tools/distribution/assemble.mjs`)
that produces `builds/<build-id>/` from those outputs and updates `current`. Keeping
the canonical paths means CI and the existing tests continue to work while the new
layout is introduced.

## 5. App runtime resolution

In `src-tauri/src/main.rs` / `packs.rs`:

1. `QUAKED_DATA_DIR` if set and valid (tests/dev).
2. **Portable/same-directory data:** `<directory containing Quaked.app>/data/`.
   - Resolve from the app bundle path, not the process working directory (Finder sets
     cwd to `/`).
   - On macOS, a quarantined/translocated app may run from
     `/private/var/folders/.../AppTranslocation/...`; treat that as “no same-directory
     data” and continue to the cache, or resolve the original path with
     `SecTranslocateCreateOriginalPathForURL`. Do not rely on the translocation path.
   - Validate `manifest.json` and required files. If the same-directory data is older
     than the app's required `dataVersion`, use it only for files that verify and are
     compatible; otherwise fall through to the cache.
   - Read-only: never write into the folder beside the app.
3. `~/quaked/.data/` (default). `~/quaked` is the default game root; `.data` is hidden
   and ignored by `library::scan` (it already skips names starting with `.`).
4. Download missing/changed files from the release `data` base into
   `~/quaked/.data/`:
   - write to a temp file, verify SHA-256/size, then rename;
   - atomic per file, one download at a time;
   - progress events as today;
   - on failure, keep the old verified files and report a clear offline error.

After resolution, register the chosen data directory with Tauri's asset protocol scope
(read-only) so the frontend can read it. The existing `packs_ensure` root changes from
`app_data_dir()/packs` to `~/quaked/.data` (or the chosen dir).

The data files remain in `~/quaked/.data/` as downloaded; the app unpacks the needed
assets into a scoped cache (current behaviour) or reads offsets directly. Keeping the
`.data` files is what lets the HTML and app share the same names and lets a later
release reuse unchanged files.

### Migration

- Existing downloads live in `app_data_dir()/packs`; on first run, detect and copy
  verified assets to `~/quaked/.data/` (or keep the old folder as a legacy fallback).
- Do not delete the old cache until the new cache verifies and the app restarts.
- The game shelf and add-ons in `~/quaked/*` are untouched; `.data` is not a game.

## 6. HTML runtime resolution

1. `data/` beside `index.html` when served over `http(s)` (local server, Pages, or a
   shared folder).
2. Otherwise fetch from the Pages `data/` base (CORS-enabled), with the manifest's
   filenames and integrity hashes.
3. Cache in the browser: unchanged names stay in the HTTP cache and, where useful, in
   Cache Storage/IndexedDB; only changed names are fetched.
4. The HTML cannot read `~/quaked/.data`; that is a browser sandbox boundary. “Shared”
   means the same files/manifest, not the same local folder. The app can serve a local
   folder to its own webview; a standalone HTML in a browser cannot.

The current bootstrap already fetches page-relative data over http and `dataBase` over
file; it needs to learn the manifest, the changed-only set, and the cache storage. The
CORS requirement is the same as today: Pages/mirror, not release assets.

## 7. Build and release pipeline

1. Build the engine HTML, desktop frontend, app and data groups.
2. Compare each data group's hash with the previous published manifest:
   - unchanged: keep the old filename and timestamp;
   - changed/new: assign the build timestamp and a short hash.
3. Write `manifest.json` and `changes.json`; keep the full hashes/sizes.
4. Assemble `dist/builds/<build-id>/` with `Quaked.app`, `index.html`, `data/`, and the
   release ZIP.
5. Publish:
   - app ZIP to Releases;
   - changed data files + manifest to the `data` release (upload only missing/changed
     files; verify after upload; write a receipt);
   - HTML + web-subset data + manifest to Pages (CORS), also only changed files.
6. Keep old data files on both hosts for at least one release so older app/HTML
   versions can still fetch their embedded manifest. Clean up old files only after the
   compatibility window, and never delete a file still referenced by a supported
   version.
7. `archive-mac.mjs` verifies the app, manifest and packaged core; the receipt records
   the data build ID and hashes.

## 8. Compatibility and rollback

- Each app/HTML embeds its manifest; an older build keeps working against the old files
  as long as they remain hosted.
- A failed update keeps the previous verified files; the app can run offline.
- `changes.json` allows a future “update data only” path without a new app.
- Old per-game pack cache and the old content-hash web build remain readable during
  migration; do not remove them until the new path is verified.

## 9. Tests

- Build: changed-only naming is stable across a no-op rebuild; a changed group gets
  exactly one new timestamp; manifest/changes/hashes match the files.
- App: same-directory data wins; missing/incompatible same-directory data falls back;
  `~/quaked/.data` is used and written; download/verify/atomic rename; old cache
  migration; `.data` is ignored by the game shelf.
- HTML: served with data beside it; opened from disk with Pages fallback; changed-only
  fetch; unchanged files come from cache; CORS headers; offline error.
- macOS: app in a folder with `data/`, app in `/Applications` with no data, translocated
  downloaded app, Gatekeeper first launch.
- CI: upload only changed files, verify the release receipt, publish the Pages mirror,
  and run the app/HTML trials against the new manifest.

## 10. Phases

1. **Manifest + naming + assembly** — new data filenames, manifest/changes, build
   assembly, no runtime change; verify with a local folder.
2. **App resolver** — `QUAKED_DATA_DIR`, same-directory check (with translocation
   handling), `~/quaked/.data`, download/verify, migration, Tauri scope.
3. **HTML resolver** — manifest, page-relative data, Pages fallback, browser cache,
   CORS.
4. **Release/CI** — changed-only upload to the data release and Pages, receipt,
   archive verification.
5. **Tests/docs/cleanup** — trials, migration notes, old-file retention policy, dist
   tidy-up.

## 11. Decisions needed

1. **Data units:** per-game packs (recommended) or category files
   (`sounds`/`textures`/`models`)? Category files are coarser and lose per-game lazy
   download.
2. **HTML data host:** GitHub Pages mirror (recommended; CORS works) or another
   CORS-enabled host. Release-only will not work in a browser.
3. **Same-directory precedence:** require a compatible manifest, or always trust the
   folder and fall back only when a file is missing/corrupt?
4. **Cache location:** always `~/quaked/.data`, or `<selected game root>/.data` when the
   owner changes the game location?
5. **Timestamp format:** `YYMMDDHHMMSS` (compact) or `20261017T185400Z` (sortable UTC).
6. **Offline bundle:** produce an optional app + HTML + data ZIP, or keep the standard
   ZIP app-only?
7. **Retention:** how many old data versions stay on the release/Pages before cleanup?

## 12. Decisions and implementation status, 17 October

- **HTML host:** locked to GitHub Pages. The Pages artifact is `index.html` plus its
  data files; the upload already includes `dist/web/data/`.
- **Part size:** 8 MB, content-named, with `priority` and `topic` metadata. Priority 0
  is needed to open the first level, 1 for actors and weapons, 2 for background.
- **HTML scope:** shareware only. The web build contains exactly `core`, `shareware`
  and `pak0`; it never contains `quake`, `hipnotic`, `rogue`, `dopa`, `mg1` or the
  add-on packs.
- **App scope:** the selected game's pack chain:
  - `shareware` → `core`, `shareware`
  - `quake` → `core`, `shareware`, `quake`
  - `hipnotic` → `core`, `shareware`, `quake`, `hipnotic`
  - `rogue`, `dopa`, `mg1` likewise add their own pack after `quake`.
  The app never asks for a sibling's pack. `PacksFor` in `tools/distribution/packs.mjs`
  is the single source of that rule, and `tests/packs_contract_test.mjs` asserts it.
- **Dist layout:** `builds/<id>/Quaked.app`, `index.html`, `data/` (HTML's
  shareware-only parts), `app-data/` (all app packs; the app reads only the selected
  game's parts), and `release/`. `dist/current` points at the newest build.
- **App resolution:** `QUAKED_DATA_DIR` → `app-data/` beside `Quaked.app` →
  `~/quaked/.data/` → download into `~/quaked/.data/`. Parts stay in
  `~/quaked/.data/parts/`; verified assets are unpacked to `~/quaked/.data/assets/`.
- **HTML resolution:** `data/` beside `index.html` → Pages `dataBase`; required parts
  first, then the remaining parts in the background.
- **Verified so far:** 8 MB prioritized parts for web (75 parts) and desktop
  (177 parts); web starts after priority ≤ 1 in about 1.7 s in Chromium, then fills
  background parts; Rust tests cover source/cache reads, retained parts, priority
  order and the `~/quaked/.data` cache; distribution contracts pass 58/58; the modular
  app builds (439 MiB) and archives (422 MiB).
- **Status:** committed on the local feature branch `data-priority-20261017`;
  not merged or pushed. Remaining: run the full pre-commit gate, merge to Dev,
  publish changed parts to the data release and Pages, and update the release
  workflow's changed-part upload/receipt for the new 8 MB parts.
