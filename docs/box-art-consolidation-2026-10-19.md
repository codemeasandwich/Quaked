# Box-art consolidation — 19 October 2026

Owner scope: move current game/extension artwork into the project for distribution,
remove unnecessary duplicates and re-inventory the newly supplied images.
Baseline Dev `d6d33b6a`. Concurrent Hexen texture authoring is excluded.

## Inventory and decisions

The bounded inventory covers top-level PNG/JPG/JPEG/WebP/GIF/AVIF files in the
immediate game folders under `/Users/bri/quaked`. Nested game textures, archives,
music artwork and unrelated root-level concept/reference images are excluded.
Quake's launch-promotion `poster.jpg` remains untouched under the owner's earlier
explicit hold. No game directory is removed, including empty artwork-only folders.

The inventory found 42 scoped image paths. Excluding the held poster leaves
41 move paths with 29 distinct images and 12 redundant local copies. Four new
faces are verified visually and by hash: Quoth's real front and Dimension of the
Machine's front, back and spine. These join the existing defaults, yielding
29 runtime faces. The former Machine JPEG remains an authoring alternate.

The owner renamed q30's former cover to `screenshots.png`; it is a screenshot
collage. Its unchanged bytes now belong under authoring, and its default cover
mapping is removed. Quaked's `back-side.png` is preserved intact as a combined
source. No Quaked back/spine has been generated or extracted. Posters, alternate
scans and bottom flaps are retained unchanged as source material. No image pixels,
encoding, crop, colour or dimensions are modified.

## Canonical locations and deduplication

- `assets/boxes/manifest.json` is the current inventory of 29 shipped faces.
- `assets/authoring/box_art` holds 13 unique source images, excluded from packaging.
- Every scoped source path maps to one canonical project path and SHA-256 in the
  [move plan](evidence/box-art-consolidation-2026-10-19/move-plan.json).
- All 42 canonical project images have distinct content hashes. Exact local
  duplicates reuse the same canonical file rather than creating another copy.

The previous 14-import receipt is historical. Its original paths may now map to
authoring material; it must not be mistaken for the current live default list.
The existing naming/override contract is unchanged: front/back/spine, with
cover/side aliases, case-insensitive supported extensions, and per-face fallbacks.
The native shelf therefore uses the bundled defaults after these local copies
are removed, while users can still add fresh overrides later.

## Verification and cleanup fence

The plan records a bounded direct-reference scan of top-level text/config/docs in
each owning game folder; no direct filename references were found. Active source
and maintained tests are updated to the current live paths. Historical evidence
retains original source paths deliberately, linked through the move plan.

Copy every unique source unchanged and verify its canonical destination first.
Required tests and the normal exact-index gate must pass, and the destination
files must be retained in a pushed Git commit before local cleanup. Immediately
before each unlink, verify the local source, current destination and pushed Git
blob all match the recorded SHA-256. Preserve any changed or unplanned file.
Remove individual files only; retain directories and every non-image game file.

The post-push filesystem cleanup receipt is retained with the named build under
`dist`, recording actual removed paths, hashes, exclusions and restoration
destinations. The tracked plan remains the immutable provenance of the move.

Independent planning reviewed the inventory, held poster, root-image exclusions,
game-folder retention and no-art native fallback. Public checks cover the new
default faces, exact copied bytes, archive retention, one canonical copy per hash,
and exclusion of authoring material from the real desktop collector. Browser
verification must use shipped defaults with no local-art endpoint doubles.

Independent results: 13/13 shelf checks and 6/6 packaging/catalogue checks pass.
The real adapter's browser trial passes 29/29, with the new Quoth and Machine PNG
defaults and Turn Over visually checked without local-art conversions. The q30
collage no longer appears as a cover. One positive override still replaces only
its selected face. [Evidence identities](evidence/box-art-consolidation-2026-10-19/manifest.json)
bind the source, inventory, logs and trial. Full gated builds, pushed retention and
filesystem cleanup are subsequent steps recorded in the named release receipt.

Bluey identity still fails with `storage_error`, correlation
`6f25a7374840487082332ddf30db9024`, mutation outcome unknown and automatic retry
false. No card update is claimed. This chat owns the move, verification and
cleanup; reconcile this ledger to the existing card when storage recovers.
