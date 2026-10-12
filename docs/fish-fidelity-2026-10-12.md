# Rotfish photographic material correction

Owner continuation,12October2026; Bluey T-4049c5a1. Preserve the original creature's
stylized shape, colours and artistic intention while using detailed photographic
materials. The approved first Dog and selected Ogre pair remain byte-identical.

The native source is owned `progs/fish.mdl`, SHA-256
`e6a0396ac97d981cd49b39f7af8f1f32d9f910768f7a554f59bcb5926c2a3568`:
one260×194 skin,97vertices,172triangles and66poses. It is decoded with the original
palette for imagegen reference; the rejected generated image is not the donor.
The new source is `tools/texture_sheets/sources/fidelity-2026-10-12/fish-v2.png`,
1452×1083, SHA-256
`af3e562932ebf34c8fc1be0c000c6864c694adefe5cc3ceb1307420bd0851c64`.
The adjacent recipe and `fish-prompt.txt` retain the exact built-in ChatGPT edit
instructions and source/model relationship. Original generation sources remain.

The correction replaces gilded scales and lacquer-like red tissue with muted tan
organic surfaces, darker maroon wounds, stained ivory teeth and cloudy olive eyes.
Both asymmetric body halves, rib/wound landmarks and detached fin strips remain.
The dramatic Quake anatomy is preserved rather than redesigned into a real fish
species. Fine scales and tissue fibres provide detail without painted bright rims.
Some connective tissue remains paler than the native low-resolution palette;
photographic material fidelity is not a claim of pixel-identical colour.

The existing fitter produces1560×1164, covering974,703surface pixels with3,121
pixels supplied by bounded edge extension and no missing surface. Catalogue46
changes only the cache version; the exact-model/skin binding and material settings
are unchanged. Height and the content-bound custom normal payload were rebuilt.
The native normal family and historical payloads remain unchanged. One new payload
is included in the distribution closure. Mesh, UVs, animations, AI and Classic
behavior are unchanged.

Seven independent cases retain the original native/model/material/failure checks
and add frozen protection of16 accepted Dog/Ogre files, their catalogue entries,
face metadata and custom normal families. The actual renderer passes81checks over
84draws: all66poses, four paired original/HD close-up views with relief off, normal
detail controls and Classic fallback. Prepared normals are shipped and settled.
Evidence is in `docs/evidence/fish-fidelity-2026-10-12`.
The isolated committed-source candidate passes83checks:34base/material/startup,
13selected-Ogre preservation/face checks and36whole-body coverage checks. All50
official body slots remain covered. Distribution policy and independent final
source/material/render review pass. This scoped run does not repeat the historical
Scorpion source-JPEG check whose inputs are unavailable.

Run `python3 tools/serve.py 8000`, then open
`http://127.0.0.1:8000/tests/rogue_skin_gpu_trial.html?model=fish` and Run.
Views10/11,12/13,14/15 and16/17 pair native/HD at matching camera angles without
relief; subsequent controls test height and Classic. The shared trial now treats
an absent optional keyframe match as false, avoiding accidental every-pose image
capture while retaining every actual pose check. Close-up capture is opt-in per
model; no product renderer changes were needed.

Reproduce by running `fit_generated_skin.py` with the retained recipe and id1PAK,
then `bake_normals.mjs --namespace id1 --skins --maps '^progs/fish\.mdl$'
--variant fish/custom` against that owned archive with the configured dependencies.
This is controlled asset/renderer verification, not live combat acceptance. The
historical Scorpion original-JPEG input gap is unchanged and does not affect this
increment's source, selected-skin regression checks or runtime body audit.
