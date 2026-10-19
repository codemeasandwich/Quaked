# Hexen II world texture source audit, 19 October 2026

This first increment inventories and extracts native sources. It does not install replacements, change the Quake index, implement Hexen rendering, or qualify any material in gameplay. The owner's 4× width/height, all-map lossy quality92 and half/quarter native-distance comparison standards apply to subsequent authored counterparts, not these exact native source PNGs.

Run with Node24 from the repository root, choosing a **new** output directory:

```sh
node tools/audit_hexen2_textures.mjs \
  --base '/Users/bri/quaked/Hexen 2/data1' \
  --expansion '/Users/bri/quaked/Hexen 2/portals' \
  --expansion '/Users/bri/quaked/Hexen 2 Portal of Praevus/Data/portals' \
  --output /private/tmp/hexen2-audit-new \
  --originals /private/tmp/hexen2-native-new
node --test tests/hexen2_texture_inventory_test.mjs
```

`current/inventory.json` is the final parser's authoritative inventory. Earlier `inventory.json` and `selected-native-v1/inventory.json` are retained initial snapshots; their initial name-prefix categories missed the exact native TRIGGER art hidden behind opaque `rtex114`/`ttex014` names. `validated-v2` introduced that explicit pixel identity and stricter BSP overlap checks. Existing snapshots are not overwritten. `verification.json` binds final source, tests, logs, inventory and selected original hashes.

## Sources and identity

The audit probes pak0 through pak9 independently, so Portal pak3 is found across gaps. Higher PAK number overrides lower; loose map/palette files override their root's PAKs; the selected expansion overrides base. The two supplied expansion locations are **separate profiles**. Their pak3 archives have identical SHA256 `f5f53e360d49af9d7f8bd3b136a0ebab70e9ddcace13cf8aa5e182d986a0a48c`; this proves archive content equality, not interchangeability of installations or loose gamecode. Only relevant loose `maps` and `gfx` sources are traversed; this is not a gamecode/discovery implementation.

All three effective profiles use the actual Hexen palette `gfx/palette.lmp`, exactly768 bytes, SHA256 `a12034bd7894ee288c1ce6e3be290ffc791eb50d16013717b11890f437d3bfe8`. Quake's palette is never substituted. The identity includes exact case-preserved miptex name, native dimensions, palette SHA and palette-expanded opaque RGBA SHA; raw indexed pixel SHA is recorded too. Aliases are not assumed from matching names. Each occurrence retains map, slot, source archive/loose file, member offset, BSP SHA and face count.

The 42 base BSPs contain594 native identities. Each selected expansion mount sees59 maps (42 base +17 expansion), with386 additional identities; union980. Category triage:887 ordinary,72 animated,12 liquids,5 sky,4 utility. An exact observed native TRIGGER pixel fingerprint classifies two obliquely named utility variants. Other opaque names still require material inspection. `profileFaces` gives separate per-installation counts; `totalFaces` sums profiles and must not be used as unique-map coverage because the expansion copies are duplicated intentionally.

Shared `pak_members.mjs` rejects duplicate names in retail pak1. This bounded offline adapter reuses its member reader but explicitly validates and records the three identical-byte duplicates (`models/mumshot.mdl`, `sound/mummy/mislfire.wav`, `sound/eidolon/flamend.wav`). It retains first-entry semantics, matching `src/engine/common/pak.js`'s directory-order search. Conflicting duplicate bytes fail closed; the shared reader is unchanged.

## First references

Exact native RGBA PNGs and an aspect-preserving, nearest-neighbour labelled contact sheet are under `assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/originals`. The sheet is a **high-use inspection shortlist**, not16 approved masonry materials; it intentionally exposes ordinary, decorative, ground, wood and utility art that numeric names cannot classify. The first visually inspected masonry sources are:

- Base `01-rtex337-3bbe64a968db.png`,64×128: warm tan stone courses, target256×512.
- Expansion-own `13-rtex450-4f3556a977d8.png`,128×128: staggered irregular gray masonry, target512×512. It is absent from all base native identities, not an inherited counterpart.

`selected-native-v1/inventory.json` holds each PNG locator/SHA and all source occurrences. `selected-originals.json` binds its native pixel identities to the final inventory; the native images are retained unchanged. Selection is not art acceptance. The two TRIGGER previews on the initial sheet must never become enhanced ordinary world materials.

## Verification and failure handling

Five public CLI groups exercise actual subprocess completion (timeout/signal cannot count as refusal), PAK gap/loose/expansion precedence, palette-sensitive variants/inheritance, exact RGBA/PNG dimensions and unchanged input bytes, identical/conflicting duplicates, malformed PAK/BSP/palette/mip/face indexes, path traversal, and existing-output protection. The original first test failure came from macOS `/var` versus `/private/var` temp paths; the fixture now uses the actual canonical temporary root. The failed log is retained separately.

The reader bounds PAK count/size/directory, member bytes, BSP lump/mip ranges and overlaps, dimensions/counts, effective map count, cumulative BSP bytes and retained unique RGBA bytes. It rejects unsafe names, relevant-tree symlinks and ambiguous case collisions. Outputs use fresh destinations; failure may leave partial evidence, which must be retained and investigated before a fresh invocation.

This includes embedded WORLD/brush-submodel miptex, not enemy/model skins or unreferenced WAD assets. Face counts include brush submodels and unused material slots; no claim of exact player-visible coverage. Opaque RGBA is an identity witness, not Hexen transparency/fullbright/material semantics. Every row remains `rendererStatus: unqualified`; unsupported rendering must never be relabelled accepted.

Bluey `agent_whoami` failed with `storage_error`, correlation `44fe06bfde75422f8941c7e457a52a98`; the coordinating parent retains the campaign obligation and next action. No board mutation was claimed successful. The next owner is the campaign coordinator: independently review this source increment, generate the two reviewed photographic interpretations, then validate native-distance/edge/relief behavior before any Hexen-specific runtime binding.
