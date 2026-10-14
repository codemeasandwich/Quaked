# Newer Game's gameplay on the re-release's QuakeC, 14 October 2026

## What was wrong

The owner, trying the Mac app on 14 October 2026: "the ripple effect from portals and liquid surfaces is missing, the
player's face does not fill with water underwater, the shotgun is missing its projectiles, and more".

The app plays the owner's own Quake (`~/quaked/Quake/pak0.pak`), which is the 2021 re-release. Its `progs.dat` has the
whole-file CRC 59507. Every one of Newer Game's gameplay hooks demanded the CRC of id's 1.06 `progs.dat` (24778) and
switched itself off for anything else, silently. The source build's trials ran the 1.06 QuakeC, so they passed while
the app lost, all at once:

- the shotgun's pellets in flight, their wake, smoke and bubbles, and the ripples they make crossing water and the
  level windows (`sv_faceevents.js` records the pellet rays; `r_shotgun.js`, `r_impactripples.js` draw them), and the
  damage arriving with each pellet (`sv_shotdelay.js`);
- the HUD face's water filling as the air runs out, its reactions to damage, rewards and unseen monsters
  (`r_facegame.js`, through `SV_FaceLocalActive`);
- clockwise respawn (`sv_respawn.js`), Rend the Veil (`sv_rendveil.js`), the powered axe's cuts (`sv_axecut.js`),
  quenched fireballs (`sv_firequench.js`), prone zombies (`sv_pronezombie.js`), the melee blood spray
  (`sv_meleespray.js`), the teleport train (`sv_teleporttrain.js`), the Ring's rules (`sv_unseen.js`), the cloak's
  body (`sv_cloak.js`) and the carried powers' sounds (`sv_main.js`).

Found by building the app's own bundle with its modules exposed to a WebKit trial: in Newer Game on e1m1 the shotgun
fired (shells fell) with no pellets and the local-play gate false, every condition true except `pr_crc === 24778`
(it was 59507).

## The fix

One rule, `PR_StockProgs()` (`src/engine/progs/progs.js`), asked by every hook: the loaded QuakeC is stock when its CRC
is in `STOCK_PROGS_CRCS`, 24778 (1.06, the shareware's and the registered game's) or 59507 (the 2021 re-release).

The re-release's QuakeC was compared with 1.06 function by function and field by field: it has 2099 functions to
1.06's 2091, and drops only `CheckSpawnPoint`, `CopyToBodyQue`, `InitBodyQue`, `W_CheckNoAmmo`, `bodyque`, `nopain`
and the field `hit_z` (renamed or replaced: `CopyToBodyQueue`, `InitBodyQueue`, `W_HasNoAmmo`,
`PlayerVisibleToSpawnPoint`...). None of the hooks names any of them. A mod's or mission pack's own QuakeC is still
not stock, as before.

`PR_StockProgs` is kept as a boolean by `PR_SetCRC`, since the hooks ask on every QuakeC call. When Newer Game is on and
the QuakeC is not stock, the server now says so in the console once a map (`SV_SpawnServer`, sv_main.js), so a loss like
this can no longer be silent.

## The same kind of loss elsewhere

- **The exit corridor's fixture lights** (`r_fixturelights.js`): the six cone lights under E1M1's `tlight01` ceiling
  panels admitted only the 1.06 shareware E1M1's bytes. The re-release recompiled E1M1 (1664336 bytes); the same
  geometry checks find the same six panels on the same six helper lights there, so its fingerprint is now admitted too
  (`KNOWN_E1M1`).
- **The re-release's own builtins** (`pr_cmds.js`): its QuakeC declares `finaleFinished` (#79) and `localsound`
  (#80), and calls `finaleFinished` from `finale_5`, at the end of the game, where the port stopped with "Bad builtin
  call number". `finaleFinished` does nothing (the re-release uses it for its achievements); `localsound` plays the
  sound to that one client (`play <sample>`).
- **Checked and unaffected**: every model in the re-release is byte-identical to 1.06's, so the enemy skins apply (the
  seven skins that do not match are Dissolution of Eternity's own); the re-release recompiled e1m1-e1m8 and start,
  and those already have their own `id1` rock relief, sculpted surface and relief-sample rows, which match the owner's
  files exactly; the maps' textures are pixel for pixel the same; the progdefs header CRC is 5927 in both, so globals
  and entity fields are laid out alike; no other identity gate exists in src.

Testing note. The source build mounts the owner's Quake first and the shareware above it, "so bundled identities always
win" (main.js): it runs the 1.06 QuakeC and the shareware's Episode 1. The app mounts the owner's game alone. That is
why the source build's trials passed while the app lost these features; app behaviour has to be tried in the app's
own bundle.

## Checks

- `tests/stock_progs_test.js`: the two CRCs are stock and others are not; on the re-release's CRC the Ring, prone
  zombie, fire quench and respawn gates open in a local Newer Game and stay shut on another CRC; builtins #79 and #80
  are installed (#78 unchanged); no hook compares the CRC itself; the owner's Quake's QuakeC is stock and has every
  QuakeC function the hooks name (with `QUAKED_GAME_ROOT`; otherwise `resources/id1`, skipped when absent).
- `tests/fixture_lights_rerelease_test.js`: the re-release E1M1 is admitted and gives six downward cones from the same
  six helpers; a changed byte is not admitted. `tests/fixture_lights_test.js` (1.06) unchanged.
- The hook suites (each loads the 1.06 shareware) pass. The independent review also ran copies of 19 real-engine suites
  over the owner's re-release pak: shotgun, face, face alerts, respawn (six suites), the Ring, prone zombies, melee spray,
  quad movement, power vision and quad vision all pass; fire quench and the axe pass once two fixtures written for the
  1.06 geometry are moved; Rend the Veil, the cloak and the teleport train were checked against the re-release's QuakeC
  by reading it (their harnesses do not run on the larger re-release maps).
- In the app's own bundle (WebKit, the owner's library, Newer Game, e1m1): `PR_StockProgs` true, and the face, the
  Ring, Rend the Veil, respawn, fire quench and prone zombie gates all open; each blast draws its 6 pellets; the face's
  water state is known. Not seen: the face actually filling under water (the trial could not place the player in
  water), and the owner's own eyes on any of it.
