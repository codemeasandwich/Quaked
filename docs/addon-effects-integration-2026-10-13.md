# Add-on effects for every game: how they fit the engine

Card T-3faa98e3. The owner approved 14 effects found in the installed add-ons, to be built into the
engine so every supported game gets them (stock Quake, the mission packs, the re-release episodes and
any add-on). This is the review the owner asked for before building: what already exists, what each
effect reuses, what it listens to, and what it must leave alone.

## Status (14 Oct 2026)

All 14 are built, each as its own commit with its own Mac app release, each independently reviewed
before it landed (the reviews' findings fixed, and tested, in the same commit):

| # | Effect | Release | Notes |
|---|---|---|---|
| 12 | Per-map sky fog | v0.114.135 | [fog-2026-10-13.md](fog-2026-10-13.md) |
| 3 | Explosion shake | v0.115.135 | [blast-shake-2026-10-13.md](blast-shake-2026-10-13.md) |
| 6 | Visible drips | v0.116.135 | [drips-2026-10-13.md](drips-2026-10-13.md) |
| 7 | Sparks at sparking lights | v0.119.135 | [sparks-2026-10-13.md](sparks-2026-10-13.md) |
| 8 | Nail impacts (not the shotgun or lightning gun) | v0.120.135 | [nail-impacts-2026-10-14.md](nail-impacts-2026-10-14.md) |
| 9 | Embers over lava | v0.121.135 | [lava-embers-2026-10-14.md](lava-embers-2026-10-14.md) |
| 11 | Blood running down walls | v0.122.135 | [blood-runs-2026-10-14.md](blood-runs-2026-10-14.md) |
| 10 | Gibs that sound when they land | v0.123.135 | [gib-sounds-2026-10-14.md](gib-sounds-2026-10-14.md) |
| 4 | Lava you can hear | v0.124.135 | [lava-ambient-2026-10-14.md](lava-ambient-2026-10-14.md) |
| 13 | Small touches | v0.125.135 | [small-touches-2026-10-14.md](small-touches-2026-10-14.md): corpses on lifts, item spin and shadow exclusions were already in the engine |
| 5 | Lightning with the thunder, gusts | v0.127.135 | [storms-2026-10-14.md](storms-2026-10-14.md) |
| 2 | Surface-aware impacts | v0.128.135 | [material-sounds-2026-10-14.md](material-sounds-2026-10-14.md) |
| 1 | Footsteps | v0.129.135 | [footsteps-2026-10-14.md](footsteps-2026-10-14.md) |
| 14 | Weapon wheel, button prompts, rumble | v0.130.135 | [controller-2026-10-14.md](controller-2026-10-14.md) |

(v0.126.135 is the glass textures at the 4x standard, not one of the 14.) Each has a switch in
Options, Newer features; all are Newer Game only, New Game is the original. None was yet seen or
heard in a browser or the app by the owner: that is the owner's to try.

## The owner's rules (13 Oct 2026)

- Preserve every approved and landed enhancement: its look, behaviour and performance.
- Do not break, diminish, replace or regress any existing effect or function.
- The shotgun and the lightning gun are excluded entirely. Nothing here reads, changes or adds to
  their effects (pellets, wall burns, casings, underwater bubbles, smoke, the beam).
- Apply the 14 consistently across all supported games, by context, with no rule written for one
  add-on.
- Reuse existing systems rather than build a second one.
- Add regression tests that existing behaviour is intact.
- Where a new effect conflicts with an existing enhancement, the existing one wins: the new effect
  adapts or is skipped there.
- One increment at a time, each validated against what exists before the next.

## What already exists

| System | File | What it owns |
|---|---|---|
| View shudder | `src/newer/render/v_shamblersteps.js` | The eye's shake at a Shambler's heel strikes (eye only; aim and physics untouched). Applied in `V_CalcRefdef`. |
| Marks | `src/newer/render/r_decals.js` | Bullet holes, scorches, blood spray and pools, where gibs land (`R_DecalGibTrack`, `R_DecalGibLanded`), finding the surface at a point (`R_DecalSurface`). |
| Shotgun | `r_shotgun.js`, `r_shells.js`, `r_wallburn.js`, `gameplay/sv_shotrays.js` | Pellets, casings, underwater bubbles and smoke, wall burns. **Excluded.** |
| Lightning gun | `r_lightning.js`, `r_wallburn.js` | The beam and its burn. **Excluded.** |
| Explosions | `r_fireball.js`, `r_smoketrail.js` | Rocket and grenade fireball, trails. |
| Other projectiles | `r_venom.js` (Scrag), `r_lavaballs.js` (Death Knight; lava balls keep their model, thin smoke trail), `r_stasisbolt.js` (laser) | Their flight and their impacts. |
| Liquids | `r_post_liquids.js`, `r_waves.js`, `r_impactripples.js`, `r_mist.js`, `r_screendrops.js` | Newer liquids, real ripples where things cross a surface (nails included), vapour over toxic pools, drops on the lens. |
| Fire | `r_torchfire.js`, `r_powerupfire.js` | Torch flames with embers and smoke. |
| Light and sky | `r_post_lights.js`, `r_post_sky.js`, `r_pointshadows.js`, `r_heightshadows.js`, `engine/render/r_fog.js`, `r_skybox.js` | The level's light list, the sun (`_sun_mangle`), shadows, fog, skyboxes. |
| Classic particles | `src/engine/render/r_part.js` | Quake's own particles. |
| Sound | `src/engine/sound/snd_dma.js` | Leaf ambients (water and sky played; slime and lava levels are loaded and never played), static sounds, entity sounds. |
| Controller | `src/platform/in_web.js` | Gamepad polling and bindings. No vibration, no wheel, no prompts. |
| Switches | `src/engine/client/menu_options.js` | Options, Newer features: 17 rows, which fill the page. |

There is no texture-to-material table yet, and no synthesized sound.

## Where the 14 run

Every landed enhancement runs in Newer Game only; New Game is the original in every respect, and the
Options page says so. The 14 follow that: **Newer Game, in every supported game**. Two are map data
rather than enhancements and apply to both pictures, as fog does: per-map sky fog (12) and the
per-liquid see-through keys (13).

Each effect takes its cue from something every game already sends or stores (a temp-entity message,
a static sound, a model's frame names, a map's leaf data or worldspawn keys), never from the name of
a game or add-on. Where a game does the same thing itself, the engine stands back, decided from what
that game loads: for example, a game that precaches its own footstep sounds plays its own footsteps.

## The 14, one by one

| # | Effect | Cue (what it listens to) | Reuses | Must not touch | Switch |
|---|---|---|---|---|---|
| 1 | Footsteps | The player's own movement on the ground (the view bob's cycle); other players' and monsters' walk and run frames, as the Shambler shudder reads them | The frame-name reading of `v_shamblersteps.js`; the material table of 2; `S_StartSound` | The Shambler shudder (same heel strikes, sound added, shake unchanged); a game's own footsteps (skipped when it precaches step sounds) | `s_footsteps` |
| 2 | Surface-aware impacts | Nails hitting a wall (`TE_SPIKE`, `TE_SUPERSPIKE`), the player landing | One new table, texture name to stone, metal, wood, glass, earth, liquid; `R_DecalSurface` to find the surface | `TE_GUNSHOT` and the lightning beam: untouched | `s_materials` |
| 3 | Screen shake | `TE_EXPLOSION`, `TE_EXPLOSION2`, `TE_TAREXPLOSION`, `TE_LAVASPLASH` | The Shambler shudder's place in `V_CalcRefdef` and its rules (eye only; off in demos, pauses, menus, death) | The Shambler shudder itself: unchanged, and a test proves its values are the same with this present | `v_blastshake` |
| 4 | Lava ambient sound | The lava (and slime) levels each map leaf already stores | `S_UpdateAmbientSounds`, which already fades water and wind by leaf | Water and wind ambients: unchanged | `s_lava` |
| 5 | Wind gusts, thunder, lightning flashes | A map's own thunder sound (`ambience/thunder1.wav` as a static sound) and its sky leaves | Stock `windfly.wav` and `thunder1.wav`; the sky materials' glow; the Newer sun | The sky's fog share, the skybox, cloud shadows | `r_storm` |
| 6 | Visible drips | The static sound `ambience/drip1.wav` (wherever a map plays it) | `r_impactripples.js` when a drop lands in a pool; one shared small-particle layer with 7 and 8 | Ripples from shots and bodies | `r_drips` |
| 7 | Visible sparks | The static sound `ambience/buzz1.wav` (sparking lights) | The shared layer of 6 (no dynamic light: a full light list could lose an existing weapon or fixture light) | Fixture lights | `r_sparks` |
| 8 | Nail impacts | `TE_SPIKE`, `TE_SUPERSPIKE` only | The shared layer (sparks, a puff; bubbles when underwater); the existing hole from `R_DecalShot` stays | `TE_GUNSHOT` (shotgun, laser), the beam, `TE_WIZSPIKE` (venom) and `TE_KNIGHTSPIKE` (fireball): these already have their own impacts | `r_nailhits` |
| 9 | Embers over lava | The map's lava surfaces | The surface sampling `r_mist.js` uses for toxic pools; the shared layer | Heat haze, the mist | `r_embers` |
| 10 | Gibs that sound when they land | The landing `r_decals.js` already detects for its blood mark | `R_DecalGibTrack`; stock sounds | The blood mark | `s_gibs` |
| 11 | Blood running down walls | A large blood mark placed on a wall by `r_decals.js` | The same mesh, picture sheet, colour and fading | Existing marks' look, number and lifetimes; no new blood is made | under `r_decals` |
| 12 | Per-map sky fog | Worldspawn `skyfog`, the `r_skyfog` setting | `r_fog.js` | Fog's distance rule | `r_skyfog` |
| 13 | Small touches | Item boxes; dead monsters on lifts; worldspawn `_sunlight_color`; worldspawn `_wateralpha` and its kin; shadow casters | The draw loop, the server's physics, the Newer sun, Newer liquids | Collision, item pick-up boxes; a map with Newer liquids keeps its Newer look | per touch |
| 14 | Weapon wheel, prompts, vibration | The controller | `in_web.js`; the events of 3 for vibration | Keyboard and mouse play | `joy_*` |

## Overlap audit: what is partly there already

The owner's warning (13 Oct): some of these effects are partly or wholly in the code already, so each
one starts from what exists. The code was searched for every one of the 14:

| # | Already in the code | So the new effect |
|---|---|---|
| 1 | No footstep sound anywhere. The Shambler's heel strikes are found and shake the view. | Adds sound only; uses the same heel strikes for the Shambler and leaves its shake alone. |
| 3 | The Shambler shudder. Damage already kicks the view (Quake's own `v_kick`). | Shakes for explosions only, smaller than a damage kick at range; never changes the kick. |
| 6 | Drops on the lens after leaving water (`r_screendrops.js`); the Scrag's venom runs down walls (`r_venom.js`). No drips in the world. | New, in the world only; does not touch the lens drops. |
| 7, 8 | Sparks belong to the laser, the fireballs and the explosion, each inside its own effect. Nails get Quake's grey puff and a hole (`R_DecalShot`). | Keeps the puff and the hole; adds to them. Nothing for the weapons that have their own impact. |
| 8 | Bubbles and smoke under water exist for the shotgun only. Nails crossing a pool already ripple it. | Own bubbles for nails; the ripple stays as it is. |
| 9 | Embers rise from torches only. Lava has heat haze and its own glow. | New over lava; haze and glow untouched. |
| 10 | Where a gib lands is already found, for its blood mark. | Adds a sound by the same rule (`gib_rest.js`, moved out of `r_decals.js` unchanged); the sound keeps its own watch so a gib out of sight is still heard. |
| 11 | **Blood already sticks.** Spray from a wound marks the wall or floor beyond it; falling blood leaves drops and splashes where it lands; a burst body leaves a pool (`r_decals.js`). All of it darkens the surface under it, lit as the surface is, and wears away. | A run is part of those same marks: only under a large fresh splash on a wall, one thin run, short, slow, in the same colour and from the same picture sheet, fading with its splash. Realism, not more gore: no new blood is made, no dripping from ceilings, no extra spray. The existing marks keep their number and their lifetimes. |
| 13 | The Newer sun reads `_sun_mangle` for its direction only. Liquids' see-through is one setting for all (`r_wateralpha`) in New Game; Newer liquids have their own look. | Colour added beside direction; per-liquid keys feed the existing setting per liquid. |
| 14 | A phone buzzes on a touch control (`navigator.vibrate`, `touch.js`). The controller has none. | Controller vibration only; the phone's is left as it is. |

Nothing was found for 2, 4, 5 or 12 beyond what the table above the audit names.

## Decisions taken here

1. **One shared small-particle layer** (`src/newer/render/r_motes.js`) draws drips, sparks, nail
   puffs and bubbles, and embers: one THREE.Points layer, one shader, one cap, so four effects cost one
   draw. It does not use the shotgun's layers: sharing those would let nails spend the shotgun's
   bubble and smoke budget.
2. **The screen shake stays a separate module from the Shambler's**, added after it in the view.
   The Shambler's file is not edited. They can add up; each keeps its own limit.
3. **The Options page becomes a scrolling list** so each effect can have its switch. The first 17
   rows keep their places.
4. **Sounds that stock Quake does not have** (footsteps, material impacts, lava) are the one open
   question: see below. Thunder, wind and gib sounds use stock files.

## The owner's ruling on sounds stock Quake lacks

Footsteps (1), material impacts (2) and the lava ambient (4) need sounds that are not in Quake's own
files. The owner chose (13 Oct 2026): **short sounds generated by the engine, through the existing
sound cache and mixer**; a game's own file of the same name always wins. Thunder, wind and gib sounds
use stock files.

## Findings of the earlier architecture review (13 Oct 2026)

An independent review of this plan found parts of the 14 already in the code or constrained by it:

- **13, small touches:** corpses already ride moving floors (`sv_phys.js`, `groundentity`, including
  `SOLID_NOT` corpses); dynamic shadows already include models, brush entities and axe pieces
  (`r_post_shadows.js`); items already rotate (`EF_ROTATE`, `cl_main.js`). Nothing new is built for
  these without a failing reproduction. Per-liquid see-through must be resolved once and used by
  every draw path (`gl_rsurf_world.js`, `gl_rsurf_liquids.js`, the classic comparison pass) beside
  `R_LiquidOpacity`; a per-map sun colour must reach every sun consumer (`r_post_lights.js`,
  `r_post_sky.js`, `r_post_shadows.js`) and reset on a new map.
- **1 and 2:** `R_DecalSurface` is not a ground or material query (it picks the nearest plane in the
  current leaf, skips liquids and moving brushes); use its `accept` test for floors and the world's
  contents and traces. Glass is known by its pixels (`r_newertextures.js`), not its name. The
  Shambler's heel strikes are measured for the Shambler only, not a general monster footfall rule.
- **4:** the lava and slime ambient channels already exist in `S_UpdateAmbientSounds`; only water
  and sky have sounds.
- **5:** a map's thunder sound gives a place, not a time; flashes need their own timing rule.
- **10:** the sound keeps its own watch of each gib, by the blood mark's rule, so it still works with
  marks off and for gibs out of sight (done: `gib_rest.js`).
- **11:** a run is added inside the splash's own slot; the splash itself never moves or grows (done).
- **14:** extend the existing controller path in `in_web.js` (pad assignment, key release, menus, XR);
  no second poller.

## Regression checks

- Each increment's test drives the public entry points and, where it sits beside a landed effect,
  asserts that effect's output is unchanged with the new one on and off.
- A standing test (`tests/addon_effects_guard_test.js`) fixes what must not change: `TE_GUNSHOT` and
  the lightning beam take exactly the calls they took before; the shotgun's, casings', wall burn's
  and lightning's files are not imported by any of the new modules; the Shambler shudder's samples
  are identical with the blast shake present.
- The existing suites for the neighbours are run with each increment (`shambler_steps_test.js`,
  the shotgun, wall burn, decal, ripple, mist and torch tests).

## Order of building

1. Sky fog (12) and the scrolling Options page.
2. Screen shake (3).
3. The shared layer, then drips (6), sparks (7), nail impacts (8), embers (9).
4. Blood runs (11) and gib sounds (10).
5. Storms (5).
6. The small touches (13).
7. Controller (14).
8. The material table, then lava ambient (4), impacts (2) and footsteps (1), once the sound question
   is ruled.

## Independent architecture review, 13 October continuation

The review confirmed the implementation order but found these integration requirements. These are
source findings, not proof that the remaining effects have been implemented or accepted.

- Corpse transport on moving floors already exists in both pusher paths in `sv_phys.js`, including
  `SOLID_NOT` corpses. Item rotation already uses `EF_ROTATE` in both client paths. Reproduce a missing
  user-visible case before changing either; do not introduce new server physics for a visual enhancement.
- `R_DecalSurface` is a world-leaf surface query, not a floor trace; it excludes liquid surfaces and does
  not transform moving brush faces. Material classification must reuse the existing contents/hull trace
  and preserve this decal contract, plus the pixel-qualified glass identity in `r_newertextures.js`.
- Gib-rest detection currently runs while aliases draw and stops when `r_decals` is off. Reusing it for
  sound requires one detector with separately gated consumers, without making `s_gibs` depend on decal
  visibility. Its observed-rest heuristic must not be described as exact physical contact.
- A blood run must preserve the original splash's geometry and samples, surface clipping, ring slot and
  lifetime. Do not stretch the randomly rotated whole decal or spend a second ordinary decal slot.
- The 512-slot mote ring needs saturation checks before nails or lava join: a new effect must not erase
  accepted drips/sparks. Keep one renderer and bounded admission rather than another particle system.
- Per-liquid alpha must select consistent opacity and draw passes in world, moving brush and Classic
  comparison rendering. Newer liquid appearance keeps its existing `R_LiquidOpacity` precedence.
- Per-map sun colour must reach the existing surface, shaft and height-shadow consumers together;
  absence of the key and map changes restore the current sky-derived colour.
- Controller work extends the selected controller in `in_web.js`, preserving local-play assignments,
  source-owned key releases and XR handover. Wheel/vibration state must cancel on disconnect and mode
  transitions; do not add a parallel poller.
- Shambler contacts are measured for that model, not a generic footfall classifier. Thunder placement
  is a location, not playback timing; flashes must synchronize with the existing sound event.

The first sky-fog review found numeric polling missed changed cvar strings and multiple writes between
frames. Public command and actual GPU probes reproduced it before correction. The next blast-shake
review found the old clock survived a map/restart reset; menu tests also bypassed an unregistered
command and accepted a no-op touch. Those findings remain required corrections before its commit.
