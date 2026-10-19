# Active owner goal

Enhance all textures for Hexen II and its official expansion, Portal of Praevus, with sharp photographic realism. Preserve original colours, style, feature scale and intended forms while allowing natural material detail. Reviewed batches are progress toward the whole campaign; they do not replace it with a smaller objective.

The shared authoring standard applies to Quake and its official expansions as well as Hexen going forward; see `../../texture-tier-standard.md`.

- Low retains the unchanged original game texture.
- Mid is the default, at 4× original width and height.
- High is 8× original width and height.

Retain exactly one generated source per distinct texture content, adequate for at least 8× native dimensions, and one active registered RGB/relief master package. Derive both tiers directly from that package. Verified exact-content aliases may reference the same package while preserving distinct native game identities and Low bindings. Do not generate or author the tiers separately, upscale an undersized source, or transcode a compressed tier into another tier.

Author relief once at master resolution with full-precision scalar height. Derive each tier's height and correctly scaled normals from the uncompressed master data. Every enhanced diffuse, height and normal XYZ map is lossy WebP quality 92, compression method 6.

Both original and replacement must be compared at half and quarter original dimensions with the same BOX downsampling. Assess colour, style, intended forms and feature scale visually alongside decoded measurements. Review repeated tiles and relief under opposed lights for both tiers. Preserve original edge alignment and intended joints. Reject invented perimeter bevels or shading, little edge bricks, pixelated contours and artificial grain.

## Current accountability

The goal remains **active**. `campaign-status.json`, `world-queue.csv` and the active authoring `catalog.json` record scope and qualified assets. Thirty-seven WORLD native identities, thirty-two unique master packages and 320 physical enhanced map files are reviewed (370 native map bindings). Batch 006 adds eight native bindings from seven single-generation sources, including one proven peer-content alias. Its three initial findings were repaired from the same retained sources: layered facing/substrate relief, fine interlaced pattern fidelity and a timber repeat stitch. Final public source/codec/math, preview, mortar-witness and independent artwork checks passed. No additional generation or separately authored tier was used.

The ordinary WORLD queue contains 887 native variants. All model, sprite, animated, liquid, sky, utility, WAD and gfx obligations remain visible; WORLD or model-skin counts cannot stand in for full family coverage. Preserve native UV, tint, transparency and frame relationships before accepting the other families. Offline artwork and public CLI verification do not establish runtime/pack registration, in-game lighting acceptance, owner acceptance or release.

Continue eligible work without waiting for another general permission. The built-in ttex098 result is undersized and the public guard rejected it before master/tier creation. The size-controlled CLI/API route awaits the explicit owner choice required by the imagegen skill and a locally configured API key. This source-specific constraint does not block eligible textures or authorize upscaling.

The first twelve-material checkpoint, `8b4b670925eef8f7774a3ea8841f0356be3a943e`, is committed on local Dev. Its unchanged normal gate passed 107 distribution contracts, 39 Rust tests, 211 engine/LAN checks and web, desktop and universal Mac builds. Its foreign pointer-capture ancestor, `1c2249c8`, was not yet on remote Dev when last checked (`33406751`). Preserve that work and do not inadvertently publish another owner's unacknowledged ancestor. The ignored checkpoint receipt is `dist/hexen2-campaign-checkpoint/progress.json`; no push, Prod promotion or new release is claimed.

Bluey's same-session identity/storage call currently fails with unknown outcome (latest correlation `e13d09d90e64411a9747e26e7b903365`). The initiating coordinator retains the obligation and evidence in this project ledger. The service owner must repair storage/identity, after which the coordinator must reconcile onto the existing card. No successful board mutation, replacement identity, durable background worker or full completion is claimed.
