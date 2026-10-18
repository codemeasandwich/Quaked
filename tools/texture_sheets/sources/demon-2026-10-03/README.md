# Demon plaque source maps

This directory is the canonical, unpacked authoring source for the `dem4_1`,
`dem4_4` and `dem5_3` plaque relief. It follows the existing
`tools/texture_sheets/sources/<subject>-<date>/` layout. Tools and tests read
ordinary files through **`manifest.json`**; they do not open or unpack a ZIP.

## Source and generated data

- `dem4_4_displacement_16bit.png` is the authoritative saved 2048 × 4096,
  single-channel 16-bit height field. Its SHA-256 remains
  `d5e89e6d2a3109e0507b91b53ed65b4ce072f1789296190ecc4b94f87009ef45`.
- `dem4_4_normal_opengl.png` and `dem4_4_normal_directx.png` are the supplied
  normal references, computed from that field. They are retained for independent
  slope and green-channel-convention checks; they are not additional runtime
  displacement sources.
- `sources/dem4_4_height_inferred_native.png` is the supplied native inferred
  height interpretation. `sources/dem4_4_original.webp` is the unchanged supplied
  color reference, retained for provenance. Runtime color remains in
  `newer/textures/` and is checked against the manifest's hashes.
- `height.png` predates this migration and differs from the supplied native and
  saved displacement files. It is a historical candidate, not an import input.
  It has been left unchanged to preserve existing work.
- `README.txt` and `encode_maps.mjs` retain the supplied package documentation
  and numerical conversion source. The README's archive terminology describes
  the original delivery. The encoder can regenerate high-resolution reference
  maps with Node and Sharp as described there; it is not automatically run by
  the importer or tests.

`manifest.json` is the single active contract: supplied map identities,
resolution, resampling, normal conventions and limitations, plus `runtimeImport`
for the existing output paths, material bindings, color identities and owner
requested depth. The former `source.archive_path` key is now `source.path` and
resolves from this directory. `provenance.originalMembers` retains the original
member hashes, including the supplied manifest's pre-migration hash. The active
manifest intentionally adds the runtime contract, so its current bytes differ
from that original manifest. The other seven members are byte-identical.

The root `dem4_4_maps.zip` is retired. Its name and SHA-256 are historical
provenance only; no fallback lookup uses it. Git history retains the original
container. The previous dated `docs/evidence/demon-face-assets-2026-10-03.json`
was already deleted in this checkout. Its import contract was read from HEAD and
moved into this manifest, rather than restoring a second active recipe.
Historical campaign receipts that mention the ZIP retain their original claims;
use this manifest for current source resolution.

## Import and verification

Use a Python runtime with Pillow and NumPy:

```sh
python3 tools/sculpt_demon_faces.py --check
```

`--check` is read-only. It checks the saved displacement checksum, compares every
one of the 131,072 generated uint16 samples to the installed R16, verifies the
grayscale fallback and all three color hashes/material bindings, and fails on
any disagreement. It neither repairs a failed check nor writes an evidence file.
Without `--check`, the existing importer writes the generated runtime height,
preview images and texture index using this manifest. It no longer writes a
separate dated recipe under `docs/evidence/`. Import advances the current texture
index version by one, following `tools/craft_normals.py`; the former fixed 2026-10-03
version could roll a newer index backward and has been removed.

The saved scalar field is sampled at the existing 8:1 texel-center positions,
requantized to uint16 and stored as little-endian 256 × 512
`newer/textures/normals/demon-face.r16`. The corresponding
`newer/textures/normals/demon-face.webp` is the grayscale fallback. These are
derivatives, not competing source maps. The runtime registry remains
`newer/textures/index.json`; the game does not read authoring files from `tools/`.
Import validation fails before writing outputs if displacement or color hashes
are wrong. Missing or malformed runtime fields continue to use the renderer's
existing native-flat fallback.

Run the maintained public renderer tests with installed Three.js, canvas and
Python runtimes (absolute module paths are required):

```sh
QUAKED_THREE_MODULE=/absolute/path/to/three/build/three.module.js \
QUAKED_CANVAS_MODULE=/absolute/path/to/canvas/index.js \
QUAKED_PYTHON=/absolute/path/to/python3 \
node tools/run_tests.mjs tests/demon_face_relief_test.js
```

The suite uses the existing distribution `assetPath` helper for the pinned
shareware fixture, including `QUAKED_SHAREWARE_PAK` and the build cache. It checks
ordinary source files independently of the importer, every R16 sample, normal
slopes/conventions, color preservation and public material/Classic/fallback
behavior. The supplied encoder is never executed by these checks.

## Migration record — 18 October 2026

Authority: the owner requested consistent ordinary texture sources and a single
source of truth, specifically rejecting a relocated ZIP as the solution.
Independent read-only planning recommended reusing this existing directory and
preserving supplied bytes and runtime contracts. Workspace:
`/Users/bri/SOURCE/Quaked`, branch
`codex/main-work-preserved-20261013T164224Z`, starting HEAD
`616ee09ca4eae3121d5417b081623a144f498671`.

The migration is limited to source layout, importer/test readers, distribution
policy controls and this documentation. No texture index, installed color,
R16, fallback, baked geometry or release output is regenerated. Existing deleted
documentation/policy files and unrelated dirty work are preserved.

Bluey identity, inbox and checkpoint calls returned `storage_error`, including
an unsandboxed identity attempt. Read-only card searches/context succeeded;
existing distribution-cleanup card `T-0558af29` is historical Done work, not an
assignment for this migration. No new task/update is acknowledged. The current
Codex session owns local verification and reporting; when board writes recover,
reconcile this record and the review/results onto the appropriate owner-authorized
card without changing historical ownership or claiming worker execution.

Verification and review results are recorded below when available. Source layout
verification does not constitute owner visual acceptance, landing or release.

### Verified result

- Root ZIP absent; seven supplied payloads match their original bytes and the
  supplied manifest's original fields remain equivalent after the path-key rename.
- Public renderer suite: **7/7 passed**, with the ZIP absent. It checks all
  131,072 scalar values and 15,969 normal samples with zero channel error;
  the full-image DirectX green flip also passes.
- Public distribution contracts: **3/3 passed**. Direct web/desktop inventory
  probes exclude authoring sources and retain the installed R16 and WebP.
- `--check` passes against installed data. The independent
  [CLI fixture check](verification/check_import_cli.py) confirms no data writes
  in check mode, rejection of corrupt displacement and truncated R16 without
  further writes, and successful scratch import with identical R16, an index
  version increment and no duplicate evidence recipe. Run it with the same
  Python runtime; its temporary fixture is removed when finished.
- All eight protected working-tree input hashes (index, runtime assets,
  displacement registry and pre-existing historical height) match the captured
  pre-migration baseline. The index was already modified before this work;
  this is not a claim of index equality to HEAD.
- Independent review: **CLEAR**, after pinning the shareware fixture checksum
  and fixing the importer's inherited version rollback. The reviewer checked
  code and source preservation; the coordinator ran the tests.
- `tools/check_distribution_policy.py` still fails because
  `docs/distribution-local-only.json` was already deleted before this change.
  The failure is retained in `verification/blocked-policy-check.txt`; no policy
  gate was relaxed or replaced. Bluey checkpoint retry still returns
  `storage_error`. Both limitations remain visible here.

Receipts are in [verification/](verification/), including `results.json` with
implementation and protected-input hashes. These are verification records;
`manifest.json` remains the only import recipe. This is a reviewed working-tree
change, awaiting owner acceptance; it has not been committed, landed or released.
