# Active owner goal

Enhance all textures for Hexen II and its official expansion, Portal of Praevus, with sharp photographic realism. Preserve original colours, style, feature scale and intended forms while allowing natural material detail. Reviewed batches are progress toward the whole campaign; they do not replace it with a smaller objective.

Recognisable real-world material is a primary acceptance gate. High pixel count, sharp marks and numerical similarity alone are insufficient. The actual surface must convincingly show its chosen physical material at close range without artificial grain. New agents must read the repository `AGENTS.md` and `skills/quaked-texture-authoring/SKILL.md`, including the relevant workflow and repair references.

The shared authoring standard applies to Quake and its official expansions as well as Hexen going forward; see `../../texture-tier-standard.md`.

- Low retains the unchanged original game texture.
- Mid is the default, at 4× original width and height.
- High is 8× original width and height.

Retain exactly one generated source per distinct texture content, adequate for at least 8× native dimensions, and one active registered RGB/relief master package. Derive both tiers directly from that package. Verified exact-content aliases may reference the same package while preserving distinct native game identities and Low bindings. Do not generate or author the tiers separately, upscale an undersized source, or transcode a compressed tier into another tier.

Author relief once at master resolution with full-precision scalar height. Derive each tier's height and correctly scaled normals from the uncompressed master data. Every enhanced diffuse, height and normal XYZ map is lossy WebP quality 92, compression method 6.

Both original and replacement must be compared at half and quarter original dimensions with the same BOX downsampling. Assess colour, style, intended forms and feature scale visually alongside decoded measurements. Review repeated tiles and relief under opposed lights for both tiers. Preserve original edge alignment and intended joints. Reject invented perimeter bevels or shading, little edge bricks, pixelated contours and artificial grain.

## Current accountability

The goal remains **active**. `campaign-status.json`, `world-queue.csv` and the active authoring `catalog.json` record scope and qualified assets. Forty-seven WORLD native identities, forty unique master packages and 400 physical enhanced map files are reviewed (470 native map bindings). Batch 006 adds eight native bindings from seven single-generation sources, including one proven peer-content alias. Its three initial findings were repaired from the same retained sources: layered facing/substrate relief, fine interlaced pattern fidelity and a timber repeat stitch. Final public source/codec/math, preview, mortar-witness and independent artwork checks passed. No additional generation or separately authored tier was used.

The ordinary WORLD queue contains 887 native variants. All model, sprite, animated, liquid, sky, utility, WAD and gfx obligations remain visible; WORLD or model-skin counts cannot stand in for full family coverage. Preserve native UV, tint, transparency and frame relationships before accepting the other families. Offline artwork and public CLI verification do not establish runtime/pack registration, in-game lighting acceptance, owner acceptance or release.

Continue eligible work without waiting for another general permission. The built-in ttex098 result is undersized and the public guard rejected it before master/tier creation. The size-controlled CLI/API route awaits the explicit owner choice required by the imagegen skill and a locally configured API key. This source-specific constraint does not block eligible textures or authorize upscaling.

The latest texture campaign checkpoint is `c00ca59a465ce267fbff56607b095be09e7120b1`, committed and pushed with all prior Dev history preserved. Its unchanged normal gate passed 107 distribution contracts, 39 Rust tests, 211 engine/LAN checks and web, desktop and universal Mac builds. The exact remote ref was verified. GitHub Distribution run `39208412208` completed successfully for that exact commit, including source, web, Apple Silicon Mac and Intel Mac jobs; `checkpoint-c00ca59-ci.json` retains the receipt. Release and Pages jobs were correctly skipped for this Dev qualification. The ignored checkpoint receipt is `dist/hexen2-campaign-checkpoint/progress.json`. Current Dev HEAD also includes subsequent box-art commits and was observed at `213cc7e3cd91032daf284c12a1af560b20b9bc79`; their verification is separate from the texture checkpoint. No Prod promotion or new release is claimed.

Bluey's same-session identity/storage call currently fails with unknown outcome (latest correlation `484ca42d1f2746f98f35e3a3ab8f04de`). The initiating coordinator retains the obligation and evidence in this project ledger. The service owner must repair storage/identity, after which the coordinator must reconcile onto the existing card. No successful board mutation, replacement identity, durable background worker or full completion is claimed.

Batch 007 has eight retained adequate single-generation sources and eight final shared RGB/float-relief packages producing 80 enhanced maps. All eight new materials and two exact-content supplemental aliases are now registered. The source-measured rtex322 inlay repair passed final independent artwork, actual-map replay and preview checks, preserving the initial full-precision height and canonical RGB outside the two plate interiors. Initial and unsuccessful trial HOLD receipts remain historical evidence. See `batch-007-art-review-v2.json`, `batch-007-public-final-actual-v1.json` and `batch-007-public-final-preview-v1.json`. Exactly 79 superseded owned files have now been retired after failure-view preservation and protected-input hashing; post-cleanup actual 80-map and 32-preview replay passed. Independent whole-catalog custody audit remains pending. See `batch-007-retirement.json` and the post-cleanup receipts.

Batch 008 has eight source-verified originals and material briefs, with three raw sources retained (rtex006, rtex104 and rtex096) and five requests not issued. No batch 008 master or tier is qualified. Review these sources against the clarified real-material gate and update/review the five unissued material briefs before proceeding. Current ordinary WORLD remainder is 840. The reusable texture skill and agent routing are installed and independently exercised; `texture-skill-validation.json` records their bounded validation. These working changes are not covered by the earlier Dev checkpoint's CI.

The current continuation record is [HANDOVER.md](HANDOVER.md), including exact batch 008 generation states, reviewed v2 material briefs, pending independent results and safe next actions.
