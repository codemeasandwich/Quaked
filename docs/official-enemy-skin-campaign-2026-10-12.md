# Official-game enemy skin completion

Owner authority (12 October 2026): systematically generate missing HD skins and/or
normal maps with ChatGPT image generation, directly from original files; preserve
the original colour scheme and design; commit and push each completed enemy to
origin separately. Scope explicitly confirmed: **Quake and its two official
mission packs**, excluding third-party mods. Bluey campaign T-bb7e6282.

Prior supplied-art increment is committed and verified at origin/Dev:
`4cba49b6b5c19660cedcaf5d29fb5cb6b8bd108e` (Centroid, Dragon, Overlord, Mummy).
Concurrent cloak/water changes and owner file deletions remain outside this lane.

## Inventory and order

Independent read-only planning inspected actual `progs.dat` spawn/setmodel calls,
map entity lumps, MDL identities/skin slots, skin catalogue and normal manifests.
Initial body inventory: 26 monster spawn classes, 29 model basenames, 34 distinct
MDL identities, 50 model/skin slots. Twenty slots already select HD art; thirty
need art or carefully scoped reuse. Ten native model identities lack prepared
normal coverage. These are initial inventory counts, not delivery totals.

| Increment | Model / missing slots at intake | Initial normal coverage | Status |
| --- | --- | --- | --- |
| Dog | `dog:0` | Stored native height + bake | Committed/pushed `5fccab35`, remote verified; T-cd37aeb2 Done |
| Rotfish | `fish:0` | Native generated bake; no authored height | Committed/pushed `aa33d6d4`, remote verified; T-74803f43 Done |
| Gremlin | `grem:0` | Missing classification, height and bake | Committed/pushed `ba2fdf4d`, remote verified; T-3f8f9b0a Done |
| Armagon | `armabody:0`, `armalegs:0` | Both missing | Committed/pushed `eaca8f0c`, remote verified; T-b9e82259 Done |
| Electric Eel | `eel2:0–5` | Missing | Committed/pushed `ba2b8779`, remote verified; T-89884f7b Done |
| Phantom Swordsman | `sword:0` | Missing | Committed/pushed `d8c0b53e`, remote verified; T-98629a4a Done |
| Wrath | `wrath:0` | Missing | Committed/pushed `0cf13349`, remote verified; T-d0114751 Done |
| Lava Man | `lavaman:0` | Missing | Committed/pushed `e0febc2f`, remote verified; T-51cf2d18 Done |
| Aztec Guardian | `morph_az:0–2` | Missing | All3states fitted;10 independent and446 GPU checks pass; isolated checks/review before commit, T-e8decd62 |
| Egyptian Guardian | `morph_eg:0–2` | Missing | Pending |
| Greek Guardian | `morph_gr:0–2` | Missing | Pending |
| Rogue Death Knight | `hknight:0–1` | Native bake exists | Skin0 has identical pixels/UVs to base; reuse existing HD art with reviewed identity binding |
| Rogue Spawn | `tarbaby:0–2` | Native bake exists | Skin0 likewise reusable; other skins need original-reference art |
| Rogue Knight statue | `knight:1` | Existing height fallback uses skin0 | Pending; author correct slot height |
| Rogue Ogre variant | `ogre:1` | Existing height fallback uses skin0 | Pending; author correct slot height |

Guardian skin changes accompany awakening/death. Their three skin2 images are
identical and should share source work where safe; do not invent independent
designs for animation states. Reuse is conditional on actual source identity,
not matching filenames, dimensions or convenient colours.

Dog native identity: `c84104192b336b5360033a4efcc7e033fce4589d1af6c3c895101a9c6d6932b6`,
one312×169 skin,236vertices,426triangles,86poses, inherited unchanged by both packs.
Rotfish: `e6a0396ac97d981cd49b39f7af8f1f32d9f910768f7a554f59bcb5926c2a3568`,
one260×194 skin,97vertices,172triangles,66poses.

## Additional inventory, scope awaiting owner preference

The owner was asked separately whether to include heads/gibs and Spike Mines.
Living body work continues without assuming an answer. Actual death calls identify
17 head-model identities/20 slots. Existing HD heads: `h_demon`, `h_dog`, `h_shams`.
Missing base heads: `h_ogre`, `h_knight`, `h_guard`, `h_wizard`, `h_zombie`,
`h_hellkn`, `h_shal`, **`h_mega`** (actual Enforcer head). Hipnotic adds `h_grem`
and `h_scourg`; Rogue has two-skin head overrides and uses **`eelgib.mdl`**, not
the merely present `eelhead.mdl`. `h_mega`, `h_grem`, `h_scourg`, `eelgib` also
lack enemy classification/normal coverage. Shared gib1–3 and pack-specific
statue/Wrath/Dragon/Overlord gibs need separate accounting; `zom_gib` has HD art.

Actual Hipnotic mine: `trap_spike_mine` → `spikmine.mdl`,29map placements,
256×195 skin,9poses, no HD/normal coverage. The unused `monster_spikemine` function
references inherited `demon.mdl` and has no placements. Do not use that misleading
function name to choose generation inputs.

## Per-enemy delivery contract

1. Re-read actual model/skin identities and existing variants. Preserve original
   bytes and all concurrent work. Generate only genuinely missing artwork.
2. Decode the native atlas as the explicit ChatGPT imagegen reference. Retain
   generated source, exact prompt, input/output hashes and model/skin relationships.
3. Reuse the existing native-layout or registered fitting path; inspect source
   silhouettes and real UV coverage. Preserve colour, design, animation slots,
   Classic fallback, mesh and gameplay. Reject an attractive but incorrectly fitted
   result. Generate matching height and content-bound prepared normals.
4. Independent planning/public-interface tests/review; actual renderer pose and
   original/custom/normal/Classic controls; saved views with honest visual limits.
5. Commit only this completed enemy plus its necessary tests/docs/manifest changes,
   push origin/Dev normally, and verify the remote SHA before starting the next.
   Push authorization does not imply owner aesthetic acceptance or release.

The parent chat owns execution; supervised helpers are not durable handoffs.
No unattended worker is claimed. If the campaign must transfer beyond this session,
use the shared followup service contract and record its acknowledged owner/job ID
and verified durable state here before retiring.
