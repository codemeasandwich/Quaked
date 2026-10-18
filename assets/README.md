# Shared project resources

All game, web and native application resources live under this directory.
Source code belongs in `src/`; build tools belong in `tools/`; documentation
text belongs in `docs/`. The HTML and native app are built from the same
explicit resource inventory, with their existing game-data/profile boundaries.

| Directory | Contents |
| --- | --- |
| `branding/` | Project icon and logo sources/exports, studio logo; native icon exports in `native/` |
| `ui/` | Console background and enhanced-menu image |
| `audio/music/` | Music and attribution |
| `audio/sounds/` | Standalone menu, welcome and low-health audio |
| `game/textures/` | Registered diffuse, height, normal and scalar textures |
| `game/enemies/`, `game/weapons/` | Models, skins and their material data |
| `game/enemies/<model>/sources/` | Feature-specific authoring inputs, including Lava Man; excluded from runtime bundles |
| `authoring/texture_sheets/sources/` | Canonical reference, draft and verification images formerly alongside texture tools; excluded from runtime bundles |
| `game/hud/`, `game/ui/` | Game interface artwork and manifests |
| `game/effects/`, `game/bestiary/` | Effects and journal artwork |
| `game/maps/`, `game/maps.pak` | Authored game maps; loose community BSPs and attributions in `game/maps/community/` |
| `game/normals/`, `game/displacement/`, `game/rockfield/` | Prepared data and authoritative inventories |
| `game/startup.pak` | Generated startup transport from registered source artwork |
| `boxes/`, `credits/` | Launcher box artwork and credit graphics |
| `docs/` | Project banner and documentation illustrations |

## One layout, several consumers

**`layout.json` is the only logical-to-physical location map.**
`src/platform/resource_paths.js` reads it for browser/Node code;
`tools/resource_paths.py` reads the same file for Python authoring tools.
There is one physical file for each resource. No root-level copies, symlinks,
search-path fallback or per-platform asset tree is required.

Established `newer/...` names inside PAKs, prepared manifests and generated
registries are stable **logical resource identifiers**. They resolve to
`assets/game/...`; they do not imply another directory. `src/newer/` contains
code, and is unrelated to that former data directory. Keeping these logical
identities preserves startup-pack aliases, binary hashes and baked data.

Runtime loaders continue through the existing `AssetURL`/`AssetFetch` and
`COM_NewerURL` interfaces. Packaging and Node tools use the existing
`assetPath(root, logical)` boundary. Python tools use
`resource_path(root, logical)`. Direct pre-start HTML icons use canonical
`assets/...` URLs. Native bundle icon settings point at `branding/native/`.

The native bundle's generated opaque `assets/qN.*` files and the single HTML's
embedded payloads are distribution transports, produced from this tree. They
are not separately authored resource sources. Build outputs stay under `dist/`.
Set `QUAKED_DIST_DIR` to a separate output root for an isolated build trial.

Owned Quake/expansion/add-on files remain in the user's external game library
(`~/quaked` by default). The existing `resources/` owned-game exclusion and
registered/shareware boundaries remain enforced. Authoring images live under
`assets/`; scripts stay under `tools/`. Lava Man's already-moved images/recipes
remain in `game/enemies/lavaman/sources/`. Other texture-authoring images mirror
their original relative tree in `authoring/texture_sheets/sources/`.

Existing recipes, prompts and historical receipts keep their locations and byte
identities. Their recorded `tools/texture_sheets/sources/...` image names are
stable logical IDs: exact entries in `layout.json` resolve them to the sole
canonical file. Resolve the complete filename with the shared helper, not a
logical directory followed by an unmapped child. Derive sibling JSON record
names before resolving images, since the records have not moved. Source previews
use the same URL boundary; `tools/serve.py` supports recorded image URLs and byte
ranges through that same map. No old image copies or symlinks remain in tools.
All authoring images stay outside the explicit runtime inventory.

## Adding or changing resources

Choose the existing functional directory, register the resource in its feature's
manifest and retain its attribution/provenance. Use the common resolution
boundary for filesystem/URL access. Do not recreate the former root directories.
Do not recursively bundle `assets/`: the product inventory deliberately selects
required resources and excludes candidates, alternates, sources and unused art.
Prepared manifests and PAK builders retain logical identifiers while reading and
writing their canonical physical locations.

The RGB web icon and RGBA native icon are preserved as distinct existing exports.
Their filenames/roles are explicit; this migration does not redraw or re-encode
branding. High-resolution authoring references and generated derivatives have
different roles and must not become competing editable runtime sources.

See [migration and verification](../docs/resource-layout.md) for preservation
receipts, exact commands, current checks and qualification limits.
