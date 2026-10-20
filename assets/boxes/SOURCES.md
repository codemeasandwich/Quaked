# Game box artwork: sources

This records the box art the game shelf uses. The initial retail packaging was downloaded
on 10 October 2026 from the LaunchBox Games Database (`gamesdb.launchbox-app.com`), whose users scanned it.

- **Owner's decision (10 Oct 2026):** download the box art from the web for the add-ons installed.
- **Copyright:** the artwork belongs to its publishers. It is kept here, at the owner's direction, to show each game's
  own box. Its use is a matter for the legal notices (card [10]).
- **Processing:**
  - Each image was re-encoded as JPEG at quality 82.
  - Images larger than 900 pixels on their longest side were scaled down to 900.
  - Nothing else was changed.

| Game | Faces | LaunchBox entry | Image ids (`images.launchbox-app.com/<id>`) |
|---|---|---|---|
| Quake (MS-DOS, North America) | front, back, spine | [754](https://gamesdb.launchbox-app.com/games/images/754) | front `d2fd8549-7cde-42c1-81ca-241c92923a8f`, back `67780ea2-927d-4397-9430-c5dbb5c97176`, spine `9b3670f6-c496-42f7-b2d3-093bd32317e2` |
| Scourge of Armagon (North America) | front, back | [17627](https://gamesdb.launchbox-app.com/games/images/17627) | front `c72f9b8c-fd1b-4ad4-a55c-fd3bf63a4114`, back `f2070961-8a98-4869-b5b8-010f9fe51974` |
| Dissolution of Eternity (North America) | front, back | [17628](https://gamesdb.launchbox-app.com/games/images/17628) | front `4c34cca0-5198-418b-bce7-2fc0eba74faf`, back `910460ff-a301-428a-9f46-61e0120699f0` |
| Dimension of the Machine (World) | front | [424846](https://gamesdb.launchbox-app.com/games/images/424846) | front `1f4b1153-b2c1-41cf-85f6-e2c730693638` |
| Malice (United States) | front, back | [93720](https://gamesdb.launchbox-app.com/games/images/93720) | front `8484dbce-6e6c-44b7-abd9-b09b466365b5`, back `1b5ae83c-a41e-46bd-9270-b5fd1c8f58b2` |
| X-Men: The Ravages of Apocalypse (United States) | front, back | [100832](https://gamesdb.launchbox-app.com/games/images/100832) | front `dc89672b-90fc-46e7-a3e8-9608a9b4b95a`, back `abe7ff62-70e5-42d5-b52d-b69c4388e571` |
| Abyss of Pandemonium (United Kingdom) | front | [44091](https://gamesdb.launchbox-app.com/games/images/44091) | front `72077fcf-93c8-4a8e-912b-22d06ac9b61c` |

## Current owner-supplied and normalized defaults — 20 October 2026

The owner directs supplied game artwork to become bundled defaults for every downloader, with independently replaceable local faces. The owner additionally authorizes splitting combined wraps and standardizing dimensions, explicitly permitting deterministic crops/resizing and AI only where composition repair is needed.

The current [manifest](manifest.json) contains **57 faces across 19 titles**. The current front/back canvases are **1640×2000 pixels**; all spines are **340×2000 pixels**. The owner’s final ruling requires only the spines to share dimensions: future fronts/backs may be square or taller. Every face uses `contain` in the shelf, so the complete supplied image remains visible at its correct proportions, including different-aspect local overrides. The current canvases match the shelf’s .82 default face aspect and .17 depth/height. Front/back artwork is fitted proportionally with padding where needed, preserving the complete source panel; its depicted elements are never stretched to fill the canvas. Every runtime filename is `front.webp`, `back.webp` or `spine.webp`, encoded losslessly. Complete reviewed panels are fitted proportionally inside their canvases with a restrained dark background; no lettering is stretched or discarded to fill a different ratio. Exact panel rectangles, content placement, hashes and immutable sources are bound by the [derivation record](../../docs/evidence/box-art-standardization-2026-10-20/derivation.json) and reproducible with `node tools/box_art/standardize.mjs docs/evidence/box-art-standardization-2026-10-20/derivation.json`.

| Bundled IDs | Source / current faces |
|---|---|
| quake, hipnotic, rogue | Retained retail fronts/backs; supplied mission spines; all three faces |
| shareware, mg1, quoth | Owner-supplied separate originals; all three faces |
| aopfm_v2, ad, dopa, dawn, mod_alkaline, mod_tremor, mod_hexen_2_shareware, mod_the_immortal_lock | New supplied wraps split into back/spine/front |
| malice, xmen | New supplied separate front/back/side originals; X-Men wrap retained as source |
| mod_quaked | Supplied front and newly split retained back/spine composite |
| mod_hexen_2 | Supplied front/spine and complete back extracted from the owner-provided wrap |
| mod_hexen_2_portal_of_praevus | Retained supplied front/back/spine originals |

Malice and Quoth initially received built-in `image_gen.imagegen` layout trials. Those drafts preserved words but changed the proportions of some original glyphs/logos: Quoth lettering narrowed and Malice’s original elliptical CD became rounder. Under the owner’s final proportion ruling **all AI spine drafts are rejected for runtime**. The shipped Malice/Quoth spines now contain their complete unchanged original panels, uniformly scaled with padding. Their source pixels—including the original **23RD CENTURY ULTRACONVERSION FOR QUAKE**, elliptical CD and QA mark—are preserved proportionally. All spines still use original source artwork. A later, explicitly authorized Abyss repair uses AI only for side backgrounds and narrow background joins; its title, mascot, lettering and logos retain original pixels, as described below.

The original and generated draft canvases, exact [initial prompts](../../docs/evidence/box-art-standardization-2026-10-20/ai-edit-prompts.json), [text correction prompt](../../docs/evidence/box-art-standardization-2026-10-20/malice-correction-prompt.json), failed derivatives and review history remain source-only evidence. They are never packaged. Earlier text/crop acceptance did not establish element-proportion fidelity and is superseded by the final owner-ruling review. Four older spine inputs had wide black/gradient outer authoring margins; only those blank margins are removed around the complete full-height printed strip, with every glyph/logo retained. Combined wraps are split only at reviewed panel seams. No meaningful panel content is clipped, shortened or stretched.

All originals are preserved unchanged under `assets/authoring/box_art`: earlier runtime originals under `originals-2026-10-20`, new local images under `import-2026-10-20`, and AI edit canvases under `edits-2026-10-20`. Authoring is excluded from runtime distribution. The unchanged [19 October baseline](../../docs/evidence/box-art-standardization-2026-10-20/baseline-runtime-manifest.json), its historical relocation evidence and `historicalResolution` preserve exact prior byte identities. Old import receipts describe the original images, not today's normalized runtime derivatives.

The `mod_` IDs reuse discovered-folder naming. The scanner retains the seven explicitly approved artwork-only folders after their images move into the project; this metadata adds no mount tokens or engine compatibility. Missing game content remains unplayable. Every game directory and non-image file is retained. Quake's held launch-promotion poster stays untouched. The newly supplied X-Men poster is archived as source material and never assigned a box-face role. q30's screenshot collage, previous Machine cover and other alternate scans/flaps remain source-only.

Local overrides still accept `front`, `back`, `spine` (aliases `cover` for front and `side` for spine), case-insensitive PNG/JPG/JPEG/WebP/GIF/AVIF. Canonical names win over aliases. A missing or failed override retains that face's bundled image, then its printed placeholder. See the [existing native contract](../../docs/native-box-art-2026-10-19.md). A combined wrap named `cover` must be split before it is suitable as a local front override; automatic import heuristics are not added.

## Supplied-back correction and Abyss repair

The owner confirmed that the retail Hexen II back had been provided and supplied its full reference wrap again. Earlier “not supplied” conclusions were too strong and are withdrawn. The current back uses the complete left panel of the unchanged owner attachment: original 2048×1582, SHA-256 `f4e3f4eebdf35052c943895178d45fe591a334d39a2af5630f47c7770d816118`, crop x22/y120/950×1342. All feature copy, four screenshots and publisher/developer logos are retained; only printer margins and adjacent spine/front are excluded. All 19 supplied titles now have front/back/spine images.

The supplied Abyss wrap had a narrower front than back. At the owner's explicit request, built-in `image_gen.imagegen` extended the smoky/fire background to an 808×975 master, matching its back's artwork ratio. All meaningful original elements remain pixel-identical in the protected 646×975 center (sourcewrap x955/y0); only new 69-pixel wings and 12-pixel background-only joins use AI pixels. Independent review confirmed those join strips contain no text, mascot features or logos. Earlier strict rectangular composites had visible seams and are retained as rejected trials. The final normalized front and back have identical1640×2000 canvases and1640×1979 content placement. See the [repair record](../../docs/box-art-repairs-2026-10-20.md), [prompt](../../docs/evidence/box-art-repairs-2026-10-20/abyss-outpaint-prompt-v2.json), [composition proof](../../docs/evidence/box-art-repairs-2026-10-20/abyss-composition.json) and `tools/box_art/compose_abyss_extension.mjs`.

Other titles without supplied box artwork, including q30a1024, q30limit, Soul of Evil and Rooftop Jam, remain outside this two-box repair. The owner intends to provide their original references later. A screenshot collage, poster or unrelated expansion back is never substituted for missing source art. Artwork availability does not establish game compatibility.

The Immortal Lock wrap arrived during the first batch’s native build and was added as a subsequent three-face increment using the same reviewed deterministic pipeline. The first 53-face candidate remains retained at Dev commit `6e3e0237e9a1c3b520689b10ab824fc737e04b5c`; earlier receipts are historical for that exact batch.
