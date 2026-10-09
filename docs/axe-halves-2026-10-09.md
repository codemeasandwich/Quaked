# Powered-axe halves: they stay, rest on slopes, and their cut faces show the skin

Card [18] (owner request). Newer Game, local single player; the cut itself (which kills qualify) is unchanged.

* **They stay.** The halves' owner entity was removed after 30 seconds; now it stays, as any Quake corpse does, and is
  saved and loaded with the game (`src/sv_axecut.js`). Native gibs thrown by the combined power-up kill keep their
  removal.
* **They rest on the ground under them.** Each half used one floor sample under where it lands and a clamp on its lowest
  point. Now (`src/r_axecorpses.js`) five floor samples around that spot give the ground's plane (a least-squares fit,
  `R_AxeFloorSlope`; too few hits or a wall-steep fit fall back to level). As a half falls it turns to lie along that plane,
  and it is held with its lowest point half a unit above the plane, never through it. The plane is saved with the cut
  (`slope` in `src/axe_record.js`, validated: two unit normals pointing up) so a loaded game settles them the same; older
  saves without it rest level, as before.
* **Their cut faces continue the skin.** `src/r_bisect.js` already carried the skin coordinates to the cut edge; it now keeps
  every attribute (skin coordinates, lighting colour) at the contour points and gives them to the cap, which is drawn with a
  clone of the body's own material under a restrained red tint (`CAP_TINT` = 1, 0.66, 0.6). A model with no skin keeps the
  old flat red.

## Checks

* `tests/bisect_test.js` (20, two new): every cap point of a real soldier cut uses one of the body's own skin coordinates at
  that point, and carries its lighting colour; the cap's material has the body's skin and the tint; the ramp's plane is fitted
  exactly, too few samples or a wall give level; a half previewed on a 20 degree slope rests 0.3 to 1.5 units above the plane;
  a saved slope is kept and four bad ones are refused. Mutants (slope ignored, no tint, the old single-height clamp) fail.
* `tests/axe_powerups_test.js` (9): updated for the halves staying (no removal think).
* Browser, E1M1: a quad axe kill on a soldier cuts it in two; both halves rest on the floor (status: lowest point 0.5 above
  the floor), drawn 1,700 times without errors.

## Not checked

A cut on a real slope in the browser (the slope fit and rest are covered by the tests); how the tinted skin reads on every
monster (it is a tuning target: `CAP_TINT`).
