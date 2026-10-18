# Authoring images under assets — 18 October 2026

Owner request: move remaining authoring images out of tools, update references,
test, commit to Dev and push without disturbing other agents. Source is the
owned clean Dev checkout `/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`.
The active texture owner was explicitly authorized for coordination, landed
01291eb5 after its full gate and released the source/build slot. This includes
the 302 new images absent from the first f560 inventory. No other agent's
checkout, index, source generation or parked trial was changed.

## Location and contracts

All 1,525 remaining tracked images (1,161,979,217 bytes) move from
`tools/texture_sheets/sources/<relative>` to
`assets/authoring/texture_sheets/sources/<relative>`. Three image formats occur:
PNG, JPEG and WebP. Bytes, names, relative image relationships and provenance
hashes are preserved. Lava Man's prior functional source folder stays put.
The exact [relocation inventory](evidence/authoring-images-assets-2026-10-18/relocation.json)
pins every image and the 1,302 adjacent script/record before-hashes.

Images move; existing recipes, prompts, receipts and archived producer programs
remain in tools without byte changes. Recorded image names stay logical IDs
through exact entries in the existing assets/layout.json authority. No new
resolver, symlink, fallback image tree or renderer/math change is introduced.
The current Python fit/head/level/wizard/Shambler/sculpt readers resolve the
complete source filename at their existing resource_path boundary. Directory
resolution alone cannot map an image separately from its JSON siblings.

The HTTP server uses the same resource_path map after standard URL path
normalization. Canonical/recorded image requests and byte ranges work; owned
game-root handling and rejection of out-of-root aliases/traversal are verified.
The gameplay preview resolves its original-image URL before fetching. The
JavaScript resolver builds its inverse exact table once, preserving first-entry
precedence, to avoid scanning 1,525 authoring identities for every runtime URL.
Neither product inventory traverses assets/authoring.

## Trustworthy producer and replay checks

Five receipt-pinned producer programs remain byte-identical. The already
qualified update_level_sheets.py successor adds exactly one image-read lookup.
Its preceding full source is retained in the evidence directory; the maintained
Q92 check reconstructs the entire current file with that one substitution before
following the previous producer proof. No historical hash was repinned, no
height/mask/encoding code changed and no assertion was loosened.

Historical CLI fixtures needing their original workspace structure materialize
only explicit, hash-verified inputs in disposable scratch folders through the
existing resource resolver. They invoke the unchanged producer and retain all
independent pixel/geometry assertions. They do not add aliases or tracked copies
for runtime candidates folders. Another owner is separately retiring those
folders and updating comparison policy; this migration does not preempt it.
Subprocess image arguments use resolved physical files. Independent Pillow
scalar/normal arithmetic stays unchanged and uses the shared locator only for
opening the actual inputs.

## Verification and current ownership

Final image/layout/public HTTP contracts passed 8/8; the standalone HTTP suite
passed 4/4. Public fitter CLI passed 4/4; strict/photographic/atlas regressions
passed 17/17. The saved demon importer check passed all 131,072 R16 samples and
three bindings. Quiet/cable and six-realism CLI replays passed with unchanged
output hashes and independent protected-region/phase tests. Strict Q92 passed
7/7; owner Q92, registration and demon-relief checks passed 16/16. Initial
sandbox/fixture/source-location failures are retained as failed attempts and
were corrected, not relabeled. Independent read-only review approved the
implementation with no blocking findings, checking every moved image and all
1,302 preserved script/record blobs against 01291eb5. Normal commit gate and
push remain next.
Independent public HTTP verification passed 4/4 after strengthening the
outside-game-root sentinel; both traversal checks target a real forbidden file.
The first exact staged snapshot passed all checks; the still-unpushed commit
will be amended with this stronger test and repeat the maintained full gate.
Final gate and publication receipts will be retained under ignored dist/staged.

Bluey whoami failed with storage_error 9ed30cb44b034b03b3bb91ad79120192, with no
acknowledged card mutation. This session owns the obligation in this local
ledger while storage is unavailable. Update here promptly as verification/
landing changes, and reconcile onto the existing card when Bluey recovers.
Primary remains mixed WIP: preserve its additional images/recipes/scripts, use
per-path before hashes and retain preimages before relocating its own bytes.
Never overwrite pending image/recipe bodies from the clean Dev copy. Leave
primary HEAD/index and natural-surface/rock-edge holds unchanged.
