# Retire accepted texture candidates

The owner authorized removing the dated candidate folders after their accepted
variants were installed in `official/`. Comparisons use the original game texture
and the current official replacement. Dated candidate outputs are not a
comparison target and are no longer retained in the working tree.

Three `assets/game/textures/candidates-*` directories are removed. Their exact
file hashes and prior Git blobs are recorded in
[evidence/candidate-retirement-2026-10-18/removed-files.json](evidence/candidate-retirement-2026-10-18/removed-files.json).
The prior source is recoverable at commit `01291eb5`; no raster archive or legacy
candidate-image aliases are introduced. The accepted official maps, native game
library, original reference extractions and unrelated authoring images stay intact.

`tests/fixtures/official-textures.json` identifies the accepted native identities,
current bindings, original references and comparison aliases. Only the111selected
small encoding JSON records are retained under
`assets/authoring/texture_sheets/official-encodings/`. Their bytes and hashes are
unchanged. Paths to retired intermediate images inside those records are historical
provenance, not active inputs. The records do not ship in the game inventory.

The material and actual-level comparison pages load the real official catalogue;
they no longer install page-local candidate bindings. Original-reference PNGs are
exact game extractions, checked against actual PAK/BSP native pixels by the public
suite. Half- and quarter-native views downsample both original and official images
to the same dimensions. These measurements do not invent a new numerical art
acceptance threshold. GPU projection, level fit, artistic review and gameplay
acceptance remain distinct.

Public checks retain actual native identities, all official map hashes, fourfold
sizes, lossy quality92 records, UVs, decoded XYZ and height-red preparation, caching,
Classic mode, unknown/case controls, steel partner boundaries and both rock
identities. Normal-channel verification derives the expected channels independently
from the decoded official heights. It does not require a stored draft master.

Six one-off draft-composition replay scripts are retired. General strict and
photographic finisher invariants still run with temporary outputs and small recipe
parameters. The layered encoder uses original references plus official diffuse
inputs and test-local hash-bound recipes; the immutable authoring recipes remain
unchanged. Because WebP is lossy, these tests check deterministic temporary runs,
plane ordering, strength changes, invalid-input refusal and canonical routing;
they do not claim re-encoding the official diffuse reproduces its original bytes.

For subsequent materials, generate and inspect work in a temporary directory.
After acceptance, publish maps to `official/`, update the real binding and the
current comparison/encoding records, then discard temporary candidate images.
Do not recreate dated persistent candidate folders or redirect comparisons to drafts.

Qualification and integration are recorded in the adjacent evidence directory.
The independent authoring-image relocation `e16f6cda` was integrated first. Its
image lookup changes and source bytes are preserved. Focused post-integration
checks and finite browser verification passed; the final maintained gate and
publication receipt belong to the exact committed tree under `dist/staged/verification/`.

Bluey enrollment is unavailable (`storage_error533da04da67840d8bc03210612456553`).
This feature record retains scope, evidence and the current session as responsible
owner; no acknowledged board mutation or durable worker execution is claimed.
Current bounded progress is in `evidence/candidate-retirement-2026-10-18/progress.json`.
