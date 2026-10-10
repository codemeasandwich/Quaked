# Texture upgrades keyed by their pixels (card [34e]), 10 October 2026

## What works

Newer Game's wall textures now go only on the pictures they were made from. An add-on that reuses one of Quake's
texture names for a different picture keeps its own picture.

For example, Scourge of Armagon's hip2m4 has its own `metal5_6`: a 32×64 picture, where Quake's is 64×64. Before
this change it was given Quake's upgrade, made for the other picture. It now keeps its own look. Scourge's maps that
use Quake's own `metal5_6`, such as hip2m1, still get the upgrade.

## How

- **The record.** `newer/textures/index.json` has a `sources` entry. For each upgraded name, it lists the native-RGBA
  identities of every picture Quake's own maps give that name. The identity is `R_GlassTextureKey`'s: the size and
  two 32-bit hashes over the pixels, with the glowing (fullbright) texels' colours put back.
  - 309 of the 316 upgraded names have one.
  - 5 have two pictures within Quake itself, and both are accepted: `door04_1`, `metal5_2`, `metal5_4`, `plat_top1`
    and `window03`.
  - The other 7 are Newer Game's own crate variants (`crate_dharma` and the like). They are not in any map, so they
    keep matching by name, as before.
- **The check.** `R_NewerTextureUpgrade` (`src/newer/render/r_newertextures.js`) gives a texture its upgrade only when
  the texture's identity is one of its name's sources. Otherwise the texture falls back (`userData.newerFallback`) and
  keeps its own pixels, and nothing is fetched for it at upgrade time. (The startup prefetch, `R_NewerTexturesPrefetch`, still goes by name, but it prefetches only Quake's own e1m3 and Newer Game's start map.)
  - A name with no sources goes by name, as before.
  - A glass texture is chosen by its identity already (`glass` in the index), and that is unchanged.
- **The tool.** `tools/build_texture_sources.mjs` makes the record. It loads every map in the packs given, through the
  engine's own model loader, and computes each upgraded texture's identity. It writes only `sources`, as the index's
  last entry; the rest of the file stays byte for byte. Run it again when an upgrade is added:

  ```sh
  QUAKED_THREE_MODULE=<three.module.js> node tools/build_texture_sources.mjs --pack games/shareware/pak0.pak --pack resources/id1/pak0.pak
  ```

  Give it Quake's own packs only. An add-on's pack would record the add-on's pictures as sources, and that is what
  this change exists to prevent.

- **The displacement bakes' record** (`newer/displacement/manifest.json`) lists the index among its generator inputs.
  Its hash there is restated for the new file, as card [44g] did for its comment-only changes, and its `sourcesNote`
  says why: the bakes read only the index's `normals`, which is byte for byte the same.

## What changes for each game

These figures were measured on the owner's packs, through the engine's loader, by comparing each upgraded name's
pictures with its sources:

| Game | Upgraded names that match Quake's pixels | That differ |
|---|---|---|
| Scourge of Armagon | 196 | 1: `metal5_6` (hip2m4; its other maps use Quake's) |
| Dissolution of Eternity | 139 | none |
| Dimension of the Past | 186 | none |
| Dimension of the Machine | 157 | 6: `comp1_2`, `comp1_3`, `metal1_1`, `metal1_3`, `metal1_4`, `twall5_1` (in some of its maps) |

Quake itself is unchanged. Every upgraded texture of its maps matches its source, since the sources were taken from
them.

## Checks

- `tests/texture_sources_test.js` (3 tests), through the public `R_NewerTextureUpgrade` with the real index and real
  textures from the shareware pack:
  - every source is an upgraded name, written as `R_GlassTextureKey` writes it, and every upgraded texture of e1m2
    matches its source;
  - Quake's `metal5_6` asks for its upgrade;
  - the same name with one texel changed keeps its own picture and waits for nothing;
  - `crate_dharma`, which has no sources, still goes by name;
  - with the owner's Scourge of Armagon pack, hip2m4's `metal5_6` keeps its look. Without that pack, this test is
    reported as skipped.
  - With the check removed from `R_NewerTextureUpgrade`, two of the three tests fail.
- **Browser** (`?game=hipnotic`, then `r_hdr 1`), with no page errors:
  - in hip2m4, `metal5_6` (32×64) fell back and kept its own picture;
  - in hip2m1, `metal5_6` got its upgrade;
  - in Quake's e1m2, its identity is the recorded one and it got its upgrade, with 57 of 60 textures upgraded.

## What remains

- **Online rooms carrying the game** (the card's other half) is not done. Rooms are created and joined through the
  WebTransport room server (`DEFAULT_WT_SERVER`), not in the page, and Online is disabled in the Multiplayer menu at
  the owner's direction (card [MP1]). It is for the owner to take up when Online is enabled.
- **Add-ons' own pictures** keep their original look. Making upgrades for them is separate work.
