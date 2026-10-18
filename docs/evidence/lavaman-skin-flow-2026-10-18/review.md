# Lava Man skin flow and creature heat: independent review

2026-10-18. Reviewer: `water_review`, independent of the runtime implementer and heat-test author. Reviewed the current four production files, retained `ba3a183e` public contracts, final public CPU/GPU fixtures, actual result JSON, failure receipts, and rendered native-lava comparison images. This reviewer made no runtime/index edits and launched no tests, builds, or GPU processes during this review. The reviewer authored this record and the preceding plan review only; test execution below was performed by the implementation/coordinator helpers and independently inspected here.

**Verdict:** no unresolved blocking source or controlled-trial finding. The implementation satisfies the corrected skin-flow architecture and the subsequently approved separate creature-heat requirement within the observed public-interface trials. This is not owner visual acceptance, a complete gameplay campaign, final exact-index distribution qualification, publication, or release approval.

## Scope and implementation judgment

The initial owner correction required skin features moving over unchanged native geometry rather than a surrounding effect substituting for that behavior. Later explicit steering separately approved additional creature heat and intense color/brightness matching natural HDR lava. Both requirements are present independently.

`r_lavaman.js` replaces CPU body deformation with one owned `R_CloneAliasMaterial` per eligible actor. It invokes the existing alias compiler with the current material receiver, preserves native-skin binding/compiler uniforms and cache-flag behavior, and adds actor-local stable time/phase uniforms. Pigment, normal-map sampling and derivatives, emission, gloss and the height-shadow context all use the same flowed coordinate. Height sampling operates in that already-flowed domain, avoiding double application of flow. The procedural native-chart domain uses linear non-mipmapped data, chart identity and conservative clearance; the independent audit checks that clearance cannot cross another chart/background. Unknown/ambiguous domains have no movement. No body position, normal, UV, index, bounds, blend lead, collision, animation or geometric shadow data is rewritten. `R_LavaManPositions` returns null for the native shadow fallback.

Native draw reselects the canonical material each frame; Apply correctly recognizes/rebinds its owned clone and retires it when its base/model/header changes. Release restores only a still-owned material reference and leaves successor ownership alone. Canonical materials/maps/native geometry remain borrowed. Material disposal unregisters its shared glow; the generated domain is shared between consumers and retired at last release. Temporary Classic rendering retains the Newer allocation/clock while using native geometry/material selection. Existing eight fire and twenty-four smoke instances remain attached to canonical triangles; only Lava Man's local flame color is changed, leaving shared torch/projectile palettes alone. The eight-actor cap and main-over-ghost priority remain enforced.

The other three production files extend the existing post heat path with eight separate actor slots, preserving the four pool slots and their selection. Current source receipts require a visible attached current-main-scene actor, exact supported native identity/skin, current client entity/model/header/material/pose/frame/time and no applicable native death. Ghosts, stale/unseen/detached/hidden actors and unavailable body materials cannot contribute heat. Optional flame assets do not gate body heat. Bounds are copied from the canonical current pose and world transform without mutating geometry bounds. Rays stop at opaque scene depth, held receivers are protected, underwater/off/Classic gates clear the addition, and overlapping actor contribution is bounded. The common pool helper uses a defined `1-smoothstep` fade with the original 30-to-150 pool endpoints. No extra post pass or scene-copy target is introduced.

## HDR calibration and clocks

Owned clones use the actual `R_RegisterGlow`/`LAVA_BOOST=6` registry and native `pulseLava` recipe; there is no shipped private actor pulse. Numeric pulse equality alone originally left the photograph too bright: the first real native-art comparison measured a red-P90 ratio of **1.8063**. The final local `hotRadianceTint=[.55,.25,.08]` calibrates the photograph's hot red pigment against actual native `*lava1`; charcoal cancels the global boost and retains pigment. The tint and unshaded hot-radiance branch apply only when live glow exceeds 1.001. With glow one, radiance is one, preserving HDR-off pigment. This is an art calibration within the shared pipeline, not a second clock or a change to native lava.

The first skin GPU run passed 165/166, failing exact repeated-image identity because it fixed skin time but left the established HDR pulse on `performance.now`. A temporarily tried private production clock is retained as an unqualified experiment and excluded from final source/proof. The accepted fixture instead calls public `pulseLava(visualTime)` after PostBegin/clone creation, controlling the independent shared HDR input alongside skin time. The repeat threshold is unchanged. This correctly proves deterministic rendering with both clocks controlled; it does **not** claim production page-clock HDR pauses/rewinds with `cl.time`. Heat motion is separately measured by advancing only the compositor clock while holding skin/glow time fixed.

## Inspected final verification

The final CPU log `/private/tmp/quaked-lavaman-flow-final-cpu.log` reports **26/26**, no skips: body/lifecycle suite 11, independent audit 8, independent heat suite 7. Its observed Node version is **v20.8.1**. The public command is:

```sh
QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js \
QUAKED_OWNED_PAK='/Users/bri/quaked/Dissolution of Eternity/pak0.pak' \
QUAKED_ID1_PAK='/Users/bri/quaked/Quake/pak0.pak' \
node tools/run_tests.mjs tests/lavaman_effects_test.js \
  tests/lavaman_effects_audit_test.js tests/lavaman_heat_test.js
```

These checks use the actual owned model, all ninety poses at three fixed times, native/interpolated attributes/shadows/blend leads, Classic save/restore, material/domain ownership, bounded actor/effect reuse, real level-view admission, source identity failures and heat lifecycle/slots. The measured CPU audit is a Node fixture, not a GPU frame-time or leak qualification; GC was unavailable.

`/private/tmp/quaked-lavaman-flow-final-gpu.json` reports **166/166**, **144 draws**, zero page/console errors, on Chrome WebGL via ANGLE Metal/Apple M2. Its actual native position/normal and depth deltas remain zero while fixed-pose face/body pigment and G-buffer albedo/normal/height outputs change. With heat disabled and existing fire/smoke isolated, patterned-background changes are zero. Actual body/fire/smoke and Classic controls are rendered, not inferred from shader strings.

`/private/tmp/quaked-lavaman-hdr-heat-final.json` reports **16/16**, zero page/console errors, against the final HDR guard, local Three import map, storage-write-disabled fixture, and consistent frame ID for light/post calls. It loads actual `maps/start.bsp`, palette and `*lava1` bytes through public model/material loading, plus the owned Rogue model. The recorded model SHA is `b81bb7f5cebb2889cfd2f431f743200f672d0195b05fe3faa98b50163fed7fb1`; BSP SHA is `a4e907bb36bb13e82be5656342a75cfd412e843784014f76a1df5bdcb63896d0`; native 64-by-64 lava RGBA SHA is `a2f6e41ca7ce81ca8d88d14ba26084cc83ca9ed544294ea00ea3900c2e9cf0a1`.

Final body/native pre-tone red-P90 ratio is **0.88663** under the strict .7–1.3 oracle. Bright-pixel green/red delta is **.001935**, blue/red delta **.013019**; the same HDR-bright pixels after tone mapping differ by at most **1.1553/255** per channel (limit20). Both actual images were visually inspected: the native bright red look is shared and the creature retains dark charcoal. This validates that controlled native-art comparison, not identical artwork or every exposure/environment.

Separate actor heat changes **5,474** outside-body background pixels and moving its clock changes **8,156**. An actual opaque foreground blocker, public held-receiver material and underwater controls each produce **zero** unwanted changed pixels. Four pool slots remain byte-for-byte unchanged with/without actor heat. Pool-only heat remains positive (**14,195** changed pixels). No shader/GL errors were reported.

## Failure preservation and limits

Retain the initial import-before-export fixture failure (`lavaman-flow-cpu-initial.log`); heat first0/5 and corrected1/5 registration/world-bounds-oracle failures; initial Chrome launch failure; skin GPU run1 165/166 clock confound; rejected private-clock run2; missing native E1M1 lava fixture; native-art run2 too-bright ratio1.8063 and unadvanced-heat-clock failure; and intermediate diagnostic/calibration receipts. Intermediate PASS labels, including the broad exploratory HDR range, do not qualify the final behavior. The final strict HDR/chroma/display oracle and controlled shared-clock receipts above are the accepted proofs. Original logs and sources must remain available alongside copied evidence.

These are actual GPU controlled fixtures and public native-model/material tests, not a full Rogue level playthrough, live multiplayer test, all-driver benchmark, prolonged allocation test, or owner acceptance. No final full-distribution gate result for this subsequent change was inspected here. The parent coordinator owns exact-index gate, Dev integration/push, final distribution receipts and owner preview/acceptance; those must be recorded separately without attributing them to this review.

## Production source identity reviewed

SHA-256 at final source review:

| File | SHA-256 |
|---|---|
| `src/newer/render/r_lavaman.js` | `76a0c9a9e93e49e0a51459b2aa3a9ef8304481bc0c53c869b2223c88fb3d7945` |
| `src/newer/render/r_post_liquids.js` | `f11247d4f04d4566d8baecac72004cf1b750ec35ec1ba13a2a12159a1f86c0c9` |
| `src/newer/render/r_post_shaders.js` | `8b7af0b7d49bf825b6337a10a73a690b81199d351f1ee28514709c5b2c456091` |
| `src/newer/render/r_post_targets.js` | `691b4f22bc4a44204400655e06fddc1c0683eba8bf55fbb97fba417c0a57940b` |
