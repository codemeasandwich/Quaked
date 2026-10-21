# Independent retained rtex388 raster diagnosis

The failure is localized to digital classification at two declared junctions. There is no long opposite-owner boundary. The current atlas still fails the unchanged guards: it has two forbidden X/Y neighbor edges and an isolated one-pixel X region. This diagnosis grants no exception, label edit, new search or composite authority.

The exact actual failure is `geometry-replay-v1/actual-v1/failure.json`, SHA `40383c8b03ebd252e07683332c69529175c61f7a4df9b2fe6f5c05777ded7d77`. The failed geometry journal remains SHA `c82fdd1d75ee9fa5cd7d3cf8523a7f31e7d5d47012b85688ae6271672c66e213`. Its cumulative search clock remains 853,525 with 146,475 remaining and automatic retry false. This audit spent zero new DP states and did not invoke any actual replay or search entry point.

All 16 recorded vector arcs were decoded with exact rational coordinates. The unchanged pinned graph function passes with 2,050 vertices, 2,054 edges and four declared four-owner junctions, including all torus intersection and local sector checks. The unchanged raster function used the original cap anchor seed: C for `-41 < signed(y+.5) < 35`, otherwise X. The resulting unmodified uint8 label buffer SHA is `aa47447a1ed499813995a070ac1a7365e00f011991e36a5ae894a03b7756e9c7`. A direct call of the frozen raster guard on those local labels reproduces `Forbidden opposite-owner raster contact`; the actual replay command and its journal were never run or altered.

Every east/south pixel-neighbor edge on the 512 torus was enumerated once. After excluding only edges incident on the already declared P-owned pixel `(24,41)`, exactly two forbidden edges remain:

| Neighboring pixels (x,y) | Owners | Nearest declared junction | Torus distance |
| --- | --- | --- | --- |
| `(471,37)` → `(472,37)` | Y → X | mp `(472,38)` | 0.5 pixel |
| `(30,465)` → `(30,466)` | X → Y | pm `(31,466)` | 0.5 pixel |

Distance is measured from the junction to the closed unit segment joining the two pixel centres, using the nearest torus image. Both edge midpoint distances are also 0.5 pixel. These are two separate one-edge clusters. No other forbidden opposite-owner edge exists anywhere, including long paths or wrap boundaries. The sole declared P/C exception is `(23,41)` C → `(24,41)` P, touching pp `(24.5,41.5)` at its endpoint; it is retained separately rather than silently counted as another permitted neighborhood.

The independent four-neighbor torus component census finds P: 189,814 pixels in one component; Y: 35,338 in one; C: 5,602 in one; X: 31,389 plus one isolated pixel. The isolated X pixel is `(30,465)`, whose west/east/north/south neighbors are C/P/P/Y. Its centre is about 0.7071 pixel from pm. This is an additional real connectivity failure that the original guard never reached after its first forbidden-contact rejection. Local aliasing does not make that digital topology admissible.

All 173,056 pixels of the protected `[48,48,464,464)` parent rectangle remain P. Adjacent wrap rows/columns agree on owner family; exposed X edges contain only X/C and exposed Y only Y/C. Every X wrap source pair advances exactly `(1,0)` and every Y pair `(0,1)`, with zero violations. The independent fixed half-open source chart, source bounds and P identity checks also report zero violations. These arithmetic checks access no source material pixels.

`four-junction-owner-cells.png` shows unchanged owner letters with only diagnostic borders around the forbidden or declared-contact cells. The atlas PNG uses four label colours. `ownership-labels-uint8.npy` is a byte ownership map, not float height or a material/composite image. All distances and forbidden edge endpoints are in `raster-diagnosis.json`; the isolated cell, its neighbors, 5×5 junction letter tables and complete owner-pair boundary counts are in `component-and-contact-details.json`.

No label, tie priority, vector arc, exception, protected rectangle, chart or guard was changed. No material RGB, source cost lattice, donor search, composite, scalar, map, generation, Git or build action occurred. The nine pinned failure/journal/code inputs and all 82 rtex054 HOLD inputs plus its eight analytic plan inputs were rechecked unchanged. An initial diagnostic repository-depth setup error was retained before geometry reconstruction; it was corrected in the diagnostic only and is not the rtex388 guard failure.

The next decision belongs to root and an independent digital-junction planner: retain the HOLD or separately review an exact representation policy that addresses both local owner contacts and four-region connectivity while preserving all other constraints. Do not broaden an exception or relabel an isolated cell merely because the discrepancy is close to a junction. Fibre/material/seam ART remains a later separate gate even if geometry is eventually qualified.
