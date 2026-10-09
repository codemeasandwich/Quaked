# Episode 3 water gets the Newer liquid treatment

Card [B3]. The owner found that in Episode 3 the water kept its original surface texture and nothing changed when
going under it.

## Cause

Newer liquids recognise water by its texture name: a `*` texture with "water" in it (slime and lava have their own
rules). Episode 3's E3M3, E3M4 and E3M5 use **`*04mwat1`** and **`*04mwat2`** (murky water), which have no "water" in
the name, so they were treated as a plain textured surface: no pool region, no see-through look, no caustics, nothing
underwater. The surface material (`gl_rsurf.js`) used a second, separate copy of the same name test.

A list of every `*` texture in the 2021 re-release's maps (`resources/id1/pak0.pak`) is in the test:

| texture | maps (examples) | treated as |
|---|---|---|
| `*water0`, `*water1`, `*water2` | start, e1m1, e2m1, e4m1 | water |
| `*04water1`, `*04water2`, `*04awater1` | e1m2 to e1m5, e2*, e4* | water (`*04water1` is the muddy brown look) |
| **`*04mwat1`, `*04mwat2`** | **e3m3, e3m4, e3m5**, dm2, dm8, death32c | **water, muddy look (was: not liquid)** |
| `*slime`, `*slime0`, `*slime1` | e1m1, e1m4, e3m1, e4m5, e4m7 | slime (toxic look) |
| `*lava1` | e1m6 to e1m8, e3m2, e3m3, e3m4, e3m6, e3m7 | lava (own glow, unchanged) |
| `*teleport` | most maps | teleporter (unchanged) |

## Change

`R_IsWaterTextureName` (`src/gl_post.js`) is the one test, used by the pool-region builder and the surface material
(`src/gl_rsurf.js`): water is a `*` texture with "water" or "mwat" in its name that is not slime, lava or a
teleporter. The look choice (`liquidMapLook`) shares the "mwat" pattern. The murky water uses the **muddy** look, the same as E1M3's brown `*04water1` (the owner can ask for
another). Contents, movement, damage and Classic are untouched.

## Checks

* `tests/liquid_names_test.js` (3): every stock water texture is water and slime, lava and teleporters are not; each
  water texture gets exactly its look (Clear for `*water0-2`, `*04water2`, `*04awater1`; Muddy for `*04water1` and
  `*04mwat1/2`; Toxic for slime; lava and teleporters keep the fallback) compared with the real look constants; and,
  when the full-game pak is present (it printed so in this run), every `*` texture in all its maps is in the table
  (a new unclassified one fails the test) and the two murky ones really occur.
* `tests/water_concept_test.js` (2): the surface material of `*04mwat1/2`, `*water2` and `*04awater1` takes baked
  brightness (vertex colours) like other Newer water, `*lava1`, `*teleport` and `*slime0` do not, and murky water has
  the Muddy coverage. This is the `gl_rsurf.js` half of the fix.
* Mutation checks, each failing a named test: the old surface predicate; `*04water2`/`*04awater1` made muddy; both
  murky and brown water made Tinted; no `mwat` in the predicate.
* The other water suites pass: `face_water_entry`, `startup_water`, `water_concept`, `water_effect`,
  `water_flashlight`, `water_looks`, `water_nearfield`, `water_surface`, `water_vapour`, `gl_post_test`.
* In the real game (Chrome, the shotgun trial page, Newer Game): the number of liquid regions the renderer builds is
  **0, 0, 0 before and 1, 3, 7 after** on E3M3, E3M4 and E3M5, all the muddy look. Looking at the E3M5 pool from
  underneath changes from the plain textured wall to the dark absorbing water. One independent review.

## Not checked, and related findings

* The bundled expansions also change: `*04mwat1/2` appear in Hipnotic's hip3m3 and Rogue's r1m4, r1m5 and r2m5, which
  now get the Muddy look. Not looked at.
* **Same kind of bug, not fixed here (follow-up card):** other liquids with unrecognised names stay untreated, for
  example the custom map `maps/efdm9.bsp` uses `*sewer1` and Hipnotic uses `*blood1` and `*rift1`. A contents-based
  rule is not safe alone (teleporters are water contents too); this needs a decision on a name-plus-contents rule.
* No before/after picture of the surface from above (my parked camera did not look at the water). The choice of the
  Muddy look for murky water is mine. The deathmatch maps `dm2`, `dm8` and `death32c` also change and were not looked at.
