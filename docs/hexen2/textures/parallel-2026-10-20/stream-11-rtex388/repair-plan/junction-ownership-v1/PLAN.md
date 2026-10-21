# rtex388 — four-owner junction and continuation plan

**Plan for independent root review only.** No new DP, atlas rasterization, material composite, master, relief or tier has been produced. The completed diagnostic remains at844,800 states;155,200 remain under its cumulative ceiling. All new planning evidence is in this directory so the sealed diagnostic/checkpoint inputs remain unchanged.

## Fixed data and actual crossings

Use **C2 only**, centre(384,128), and rank1 of each existing cap. Retain each shared cap's two physical wrap halves with the same existing anchor; do not independently select ranks per quadrant. These are the same parent RGB and exact lookup/cost result already reviewed. No new donor, offset, rotation, reroll or wider support is proposed.

The four physical corners are represented in one signed torus chart. `retained-C2-junction-geometry-plan-v2.json` contains exact rational segment intersections of the retained rank1 suggestions:

| Signed quadrant | Proposed junction | Selection |
|---|---|---|
| +,+ | (24.5,41.5) | Proper diagonal cell crossing: cap segments(24,42)→(25,41) and(24,41)→(25,42). An absent shared integer node does not imply incompatibility. |
| −,+ | (−40,38) | Exact integer-node intersection. |
| +,− | (31,−46) | Exact integer-node intersection. |
| −,− | (−35,−34) | First intersection reached from **both** wrap cores; the farther(−36,−35) lies on tails to be discarded. |

Incoming paths are oriented outward from dx0 or dy0. In the negative half this reverses the stored traversal. The chosen −,− event precedes the farther event in both oriented paths; keep neither its recrossing nor a second junction. If another case has conflicting first-event orders, tangency without the required sectors or ambiguous overlaps, reject that atlas rather than choose a nearest point by score. This plan does not assert that geometry alone accepts fibre appearance.

## Correct four-owner graph

Let P be unchanged parent, X the X interior strip, Y the Y strip and C the single shared corner donor. At each junction the incident interfaces must be **C/X, C/Y, X/P, P/Y**, in cyclic order or its reflected order. No continuing C/X or C/Y cost is valid once the adjacent region has become P.

Keep the C/X cap from the X-wrap anchor only up to the junction; keep the C/Y cap from the Y-wrap anchor only up to the same junction. Discard every old cap tail after it. New outgoing branches compare **P/X** toward the X long path and **P/Y** toward the Y long path. Preserve one shared-anchor bridge from signed−1 to0 in each cap: the two stored half paths already use the same ordinate and adjacent interior source cells. Do not optimize these halves separately again.

Keep each of the four old long paths only at **global progress80 through432 inclusive**,353 stored nodes. The old48..79 prefix(32nodes) and433..463 suffix(31nodes) are dropped. The32-pixel geometric trim from the old48 collar station to80 does not enlarge the48-wide support: the continuation merely travels farther along the same side band. Signed−80 is global432; earlier provisional station labels used432 without converting it to−80, and the v2 evidence corrects that notation without changing any wrapped/source coordinate.

The +,+ old X endpoint(35,48), for example, can be too far laterally from the crossing for a monotone three-neighbour connection in only a few rows. Joining fixed retained nodes at80/432 avoids that false impossibility while preserving the source corridor.

## Pixel edges, centres and the one-cell bridge

Future atlas coordinates are **pixel-edge coordinates**: a copied output pixel(i,j) has centre(i+.5,j+.5). The retained diagnostic node(i,j) is a source-colour probe index. For this proposed vector atlas its integer coordinate is used as an edge-grid vertex; the attached cost remains a heuristic probe of that index's pixel centre. This is an explicit prospective convention, not a claim that the old diagnostic already authored pixel ownership.

Keep the +,+ geometric junction at its exact half-integer position; do not round the crossing away. Its unit cell is `[24,41,25,42]`. Incoming C/X reaches it from(24,42); incoming C/Y from(24,41). The proposed outgoing P/X bridge goes from the junction to(25,42), then the fixed cardinal step to(25,43). P/Y goes to(25,41), then to(26,41). Thus all four arcs meet once without retracing an incoming segment. The only ambiguous pixel centre is(24.5,41.5), output pixel(24,41): propose **P owns that one cell**, retaining its original RGB. The four possible source addresses there are P(24,41), X(408,41), Y(24,169), C(408,169); no blend or new value is permitted.

At integer junctions the outgoing P/X first step is one pixel in the signed Y direction, and P/Y one pixel in signed X. These fixed cardinal prefixes separate outgoing arcs. They must not overlap an incoming edge or create an extra crossing; a guard failure means HOLD, not an automatic elbow/dilation. The first DP node is after that fixed step.

All other pixel centres use exact point-in-region ownership against the completed vector graph. A centre exactly on an interface belongs to its outer incident owner: X for C/X, Y for C/Y, P for P/X or P/Y. At a four-way tie use P, then X, then Y, then C. This is binary ownership, never antialiasing. The +,+ bridge cell is the only explicitly allowed one-cell raster junction exception: an opposite-owner raster adjacency incident to that cell can occur while the vector graph remains four-way. No such extra contact is allowed elsewhere without a new review. In particular, do not hide a long P/C or X/Y boundary as a rasterization detail.

The protected rectangle is the half-open pixel-edge box`[48,48,464,464]`; every output pixel with i,j in48..463 must be P and byte-identical. Paths may touch its boundary but cannot assign donor pixels inside it. Diagnostic source reads at closed path boundary48 or in crop/gradient context are **not** copied-pixel permissions.

## Eight fixed correct-owner continuations and exact budget

For signed output index(u,v), P reads`(u mod512,v mod512)`, X reads`(384+u,v mod512)` in the X collar, Y reads`(u mod512,128+v)` in the Y collar, and C reads`(384+u,128+v)` in the corner collar. Copied pixel indices use half-open donor bounds: X source x336..431, Y source y80..175, C their intersection. These addresses preserve source scale/orientation and make exposed wrap neighbours adjacent interior source cells.

The proposed continuation reuses the same fixed RGB/gradient cost and monotone three-neighbour DP, but with the correct owner pairs below. Both starting and ending state columns are fixed. Prefix bridge probes are fixed source lookups, not optimization. States run through25 inclusive column positions in the existing signed24..48 or−48..−24 bands.

| Branch | Correct pair | First DP node | Exact retained long join | Inclusive rows | States |
|---|---|---|---|---:|---:|
| +,+ X | P/X | (25,43) | (26,80) |38|950|
| +,+ Y | P/Y | (26,41) | (80,46) |55|1375|
| −,+ X | P/X | (−40,39) | (−39,80) |42|1050|
| −,+ Y | P/Y | (−41,38) | (−80,45) |40|1000|
| +,− X | P/X | (31,−47) | (30,−80) |34|850|
| +,− Y | P/Y | (32,−46) | (80,−32) |49|1225|
| −,− X | P/X | (−35,−35) | (−45,−80) |46|1150|
| −,− Y | P/Y | (−36,−34) | (−80,−42) |45|1125|

**One proposed run totals8,725 states**, taking cumulative use to853,525 and leaving146,475. It does not initialize a fresh million-state budget or rerun any cap/long search. A new receipt must bind the completed parent journal/hash and start the shared counter at844,800. The eight finite lattices, endpoints and fixed prefixes are sealed in`correct-owner-corridors-plan-v1.json`. No new anchor, rank, donor, search or retry is implicit if a route/graph fails.

I inspected all eight actual P-versus-X/Y corridor pairs as separate unmodified crops, including8-pixel viewing context that is not support. They contain real dense fibres and several broad unrelated crossings; low cost still cannot accept their cut. The existing C2 high-cost X+ at(28,395) and X− at(474,389) remain in the retained middle paths, so even successful junctions cannot alone close F1. The old Y high-cost prefix regions lie in the proposed replacement portions but are not claimed solved.

## Guards before even an unqualified diagnostic composite

After independent plan approval, isolated fixtures must cover diagonal and integer crossings, first-event multi-cross selection, exact353-node retained ranges, correct P/X and P/Y costs, reflected quadrants, fixed prefixes, exact state accounting, one-cell ties and protected RGB. No application/native build is required.

An actual continuation/atlas helper must fail closed unless:

1. Original/raw/prompt/package/result/source and all80 frozen hashes still match first observations; the cumulative allowance and source-code pins match.
2. There are exactly four declared degree-four junctions; no unintended segment crossing, collinear overlap, retrace, dangling edge or second intersection survives. Each local owner cycle is C→X→P→Y or its reflection, with correct seeded regions.
3. All shared wrap anchors/bridges agree, all eight continuations reach their exact fixed retained nodes, and every source field uses the declared integer mapping. No new cut reuses a cap's wrong-owner cost beyond its junction.
4. Raster ownership covers every pixel exactly once, preserves the entire protected P rectangle, and has the intended torus-connected C/X/Y/P regions and wrap-owner family agreement. Any one-cell junction exception is restricted to the declared +,+ cell; do not repair topology by flood-filling over source features or silently adding pixels.
5. Every proposed donor pixel lies inside the unchanged48-pixel maximum support and its half-open source rectangle. No clipping, scaling, mirroring, alpha, interpolation or noise is allowed. No ambiguity is resolved by a post-hoc forced outside mask.

A small **unqualified binary diagnostic composite** may be proposed only after these guards and the atlas policy have been independently reviewed. It would be one RGB PNG plus explicit label/source-index maps in this diagnostic scope, never a canonical master or generator return. It would have exact outside-mask RGB custody and remain NOT FOR REGISTRATION. No height, tiers or runtime binding accompany it. Root must inspect every internal cut, full X/Y/corners and BOX32/16/real material before considering later canonical authoring. This planning task does not execute or authorize that composite.

## Current result

The existing complete diagnostic is preserved. This amendment names actual crossings, correct owner pairs, exact endpoints, a bounded pixel/bridge policy and a tiny remaining-budget increment. **No additional state was spent and no atlas or material was authored.** Root independently reviews this complete plan before a continuation search or composite. F1 and rtex080 reuse remain HOLD.
