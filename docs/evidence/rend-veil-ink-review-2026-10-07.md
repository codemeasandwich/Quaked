# Independent MRT ink/data review — 7 October 2026

Scope: root's separate RGB/alpha blending correction for non-rune ritual layers and ghost silhouettes. Changed only `tests/rend_veil_capture_state_test.js` and these evidence files. Renderer/source palette, buffers, schemas, passes and production shaders were not edited by this reviewer.

## Public material and receiver contracts

The public `R_RendVeilSeen` fixture creates the real local-effects graph and ghost materials. The added checks inspect actual material properties and actual fragment programs; ghost programs are generated through the actual composed `onBeforeCompile` callback using Three's basic shader source. No GLSL or GPU draw is executed.

- Non-rune local materials use custom weighted RGB blending `SrcAlpha + OneMinusSrcAlpha`, with independent alpha blending `Zero + One`, both additive equations. This lets dark ink attenuate the underlying albedo RGB while retaining the destination metadata alpha.
- Actual local fragment programs emit zero normal/extra packets and zero albedo RGB, adding bounded ink coverage only to the albedo packet's source alpha. Seal coverage includes `(1 - marks.g)`, so rune-letter pixels do not darken the underlying albedo. Pool/veil and other non-seal ink use their visible source alpha.
- The actual glyph line material remains additive and never receives ink coverage in its albedo alpha. Its zero receiver packet preserves receiver values, while its colour output can add rune light independently. Source inspection confirms native MRT initialization remains zero for this path.
- Actual ghost blend properties use the same independent metadata alpha factors and retain `depthWrite=false`. Their composed fragment source emits zero normal/mask packets and black albedo RGB with bounded `diffuseColor.a` coverage.
- Numerical evaluation using those actual blend settings preserves a representative signed depth alpha `-137.5`, normal RGB, packed visibility-mask values and albedo receiver class `.06`. Nonzero albedo ink coverage `.4` darkens only destination RGB to 60%; the receiver class stays unchanged. A seal letter channel of 1 gives zero albedo ink coverage and preserves the receiver packet.

These invariants directly address the deferred-light wash: changing only visible scene colour leaves original bright deferred albedo available; covering albedo RGB while retaining class/depth alpha prevents that mechanism without corrupting receiver metadata. Actual GPU appearance and buffer values still require root's live reload/readback.

## Execution and retained failure

The expanded fixture passed **6/6**: four existing capture/two-frame checks and two new ink receiver checks. Exact command, source/test hashes and output are in `rend-veil-ink-tests-2026-10-07.txt`.

The initial expanded run reported 5/6 because the fixture classified every shared `uSeal` uniform binding as a seal program. SummoningSystem shares that uniform object with pool and veil. The fixture was corrected to classify the actual fragment sampler declaration, keeping the distinct seal/rune coverage assertions and metadata invariants. No production fix was required for this observation. The failed run is retained in `rend-veil-ink-initial-tests-2026-10-07.txt`; its enclosing shell's final hash-command status was not treated as a test pass.

No additional defect found in the reviewed blending/packet contracts. This receipt is source/material/data evidence, not GPU compilation, actual MRT blending/readback, visible black palette proof, owner acceptance or release.
