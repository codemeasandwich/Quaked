# rtex388 F1 — bounded same-source repair planning

**Planning assessment complete; ART HOLD F1 remains open. No implementation-ready cut recipe is approved.** This pass inspected actual retained source pixels and produced separate diagnostic crops and coordinates only. No repaired/composited image, scalar map, source recipe, producer, generation, tier, registry, Git or application build was created or changed. All 80 frozen candidate inputs remain byte-identical.

## Actual inputs and retained failure

The existing raw is `4b431a5aece2e46314629b67fd1222967cf8cccf575629e5acdce0e250d1b074`, 1254 square. Its sole registered RGB master is 512 square, SHA `2faa2ec6b26ba7e0700b18101bb5c1a64a865541274562f8ebc895e7aced90ea`, parent package `ad714db9bf3a153daae1ce0cbd3b5da25ddb2d571f438fe4a5b25641d7bea9cf`. The native/prompt/profile and independent source/math/CLI/preview passes remain historical facts; they do not close F1. The primary and its exact native peer rtex080 remain unregistered.

I inspected the raw, actual lossless master, native enlargement, coordinate grid, and root-confirmed full High X/Y/corner evidence. The material is photographic matted plant-fibre litter. Both exposed wraps have multiple unrelated broad blades ending/restarting at a common straight line. Natural broken/frayed ends are allowed: the requirement is a plausible material join, not pixel-identical continuity for every fine hair. A tone-only correction, roll, stretch or alpha blend cannot establish that join. The prior capability assessment identifies no existing qualified fibre-topology compositor; reuse that assessment rather than running old compressed-asset repair tools.

## Concrete finite donor/corridor proposal

All following coordinates are **master pixel-edge coordinates**, half-open rectangles. Every donor is from this same already registered lossless RGB. No raw resampling, mirror, rotation, scale, new material or noise is proposed.

The bounded first candidate uses a maximum 48-master-pixel collar around each wrap, equivalent to six native pixels. It covers the observed cut ends plus local overlap in the inspected strips. This is a provisional planning bound, not a demonstrated sufficient width or permission to enlarge it. Its maximum footprint is `x<48 or x>=464 or y<48 or y>=464`: 89,088 pixels, 33.984375% of the master. The central `[48,48,464,464]` rectangle, 66.015625%, must remain exact RGB. Actual future ownership masks must be narrower wherever a defensible cut permits.

| Role | Actual donor | Integer source mapping on output side | Continuity provided |
|---|---|---|---|
| X strip | `[208,0,304,512]` | Left output x0..47 reads x256..303; right output x464..511 reads x208..255; y unchanged outside corners | Source columns255/256 meet at output X wrap; no old source X cut is sampled there |
| Y strip | `[0,208,512,304]` | Top output y0..47 reads y256..303; bottom output y464..511 reads y208..255; x unchanged outside corners | Source rows255/256 meet at output Y wrap |
| Shared corner | `[208,208,304,304]` | Source `(256+dx,256+dy)` where dx/dy are signed output offsets around the wrap | One continuous interior source neighbourhood owns all four output corners; no independent X/Y corner passes |

`donor-crop-survey.json` binds the exact source rectangles, translations and unchanged target/donor crops. The donor's cross itself is physically continuous: it is an actual photographed neighbourhood. That does **not** qualify its transitions into the retained target or side donors.

For a future completed mask, reserve an inner wrap core of 24 pixels to the appropriate donor, with candidate binary transition paths within the outer 24..48 collar. Use one disjoint ownership atlas for parent/X/Y/corner, rather than sequential pastes that overwrite a corner. Corner-to-X and corner-to-Y cuts must be jointly defined within the collar before any wrapper is written. A rectangle or priority order alone is not a reviewed fibre path.

## Binary paths: explicit limits, not fabricated approval

Straight diagnostic path hypotheses are x36 and x476 for the two X inner transitions, y36 and y476 for Y, with analogous collar cuts between corner and side donors. **These are rejected as ready paths**, not applied trials: the actual separate crop pairs show broad blade bodies crossing those corridors without established continuation/occlusion in the other owner. Curving a line arbitrarily or choosing a low aggregate error would not establish natural material.

The actual source-specific unresolved intervals are:

| Route requiring a binary interstice/occlusion path | Target / owner A crop | Proposed owner B crop | Actual limitation |
|---|---|---|---|
| X+ inner cut, north | `[24,64,48,128]` | `[280,64,304,128]` | A broad grey diagonal blade and B ochre crossings occupy different positions; no complete shared interstice route was identified |
| X+ inner cut, south | `[24,288,48,352]` | `[280,288,304,352]` | Coherent pale blades and darker gaps differ, so a straight ownership cut would cut a blade body |
| X- inner cut, south | `[464,288,488,352]` | `[208,288,232,352]` | Different broad grey/ochre diagonals; no qualified natural end or occluding strand nominated |
| Y+ inner cut, east | `[288,24,352,48]` | `[288,280,352,304]` | Long ochre and grey blade orientations/locations differ across the candidate band |
| Y- inner cut, east | `[288,464,352,488]` | `[288,208,352,232]` | Different fibre crossings and voids; an unreviewed binary line merely relocates F1 |
| Corner to X+, north | `[256,24,304,48]` | `[256,280,304,304]` | Side donor and corner donor have different broad grey crossings at their new interior meeting |
| Corner to Y+, west | `[24,256,48,304]` | `[280,256,304,304]` | Same required joint-consistency problem in the other orientation; neither axis may silently take ownership |

The exact unmodified 4× NEAREST crop pairs are in `readable-overlap-crops-v2.json`. Earlier narrow-caption figures are retained; v2 changes caption area only. No repaired pixel image was used to draw these conclusions. These observations do not mean that any severed hair is forbidden, or that no finite repair can ever exist. They mean this specific simple central-cross donor set has **not supplied a complete defensible cut network**. No global or exhaustive donor-search claim is made. I cannot honestly nominate production-ready binary path coordinates from this bounded passive survey.

A bounded next planning pass could inspect different local donor rectangles or complete natural fibre ends/occlusions within the same 48-pixel maximum footprint. It must name actual routes and consistent corner ownership, or remain HOLD. Widening the footprint, an automatic path-suggestion search or a composite trial requires root's explicit next scope; none occurred here. Meanwhile other textures can continue.

## Smallest conditional guarded wrapper and test plan

Only after root independently reviews a **complete** actual donor/path atlas, the missing mechanism is a small source-bound binary integer compositor around the existing ordinary master replay. A generic synthesis framework, provider call or unbounded search is unnecessary.

1. Validate the original/raw/prompt/native ID, independent parent proof, parent package and current tool hashes. Refuse already revised parents, changed rereads, unknown recipe fields, out-of-bounds donors, overlapping/ambiguous ownership or an existing destination. Replay the unchanged ordinary CLI and require exact parent RGB/full-float/package bytes before applying anything.
2. The reviewed recipe must declare explicit integer translations, complete binary polygon/pixel ownership and corner atlas, maximum allowed footprint, and protected landmarks/cells. Each output RGB pixel must equal exactly one declared source pixel. Reject alpha values other than0/1, interpolation, reflection, rotation, scaling, stretching, sharpening and procedural detail. Require wrap-source neighbours to be adjacent inside the same inspected interior donor neighbourhood. Do not treat that numerical continuity as ART acceptance of internal cuts.
3. Prove canonical RGB outside the exact approved mask is byte-identical. Hash the coordinate map, actual changed mask and source lineage. Do not re-feed the repaired image as a purported generator return or silently refit its colours. Save one distinct successor retaining generation count1 and parent history.
4. Recompute scalar relief from repaired uncompressed RGB with the already reviewed wood/fibre numerical profile and full precision, then one float32 cast. Full relief need not remain byte-identical outside the RGB mask because wrapped filtering/normalization has nonlocal effects. Claim only the actual replay; do not impose a false outside-height identity rule. Reuse unchanged direct-tier and review CLIs for Mid4/High8, all maps Q92/method6.
5. Isolated fixtures should check exact integer mapping/no blend, forbidden-transform rejection, central outside-mask custody, non-square X/Y and four-corner ownership, no donor sampling through its old bad edge, changed-input guards, no clobber, float relief and direct tier bytes. A straight seam fixture should fail geometry review even if tone metrics improve. These tests are proposed, not run.
6. Actual independent qualification must replay source/parent/recipe/map/height/codec and inspect **every internal cut**, full literal X/Y/corners/repeats at both decoded tiers, real fibre cues and natural breaks/occlusions, original/replacement BOX32/16 and physical bodies/gaps under neutral lights. Reclassify actual representative grey/olive/ochre fibres and dark gaps rather than assuming brightness establishes overlap depth. A candidate with ghosting, a coherent new cut line, repeated patch stamps, distorted scale or a visible corner junction stays HOLD.

## Result and next owner

The concrete corridor, interior donors, integer mappings and the corner-continuity construction are reviewable. The inner binary cut network is **unresolved** in the actual named intervals, so this is **not** an implementation-ready recipe or a qualified repair. Root/source planner owns reviewing these limits and selecting a further bounded path/donor-refinement pass if worthwhile. Preserve F1 and all 80 frozen inputs; no material or peer is registered by this planning evidence.
