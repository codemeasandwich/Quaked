# Progressive inner illustration, locked folios and authored menu

The revised dedication is installed on the left of the first opening. The right inner illustration now starts with the supplied empty template and fills from five existing discoveries:

| Guide piece | Discovery |
|---:|---|
| 1, upper left | Scrag (`scrag`) |
| 2, upper middle | Shambler (`shambler`) |
| 3, upper right | ordinary Ogre (`ogre`) |
| 4, lower left | Fiend (`fiend`) |
| 5, lower right | Vore (`vore`) |

Related variants and unrelated enemies cannot substitute. No new unlock events or persistence schema were introduced. Existing `quaked.bestiary.v1` discoveries immediately contribute; new runs/maps retain them. With none known, the exact empty image is returned. Partial collections composite only earned regions, preserving the empty template's central title band. With all five known, the exact revised full illustration is returned. Its title band differs slightly from the empty source, so this final endpoint deliberately avoids a seam or mixed-band image. **Complete Edition remains a separate all-47-discoveries requirement** and replaces only the right illustration; dedication stays on the left.

The guide screenshot is 1000×1400 and crops the bottom of the original 1024×1536 page. Registration against unmarked artwork establishes upper/lower cuts at approximately 43.915% and 58.201% original height, rather than stretching screenshot coordinates. The five normalized polygons are explicit in `src/bestiary_art.js`. The red strokes/numbers are instructions for cutting only and are never runtime artwork. Composition clips the original clean image at the original page origin. The current canvas is cached by discovery mask and decoded source references; late decoding rebuilds it, without allocating a canvas every frame. A failed empty source does not prevent the exact full-five illustration from showing; a partial collection never falls back to revealing the full illustration.

Undiscovered folios now display the supplied blank entry template with the original painted heading and original folio number. `tools/build_bestiary_headers.mjs` extracts separate 1024px-wide title crops: 196px normally, 240px for Awakened Shub, Infected Death Knight and Ranged Death Knight. The 47 crops and source hashes/coordinates are recorded in `newer/bestiary/headers/SOURCE.json`. This is deterministic author-art extraction, with no generated lettering, color edits or creature-body pixels. A locked page requests only its header and the shared blank, never the full hidden folio. If either asset fails or has not decoded, it uses neutral paper and the entry title; it does not display the blank template's misleading fixed “Folio XIV.” Discovered folios keep their original full image and encounter behavior.

The supplied menu sheet is loaded through the existing PNG cache at 140px native height/210px width, preserving its transparency. Its order is **Single Player, Multiplayer, Bestiarium, Options, Credits, Quit**, with Continue prepended only during play. The same 20px grid serves rendering, keyboard and touch action selection. The nongame crop skips 21px and keeps 119px to remove the significant Continue descender while preserving Single Player's first strokes. An unavailable sheet uses text in the same order, rather than old artwork with mismatched actions. The prior root menu image remains intact. Studio corner branding retains its existing book reservation.

## Verification

Independent planning, public tests and corrective review completed. **88/88 checks passed** against the final runtime snapshot, including all 32 reveal masks and **49,808,096 exact interior-pixel comparisons**. A 2px polygon-edge band is excluded because native canvas clipping antialiases boundaries. The independent guide witness places 475/476 visible cut samples on the marked red strokes; the cropped lower edge is explicitly qualified. All 47 header crops match original decoded pixels exactly. Optional-image failures, all-47 completion, profile preservation, actual menu actions and PNG decoding/transparency are covered. The earlier 86-case run preceded two review fixes and is not the final qualification.

- [Final 88/88 log](evidence/bestiary-progress-tests-2026-10-04.txt)
- [Public receipt and limitations](evidence/bestiary-progress-public-receipt-2026-10-04.json)
- [Qualified 274 hashes](evidence/bestiary-progress-source-2026-10-04.sha256.json)
- [Independent guide registration](evidence/bestiary-progress-guide-registration-2026-10-04.json)
- [Cut-line registration witness](evidence/bestiary-progress-guide-cuts-2026-10-04.json)
- [Actual two-piece opening screenshot](evidence/bestiary-progress-opening-2026-10-04.jpg)
- [Native progress diagnostics](evidence/bestiary-progress-native-2026-10-04.json)
- [Actual locked-entry screenshot](evidence/bestiary-progress-locked-entry-2026-10-04.jpg)

The live Newer E1M2 profile retained `grunt, knight, zombie, ogre, fiend`, so only Ogre and Fiend appeared on the inner illustration; Scrag, Shambler and Vore stayed empty. Completion remained false and GL error was zero. The revised dedication appeared opposite it. The recovered browser also displayed the locked Rottweiler's original heading/Folio I and empty template body. A Chromium input/pointer-lock UnknownError remains recorded; later browser control lost tab ownership during the menu visual check. Menu display/route qualification therefore rests on the production public rendering/PNG/action tests, not an unverified native menu screenshot. No artificial discoveries were written.

During preview work, the trial's F2 control shortcut also reached the engine's Save command. The trial now consumes F2 keydown/keyup in capture phase while toggling its controls. This changes only the test page, preserving ordinary engine F2 behavior. It was syntax-checked after the runtime gate and included in the subsequent scoped candidate verification.

Try the [game preview](http://127.0.0.1:8015/tests/bestiary_trial.html): Open Bestiary → Next opens the dedication/progressive illustration, then Contents and creature leaves. Native menu entry is now Bestiarium. Actual expansion/Dawn gameplay remains unverified without the corresponding installed packs. Updated originals and derived title crops are runtime assets; historical alternate originals remain locally retained and are excluded from the owner-authorized commit.
