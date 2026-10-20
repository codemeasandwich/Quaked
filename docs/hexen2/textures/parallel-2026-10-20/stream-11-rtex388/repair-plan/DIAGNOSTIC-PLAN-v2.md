# rtex388 F1 — finite binary-path diagnostic proposal

**Ready for root's independent diagnostic-plan review. This is not a repair recipe, implementation, executed optimization or ART acceptance.** It supersedes the next-action recommendation of PLAN-v1 while preserving that assessment and all 80 frozen candidate inputs. No composite, donor transport trial, source/height edit, generation, producer implementation, test or application build has run.

## Fixed source, bounds and three actual donor choices

Use the exact registered parent RGB `2faa2ec6…`, 512 square, and parent package `ad714db9…`; keep the sole retained raw and all source/prompt/profile/native/peer lineage unchanged. The maximum allowed RGB support remains the 48-pixel wrap collar (six native pixels), with `[48,48,464,464]` exact outside-mask RGB. Maximum support is 89,088 pixels, 33.984375%. This bound is neither widened nor silently shifted. The actual eventual ownership mask should follow reviewed binary paths inside it, not fill the whole collar by default.

`bounded-offset-set-v2.json` seals exactly three candidate pairs. All source rectangles were inspected as unmodified crops; no global roll was applied to a material output.

| Candidate | Interior source cross | X donor | Y donor | One shared corner donor | Actual source-read tradeoff |
|---|---|---|---|---|---|
| C0, prior baseline | (256,256) | `[208,0,304,512]` | `[0,208,512,304]` | `[208,208,304,304]` | Photographic grey/olive/ochre tangle; seven known difficult inner/cap overlap pairs are retained in v1. It is not a ready straight-cut repair. |
| C1, bounded alternative | (128,384) | `[80,0,176,512]` | `[0,336,512,432]` | `[80,336,176,432]` | The X strip has conspicuous long, near-parallel grey blades and the Y strip several aligned broad blades. It supplies real continuous material but risks an orientation/bundle stripe in the collar. Its actual north inner and corner overlaps still differ. |
| C2, bounded alternative | (384,128) | `[336,0,432,512]` | `[0,80,512,176]` | `[336,80,432,176]` | X has more varied broken/tangled directions than C1; Y and corner contain strong broad grey crossings. The inspected source provides more varied interstices worth suggesting paths through, but no complete route or superiority is claimed. |

Recommend **C2 first, then C0**, with C1 retained as an explicitly bounded comparison, not an automatic winner. Do not mix independently winning X/Y donors into a fourth unreviewed pair. Ranking can be revised by actual path/crop evidence and ART, not by inventing a new offset search.

For each pair `(cx,cy)`, source mapping is integer translation: output left reads `(cx+x,y)`, right reads `(cx+x-512,y)`; top reads `(x,cy+y)`, bottom reads `(x,cy+y-512)`. At corners use **one** source neighbourhood `(cx+dx,cy+dy)` in the unwrapped torus chart `dx,dy∈[-48,48)`. The four physical corners are pieces of that one chart. Adjacent output wrap pixels therefore read adjacent interior donor pixels; the donor's old edge is never used at an exposed wrap. This mathematical property does not accept any internal splice.

## Smallest useful next increment: suggested paths, not a material trial

After root independently approves this finite plan, implement only a bounded **planning diagnostic** that reads immutable source overlap pairs and emits proposed path coordinates/costs plus annotations on the separate original A/B crops. It must not assemble or save a repaired RGB image, alter relief, derive tiers or register anything. This gives the reviewer working path evidence before a production compositor is considered.

The diagnostic domain consists of four long side-to-parent corridors and eight half-cap corridors. Long cuts use the 24-pixel band between wrapped distance24 and48, along side positions48..463. Half-caps lie inside the existing 96-square corner chart. Their paired halves share one anchor across the torus wrap. No independently optimized X pass may overwrite a Y corner.

- **Long paths:** X+ uses `x24..48,y48..464`; X− uses `x464..488,y48..464`; Y+ uses `y24..48,x48..464`; Y− uses `y464..488,x48..464`. Use the exact target/donor integer mappings above. Width25 includes both endpoint coordinates; write coordinate conventions explicitly and reject an escaped path.
- **Cap paths:** suggest the corner-to-X traces in `dy24..48` and `dy−48..−24`, and corner-to-Y traces in the corresponding dx bands of the one signed corner chart. Each trace consists of two length48 halves sharing a single anchor at dx0 or dy0. Root must review the parent/X/Y/corner junction ownership; suggested paths alone do not resolve all junctions.
- **Core:** wrapped distance less than24 guarantees donor ownership at the exposed wrap. The corner core with both signed distances below24 belongs to the single corner donor. Outside the approved collar remains parent RGB. No automatic priority order is allowed to hide conflicting paths.

Use a simple deterministic seam-suggestion cost on uncompressed RGB, not learned synthesis:

`cost = mean(abs(RGB_A - RGB_B))/255 + 0.25 * max(g_A,g_B)`

Here `g` is clipped to[0,1] and is the sum of absolute central differences in X and Y of normalized luminance (`.2126R+.7152G+.0722B`), using the actual source-neighbourhood pixels. The first term prefers similar local appearance; the second discourages cutting strong boundaries in either owner. It can still choose the wrong blade body or crossing. There is **no zero-error requirement**, no ban on natural broken fibres and no score threshold that establishes ART.

A monotone three-neighbour dynamic-programming path is enough to suggest each bounded route; no generic quilt engine or external dependency is required. Keep the same fixed cost/weights for the three candidate pairs. For cap anchors enumerate at most25 source-valid anchor positions and retain only the three lowest-cost paired-half suggestions, with deterministic lexicographic ties. If paths conflict, a coherent occlusion cannot be identified or no legal route exists, record HOLD; do not widen support or run a new offset search.

Bounds: at most three candidate pairs; four long path lattices of at most416×25 plus eight half-cap lattices of at most48×25. At most25 cap-anchor evaluations. A conservative ceiling is 1,000,000 lattice-state evaluations across the approved set, excluding fixed source-cost calculation, and three predecessor transitions per state. Stop on the ceiling; do not renew it. Report actual visited-state counts and candidate/anchor identities. These are computational scope limits, not artistic acceptance budgets.

The outputs should be a source/recipe-bound JSON with exact integer paths, per-node costs, candidate/anchor IDs, intersection/junction warnings and every source-coordinate lookup; unmarked original crops; and labelled A/B source overlays showing the same proposed path. No alpha blending, interpolation, stretching, rotation, mirroring, noise, sharpening, height work or repaired-tile preview is permitted in this first diagnostic increment.

## Independent review before any compositor or material trial

Inspect every path against both actual source owners. Large coherent blades may continue, terminate at an existing frayed end, disappear under a plausible occluding blade or remain unresolved. Do not require all fine hairs to match, but do not hide a line of unrelated broad blade cuts behind a low score. The inspected v2 north-side and corner crop pairs explicitly retain these risks.

The reviewer must choose one candidate and seal a complete binary ownership atlas with compatible X/Y/corner junctions, or keep F1 HOLD. Only then consider the small guarded compositor/tests in PLAN-v1. It must preserve exact outside-mask RGB, prove every output pixel is a declared integer source lookup and reject changed sources, ambiguous ownership and clobbering. Recompute full-float relief once from the successor using the unchanged reviewed fibre profile; direct Mid4/High8 Q92/method6 follow. Refit/recolouring is not an implicit repair stage.

Actual repaired-image acceptance remains a later gate: full literal wraps **and every interior cut**, corners/repeats, real fibre character, BOX32/16 on both original and replacement, and height/XYZ/neutral lighting at both decoded tiers. Detect orientation stripes, repeated patch stamps, ghosting or stretched/mirrored material. Original and raw remain protected; rtex080 cannot reuse accepted art until the primary actually passes. The existing source/math/HTML/preview PASS does not close F1.

## Evidence and result

`bounded-offset-set-v2.json` contains all donor rectangles, integer translations, actual unmodified overlap crops and source hashes. C0's detailed problematic source pairs remain in `readable-overlap-crops-v2.json`; C1/C2 show four additional inspected inner/corner pairs each. All 80 candidate freeze hashes are rechecked exact. This plan provides a finite, reviewable diagnostic next increment, **not** a claim that rectangles alone are feasible or that safe final binary paths have already been found. Root owns the independent plan decision before implementation or any material trial.
