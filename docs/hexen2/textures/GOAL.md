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

The whole campaign remains **active**. The current catalog holds **59 reviewed WORLD native identities, 52 unique master packages and 520 physical enhanced maps (590 native map bindings)**. Of 887 ordinary WORLD variants, **828 remain**. All special WORLD, model/skin, sprite, WAD and gfx obligations remain visible in `campaign-status.json`; ordinary coverage does not establish campaign completion. Offline qualification, runtime integration, owner acceptance and release are separate.

At most three texture assignments run under the initiating coordinator. ttex054 and mtex470 are independently qualified and registered; current work is rtex499 same-source X-seam repair planning and rtex102 independent final review. Earlier011/485/100 are registered. rtex499 remains ART HOLD; ttex054 fine substrate relief remains explicitly weak. Use `parallel-2026-10-20/streams.json` and the current section of [HANDOVER.md](HANDOVER.md) for exact evidence, ownership and next steps. There is no twenty-stream queue.

The latest completed texture checkpoint is pushed **8f0e96bcd9635859afb46578ee78565eff954e95**. Its normal gate passed 110 distribution contracts, 44 Rust tests, 218 engine/LAN checks and web/desktop/universal Mac builds. `checkpoint-8f0e96bc-local.json` binds the exact 443-path tree and normal push. Later working registrations are not covered by that gate. Concurrent box-art commits above it must be preserved. Exact CI run39386261560 was last observed with source/web/Apple Silicon passed and Intel running; final status remains unverified after approval timeout and network failure. No new release or Prod promotion is claimed.

Bluey storage/identity is unavailable; no mutation succeeded. The coordinator retains the obligation and evidence in this ledger/progress, with service owner responsible for repair before reconciliation onto the existing card. No supported durable texture worker profile is available in followup v1.7, so no durable execution is claimed.

Continue eligible sources within existing authority. Undersized ttex098 remains held: one retained 1774×887 source cannot support required2048×1024; no upscale or separate tier is permitted. API fallback still awaits explicit owner choice and local credential. This source-specific constraint does not block the remaining campaign.
