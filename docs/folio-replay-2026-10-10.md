# The Bestiary's pencil replay

Card "Folio pencil fast replay". When a creature is first met, its Bestiary page is drawn as if by pencil. The owner
supplied the effect as `folio-pencil-fast-replay.html` (on the owner's Desktop, sha256
`b864769450933bf95e23af478223bdbca6ed808fef7af14d1b559b7e3f115295`, kept intact and local). Order on the page:

* The frame and title are there at once.
* The contours and first hatching start together, with the notes beside them.
* The deepening follows at about two thirds.
* The finished drawing is the page itself.

![Above: the supplied page replaying the Grunt plate at 0.4, 0.9, 1.4 and 2.0 s. Below: the game's first-sighting page at the same moments](images/folio-replay-2026-10-10.jpg)

## How it is made

* **The analysis, done ahead of time.** The supplied page analyses a page image in a worker into thousands of strokes
  (about 10,000 for the Grunt), each with a phase (first hatching, contours, deepening, notes) and per-texel ownership.
  That takes 22 to 62 seconds a page, far too long to run when a creature is met. `tools/prepare_folio.mjs` runs it
  ahead of time:
  * the supplied worker, verbatim (`tools/folio/analysis_worker.js`, with its provenance);
  * the supplied Bestiarium template (`tools/folio/template.json`);
  * the supplied `schedulePaths`: art over 7 s, notes over 4 s, the first 68% for hatching and contours, then the
    deepening;
  * every Bestiary page, in parallel.
* **What it keeps.** Per page, in `newer/bestiary/folio/`:
  * `<id>.reveal.png` (about 500 kB): per texel, when its first and second strokes reach it (0 to 254 of the replay),
    how strong the first stroke is (the supplied hatching pressure), and whether a stroke draws it at all (the frame,
    title, rails and ornament are the page's own);
  * `<id>.paper.webp` (about 160 kB): the paper the strokes are drawn onto. It is lossy WebP at quality 85, so within a few
    levels of the analyzer's paper (the supplied page samples it exactly); lossless would be about five times the size;
  * `index.json`: the duration and speed, the source's hash, and for each page its image's hash and what made it (the
    analyzer's and template's hashes, the schedule's, and the encoder's version).

  All 47 pages come to about 31 MB, next to the Bestiary's 190 MB of art.
* **The replay** (`src/newer/ui/r_folio.js`). The supplied shader's per-texel rule, on those moments:
  * `first` = reached x strength;
  * `reveal` = first + (1 - first) x second;
  * the colour mixes the paper towards the page's own pixel by `reveal`.

  It runs on a small WebGL2 canvas of its own and is drawn into the Bestiary's 2D overlay as an image. The page's own
  pixels are never altered, and once the replay is over the page itself is drawn.
* **Timing.** The supplied replay's 7 s at its speed of 3: about 2.3 s on screen, from the moment the game stops (as
  the line reveal did). Art still arriving holds it back, as before.
* **When it is used.**
  * The index is fetched as the game loads.
  * A page's two images (about 660 kB) are fetched the moment its creature is discovered, ahead of the page's 0.55 s
    roll.
  * The replay is chosen if they are ready when the drawing starts, and kept for that encounter, never switching half
    way.
  * Otherwise the line reveal draws the page as before: not ready, an image that fails, no WebGL2, a lost WebGL context,
    or an upload that fails.
  * The last four pages met are kept in memory. The replay's canvas and its three page-sized textures (about 25 MB of
    GPU memory) are kept for the session.
  * The book's spreads are unchanged.

## Updating

When a page image, the analyzer, the template, the schedule or the encoder changes, re-run `node tools/prepare_folio.mjs`.
It makes again exactly the pages whose image or recorded makers differ. `tests/folio_test.js` fails while a prepared page
does not match its image and today's makers. The tool refuses a page larger than 1536 on its long side, because the replay
reads the maps texel for texel against the image.

## Checks

* `tests/folio_test.js` (5):
  * the supplied schedule (hatching and contours from 0 over 68% of 7 s, the deepening after, notes over 4 s);
  * the reveal map (later along a stroke means later; the second stroke at its own moment; the hatching's 0.48 pressure,
    lighter at its ends, and none for a contour; a quarter along, the moment the supplied eased curve gives, not a
    straight line's; the page's own pixels untouched);
  * every page prepared from today's image by today's makers, at the image's own size, with no drawn pixel left without a
    stroke;
  * the runtime (`src/newer/ui/r_folio.js`, with fetch and images stood in for): loading, ready and none; a failing image; the
    2.3 s timing; no plate for an image not the maps' size.
  * Each of these fails when its rule is broken. This was checked by deliberately breaking each: no eased curve,
    pressure on every stroke, no second layer.
* `tests/bestiary_book_test.js`:
  * ready when the drawing starts: the plate drawn, at the right fraction; done: the page itself;
  * late art holds it back;
  * not ready: the line reveal, even once it becomes ready;
  * no plate (no WebGL2): the line reveal.
* Browser, E1M1, a real first sighting of a Grunt (pictures above): the replay ran (126 plates, no failures). At the
  same moments it shows what the supplied page shows.
* Browser, the plate against the Grunt image itself
  ([check](evidence/folio-plate-check-2026-10-10.mjs), [output](evidence/folio-plate-2026-10-10.txt)):
  * At the start, all 898,609 of the page's own pixels (frame, title, rails) equal the image.
  * At the end, 1,591 pixels differ: those whose moment is the last step, which the image draw replaces.
  * An independent review found the first version drew the plate one source row low, so the page jumped a row as the
    replay ended; this check is what it fails.

## Not checked

The other 46 pages in the browser (they are prepared and checked against their images, not replayed on screen); phones;
a lost WebGL context in the browser (the fallback is unit-tested only).
