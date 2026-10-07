# Independent two-frame contract review — 7 October 2026

Scope: root's larger ritual frame while retaining the original native body/reveal/shadow frame. The reviewer changed only `tests/rend_veil_capture_state_test.js` and these evidence files. Root's production source and palette edits were not changed. Source identity and execution are recorded in `rend-veil-two-frame-tests-2026-10-07.txt`.

## Public functional evidence

The fixture uses real Three geometry/matrices and the existing public `R_RendVeilSeen`, `R_RendVeilFields`, `R_RendVeilLights`, `R_RendVeilShadowVersion` and `R_CreateShadowCaptureMaterial` APIs. Its representative body has actual measured 16 × 16 × 52 native-unit geometry at world `(128,64,26)`, with an invocation sampled at age 0.9. It reads/transforms actual vertices rather than copying the implementation's frame coefficients.

- **Ritual only grows:** the published FX unit is 20, twice the original body's 10 units per 5.2 authored height. Existing mesh scale, complete world matrix and every measured world vertex remain unchanged.
- **Optical body protection uses FX units:** measured vertices occupy canonical FX extent `(0.8,2.6,0.8)`. Published subject bounds retain the supplied conservative `.10` body-unit padding, correctly halved to `.05` FX units, giving `(0.9,2.7,0.9)`. Repeated public reads keep those same bounds rather than cumulatively shrinking them.
- **Light follows the larger destination:** the actual public native light emitter is at `(128,64,24)`, with finite reach `84 = 4.2 × 20`. Its positive finite native power is below 0.1 at age 0.9, confirming the subdued non-rune source. No visual color/brightness equivalence is inferred.
- **Body/shadow reveal retains original coordinates:** the actual public capture material, bound to a representative borrowed caster identified by `rendVeilSource`, receives Matrix4 canonical transforms, Color magic and scalar clock uniforms. Native vertices occupy canonical body extent `(1.6,5.2,1.6)` and round-trip through inverse/model/world transforms to their original actual world positions. This would detect using the doubled FX inverse for the body mask.
- **Shadow clock/cache remains live:** at age 0.9 the first draw receives time 0.9, progress 0.352 and nonzero coating. At 1.4 the same uniform bindings and program key persist while time/cache version change. At Focus 2.5 progress is 1, coating is zero and the temporary reveal cache version retires to zero.
- The earlier successful/failing capture-state tests continue passing, including DPR2/offset logical defaults, physical HDR viewport/scissor, visibility restoration and failure-guard recovery.

## Failure retained and corrected fixture expectation

The first expanded run passed 3/4. It incorrectly compared published conservative bounds with raw vertex bounds, reporting minimum x `-0.45` against `-0.40`. Reading the supplied `getEffectBounds()` confirmed its intentional `.10` body-unit expansion. The fixture was corrected to require that padding to halve with the 2× FX frame while retaining separate raw-vertex extent assertions. No production fix was required for this observation; the failed run and exact test/source identities remain in `rend-veil-two-frame-initial-tests-2026-10-07.txt`.

The corrected fixture passed 4/4. A parallel palette edit changed `local-effects.js` during this review, so a justified final narrow rerun captured identical relevant source hashes immediately before/after execution and passed 4/4 again. This is the two original capture tests plus two new contract tests; it is not a claim that earlier broader suites were rerun.

## Limits

No GPU/browser was launched. These public data/state tests use a representative real Three body, not the stock MDL renderer or native QuakeC monster spawn. They do not prove shader compilation, actual palette/mask appearance, occlusion or owner acceptance. Root's actual GPU inspection and the other palette/rune source audit remain separate. No additional defect was found in the tested two-frame contracts.
