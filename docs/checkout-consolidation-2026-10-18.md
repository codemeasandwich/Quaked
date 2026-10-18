# Quaked checkout consolidation, 18 October 2026

The owner requested one primary `Dev` checkout at `/Users/bri/SOURCE/Quaked`, retaining `Prod` and the rock-face trial. Other project chats were paused. Keep current qualified behavior when older branch versions have explicit successors.

## Qualified baseline and content decisions

`091818ccae833727b0c5c0d6bed80eb2ef6ea90d`, tree `0c62be43db1809f46705f45dd8c6010a42898599`, is the qualified baseline. Its unchanged normal commit gate passed 70 distribution checks, 38 Rust tests, 162 engine tests, web/desktop builds and the universal Mac build. It retires accepted candidate folders while retaining 114 generated bindings, 111 encoder records, 555 official maps and native original references. Texture comparison remains at half and quarter original resolution; replacements retain the 4× dimensions and Q92 standard.

Independent [branch review](evidence/consolidation-2026-10-18/quaked-global-branch-sync-audit.json), [working source review](evidence/consolidation-2026-10-18/quaked-root-current-delta-review.json) and [document/asset review](evidence/consolidation-2026-10-18/quaked-root-docs-assets-disposition-review.json) distinguish landed, equivalent, superseded and protected work. Active primary source is already represented by this baseline. Keep the qualified 4× Gremlin, texture-flow Lava Man, newer photographic enemy artwork, canonical resource paths and current texture contracts. Older 6× maps, mesh-motion tests, legacy aliases and candidate-only checks are recoverable history.

Four reviewed planning records are integrated: [Hexen II support plan](hexen2-support-plan.md), [input inventory](hexen2/plan-inputs.json), [independent plan review](hexen2/plan-review.md), and [paired UQE review](hexen2/uqe-overlap-review.md). Their pinned inputs remain historical provenance; only a redundant final blank line in the review record was normalized. These document design review only; no Hexen II implementation or runtime acceptance is delivered.

The earlier removal of feature notes, examples, `docs/index.md` and `docs/technical-notes.md` in `cda41fc7` is preserved. The old index generator/checker targets those deleted entry documents. New records are linked directly from the README; the historical reference tree is not regenerated.

## Both rock prototypes remain trials

The [exclusion review](evidence/consolidation-2026-10-18/quaked-global-trial-exclusions.json) identifies both experiments by source contracts. Qualified Rockfield behavior stays in Dev.

- Newer rock-edge work remains at `/Users/bri/worktrees/Quaked/Dev/ci-gpu`, renamed from `main-reconcile` to `codex/rock-face-trial`. Base: `6785e4736d0d299536ef77014173d1fdcc69bb32`. Its seven modified source files, new module/test and handover remain unchanged as uncommitted trial work.
- Older natural-surface/connected-rock work remains recoverable at `51a547bd09006d18c71ed1a3304b9b34c288c0bb` in the complete bundle below. A standalone bare clone restored exact tree `136880fe855da0b50130d7c5e063d198914647e6` before its separate local branch is retired.
- Neither prototype is merged, activated, accepted or qualified in Dev. The older prototype is not superseded by the newer. External trial captures and the trial application remain retained.

## Recovery and build custody

Recovery root: `/Users/bri/build/quaked-consolidation-retained-20261018/`.

| Record | Purpose |
| --- | --- |
| `all-refs-before.bundle` | Complete branch/archive/stash history, including the older trial. SHA256: `737072e85ca44cf32484b3056ac6826f166fa76cc23ad057e7812ad2a80194d4`. |
| `refs-before.txt`, `worktrees-before.txt` | Initial identities. |
| `primary-index-before`, `primary-worktree-before.tar`, `primary-worktree-before.json` | Exact primary staging index and 11,538 current nonignored file preimages; archive readback verified. |
| `primary-current-vs-qualified-dev.json`, `primary-extra-files-disposition.json`, `primary-local-only-files/` | Bytewise classification, candidate retirement and retained alternate source/authoring/evidence files. |
| `worktree-N/custody.json`, `working-files.tar`, `status.nul` | Secondary identities, staging/working deltas and verified preimages. `N=8` is newer trial; `N=9` records the abandoned initializing checkout and its absent index. |
| `trial-custody.json`, `trial-branch-rename.json` | Both trial identities, restore proof and unchanged newer working files. |
| `candidate-builds/`, `faces-authoring-builds/`, `unified-assets-builds/`, `bestiary-builds/` | Qualified outputs and verification moved atomically out of retiring worktrees; every file retained its inode, size and modification time. |
| `candidate-publication/`, `build-relocations.json` | Normal-gate receipt and build custody. |
| `CONSOLIDATION.md`, `completion.json` | Local progress and final checkout/refs/remote verification. Consult the completion receipt for final state. |

Owned game installations are not removed or redistributed. Ignored primary references/experiments, existing stash history and archived source refs remain preserved. Local publication pointers were repaired after the authoring-image build moved.

Restore the older prototype into a separate temporary bare repository using `git clone --bare --single-branch --branch codex/natural-surfaces-trial /Users/bri/build/quaked-consolidation-retained-20261018/all-refs-before.bundle /private/tmp/quaked-old-rock-recovery.git`. Restore working files only with their recorded base/index; do not apply older snapshots blindly over Dev.

## Limits

`Prod` remains fixed at `3f2084c043eec0108bc70f12fd47f4d5060a53ff`. No Prod release, release tag or trial development is authorized by this cleanup. The original/expansion texture campaign remains unfinished.

Bluey identity recovery is unavailable: `agent_whoami` reports this session retired, and earlier same-session reactivation failed in storage. No assignment, card update or worker launch is claimed. The initiating coordinator owns reconciliation; progress and final evidence remain in the local ledger until service identity recovery works.
