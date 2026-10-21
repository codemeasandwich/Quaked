# Fixed shared-anchor amendment and paused checkpoint

Status: diagnostic implementation only; root review required before actual source DP. F1 and peer HOLD remain. No composite, RGB, scalar, master or tier mutation.

Keep every rank-1 integer vertex. In each of the four fixed C2 cap curves, retain the negative progress -1 and shared progress 0 at anchor ordinate a, insert the sole geometry knot (+0.5,a), then reconnect to the unchanged progress +1 vertex. This changes only segment 0..1, by at most 0.5 pixel; the shared plateau covers pixel centres [-0.5,+0.5]. Integer source samples, donor offsets, ranks, distant junctions, long paths and the proposed additional 8,725-state ceiling do not change. No RGB interpolation is introduced.

Pixel indices use centres (i+0.5,j+0.5); tie selects the outer incident owner (P > X > Y > C). Strict adjacent first/last wrap-pixel owner-family equality remains mandatory and fail-closed. Vector continuity alone does not satisfy it. Cap-X and cap-Y use the same rule with transposed axes and reflected signs. The four-owner corner therefore reads one adjacent 2x2 C chart, not a wrap-side chart switch.

Actual repaired classification examples (proposed geometry only): C(511,471)->(383,87) and C(0,471)->(384,87); C(471,511)->(343,127) and C(471,0)->(343,128). Before the amendment, the latter neighbours were wrongly X(0,471)->(384,471) and Y(471,0)->(471,128). The four corner C lookups are (383,127),(384,127),(383,128),(384,128).

Five source-free fixtures demonstrate the old defect and amendment on both axes, reflected signs and slopes -1/0/+1 across all 512 centres, old-vertex preservation and bounded deviation, exact adjacent source addresses and protected collar bounds, and rejection of altered anchors/steps. Only anchor_bridge.py and its tests are implemented. Full graph/atlas/continuation helper is not yet implemented. Actual continuation DP remains unissued: 844,800 parent states spent, 155,200 global states remain; no budget reset.

Paused at root request to independently qualify already-generated demo-priority rtex336. Next owner: root reviews addendum/code/fixtures before any actual 388 continuation search. No source reroll or broad search authority.
