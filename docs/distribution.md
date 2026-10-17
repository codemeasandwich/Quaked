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

The current enhanced HTML is close to one GiB. Build receipts report actual byte
counts; a build at or above the build ceiling fails rather than discarding
features. The ceiling was raised to 2 GB by owner decision, so the web profile is
now larger than GitHub Pages' hard published-site cap of 1 GB: the web build
succeeds and the Pages deployment fails instead. Hosting the web profile is
therefore an owner decision, and the Mac app is unaffected.
Browser heap measurements describe observed JavaScript heap, not total
GPU/process memory. `inventory.json` records per-asset SHA-256 and the engine
bundle metadata; a staged build additionally records its exact Git tree identity.

## Hook, CI and release

The tracked hook snapshots the Git index into a temporary directory. Unstaged and
untracked files are not substituted. It runs independent distribution tests and
builds HTML everywhere; on macOS it also builds native assets, runs Rust tests and
builds the universal application. Failures block the commit and retain the failed
snapshot for diagnosis. Successful generated artifacts remain outside the index.
Dependency caches and Cargo's normal incremental cache are reused. Existing custom
hook configurations are never overwritten automatically.

GitHub Actions runs web checks and native builds on both Apple Silicon and Intel
Mac runners. Successful `Dev` pushes deploy only the generated HTML to Pages.
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
not deploy. The browser trial now records startup phases, engine state, graphics
backend and failure screenshots. Linux CI explicitly selects software WebGL while
retaining every gameplay assertion and timeout. This diagnostic change is not
evidence that the original failure is resolved; the succeeding run must prove it.
