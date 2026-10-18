# Quaked 0.132.4

Requested by the owner on 18 October 2026: release the current Dev work only after
CI passes, then fast-forward Prod to the exact release commit so the downloadable
application and GitHub Pages share its version and source.

This release includes the accepted texture/relief, sound, rendering and resource
layout work consolidated on Dev since v0.132.3, together with the protected release
pipeline. The isolated rock-face trial remains excluded. Texture enhancement is
an ongoing campaign; this release does not declare complete game/expansion coverage.

The release cut updates the package and Cargo version records to 0.132.4 without
changing dependencies, game code or artwork. Tauri continues to derive its version
from package.json. The preceding Dev commit `69ff9be8` passed Distribution run
`39150178037`, including web and both Mac jobs, before these version edits.

The release commit must pass the normal staged gate and its own successful Dev
Distribution push run. The installed, hash-pinned promotion controller then
atomically fast-forwards Prod and creates `v0.132.4` at that same full SHA. The
[release procedure](prod-release-2026-10-18.md) retains all history protections;
there is no commit made directly on Prod or independent tag publication path.

Publication is accepted only after the Prod workflow's source, web, both Mac,
release and Pages jobs succeed. GitHub release `release.json` and the public Pages
copy must be byte-identical and identify the selected SHA/version. The actual Mac
ZIP, executable, native inventory receipt and deployed HTML must match their
recorded hashes; bundle version and universal architectures are checked too.

Operational receipts under `dist/release-v0.132.4/` record the selected commit,
workflow IDs, promotion readbacks and downloaded-artifact evidence. A running
workflow or successful ref update alone is not publication acceptance. Partial
publication remains at the same immutable commit/tag and is retried using retained
matching artifacts, without overwriting a published asset or rewriting history.
