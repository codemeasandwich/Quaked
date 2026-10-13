# Electric Eel: one photographic body and procedural electricity

The owner replaced the proposed charge overlays with one shared creature skin and
animated electricity, reusing the lightning gun effect. This increment follows that
specific direction. It does not change attack logic, damage, charge timing, native
skin indices, geometry, UVs or any of the 21 native poses.

## Artwork and runtime assets

The original Rogue Eel atlas controls its olive/taupe and pale tan palette, thin
green lattice, yellow organ nodes, narrow head and detached mouth pieces. The
owner's enhanced Dragon atlas supplies organic material quality only. The selected
ChatGPT image-generation master is `eel-character.png`, 1049×1499, SHA-256
`19717bf4c1ff816de5a0ad3671d025b018fa658a0d6581289b06059ddae138d1`.
The initial master and both prompts are retained. Material refinement quiets the
repeating highlights; dark node centres remain consistent with the native design.

The existing native-UV fitter produces a 544×776 atlas (4×136×194), covering
212,176 surface pixels and 7,136 edge pixels. The optional, explicit
`runtimeEncoding: {format: webp, quality: 92}` finishing step stores diffuse and
height as lossy WebP92; original authoring masters remain unchanged. Legacy recipes
without that option keep their existing behavior. SOURCE.json records both encoded
bytes and Pillow decoded-pixel identities. It is not a transactional multi-file
writer: interrupted fitting must be rerun before publication.

All six explicit skin selectors in the catalogue use `eel2/custom`, so the existing
directory cache loads one image pair and reuses one material. Custom states 1–5 no
longer have separate images, heights or normal groups. Old image-generation masters
remain in the source catalogue, with their recipes marked superseded. Retired
runtime bytes remain recoverable through Git history.

Prepared normals are rebuilt from the actual decoded WebP92 images, including the
native-sized authored height. Binary `.nm.gz` cache encoding remains unchanged.
The one custom normal key is
`677252a6793dae24bca1d93fdc3b08a93b5dddd7a7e6a020677eb811fb3c2371`.
Native fallback still has six native colour states and their exact derived samples;
only its authored height inputs change with the requested codec.

## Rendering contract

`r_eelcharge.js` resolves 30 native electrode pixel centres against the loaded alias
UV triangles, then samples their barycentric positions and normals from the actual
posed/interpolated mesh each draw. Topology is cached; posed positions are not.
The effect is a child of that mesh and inherits its entity and level-view transforms.

Native skin 0 draws no electricity. States 1–2 build small node coronas; states 3–5
add connecting arcs and stronger branches. The native skin remains the sole charge
state. Pain/death/reset behavior follows the existing game's skin changes. There
is no new attack clock, gameplay random source, light allocation or skin animation.

The effect reuses the gun's material construction, noise texture, deterministic
path and ribbon writer. Its material, geometry, clock and cursors are independent.
Physical paths are built before Three uploads attributes. Camera-facing width is
expanded in the vertex shader for each actual draw camera. `onBeforeRender` changes
only uniforms, avoiding a one-frame-late vertex upload. The maximum is 1,920 vertices
within a fixed 2,048-vertex allocation per visible charging Eel.

Rendering is additive with depth testing and no depth writes; auxiliary MRT outputs
are zero. Existing body/world depth occludes the electricity. This is emissive
ribbon geometry, not a charge image, stencil or full replacement body texture.

## Identity, fallback and cleanup

Only `progs/eel2.mdl` with verified SHA-256
`58b9c4a4af9953f8c024158ba8a7cebd33e19834440c09026fd5931cb6b831a7`
and the actually bound shared HD material may draw the effect. Pending/wrong model
identity, failed images, native fallback, custom skins disabled, malformed topology
and material substitution suppress it. Classic retains native skin rendering.

Main-scene Begin/Seen/End releases unseen owners. Mesh replacement, entity deletion,
map reset and level-view/ghost disposal release owned geometry. Clearing the Eel
material never disposes the shared lightning noise or native model resources.
Cosmetic errors leave the body usable and are exposed by R_EelChargeStatus().

## Verification and trying it

Independent Eel identity/decoded-asset tests pass 15/15, procedural-effect tests
10/10, unchanged gun tests 5/5, and WebP92 finishing tests 6/6. The official body
coverage audit passes 36/36 across all 50 original skin slots. One combined command
omitted the identity suite's required owned-PAK environment variable: its retained
54/66 log is a failed invocation, not a pass. The corrected identity-only run is
15/15; no assertions were weakened. Runtime normal closure policy passes.

Actual browser GPU evidence in `evidence/eel/gpu.json` passes 157 checks over 289
draws: 126 pose/state comparisons against effect-off controls, first changed
pose/camera draw versus stable repeat, nonempty, error-free opaque MRT preservation, wall and real-body
depth with positive controls, two independent entities, a transformed Group, two
separate cameras, immediate state/mode guards and disposal. Seven active normal
inputs load shipped; no shader or runtime errors. These are controlled rendering
trials, not headset qualification, live combat-AI acceptance or owner aesthetic
acceptance. PNG views 0–5 show charge progression; 9/10 show body depth controls;
13 shows two independently charged Eels. Source identities pin the exact tested
implementation and assets. Final packaging is checked by the required staged gate.

Serve the repository with `python3 tools/serve.py 8799 --game-root /Users/bri/quaked`
and open `tests/eel_charge_gpu_trial.html?externalGames=1`, then click Run Eel GPU
checks. The trial reads owned game data locally; it does not redistribute native
PAK pixels. Optional `saveEvidence=1` requires a separate localhost test-only POST
receiver at `/__qa__/eel-charge`; the normal server deliberately has no write route.

Reproduce the fit using `/usr/bin/python3 tools/texture_sheets/fit_generated_skin.py
 tools/texture_sheets/sources/fidelity-2026-10-13/eel-character.json --pack
 '/Users/bri/quaked/Dissolution of Eternity/pak0.pak' --palette-pack
 '/Users/bri/quaked/Quake/pak0.pak'` as a single command. Bake with the existing
`tools/bake_normals.mjs --namespace rogue --skins --maps '^progs/eel2\.mdl$'
 --variant eel2/custom`, the same Rogue pack and external shareware palette pack.
Set QUAKED_THREE_MODULE and QUAKED_CANVAS_MODULE to installed dependency paths.
For Eel identity tests also set QUAKED_OWNED_PAK to Rogue and QUAKED_ID1_PAK to Quake.
