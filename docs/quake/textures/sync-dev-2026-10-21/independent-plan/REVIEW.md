# Independent integration-plan review

21 October 2026. Verdict: **PASS for the bounded proposal, subject to exact staged-control review and the maintained checks below.** This is not an implementation, staged-tree, successful merge, publication, pull or completion receipt. No refs, shared controls, index, assets or provider state were changed by this reviewer.

## Scope

The owner's latest direction authorizes committing this lane's owned work to Dev and bringing the resulting Dev into fc24. The proposed integration correctly stops texture authoring: the three legacy colour candidates remain uninstalled, the tech10_3 spatial HOLD remains visible, and preserving the Ogre returned source does not qualify or register it.

The exact model-source additions belong in `QUAKE_EXACT`, with no directory-prefix expansion:

```text
assets/authoring/texture_sheets/sources/quake-model-skins-2026-10-21/ogre/source-001/issued.json
assets/authoring/texture_sheets/sources/quake-model-skins-2026-10-21/ogre/source-001/retained.json
assets/authoring/texture_sheets/sources/quake-model-skins-2026-10-21/ogre/source-001/returned-source.png
```

These files are a source-custody package: issuance, actual-return retention and returned pixels. Their bytes and dimensions are recorded in the independent observation. Allowing them through the existing texture/HTML checkpoint admits preservation, not a new model pipeline, artwork acceptance, a runtime catalogue change or authority for another source. The returned 1463×1075 pixels do not become an adequate 8× native 264×194 source by being committed.

Required maintained scope regression: admit **all three** exact files; reject `ogre/source-002/issued.json`, a nonenumerated sibling such as `ogre/source-001/extra.json`, another model's `source-001/issued.json`, and representative engine paths. Preserve existing deletion/rename endpoint, symlink/submodule and exact control-bootstrap refusals. A single assertion about `texturePath` is weaker than the existing fixture's actual staged-change/`qualifyTextureScope` interface; use that established interface for this addition.

## Exact source state independently observed

- fc24 HEAD: `713b47d322f0674f154a70ec4baebd4566905d41`.
- Local Dev: `de49ef8f6eb130011fe9ea170d881c756229dc74`, retaining `6565be3f...` and `f9d66078...`.
- Remote-tracking Dev: `ed603b16f261e475583ffa95bb26b19f87e7a38e`.
- Common ancestor: `42770e6fd10fdcd6642902993ee80b4c008fb28c`.
- The remote side changes none of the three gate controls or `docs/quake` relative to that common ancestor. Preserve its engine changes in a true merge; copying fc24's entire old tree over remote Dev would lose unrelated product work.
- A fresh read counted 156 commits in `Dev..origin/Dev`, including 153 nonmerge commits. Earlier shorthand counts are not exact merge evidence.

The preliminary overlay is explicitly an inventory, not the final staged tree. It contains 1,135 changed files, 273,918,966 bytes and no missing baseline paths. It contains none of the inherited dirty Hexen paths and no changed `docs/texture-tier-standard.md` row. Its broad model prefix describes inventory selection; it must not become the gate's allowlist. Recompute and seal the final exact path/blob/hash manifest after the small control/test edit and this review's documentation are ready. Admit no deletion merely because an inventory lacks a file.

Committed local Dev history and inherited dirty WIP are distinct. The three existing local Dev commits must be preserved by ancestry, including their already committed Hexen work. The dirty Hexen catalogue/status/progress/queue and current shared-standard amendments must remain protected from accidental inclusion or loss. Preserve their current filesystem bytes and the real index independently before integration.

## Gate and first-catalogue bootstrap

The existing `gateCommands('dev-texture','darwin')` currently returns **17 commands**: eleven maintained Python texture suites, two family catalogue-custody checks, `npm ci --ignore-scripts`, distribution tests, web build and HTML/site verification. It contains no cargo, desktop build, native engine tests or Tauri packaging. This reviewer enumerated the commands; it did **not** execute those seventeen checks. Run the normal hook against the exact final tree and retain its real result; do not disable, trim or relabel required failures.

The scope addition changes a gate control, so the current independent-bootstrap mechanism still applies. Bind the actual integration HEAD/base and exact staged hashes of **all changed controls**; preserve the check that executing control bytes equal staged control bytes. This plan review does not sign unseen final bytes. The new regression and scope edit need their actual public-interface results before publication.

The current fixed anchor remains `260a3cc5551ed8a8d5b76b03d64a3253813fe420`. Running the existing read-only history observer against exact remote Dev `ed603b16...` established: nonshallow history, complete 1,106-commit parent graph, anchor reachable, Quake catalogue absent at the base, and no historical commits for that catalogue. Its graph SHA-256 is `b910d0b6e31b1f4ed9b539d879618e926b04df0cc58a358312e8526f918d4a28`.

Therefore the already implemented first-catalogue branch is applicable **if that exact fresh remote commit is the actual gate base**. Bind the staged catalogue addition/hash and genuine owner authority through the existing bootstrap; do not modify the anchor, fabricate absence, ignore a failed read or omit the history witness. If the integration gate base changes to a commit already containing the catalogue, use the inherited-catalogue branch and do not supply first-catalogue authority. Re-read the base rather than transplanting this receipt onto a different commit.

Catalogue custody proves sealed relationships and current staged bytes. It does not turn held source/master candidates into accepted artwork, satisfy missing 8× material/relief evidence or install the legacy repair candidates.

## Landing and fc24 synchronization proof

Use the isolated exact merged tree and normal Dev hook, preserve both histories, and review the merge result against each parent. The post-merge tree must retain remote engine changes and the three local committed Dev increments, plus the exact owned overlay. Record the base, both merge parents, committed tree and hook receipt. Do not claim the merge is complete because an overlay can be constructed or a plan passed.

Before pushing, recheck current remote Dev and require a non-force update that preserves its ancestry. An advance requires reconciliation and the affected checks, not overwriting the remote. A successful push needs remote readback of the exact resulting commit.

Before bringing Dev into fc24, preserve its dirty tracked/index/untracked/ignored owned evidence and inherited foreign work with exact identity/hash receipts. Prefer the ordinary safe fast-forward when the worktree permits it; if protected dirty files block that operation, use the already prepared preservation plan and verify every restored byte. A destructive reset, forced checkout, broad clean, automatic deletion or unverified stash is not implicit in “pull Dev.” Do not delete retained failing sources or candidates as integration cleanup.

After synchronization, verify fc24 HEAD/Dev ancestry against the published commit, rehash the protected dirty material, and report whether any preserved work remains uncommitted. Keep landing, successful synchronization, runtime acceptance and release distinct. The owner authorized this Dev integration; it does not authorize a native build, Prod promotion or release.

Root remains responsible for exact implementation review, board/ledger reconciliation, actual checks and final publication/preservation receipts. This reviewer stopped new texture work as directed.
