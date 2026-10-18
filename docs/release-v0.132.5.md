# Quaked 0.132.5

The owner requested a new Dev release, promotion of Prod to that exact release
commit, and verification that the downloadable app and GitHub Pages match while
the publisher completes without manual recovery.

This release carries the publisher repair from `24c10eed`: unpublished drafts are
discovered through a bounded authenticated inventory, validated against the selected
commit and bound to a numeric ID through publication. Matching interrupted uploads
resume without replacing accepted assets. Malformed or ambiguous responses stop
publication. The existing published-release reuse and promotion protections remain.
That Dev commit passed Distribution run `39165460210`; its first Intel checkout
failed on runner DNS/network access, and the unchanged commit passed the retry.

The release cut changes only the four package/Cargo version records to 0.132.5
and this note. Dependencies, publisher code, game code and artwork are unchanged.
Tauri continues to derive its version from package.json. The rock-face trial stays
excluded, and the texture enhancement campaign remains incomplete.

The release commit must pass the unchanged staged gate and its own successful Dev
Distribution push run. The installed, reviewed App controller then atomically
fast-forwards Prod and creates `v0.132.5` at that same full SHA. The main checkout
stays on Dev; a non-forced local branch fetch mirrors the verified remote Prod ref.
The [release procedure](prod-release-2026-10-18.md) preserves the history rules;
its v0.132.4 status is a historical snapshot preceding this release cut.

Acceptance requires successful source, web, both Mac, release and Pages jobs at
the selected commit. Retain the publisher job's successful step/log and artifact
provenance, with no operator-created draft, manual asset uploads or manual release
publication. A workflow retry may resume matching artifacts through the publisher;
it cannot be replaced with custom recovery operations or hidden as first-pass success.

Independent verification must download the actual public Mac ZIP and Pages HTML.
GitHub and canonical Pages `release.json` bytes must match, identifying the same
commit, version and tag. Verify ZIP, executable, native CI inventory and HTML hashes,
bundle version, universal architectures and static signature. This does not claim
gameplay, interactive Gatekeeper or notarization acceptance.

Operational receipts under `dist/release-v0.132.5/` retain the selected SHA, CI IDs,
App promotion/readbacks, automatic publisher evidence and public verification. A
successful ref update or running workflow alone is not accepted publication.
