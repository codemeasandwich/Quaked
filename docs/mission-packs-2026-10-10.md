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
(`GameSelection_ReportStart`: "it needs Quake, whose pack was not found"). Both packs are fetched at once, so in that
case the mission pack's download is wasted (79.9 MB for Scourge, 44.5 MB for Dissolution). The alternative, fetching
it only after Quake's arrives, would slow every normal start.

- **The game running.** `main.js` records the game that actually started (`GameSelection_SetRunning`), before
  `Host_Init` reads the configuration. That is the choice, or what ran instead when a pack was missing.
- **Saves:** each mission pack's are kept under `quake_save_<id>_`, because its maps reuse Quake's names, such as
  `start`. The prefix follows the game running: a mission pack chosen without its pack runs Quake, with Quake's
  saves, so a pack's saves never load into another game. (All three progs.dat files have CRC 5927, so the save's
  CRC could not tell them apart.)
- **Settings and key bindings:** each mission pack keeps its own configuration under `quake_config_<id>`
  (`GameSelection_ConfigKey`), as WinQuake keeps a `config.cfg` per game folder.
  - Scourge's own `default.cfg` binds 9 and 0 to the Laser Cannon and Mjolnir.
  - The shared `quake_config` saved by Quake (whose 0 is `impulse 0`) would override that, and Scourge's bindings
    would leak back into Quake.
  - Quake and the shareware keep the original `quake_config`, and the default (no choice made) keeps the original
    keys whatever runs.
  - **A first run** of a mission pack, before its own configuration exists, starts from Quake's, as WinQuake falls
    back to id1's `config.cfg`. The player's keys and settings are kept, and the pack's own `default.cfg` binds are
    applied over them.
  - Checked in the browser: a returning player's custom `k` (jump), volume 0.3 and sensitivity 7 were all kept on
    Scourge's first run, with 0 and 9 bound to Mjolnir and the Laser Cannon.
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
  - in CTF teamplay (4 to 6), the team-colour face, checked first as in WinQuake, so it shows in Newer Game too.
- **The pictures** come from each pack's own `gfx.wad`, under `sbar.c`'s names: `inv_laser`, `inva1_prox`,
  `r_invbar1` and the rest.
- **The give command** (`host_cmd.c` → `host_cmd.js`): `give 9` gives the Laser Cannon, `give 0` Mjolnir and
  `give 6a` the Proximity Gun. For Dissolution, `s`, `n`, `l`, `r`, `m`, `c` and `p` set its separate ammunition
  fields (`ammo_shells1`, `ammo_lava_nails`, `ammo_multi_rockets`, `ammo_plasma` and so on), and the current kind.
  Digits 0 to 9 are taken, as WinQuake takes them.
- **Level Select:** the packs' own episodes and maps, from `menu.c`'s `hipnoticlevels`/`hipnoticepisodes` and
  `roguelevels`/`rogueepisodes`. Quake's maps are not offered under a mission pack, although Quake's pack is mounted.

### One hardening

With a mission pack, WinQuake sends the active weapon as its bit number, and writes nothing at all when the weapon is
0. That leaves the client reading the next message's byte. `sv_main.js` writes 0 then instead. The client reads 0 as
bit 0, the shotgun, so a weaponless player shows the shotgun as active: a cosmetic slip instead of a broken message.

### What the re-release QuakeC needed

The re-release packs' `progs.dat` call only built-ins up to #80, which the engine already has for the re-release
id1. They read two cvars the re-release's own engine registers, `campaign` and `sv_cheats`. Both are now registered
(as 0), which stops the "Cvar_Set: variable campaign not found" lines.

The re-release `quake.rc` also sets `scr_usekfont` (its own font). It is registered and kept, so the line is no longer
an unknown command. This engine keeps Quake's font.

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
- `tests/mission_pack_test.js` also covers Dissolution's team-colour face in CTF teamplay: `r_teambord` is drawn in
  the face's place.
- `tests/give_mission_native_test.js` (2 tests), on the actual native server:
  - Scourge: `give 9`, `0` and `6a` give its weapons, `6` the grenade launcher, and standard Quake's 9 is unchanged;
  - Dissolution, with the owner's own QuakeC: `n`, `l`, `m`, `p` and `s` set its own ammunition fields, and the
    current count by the weapon held. This case is a named skip where `resources/` is absent.
- `tests/game_selection_test.js` also covers:
  - saves and settings follow the game running, and the default keeps the original keys;
  - both "could not start" reports.
- `tests/startup_preload_test.js`, a mission pack through the real `main.js`:
  - mounted after Quake and the shareware;
  - its switch set after mounting and before Host_Init;
  - it runs, and Newer Game's start map is left out;
  - without Quake: not mounted, no switch, the shareware runs.
- `tests/game_catalogue_test.js` also covers both mission packs whole with no Quake: found, validated, not playable,
  with the "needs Quake" reason.
- **Browser trials** (Playwright, Chromium, `tools/serve.py`, the owner's re-release packs), with no page errors and no
  engine errors:
  - **Scourge:**
    - `?game=hipnotic` set `hipnotic`, and its own `start.bsp` loaded (1,770,848 bytes, not id1's 1,554,500).
    - `give 9`, `give 0` and `give 6a` gave the Laser Cannon, Mjolnir and the Proximity Gun, drawn in their slots.
    - hip1m1 and hip2m1 loaded and played with the Laser Cannon active, shown on the view model and the status bar.
  - **Dissolution:** `start` and r1m1 loaded. `impulse 9` gave its weapons and ammunition. Its own inventory bar, lava
    nails, multi-rockets and plasma showed.
  - **The shelf:** both boxes playable, and choosing Scourge opened `?game=hipnotic` with the switch set.
  - Screenshots: `docs/evidence/mission-packs/hipnotic-hip1m1-2026-10-10.jpg` and `rogue-r1m1-2026-10-10.jpg`. They show the
    owner's commercial packs. Whether they stay in a public repository is the owner's call (the distribution
    policy: possession is not a right to redistribute).

## Not done (follow-ups recorded on the board)

- **Online rooms do not carry the game.** A remote player joining a mission-pack room on plain Quake would lack its
  maps and read the active weapon the standard way. Local play's windows do carry it (`&game=`).
- **Texture upgrades by name.** Newer Game's texture upgrades match by name, and Scourge's `metal5_6` has different
  pixels from id1's, so it gets id1's upgrade. Rogue has no such clash.

- **Newer Game's own HUD art** for the mission packs' weapons. The classic status bar draws them, from the packs'
  own pictures.
- **The episodes and add-ons** (Dimension of the Past, Dimension of the Machine, Arcane Dimensions, Quoth, Malice,
  X-Men, Abyss of Pandemonium). They need their own checks (BSP2 and FitzQuake-protocol maps, and more), and stay
  "not playable yet".
- **Games added from a folder** (mounting packs from the player's own files).
- **A full play-through** of each pack. The first levels load and play. QuakeC paths only later levels reach (the
  packs' end bosses, rotating brush entities) are not yet exercised.
