# Large maps: Dimension of the Machine plays (card [34f]), 10 October 2026

## What works

**Dimension of the Machine** (MachineGames, 2021; `mg1`) can now be played over Quake. Its box on the game shelf is no
longer dimmed, and it opens at `index.html?game=mg1` (or with `game mg1`). All 20 of its maps load and play in the
browser, with no engine or page errors:

- the start (The Gateway) and the hub (The Machine);
- every level of its dimensions (mge1m1 to mge5m2);
- the final level (mgend);
- its four deathmatch arenas.

Level Select offers them under each map's own name.

## Why it did not before

Its larger levels exceed four of WinQuake's limits at once. For example:

| | WinQuake | mge2m2 | mge5m2 |
|---|---|---|---|
| models precached | 256 (sent as bytes) | 361 | 281 |
| edicts | 600 | 712 | 761 |
| signon | 8192 bytes | 11,985 | 11,553 |
| reliable message (serverinfo, signon) | 8000 bytes | over | over |

## What changed

### The large-map protocol (`PROTOCOL_LARGE` = 1015)

It is protocol 15, with model, frame and sound numbers sent as shorts. It is this port's own: FitzQuake's 666 puts
its new messages at 42 to 44, where this port's `svc_playerinfo` (42) and delta packets (47 to 49) already are. Only
this port's own server and client speak it.

- **When it is used.** A server speaks it when `sv_protocol` is 1015. `SV_SpawnServer` reads that once per map,
  before anything is precached or written. Dimension of the Machine's selection entry asks for it
  (`MISSION_PACKS.mg1.protocol`), and `main.js` sets it after Host_Init, before any map loads.
- **Protocol 15 is unchanged.** Every other game speaks protocol 15, byte for byte as before.
- **How the client knows.** The client reads the protocol from the serverinfo (`cl.protocol`) and accepts either.
- **On the server**, `SV_WriteIndex` writes a byte or a short. It is used for:
  - sounds (`svc_sound`, static sounds);
  - the delta packets' model and frame;
  - playerinfo's frame, model and weapon frame;
  - clientdata's weapon frame and weapon model;
  - baselines and static entities.
- **On the client**, `MSG_ReadIndex` reads the same fields, and the WinQuake update path (`U_MODEL`, `U_FRAME`).

### Limits that follow the protocol

| | Protocol 15 | Large-map protocol |
|---|---|---|
| models (`SV_ModelLimit`) | 256 | 2048 |
| sounds (`SV_SoundLimit`) | 256 | 2048 |
| edicts (`sv.max_edicts`) | 600 | 1024 |
| signon | 8192 bytes | 60000 bytes |

- **Edicts:** 1024 is the most the delta packets' 10-bit entity numbers can name. The precache arrays hold 2048 of
  each.
- **The overflow message** says that a larger map needs `sv_protocol 1015`.
- **Newer Game's level travel** adds its resources within the same limits.
- **Corpses:** Newer Game's axe-cut corpses now cap themselves against `sv.max_edicts`. They used the MAX_EDICTS
  constant, which is now above a protocol-15 server's limit.

### Message size

`MAX_MSGLEN` (a reliable message) rises from 8000 to 64000, QuakeSpasm's value, so a large map's serverinfo and its
signon (sent in one message at prespawn) fit. The client's receive buffer was already 65536 bytes.

### Robustness

- **Running out of edicts.** `ED_Alloc` now checks the server's own limit (`sv.max_edicts`). It compared against the
  MAX_EDICTS constant, so with the constant raised, a protocol-15 server's 601st edict would have run past its table.
  When the table is full it is now a Host_Error, which ends the game and leaves the page able to load another map.
  It was a Sys_Error, which took the page down.
- **A signon overflow** (card [34c]) was already a Host_Error.

## Checks

- **Browser, the real path `?game=mg1`:** start, hub, mge2m2 and mge5m2 loaded and played with `impulse 9`, the server
  on protocol 1015, with no errors.
- **Browser, every map** with the pack mounted over Quake and `sv_protocol 1015`: all 20 loaded. For example, mge2m2
  with 712 edicts, 361 models and an 11,985-byte signon, and hub with 485 static entities.
- **Browser, protocol 15 unchanged:** e1m1 under protocol 15 and under 1015, and e1m3 under 1015, all loaded.
- `tests/large_protocol_test.js` (2 tests), through the server's writer and the real client parser:
  - a baseline with model 300 and frame 260 under the large-map protocol;
  - the same message one byte per field under protocol 15;
  - the limits per protocol.
- `tests/give_mission_native_test.js` adds a native case. On the actual server, the edict limit is 600 under protocol
  15 and 1024 under 1015, and a full table is a Host_Error at exactly the limit.
- `tests/game_catalogue_test.js`, `game_selection_test.js` and `game_shelf_test.js`: Dimension of the Machine is
  playable and can be chosen by URL. Arcane Dimensions is still refused.

## What remains

- **Delta packets** still carry 10-bit entity numbers (at most 1024 edicts) and at most 512 entities per local packet.
  No map here needs more.
- **The add-ons** (Arcane Dimensions, Quoth, Malice, X-Men, Abyss of Pandemonium) are still "not playable yet".
  Arcane Dimensions calls hundreds of FTE/DarkPlaces QuakeC extensions.
