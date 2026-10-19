# Batch 003 independent public verification

19 October 2026. Technical qualification covers **rtex022 only**, an original
64×176 Hexen II world texture. Its retained raw image is 756×2079 with the exact
native aspect and enough source pixels for an 8× master. Mid is **256×704** and
High is **512×1408**. Low remains the unchanged native source.

`batch-003-public-actual-v1.json` passes the same independent PAK/palette/slot,
canonical RGB/float32 height replay, direct-master lossy WebP quality 92/method 6,
half/quarter comparison, cyclic edge and relief-normal checks as batch 002.
All **10 enhanced map files** reproduce byte for byte. That actual-map proof was
not rerun or replaced for a preview-only layout fix; masters and maps did not
change.

## Repaired comparison layout

The original review sheet placed its half-native comparison at y=595..859, then
painted the quarter comparison over its lower rows. The initial HOLD and old
preview hashes remain in `batch-003-public-preview-initial-hold.json`.

The corrected producer keeps the complete half view at y=595..859 and places
the quarter view at y=902..1034. It grows both canvas dimensions as needed,
fits wide overviews within their 512×512 bounds and avoids black padding in a
1:1 crop smaller than 256 pixels. The pixel budget uses the resulting width and
height. Actual queued 512×256 and 320×256 native classes also require wider
canvases for complete paired distance comparisons: their right panels exceed
the old fixed 1400px width.

`tests/texture_batch_review_test.py` exercises the actual public CLI with RED
original and GREEN replacement fixtures. The archived old producer fails four
groups: the 176px overlap, a taller fixed-canvas clip, wide-overview overflow and
the 512×256 native comparison's right-side clip. The corrected producer passes
all five groups, including unchanged 64×128 layout. The 512×256 fixture checks
the complete half-native original/replacement pair through x=2086 and the
quarter pair. The final RED/GREEN receipt is
`batch-003-public-layout-regression-v3.json`; the previous four-group v2 proof
and source remain intact. The initial development HOLD is
retained; its only new-producer failure came from a neutral JPEG channel tie at
one gap column. The final check uses the central gap, retains full overview and
below-panel checks, and preserves those three failures alongside the new
comparison-width failure.

`batch-003-public-preview-v3.json` rebinds the four files in `batch-003/review-v2`
to the final producer hash without reauthoring images or rerunning map math.
All **34 content/label panels** are pixel-identical to an exact public-CLI replay,
their rectangles are disjoint, all four HTML references resolve, and the HTML
is byte-identical. Differences in three JPEGs are confined to documented empty
tail padding: at most 56 pixels, maximum channel difference 8, outside all
content and labels. No content comparison uses an RGB error tolerance.
Temporary duplicate previews were removed; source inputs and staged work stayed
unchanged. The checked runtime binding files equal HEAD.

## Explicit exclusion

Portal's `ttex098` source is **1774×887**, below the **2048×1024** required by its
256×128 original. `batch-003-public-undersized-guard.json` runs the real master
preparation CLI and proves rejection before output creation, unchanged source
hashes and absence of accepted master/tier directories. It is not included in
the one-material or ten-map totals. No upscale, second generation or provider
action was performed by this verification.

These are source/codec/math and public authoring-interface checks. Art review,
owner acceptance, runtime/gameplay support and completion of the full campaign
remain separate. No Git mutation or publishing action was taken.
