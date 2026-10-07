# Independent background-capture restoration review — 7 October 2026

Scope: root's bounded `R_RendVeilCapture` restore-order correction, current source SHA-256 `9f08417fe4dba72b6a2f7d1cce08c49637ef0530c640d39bce6705f6f8d83897`. The reviewer previously authored the optics helper's corresponding target-state restoration; this receipt independently checks the root's environment-capture implementation, and does not replace review of the reviewer's own helper or the root's actual GPU run.

## Finding and correction

The root's actual GPU trial found an active-frame body disappeared while the completed body's frame remained visible at the same camera. The previous environment-capture `finally` bound the native HDR target first, then restored the renderer's logical viewport/scissor defaults. Three renderer setters apply DPR to those defaults. They therefore overwrote the already-bound HDR target's physical rectangle, which may differ due to dynamic resolution and logical viewport offsets, cropping the subsequent native draw.

The corrected order is sound: restore logical viewport/scissor/test defaults **before** rebinding the prior HDR target, including its active face/mip. The final target bind supplies the target's own physical viewport/scissor/test state. Existing subject, local-effect and ghost visibility restore before this renderer restore; auto-clear and the capture guard retire in the same `finally`. No production source edit was made by this reviewer.

## Independent public-interface evidence

Added `tests/rend_veil_capture_state_test.js`, using the actual public `R_RendVeilSeen`, `R_RendVeilCapture`, `R_RendVeilFields` and `R_RendVeilBackgroundDepth` functions with real Three scene/mesh/geometry/binding and a recording renderer. Its logical viewport `(19,23,720,400)` at DPR 2 deliberately differs from the HDR target's physical `(0,0,640,360)` rectangle. Its recorder models renderer setters and render-target binding separately; a flat fake that stores only one viewport would miss this regression.

Both tests passed:

- Successful capture hides the existing subject/local/ghost layers during the actual public capture and restores every visibility flag, target/face/mip, logical defaults, physical target viewport/scissor/test and auto-clear.
- Injected render failure remains observable, restores those same states and allows a second capture, proving the capture guard does not remain latched.

Execution log, command and tested identities are retained in `rend-veil-background-capture-tests-2026-10-07.txt`. This is a separate 2/2 renderer-state fixture, not a rerun or enlargement claim for the previously recorded native/regression suites. The canvas context is a procedural-texture stub; no browser or GPU was launched.

## Required GPU follow-through

The root's live reload remains the pixel proof. Retain the prior failed active-frame receipt, then capture a corrected active Appearance/Unwind frame and completed/Focus frame at the same native camera and target. Include the actual bound HDR physical rectangle after environment capture, source/candidate hash, current hardware background-depth binding, body draw/seed identity, phase/progress/unwind and GL/browser errors. Compare visible body/occlusion and frame pixels; the passing recording-renderer fixture cannot prove shader compilation, nonblank output or correct GPU appearance.

No additional source defect was found in the bounded restoration correction. Owner acceptance, integration and release remain separate.
