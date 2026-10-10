# The mission packs: Scourge of Armagon and Dissolution of Eternity (card [34c]), 10 October 2026

## What works

Both of id Software's 1997 mission packs can now be played, in their 2021 re-release form, which is what the owner
has installed:

- **Scourge of Armagon** (hipnotic), from `games/Scourge of Armagon/` or `resources/hipnotic/`.
- **Dissolution of Eternity** (rogue), from `games/Dissolution of Eternity/` or `resources/rogue/`.

On the game shelf their boxes are no longer dimmed: choosing one opens `index.html?game=hipnotic` or `?game=rogue`.
The `game hipnotic` and `game rogue` console commands choose them too. Each runs over Quake, which must be installed,
and keeps its own saves.

## How it works

### Mounting (`main.js`, `game_selection.js`)

A mission pack fetches Quake's pack (as the full game does) and its own `pak0.pak`, the first of its folders that has
one. The packs are mounted in this order:

1. Quake's;
2. the shareware's (as before);
3. the mission pack's, last.

`COM_AddPack` gives the last pack priority, so the mission pack's own QuakeC (`progs.dat`), status-bar pictures
(`gfx.wad`) and maps replace the base game's.

Without Quake's pack, the mission pack is not mounted: the shareware starts, and the console says why
(`GameSelection_ReportStart`).

- **Saves:** each mission pack's are kept under `quake_save_<id>_`, because its maps reuse Quake's names, such as
  `start`.
- **Newer Game's start map:** `newer/maps.pak` replaces id1's `start.bsp`, so it is not applied for a mission pack,
  which keeps its own start map.
- **Prepared data:** Newer Game's rock and demon bakes are matched by each BSP's SHA-256, so a mission pack's
  `start.bsp` never picks up those made for id1's.

### The switches (`common.js`)

As in WinQuake's `COM_InitArgv`:

- `-hipnotic` sets `hipnotic`, and `-rogue` sets `rogue`;
- either one clears `standard_quake`.

`main.js` passes the chosen pack's switch once its pack is mounted. `argv[0]` is the program name and is never read
as a switch.

These flags drive what was already ported for mission packs:

- the client-data message: with a mission pack, the active weapon is sent as a bit number, both by `sv_main.js` and
  in `cl_parse.js`.

They also drive what this card ports from WinQuake.

### Ported from WinQuake

- **The status bar** (`sbar.c` → `sbar.js`), for Scourge of Armagon:
  - the Laser Cannon and Mjolnir;
  - the grenade launcher's slot shared with the Proximity Gun, with their own five flash frames;
  - the wetsuit and empathy shields (item bits 24 and 25, as `sbar.c` reads them);
  - the keys drawn on the bar instead of in the inventory row.
- **The status bar**, for Dissolution of Eternity:
  - its two inventory bars (one for its powered-up weapons);
  - the Lava Nailgun, Lava Super Nailgun, Multi-Grenade, Multi-Rocket and Plasma Gun over the ordinary slots;
  - its own armour bits, and its lava-nail, multi-rocket and plasma ammunition icons;
  - the shield and anti-grav items;
  - no sigils;
  - in CTF teamplay (4 to 6), the team-colour face.
- **The pictures** come from each pack's own `gfx.wad`, under `sbar.c`'s names: `inv_laser`, `inva1_prox`,
  `r_invbar1` and the rest.
- **The give command** (`host_cmd.c` → `host_cmd.js`): `give 9` gives the Laser Cannon, `give 0` Mjolnir and
  `give 6a` the Proximity Gun. For Dissolution, `s`, `n`, `l`, `r`, `m`, `c` and `p` set its separate ammunition
  fields (`ammo_shells1`, `ammo_lava_nails`, `ammo_multi_rockets`, `ammo_plasma` and so on), and the current kind.
  Digits 0 to 9 are taken, as WinQuake takes them.
- **Level Select:** the packs' own episodes and maps, from `menu.c`'s `hipnoticlevels`/`hipnoticepisodes` and
  `roguelevels`/`rogueepisodes`. Quake's maps are not offered under a mission pack, although Quake's pack is mounted.

### What the re-release QuakeC needed

The re-release packs' `progs.dat` call only built-ins up to #80, which the engine already has for the re-release
id1. They read two cvars the re-release's own engine registers, `campaign` and `sv_cheats`. Both are now registered
(as 0), which stops the "Cvar_Set: variable campaign not found" lines.

## Checks

- `tests/mission_pack_test.js` (4 tests):
  - the switches, with `argv[0]` never one;
  - Scourge's status bar (each picture by name and place);
  - Dissolution's status bar;
  - Level Select under Scourge over a synthetic pack: its episodes and maps, not e1m1; standard Quake's maps again
    afterwards.
- `tests/game_catalogue_test.js`:
  - a mission pack missing its `gfx.wad` and start map is not playable, and says so;
  - on a second site with Quake and both packs whole, both are playable;
  - where Quake is not found, they are not.
- `tests/game_selection_test.js`:
  - choosing Dissolution: Quake under it, its own pack and switch, saves of its own;
  - Scourge refused while the catalogue does not call it playable;
  - an episode (Dimension of the Past) still refused.
- `tests/game_shelf_test.js`: `?game=hipnotic` chooses Scourge.
- **Browser trials** (Playwright, Chromium, `tools/serve.py`, the owner's re-release packs), with no page errors and no
  engine errors:
  - **Scourge:**
    - `?game=hipnotic` set `hipnotic`, and its own `start.bsp` loaded (1,770,848 bytes, not id1's 1,554,500).
    - `give 9`, `give 0` and `give 6a` gave the Laser Cannon, Mjolnir and the Proximity Gun, drawn in their slots.
    - hip1m1 and hip2m1 loaded and played with the Laser Cannon active, shown on the view model and the status bar.
  - **Dissolution:** `start` and r1m1 loaded. `impulse 9` gave its weapons and ammunition. Its own inventory bar, lava
    nails, multi-rockets and plasma showed.
  - **The shelf:** both boxes playable, and choosing Scourge opened `?game=hipnotic` with the switch set.
  - Screenshots: `/tmp/claude-qk/mission-*.png`.

## Not done

- **Newer Game's own HUD art** for the mission packs' weapons. The classic status bar draws them, from the packs'
  own pictures.
- **The episodes and add-ons** (Dimension of the Past, Dimension of the Machine, Arcane Dimensions, Quoth, Malice,
  X-Men, Abyss of Pandemonium). They need their own checks (BSP2 and FitzQuake-protocol maps, and more), and stay
  "not playable yet".
- **Games added from a folder** (mounting packs from the player's own files).
- **A full play-through** of each pack. The first levels load and play. QuakeC paths only later levels reach (the
  packs' end bosses, rotating brush entities) are not yet exercised.
