# Game catalogue: which games are installed, found without downloading them (card [34b], 10 Oct 2026)

`src/engine/common/game_catalogue.js` finds which Quake games and add-ons the page can read. The browser cannot list a
folder, so it probes the known ones: card [34a]'s `games/<name>/` and, until card [34d] moves them, the owner's
`resources/<quake folder>/` (`id1`, `hipnotic`, `rogue`, `dopa`, `mg1`, `ad`, `quoth`, `malice`, `xmen`, `aopfm_v2`).

## What it reads

For each pack, `pak0.pak` to `pak4.pak` in that order (Quake's own numeric order), stopping at the first missing:

1. the 12-byte header, as a ranged GET (`Range: bytes=0-11`; HEAD is never used, as some servers refuse it); and
2. when the server answered with `206`, only the directory (`dirofs`, `dirlen` from the header; at most 2048 entries,
   131,072 bytes, `pak.js`'s own limit).

Both are checked by `pak.js`'s own rules, now shared functions (`COM_PackHeader`, `COM_PackEntries`) that
`COM_LoadPackFile` also uses, so the catalogue and the loader cannot disagree about what a sound pack is.

Every read is bounded: a body is read up to what was asked for and the rest dropped, so a server that ignores Range and
sends a whole 760 MB archive costs a few bytes read (the browser cancels the transfer). 404 and 410 are "absent"; an
HTML page standing in for one (a soft 404) is "absent" too, never a pack; another status, a network error or no answer
within 8 seconds is "error"; a bad header, a directory past the end or a payload outside the archive is "invalid". When
all five packs exist, one more header says whether there are more (then the game is never called playable).

A `206` counts only when its `Content-Range` is exactly the range asked for (a server answering another part of the file
is not taken for the directory); an empty file (the server's `416`) is invalid; a response that cannot be read in
pieces is refused rather than buffered. Folders are relative to the document's base (`document.baseURI`), so a page
with `<base href>` probes the site's folders.

A settled answer (valid or invalid) is kept by URL with the size, the server's validator (`ETag` or `Last-Modified`)
and the directory's place; a refresh reads the headers again, and a directory only when one of those changed. An error
or an unread directory is not kept, so the next refresh tries again; and when the server sends no validator, nothing
shows the pack is unchanged, so its directory is read again (at most 128 KB). Two refreshes asked for together share
one probe. A pack dropped into a folder is found by the next refresh
(the page refreshes a few seconds after it starts; the console's `games` command refreshes and prints).

## Found, validated, playable

Recorded separately, each with a reason:

* **found**: a pack answers in the folder;
* **validated**: every pack's header and directory were read and are sound;
* **playable**: only with evidence. The shareware: its QuakeC and start map. Quake: its QuakeC and Episodes 2 to 4 in
  its packs (a pack with only Episode 1 is not the full game, whatever registered marker it holds). Mission packs,
  the two re-release episodes and the add-ons are found and validated but not called playable: the engine's support
  for their HUD, QuakeC, entities, protocol and limits is not yet shown (cards [34c], [31a]–[31f] and later). Dawn of
  the Machine is a placeholder and never found.

The catalogue only reports. Mounting a game and choosing it in the menu are cards [34c] and [M1]; the shareware's
loading in `main.js` is unchanged.

## Measured on the owner's machine

Through `tools/serve.py` (ranges served), with every installed pack probed:

| Game | State | Packs |
|---|---|---|
| Quake (shareware) | playable | pak0 |
| Quake | playable (Episodes 1 to 4 and their QuakeC) | resources/id1 pak0 |
| Scourge of Armagon, Dissolution of Eternity, Dimension of the Past, Dimension of the Machine | validated, not yet playable | pak0 each |
| Arcane Dimensions, Quoth | validated, not yet playable | pak0–pak2 |
| Malice, X-Men, Abyss of Pandemonium | validated, not yet playable | pak0–pak4 |
| Dawn of the Machine | placeholder | |

72 requests, 402 KB read in all, the largest read 122 KB (Arcane Dimensions' directory); Dimension of the Machine's
760 MB pack was checked from its header and directory. Through Python's own `http.server` (ranges ignored): every
game "found, not validated: the server ignores byte ranges", 12 bytes read per pack, the transfers cancelled.

## Checked

* `tests/game_catalogue_test.js`, against a real HTTP server whose folders each behave one way: valid packs and a gap
  in their numbers, ranges ignored (a 4 MB body), a 760 MB pack served from its header and directory only, a soft 404,
  a corrupt directory, a truncated header, a 500, a request that never answers; a pack added between refreshes; the
  cache; and the read counters (no read over 131,084 bytes).
* `tests/serve_py_test.js`: `tools/serve.py` serves a range as 206, a whole file as before, past the end as 416.
* The pack suites (`fullgame_pack`, `fullgame_registered`, `startup_preload`) with the shared header functions.
