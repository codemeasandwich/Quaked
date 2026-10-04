# Prepared continuous rock fields — 2026-10-03

The owner reported a pause during level transitions while displacement tiles
were generated. Known levels now have offline-built data. The runtime pages those
prepared tiles into the existing atlas; the generator is a fallback for absent,
changed, incompatible, damaged or unavailable prepared data.

## Scope and reproduction

`tools/bake_rockfield.mjs` discovers every BSP in the available `pak*.pak` files
and loose `maps/` directory. The current package has **29 levels, 144 connected
eligible surfaces and 5768 tiles**, including zero-tile records for levels with
no eligible rock. Total compressed data is 36,883,116 bytes; uncompressed data is
55,172,942 bytes. This is every available level, not a claim to have generated
maps absent from this checkout.

The tool uses the existing native model loader, lightmap polygon builder,
`R_RockSurfaceCharts(includeBrushes:true)`, presets and continuous RockField.
It covers the union of each face's tile bounds plus the same four-tile wall and
one-tile ground ray halos. Each tile has 64 intervals and two-sample gutters.
Seeds, coordinates, texture UVs, geometry and field amplitudes remain unchanged.
Half-float words match exactly what the fallback puts in the GPU atlas. No tile
min/max normalization or stitching is introduced.

Rebuild with the installed Three 0.183 module (and its core sibling):

```sh
QUAKED_THREE_MODULE=/path/to/three.module.mjs node tools/bake_rockfield.mjs
```

`--plan` reports coverage without generating assets. The tool uses two bounded
workers and terminates them on completion/failure. It writes gzip files and
`newer/rockfield/manifest.json`, plus the small generated registry
`src/rockfield_bakes.js`. Commit the assets and registry together after authorized
review. Rebuild after changes to source field functions, chart/material rules,
presets or map geometry; bump the bake-format version for incompatible generator
or coordinate contracts. The public package test compares all source hashes and
all available BSP hashes, so stale checked-in outputs fail verification.

## Runtime and failure contracts

`RockBakeSource` loads a known level asynchronously. Portal previews start the
upcoming level's fetch early. At most three decoded/pending entries remain in the
CPU cache; the active world's source is pinned. Evicted pending preview loads are
aborted, and late callbacks cannot restore an evicted entry. GPU residence remains
96 tiles; known data does not start field-generation workers while loading.

The existing Newer pack-or-loose URL helper supplies the gzip asset, so both
`newer.pak` and the loose `newer/` folder work. Loose URLs include the compressed
asset hash to avoid serving an old bake after a rebuild. A five-second deadline
covers load, decompression and validation; it aborts a stalled request and makes
fallback possible. The raw SHA-256 must match the generated registry before
decoding. A structurally valid, in-range height bit flip is rejected too: otherwise
it could break continuity without causing a parse error.

The decoder validates model/version/sampling, finite nonnegative normalized
half-floats, unique chart/tile identities, contiguous offsets and exact payload
coverage. Chart signatures include the component key, seed, config and basis.
A changed map/preset therefore cannot silently use another field. Loading,
failure and generation counters are visible through `R_RockfieldStatus`.

Prepared tiles enter the existing 96-layer LRU/hash-table/upload path directly;
fallback retains its two lazy workers and deterministic seeded sampling. Map
replacement disposes the old GPU atlas and releases its source pin. No callbacks
install pages into a disposed/replaced world.

## Evidence and acceptance boundary

Independent public tests verify all 29 BSPs and 144 current runtime charts,
complete halo coverage, source/BSP/compressed/raw hashes, one deterministic
random full-tile generator comparison per chart, identical gutters, 96-page
eviction, packet-table validity, no-worker prepared loading, timeout/corruption
fallback, pending eviction and active source pins. A real tiny Newer PAK fixture
also exercises blob URL loading, gzip decoding and checksum verification.

The live ordinary hub trial loads prepared data with **96 resident pages,
zero pending jobs and zero generated tiles**, with GL/page errors zero. Moving
through the hub continues reading prepared pages rather than generating them.
This proves removal of procedural work for those visited fields; model loading,
shader compilation, physical demon mesh preparation and network transfer remain
other sources of level-loading time, not covered by a claim of zero transitions.

Final receipts and module identities are recorded with the flashlight/run and
travelling-corpse checks. Source review/test success is distinct from owner
acceptance of transition responsiveness. No commit/push or durable background
job is claimed by this increment. Root owns owner verification; the concrete
trial is `http://localhost:8013/tests/run_policy_trial.html`.

## Final receipts

- `prepared-maps-flashlight-travel-qualified-tests-2026-10-03.txt`: 59/59 targeted checks across eleven suites, including packed and loose prepared assets, native corpse restoration, flashlight policy and fresh main entry.
- `flashlight-native-linked-final-tests-2026-10-03.txt`: 1/1 additional native-game regression exercising all four difficulty corridor contacts. Total distinct targeted cases: 60.
- `prepared-hub-live-2026-10-03.txt`, `run-policy-normal-live-2026-10-03.txt`, `run-policy-hard-live-2026-10-03.txt`, `run-policy-restart-live-2026-10-03.txt`, `run-policy-live-final-2026-10-03.txt`: actual hub ready with prepared pages/no generation; Normal ON, Hard OFF; first-off notice and restart reset. All captured completed game states report GL/page errors zero.
- `run-policy-first-off-final-2026-10-03.jpg`: native corner notification visible in the actual game.
- `prepared-maps-flashlight-travel-identity-2026-10-03.json`: source/test/asset/receipt identities for this local increment, independently reviewed.

The trial's initial center-position failure is retained separately. It entered an adjacent teleport before touching the difficulty trigger. Corrected hull contacts are validated by the native linked-touch regression; no production policy was weakened to make the trial pass.
