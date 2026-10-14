# Small touches

Item 13 of the add-on effects for every game (card T-3faa98e3; plan:
[addon-effects-integration-2026-10-13.md](addon-effects-integration-2026-10-13.md)). The owner
approved five small touches seen in Arcane Dimensions and other add-ons. Before building, each was
checked against what the engine already does; three were partly or wholly there.

| Touch | Found in the code already | Done here |
|---|---|---|
| Items turned | Weapons, armour, keys and power-ups already spin (`EF_ROTATE`, `cl_main.js`). Ammunition and health boxes all face the map's grid. | Boxes turned by their own amounts (below). |
| Corpses on moving floors | Already: the server carries grounded entities, corpses included (`SOLID_NOT` too), on lifts and trains (`sv_phys.js`, `groundentity`). | Nothing: no failing case was found. |
| Per-map sun colour | The Newer Game sun took its direction from `_sun_mangle` and its colour from the sky only. | The map's `_sunlight_color` (below). |
| Per-liquid see-through | One setting for every liquid (`r_wateralpha`); Newer Game's liquids have their own looks. | A map's own values, where they do not fight the Newer treatment (below). |
| More shadow exclusions | Already: dynamic shadows cover models, brush entities and axe pieces, and leave out what should not cast (`r_post_shadows.js`). | Nothing new: no wrong shadow was found. |

All of these are Newer Game only and each has an Options switch (Options, Newer features).

## Turned item boxes (`r_itemturn`, "Turned item boxes")

In stock maps every ammunition and health box faces the same way. In Newer Game each box the map
placed unturned is drawn turned by its own amount, up to 30 degrees either way, about its own
middle. The amount comes from where the box is first seen, so the same box looks the same every time
and on every machine, and a box riding a lift keeps its turn as it goes. If a turn would put a corner of the box into a wall (a box set flush against
one), the turn is halved until it fits, or not made. Only the picture turns: the box's place, what
picks it up, and what the server knows are unchanged. Demos (the title demo included) show the boxes as the map placed them. Boxes a mapper turned, the exploding box
(`b_explob`, which can be shot) and every model other than the pickup boxes (`b_bh*`, `b_shell*`,
`b_nail*`, `b_rock*`, `b_batt*`) are left alone. Code: `src/newer/render/r_itemturn.js`, called from
both of the client's entity paths after the angles are set.

## The map's sun colour

Arcane Dimensions and other maps built with ericw-tools give the sun a colour in worldspawn
(`_sunlight_color`, 0..1 or 0..255; 62 installed maps). The Newer Game sun now takes it for the sky's
sunlight, the surfaces' sunlight and the height shadows, the same three places that took the sky's
colour (`R_SunTint`, `r_post_sky.js`; read in `R_BuildWorldLights`). A map without the key keeps the
colour read from its sky, exactly as before; each map starts over.

## A map's own see-through liquids (`r_mapliquids`, "Map see-through")

Quakespasm reads worldspawn `wateralpha`, `slimealpha`, `lavaalpha` and `telealpha`; the
re-release's own maps set them (water .666, slime .75, lava .85, teleporters .666 in 60 of them), as
do Dimension of the Machine and Arcane Dimensions. In Newer Game these liquids already have approved
treatments, and by the owner's rule the existing treatment wins: water and slime take the Newer
liquids' looks, lava is drawn solid with its glow and heat haze, and teleporters are camera portals.
So a map's own value is used for a liquid only while its Newer treatment is switched off
(`r_newer_water 0` for water, slime and lava; `r_newer_portals 0` for teleporters). New Game is the
original: `r_wateralpha` for every liquid, as always, and so is the classic comparison half of the
title demo. Every liquid draw path asks one function (`R_LiquidAlpha`, `gl_rsurf_liquids.js`).

## Checks

- `tests/item_turn_test.js`, with e1m1's real boxes and walls: every box turns at most 30 degrees
  about its middle with no corner in a wall; boxes differ; the same box turns the same; the turn never
  adds up over frames; a box riding a lift keeps its turn; both client paths call it after setting the
  place and angles; New Game, demos, the switch off, a mapper's angle, the exploding box and other
  models untouched; a box flush against a wall keeps its
  corners out of it.
- `tests/sun_colour_test.js`: the key in both ranges, bad values ignored, a map without it as before,
  the next map starting over; the three consumers read it.
- `tests/map_liquids_test.js`: with the Newer treatments on, every liquid as before; with each
  switched off, the map's values; New Game, the classic half and the switch off as always; every draw
  path asks the one function. `tests/water_*_test.js` (30 tests) pass unchanged.
- Not yet seen in a browser.
