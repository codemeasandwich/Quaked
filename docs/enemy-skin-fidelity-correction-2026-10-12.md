# Enemy appearance correction

## Final owner-selected Ogre pair

The owner subsequently supplied the exact dark-armour original Ogre and explicitly
approved the green multi-grenade design, with one requested change: remove the
sculpted abdominal pads. The owner also answered **Keep randomized faces** for
both versions. Those instructions supersede the provisional source and approval
status recorded in the historical proof below. No additional style approval is
needed to integrate this selected pair.

The original uses immutable `ogre-owner-base.png`, 1448×1086, SHA-256
`dd36fe10a6494e040a14c18966cc3dd8819ecc63c373c107fd084a8f867d9912`.
The multi-grenade source is `ogre-multi-no-abs.png`, 1462×1076, SHA-256
`402d263b4c3994d95bea6ef85110720de0e46abfddd88e3e6fcfdb105de1ad50`.
Both are retained under `tools/texture_sheets/sources/fidelity-2026-10-12/`, with
fitting recipes and exact imagegen prompts. The multi source is a built-in
ChatGPT edit of the owner's reattached approved green atlas; the edit replaces
the six-pack relief with continuous worn green torso armour.

Both fitted textures are 1056×776. The original was fitted against actual id1
Ogre SHA `d7e65c136645747dacb3901e61a4117bc9cdd062669d0f64fa562872d2bd0d4e`;
the alternate against Rogue SHA
`2bd7b6633d2c95627cca8b216ad2c84057e800778a94e0fa97f3a14f86420732`.
The existing full-atlas fitting path preserves native UVs and all 147 poses.
The owner's 4:3 original is registered across the full native atlas, without
cropping. Both cover 422,531 surface pixels; bounded edge extension supplies
34,212 original and 22,228 alternate pixels. No surface is left uncovered.

Catalogue 45 preserves the original `ogre/custom` row and face metadata. Its
fitted diffuse is saved as lossless WebP to retain the existing path, with decoded
pixels verified identical to the fitted PNG. The exact Rogue skin-1 binding
keeps `ogre/rogue1` and receives a deep copy of the original face metadata. Both
use all 12 existing face portraits, coordinates, alignment and colour balance.
Random identities remain stable across animation, skin selection and visual toggles.
Native height groups, mesh, gameplay and Classic appearance are unchanged.

Both custom heights and prepared normal payloads were rebuilt from their actual
new diffuse/height bytes. Two new payloads enter the existing distribution closure;
historical payloads are retained. The first published Dog's catalogue, runtime
images and generated source remain unchanged and are SHA-checked independently.

Independent verification passes 13 Ogre cases and 7 maintained face cases. The
actual original renderer passes 163 checks over 147 poses; Rogue passes 317 over
294 skin/pose pairs. These include closer draws with face seeds 0, 5 and 11,
verifying different portraits change actual rendered pixels. Both use shipped
normals, without preparation fallback or shader errors. Evidence is in
`docs/evidence/ogre-selected-pair-2026-10-12`.
An initial new base-trial configuration captured every pose because an omitted
keyframe array invoked the draw default. The bounded receiver refused the oversized
capture. An explicit empty array corrected the new configuration; the complete
renderer run was repeated with bounded saved screenshots. Product behavior was
not altered to satisfy the collector.

The isolated candidate passes 232 of 233 broader maintained checks after input
recovery: base/face 45, Rogue 124, Hipnotic 27 of 28, and body audit 36. The sole
unavailable historical provenance case requires the two original Scorpion JPEGs
(`aa0f86eb-168c-4ed4-b4c4-df318d5b0ed6.jpeg` and
`4d36fc39-968f-460d-934d-6690cc5f663c.jpeg`). Those untracked files were removed
from the shared workspace after the previous campaign verification; no retained
copy was found in the scoped workspace, temporary files or Codex files. The four
Scorpion native/render/material/normal cases pass. This limitation is retained as
a failed input-dependent case, not suppressed or described as a fully green suite.
The selected Ogre/face checks and all 50 runtime body-asset slots pass independently.
Other removed, tracked reference images were read from committed HEAD only into
the isolated check directory; workspace deletions were preserved. The initial
isolated archive also omitted the committed face-landmark JSON; restoring that
test input resolved its import failure without changing product or test code.
Distribution policy passes with both new normal payloads included.
The missing-source recovery obligation remains with root: locate an authorized
retained copy or obtain the two originals from the owner, then rerun the unchanged
Scorpion provenance case. This does not permit reversing workspace deletions.
The [catalogue-44 Ogre report](rogue-ogre-skin-2026-10-12.md) records the earlier
rejected variant and is superseded by this selected-pair record for current Ogre
appearance; its historical evidence remains intact.

Try `tests/rogue_skin_gpu_trial.html?model=ogre_base` or `?model=ogre_rogue`
through `python3 tools/serve.py 8000`. These are controlled actual-model trials,
not a claim of live combat acceptance. Source selection is owner-approved;
whole-campaign appearance is not. Other generated enemies remain in the corrective
work scope, while Dog and this selected Ogre direction are settled.

Remaining corrections remain root-owned in this ledger. The shared followup
service's current v1.7 executable profile disables native tools/MCP and permits
only one existing UTF-8 file for file tasks; it cannot generate raster images,
render models or perform the required multi-file asset integration. No unsupported
background image-generation job is claimed queued or running. Continue these
corrections in the imagegen-capable chat, preserving per-enemy review/publication.

To reproduce, run each retained recipe with `fit_generated_skin.py` against its
recorded PAK into a temporary output directory. Save the base fitted PNG to
`ogre/custom/diffuse.webp` with lossless WebP and copy its height/provenance;
copy the alternate PNG/height/provenance to `ogre/rogue1`. Bake each `--variant`
in a separate `bake_normals.mjs` invocation: the CLI accepts one variant at a time.

## Historical provisional proof — superseded by the selection above

The owner rejected the generated campaign's appearance, then explicitly accepted
the first published Dog. Keep `dog/custom` unchanged. The unused Dog experiment
is not in the runtime catalogue; its generated source remains retained and its
fitted output is archived at `/private/tmp/quaked-fidelity/unused-dog-fitted`.
Bluey T-c2f3b3fb tracks this correction; previous delivery tests do not imply
visual acceptance. The remaining generated enemies still require visual review
and correction against original shape, colour and design.

## Multi-grenade Ogre direction

The owner specified an oversized human, derived from the existing owner-created
HD base-game Ogre. The edit target is `newer/enemies/ogre/custom/diffuse.webp`,
1056×776, SHA-256
`af5290302ed3251cbabd0641c8a00dfdb437a0078583c078516b541720c7c933`.
The older `diffuse copy.webp` is not the selected source. Original Rogue skin 0
and skin 1 were decoded from the owned MDL as variant-difference references.

Native comparison finds 9,588 changed palette pixels, 9,285 on actual UV surfaces.
Both top chainsaw regions are unchanged. The variant differences are predominantly
olive clothing, studs, straps/belt and arm/wrist accents, plus small lower-weapon
markings; they do not warrant new anatomy. The owner HD base provides the face,
human build, skin materials, wounds and equipment construction.

Built-in ChatGPT imagegen edited the owner HD atlas. Its first derivative invented
circular holes on the saw housings and was rejected. A targeted second edit removed
those additions. Both attempts and exact prompts are retained under
`tools/texture_sheets/sources/fidelity-2026-10-12/ogre-*`.
The candidate is a derivative, not a claim of byte-identical unchanged regions.
It uses the existing native fitter at factor 4, producing a 1056×776 atlas with
422,531 covered surface pixels and 25,544 supplied by bounded edge extension.
Candidate files live at `newer/enemies/ogre/photoreal_proof/`.

## Reviewable model comparison

Run `python3 tools/serve.py 8000`, then open
`http://127.0.0.1:8000/tests/rogue_skin_gpu_trial.html?model=ogre_rogue&fidelityProof=1`
and click **Compare Ogre skins**. Only that query enables the proof. The runtime
catalogue on disk remains unchanged; the fixture clones it locally and selects
the proposed slot-1 atlas. It also copies the base Ogre's existing face metadata
and fixes the same face seed across base/proposed samples.

The proof shows original Rogue, owner HD base, published variant and proposed
variant on the actual Rogue model under matching cameras, pose and lighting.
Pigment comparisons have relief off; the final two images compare proposed relief
off/on. Candidate normals may derive during this preview: it is not a prepared
normal delivery claim. Existing low-poly mesh/UV stretch remains visible in both
the base and candidate; no geometry or gameplay was modified.

The real renderer completed **33/33 checks and 18 renders**. Evidence is under
`docs/evidence/ogre-fidelity-2026-10-12`; views 9/11 compare base/proposed full body,
13/15 compare their shared face, and 16/17 compare relief. Source hashes prove
the accepted Dog, base Ogre and production catalogue are unchanged.

At this historical point the owner had not accepted the preview. The subsequent
selection above replaces that waiting state. Superseded fitted files are retained
at `/private/tmp/quaked-fidelity/superseded-ogre-proof`, outside runtime. No
unattended generation is running.
