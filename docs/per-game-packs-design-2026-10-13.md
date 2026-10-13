# Per-game data packs

Owner rulings, 13 October 2026: split the high-resolution data by game, expansion or mod
("shareware ... the rest of the full game ... the Dissolution expansion ... Armagon ..."),
so the HTML pulls only the shareware pack and the Tauri app downloads the packs that match
the games the user actually has, "trading having a standalone file that contains everything
for a more modular lazy loading approach". The app's packs are GitHub Release assets; while a
game's pack is not yet downloaded the app **waits on a progress screen**, then starts in
Newer Game.

Status, 13 October 2026: classification and the web build are built, tested and trialled in
a browser. The app's download/verify/unpack step has Rust tests; it and its wait screen were
trialled in the real app against a local stand-in host (Checks, below). The release workflow
that uploads the packs is not yet written, and the first `data` release is created only with
the owner's go-ahead. A desktop build downloads its packs only when the build names their
host (`QUAKED_PACK_BASE`: the release, once it exists, or a local stand-in for trials);
without one it bundles every pack as before, so CI-built apps keep working until the release
is published, and `archive-mac.mjs` refuses to archive an app that downloads. Both kinds of
app now load images from the asset protocol in CORS mode ([distribution.md](distribution.md)).

## Packs

Every shipped Newer asset belongs to exactly one pack (`PackClassifier`,
`tools/distribution/packs.mjs`):

- `core`: everything not tied to one game's levels or models: menus, HUD, UI, bestiary,
  weapons, effects, music, credits, `startup.pak`, `maps.pak`, normal samples no level or
  skin names. The HTML ships it; the app bundles it, so menus and the shelf work before any
  download.
- `shareware`: Episode 1 and the hub: their prepared level data (normals, rock, sculpted
  surfaces), the textures their BSPs name and the skins of the monsters their models have.
- `quake`: the rest of the full game, excluding anything already in `shareware`.
- `hipnotic` (Scourge of Armagon), `rogue` (Dissolution of Eternity), `dopa`, `mg1`, and one
  pack per catalogue add-on that has Newer data (`ad`, `quoth`, `malice`, `xmen`,
  `aopfm_v2`): what each needs beyond its base game.

Pack names are the game catalogue's IDs (`src/engine/common/game_catalogue.js`); a pack's
parent is its game's `base` (`quake` when it has none), `quake`'s is `shareware` and
`shareware`'s is `core`. An unknown ID is refused. A game needs its own pack and its
ancestors' (`PacksFor`). An asset used by several games goes to their nearest common ancestor
(`CommonAncestor`), so nothing is duplicated and no game needs a sibling's pack: one used by
both mission packs goes to `quake`.

Classification follows what the runtime matches, from data committed in the repository
(CI has no owned game data):

- Prepared level data (displacement, rockfield) is picked at run time by the BSP's SHA-256,
  so each row belongs to every game whose PAKs provide a BSP with that hash, as well as to the
  game its manifest namespace names (`shareware` and `newer` are the shareware, which covers
  the rebuilt hub in `newer/maps.pak`; `id1`, `quake` and the bundled loose maps the full
  game). A row whose namespace is unknown is refused.
- Normal samples are picked at run time by a key computed from the texture's pixels
  (`NormalInputKey`, `NORMAL_BAKES`), not by level. The normals manifest records which keys
  each baked level produced, and a sample goes to the games of those levels (by BSP and
  namespace, as above). A game whose levels were not baked can compute a key whose sample is
  in another game's pack; the sample is then unavailable in that copy, and the normal is
  generated on the computer instead (`src/newer/assets/normal_prepare.js`), as for any texture
  with no shipped sample.
- Textures (pictures, crafted normals, glass) belong to the games whose BSPs name them.
- A skin variant belongs to the games whose model it can bind to (the exact model file when
  the variant is bound by `nativeModelSha256`); native heights to the games with the model.
- Skin normals (`custom:<variant>` levels) follow their variant.

The games, BSPs, texture names and model files come from `newer/packs/games.json`, written by
`node tools/distribution/build_game_index.mjs [~/quaked]` against the owner's library, as the
repository's other baked manifests are. It records each game's PAK count and every BSP's
SHA-256 (all `.bsp` members, PAKs read in Quake's order with later ones overriding), and
the SHA-256 of the texture and model name lists it was built from; it refuses to run when a
playable catalogue game has no PAKs. Re-run it whenever the texture or enemy index changes:
`tests/packs_contract_test.mjs` fails on a stale index.

Known limit: the add-ons (`ad`, `quoth`, `malice`, `xmen`, `aopfm_v2`) cannot be chosen yet
(`GAME_SELECTION_CHOICES`), and their levels have no baked normals, so their packs hold only
textures and skins. When their levels are baked, the BSP rule above classifies the new rows.

Sizes, 13 October 2026 (source bytes, desktop profile): core 366.6 MB, shareware 312.4,
quake 294.0, hipnotic 328.6, rogue 183.4, mg1 148.9, ad 43.5, dopa 35.9, xmen 2.1,
aopfm_v2 1.5, malice 1.3, quoth 1.1. The web build ships core (with its bestiary
re-encoded, about 191 MB), shareware (312 MB) and the shareware PAK (`pak0`).

Owner decisions to raise:
- the bestiary pages, weapons and HUD of the mission packs are in `core` (the journal can
  remember entries across games, and the HUD and weapons are not classified by game), so the
  HTML and the app carry them for every player;
- a first launch offline, or behind a proxy the app cannot pass (it uses its own TLS roots and
  no proxy settings), cannot start a game whose packs are missing, not even in Classic mode,
  and a slow download has no cancel button (only a 60 s stall timeout). Offering Classic play
  when the download fails is a small change if wanted.

## Files and hosting

A pack is its assets concatenated in path order, cut into content-named parts of at most
32 MB (`<pack>-<first 16 hex of the part's SHA-256>.bin`), each listed with its size and
SHA-256. A part before a changed asset keeps its name.

- Web: `core`, `shareware` and `pak0` are the data files beside `index.html` on GitHub Pages
  (`data/<pack>-<sha prefix>.bin`; see [distribution.md](distribution.md)). The HTML plays
  only the shareware (`GameSelection`), so other games' assets are not part of the web build.
  The page still knows their names (`unshipped`) and reports them unavailable: `has()` is
  false and their URL fails like a network error, so a stray request is a missing asset, never
  a packaging error. Pages' 1 GB site limit rules out serving the other packs there, and
  GitHub release downloads do not allow cross-origin reads (checked 13 October 2026: neither
  the github.com redirect nor the storage host sends `Access-Control-Allow-Origin`). The web
  build's file list (`collectAssets`) also leaves out 24 files the classifier puts in
  `shareware` (`id1`-namespaced relief for pickup models, matched by BSPs in the shareware
  PAK), as it did before packs.
- App: `core` is bundled (`dist/desktop-assets`); every other pack is written to
  `dist/packs/` (1.35 GB in 48 parts, 13 October 2026) for upload as assets of one GitHub
  release tagged `data`, given to the build as `QUAKED_PACK_BASE`
  (https://github.com/codemeasandwich/Quaked/releases/download/data/). Parts are named by their
  content, so a later upload adds new parts beside the old ones and never replaces one (an
  existing name must be skipped, since GitHub refuses a second asset of the same name); old
  parts stay so earlier app versions keep working. GitHub limits a release's asset count
  (about 1,000, to be confirmed), so at about 48 parts per full change a later `data-2`
  release will be needed. The app embeds the list of packs, parts, sizes, hashes and each
  asset's offset, length and SHA-256. The build checks each downloadable asset's extension
  against the app's rule (a dot and 1 to 15 letters or digits), so it cannot ship a pack the
  app would refuse. A verifier for `dist/packs` (every listed part present at its size and
  SHA-256, nothing extra) belongs with the upload workflow, which is not written yet.

## In the app

- After the shelf selects a game, `Desktop_Prepare` (`src/platform/desktop.js`) asks the
  bootstrap for the game's packs other than `core` and calls `packs_ensure`
  (`src-tauri/src/packs.rs`) with them, while the loading screen fills and says
  "Downloading the Newer Game data for <game>: X of Y MB", then "Unpacking".
- Rust downloads only the parts that hold an asset not yet unpacked, so when a later app
  version changes one asset, only the parts holding changed assets are fetched (`ureq`,
  following redirects to GitHub's storage; from an https host, never to plain http). Each part
  is limited to its listed size, checked for size and SHA-256, flushed to disk and only then
  renamed into `<app data>/packs/parts/` (on macOS
  `~/Library/Application Support/com.codemeasandwich.quaked/packs`). Each asset is cut out,
  checked against its own SHA-256, flushed and renamed into `packs/assets/<sha256><ext>`; the
  parts are then deleted. While a pack unpacks, its parts and assets are both on disk, so a
  mission pack's chain briefly needs about twice its size free (about 1.9 GB); there is no
  free-space check yet. Only the `assets` folder is added to the asset protocol's scope.
- A pack whose assets are all present is ready at once, with no network (offline use). An
  asset shared by two packs or two app versions is one file. Assets are checked by size when
  reused; a damaged file of the right size is not detected.
- The host is parsed, not matched as text: https, or http only to 127.0.0.1 or localhost (for
  trials), ending in `/`, with no user name, password, query or fragment. Pack, part and
  extension names are validated before anything is written. One download runs at a time.
  Progress is reported at most once per MB.
- A failure (offline, an HTTP error, a part or asset that fails verification) returns to the
  shelf with "The Newer Game data for <game> could not be downloaded (<reason>). Choose the
  game again to retry." Verified parts stay; a part that failed or was interrupted is deleted;
  nothing unverified is kept under a final name.
- The page passes the host and pack list to `packs_ensure`. Both come from the app's own
  bundled page, and every byte is checked against the hashes in it, so a different host could
  only cause a failed download; embedding them in the Rust binary instead is a possible
  hardening.
- Not yet done: removing assets no app version names any more, and a free-space check.

## Checks

- `tests/packs_contract_test.mjs`: chains and common ancestors; `games.json` is current and
  indexes every playable game; for each choosable game, every prepared row and normal sample
  for its BSPs or its chain's namespaces, every texture, crafted normal and glass map its BSPs
  name, every skin and skin normal its models can show and every native height of its models
  lies in its own packs; everything the HTML can start with is in core or shareware.
- `node tools/distribution/packs-mutants.mjs`: eight classifier mutants (BSP matching off,
  shareware textures, skins or namespace moved to the full game, glass, heights, hub relief or
  skin normals moved out of the chain), each run on a temporary copy; the contract test must
  fail on every one (8 of 8 on 13 October 2026).
- `tests/normal_unavailable_sample_test.js`: a listed normal sample the copy does not have is
  generated without a request; one it has is fetched.
- `tests/web_data_contract_test.mjs`: the web data files (`WebDataFile`), spot
  classifications and the site verifier.
- `cargo test packs` (`src-tauri/src/packs.rs`, against a local HTTP stand-in): download,
  verify, unpack, parts removed and later use offline; only the parts holding missing assets
  fetched; a corrupt part, an oversized part and an asset not matching its listed hash refused
  with nothing unverified kept; a verified part not downloaded again; disguised and plain-http
  hosts and unsafe names refused before anything is written.
- `browser-trial.mjs` (http and file modes, in CI): the shareware plays from the web data
  files, and assets of unshipped packs (there must be some) report unavailable without
  throwing.
- Real app trials, 13 October 2026 (an arm64 build with `QUAKED_PACK_BASE` on 127.0.0.1, the
  owner's library, driven by clicks): a host that refused the request returned to the shelf
  with the retry message; a reachable one downloaded and unpacked the shareware pack (1,423
  assets, parts removed) behind the "Unpacking" screen, and the level started. That first
  run showed Newer textures failing with "The operation is insecure", which the CORS image
  loading fixes. Nothing in the repository tests `ensurePacks`, `usePacks` or the
  desktop URL path in the boot loader; only these trials cover them.
