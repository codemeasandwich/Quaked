# The game shelf: card [M1], 10 October 2026

## What the owner asked

Asked where the list of installed games should go, the owner first chose a chooser at start-up. They then gave its
form:

> "it should be a row 3-D box that you cycle through and it pulls the box forward and shows you the front of it so
> you'll need to get the front artwork of the box the spine artwork on the back artwork for each of the add-ons so the
> index page will allow you to cycle through them and then clicking one will open the URL to that specific game with
> all of the newer game enhancements"

And on the artwork and the add-ons:

- **Box art:** download it from the web.
- **The add-ons:** "only pull down the artwork and setup for the add-ons that I have and we will add a box at the end
  with an [add] game so when they click it they can select a folder where their add-on or plug-in is … They should
  contain a front side and back image if the image isn't there then just put a placeholder and print the text for the
  box".

## What the player sees

- **When the shelf appears.** With more than one game installed, `index.html` opens on a shelf of game boxes before
  any game starts.
- **The boxes.** They stand spine-out in a row. The chosen box is pulled forward and turned to show its front.
  - **Cycling:** ◀ ▶ (arrow keys or A/D, the mouse wheel, a swipe, or a controller's d-pad or left stick) cycles,
    and clicking another box chooses it.
  - **Turn over:** the Turn over button (↑/↓, Space or F, or a controller's Y) shows the back.
- **Play.** Play (Enter, a click on the chosen box, or A) opens that game's own URL, `index.html?game=<id>`, which
  starts the game with Newer Game's enhancements as before. The choice is kept, and the shelf starts on it next time.
- **Not playable yet.** The shareware and Quake play. The mission packs, episodes and add-ons are found and checked
  but not yet playable (card [34c]):
  - their boxes are dimmed;
  - choosing one says "Not playable yet", with the catalogue's reason.
- **Add a game.** The last box opens a folder picker (the directory picker where the browser has one, else a
  directory file input).
  - The folder's `front`, `side` (or `spine`) and `back` images make a new box, matched by name in any case and any
    image type.
  - A face with no image is a placeholder with the box's text printed on it.
  - The box is kept in the browser (IndexedDB `quaked.shelf.v1`) and shown on later visits.
  - Playing a game from a folder needs the engine to mount packs from the player's files, which is not built yet, so
    its box says so.
- **Straight in.** These skip the shelf and start the game directly:
  - a site with only the shareware;
  - a game's own URL;
  - a room join (`?room=`) and a local-play player's window (`?window=`);
  - any page other than the index page that boots `main.js`, such as the trial pages under `tests/`. The shelf shows
    only at `/` or `…/index.html`.
- **A game's URL afterwards:**
  - On a page opened at a game's URL, the `game` command switches by going to the new game's URL, because a reload
    would keep the old `?game`. Its check reads the kept choice, not the URL's.
  - A local-play player window opens with its host's `&game=`, so it mounts what its host mounted.

## The art

The box art is in `assets/boxes/<game id>/` as `front.jpg`, `back.jpg` and `spine.jpg`, about 2.2 MB in all.
`assets/boxes/SOURCES.md` lists where each image came from: the LaunchBox Games Database, with the entry and image id
for each.

| Game | Images |
|---|---|
| Quake | front, back and spine (the MS-DOS release). The shareware uses the same box with a "Shareware" sticker. |
| Scourge of Armagon, Dissolution of Eternity, Malice, X-Men | front and back |
| Dimension of the Machine, Abyss of Pandemonium | front |
| Dimension of the Past, Arcane Dimensions, Quoth | none (they were never sold in a box) |

Every face without an image, including every spine except Quake's, is printed with the game's name, and on the front
and back with what it is.

## How it works

- **`src/newer/ui/game_shelf.js`** builds the shelf.
  - **The boxes** are CSS 3-D: six faces each. A box's width follows its front image's shape, and its depth is 0.17 of
    its height.
  - **The layout:** the chosen box is moved forward (and turned 180° to show its back). The others are turned 90° to
    show their spines and packed beside it.
  - **Dimming:** a box not playable yet dims its faces, not the box. A filter on the box would flatten its 3-D faces
    and show them from behind.
  - **Exports:** `GameShelf_Box`, `GameShelf_ReadFolder` and `GameShelf_Url` are pure and tested. `GameShelf_Show`
    opens the shelf and resolves with the chosen game.
- **`main.js`**, before anything of a game starts: when the page has no `?game`, `?room` or `?window`, it probes the
  catalogue (card [34b]). With more than one game present, it shows the shelf and starts no game. Otherwise it goes
  on as before.
  - The catalogue's later probe is skipped when this one has already run.
- **`game_catalogue.js`** now probes every game's folders at once rather than one game after another, which shortens
  the wait before the shelf or the game. Each game's own packs are still read in order, and the games are still
  judged in order.
- **`game_selection.js`:**
  - `GameSelection_Current` reads a game's URL first: `GameSelection_UrlChoice('?game=quake')`, then the kept choice.
  - `GameSelection_Remember` keeps a choice without reloading.
  - `GameSelection_Kept` gives the kept choice, which is where the shelf starts.
  - A game's URL also picks its saves (`GameSelection_SavePrefix`).

## Checks

- `tests/game_shelf_test.js` (6 tests):
  - every box image named exists, and the sources are recorded;
  - boxes: their own art, placeholders, the sticker and their text;
  - a picked folder: name, images by name in any case or type (`spine` counts as `side`), packs, and only its top
    level;
  - a game's URL wins over the kept choice, with its saves, and the shelf starts on the kept choice.
- `tests/game_shelf_test.js` also covers two cases:
  - on `?game=quake`, `game shareware` is kept and goes to `?game=shareware`;
  - a player window's URL carries its host's game.
- `tests/startup_preload_test.js`:
  - a trial page (`/tests/axe_trial.html`) with two games installed starts its game and never probes for the
    shelf;
  - with two games installed, the shelf opens and nothing of a game starts;
  - a game's URL starts at once, without the probe;
  - the ordering test now expects the probe before the packs.
- `tests/game_catalogue_test.js` (5/5) and `tests/game_selection_test.js` (5/5) still pass after the parallel probe.
- Browser trials (Playwright, Chromium, `tools/serve.py` on the owner's installed games), with no page errors:
  - The shelf showed 0.8 s after load, with 12 boxes: 11 games and Add a game.
  - Cycling, turning over (Scourge of Armagon's back) and a not-playable message all worked.
  - With a mocked directory picker, a folder "My Mod" (a `Front.PNG`, a pack, a readme) became a box. Its front showed
    the image and its back a placeholder. It was still there after a reload.
  - Play on Quake opened `index.html?game=quake`. The game started there, with `GameSelection_Current()` 'quake', no
    shelf, and the choice kept.
  - Screenshots: `/tmp/claude-qk/shelf-*.png`.
  - Trial pages that boot `main.js`, on the owner's many-game install: axe, bestiary, intro_loading, newer_start,
    demo_resolution and travel each had the engine ready in 0.9 to 1.5 s, with no shelf.
- **Review fixes:**
  - The shelf now draws at once in a box's usual shape, and each box takes its front's shape as the image arrives.
  - The games added from folders are waited for at most 1.5 s.
  - A cancelled directory input settles.
  - A controller button already held when the shelf opens is not a press.
  - Choosing closes the shelf and revokes the folder boxes' object URLs.

## What remains

- **Playing the add-ons** (card [34c]: mission packs, episodes, add-ons) and **games added from a folder** (mounting
  packs from the player's own files).
- **The way back.** There is no route from a game back to the shelf other than opening `index.html` again, and no
  owner decision yet on adding one.
- **The text-list chooser** built first is kept on branch `claude-chooser-text`, superseded.
