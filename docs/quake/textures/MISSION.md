# Quake texture mission

Owner-approved update, 20 October 2026.

Enhance all textures for **Quake and its official expansions** with sharp, clearly recognisable photographic materials. Scope includes the full base game, Scourge of Armagon, Dissolution of Eternity, Dimension of the Past and Dimension of the Machine. Preserve original colours, style, intended forms, feature scale, UV relationships and edge alignment while allowing natural fine material detail. High resolution alone is not acceptance.

## Authoring and output standard

Retain one adequate photographic source and one active canonical RGB/full-precision scalar-relief master per distinct native texture. Reuse an existing adequate source where available. Never generate or author tiers separately, enlarge an undersized source, or author one tier from another compressed tier.

| Output | Required source and encoding |
|---|---|
| Low | Unchanged original game texture |
| Mid, default | 4× original width and height, directly from the shared master |
| High | 8× original width and height, directly from that same master |
| Enhanced colour/diffuse | Lossy WebP **quality 92, method 6**; hold visible compression damage for review |
| Enhanced height, normal XYZ and masks | **Lossless WebP, method 6**, directly from the uncompressed master data |
| Retained authoring data | Lossless RGB PNG and full-precision float scalar relief |

Quality 92 is a lossy colour-quality target, not a lossless data-map requirement. In lossless WebP mode a quality/effort setting does not permit pixel loss. Lossless data exports must decode exactly to their intended channel values; the existing export bit depth and scalar-to-channel quantization still require explicit validation. Author physical relief once at master resolution and derive correctly scaled normals from uncompressed reduced scalar data, never from decoded compressed height.

## Acceptance

- The surface must visibly depict its real-world material with coherent natural structure, not synthetic grain, sharpened pixel contours or abstract mottling.
- Preserve seamless tiling and native edge relationships. Introduce no perimeter bevel/shading, invented small edge bricks or unrelated structural features.
- Compare **both** native and decoded replacement at half and quarter native dimensions using the same BOX reduction. Assess similar colour, forms, style and feature scale; pixel identity is not required.
- Review actual Mid and High at 1:1, repeated tiles/corners, height and normal maps, physical face/joint ordering and opposed lighting.
- Independently verify native identity/provenance, source/master custody, direct tier derivation, per-role codec and actual decoded output. Numerical checks do not overrule artwork or physical-relief findings.

## Coordination and delivery

Run **at most three texture sub-agents concurrently**, one texture per agent. The coordinator owns independent final review, shared catalog/runtime integration and periodic verified Dev checkpoints. Preserve other agents' work and the separate Hexen II lane. Runtime acceptance, owner acceptance, CI/landing and release remain distinct; this mission grants no direct Prod commits or release authority.

## Transition from the earlier all-lossy standard

This Quake mission supersedes the earlier instruction to encode every enhanced map as lossy Q92. Historical assets, sealed receipts and reviews retain their actual encoding claims. Existing all-lossy data maps require fresh lossless exports **from retained uncompressed masters**, followed by per-role verification and affected review updates; converting a lossy export to lossless cannot restore lost values.

The historical `derive_texture_tiers.py` retains its all-lossy policy and exact source bytes for existing pinned receipts and the separate Hexen lane. Quake uses the additive `tools/texture_sheets/derive_quake_texture_tiers.py`, which imports its unchanged numerical helpers and exports explicit per-role codecs. The companion `build_quake_texture_batch_review.py` imports the unchanged panel builder and validates schema-3 mixed-codec batches before rendering truthful labels. Neither command qualifies native masks, transparency, skies or animation merely by offering a lossless encoder.

The additive derive and review interfaces pass 9 and 6 independent public tests respectively, including source-watch and native-to-master binding guards. All five current candidates were regenerated directly from retained masters: ten colour files remain byte-identical and forty data files decode exactly. Two stone packages pass affected art review; three other candidates remain on ART HOLD for X joins. See `codec-transition-actual-public.json`, `codec-transition-actual-review-public.json` and `codec-transition-stones-art-review.json` for the exact scope and limits. Runtime, owner and Dev/CI acceptance remain separate.

Current execution state: [progress.json](progress.json). Shared workflow and repair mechanisms: [texture-authoring skill](../../../skills/quaked-texture-authoring/SKILL.md).
