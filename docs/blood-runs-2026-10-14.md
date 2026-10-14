# Blood runs within existing splash marks

Effect 11, T-3faa98e3. Large fresh blood splashes on near-vertical world walls may grow a short,
narrow run under the existing `r_decals` control. No additional blood event or ordinary mark slot
is created. Small marks, floors/ceilings, holes, scorch and drops keep their original geometry.

The same mesh and material retain all original 1,536 vertices as an unchanged first block. Each of
the 384 ring slots has one additional four-vertex block for its optional run. The original splash's
UVs, colors, atlas choice, rotation, two random draws, birth and lifetime are unchanged. The optional
run shares its color and fade, expires with it, and is cleared when the slot is reused. Ring order,
capacity and eviction are unchanged; one mesh still draws the marks.

Gravity projected onto the wall determines the run direction. A tapered strip samples the same
blood-atlas cell, grows at most eight units over 2.5 seconds using the existing mark clock, and stays
at the original 0.3-unit surface offset. Original-quad UV coordinates are projected across the strip;
the shader discards a tail fragment wherever the original atlas sample has coverage. Those UVs have
the original mapping derivatives, including minification, so the new strip does not darken accepted
splash pixels a second time. It may extend through transparent parts of that same mark.

The existing same-face query checks the narrow path. In addition, `FX_SolidPolygon` clips the entire
proposed backing quad through the existing point hull, refusing any non-solid part. This closes the
subunit-gap failure reproduced by independent review; sampled points and a start-solid motion trace
cannot prove continuous support. The query is capped at 4,096 visited pieces and rejects unavailable,
malformed or unresolved geometry. It does not change physics or introduce moving-brush support.

**Open air only:** every point the run checks must lie in open air in front of the wall (never in
water, slime or lava), so a splash just above a pool does not run down into it. The owner's rule is
realism, not more gore: no new blood is made and the splash itself never moves or grows.

**Which blood:** any blood mark the existing marks put on a wall can run, whatever made the wound,
including a shotgun kill's. The shotgun's own effects (pellets, casings, bubbles, smoke, burns) are
not touched; the run belongs to the blood mark, which was already there.

**Cost:** while a run grows (2.5 s) the marks' buffers are sent to the GPU each frame, where before
they were sent only when a mark was placed or faded.

## Evidence

The pre-change public baseline in `tests/fixtures/blood-native-before.json` captures SHA256 hashes
of complete original position/UV/color blocks across 384 mixed marks, expiry/fade clocks, and a ring
overwrite. Seven public cases preserve those hashes exactly, retain two native RNG draws per placement,
and cover growth, slot reuse, shared lifetime/visibility, ineligible marks, narrow backing gaps,
cross-rail holes, malformed planes, bounded traversal exhaustion and a wall under water (added after
the independent review of 14 Oct; it fails without the open-air rule).

The GPU trial uses the actual atlas and production material. Six WebKit checks preserve every
original-covered pixel byte-for-byte at nearby partial/full growth and a minified full-growth view.
Positive extensions are visible in all three cases. Visual inspection corrected an initially detached
strip; the resulting short run joins the lower splash. Earlier failing results remain in the campaign
evidence directory. Full release checks and owner acceptance remain separate from these fixtures.
