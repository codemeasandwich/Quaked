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

The whole campaign remains **active**. The current catalog holds **64 reviewed WORLD native identities, 56 unique master packages and 560 physical enhanced maps (640 native map bindings)**. Of 887 ordinary WORLD variants, **823 remain**. All special WORLD, model/skin, sprite, WAD and gfx obligations remain visible in `campaign-status.json`; ordinary coverage does not establish campaign completion. Offline qualification, runtime integration, owner acceptance and release are separate.

Corrected-X rtex499, rtex053 and rtex256 are independently qualified and registered in `parallel-2026-10-20/registration-499-053-256.json`. The old rtex499 seam HOLD remains historical; its same-source corrected successor passed. ttex054 fine substrate relief remains explicitly weak. rtex002 is additionally registered as exact accepted-content reuse of ttex012; its own native Low and provenance remain distinct. One adequate source each is now retained for rtex441 and rtex388. The slab needs the independently reviewed same-source flat-face relief correction; plant-fibre candidate is frozen for independent final review. The layered-boundary skill forward check also passed its actual CLI replay and five test groups; temporary replay outputs were removed. Use `parallel-2026-10-20/streams.json` and the current section of [HANDOVER.md](HANDOVER.md) for evidence and ownership. Maximum three active subagents; no twenty-stream queue.

The latest completed texture checkpoint is pushed **eb6fd7029197e6f5f65543c2fea348bfb02bf52f**, exact 973 owned paths with concurrent box-art history preserved. Its normal gate passed 116 distribution contracts, 45 Rust tests, 218 engine/LAN checks and web/desktop/universal Mac builds. Exact Dev push CI run 39433737036 succeeded for source/web/both Mac jobs; release/Pages were skipped. `checkpoint-eb6fd702-local.json` and `checkpoint-eb6fd702-ci.json` retain the receipts. This is a 59-identity snapshot; current 64 registration, new adapter and subsequent qualifications remain later working changes. No Prod promotion or new release is claimed.

The owner-requested build cleanup removed 6,735,819,838 bytes of inactive owned generated payloads. Current HTML, authoring assets and receipts were preserved; shared/live/foreign builds were excluded. See `build-cleanup-2026-10-20/result.json`. Required gates remain intact; their retained receipts are historical evidence after payload retirement.

Bluey storage/identity is unavailable; no mutation succeeded. The coordinator retains the obligation and evidence in this ledger/progress, with service owner responsible for repair before reconciliation onto the existing card. No supported durable texture worker profile is available in followup v1.7, so no durable execution is claimed.

Continue eligible sources within existing authority. Undersized ttex098 remains held: one retained 1774×887 source cannot support required2048×1024; no upscale or separate tier is permitted. API fallback still awaits explicit owner choice and local credential. This source-specific constraint does not block the remaining campaign.

Owner testing constraint: texture work uses HTML and texture checks only; no full/native build. The approved exact-index Dev route is independently reviewed; actual checkpoint testing and local commit remain separate from future remote CI/release.
