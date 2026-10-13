# Armagon: menacing photographic boss at 4x

The owner explicitly authorized greater visual freedom for this boss, citing the
transformation of their enhanced Shambler. Armagon now has a dark, tooth-filled
facial focal point, heavy wounded flesh fused into its cannons, and weighty
mechanical legs. Pale hide, dark earthy machinery, burgundy wounds, red vents and
orange-yellow flashes preserve its recognizable palette and equipment.

## Art and fitting

ChatGPT built-in image generation edited the prior fitted Armagon atlas, using
`shambler-2026-10-01.png` as the owner's creative and material reference. The exact
prompts, input identities and refinements are retained in `armabody-menace.json`
and `armalegs-menace.json`, alongside source images and prompt files. No manual
art painting or native pigment substitution was used.

The actual model revealed that the breathing grille is a chest port, not its head.
The first candidate's chest fang ring was rejected. A subsequent face was rejected
because its orientation made the mouth point upward. Candidate 4 concentrates the
mouth in the real head region with the face turned to match the sideways atlas.
Both eyes lie toward smaller source X than the mouth. These rejected candidates
are retained as provenance, not qualified runtime artwork.

Selected body: `armabody-menace-candidate4.png`, 1324×1188, SHA-256
`91499ce3e20514d30d1ce97c33e43b8a5a987d7ffb8299d5136a212b0fd234d2`.
Selected legs: `armalegs-menace-candidate1.png`, 1359×1157, SHA-256
`9a4e224081f44e31a916dca7f3d1c83df0fe2f0a10831aef7158f00f42ff33d4`.

The existing full-atlas importer fits factor 4: body 864×776 covers 393,303
surface pixels and 2,725 bounded edge pixels; legs 912×776 covers 370,909 surface
pixels and 10,543 bounded edge pixels. No native UV, geometry, animation or origin
changes are introduced. All 98 paired poses and body-only yaw behavior remain.
Catalogue version 57 invalidates prior artwork caches.

Native model hashes:
- Body: `e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151`
- Legs: `b33a8f7e4cd3fca9b8c9427d8002a5470da44ce919648e1a0045f3f131f73deb`

The approved Dog, Ogre pair, Gremlin and Eel are outside this change. Earlier
photographic art is retained under fidelity-2026-10-12; its recipes point to these
successors so replaying an old recipe cannot overwrite the selected boss.

## WebP92 heights and normals

Body diffuse/height and legs diffuse/height are lossy WebP quality92. Native-sized
body height uses the same codec. Original image-generation sources are unchanged.
SOURCE.json retains pre-encode master hashes, encoded file hashes, Pillow-decoded
RGBA hashes and explicitly named Pillow effective Float32 scalar hashes.
The native pre-encode height master remains
`f7b42e940ffb27bb2d6b508d67feb5c1c261df9eb9619a3bc554b94053f2fc70`;
the shipped encoded native height is now
`bf94f2c29cbac087e45e4118dec1aeadd452c72e58141e96c434db93b9e24ea1`.

Compression slightly alters the required flat gutter around non-solid flashes.
A broad brightness threshold is unsafe because ordinary body texels also reach255.
Instead, the existing native-UV flash authoring emits exact sorted row spans for
vertices192..203 and its already-reviewed gutter:6pixels native,7pixels at4x.
The span footprint cannot overlap any other body UV surface. No wider gutter is
introduced. The raw lossy pixels are preserved as encoded; their semantic height
is reconstructed after decoding.

The single pure `EnemyHeightScalars` helper is used by runtime skin preparation and
`bake_normals.mjs`. Only the exact Armagon body identity and the explicit
`armagon-flash-v1` descriptor may enable spans. It validates every span before
applying any, restores those heights to1.0, and leaves all other Float32 values
exactly equal to decoded red/255. The existing complete scalar input hash selects
the correct normal cache; `.nm.gz` format remains unchanged. Prepared flash normals
remain exactly RGBA128/128/255/255, including maximum height to bypass false
height-shadow receivers.

Malformed policy discards that optional stored-height input, retains a usable body
with generated relief, and exposes a height-policy error in readiness diagnostics.
Pending, wrong or revoked native identity cannot retain the policy. Revocation
clears the descriptor/error and old authored height through the existing lifecycle.
Ordinary enemies, Eel, Armagon legs and legacy maps have no flat policy and keep
the previous decoded-height behavior.

Prepared keys:
- Body custom:5bf4e70eb0a91e14f5d2c1664a7eebfc03e0234c0763f54e192c69871d2cca24
- Legs custom:8f75b08c10cef1cc4028d7f69855ab50bad8544267e49741cbed0c3847636bd6
- Body native authored:55b431de28f338d3c7c37e109c7eec77226868af2ba75b8ab53c4990985c8887

Only these three input variants change for the codec integration. Native-generated
fallbacks and all other enemy normal families remain unchanged. Unreferenced
predecessor samples are retired with source/history and diagnostic copies retained.
Catalogue57 refreshes both images and metadata.

## Verification and trying it

The selected menace-art proof is under `evidence/armagon-menace/`. The earlier
Q92 proof under `evidence/armagon-q92/` qualifies the previous artwork and codec
integration; photographic/lossless proof remains under `evidence/armagon/`.
Do not treat either historical art run as acceptance of the selected design.
Independent checks pass23/23:20 Armagon cases and3 pure-helper cases. They include
all98pairedposes, native identities, malformed-policy fallback/revocation, exact
outside-span values, independent16-triangle flash rasterization with6pixel margin,
Q92 master/encoded/decoded/effective receipts and actual runtime normals equal to
the shipped samples. The helper rejects21 malformed-policy variants.

Final-art integrated checks pass59/59 (official body coverage36, ordinary skin contracts8,
Eel15); Q92 finishing6/6 and distribution closure pass. Final integrated evidence is
recorded separately for the selected candidate. The paired actual-browser
trial passes116 checks over119draws and all98pose pairs, with4active shipped normal
sets, no generated fallback and no runtime errors. Independent code review cleared the Q92 implementation. Fresh visual review
cleared the selected face orientation, mouth/chest separation, mechanical pairing
and back anatomy. Armagon is deliberately redder and more sinewy than Shambler. These controlled trials do
not claim live boss-combat, physical-headset or owner aesthetic acceptance.

Views22/23 compare native/enhanced front,24/25 back,26/27 oblique,28/29 opposite;
19..21 show assembly/yaw and5..12 firing. Source identities pin the tested assets.

Reproduce the pinned armabody-menace.json and armalegs-menace.json recipes
with `tools/texture_sheets/fit_generated_skin.py`, the owned Hipnotic pack and the
external Quake palette pack. Recipes specify factor4 and WebP92. The body fit emits
its custom/native flat-policy descriptors; the catalogue must retain those exact
source descriptors. Bake each custom variant with `tools/bake_normals.mjs`,
`--namespace hipnotic --skins --maps '^progs/armabody\.mdl$' --variant armabody/custom`
(or armalegs), plus the owned pack and external shareware palette pack. Configure
the installed Three and canvas dependencies through their existing environment
variables. The baker checks authored native model identity before applying policy.

Serve with `python3 tools/serve.py 8804 --game-root /Users/bri/quaked`; open
`tests/rogue_skin_gpu_trial.html?model=armagon&externalGames=1` and run the checks.
For gameplay, select Scourge of Armagon and Armagon's Lair (`hipend`) from the
level selector. That live encounter is the owner acceptance check; the controlled
model trial above does not claim it has been played through.

Optional evidence saving needs a separate bounded localhost test receiver; the
normal project server deliberately offers no write endpoint.

## Historical 4x record successor

Historical before/after resample receipts and the Scorpion record remain unchanged.
The explicit native-refit successor pins source/model/recipe and both current maps;
`diffuseFile: diffuse.webp` records the filename change. Its26maintained checks
verify actual lossy VP8 bytes/dimensions, recipe and SOURCE Q92 intent, catalogue
mapping and exact image hashes/byte lengths, with negative cases for missing,
undisclosed, mismatched or unsafe renames. Non-successor records retain their
original strict checks. Earlier failed-gate evidence remains preserved.
