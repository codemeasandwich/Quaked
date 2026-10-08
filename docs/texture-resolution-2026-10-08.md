# Replacement texture sampling regression

Bluey: T-38ce3342. Workspace: `/Users/bri/SOURCE/Quaked`, branch `Dev`.
Implementation baseline: `9b4ecf10ef4fe25aaa6ac35a827235d3afd7e730`.
The owner selected this card after requesting the existing commits be pushed;
that push to `origin/Dev` succeeded before this change.

## Cause and correction

Commit `038fe593277e771a104a5412c611aedaadb6a206` (4 October) added a
four-texel minimum pigment footprint to soften replacement-image grain.
This is consistent with the owner's recollection of a recent regression.
At close range it forces roughly mip level 2, even when the full image could
resolve more detail. The loader was retaining the authored pixels.

`gl_post.js` now uses a two-texel minimum. It averages alternating one-texel
grain without erasing complete two-texel features. This restores one mip level
of close-range detail; it does not promise unfiltered mip-zero output.
Larger natural footprints continue to choose their existing mip levels.

The change is a uniform value in the existing `R_RegisterDetail` hook. Its
GLSL and program variants are unchanged, so no new program-cache key is needed.
It does not alter source images, geometry, UVs, normal/height sampling,
anisotropy, Classic rendering, or dynamic-resolution policy.

## Trace and verification contract

`r_newertextures.js` decodes full image dimensions and replaces the existing
DataTexture's image. BSP texture dimensions retain native mapping scale.
Both world surfaces and brush-model ammo boxes use
`createQuakeLightmapMaterial` and the same detail shader.

The finite `tests/texture_resolution_gpu_trial.html` compares floors 4, 2 and 1
using actual `tech01_1.webp` (256 square, native 64 square) and `shot0sid.webp`
(128 square, native 32 square). A GPU `textureSize` readback checks mip-zero
and mip-two dimensions. Independent line pairs distinguish retained artwork
from the old alternating-pixel grain oracle. Classic pixels, normal attachment,
source bytes and normal-generation identities are checked independently.

The original surface-filtering GPU trial also tests both unequal derivative
axes, broad height-shadow blockers and flat negative controls. Its analytic
normal fixtures must be rebound after `R_PostBegin`: asynchronous normal refresh
can otherwise replace the declared fixture and make the shadow test vacuous.
The initial uncorrected fixture failed with zero valid receiver masks; thresholds
were not loosened. With explicit fixture binding it passes with 55,200 valid
receiver samples and 7,200 broad-ridge shadow samples.

Native final-frame verification uses
`tests/texture_resolution_gameplay_trial.html`. Comparison overrides live only
in that test page; the game uses the production default. Close the test tab when
finished to stop its game loop. The finite GPU page has no gameplay loop.

## Results and limits

The initial GPU comparison retained the full authored mip-zero dimensions.
Two-texel line contrast was 0 at floor 4, 143.82 at floor 2, and 192.49 at
floor 1. Floor 1 fails the existing one-texel grain suppression requirement;
floor 2 passes. Classic and normal attachment comparisons were exact.
Both directional grain controls at anisotropy 16 passed, with mean error 0.455
against authored broad-band values.

The final [GPU receipt](evidence/texture-resolution-gpu-2026-10-08.json) has
222 passing checks, including the unoverridden production default. Four-phase
minification comparisons against four spatial subsamples per phase reduced
temporal delta error from 0.904 to 0.859 for tech01_1 and 1.021 to 0.537 for
shot0sid. This is a bounded sampling check, not proof for every camera path.
Warmed CPU submission/finish timings quantized to 0–0.1 ms; they cannot establish
a GPU performance difference. No texture allocations, startup requests or
source dimensions changed. Finer mip access can still affect texture-cache cost.

[Targeted automated checks](evidence/texture-resolution-tests-2026-10-08.txt):
21/21 across surface filtering, normal-source identity, asset readiness and
height shadows. The height test originally failed on the baseline too because
source-constrained replacement models lacked actual native model metadata in
the fixture. It now loads the actual models and tests all 21 native and 14
replacement scalar assets. Independent final review reran the 11 surface and
height checks successfully and found no correctness blockers.

Native staged inspections used E1M1 with noclip/notarget, dynamic resolution
disabled, display 2560×1440 at DPR 2, and scene target 2562×1440. World tech01_1
is ceiling artwork here: target [480,-384,192], near eye [480,-384,160], with
oblique and farther clear views. Production versus old filtering showed sharper
wire and fastener detail. The shell pickup (native entity 108, maps/b_shell0.bsp)
was viewed near, oblique and far; its side/top maps remained 128×128 with
anisotropy 16, trilinear minification, mipmaps and uniform 2. Native server and
client models agreed and the brush remained in the scene. Classic toggling
rendered successfully. A real 150 ms A-key input moved the eye 41.3 units and
released movement buttons afterward.

Early native fixture attempts rejected an incorrectly restricted vertical-wall
selection and then collected the ammo at a too-close camera position. Both
fixture errors were corrected before accepting native evidence; the final
camera stays outside the pickup's expanded touch box using the player's full
hull. Those attempts are not counted as successful ammo verification.

Screenshots were inspected through browser tools. Native screenshot export was
unreliable in this browser session; do not infer saved native PNG evidence from
the observations above. The fixture exposes capture links for manual inspection.
Owner appearance acceptance is not claimed. Agent-created gameplay tabs are
closed after verification; the existing preview server remains available.
