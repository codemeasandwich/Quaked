# Lava Man: living skin, separate heat and native lava HDR — 18 October 2026

## Current owner direction

During the complete-distribution integration the owner clarified that the Lava
Man's skin features must stretch and move over the creature, conveying internal
twisting. A surrounding shimmer is not a substitute. The owner then separately
approved an additional heat shimmer from the creature and required its color and
intensity to match the intense HDR of natural lava. These are independent
requirements. Existing photographic artwork, native model/animation, gameplay and
bounded flame/smoke attachments remain canonical.

The shipped diffuse and height textures and the later texture-flow branch are
byte-identical: diffuse SHA256
`30348fe28f83481d995b5b259bacb15dbda92b8d11660e00a3c2097f5c7d9abb`, height
`1ae1cd5af01f9db008b97cfd4879b9b4be0b46f151e2be1799ace6173fcb46eb`.
The original Lava Man MDL identity is
`b81bb7f5cebb2889cfd2f431f743200f672d0195b05fe3faa98b50163fed7fb1`.
This work changes rendering behavior, not those source assets. The retained
`ba3a183e` test-only contract replaces the older mesh-motion interpretation.

## Skin implementation and ownership

`r_lavaman.js` reuses `R_CloneAliasMaterial` for one owned material per admitted
actor, preserving the current alias compiler, native skin binding and borrowed
maps. One deterministic, actor-local UV field drives pigment, normal sampling,
height gradients, luma and sheen. Height rays begin in the flowed coordinate and
are not warped a second time. Native connected UV charts are measured once from
stable indexed display geometry, with a shared, refcounted 300×194 domain texture.
Conservative chart clearance reserves bilinear footprint and height-ray reach;
ambiguous or boundary texels remain anchored instead of crossing into another
skin island or the black background. The maximum excursion is 4.5 native texels.

No position, normal, UV, index, pose, bounds, collision, interrupted-blend lead or
geometric shadow data is changed. `R_LavaManPositions` returns null, retaining the
native shadow source. The existing fire/smoke roots sample canonical triangles.
Lava Man's flame palette is locally orange-red; other torch/fireball palettes are
unchanged. An eight-actor cap and existing main/ghost admission priorities remain.
Material replacement, native/custom mode changes, Classic passes, scene retirement
and cleanup release only owned clones/domain/effect resources. Shared textures,
headers, base materials and native source data are never disposed or overwritten.

## Separate heat and HDR reuse

The creature contributes at most eight current-main-view heat boxes to the
existing composite heat-haze pass. It does not allocate another scene copy or
post pass and cannot consume any of the four existing lava-pool slots. Bounds
come from the canonical current-pose envelope transformed by the current mesh
matrix, padded by 12 world units horizontally and 80 above the body. Copies leave
native geometry and stored bounds unchanged. Sources are ranked within 2400
world units. The existing r_heathaze control applies; actor heat is independent
of the water-rendering switch.

Only admitted, visible, attached, living, current-frame main-scene actors qualify.
Unseen/stale actors, detached/hidden ancestors, reused client slots, replacement
models, unsupported skins/identities and cached portal ghosts cannot leave heat
behind. Underwater, Classic and disabled controls reset the actor count. The same
existing ray/depth and held-receiver rules constrain heat. Actor contributions
are bounded before joining the existing pool distortion. The shared column helper
uses defined increasing-edge smoothstep rather than the old reversed-edge form.

The owned material registers through R_RegisterGlow with the same LAVA_BOOST and
live pulse registry as native lava. Only hot pigment keeps that HDR gain, while
charcoal cancels it; the factor is applied once. No separate production pulse
clock or copied brightness constant is introduced. Literal native lava-art GPU
comparison, not numeric-factor equality alone, is required before final delivery.

## Evidence and reproducibility

Native CPU contracts use the actual owned Rogue MDL, all 90 poses, interpolated
buffers, native material selection and public lifecycle calls. The independent
heat tests use the same real alias draw/Apply/Seen path and real createPipeline /
R_PostLiquidUniforms, including negative controls. The actual Chrome trial renders
through the production alias/HDR compositor on the Apple GPU and tests pigment
motion with heat disabled, native silhouette/depth preservation, normal/height
movement, UV domains, phase/ownership, fire/smoke and Classic behavior.

The initial shared-HDR GPU run passed 165/166: the fixed-time body comparison had
left native HDR pulse on performance.now while fixing only the skin clock. That
is an independent clock in the established lava renderer. The final timed fixture
calls the public pulseLava(visualTime) after PostBegin and clone creation, fixing
both clocks for the repeated-image comparison. Pixel thresholds remain unchanged
and production retains the common native pulse. A briefly tried private pulse
fork is retained as an unqualified attempt and is not the shipped implementation.

The local actual-owned checks can be reproduced with Node 24 and:

```sh
QUAKED_THREE_MODULE=/absolute/path/to/three/build/three.module.js \
QUAKED_OWNED_PAK='/Users/bri/quaked/Dissolution of Eternity/pak0.pak' \
QUAKED_ID1_PAK='/Users/bri/quaked/Quake/pak0.pak' \
node tools/run_tests.mjs tests/lavaman_effects_test.js \
  tests/lavaman_effects_audit_test.js tests/lavaman_heat_test.js
```

The maintained exact-index gate runs these additional owned suites when both
explicit owned-input variables are supplied. A CI runner without those originals
does not claim their native proof; the reproducible feature evidence remains
separate. Original archives stay read-only and are never bundled in the product.

## Coordination and next action

Owner: this Codex session. Source is the existing combined Dev-based worktree
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, after verified integration
28765ac3. The initial combined distribution is retained as a qualified baseline;
it does not contain this subsequent behavior change. No natural-surface or
rock-edge trial is resumed. New implementation/test edits remain unstaged until
review and proof complete; no commit hook or gate is bypassed.

Bluey storage remains unavailable (correlation
35394fa01e474d6f9eb4b026be6b9190). This source record, the full-distribution ledger
and the evidence directory retain the actual responsible owner, failures, scope
and next action without claiming a board mutation or durable worker handoff.
Current next action: finish actual native-lava HDR and separate-heat GPU checks,
review the final source, rerun the complete exact-index gate with owned inputs,
land on Dev, then package and verify the final web and universal Mac distribution.
Owner visual acceptance remains distinct from those technical checks.


## Final pre-gate verification

Final public native CPU checks pass 26/26 (19 skin/lifecycle/audit plus 7 independent
heat/glow checks). The first local receipt used Node20.8.1; the full final gate
uses bundled Node24 with explicit owned inputs and reruns those suites in its
exact staged snapshot. Actual Apple M2/ANGLE Metal skin rendering passes 166/166
checks across 144 draws; the separate native-art HDR/heat trial passes 16/16.
Both final GPU receipts have empty page, shader and console error lists. Independent
source and oracle reviews find no blocking issue. See `verification.md`, `review.md`
and `independent-gpu-oracle-review.md` in the evidence directory.

The literal native *lava1 reference is extracted by the normal BSP loader from
the shareware start.bsp, using its real palette and native liquid material. It has
RGBA SHA256 a2f6e41ca7ce81ca8d88d14ba26084cc83ca9ed544294ea00ea3900c2e9cf0a1.
The initial creature was too pale/bright (hot-red P90 ratio 1.8063 against the
first reference sampling). Only HDR hot pigment is now calibrated by [.55,.25,.08]
against that actual reference, preserving charcoal and non-HDR art. Shared native
glow/pulse remains unchanged. Final red-P90 ratio is .88663; bright HDR green/red
differs by .00193 and blue/red by .01302. The same HDR-bright samples differ by at
most 1.156 displayed RGB levels after the same tone pipeline. Acceptance bounds
(.7–1.3 intensity ratio, .05/.035 chroma deltas, 20 displayed levels/channel) were
set before reading calibrated results and were not weakened to pass.

Heat alone changes 5474 background pixels and advancing only its compositor clock
changes 8156. Opaque-front, held-receiver and underwater controls produce zero
unwanted change. Existing visible pool heat has its own positive 14195-pixel
control, and all four pool slots remain intact. Final fixture calls use one shared
visibility frame ID; the earlier helper argument/frame mistakes remain retained
as fixture failures. These controlled public trials do not replace a played
campaign or owner visual acceptance.

The owner preview runs at http://127.0.0.1:49839/tests/lavaman_effect_trial.html,
using local Three.js and disabling settings persistence. Its supervised helper is
PID50092 / exec session6071, not a durable background-worker handoff.
