# Read-only primary and ci-gpu reconciliation inventory

Snapshot: 2026-10-18T08:50:10.885643+00:00. This report accompanies the exact path/blob/SHA-256
inventory in `primary-worktrees.json`. Only these two evidence files were
written. No source file, branch, index content, stash, process, build or board
state was intentionally mutated; no backup, worker execution or publication is
claimed. No builds or tests were run by this inventory reviewer.

## Current identities and disposition

| Checkout | Branch and HEAD | Relation to captured origin/Dev | Integration decision |
| --- | --- | --- | --- |
| `/Users/bri/SOURCE/Quaked` | `codex/main-work-preserved-20261013T164224Z` at `616ee09ca4eae3121d5417b081623a144f498671` | 98 behind, 0 ahead | No unique commits. Do not merge/copy its whole dirty tree over current Dev. |
| `/Users/bri/worktrees/Quaked/Dev/ci-gpu` | `main-reconcile` at `6785e4736d0d299536ef77014173d1fdcc69bb32` | 27 behind, 0 ahead | No unique commits. Preserve the stopped uncommitted rock-edge prototype. |

Captured comparison ref: `ab430e348a1b16c4e93df3c518cebcdb8ad2a1cc`. No fetch was performed by this
reviewer; this is a comparison with the existing local remote-tracking ref.
Ancestor/path/history checks used current Git objects, not historical memory
status. No local AGENTS.md was found in the inspected checkout/ancestor paths;
the owner's supplied standing instructions apply.

## Primary checkout: unique versus already landed

The captured `-uall` status contains **6286 entries**. Earlier in
the same read-only audit it contained 6281 entries with 475 unique untracked
paths; the final snapshot contains 480 unique
untracked paths. Files were being added concurrently. This is not a claim that
the entire primary checkout was frozen. Per-file stable-read flags and hashes
are retained in the JSON.

| Classification | Paths |
| --- | ---: |
| Modified but byte-identical to Dev | 34 |
| Untracked but byte-identical to Dev at the same path | 3567 |
| Deleted and already absent from Dev | 2152 |
| Modified and different from Dev | 27 |
| Untracked path collides with different Dev bytes | 20 |
| Untracked path absent from Dev | 480 |
| Deleted locally but still present in Dev | 6 |

The large status is primarily stale checkout state and retained authoring
material, not thousands of unfinished product features. Exact matches need no
second integration. The deleted-reference cleanup is already represented on
Dev for 2152 paths. Do not apply the six additional local deletions:

- `docs/distribution-local-only.json`
- `docs/newer/menu-webgl/FONT-NOTICE.txt`
- `docs/newer/menu-webgl/LICENSE`
- `docs/newer/menu-webgl/SOURCE.json`
- `games/shareware/pak0.pak`
- `shotgun.zip`

Those paths remain in the captured Dev tree; this audit grants no deletion
authority. Retain the current build inputs and attribution/policy records.

### Runtime findings: retain current Dev

**Water, power vision and cloak:** actual primary changes relative to its old
HEAD were already integrated in `f0c2f781` and their regression suites in
`04b8767e`. Those commit messages explicitly identify the source and scope.
Primary differs from current Dev because it lacks later large-map entity
protocol, unsigned sound entity, error-stack recovery, loader/readiness, visual
and audio work. Copying its core files would regress those features. Several
current primary post files are exact historical Dev blobs; remaining byte
novelty includes shortened old comments and older code mixtures, not a new
missing runtime feature. Preserve the primary tree; do not restage those older
implementations.

**Gremlin/enemy assets:** primary Gremlin is the retained 6x 1848x1014 candidate;
Dev SOURCE.json explicitly selects the owner-approved 4x 1232x676 output from
the same source. Primary's fitter also changes selected Dragon/Wrath/Mummy
factors back to 5x/6x and removes the later Armagon flash-padding/runtime policy.
The 6x Gremlin files, their extra normal payload and old recipe/test expectations
are superseded inputs, not a newer approved delivery. Current Dev enemy index
version62 supersedes primary version47. Feature provenance points to Bluey
T-718994ad; do not infer new acceptance from the older primary ledger.

**World materials:** primary texture index2026101312 is older than
Dev2026101810. It has zero primary-only texture or normal material keys, ten
older ordinary bindings and no new ordinary-variant identity; it omits 65 Dev
variant groups and the later second `rock3_8` identity. The 198 unique files in
`newer/textures/candidates-2026-10-17` are retained candidate/authoring files,
not a newly selected canonical runtime binding. Older normal registries include
previous skin/material samples; replacing the maintained registries would
remove the selected newer samples. Current Dev's session-generated-normal
readiness/fallback notes would also be lost by copying primary
`r_newertextures.js`.

The remaining unique authoring source/proof family includes material contact
sheets, rejected drafts, old acceptance records and historical recipes under
`tools/texture_sheets/sources`. This audit hashes them but does not classify
all images as accepted or ready to publish. Preserve them in place. A file's
absence from Dev is not proof of missing product behavior.

### Small unique non-runtime candidates

- `docs/menu-sound-review-2026-10-18.md`: analysis/folder-organization ledger for
  100 external menu recordings, preserving original names/hashes. It explicitly
  reports provisional signal-based classification, no auditory judgment, no
  product audio integration or release. Responsible analysis chat and next
  owner Brian are named in the ledger. Safe documentation candidate; it does
  not authorize automatically wiring those sounds.
- `tests/texture_q92_channels_test.js`: additional public channel-composition
  coverage for the already implemented Q92 scalar/XYZ route. It was not run by
  this read-only reviewer. The coordinator subsequently reports a byte-identical
  import and 9/9 passing; that result requires its own retained test receipt.

No new runtime hunk from the primary tree is recommended for this distribution.
Existing owner holds on experiments/candidates remain effective; this inventory
does not silently promote them to product acceptance.

## ci-gpu: stopped rock-edge work, not ready

`docs/handover-2026-10-14.md` is the current source of scope and constraints. It
quotes the owner's 14 October instruction to leave changes in place, stand down
and stop. It names **T-7c68f686 / RD1**. The exact preserved family is:

- Seven modified files: hooks, main renderer, world batches, install, G-buffer,
  shadows and rock shader.
- New `src/newer/render/r_rockedges.js`, `tests/rock_edges_test.js` and handover.

It implements real displaced rock edge bands, welded joins and displaced
shadow casters. Historical 5/5 and browser/map probes are recorded, but the
handover explicitly leaves independent review and final documentation unfinished.
Large-map build time had reached 29 seconds; an unqualified 20-50 second run
followed the spatial-grid change during concurrent compilation. It requires a
clean performance measurement. The triangle-budget cut can leave an edge step;
that known limit was not exercised by its tested maps. The requested E1M4 owner
view was not captured. The old Rock Trial app is explicitly outdated.

**Ready for integration: no.** Preserve the prototype and its evidence. Resuming
and qualifying it is separate owner-directed work; no test, build, staging or
source change was performed here. The coordinator's outstanding owner question
about explicit stops/parked work governs next action.

The handover's claim that FPS-position commit `6785e473` was not pushed is now
stale. It is an ancestor of current Dev and has no missing unique commit to
cherry-pick. Its feature is already included.

## Old Prod/Prod2 and cloak commits

- `907d5cde` enemy face overlays is explicitly integrated by Dev `55b8aa43`
  (message: from Prod907d5cd), followed by review correction `27761419`. Current
  `src/newer/render/enemy_face.js` and native save/spawn hooks retain the feature
  under the refactored architecture. Do not reapply the old flat-src patch.
- `3f2084c0` Rend the Veil is explicitly integrated by Dev `9fef6cfe` (message:
  brought from Prod3f2084c). Current rendering/gameplay modules and tests have
  evolved after conflict resolution. Direct commit ancestry is not the only
  integration proof; these source-attributed landings provide semantic custody.
- `f615db63` is explicitly parked, owner-decision-bound and unverified in its
  own message. Its old three-file cloak patch is not a missing delivery to
  resurrect. Later primary water/vision/cloak integration and regression suites
  are on Dev; primary `sv_cloak.js` is an exact historical Dev blob. Preserve
  the old ref and any unresolved owner decision without reviving older code.

## Gate boundary

Use current Dev plus independently reviewed, completed increments for the
consolidated distribution. Preserve all unrelated primary/ci-gpu content and
refs. This report neither claims the stopped rock work was resumed nor labels
its unresolved required checks as passed. It does not authorize release or
publication. The coordinator owns the exact staged candidate, maintained full
gate, resulting distribution and Dev merge/push receipts.
