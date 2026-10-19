# One-master, two-tier Hexen II photographic texture increment

Owner standard, 19 October 2026, supersedes the previous 4×-only deliverables. Low remains the unchanged original. Mid is the default, exactly4× original width and height; High is exactly8×. Every enhanced colour, height and normal map is lossy WebP quality92, compression method6. Both tiers must be derived directly from the same retained master package, never authored/generated separately or transcoded from another compressed tier.

## Authoring contract

Generate once per native texture identity with the built-in GPT image tool. Retain that output and its prompt. Create one active full-resolution RGB master, at least8× native in both dimensions; any measured registration and photographic coarse-colour fitting happens once at that master resolution. For the first pair, reuse the existing single GPT outputs, which already exceed8×; no new generation is necessary. Historical first-batch 4× files and their receipts are evidence, not inputs to the new tiers. The canonical master package contains this single RGB image and matching relief information authored once at exactly the same dimensions.

Retain a finite float32 scalar height master in [0,1], produced once from the RGB master with the existing material-specific crafted-height function and reviewed material strength. This is an interpreted relief source, not measured physical displacement. Lossless PNG/float authoring sources are retained masters, not enhanced-tier distribution maps. Do not reauthor height separately at Mid and High.

The existing `craft` helper rounds its returned height to 256 levels. The new path must retain its pre-quantization height through a keyword-only `quantize_height=False` option. Default and explicit `True` preserve the existing rounded return expression and output bytes for Quake callers. Record the pre-change fixture and prove default compatibility, as well as a genuinely unquantized new height master; storing rounded values in float32 alone does not meet this decision.

For each tier independently: downsample RGB from the canonical RGB master; area-average the height master to the target dimensions; derive normals from that uncompressed tier height using the existing cyclic central-difference function and its resolution-scaled slope convention. Then encode diffuse, scalar height and independent normal XYZ channels directly as WebP92/method6. Neither normals nor High may use a decoded compressed Mid/High map as an authoring input. Correct height amplitude stays constant across tiers; normal derivative scaling accounts for the target texel density. This changes the older encoder's decoded-compressed-height route only for the new dedicated Hexen authoring tool; existing Quake tooling and runtime behavior remain unchanged.

## Small increment

Upgrade the existing reviewed base sandstone rtex337 and Portal masonry rtex450 from their retained GPT outputs. Add one base wood (rtex041) and one expansion-owned red earth/stone material (ttex016), after checking actual original/provenance. Exactly one generation per new texture; first generation must be large enough for8×. The same master package feeds both tiers. Keep all sources, maps, manifests and previews in the canonical Hexen authoring area, outside recursive Quake runtime packaging. No Hexen engine or pack registration is part of this increment.

The selected RGB masters are exactly8×: rtex337, rtex041 and ttex016 are 512×1024; rtex450 is 1024×1024. Their matching float32 height masters have the same dimensions. Retained raw GPT outputs are provenance, not additional active tier-authoring sources.

## Qualification and failure handling

Each tier must decode to exact dimensions and lossyVP8. Record Q92/method6 encoder parameters and input/output/tool hashes; independently replay bytes. Compare decoded diffuse to the unchanged original at original/2 and original/4, using the same BOX reduction on both images. Similarity metrics are diagnostic: visual form, colour/style/intention and feature scale still require review. Inspect native-offset and enhanced repeats, and decoded height/XYZ with opposed light directions. Preserve intentional mortar at original tile cuts; do not add perimeter bevels/shadows, small edge bricks, blur, quantised contours or uniform grain.

Normals deliberately use uncompressed height, while the delivered height is lossy. Record height compression error and angular mean/P99 differences between decoded height-derived normals and the float-authored normals; do not assume these two routes are identical. Verify resolution-scaled relief with a smooth periodic non-square analytic fixture at both tiers, retaining constant height amplitude and the same material strength/cap.

Public CLI tests must detect a too-small/wrong-aspect master, nonfinite/mismatched height, existing-output overwrite, tier chaining and scale-dependent relief. Tests include non-square originals. Preserve existing files and fail closed; retain failure receipts separately. Independently review plan, implementation and delivered pixels. Owner acceptance and future runtime/pack integration remain distinct. If independent helpers are temporarily unavailable, continue concrete preparation and retain that review requirement rather than claiming it passed.

Concurrent staged renderer/audio/gameplay changes are foreign work and must remain untouched. No Git staging/commit/push or new release is authorized by this texture increment. Bluey still refuses this retired identity; earlier registration had an unknown storage error. The initiating coordinator retains progress and next action here and in progress.json until the service owner repairs identity/storage; no board mutation or durable worker handoff is claimed.
