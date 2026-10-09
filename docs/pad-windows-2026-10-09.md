# Teleporter-pad exits show the next level

Card [B2] (owner request, 9 October 2026). The end-of-level portals of Episode 3, and the slipgate exits of E1M8 and E1M4's secret exit, did not show the next level: they were classed as teleporter pads (a trigger with a teleporter or slipgate surface within 48 units), which by design teleport at once and had no window. Now each one's slipgate surface is **a window onto the next level's start**, the way the doorway exits of Episode 1 are. The pad still teleports exactly as before; the window is a picture only.

| E1M8 to E1M5 | E3M2 to E3M3 | E3M1 to E3M2 |
| --- | --- | --- |
| ![The slipgate shows E1M5](images/pad-window-e1m8.png) | ![The slipgate shows E3M3](images/pad-window-e3m2.png) | ![The exit shows E3M2](images/pad-window-e3m1.png) |

## How

`SV_PadWindow` (`src/sv_seamless.js`), called for every pad exit when a level starts:

* The window is the largest upright teleporter or slipgate surface within reach of the exit's trigger, taken on the side the trigger is on. (Turbulent surfaces come cut into 32-unit strips; coplanar strips facing the same way are merged into one surface first.)
* It is placed 1 unit in front of that surface and looks from the next level's arrival point, the way a player walking through would face, using the same transform and opening as the doorway crossings (`R_CrossingTransform`, `openingOf`), so the renderer's existing level views draw it.
* It is a crossing flagged `viewOnly`: the crossing check skips it, so walking into it never starts a seamless crossing. In practice the pad's own teleport always fires first (the window lies beyond the trigger), so the flag is a safeguard.
* An exit with no upright teleporter surface gets no window (none of the reported ones).

## Checks

* Real browser (owned data), the player placed in front of each exit: windows onto the next level at E3M1 (to E3M2), E3M2 (E3M3), E3M3 (E3M4), both E3M4 exits (E3M5 and the secret E3M7), E3M5 (E3M6), E3M6 (the start map), E1M8 (E1M5) and E1M4's secret exit (E1M8). Two look dark because their destinations' start rooms are dark (E1M8's start, lit by one torch, and E3M7's, checked against E3M7's own start view).
* `tests/pad_window_test.js` (3): E1M8 and E1M4's secret exit each get one upright, level, doorway-sized window onto the right level, E1M4's ordinary exit to E1M5 is unchanged; walking into the window does not queue it as a crossing; the renderer builds the view and its window. A mutant that adds no window fails all three; one that drops the `viewOnly` skip survives, for the reason above.
* The seamless, portal, arch, respawn and related suites pass (111 tests).

## Not checked

The pictures are from a fixed standing point; the windows were not watched while walking up to them. The mission packs' exits (not loadable yet).
