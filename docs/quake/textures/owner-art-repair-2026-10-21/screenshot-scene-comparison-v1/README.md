# Actual base-wall colour comparison

Unlit CPU texture composition of the owner's actual base e1m1 wall planes. These views preserve the proven BSP face/UV layout and substitute only the three supplied **tech08_1, tech09_3 and tech10_1 colour trials**. Every other texture remains the current catalog's default diffuse, with native fallback where unavailable. No image fitting, spatial offset, height, normal or runtime asset change occurs here.

Open `wall-y2816-threeway-world-div2.png` and `wall-y2816-threeway-world-div4.png` for screenshot2's native / installed / trial comparison; the corresponding Y2112 files cover screenshot1. Every column uses the same world bounds and its own actual composition reduced with BOX to world/2 and world/4. Only the labelled display enlargement uses nearest filtering. Separate actual small files and full 4× compositions are retained.

The trial gently brings the olive field toward native colour while preserving the owner's pale louvers, metal grain and dark hardware. The control-door bottom rail still shows a positional join with the lower tech08 panel; the trial changes no spatial registration. At screenshot1's tech08 internal cut to tech11, hardware/layout differences likewise remain visible. These observations do not establish final art acceptance or prescribe an offset. The source and candidate should be reviewed at the actual mapped cuts before selecting the next smallest change.

The three strip sheets sample **actual base shared edges**: tech09 bottom to tech08; tech09 left lower side to tech10; tech08 U112 internal cut to tech11 U0. Each is cropped directly from the same full composition, with exact world endpoints, both UV vectors and crop coordinates retained. This is not a generic edge-equality or self-tiling test.

`comparison-proof.json` pins the actual base PAK/BSP identity, face vertices/vectors, catalog, decoded source files, all three root CLI receipts/candidates, renderer reuse, environment, output hashes and stable-input readback. `output-verification.json` independently reads the saved images and checks actual pixel/source UV samples, exact BOX reductions and strip crops. The independent check is source/output correctness only.

Reproduce with `/usr/bin/python3 docs/quake/textures/owner-art-repair-2026-10-21/screenshot-scene-comparison-v1/render-comparison.py` from this repository root.

This is a **composed CPU texture view**, not a perspective or lit screenshot, engine integration, hardware/GPU proof, owner acceptance, shared-master 8× qualification or release. Native and installed variants intentionally differ in detail and lighting baked into existing artwork. Root retains ownership of the repair decision and Bluey reconciliation; the earlier service storage error has not been represented as a successful mutation.
