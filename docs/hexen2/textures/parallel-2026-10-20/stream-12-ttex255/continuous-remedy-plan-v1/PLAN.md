# ttex255 continuous relief proposal — active draft

This draft is isolated from the root checkpoint. It proposes a small new semantic component for the same retained source; **no new wrapper, scalar field or normals have been implemented**. Current technical detail is in `plan-v3-mesh-complete.json`. Implementation is deferred under the owner’s Hexen II demo-first priority. Earlier `plan.json` and the affine/hinge algebra observation remain exploratory history, not approved recipes.

The retained layered trial correctly puts rock above nearby snow, but its neutral views show sharp walls and broad flat platforms. The failure is preserved in `../pre-tier-review/physical-trial-v1/PHYSICAL_HOLD.json`. The actual guarded CLI reproduces all three trial package files byte-exact. Zero tiers were encoded.

## Why another parameter choice does not solve it

The existing layered function selects `lower` or `facing` using a hard `np.where`. Its ordered planes preserve a nonzero gap even at the interface: with the approved trial values, facing minimum `.65` exceeds snow maximum `.60`; at equal local detail the contact step is about `.15`. A larger pre-selection blur cannot remove that jump. The shared photographic detail is only `.1 × detail`, leaving sampled rock standard deviations about `.007–.019`; it cannot establish the missing large face slopes.

Three problems need separate treatment:

- **Contact walls:** the final hard selection creates them. Change the composition, not just its blur width.
- **Missing mineral faces:** author coarse slopes from visible source features, independently of pigment/shadow.
- **Dark staining or fissures:** colour alone cannot select a cavity. Only a reviewed physical crease/gap may control macrogeometry; residual dark-edge emboss remains a falsification check.

## Smallest proposed new component

Retain the current source/proof pipeline and add a source-bound scalar wrapper. Its provisional name in the JSON is not an existing tool or implementation approval. It would use an explicitly reviewed small triangle mesh whose vertices have artist-authored relative heights. For a triangle:

`rise = w0*d0 + w1*d1 + w2*d2`, with nonnegative barycentric weights summing to one.

Shared vertices make adjacent triangle heights identical along their shared edge. Values stay within the authored vertex extrema, avoiding independent-plane extrapolation. The proposed semantic surface is:

`H_semantic = H_snow + existing_wrapped_gblur(authored_rise, sigma_contact)`

There is no final separated-plane selector. The mesh is already continuous; the unchanged wrapped filter smooths contact/normal kinks. Source-specific crease geometry supplies changes in slope rather than a texture of invented bumps. No runtime image classifier, general terrain engine or noise generator is proposed.

An initial affine-face proposal was rejected during algebra checks: `.16–.24` control rises extrapolated to `.364` at a source boundary. That observation is retained. Do not clip, normalize or silently fit that result. Bounded shared-vertex interpolation addresses the specific mathematical deficiency.

The interior pilot proposes snow baseline `.55`, visible face/crest rises around `.16–.24`, unchanged `.3/.5` normals and the original opposed lights. Its actual rock/snow span must be compared with the failed trial; reducing amplitude to conceal geometry is not acceptance. Contact vertices on this **interior** rock/snow boundary may meet the snow base. Whole-source cropped rocks need explicit wrapped continuation controls: zeroing every image-edge vertex would invent a perimeter bevel and is prohibited.

For fine detail, recompute the unchanged source `craft` function in float64 and verify its float32 replay against the initial NPY. Keep gain `.1`, as in the failed trial. Preserve the current snow detail; propose fine-only rock residual `B - gblur(B, 8 master pixels)`, blended using a softly wrapped, reviewed **material** role mask. Elevation membership is separate: pale snow caps or mineral veins are not automatically lowered. Broad rock tonal shading is intentionally excluded from macroshape. The actual source residual, black patches, RMS/PSD and neutral views must still prove useful physical detail; the formula is not a material pass.

## Actual source controls

The pilot is the central broken-rock chain, master box `[512,336,896,544]`. Twelve manually located face/crest/shoulder controls and their positional/height uncertainty are retained in `pilot-source-controls-v2.json`. The complete four-zone **neutral source-role partition** is in `pilot-source-topology-v3.json`; all 29,822 body pixels are covered once, without overlap or outside coverage. These zones guide review; they are not a height selector or completed mesh.

![Actual source zones and proposed controls](/Users/bri/SOURCE/Quaked/docs/hexen2/textures/parallel-2026-10-20/stream-12-ttex255/continuous-remedy-plan-v1/complete-source-facet-role-overlay-v3-1to1.png)

The orange fracture guide and dark-patch witness in the earlier source overlay record uncertainty rather than a measured depth. The completed proposal is `mesh-proposal-v1/pilot-mesh-v2.json`: 95 shared vertices and 110 triangles, with all three proposed source crease paths represented by shared edges on both adjacent zones. Author verification proves one manifold disk, no holes/overlap/T junctions, exact source footprint area and exact centre-sample coverage. Independent source/anchor/physical review remains required before implementation. Geometry-only diagonal improvement preserves every source contact, crease and anchor attribute. It reduces all-contact-anchor triangle area from 30.7% to 9.48%; the remaining support question is explicit (maximum centroid distance 13.05 master pixels from contact). Interpolation edges are not claimed to be observed fractures. Arbitrary visible triangulation ridges or flat interior pockets would be an art failure. This pilot cannot qualify the other 26 bodies, retained pale pockets or cropped contacts; all need actual whole-source controls and review before a canonical successor.

## Reuse and guard contracts

Keep every historical producer unchanged. The existing enemy structural field provides Gaussian ridges and elliptical recesses; those cannot directly describe these extended sloping mineral faces. Adding many such features would substitute new geometry for the source. The necessary new math is the bounded source-control field evaluator.

The proposed wrapper would reuse:

- The genuine `b5df…` source/master proof and actual initial `prepare_texture_master.py` CLI replay, comparing RGB, float NPY and package bytes exactly in a temporary directory.
- Existing `craft(..., quantize_height=False)`, wrapped `gblur`, bounded input readers and stable hash observations.
- Existing `publish_exclusive` for atomic no-replace output publication.
- Existing direct tier and public review CLIs after actual whole-source physical qualification.

The parent is the verified initial master, not the failed layered scalar. Guard exact native/name/edition/dimensions, raw/prompt/RGB/tool/proof hashes, finite reviewed vertices, nondegenerate triangles, coverage, shared edges, physical caps/recesses and clipping-safe headroom. Reject changed rereads and existing/late output destinations. RGB remains byte-identical; cast scalar to float32 once. A new authoring-policy name must disclose the changed physical contract: contacts may meet snow smoothly, so global every-rock-above-every-snow separation is not claimed.

## Falsification before any delivery

Before code, independently review the source controls, completed mesh and exact proposed contract. Meaningful tests would include convex bounds and shared-edge continuity; flat semantic surface despite a colour step; known face slopes; unchanged macrogeometry under a black albedo patch with micro disabled; finite/no-clipping behaviour; malformed source/proof/mesh and changed-read refusal; and no-clobber publication. A nonconstant photographic residual must survive with its declared filtering influence and gain, without new grain.

Then inspect a bounded actual pilot with scalar, XYZ, fixed opposed lights and source feature crops at the same height span. Reject a rounded-mound substitute, arbitrary diagonal creases, plateau, cookie-cutter rim or stain-derived pit. Only a successful pilot justifies completing the whole-source guide. Only an accepted whole-source master justifies direct Mid512/High1024 Q92/method6 maps and decoded/public/independent review.

No new source, producer implementation, tier, RGB edit, build, shared-state/Git change or child agent is authorized by this draft. Root owns the next independent design decision.

## Demo-priority deferral

Direct existing-parser BSP checks show no selected-identity or exact-RGBA slot in cath, rider1a, demo1 or Portal thomas. The three loose Hexen recordings and Portal recording are hash-bound and their first valid packet map literals checked. This is compiled-map evidence, not camera visibility or current app activation. The selected texture remains confined to tibet1/tibet2. No further ttex255 field implementation or source/tier call is authorized under the new priority. Preserve the source, failed trial and completed planning checkpoint; continue only the root-assigned rtex020 source-only intake.
