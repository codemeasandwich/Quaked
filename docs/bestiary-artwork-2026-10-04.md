Later increment: [Contents and 47-page completion](bestiary-contents-2026-10-04.md) adds the Contents spread and conditional Complete Edition inner artwork. This document retains the earlier artwork verification.

# Bestiarium cover, opening page and additional folios

2026-10-04 local increment, based on `038fe593277e771a104a5412c611aedaadb6a206`. Uncommitted; owner appearance acceptance and release remain separate.

The nine new owner PNGs are copied unchanged into `newer/bestiary/`: `cover.png`, `frontispiece.png`, `spawn.png`, `chthon.png`, `shub.png`, `centroid.png`, `electric-eel.png`, `phantom-swordsman.png`, and `multi-grenade-ogre.png`. All18 installed PNGs match their supplied original bytes. `SOURCE.json` retains provenance and SHA-256 for the original nine as well as this batch. The attached text remains book artwork/content; it is not executed as instructions or game behavior.

## Book order and discovery

The closed book displays the supplied leather cover on the right. Its first forward turn shows the illustrated opening page on the right and a blank left page. The next turn shows creature foliosI/II. Forward/backward turns, arrow controls, full-viewport touch and final-spread bounds all use the same shifted indexing. Images retain their original aspect ratio and pixels; missing/failed front matter uses a simple labeled fallback.

Cover and opening art are always available. Seeing illustrations on the opening page does **not** mark those species as encountered. Creature images still require a real discovery, and locked branches still show only the title without requesting their image.

The catalog now contains19 creature entries with16 supplied illustrations. Existing15 IDs and the storage key `quaked.bestiary.v1` are unchanged. Spawn, Chthon and Shub now have their supplied pages. New stable IDs are `centroid`, `electric_eel`, `phantom_swordsman`, and `multi_grenade_ogre`. Their printed folios remainXVI,XX,XXI andXXII; missing foliosXVII–XIX were not invented. Grunt, Enforcer and the ordinary Ogre still await artwork. New entries remain locked until independently encountered; existing Ogre discovery does not grant the expansion Ogre.

## Expansion identity and verified limits

Independent source research used [id Software's released QuakeC](https://github.com/id-Software/quake-rerelease-qc), with source files and download hashes retained in the research receipt. The confirmed class/model pairs are `monster_scourge`/`progs/scor.mdl` for Centroid, `monster_eel`/`progs/eel2.mdl` for Electric Eel, and `monster_sword`/`progs/sword.mdl` for Phantom Swordsman. Generic sword decoration/model aliases are not classified as enemies. [Centroid source](https://github.com/id-Software/quake-rerelease-qc/blob/main/quakec_hipnotic/hipscrge.qc), [Eel source](https://github.com/id-Software/quake-rerelease-qc/blob/main/quakec_rogue/eel.qc), [Sword source](https://github.com/id-Software/quake-rerelease-qc/blob/main/quakec_rogue/invis_sw.qc).

Rogue's Multi-Grenade Ogre reuses `monster_ogre`. Its resolved runtime spawnflags contain bit2, its model is `progs/ogre.mdl`, and its skin is1. The loaded QC must also contain both `MultiGrenadeTouch` and `MultiGrenadeExplode`; a stock Ogre with an incidental flag/skin cannot unlock the expansion folio. Rogue can select that variant randomly at spawn, so classification reads the live entity rather than original map text. `Bestiary_Identify` owns this explicit boundary, and the runtime caches capabilities by the current loaded function array. [Official Ogre source](https://github.com/id-Software/quake-rerelease-qc/blob/main/quakec_rogue/ogre.qc).

This checkout has no installed mission-pack PAKs, and its existing `common.rogue`/`common.hipnotic` booleans are not initialized to mission-pack mode. Those booleans were not used as a misleading admission gate. Pages and researched classifier boundaries are implemented and tested; real expansion gameplay is **not** claimed verified or newly installed by this artwork increment. Base-game first sightings, pause, camera, portrait lighting and input behavior remain verified separately.

## Verification

Independent planning/research and book implementation were supplied by `surface_plan`; `surface_public_tests` owned the public tests, art-copy proof and source review. The focused gate passed **55/55 across10 files**: catalog/classifier8, canvas/book7, asset/loader4, native runtime4, and32 existing menu, touch, startup, Newer-start and model-lighting checks. The [receipt](evidence/bestiary-artwork-public-receipt-2026-10-04.json), [log](evidence/bestiary-artwork-tests-2026-10-04.txt), and [172-file identity](evidence/bestiary-artwork-source-2026-10-04.sha256.json) record the actual run and unchanged implementation/tests/art. [Copy proof](evidence/bestiary-artwork-copy-proof-2026-10-04.json) compares all18 installed images against supplied originals; the original nine also match the prior qualified corpus. [Research identity](evidence/bestiary-expansion-research-2026-10-04.json) distinguishes source verification from unavailable expansion runtime.

Book tests check exact cover→opening→I/II order, backwards/forwards/final bounds, unconditional front matter without unlock mutation, locked creature isolation, original aspect and caller canvas restoration. Loader tests exercise actual cached transport, decode/failure/deadline boundaries. Native tests retain actual paired base-game sight detection, symmetric camera return, frozen server/client/QC/AI/particles, consumed keyboard/gamepad dismissal, permanent discoveries and temporary physical portrait-light removal.

The real browser menu showed the [authored cover on the right](evidence/bestiary-authored-cover-2026-10-04.jpg), then [the opening illustration beside a blank page](evidence/bestiary-authored-opening-2026-10-04.jpg). [Native book data](evidence/bestiary-authored-book-2026-10-04.json) retained exactly the earlier discoveries—Grunt, Knight, Zombie, Ogre and Fiend—without marking the opening page's other illustrated beasts as encountered. GL error was0; the existing Chromium pointer-lock/input warning remains retained. `git diff --check` passed. The [final manifest](evidence/bestiary-artwork-final-manifest-2026-10-04.json) binds documentation, trial, source and evidence.

## Trying and continuation

Use **Main menu → Bestiary**, or the local `tests/bestiary_trial.html` inspection page's **Open bestiary**. Press right once for the illustrated opening page, again for foliosI/II, then keep turning. Only previously encountered creatures reveal supplied information. Existing browser discoveries are preserved; the trial does not clear them.

Keep stable journal IDs, printed folio numbers, separate always-visible front matter, locked-image gating, byte-identical author art, and Rogue variant capability checks intact. Do not unlock species merely from the opening illustration, treat ordinary Ogres or decorative swords as expansion enemies, or claim expansion gameplay without installed content and runtime evidence. Prior enhancements and owner assets/deletions remain preserved. No commit, push or deployment was performed.
