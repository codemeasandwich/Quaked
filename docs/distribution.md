# Quaked distribution and native launcher

Two profiles share the existing engine. The web profile is one offline HTML file,
with the normal shareware attract demo, Classic and Newer Game. The Tauri 2 profile
opens the existing game shelf and reads the user's installed games. It needs neither
Deno nor a separately installed server for single-player or native LAN hosting.

## Opening the Mac application

Download `Quaked_<version>_universal.zip` from Releases and double-click the ZIP
to extract **Quaked.app**. Double-click that app to launch it, or drag it into
**Applications** first if you want to keep it there. Finder shows the self-contained
app bundle as one item. No installer, DMG, Deno installation or separate server is
required. The ZIP is just the download container; it is not used when playing.

## Game files

The default game location is **`~/quaked`**: the `quaked` directory inside the home
directory of whichever user launches the app. It is resolved using Tauri's home
directory API and created only if absent. No developer username is compiled in.

Put your own game files in these subdirectories. Standard Quake directory names
are also accepted, case-insensitively:

| Shelf entry | Folder | Standard alias |
| --- | --- | --- |
| Quake | `Quake` | `id1` |
| Scourge of Armagon | `Scourge of Armagon` | `hipnotic` |
| Dissolution of Eternity | `Dissolution of Eternity` | `rogue` |
| Dimension of the Past | `Dimension of the Past` | `dopa` |
| Dimension of the Machine | `Dimension of the Machine` | `mg1` |
| Shareware, if supplied by the user | `shareware` | — |
| Other predefined add-ons | Existing shelf names | `ad`, `quoth`, `malice`, `xmen`, `aopfm_v2` |

Use **Select Game Locations** in the native application menu, shelf, or game Options
to choose a different root. Settings are saved in the app configuration directory;
PAKs stay in place. Location changes restart the app to clear the previous file
permissions and game state. Cancellation leaves the previous setting intact.

The shelf always appears, including with no games installed. An entry needs valid
PAKs, its base game where applicable, and existing engine support before Play is
enabled. Discovery does not make unsupported mods playable. A corrupt, changed or
missing game returns to the shelf with a reason. Saves and settings retain the
existing per-game namespaces.

`src/platform/desktop.js` opens the shelf through the engine's `GameShelf_Show`
hook (`src/engine/common/hooks.js`), which `src/newer/install.js` fills before
`main.js` loads the desktop module; platform code never imports `src/newer`
directly (`tests/hooks_test.js`).

The first release targets macOS 14+ and uses an ad-hoc signature for executable
integrity, without a Developer ID signature or Apple notarization. A downloaded
app can require approval: attempt to open it, then use **System Settings >
Privacy & Security > Open Anyway**, authenticate, and confirm **Open**. This applies
only to a download you trust. Do not describe the local trial as a
Gatekeeper-qualified download until the actual released ZIP has been downloaded,
extracted and opened through this procedure. See [Apple’s opening instructions](https://support.apple.com/en-us/102445).

## LAN multiplayer

Select the same game on both Macs. Open **LAN Multiplayer** from Quaked's native
menu or the game's Multiplayer menu. On the host, choose a map and Cooperative or
Deathmatch, then **Host LAN Game**. On the other Mac, enter the host's LAN IPv4
address with port `26000`, for example `192.168.1.10:26000`, then **Join LAN Game**.
The first version supports the host plus three remote players. Approve the normal
macOS local-network/firewall prompt if one appears. No public lobby, router port
forwarding or automatic LAN discovery is part of this increment.

Both peers must have identical ordered native PAK contents and the same bundled
engine. A hash handshake rejects mismatches before Quake receives a join. No PAKs
are sent across the network. A bounded, length-framed TCP channel carries the
existing Window driver's messages; the existing native Quake server, signon,
movement, damage and packet parsing remain authoritative. Unreliable message runs
retain their existing coalescing behavior. Leave LAN, return to single-player,
change game/location or close the app to end the relevant connection.

## Build inputs and commands

Install Node 24 and run `npm ci --ignore-scripts`. Mac builds additionally need
Xcode command-line tools, Rust and both `aarch64-apple-darwin` and
`x86_64-apple-darwin` targets. Dependencies are pinned in the npm and Cargo locks.

```sh
npm run build:web
npm run build:desktop
CARGO_TARGET_DIR="$HOME/build/quaked-distribution" npm run build:mac
npm run hooks:install
```

The web build downloads a pinned, public historical copy of the original 1.06
shareware PAK into `.distribution-cache/`, verifying SHA-256
`35a9c55e5e5a284a159ad2a62e0e8def23d829561fe2f54eb402dbc0a9a946af` before use.
An existing verified input can be supplied through `QUAKED_SHAREWARE_PAK`.
The original tracked shareware location remains a supported build input when it
exists. The native application inventory excludes all original game PAKs.

Outputs are `dist/web/index.html`, native frontend files under `dist/desktop`,
and native packaged resources under `dist/desktop-assets`. Tauri places
`Quaked.app` beneath its target's `universal-apple-darwin/release/bundle/macos`
directory. It builds no installer or DMG. For a download archive, run
`node tools/distribution/archive-mac.mjs` with the same `CARGO_TARGET_DIR`; this
verifies the universal app signature and both architectures, creates a ZIP with
macOS metadata using `ditto`, checks archive integrity and records its SHA-256.
For a hook-built app, set `QUAKED_NATIVE_INVENTORY=dist/staged/desktop/inventory.json`
to use the exact staged asset inventory. Resource assets live
inside the self-contained `.app`, avoiding gigabytes of Rust-generated static
arrays. They are accessed through Tauri's resource-only asset scope; game PAK
access is granted only for discovered files beneath the selected root.

For source development with an external game library:

```sh
python3 tools/serve.py 8000 --game-root "$HOME/quaked"
```

This loopback-only server maps `/games/` to the chosen root and retains bounded
byte-range responses. It does not copy data or expose a remote multiplayer server.
The source profile still uses its existing CDN import map; distributed profiles
bundle Three.js and need no CDN.

## Packaging contracts

The manifest uses canonical prepared-map inventories, shareware/hub normal keys,
matching custom enemy variants and currently unassigned canonical normal samples.
Bestiary pages remain included because the existing journal can remember entries
across games. Development sources, candidate art and owned archives are excluded.
Asset bytes and bake identities are preserved; compression does not reduce visual
quality. The HTML decodes assets lazily to Blob URLs, and the packaged resolver is
installed before any engine module runs. Source-relative workers and asset URLs
are resolved at build time. No global fetch interception is installed.

The HTML also plays its bundled shareware levels opened as a local file. A
`file://` page has an opaque origin, so the origin-private file system that
stores first-use generated normals is refused (`SecurityError`). Normals with no
shipped bake (the Episode 1 crate variants, for example) are then generated for
that session only: the job reports `source: 'generated'` and
`persistence: 'unavailable: <reason>'` (`src/newer/assets/normal_prepare.js`),
counts as runtime generation, and the readiness gate prints it as an
`Enhanced intro fallback` note. Only a `SecurityError` or a missing storage API
counts; a transient failure still goes through the store's retry. Rock relief
and sculpted surfaces use the same store without this fallback; the web build's
shareware levels have shipped bakes for both, so they are unaffected, but a
level without them would still hold on `file://`. Keeping generated normals
across restarts for a local file would need another store (IndexedDB is
available there); that is an open owner choice. Before this, the job ended in error, the
Newer level's readiness gate never settled, and the level stayed on the LOADING
plaque with game time frozen (found 12 October 2026 in CI run 38296015129 and a
local 180 s probe; over http the same build released after about 14 s). Over
https the normals are still stored and reused as before.

The current enhanced HTML is close to one GiB. Build receipts report actual byte
counts; a build at or above the Pages site limit fails rather than discarding
features. Browser heap measurements describe observed JavaScript heap, not total
GPU/process memory. `inventory.json` records per-asset SHA-256 and the engine
bundle metadata; a staged build additionally records its exact Git tree identity.

## Hook, CI and release

The tracked hook snapshots the Git index into a temporary directory. Unstaged and
untracked files are not substituted. It runs independent distribution tests and
builds HTML everywhere; on macOS it also builds native assets, runs Rust tests and
builds the universal application. Failures block the commit and retain the failed
snapshot for diagnosis. Successful generated artifacts remain outside the index.
Only the index snapshot reads Git's hook environment; every build and test in
the snapshot runs without `GIT_*` variables (`withoutGitEnvironment`). From a
linked worktree Git exports an absolute `GIT_DIR`, and on 12 October 2026 the
contract test's fixture `git init` re-initialised the real repository through it
and set `core.bare=true` (restored by hand; now covered by
`tests/staged_contract_test.mjs`).
Dependency caches and Cargo's normal incremental cache are reused. Existing custom
hook configurations are never overwritten automatically.

GitHub Actions runs the web checks and browser trial on an Apple Silicon Mac
runner, and native builds on both Apple Silicon and Intel Mac runners.
Successful `Dev` pushes deploy only the generated HTML to Pages.
Tags matching `package.json`'s `v<version>` publish the universal app in a ZIP with checksums and release notes.
Configure GitHub Pages to use Actions. Artifact generation, owner acceptance,
commit/landing and actual publication are separate evidence states.

## Verification and continuing work

Maintained checks are `npm run test:distribution`, native Cargo tests, the existing
catalogue/selection/window-driver suites, and `tools/distribution/browser-trial.mjs`.
The browser trial uses an isolated profile and refuses network dependencies. Native
tests cover aliases, scope escape, corrupt/changed packs, framing up to 65,536-byte
engine payloads, mismatched peers, isolation, disconnection and rehosting.

Initial failures are retained as findings: missing RGBA app icon; native dynamic
styles blocked by generated CSP style hashes; accepted sockets inheriting Darwin's
nonblocking flag; and incomplete web normal/catalogue routing. Fixes preserve the
authored style policy and script CSP, use the original project icon, explicitly set
accepted sockets to blocking mode, and test the corrected public contracts.

The owner accepted the native shelf and external-shareware demo trial on 12 October
2026. Two physical Macs, downloaded-ZIP Gatekeeper behavior, all game campaigns and
publication still require their own evidence; loopback framing tests do not prove
those outcomes. Current task: Bluey `T-91ae6d7d`.

The initial [distribution CI run](https://github.com/codemeasandwich/Quaked/actions/runs/38240397203)
passed both Mac runner jobs, but its Linux browser startup timed out, so Pages did
not deploy. The browser trial records startup phases, engine state, graphics
backend and failure screenshots. Linux has only software WebGL (SwiftShader); a
local profile of the source game under SwiftShader showed the main thread blocked
62 s in shader linking and 46 s in one `getImageData` readback
(`Draw_CachePicFromPNG`). That function now asks for a CPU-backed scratch canvas
(`willReadFrequently`) when it reads pixels back; the canvases it draws and
returns are unchanged. Opaque pixels are identical; semi-transparent ones may
differ by rounding between Chrome's CPU and GPU canvas paths.

Shader compilation stays slow on any software renderer, so the web job now runs
on a `macos-15` runner with its preinstalled Google Chrome. The trial's timeouts
and gameplay assertions are unchanged; the trial step stops after 30 minutes and
the job after 60. Whether that runner gives headless Chrome hardware WebGL, and
whether the trial passes there, is unproven until a run's receipt records
`webglRenderer`, `softwareWebGL: false` and `ok: true`. The
receipt (`web-evidence` artifact, `dist/browser-trial.json`) records:

- `webglRenderer` and `softwareWebGL`: the WebGL renderer the runner provided
  (`gpu` is Chrome's GPU-process information, not the WebGL renderer);
- `browserMemory` and each sample's `browserRss`: summed per-process RSS of
  Chrome's process tree, sampled every 20 s (shared pages count once per process,
  so it overstates; processes launchd starts are not included). JavaScript heap
  figures exclude the HTML text, GPU process and blob storage;
- `targetSha256`: the tested file's digest, taken before the browser starts.

Each gameplay scenario first waits until the level it replaces is gone (two
scenarios load e1m1), then until game time reaches 3 s (a new level starts near
1 s, so about 2 s of play), then requires at least 1 s more game time over a 5 s
settle. Being signed on is not proof of play: a Newer level's welcome hold keeps
time frozen behind the loading plaque. Run 38296015129 passed the older
signed-on check while Newer levels were still held.

On a `Dev` push only, the web job checks the file still matches `targetSha256`,
uploads it as the one-day `web-html` artifact and exports its sha256. Re-running
only the `pages` job works within that day; later, re-run all jobs. The `pages` job downloads
it, refuses to continue unless the digest matches, then deploys it. Pages
deploys only when the web job and both Mac jobs pass; a failed or skipped run
leaves the previous site in place. The `github-pages` environment allows the
`Dev` branch (checked 12 October 2026).
