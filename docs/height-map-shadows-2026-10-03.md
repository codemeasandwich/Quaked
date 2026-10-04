# Height-map shadows and rock-wall contrast — 2026-10-03

Owner scope: all enhanced displacement/height sources retain shadows and local
self-shadows in game and opening split demo. The later extreme contrast request
applies **only to the procedurally displaced rock walls**. It does not change
ground, ordinary walls, weapon/body lighting, demon plaques or the recessed logo.

## Implementation contracts

`r_heightshadows 1` enables per-source virtual relief visibility. The actual
selected eight point lights, sun and shoulder-offset flashlight are frozen before
the main HDR draw; the compositor consumes those same indexed sources afterward.
Auxiliary, Classic, depth and shadow-capture passes do not generate active masks.
Opening demo temporarily enables flashlight, enhanced lighting, normals, object,
point and height shadows, restoring preferences when it relinquishes ownership.
Enhanced game startup enables the same features and uses gamma .75 (the options
brightness midpoint); Classic preferences remain independent.

The fourth HDR attachment is nearest-filtered, non-color RGBA8. Ten independent
3-bit visibility values occupy thirty bits; the last two bits identify generic
height receivers (01), active rock walls (10), or invalid clears/opaque pixels
(00/11). The packed target uses zero MSAA samples: averaging packed bytes is
invalid. Original two/three-target paths retain their established samples.

Authored/generated height sources are explicitly marked; RGB-only normals do not
invent scalar depth. White is raised, black recessed. World, alias and carved
logo shaders sample their own field. Logo rays follow the same deep cavity field
as the existing parallax treatment. Physical demon displacement remains actual
geometry and uses geometric shadows, avoiding duplicate virtual displacement.
Rock rays use the existing connected component charts and deterministic paged
field, including neighboring pages; ground receives its saved gentler profile.
Adaptive 12–48 samples fixed a striped grazing-angle shadow artifact detected on
the GPU. Unavailable pages are not treated as invented occluders.

Only valid class-10 receivers get contrast ranging from .5 in locally shadowed
areas to 2 in exposed areas. The ratio weights the real point/sun/flashlight
illumination reaching that receiver after world/screen occlusion. No incident
source means factor 1. Both main and reflected receivers check normal/depth
coherence before using a background wall mask. Ground is class 01.

Transparent depth writers invalidate the background mask to FF; effects without
depth writes preserve it. Normal alpha contains view distance, not coverage, so
normal-blended transparent effects output zero to preserve the solid normal
packet. Multiplicative decals instead output one for both normal and packed mask
to preserve their destination data. Decal, portal and level-preview sky shaders
explicitly declare/write attachment 3. A live opening-demo check found the old
decal shader otherwise caused WebGL INVALID_OPERATION when drawing to MRT4.

The new 512-square spotlight depth capture follows the actual shoulder source,
not the camera center. Each live frame captures complete-world chunks plus
currently rendered physical aliases and moving brushes. It borrows current
geometry/transforms without moving or disposing the source objects; instances
apply instance then model transforms. View weapons, flames, bolts, eye sprites
and projected duplicates are excluded. Five clamped taps and a one-world-unit
bias provide geometric visibility. Flashlight receivers, reflected illumination,
bounced flashlight estimates and cone scatter reuse that capture. Local height
self-shadows remain a separate per-source factor.

## Verification and limits

Independent public-interface tests exercise source ordering, all native/custom
height-loader paths, shader producers/consumers, packed marker classes, role
attributes, midpoint defaults, Classic animation isolation, borrowed geometry and
renderer-state restoration. Independent review identified and checked the fixes
for foreground mask inheritance and unshadowed flashlight bounce.

The bounded actual-GPU spotlight fixture passed 96 checks: all four phases agree
with independent geometric rays at approximately four thousand unambiguous pixels
per phase, with zero mismatches/GL errors. Moving the source moves the world
shadow; borrowed Mesh and InstancedMesh actors add their own shadows. DPR2 target,
viewport/scissor and source geometry state are preserved.

The height GPU fixture separately checks production materials, actual MRT output,
per-source decoder, continuous shadow bands, contrast/gamma arithmetic, and
transparent foreground blending. Failed and superseded receipts are retained;
see final receipts in `docs/evidence` for current results. Controlled fixture
checks are not a broad frame-rate or all-map visual qualification.

Virtual relief changes local shading and UV sampling, not silhouettes/collision,
and does not cast displaced silhouettes onto unrelated objects. Physical demon
geometry does. Transparent color effects composited over a rock pixel share that
pixel's final contrast; they are not separated into another lighting pass. The
single-sample packed path has an edge antialiasing tradeoff. Broad sustained GPU
performance and owner acceptance of this stronger wall appearance remain to be
assessed, separately from correctness checks.

Try the ordinary one-server trial at
`http://localhost:8013/tests/rockfield_gameplay_trial.html`; relief on/off retains
native textures/geometry. The opening-demo observer is
`http://localhost:8013/tests/demo_lighting_trial.html`. Static GPU proof pages
`height_shadows_gpu_trial.html` and `flashlight_world_shadow_gpu_trial.html` start
no game or animation loop. Only one preview tab is used at a time.

Current work is local; no new commit or push is claimed. The unrelated shield
model and owner texture update are preserved. Root owns final appearance review
with the owner; no durable background follow-up job has been submitted.

## Final receipts

- `height-shadow-final-qualified-regression-2026-10-03.txt`: 61/61 across thirteen suites, including custom effect writers, Classic aliases and native decals. Diff whitespace checks pass.
- `height-shadow-final-actual-gpu-2026-10-03.txt`: 487/487 actual GPU checks, no failures/shader errors. Transparent foreground tests include the actual compositor wrapper. The earlier overlay failure is retained; its distance-as-blend-alpha problem is fixed in production.
- `flashlight-offset-actual-gpu-2026-10-03.txt`: 96/96 GPU spotlight checks.
- `demo-shadow-live-final-2026-10-03.txt`: actual opening demo, observed Enhanced and Classic scene passes, flashlight/point/height shadows all on; compositor beam/world-shadow/height-mask flags one; four attachments; GL error zero and per-draw GPU errors empty. The captured map is E1M4 after the native transition; the same fresh run passed through E1M3. Earlier decal failures are retained.
- `rock-wall-shadows-live-final-2026-10-03.txt`: ordinary E1M1 client/server with flashlight one/gamma .75, 408652 rock-wall mask pixels distinct from 494502 ordinary height pixels. Wall flashlight visibility includes fully dark, partial and fully lit bins. Eight cached point slots and the live spotlight are ready, no capture failures or GPU/page errors. This is camera-specific proof, not a claim that every surface is in the beam.
- `rock-wall-shadows-final-2026-10-03.jpg`: owner-facing rendered cliff view.
- `height-shadow-final-identity-2026-10-03.json`: tested production/test/receipt hashes and checkout HEAD. Historical receipts do not substitute for final module hashes.
