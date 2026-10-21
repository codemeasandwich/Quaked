# ttex054 same-master scalar microdetail: plan and tiny diagnostic

Status: **candidate plan/tiny diagnostic for independent root review**. No production wrapper, restored full-image height, canonical master, tier or registration has been created. The interpolation and sparse-pore route failures remain intact.

Root explicitly authorized same-master scalar detail transport beneath the already-reviewed 10.8223% paint-boundary mask. The earlier blanket donor prohibition was a self-imposed restriction and is superseded only for photographic **fine scalar material detail from this same retained master**. RGB, native forms and registered physical features remain fixed. This authors unknown microscopic plaster under paint edges; it does not recover measured hidden geometry.

## Actual source patches and exclusions

The current v4 proposal uses two 48×48 master-pixel patches, at their original feature scale:

| Patch | Master source box, half-open | Interpretation |
|---|---|---|
| D1 | x416–464, y280–328 | Fine matte green plaster; selected clear of the large neighboring flake/pore |
| D2 | x80–128, y112–160 | Fine matte green plaster without a recognizable large chipped feature |

`donor-microdetail-plan-v4/qualified-patch-proposal-contact.png` is a **proposal contact**, not qualification evidence. It shows actual RGB above the derived scalar residual. `donor-source-selection-overlay.png` locates these proposals beside protected P1–P4. Both donor boxes have zero protected-feature and paint-boundary overlap. Neither RGB nor colour/albedo content is copied into the texture.

The initial four-patch v1 proposal is rejected: its D1/D4 contain recognizable small flake/pore motifs. Those source contacts and failed trials remain in v1. The current two-patch selection requires independent material/macrofeature review; low-frequency statistics alone cannot accept it.

## Fixed photographic signal and deterministic sampling

Keep the previous fixed-class `J=L/A` and reviewed boundary interpolation. Work in the same bounded height-input signal `N=J/(1+J)`. Extract photographic scalar detail with wrapped `G0.5(N)-G2.0(N)`, then subtract each donor patch's mean. No random values, noise functions, sharpening or new source image is used.

Place the 48px patches at scale 1:1 on a 32px overlap grid, with separable 8px cosine ramps and normalized overlap weights. Select the donor by `(17cx+29cy+(cx*cy)%7)%2`. Proposed orientation is `(7cx+11cy+3cxcy)%8`: exact quarter turns plus optional reflection. These transforms preserve sample scale and only reorient the proposed isotropic fine plaster signal. They are an explicit artistic choice awaiting root review; no registered pit, flake, colour shape or coarse structure is transformed. Remove an 8px slow mean and the assembled mean to prevent a copied broad shape/plane.

The first translation-only sampling had strong grid cadence (axis correlations about 0.49 at lag32 and 0.55 at lag64) and is retained as a failed v3 finding. The v4 orientation trial reduces lag32 correlations to 0.069/0.058 and lag64 to 0.126/0.134. Lag128 still measures 0.309/0.283, so repeat/material appearance remains a required review, not a declared PASS. The assembled residual has 0.455% of spectral energy at wavelengths longer than 16 master pixels; this bounds copied coarse signal but cannot prove absence of recognizable features.

## Variance restoration and joins

Estimate genuine fine-material variance only from known source pixels outside the boundary mask expanded by 16px. For each Gaussian scale, use normalized masked convolution `G(N*known)/G(known)` before differencing. Thus excluded paint-rim values cannot enter the material estimate through filter tails. This fixes the retained v1/v2 flat-fixture failures; v4's flat-painted surface has exactly zero target variance, donor gain and resulting relief error.

Use one gain for the entire mask, selected by a bounded 24-step numerical search so the measured robust core sigma after the same fine filter matches the genuine source statistic. This is not a per-stroke profile or a chosen bump-display amplitude. Actual target sigma is 0.02984706; the interpolated core is 0.00680834; v4 restores it to 0.02984706 with gain 2.71428. The gain and rare donor extremes remain visible in the report for independent review; nothing is clipped.

Add `weight*gain*photographicResidual` only within the reviewed compact mask and remove its weighted mean. `N` outside support remains bit-exact. P1–P4 hashes remain exact; visible registered physical features stay put. If a later implementation needs a restored `J`, invert `N` only inside support and copy the original `J` outside, preserving that earlier exactness contract. Downstream fine filters/normals naturally couple nearby pixels and require separate checks.

Measured normalized-signal slope RMS is 0.05964 on clean source material, 0.05609 on the restored outer join, 0.04983 in its transition and 0.05142 in the core. The interpolated core was only 0.01551. These are descriptive shared-scale checks for joins/variance, not substitutes for material review. No per-panel contrast or height-amplitude normalization is used in the opposed-light diagnostics.

## Tiny trials and acceptance limits

`donor-microdetail-plan-v4/` retains a 128×128 actual source region (master box x32–160, y560–688), unchanged RGB, before/interpolated/restored fine fields, fixed-scale opposed lights, and 3× nearest inspection enlargements. It also retains a flat-paint/false-rim fixture and a known nonconstant **photographic** scalar-field fixture. The flat fixture gives an exact plane with gain0. The nonconstant photographic fixture retains its known input outside support to floating precision and restores material variance inside; the hidden fine field is explicitly authored, not claimed recovered.

The tiny actual result restores visible material variation where plain interpolation created rails. This is a working diagnostic candidate, **not a whole-texture art pass**. Root must inspect whether any coherent paint outline persists, whether the detail reads as synthetic grain, whether a donor feature is recognizable, and whether joins/repeats are natural. Any such finding remains HOLD. Numerical RMS/PSD agreement cannot override it.

Root reviews the source-patch selection, orientation/sampling/math, actual tiny lights and retained failures before a whole-material diagnostic or production wrapper. There is still one raw generated source and unchanged canonical RGB/native data; no new source generation, RGB cloning, other-texture donor, macrofeature transport, catalog/Git/build/release change or canonical height/tier has occurred.
