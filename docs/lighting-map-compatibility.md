# Coloured-lighting map compatibility — 8 October 2026

Episode-one black panels were caused by pairing a bundled BSP with an optional
coloured-lighting file for a different edition of that map. The owner reported
that episode two did not exhibit the same problem, then confirmed the visible
problem was fixed after this change.

`main.js` mounts the owned archive below the bundled archive. The bundled E1
BSP wins, but its absent `.lit` file falls through to `resources/id1/pak0.pak`.
`Mod_LoadLighting` previously accepted a larger LIT payload and truncated it.
Face offsets then addressed unrelated RGB samples. This was not damaged geometry.

`Lit_Parse` now requires exactly three RGB bytes per native lighting sample.
Both oversized and undersized files return null. The existing loader retains the
selected BSP's monochrome lighting, and its surface offsets remain unchanged.
Matching coloured-lighting files remain enabled. No map, texture, geometry,
archive priority, shader, or Classic rendering behavior was changed.

| Selected map | BSP samples | Optional LIT samples | Result |
| --- | ---: | ---: | --- |
| Bundled E1M1 | 168590 | 250582 | Native fallback |
| Bundled E1M3 | 171171 | 184973 | Native fallback |
| Enhanced START | 172533 | 217713 | Native fallback |
| Owned E2M1 | 192654 | 192654 | RGB preserved |

## Verification

- `node --test tests/lit_map_pairing_test.mjs`: 4/4 passed. Includes 40 actual
  local campaign pairs: 31 matching payloads preserved byte-for-byte and nine
  mismatches rejected. Eight mismatches were previously accepted. The local
  corpus test explicitly skips when the optional archive is absent.
- `QUAKED_THREE_MODULE=/path/to/three.module.js node tools/run_tests.mjs
  tests/newer_pack_test.js tests/lit_loader_test.js`: 5/5 passed with Three
  0.183.0. Actual mounted packs and `Mod_ForName` prove E1M3 fallback, E2M1 RGB
  retention, identical BSP lighting bytes and every surface's native offset.
- Independent planning/review found no blocker; independent public-parser
  verification reproduced all 40 pair results.
- The local browser was reloaded with the fix. The owner confirmed: “Yes that
  seems to have fixed it.” This is owner visual confirmation, not a captured
  automated pixel comparison or performance benchmark. The diagnostic tab was
  closed at the owner's request; their preview server was retained.

Length equality is necessary, not proof of map identity. LIT v1 does not carry
a BSP hash. An unrelated map with exactly the same lighting length cannot be
identified by this guard. E1M2's shorter file was already rejected; this patch
does not claim to explain all possible dark regions in every map.

To try the fix, reload the game and revisit the affected area. Existing loaded
JavaScript modules require a reload. This regression relates to Bluey
T-6b8c749b (owned full-game PAK loading); it does not resume the parked natural
surface experiment or change any agent role or coordination permission.
