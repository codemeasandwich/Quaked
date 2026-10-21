# Foreign Hexen working-state preservation review

Read-only comparison in physical worktree `fc24`, old HEAD `713b47d322f0674f154a70ec4baebd4566905d41`, against prepared normal-merge tree `2efcdb14248ea605ed09d0cbc457cf0ce47fcc47` in `/private/tmp/quaked-sync-dev-20261021-fc24`. That clone has HEAD `ed603b16f261e475583ffa95bb26b19f87e7a38e` and MERGE_HEAD `de49ef8f6eb130011fe9ea170d881c756229dc74`. This audit does not establish the later commit/ref; root must bind the final integration identity separately.

**350 scoped dirty/untracked files,122,118,380 bytes:**344 match incoming Git blob and mode exactly; six differ. No file changed during its initial read. All191 asset batch007 files,58 asset batch008 files,70 lower-case batch007 documentation/evidence files and18 batch008 documentation/evidence files match incoming exactly. These group counts overlap the broader docs count; do not add that broader count again. The full inventory covers all350 paths, not directory-name guesses.

|Different working file|Finding|
|---|---|
|Hexen source `catalog.json`|All47 working material rows are exact members of incoming68; incoming adds21. Exact entire working file already exists in commit8f0e96bc, verified as an ancestor of clone HEAD.|
|`GOAL.md`|Exact entire working file exists in8f0e96bc; incoming advances the stated workflow and campaign snapshot.|
|`campaign-status.json`|Exact entire working file exists in8f0e96bc; incoming ledger records later68-state.|
|`world-queue.csv`|Both have980 rows in the same order; exactly21 fields change pending→reviewed. No other column changes. Exact working file exists in8f0e96bc.|
|`HANDOVER.md`|Incoming178 lines retain all103 working lines in order, with75 inserted lines and zero replacements/deletions. Entire old file is also retained separately here.|
|`progress.json`|Exact working blob was not found in reachable path history. It retains historical47-state/live-cell436 metadata; incoming705-line ledger has all old top-level keys but advanced values and additions. Preserve the full old snapshot; do not reapply its old queue/handles as current state.|

“Earlier” does not mean disposable. Exact copies of **all six differing files** are in `retained-working-bytes/<original repository path>` and readback SHA256s are recorded in [preservation-plan.json](preservation-plan.json). Those are new documentation custody copies; foreign originals, index, refs, stash, primary checkout and service state were untouched. [three-way.json](three-way.json) pins every working byte hash, blob, mode, old HEAD object and incoming object. [compare.py](compare.py) reproduces the read-only inventory.

There are five modified tracked files and345 untracked files. Every one of those345 untracked paths becomes a tracked file in incoming, so a blind pull/checkout may refuse overlap. The precise scoped in-place route is:

1. Rehash this exact350-path allowlist and stop on drift. Preserve verified path/byte/mode custody outside the physical checkout before moving or restoring any original. The six copies here and344 exact incoming blobs prove available content but do not themselves execute that external custody step.
2. After verified custody, move only the345 listed untracked overlaps into retained custody; restore only the five modified tracked paths to old HEAD713b. Do not delete, blanket-stash, autostash, clean, hard-reset or stage foreign working files. Root owns these later synchronization mutations; this reviewer performed none.
3. Resolve/commit exact owned Quake paths separately, then fast-forward fc24 normally to the finalized integrated Dev. If Git refuses a remaining conflict, record and resolve the actual path. Preserve the complete original custody while doing so.
4. Keep incoming68-state ledgers active. Retain the old six snapshots as history; do not blindly restore their47-state over current Dev. Rehash incoming files and all retained original identities before claiming preservation and synchronization.

Attaching the fresh clone while leaving fc24 intact is an even less disruptive preservation option, but does not by itself satisfy the owner's literal request to pull Dev into physical fc24. Exact current-state verification and any final sync are root's next action. This review neither qualifies foreign Hexen artwork nor grants release/cleanup authority.
