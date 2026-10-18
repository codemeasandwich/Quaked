# Unified resource layout — 18 October 2026

Owner authority: consolidate the listed root branding/menu/background files,
`src-tauri/icons`, `assets`, `docs/images`, `newer`, `music` and the subsequently requested `maps` into one clear
resource folder used by the source game, HTML and native app. Independent
read-only planning traced the existing caller → loader → inventory → packaging
path and recommended reusing `assets/` and the existing resolution boundaries.

The layout and contributor contract are in [assets/README.md](../assets/README.md).
The machine-readable path authority is [assets/layout.json](../assets/layout.json).
The exact before/after migration ledger is
[resource-layout-migration.json](resource-layout-migration.json).

## Preservation and scope

The initial move relocated 8,326 existing files (2,953,799,362 bytes). The owner then added root `maps/`: 17 community BSP/attribution files moved to `assets/game/maps/community/`, retaining logical `maps/*` identities. The move includes
ignored/untracked work, without re-encoding or replacing any resource bytes. Every file
was SHA-256 verified before and after moving. Existing absent files remain
absent. The branch is `codex/main-work-preserved-20261013T164224Z`; starting HEAD
is `616ee09ca4eae3121d5417b081623a144f498671`. Prior staged/unstaged/untracked
work is retained; this migration does not grant commit, landing or release.

PAK member names, logical prepared-data paths and historical producing-input
hashes are preserved. Current source files that participate in baked fingerprints
are not rewritten merely to reflect a physical directory move. Filesystem
read/write boundaries perform the mapping. The startup and map PAKs, runtime
textures and prepared binary payloads are moved byte-for-byte.

No generated build or retained evidence was deleted. Fresh web/desktop builds
use `dist/resource-layout-trial` to preserve the existing `dist` outputs.

## Coordination ledger

Bluey identity/checkpoint/inbox calls continue to return `storage_error`.
Read-only searches reveal historical cleanup work and another agent's active
distribution card; neither transfers ownership to this session. No task mutation
or new assignment is acknowledged. The current Codex session owns this requested
migration and its verification. Reconcile this record onto the appropriate
owner-authorized card when board writes recover, preserving actual owners.
Independent planning, consumer audit and review use supervised read-only helpers;
tooling/test edits are supervised in this same checkout.

## Verification

Initial working-tree verification passed146 resource cases,18 distribution/URL
contracts, full SHA256 relocation checks, both profile builds, source and offline
browser trials and native compile-only validation. Retained reports describe
that original dirty working-tree identity. Fresh Dev checks are recorded below. Owner acceptance, repository landing and release
remain distinct from local source/build verification.


## Isolated Dev integration

The owner subsequently authorized committing and pushing only this chat's work
to the development branch while preserving other agents. Integration uses
`/Users/bri/.codex/worktrees/unified-assets/Quaked`, branch
`codex/unified-assets`, based on `Dev` at
`ab554cf61a2650c7ae84ed5dc96dcc45c4cb1010`.

This Dev tree contains newer modular data delivery and sound work than the
original dirty checkout. Its implementations, priorities, pack classification,
asset bytes and input hashes are preserved. Adapters were reapplied to Dev's
tracked files; unrelated modified bodies and untracked resources from the
original checkout were excluded. The original checkout, its branch and its
index remain intact.

[The Dev relocation ledger](resource-layout-dev-migration.json) records 6,565
files (2,156,854,054 bytes). Every destination's staged Git blob and mode match
its original Dev entry exactly; all old paths are absent. This count differs
from the earlier working-tree move because the shared checkout includes
unpublished work. The two receipts describe different source identities and
must not be conflated.

Fresh-Dev verification includes policy classification, game-index identities,
pack mutation rejection, resource/sound suites and a separate unpacked-demon
regression. The required staged pre-commit hook remains unchanged and must
pass before commit/push. Source publication is separate from a tagged release
or owner acceptance.

## Lava Man authoring inputs

The owner subsequently requested authoring images under `assets/`, keeping
scripts under `tools/`. Lava Man's five current/superseded source images and
recipes now live in `assets/game/enemies/lavaman/sources/`. Runtime skins remain
in `assets/game/enemies/lavaman/custom/`; the existing `sources/` exclusion keeps
authoring inputs out of both product profiles. See
[relocation and verification](lavaman-authoring-assets-2026-10-18.md). Historical
migration receipts retain their original path/hash observations.
