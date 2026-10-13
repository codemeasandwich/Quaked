# Wrath: detailed photographic materials with the original design

The owner requested faithful photographic replacements for the remaining official
Quake enemies, then asked for more detail in this Wrath. The selected skin adds
readable border stitching, cloth folds and fraying, worn leather edges, defined
metal links and more convincing arm/hand anatomy. It keeps the original dark
charcoal/blue-black cloth, brown leather, grey-tan skin and burgundy wounds.

## Source and fitting

ChatGPT built-in image generation first repainted the original Rogue Wrath atlas,
then edited that image for the owner's additional-detail request. The initial
`wrath-photographic.png` is retained as the edit target. The selected authoring
image is `wrath-photographic-detailed.png`,1419×1109, SHA-256
`4a190d6e0fb2d74ff5eb29188f857be028d3b1a946fe869d8b5783a4ba3660dd`.
The initial source SHA is
`2663b7a309eb38a23974bfcc3eade410eed02cd189cd3e5191ecc6904e4fc072`.
The adjacent JSON recipe records both identities and exact generation/edit prompts;
plain-text prompt copies are retained alongside it. Original PAK pixels remain
external and are not redistributed.

The ordinary Wrath model is SHA-256
`0a57ee912df3142c5e17183d5f6bd461021b141d53f7534014d59eda97e6bfa6`:
one248×194 skin,212vertices,420triangles and87poses. This is not the separate
Overlord (`s_wrath`), which remains an explicit negative identity in the tests.

The existing full-atlas fitter uses factor4, producing992×776 images,323337
covered native surface pixels and12893bounded edge pixels. This fresh fit does
not reuse the old factor6 registration box or its source-specific black-region
exceptions. Native geometry, UVs, poses and origin remain unchanged.

## Hood and eyes

The hood interior stays empty and black. No facial artwork is added inside it.
The eyes are two persistent solid meshes using12triangles and nativevertices7–16.
Their four texture regions remain separate: front[29,163,49,179] and[75,163,95,179],
with corresponding back regions offset124columns. Front regions are brighter red;
back regions remain maroon. They are not flash surfaces, optional background or
paint in the hood. They retain ordinary authored heights and no added luma map.
The Armagon flat-flash policy is deliberately absent.

## Runtime and history

Diffuse and height are lossy WebP quality92. SOURCE.json records source identity,
fit, encoded image digests and decoded receipts. Catalogue version60 selects the
WebP diffuse and refreshes cached artwork. The normal baker uses the actual decoded
maps; the new custom key is
`59c990c4605e6df2640c6dfb84ef101ef1718af8f5028bdcb0bce3c35ef65a1c`.
Native generated normals and all other enemy families remain unchanged. Superseded
custom samples are retired only after verifying they have no remaining references;
normal registry and distribution closure agree with the final manifest.

The original4x batch4 Wrath resample before/after receipts remain unchanged. An
explicit native-refit successor pins the new recipe, native/source identities and
both current map hashes, including the disclosed diffuse.png→diffuse.webp rename.
The old generation recipe points to this successor so replay cannot overwrite the
selected art with the earlier noisy version.

## Verification and trying it

The detailed variant passes7public cases, retaining87poses, exact native UVs and
identity, Overlord rejection, Classic/off, pending identity, failed image loads,
shutdown, four eye regions and the original hood-black limit. Tests also check
front/back eye contrast, nonmaximum eye height, Q92 receipts and exact decoded
custom/native prepared normal inputs. A stale unrelated-family hash was refreshed
from committed9950863c using the unchanged family/field projection.

The official-body/skin-loader integration suite passes44/44, the historical
successor contract passes26/26, and the distribution closure passes.

The actual browser trial passes102checks over105draws and all87poses. Evidence is
in `evidence/wrath/`; views18/19 compare original/detailed front with relief off,
20/21 back,22/23 and24/25 obliques, and26/27 relief off/on. The independent visual
review cleared the detailed variant's palette, material readability and mapping.
The initial candidate's earlier passing checks are not substituted for these new
results. No owner aesthetic acceptance, live-combat or physical-headset proof is
claimed.

Reproduce with `tools/texture_sheets/fit_generated_skin.py` and the adjacent
`wrath-photographic.json`, owned Rogue PAK and external original palette PAK.
Keep the catalogue diffuse filename aligned with the finisher's WebP output.
Bake with `tools/bake_normals.mjs --namespace rogue --skins --maps
'^progs/wrath\.mdl$' --variant wrath/custom`, the same owned inputs and existing
Three/canvas environment variables under Node24. Run the Wrath identity tests,
standard4x record contract and distribution-closure check.

Serve the repository with `tools/serve.py` and the owned game root, then open
`tests/rogue_skin_gpu_trial.html?model=wrath&externalGames=1`. Run the checks to view
the real model and original/custom comparisons. Evidence saving uses a separate
bounded localhost receiver; the normal project server has no write endpoint.
