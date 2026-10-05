# Models, held weapons, blood and water — local working trial

Date: 2026-10-04. Workspace: `/Users/bri/SOURCE/Quaked`, based on `038fe593277e771a104a5412c611aedaadb6a206`. These changes are uncommitted. Owner visual acceptance and release remain separate from the verification below.

## Behavior and architecture

Newer Game's normal, non-XR HDR renderer now gives physical aliases—including enemies, power-ups, pickups, weapon pickups, the local player when drawn, and the held weapon—material-colored point, explosion, flashlight and directional lighting. Their posed geometry participates in the selected sources' shadow captures. Intentional flame/glow effects remain emissive. Classic rendering keeps its original lighting and depth sorting.

The held gun's compressed display depth is unsuitable for world-space lighting. `r_newerskins.js` writes its actual view depth and interpolated normal into a distinguished receiver packet; `gl_post.js` reconstructs the physical position from that packet. Thus an off-screen blocker can shadow the gun, and its own posed barrel can cast a shadow on its visible surfaces. Viewmodel depth compression applies only to the main camera; borrowed shadow meshes do not invoke its callbacks. Native fallback and player-colormap alias materials use the same receiver contract. Enhanced aliases no longer receive an additional unshadowed CPU dynamic-light contribution.

Receiver data is unmultisampled even when the presentation uses antialiasing: averaging depth, normal and material class with background corrupts these packets. Physical aliases authored with transparency receive an unblended data-only repair pass. This pass preserves color attachment zero byte-for-byte, retains authored color coverage, and restores the renderer's target, draw buffers and depth range. Map teardown releases borrowed geometry references and material disposal listeners. It does not rewrite model geometry, UVs or texture assets.

`r_pointshadows.js` borrows current world matrices and posed meshes for BSP, physical actors and moving brushes. Live casters/transient sources refresh the selected cubes every frame; static-only captures retain the prior one-cube budget. Failed or stale captures are invalidated. A focused 512² directional capture resolves nearby model detail that the broad world sun map cannot. Point cubes and focused sun share one 768×1536 atlas to stay within the fragment-sampler limit. The original world lighting arithmetic is retained; valid physical visibility replaces the screen-space fallback for captured sources.

## Blood and drying contract

`r_weapon_surface.js` owns a separate local player/weapon coating, independent of lens drops. Real damage blood bytes and native color-73 blood events feed it. Nearby blood events use a 72-unit reach, BSP/moving-brush line of sight, and an event-time ray against the current visible gun to place the primary stain at its actual UV contact. Current alias bounds are recomputed for that ray because animation can mutate vertex positions in place. Detached or hidden guns are never used as contact geometry. This is bounded event-based deposition, not a per-particle fluid simulation.

Twelve shader splats tint the material before lighting. They never fade with age; once full, further blood enlarges/intensifies existing marks rather than erasing old ones. The coating follows the local player across weapon switches, death/respawn and map travel. The first-person body remains hidden under the engine's usual rules; the same coating is available when that body is rendered. World pickup materials do not inherit it. Demo playback uses isolated state.

Only actual BSP water at the eye (`contents == -3`) washes blood. Slime/lava, lens clearing, time and map resets do not wash it. Leaving water sets a thin film that dries over four game seconds, with pause and clock-rebase handling. Its specular shine uses actual source direction and the same shadow visibility; a dark gun does not glow merely because it is wet.

Save/load retains this state in a typed, bounded `// weapon-surface ` sidecar using the existing version-5 save format. Invalid data is rejected atomically. Older saves without the sidecar retain the current coating; every successful load rebases its clock to the restored server time so it cannot accidentally age the film.

## How to try it

Run the ordinary local game and select **Newer Game**. Enter a dark area, approach a light, fire near a wall, acquire blood, switch weapons, then swim underwater and emerge. Existing options still control the corresponding lighting/shadow effects.

For reproducible inspection, open `tests/model_surface_gameplay_trial.html`. It loads real E1M1 through the public Newer Level Select, gives weapons for inspection, and exposes **Outdoor light**, **Nearby blood spray**, **Submerge in real water**, **Leave water**, **Switch weapon**, and save/load controls. Placement is checked against the native player hull and water against the real BSP. The trial clears only lens drops after spray to keep the gun inspectable. It uses god/notarget and a frozen inspection position, so it is a trial rather than ordinary gameplay.

`tests/model_lighting_gpu_trial.html` provides a bounded, no-animation renderer check with native MDL geometry and independent ray/coverage oracles. **Run checks** renders its comparison gallery and receipt.

## Verification and evidence

Independent planning, public-interface tests and source review were supplied by the existing `surface_plan` and `surface_public_tests` agents. Findings were repaired before final checks; no unresolved concrete source defect remained in their final review.

- Maintained renderer gate: **68/68** across 13 files. Receipt: [final renderer checks](evidence/model-lighting-renderer-final-2026-10-04.txt). Its [144-file hash map](evidence/model-lighting-renderer-final-2026-10-04.sha256.json) was rechecked after the final browser run, with zero changed paths.
- Final native contact/save/water and shadow-atlas gate: **14/14** (5 native integration plus 9 atlas cases), with [receipt](evidence/model-surface-native-final-2026-10-04.txt) and [hashes](evidence/model-surface-native-final-2026-10-04.sha256). This includes real transformed UV contact, mutated pose bounds, hidden/detached safety, BSP occlusion, save/load, legacy clocks, water and map transitions.
- Earlier **33/33** native/respawn/menu/atlas/spot compatibility gate is retained as [constituent evidence](evidence/model-surface-native-compatibility-2026-10-04.txt). It overlaps the final gates; counts must not be added as unique coverage.
- Final frozen-source GPU run: **27/27**, 32 bounded primary/oracle draws plus actual shadow/compositor passes. [Receipt](evidence/model-lighting-gpu-final-2026-10-04.json), [gallery](evidence/model-lighting-gpu-gallery-final-2026-10-04.jpg). Actual position error was at most 0.01764 units, depth error 0.01563, normal error 0.000934. Independent rays confirmed 115 lit and 36 self-shadowed witnesses. Moving actor and off-screen world blockers changed point/sun visibility correctly. The native pickup's pre-exposure radiance doubled exactly with source strength. Transparent repair changed zero color0 bytes. Blood survived 10,000 seconds without pixel change; water restored native pigment exactly; wet reflection changed pixels and natural drying restored the exact dry image. GL/program errors were zero and original vertex/UV data remained unchanged.
- Real E1M1 browser: [blood](evidence/model-surface-native-blood-2026-10-04.json), [water](evidence/model-surface-native-water-2026-10-04.json), [emergence](evidence/model-surface-native-emerged-2026-10-04.json). Eye contents changed from air −1 to water −3 to air −1; blood went from 0.47619 to zero, and emergence film was 0.89190 when observed. The [later report](evidence/model-surface-native-measured-2026-10-04.json) confirms complete drying. Assets settled with no failures and GL error was zero. A Chromium pointer-lock/input `UnknownError` was retained in the native report; this is not a zero-runtime-error claim.

At the unchanged preview render size of **2560×1440**, 39 measured frame intervals per state averaged **38.89 ms** with `r_pointshadows 0` and **46.58 ms** with it enabled, a **7.69 ms** difference. The enabled snapshot had eight selected sources and 38 physical casters. This is a short local-browser measurement, not a hardware-independent frame-rate or whole-game performance guarantee.

The first failures are retained, not relabeled as passes: a seventeenth shader sampler, multisampled data packets, nonzero default Vector4 opacity, missing `cls` import, legacy save-clock aging, and stale animated ray bounds. The source repairs reduced samplers, made packets unmultisampled, initialized all splats to zero, corrected the import/rebase, and recomputed event-time bounds. Tests were corrected where their old contract was stale or the oracle was wrong: sRGB coverage conversion, native dark-pigment brightness floors, actual reflection angle, and fixed public startup VM boundaries. Initial renderer and native failure receipts accompany the final receipts.

Four donor conversion-parity checks cannot run because `supernailgun.zip`, `rocketlauncher.zip`, `thuderbolt.zip` and `supershotgun.zip` are absent. [Exact unavailable cases](evidence/model-lighting-unavailable-donors-2026-10-04.json). Those tests were not weakened or counted as passes. Weapon assets were not modified. Owner texture work, removed rockfield donor HTML files and other concurrent files remain preserved.

## Limits and continuation rules

This is raster shadowing with bounded resources: at most eight selected point sources, 128² per cube face, a 512² flashlight map and a focused 192-unit-wide near-sun area. Live selected point sources can require 48 cube-face draws per frame plus the focused sun pass. Geometry outside the current submitted actor set is not invented. Glass uses the existing single-layer transparency approximation, not full refracted scene lighting. Normal Newer HDR rendering is qualified here; the existing non-HDR XR path is not.

Keep source-driven lighting, true held depth, callback-free captures, receiver attachment isolation, original texture/geometry identity, and water-only blood cleanup together. Do not reintroduce a minimum bright gun, double-count CPU dynamic lights, use averaged metadata, clear player blood on respawn, or silently refill/restore anything from earlier respawn work. Further performance work must preserve current moving-occluder correctness and have separate evidence.

Local code and receipts are reviewable and ready for owner acceptance. No commit, push or published deployment was performed for this change.
