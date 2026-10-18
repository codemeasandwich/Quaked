# Full project integration and distribution — 18 October 2026

## Owner authority and delivery contract

The owner explicitly requests a complete distribution build based on all latest
project work and states that the work must first be merged into Dev. This session
owns reconciliation, integration, verification, a normal Dev push and local web
and universal Mac distribution artifacts. No tag, GitHub release or production
deployment is requested. Source worktrees, parked refs, stashes and evidence are
preserved; old paths or predecessor files are not blindly copied over current Dev.

## Current source inventory and decisions

Fetched origin/Dev is `ab430e348a1b16c4e93df3c518cebcdb8ad2a1cc`, including the
recent water/HUD fixes, player/environment/electrical sounds and texture batches.
The reused integration worktree is
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, branch
`codex/demo-water-sounds`. The primary checkout remains untouched.

The completed Bestiary distribution branch `46aed737` and HUD sprite retirement
branch `f60eee3d` have been merged without a commit, preserving both as merge
parents. The tested Milky Way sky has been reapplied on top. Its original 40 files
were first saved with SHA256 values and a tar archive at
`/private/tmp/quaked-full-distribution-20261018/sky-before-integration.*`; recovery
stash `9ee94c59988499c52c4d735e8ab666f407582653` remains retained after successful
application. No prior stash was dropped or changed.

Independent read-only inventories cover registered worktrees and branch-only
changes. Raw inventory evidence lives in
`docs/evidence/full-distribution-2026-10-18`. Many older dirty files are identical
to Dev or superseded by newer accepted changes; applying their whole trees would
restore old artwork or remove landed fixes. The old texture commits have known
landed successors, and the older Armagon/Eel lane is not a source of newer art.

An owner clarification is pending for explicitly parked/stopped experiments
(cloak-combination and natural-surface/rock-edge trials). The question distinguishes
preserving the prior holds from resuming and finishing those experiments; elapsed
time is not an answer. Independent agents are also identifying any genuinely new
unfinished implementation without claiming that a RED test-only branch is a
finished feature. Work on the unambiguous completed integration continues.

## Verification and distribution plan

Verify the combined sky, HUD fallback/startup pack and shared Bestiary optimiser
through their public interfaces. Resolve actual required failures before invoking
the maintained exact-index commit hook. It tests distribution contracts, web and
desktop builds, Rust, maintained engine/LAN behavior and both Mac architectures.
Retain the prior staged receipt/output before the hook replaces dist/staged.
The committed tree must equal the staged receipt and both inventory source IDs.

After a normal push, verify refs/heads/Dev independently, then archive the signed
universal app using tools/distribution/archive-mac.mjs with the exact staged native
inventory. Verify bundle assets, universal architectures, ad-hoc signature, ZIP
integrity and SHA256. Preserve old archives before generating an identically named
version. Local build success, public download qualification and owner acceptance
remain distinct. A complete distribution includes the web site/data and Mac ZIP,
checksums, source identity and build receipts.

## Coordination ledger

Responsible owner: this Codex session. Bluey onboarding has been read. A fresh
supported agent_whoami call failed enrollment with storage_error, correlation
`35394fa01e474d6f9eb4b026be6b9190`, mutation outcome unknown. No card update,
assignment or durable worker execution is claimed. This ledger retains scope,
source identities, custody, checks, blockers and next actions until the appropriate
existing integration card can be reconciled when Bluey returns.

Current next action: finish unique-work classification, receive the owner ruling
on explicit holds, verify and review the combined candidate, then run the enforced
build gate, commit/push Dev and retain the complete local distributions. Keep a
concrete update here at least every ten minutes while board storage is unavailable.

## Integration checkpoint before the enforced gate

The completed candidate now also retains the menu classification ledger and the
new public texture-channel coverage, copied byte-identically from the primary
checkout (see primary-completed-additions.json). Current focused HUD/sky/water/
face checks pass 31/31; shared distribution contracts pass 59/59. Independent
combined review and an additional 7/7 real asset/codec/profile checks found no
blocking issue. The texture-channel checks are run independently and included in
the maintained gate going forward.

The independent inventory confirms that primary runtime deviations are old
predecessors, not unmerged features. Face overlays and Rend the Veil from the old
Prod refs were already ported with explicit commit provenance; cloak/vision
integration is already on Dev. Candidate texture files have no new current
manifest binding. The Lava Man RED test-only checkpoints and stopped rock-edge
trial remain visible unfinished obligations, not completed features. Superseded
and held refs remain untouched. The pending question can authorize resuming held
experiments; it does not delay the requested build of current completed work and
prior holds remain in force without being treated as a new answer.

Current next owner/action: this session runs the unchanged exact-index gate,
verifies both generated inventories against the commit, lands the combined commit
on Dev with a normal push and readback, and creates verified local web/Mac archives.
The owner then tries the complete combined build. No held experiment is silently
resurrected, no source tree is cleaned, and no production release/tag is implied.

## Owner ruling and source closure

The owner confirmed that natural-surface and rock-edge investigations must remain
safe and parked; everything else current may be integrated. Cloak/water work was
verified already landed in f0c2f781 and its tests in 04b8767e. The superseded local
`cloak` branch name was removed after retaining its exact tip f615db63 under
`refs/archive/full-distribution-20261018/cloak`.

The owner also requested removal of the Lava Man branch if superseded. The delivered
Lava Man implementation 110ad1fb is already an ancestor of Dev; its old delivery
branch `codex/aztec-photographic` was removed, with its exact tip retained under
`refs/archive/full-distribution-20261018/lavaman-delivered`. The later
`codex/lavaman-uv-flow` branch contains RED tests for an unimplemented alternative,
not a later delivered renderer; it remains safely retained with its pending feature
record. No RED tests were relabeled as passing or treated as a finished runtime
change. The owner was told this distinction. No source worktree was removed.

The four latest official-campaign ledger/closure records were copied with exact
hashes from their active worktree. They preserve the completed publication receipts
and the status of held/unbound drafts; they do not register those unfinished images
as runtime replacements. Public texture-channel tests pass 9/9 in current code.
The completed integration is now ready for its immutable exact-index build gate.
