# Add-on trial evidence, 13 October 2026

Trials behind [../../add-ons-2026-10-13.md](../../add-ons-2026-10-13.md) (card c5dc18e1).

`addon-trial-harness.mjs` is the harness as run: it serves the built app page (`dist/desktop`) to
Playwright WebKit with a stand-in for the Tauri bridge and the owner's library (`~/quaked`), starts
the add-on (after its demo reaches signon 4; a found add-on, or one run with `NODEMO=1` such as
Arcane Dimensions, once the engine takes commands), then loads each map in `MAPS` with `map <name>`. A map passes when it loads (the client's
world is that map, signed on, the server running), the server runs, and game time advances by more
than a second with no page error. Each `.jsonl` file is one run, a line per map, then the summary.
(Paths in the harness are this machine's.)

| File | Run | Result |
|---|---|---|
| `malice-props.jsonl` | Malice's 14 prop maps (no player start), then `d2`, `ddm7`, `ddm5`, `isle`, `test`; before the QuakeC stack fix | 0 of 19: every level after the props failed to load (the client's world stays `tank5`); a screenshot showed the next level's QuakeC stopping (the "locals stack overflow" cause is in the add-ons note) |
| `malice-props2.jsonl` | the same sequence, after the fix (`PR_ResetStack`) | the 5 levels after the props load and play |
| `malice-real.jsonl` | all 35 Malice levels back to back | 35 of 35 |
| `xmen-before-edge-fix.jsonl` | every X-Men level, before the edge fix (map lines only: its summary line was not kept) | 16 of 18: `x2m1` leads to `x2m4`, refused for an unused edge 0; the last two lines are labelled `x2m1` because the harness names the map the client is on, so they are the failed `x2m4` and the `x2end` after it |
| `xmen.jsonl` | every X-Men level, after it | 18 of 18 |
| `soe.jsonl` | every Soul of Evil map | 24 of 24 levels; the 4 `b_*` props fail, as they have no player start |
| `ad-large-protocol.jsonl` | Arcane Dimensions' `start`, `ad_e1m1` and `ad_tfuma` after the 8192-entity change (map lines only) | `start` (1664 entities, 282 models) and `ad_e1m1` (1488, 250) play; headless WebKit's page process stopped loading `ad_tfuma`, which loads and runs on the server in Node (last line) |
| `ad-start-large-protocol.jpg` | the `start` run's screenshot | Arcane Dimensions' hub in play on the large-map protocol |

The Quoth and Abyss of Pandemonium runs (11 of 12 and 17 of 17) were printed to the console and are
summarised in the add-ons note, not kept here.
