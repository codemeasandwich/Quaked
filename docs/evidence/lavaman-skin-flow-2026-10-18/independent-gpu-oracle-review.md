# Independent Lava Man heat/HDR oracle review — 18 October 2026

## Bounded conclusion

No blocking finding remains in the inspected source, public heat tests and final controlled GPU oracles. The reviewer independently inspected the production adapter, existing post-pass integration, actual test inputs, masks, clocks, positive and negative pixel controls, final receipts and retained comparison images. The reviewer authored only `tests/lavaman_heat_test.js` and review/evidence files; no production or index mutation and no parallel GPU process was performed by this reviewer.

This review qualifies the bounded feature evidence. It does not claim a played Rogue campaign, owner visual acceptance, a completed exact-index distribution gate, committed Dev identity, application archive or published release. Those remain separate outcomes owned by the coordinator.

## Actual source/material path

The final helper reads the actual owned Rogue `progs/lavaman.mdl` (SHA256 `b81bb7f5cebb2889cfd2f431f743200f672d0195b05fe3faa98b50163fed7fb1`), original shareware palette, and `maps/start.bsp` (SHA256 `a4e907bb36bb13e82be5656342a75cfd412e843784014f76a1df5bdcb63896d0`). The comparison uses the literal hub `*lava1` texture, 64 by 64, native RGBA SHA256 `a2f6e41ca7ce81ca8d88d14ba26084cc83ca9ed544294ea00ea3900c2e9cf0a1` (the authoritative full value is retained in the JSON receipt). It is loaded while optional world texture replacement is disabled, so it is not an enhanced texture mistaken for native art. Its production `R_LiquidSurfaceMaterial` and the actual ready Rogue alias clone render through the same existing HDR compositor/exposure. The pool is shown on a controlled plane; this is not a reproduction of the full hub geometry.

The implementation preserves original source images and canonical geometry. One owned actor material chains `R_CloneAliasMaterial` and the canonical compiler; chart-bounded UV flow feeds aligned pigment, detail and height coordinates. The hot-only radiance calibration `[0.55, 0.25, 0.08]` is applied in the shader under an active HDR glow guard. It does not repaint the borrowed source image or add another pulse/brightness clock. `R_RegisterGlow`, `LAVA_BOOST` and the existing `pulseLava` remain the shared live intensity source. With HDR glow inactive the calibration contributes identity, preserving original pigment; Classic remains governed by the existing native material path.

Actor heat uses the same compositor pass and shared depth-clipped heat function as pools. A separate eight-actor collection preserves the four existing pool slots. Production receipts require the real registered client actor, exact admitted model/material/current-pose ownership, current seen time/frame, attached visible main scene and living state; ghosts, hidden ancestors, detached/stale/reused actors and unsupported inputs do not create heat. Returned bounds are copied conservative world envelopes derived from current native positions without writing native geometry or stored bounds.

## Oracles corrected before final qualification

The initial helper passed its intended heat clock as a visibility frame, leaving actual compositor time fixed. That fixture error was corrected in both public post calls. A subsequent mismatch caused `R_PostFinish` to reject the prepared snapshot because the draw counter changed between calls; both now use the same captured `frameId` and actual `heatTime`, retaining the current height snapshot. Neither correction changes runtime timing or weakens a threshold.

The final oracle also tightens the earlier broad intensity range to 0.7–1.3 and adds HDR green/red, HDR blue/red and post-tone color comparisons. Post-tone means use exactly the bright pixel indices selected from each pre-tone HDR sample; they do not independently choose a different post-tone region. A real visible pool-only heat positive control was added, and empty shader/runtime errors are now part of PASS. Earlier fixture and visual calibration runs must remain retained and distinct from the final receipts; their failures were not relabeled passing runtime proof.

## Final evidence inspected

- `reviewed-hdr-heat-final.json`: **16/16 passed**, 16 controlled draws on Apple M2/ANGLE Metal, no page, console or shader/runtime errors. The actual registered main actor gives one production heat source; disabling heat gives zero. The separate heat addition changes **5,474** background pixels, and advancing only the compositor heat clock changes **8,156**. Foreground opaque depth blocker, actual held-receiver mask and underwater comparisons each have **zero** changed pixels. Pool-only heat remains visibly active (**14,195** changed pixels) while actor heat is excluded. The four existing pool counts and vectors remain identical with actor heat present/absent.
- Actual pre-tone warm-red P90 is **2.978515625** for the body and **3.359375** for native lava, ratio **0.8866279069767442**. Bright HDR green/red is **0.1367094** versus **0.1347749**; blue/red is **0.0097281** versus **0.0227469**. The same selected bright pixels have post-tone mean RGB approximately **[255, 187.936, 176.068]** and **[255, 187.752, 177.223]**: maximum channel difference **1.156/255**. Both production materials use the same measured live glow scalar **6.7570603952**. These measurements substantiate similar bright-hot color/intensity in this controlled view, not equality of different artwork or every body texel.
- The reviewer inspected the actual retained body/native comparison images: bright red/pink hot regions and darker regions are present in both; the receipt values are consistent with the images. Owner preference for the final mix remains separate.
- `reviewed-skin-flow-final-gpu.json`: **166/166 passed**, no page/console errors. This separate actual-material trial establishes visible head/body pigment movement on unchanged native geometry/depth, changing aligned normal/height outputs, native pose/Classic transitions and bounded existing flame/smoke behavior. It must not be substituted by surrounding heat movement.
- `reviewed-native-final-cpu.log`: **26/26 passed** (11 behavior, 8 independent audit, 7 heat public-interface tests). The reviewer independently authored and previously ran the 7 heat tests against actual owned native model loading and production draw/Apply/Seen/producer/consumer interfaces. The coordinator/implementation helper performed the final combined rerun. The original independent fixture failures are retained in `independent-heat-fixture-first.log` and `independent-heat-fixture-corrected.log`; they exposed fixture registry/cvar and rotated-envelope assumptions, not established runtime failures. `independent-heat-final-7.log` records their corrected passing run.

Classic/custom-off/hidden/cleanup exclusions have direct CPU lifecycle/consumer proof; the final 16-check HDR helper separately proves GPU depth, held and underwater exclusions. The review does not inflate CPU exclusions into additional GPU pixel scenarios. Final build/archive/platform qualification remains required.

## Reviewed source hashes

- `src/newer/render/r_lavaman.js`: `76a0c9a9e93e49e0a51459b2aa3a9ef8304481bc0c53c869b2223c88fb3d7945`
- `src/newer/render/r_post_liquids.js`: `f11247d4f04d4566d8baecac72004cf1b750ec35ec1ba13a2a12159a1f86c0c9`
- `src/newer/render/r_post_targets.js`: `691b4f22bc4a44204400655e06fddc1c0683eba8bf55fbb97fba417c0a57940b`
- `src/newer/render/r_post_shaders.js`: `8b7af0b7d49bf825b6337a10a73a690b81199d351f1ee28514709c5b2c456091`
- `tests/lavaman_effect_trial.js`: `092a53e911a091a775f3098615ba2ca2ccddbc9bab679ff8760387dd318ffe21`
- `tests/lavaman_heat_test.js`: `9afaea89122226c91efd2cb40d0443e26892e3713add58b055ab70cde4210886`
