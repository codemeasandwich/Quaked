# tech10_1 physical landmarks and actual base-map cuts

**Geometry HOLD; no global shift or scale is justified.** The colour-only candidate retains its independent bounded offline pass. No new correction pixels were produced in this lane. The owner requested Dev integration while this measurement was in flight; this record seals that bounded finding and stops further texture work. Root owns integration and the next decision.

Actual inputs, unchanged hashes, ten/16-head count, approximate centres, all relevant base-game face vectors and nine shared-edge relationships are retained in [measurement.json](measurement.json), reproducible with the docs-only [measure.py](measure.py). The [annotated view](native-owner-landmarks-actual-cuts.png) shows native and exact owner art at the same64-native-texel period. Cyan circles mark side-column centres; yellow circles mark additional source heads. Magenta lines show actual base-face T cuts. Enlargements are evidence only, not authoring or new HD detail.

## Landmark findings

Native64×64 has two side columns with **five heads each**,10 total. Approximate native pixel-edge centres are x6.5 and57.5, at y9.5,20.5,31.5,42.5,53.5. Interior Y pitch is11; the last-to-first interval across the64px repeat is20. A dark horizontal plate boundary occupies the upper/lower native edge region.

The exact retained256×256 owner artwork has **six heads down each side**, plus two interior heads along its top row and two along its bottom row:16 total. Side columns sit approximately at native x5.75 and58; row centres are y5.5,16,26.25,36.25,46.25,56.25. Interior Y spacing is about10–10.5 native texels; wrap spacing is about13.25. The central extra heads are approximately x22.75/40.5 at y5.5/56.25. These are physical silhouette readings with **±1 native texel tolerance**, not claimed subpixel calibrated geometry. Counts and BSP cut phases are exact and do not depend on that tolerance.

Thus this source has more than a palette discrepancy. It changes rivet count, vertical phase/spacing, upper/lower row content and the native joint. Uniform scaling to the native11px pitch cannot remove the extra row/heads within a fixed64px repeat. A periodic monotonic warp or phase translation also preserves motif count. Neither can restore the native pattern while retaining every exact owner-art head.

## Actual scene relationships

These measurements use the base-game BSP proof, not assumed shareware placement. At wall y2816, face2823 (`tech10_1`) covers z−32..−4 and x−592..−448. Its T is `−z−32`; the **top boundary is T−28 modulo64=36**. It contacts `tech08_1` face2827, which has T128 modulo128=0 on that same edge. Native T36 lies between rivet rows31.5 and42.5; owner T36.25 is a head centre. The actual cut therefore passes through a source head where the native pattern leaves plate space. This gives a concrete geometric cause for the clipped-head transition visible in screenshot08.10.01.

Face2823's bottom is T0, contacting `tech08_4` face2825 and `tech10_3` face2826. Its door-side cut is S−416 modulo64=32, against `tech09_3` face2818 at S−368 modulo128=16. Its perpendicular same-material neighbor2124 meets at matching native S16/T phases. These are not all full texture-edge joins, so flattening or matching all four tile boundaries would miss the actual contacts.

On the door's other side, narrow face2828 uses T4..32, S0..16. Its top T4 touches `tech08_1` face2824; source first-row centre5.5 is near that cut, while native first-row centre9.5 is farther inside. Its bottom T32 meets `tech08_4` face2832; native has a head near31.5 while source's adjacent rows are26.25/36.25. Its side joins are with door2818 and strip2816 (`tech10_3`). A translation chosen to improve one top cut would move other inherited contacts and cannot reconcile the head-count difference.

## Minimum correction decision

Keep the independently reviewed colour-only trial as a separate uninstalled candidate: it reduces the warm/orange bias without moving this artwork or its matching old height. **Do not apply a guessed global phase, scale, warp or universal seam equalization.** The remaining transition combines that material/palette difference with a demonstrated pattern/spacing/joint mismatch. Colour improvement alone cannot qualify it as an alignment repair.

Removing heads, rebuilding plate joints or locally reauthoring a pattern would change the owner's artwork and is outside this measurement lane. No such action is proposed as an automatic next edit. Any eventual geometry decision must explicitly choose how to reconcile preservation of the selected art with the native motif count and the actual face cuts, then bind RGB and matching scalar relief together. Shifting RGB alone would misregister the existing height; shifting both still cannot solve the count mismatch. Existing source256 and old crafted height256 hashes are protected in this record; they were not modified or relabelled as current full-precision8× masters.

No assets, index, engine, Git state, provider, browser, native build or Bluey retry was changed or launched here. This is static source/BSP evidence, not new runtime or owner acceptance.
