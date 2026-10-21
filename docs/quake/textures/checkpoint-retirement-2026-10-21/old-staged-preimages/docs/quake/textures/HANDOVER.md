# Quake texture handover

Updated 20 October 2026. The full Quake and official-expansion campaign remains **active**. This is a verified authoring increment, not campaign completion or release.

Read [MISSION.md](MISSION.md), [progress.json](progress.json), repository AGENTS and the texture-authoring skill. Quake now requires unchanged Low, default Mid at 4× and High at 8× from one retained RGB/full-precision scalar master. Colour is lossy WebP Q92/method 6; height, XYZ normals and qualified masks are lossless WebP/method 6. Exact decoded eight-bit channels do not imply zero float quantization. Hexen remains a separate agent's lane.

## Verified increment

The additive `derive_quake_texture_tiers.py` and `build_quake_texture_batch_review.py` reuse unchanged numerical and panel helpers. Historical producers remain byte-identical, preserving pinned master replay and Hexen behaviour.

Independent public suites pass 9 derive and 6 review tests. A real native-to-master provenance gap was reproduced and fixed. RED evidence, the failed producer and reproducer, a JPEG test-oracle failure and GREEN results are retained. The maintained derive test pins exactly seven tracked producers in `tests/fixtures/quake_codec_protected_producers.json`. It also passes in an isolated source projection without dated documents, authoring assets, Git or the inherited motif tool. Separate local evidence preserves the broader eight-producer custody check.

Five candidates were re-exported directly from retained masters: ten colour files are byte-identical to prior Q92 exports, and forty VP8L data files are exact to independent intended-channel reconstruction. All 217 protected producer, legacy map, master and inherited Hexen hashes remain unchanged. Five unchanged legacy suites pass. Fresh post-cleanup verification passes all fifty maps.

The review supplement reconstructs twenty complete canvases and twenty-one CLI files. Ninety material and label rectangles are exact. Any JPEG variance is confined to the documented unused 40×16 tail; no tolerance applies to actual textures or populated review pixels.

`church1` and `maya1_9` pass affected independent art review at Mid 512×512 and High 1024×1024. Fresh height/XYZ, opposed lights, selected face/joint ordering, repeats/corners and both-input BOX 64/32 comparisons were reviewed. The canonical authoring catalog points to their new tier receipts: two masters, four tiers and twenty physical maps meet the current mission offline.

Evidence:

- [Actual codec and source proof](codec-transition-actual-public.json)
- [Actual review provenance](codec-transition-actual-review-public.json)
- [Affected stone art review](codec-transition-stones-art-review.json)
- [Legacy suites](codec-transition-legacy-suites.json)
- [Portable public tests](codec-transition-portable-public.json)
- [Post-cleanup verification](codec-transition-post-cleanup-public.json)

The schema-3 descriptor is `codec-transition-batch-v1.json`. The review index is `assets/authoring/texture_sheets/sources/quake-world-2026-10-20/codec-transition-v1-review/index.html`. Runtime bindings still use historical 4× assets: no selectable in-game 8× mode, owner acceptance, new Dev/CI qualification or release is established by these authoring receipts.

## Holds and next work

The three texture agents returned `city8_2`, `rock3_2` and `wwall1_1`. All three remain **ART HOLD for introduced X repeat splices through stone faces**. Material, layout, half/quarter similarity and selected physical-depth checks pass. Lossless data-map compliance does not accept their geometry. Preserve intentional Y course joints and wwall's intentional upper X joint. See `parallel-020/root-independent-art-before-codec.json` and its exact X-join diagnostics.

The owner corrected the initial twenty-stream request to **at most three concurrent agents**. Only these three texture agents were launched. Seventeen other proposed names were never launched and are no longer a twenty-worker queue. The directory name preserves that superseded intake history. Assignment/result records are in `parallel-020/workstreams.json`.

[Independent X repair plan](parallel-020/x-boundary-repair-plan.json): add a guarded X adapter that reuses the unchanged `periodic_y` operator on transposed RGB and transposes back. Do not edit pinned Y, prepare, derive or craft producers. A source/master-only proof is ready at `codec-transition-x-source-master-public.json`, SHA `2f0aba24f7102319fd9160d08e79a69adaf38d0c9062c0d1a62b1711e104bb5d`. Its rows bind native ID, name, edition, master path/hash and three exact prepare CLI replays; it excludes artistic acceptance. Implement independent tests and code review before one bounded same-source trial per texture. Smooth intensity correction may leave a geometric splice unresolved; retain HOLD if it does. Re-author final relief, derive both mixed-codec tiers and review actual results.

`cop2_5` and `metal9_4` remain separate coordinator-owned holds for excessively embossed oxidation and Y cutoffs. Same-source Y registration exists. The [metal relief plan](batch-001-metal-relief-reuse-plan.json) calls for guarded fine-detail relief with height 1 as the zero-POM datum and small reviewed amplitudes. Reducing normal strength alone leaves incorrect full-depth parallax. Neither metal has accepted enhanced tiers.

## Scope and preservation

The full scope is Quake, Scourge of Armagon, Dissolution of Eternity, Dimension of the Past and Dimension of the Machine, including all native texture families. Legacy triage reports 967 ordinary missing-art actions and 483 catalogued ordinary dimension-assessment actions. These are not complete strong-identity 8× or all-family counts. The old auditor uses pak0 and renderer keys: distinguish effective mounts from complete physical-source inventory, and prove indexed pixels, palette, all four mips and texinfo flags for accepted identities. Rock's used flags `[0]` identity remains separate from its unused embedded no-texinfo variant.

Original game PAKs, retained native PNGs/raw photographs, canonical PNG/float masters, decisive failure views and sealed receipts remain. Only 1,413 redundant RGBA audit extractions were retired, freeing 53,870,592 bytes. The inventory/provenance and selected native references remain; all 171 protected authoring files stayed exact. [Retirement record](legacy-audit-scratch-retirement.json) and post-cleanup proof preserve this. Do not restore obsolete candidate directories or transcode old lossy data to claim restored values.

## Git and continuation

Authoring workspace: `/Users/bri/.codex/worktrees/fc24/Quaked`, detached at `713b47d322f0674f154a70ec4baebd4566905d41` before this checkpoint. Main Dev advanced independently; recheck its exact head, index and file preimages before integration. The earlier box-art staging operation has completed, but another agent's new stage must still be protected if one appears. No reset, stash or unrelated stage is authorized. Owned Quake namespaces, the two additive tools, two public tests, fixture and reviewed Quake policy changes form the checkpoint; inherited Hexen assets/docs and motif code remain outside it.

Receipts preserve their original authoring paths. The data catalog uses repository-relative map paths, but origin-bound replay still requires this authoring workspace or an explicit checked relocation proof. Do not remove it as unused merely because files were copied to Dev. Runtime integration, owner review, CI/landing and release are distinct obligations.

Bluey `agent_whoami` failed with storage error `ef12e7ef956b4f9280d2f8e7e08fc691`, unknown mutation outcome and automatic retry disabled. No registration, claim or task-update success is asserted. The coordinator retains work/evidence in progress.json; the service owner must repair storage, then reconcile the existing card through supported identity/context/revisions. The followup service has no qualified multi-asset/image/MCP execution profile, so no durable worker job or background queue is claimed. Short native helpers remain supervised by the coordinator.

Next: finish the owned checkpoint through the unchanged normal gate and verify exact Dev/CI state, then continue the three X repairs and two metal relief repairs. No image-generation request is live. Read any build/commit handle from its actual process state; an observation timeout is not permission to restart. Keep the overall goal active until every scope, validation and integration requirement is proven.
