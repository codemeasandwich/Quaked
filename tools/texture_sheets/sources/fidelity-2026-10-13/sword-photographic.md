# Phantom Swordsman: photographic steel with original design

The owner requested the remaining official-game enemies retain their original
colours and design while replacing pixelated/grainy generated surfaces with
convincing photographic materials. This enemy is the floating sword itself.

## Source and correspondence

The selected image was generated with ChatGPT built-in image generation directly
from the original Rogue sword skin decoded with the original Quake palette.
Original PAK pixels remain external and are not redistributed. Earlier attempts
that edited the previous generated atlas retained grain and stone-like cracks;
they were rejected before publication. The selected source and exact prompt are
`sword-photographic.png`, `sword-photographic.json` and
`sword-photographic-prompt.txt` in this directory.

Source SHA-256: `cd42deecc6b2c584e75d5b189a8ce39f73296b76044a1053227b95d01ad72fdc`.
Source dimensions: 1000×1573. Native model SHA-256:
`a72818767602e676cb08aa19db1780df9ee71b1f5c650f24c4f7ad2f761360d2`.
The native model has one 124×195 skin, 58 vertices, 106 triangles and 40 poses.
Its two texture halves differ at 759 native pixels. Both remain distinct.

The design retains grey steel, subdued olive-brown binding, a dull brown collar,
dark red blood concentrated toward each tip, the narrow blade and its chevrons,
angular guard, existing skull details and pointed pommel. The material treatment
uses broad steel planes, restrained wear and irregular blood smears. The grip is
a photographic interpretation of diagonal binding, simpler than the earlier
herringbone rendering. Independent visual review found no UV/material blocker.

The existing full-atlas importer fits 4× to 496×780. It covers all 55,240 native
surface pixels and extends generated colour into 7,965 bounded edge pixels.
The native UVs, geometry, origin and every animation pose remain untouched.
Landmarks checked from native UVs: tip row 2, collar 111–119, guard 127–134,
grip through 180, and pommel through 192; the second half is offset by 62 columns.

## Runtime assets

Diffuse and height are WebP quality 92, with encoded and decoded receipts in
`newer/enemies/sword/custom/SOURCE.json`. Catalogue version 58 selects
`diffuse.webp` and invalidates cached artwork. The older generated recipe links
explicitly to its successor so replay cannot overwrite the selected skin.

The normal baker consumes the actual decoded maps. New custom key:
`321c500a2577d8851b33dd24dad925e98cf85013bef1e449bbc3c5ff17d520e2`.
The native generated normal remains unchanged. The superseded custom sample is
removed only after confirming no manifest family references it; its predecessor
is retained in Git history and diagnostic custody. The normal registry and runtime
closure reflect the new sample. No special flash policy applies to this solid sword.

## Verification

Independent public tests pass 6/6. They preserve native identity, every UV triangle
and all 40 poses, exact variant binding, Classic and switch-off paths, asynchronous
identity readiness, failed loads, shutdown and exact custom/native normal inputs.
Additional assertions check the source/recipe pins, two-island fit, WebP92 payloads
and decoded receipts. A stale unrelated-family baseline was refreshed from the
committed predecessor without dropping its guarded families or fields.

The official-body/skin-loader integration suite also passes 44/44.

The actual browser renderer passes 55 checks over 58 draws and all 40 poses.
Evidence under `evidence/phantom/` contains the report, source identities, tests
and images. Views 14/15 compare native/photographic front without relief, 16/17
compare the back, 18/19 and 20/21 compare oblique views; 22/23 compare relief off/on.
Independent visual review confirms quiet metal surfaces, aligned collar/guard/
pommel and distinct blood patterns. These checks do not claim live combat,
physical-headset testing or owner aesthetic acceptance.

## Reproduce and try

Run `tools/texture_sheets/fit_generated_skin.py` with the adjacent JSON recipe,
the owned Rogue PAK and an external original palette PAK. The recipe fixes the
native identity, factor 4 and WebP92. Keep the catalogue diffuse filename aligned
with the finisher's `diffuse.webp` output before baking.

Run `tools/bake_normals.mjs` with the owned Rogue PAK, external palette PAK,
`--namespace rogue --skins --maps '^progs/sword\.mdl$' --variant sword/custom`.
Use the existing Three/canvas environment variables and Node 24. Run
`tests/sword_skin_identity_test.js` with `QUAKED_OWNED_PAK` and `QUAKED_ID1_PAK`,
then the maintained distribution-closure check.

Serve the repository with `tools/serve.py` and the owned game root. Open
`tests/rogue_skin_gpu_trial.html?model=sword&externalGames=1` and run its checks.
The normal server has no write endpoint; retained evidence uses a separate bounded
localhost receiver. Every finished enemy is committed and pushed separately.
