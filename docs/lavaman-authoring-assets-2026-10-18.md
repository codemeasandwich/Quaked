# Lava Man authoring assets — 18 October 2026

Owner request: move Lava Man authoring images into assets, keep scripts under
tools, update references, test, commit to Dev and push without changing other
agents' work. Source checkout is the clean owned Dev worktree
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, based on738f92d9.

## Contract

Five files move to `assets/game/enemies/lavaman/sources/`: the current registered
image, original design and recipe under `fidelity-2026-10-13/`, plus the older
image and superseded recipe under `generated-2026-10-12/`. Both generations
remain accountable because current provenance still references the older layout.
All3 PNG byte hashes are preserved. Only paths change in the two recipe JSONs
and current runtime `custom/SOURCE.json`; model, source-image and delivered
texture hashes remain unchanged. The superseded recipe still refuses to overwrite
the active fit and points to the moved successor.

The existing `tools/texture_sheets/fit_generated_skin.py` takes the moved recipe
path directly and resolves its root-relative sourceFile; no new resolver or
legacy aliases are introduced. Unrelated Shambler/Armagon style references and
other agents' files remain in place. Existing product inventory exclusions keep
`sources/` out of both distributions. Scripts stay under tools.

## Verification and coordination

Independent read-only planning traced the fitter, both recipes, current
provenance, public identity checks and product inventory. Image relocation hashes
are in [relocation.json](evidence/lavaman-authoring-assets-2026-10-18/relocation.json).
Focused public-interface checks passed33/33 against the owned native model and
actual images; both product inventories retain3536 web/5177 desktop logical
entries and exclude authoring sources. All5 moved files,3 PNG hashes, both
recipe chains and absence of old paths passed direct checks. The existing
superseded-recipe CLI rejects the old recipe and names the moved successor
using system Python3.9/SciPy1.11.4. The first invocation with bundled Python
failed because that interpreter lacks SciPy; its diagnostic is retained, not
reported as a guard pass. Independent final review approved the exact scope with no blocking finding:
[independent-review.md](evidence/lavaman-authoring-assets-2026-10-18/independent-review.md).
The unchanged exact-index gate runs as part of the commit. Its receipt, source
tree and normal remote readback are retained under ignored `dist/staged/` after
success; this source document does not preclaim that result.

Bluey agent_whoami failed with storage_error52d03d167f854f11a306c97189475c8b;
no enrollment/card mutation is claimed. This session owns the local obligation
and this ledger while storage is unavailable. Focused checks and independent review are complete. Next action is the
maintained commit gate and normal Dev push, with tree/remote verification. Primary retains foreign mixed WIP; apply only reviewed
matching Lava paths there after landing, leaving its branch/index unchanged.
Natural-surface/rock-edge trials remain parked.
