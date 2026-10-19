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

## Owner-supplied bundled defaults — 19 October 2026

The owner asked to merge artwork from `~/quaked` into the project so all native
downloads receive the defaults, with user-folder images overriding individual
faces. These additions are byte-identical copies; no resizing, re-encoding or
pixel edits were applied. [Import identities](../../docs/evidence/native-box-art-2026-10-19/bundled-import.json)
record source paths, destination paths, byte counts and SHA-256 values.

| Default ID | Faces imported | Supplied game folder |
|---|---|---|
| shareware | front, back, spine | Quake shareware |
| hipnotic | spine | Scourge of Armagon |
| rogue | spine | Dissolution of Eternity |
| quoth | back, spine | Quoth |
| mod_q30a1024 | front | q30a1024 |
| mod_quaked | front | Quaked |
| mod_hexen_2 | front, spine | Hexen 2 |
| mod_hexen_2_portal_of_praevus | front, back, spine | Hexen 2 Portal of Praevus |

The `mod_` IDs use the existing discovered-folder slug rule; they do not add
game-engine compatibility. The Hexen II and Quaked folders may display unavailable
boxes without mountable game data. The owner will supply a replacement Quoth
front: the former local front was accidentally replaced with the Quaked cover.
Quake's unrelated launch-promotion poster is intentionally untouched and unbundled;
posters are outside this change.

Local overrides: put `front.png`, `back.png`, `spine.png` in the game's own folder.
JPG/JPEG/WebP/GIF/AVIF and case variants work too. `cover` aliases `front`; `side`
aliases `spine`. Canonical names win over aliases. A missing or failed override
retains that face's bundled default, then its printed placeholder. Other images
and nested folders do not override faces. See [the full contract](../../docs/native-box-art-2026-10-19.md).

## Faces that still have no image

These faces are drawn as placeholders with the box's text printed on them, as the owner asked:

- every face of Dimension of the Past and Arcane Dimensions, and Quoth's front;
- the missing back of Dimension of the Machine and Abyss of Pandemonium;
- other spines not listed above, Hexen II's back and Quaked's back/spine.

A game added from a folder uses those same naming conventions. Missing faces
without a bundled default are printed placeholders.
