# Batch 006: preserve three artwork findings

Initial independent art review holds rtex001 relief, rtex095 pattern fidelity and Portal rtex439's introduced horizontal join. Five other bindings pass provisionally. The initial 80-map-reference technical and 272-panel preview checks pass but do not override those artwork findings. Keep all initial snapshots and sources until successors are qualified.

## Existing implementations to reuse

The Portal timber uses the already qualified, unchanged Y-boundary registration command. It keeps the same generated image, repairs the canonical RGB before final float relief, and derives both tiers normally. Its candidate is under `masters-registered/rtex439` and `tiers-registered/rtex439`; this is not an accepted extra asset.

The fine-pattern material has a same-source trial using the existing photographic finisher with colour strength 0.90 and field sigma 0.35, as recommended by independent review. Neither geometry nor the generated source is replaced. Final actual half/quarter views and pattern direction/scale must be reviewed; a lower numerical error cannot establish fidelity.

For rtex001, reuse the existing `layered-veneer` scalar policy in `tools/texture_sheets/update_level_sheets.py`, rather than deriving material identity from brightness. `brick_mask` and wrapped `gblur` already author source-bound structural regions and the physical plane hierarchy. The old official encoder is not suitable for this campaign because it encodes only 4x and derives normals from decoded height. The one necessary adaptation is to use the existing unquantized `craft(..., quantize_height=False)` detail at the sole 1024x1024 master, then apply the established bounded microrelief/plane formula. Existing prepare/finish/craft/derive and layered-policy source files remain unchanged.

## Source-bound layered master proposal

The draft source recipe is `batch-006/relief/rtex001-layered-draft.json`. Its polygon coordinates use eighth-native-texel precision measured directly on the 1024px master. The two explicit substrate regions cover the exposed brick islands, including their internal mortar. Facing is 0.78, substrate 0.38, facing chip floor 0.66 and micro amplitude 0.025; the existing one-sided interface bevel is six master pixels. No outer tile frame or new colour feature is authored. The draft overlay and scalar field must be checked for material-boundary bleed, missed bricks and unintended drops in intact facing.

Retain one source-bound authoring script with the recipe. It should validate original/master/source/prompt/tool hashes, canonical 8x dimensions, finite region coordinates and ordered planes before output creation; replay original photographic colour and full-precision scalar detail; then reuse the established plane formula once at master resolution. Emit one final active RGB/float-height package with unchanged colour and precise recipe/code provenance. Do not read a compressed tier or create a model call. The independent verifier should reconstruct finish → full-precision detail → explicit planes/microrelief, then both normal-scaled Q92/method6 tiers. Prior unqualified recipes can remain as small history after superseded binaries are retired.

Before acceptance require source/native colour fidelity, region-to-image alignment, underlying brick below overlying facing and dark mortar below brick faces in both decoded tiers, normals/lighting under opposed directions, both edge axes/corners and the existing half/quarter colour checks. Test the real authoring interface and refusal of source mismatch, malformed layering and output overwrite. Full campaign remains active; these three findings remain obligations.
