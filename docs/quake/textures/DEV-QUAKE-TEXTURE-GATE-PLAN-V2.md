# Dev Quake gate plan v2: first introduction after later Dev commits

Plan only. Current committed base is `42770e6fd10fdcd6642902993ee80b4c008fb28c`; the stable pre-Quake-catalog anchor remains `260a3cc5551ed8a8d5b76b03d64a3253813fe420`. The three committed control blobs have exactly the same hashes as the original plan. Other-agent unstaged main controls were not read, copied or changed. The old plan is retained; this revision supersedes its literal-base absence exception and nonexistent review-set scope.

The smallest safe exception is a **conjunction**, evaluated against the actual pinned base/tree:

1. The known anchor is an ancestor of the actual base. The production anchor cannot be overridden by environment or bootstrap.
2. The clone is not shallow; a complete parent walk succeeds with no missing parents. Use real commit history, not replacement/graft/shortened views; disable lazy fetch and fail on any missing object or Git error.
3. A successful exact base-tree query proves the Quake catalog absent.
4. Successful `git log --full-history --format=%H <base> -- <exactcatalog>` is empty over **all ancestry**, including merged branches. Do not inspect only `anchor..base`. A previously created and removed catalog must fail permanently.
5. The exact staged tree contains a newly **added regular catalog blob**, with valid current Quake structure/custody. Missing, deleted, redirected or wrong-path catalog is not a first introduction.
6. The existing independent, actual-base-bound bootstrap explicitly authorizes this first introduction, naming the exact catalog path, staged blob SHA256 and stable anchor. Generic/missing/stale authority fails.

Only then write the private empty prior material baseline and record the observed history and authority in the final staged receipt. An existing catalog always uses its real base blob; a malformed existing baseline or any Git failure is never empty. Missing Hexen baseline continues to fail before children.

Read-only checks at committed42770e6 pass the history prerequisites: anchor ancestry, nonshallow repository, empty exact base-tree/catalog-history results, and a950-commit complete parent walk. This does **not** qualify staged addition, bootstrap authority or hook execution, which have not happened here.

The existing three-control extension, strict snapshot-only `--reference-root` mapping from reviewed bootstrap, family-specific mixed-codec custody, per-material typed ART proof checks and Hexen protections remain as proposed. Current actual scope includes only the trial HTML/JS, three Python CLIs/suites and producer fixture plus the exact campaign/policy paths. **Do not admit or invoke the unimplemented review-set helper/test.** Existing distribution Node tests still run.

Use a fresh full independent normal-Dev clone, inspect committed control blobs at its actual base, and independently review that base-bound bootstrap. An unrelated later Dev commit changes the evidence/base, not this stable anchor or code. Never copy live main controls, overwrite its index, relabel detached/worktree state or bypass the normal HTML-only hook.

Public cases must reject prior create/remove (also on merged history), shallow/incomplete/error history, unrelated anchor, missing/wrong staged addition and absent/stale/wrong-SHA initial authority, while accepting a later eligible descendant. Test observer and conjunction separately with fixture history; do not add a production anchor/allow-missing override for fixtures. Existing Hexen missing/malformed-baseline, symlink, control, environment, snapshot and publication cases remain.

[Complete revised options, exact scope, observations and tests](dev-quake-texture-gate-plan-v2.json).
