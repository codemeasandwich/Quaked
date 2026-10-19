# Hexen II on the unified host

Status: **approved architecture, in implementation** (owner, 19 October 2026: "I approve and it's okay to do a big
bang as the faster we get this finished the better"). This document supersedes the architecture sections of
[the support plan](../hexen2-support-plan.md) (§3 session host, §5 private 1019 protocol and in-process loopback,
§7 per-module counterparts). The plan's verification contracts still apply where they do not depend on the retired
parallel host: protocol family chosen before decoding (R02), unsigned operands and the Hexen call ABI (R24),
transactional saves (R03), bounded errors instead of no-ops (R14), public RED/GREEN evidence (R04).

The review that led here is recorded in the conversation of 19 October 2026 and summarised in
[§9](#9-why-the-parallel-host-is-retired).

## 1. Goal

Full Hexen II, its demo and Portal of Praevus run in the same engine as Quake: one host, one server, one client,
one progs VM, one renderer, one mixer, one menu/console/options stack. Every enhanced (Newer) feature that is not
specific to Quake content applies to Hexen II through data, never through a second code path.

## 2. Rules

1. **One host.** A Hexen II game starts through `Host_Init` and runs on `Host_Frame`, `SV_SpawnServer`, the
   loopback/net channel, `CL_ReadFromServer`, the console, menus and options. `main.js` has no game-specific early
   return.
2. **One game profile, chosen once at mount.** `src/engine/common/game_profile.js` holds the active profile. It is
   set from the selected catalogue game before packs are mounted and confirmed by the progs header CRC in
   `PR_LoadProgs` (Hexen II 38488 for the base and demo layout, 26905 for Portal; 14046, v1.03, is unsupported). Portal of Praevus is a `portals`
   flag on the Hexen II family, not a third family.
3. **One protocol, one builtin table.** (Owner, 19 October 2026: "this is our implementation so there's no reason
   why we cannot standardise the network code".)
   - *Protocol*: Quaked talks only to Quaked, so live play for every game uses one Quaked protocol: the existing
     extended protocol (`PROTOCOL_LARGE`, 1015) grown with optional entity bits (`scale`, `drawflags`, `abslight`,
     wider model index; Quake defaults 1/0/0) and new message ids for Hexen-only data (client effects, the
     inventory/stats record, plaques, rain, view tint/flags, MIDI name, puzzle and objective state). Entities use
     Quake's per-packet updates; Hexen's reference-frame deltas are not used. Native formats survive only as
     read-only demo decoders that translate into the unified messages: Quake protocol 15 (as today) and Hexen II
     18/19 (`demo1`–`demo3.dem`). There is no native Hexen II server or client interoperability.
   - *Builtins*: the numbers are compiled into the retail `progs.dat`, so they cannot change. One shared table holds
     every number whose meaning is the same in both games (`#1–59`, `#67–78`); a Hexen layer supplies `#60–66` and
     `#79–114` and the few shared numbers whose native behaviour differs (`traceline` hull 0, `aim` shot origin,
     `walkmove` trace flag, `makestatic`/`ambientsound` fields). The only true collisions are `#79`/`#80`
     (Quake 2021 re-release `finaleFinished`/`localsound` vs Hexen `plaque_draw`/`rain_go`), resolved by the profile.
4. **Parameters, not copies.** Shared algorithms read profile data (hull table, limits, frame time, string-temp
   size, pack search). Hexen II behaviour inside shared code is a branch on values Quake never produces (Hexen
   movetypes 13/14, `SOLID_PHASE`, 8-hull BSPs, RAPO models, non-zero `drawflags`), so Quake behaviour is unchanged
   by construction. No module-global mode toggles.
5. **Progs fields by name.** Engine-visible globals and entity fields that differ between layouts are resolved by
   name at progs load (`ED_FindField` / `ED_FindGlobal`), never by hard-coded offset.
6. **Additive leaf modules.** Hexen-only subsystems (client effects, beams, chunks, rain/snow, extra particle types,
   status bar art/layout, class and difficulty menu pages, plaques, intermission, strings/puzzles/infolist/maplist,
   MIDI) are their own modules, reached only from the Hexen parser, profile or menu pages.
7. **Enhanced features read bindings from the profile.** No `progs/…` model paths, Quake sound names or Quake map
   names in `src/newer`; Quake's current literals become the Quake profile's bindings. `newer.pak` and loose Newer
   files are scoped to the games they were built for.
8. **Hub semantics are native.** `changelevel2`, per-level state, `ClientReEnter`, `stats_restored`, archived
   effects and spawn parms behave as in the original engine, stored through Quaked's save repository (IndexedDB with
   the existing fallback). `.gip` import is optional future work.
9. **Gamecode.** The installed `progs.dat` is the default. The jsHexen2 corrected Portal gamecode remains an
   optional, pinned overlay.

## 3. Seams (the code contract)

| Seam | Module | Quake implementation | Hexen II implementation |
| --- | --- | --- | --- |
| Active profile | `common/game_profile.js` | `GAME_PROFILES.quake` (default) | `GAME_PROFILES.hexen2` with `portals`/`demo` flags |
| Profile selection | host start (`main.js` → `Host_Init`) | catalogue/shelf id | the same; class and skill are cvars (`_cl_playerclass`, `skill`) set by the Hexen menu pages |
| Builtins | `progs/pr_exec.js` dispatch through `PR_SetBuiltins( table )` | `pr_cmds.js` table | the same table with the Hexen layer from `progs/hexen2_*_cmds.js` applied |
| Server writer | `server/sv_main.js` | existing functions | the same functions writing the unified protocol's optional bits and Hexen message ids when the game produces that data |
| Client parser | `client/cl_parse.js` | existing `CL_ParseServerMessage` | the same parser; Hexen-only messages handled in `client/cl_hexen2.js`, writing the shared `cl` state plus `cl.h2` (inventory/stat record) |
| Native demos | `client/cl_demo.js` | protocol 15 reader (today) | `client/cl_hexen2_demo.js`: translates protocol 18/19 demo messages into unified messages |
| Hull table | `render/gl_model_bsp.js` per model | 4 hulls, read from the BSP | 8 headnodes when the submodel lump size says so; sizes from the profile (`portals` changes hull 4) |
| Physics | `server/sv_phys.js`, `world.js`, `sv_move.js`, `sv_user.js` | unchanged | branches on Hexen movetypes/solids/flags/hull fields |
| Entity state | `cl_entities[i]` | `drawflags = 0`, `abslight = 0`, `scale = 1` | values from the Hexen parser |
| HUD | `client/sbar.js` → `Sbar_Draw` | Quake bar | `client/hexen2_statusbar.js` (+ draw helpers) through the profile |
| Menus | `client/menu_*.js` | Quake pages | Hexen class and difficulty pages registered by the profile |
| Saves | `server/host_cmd.js` + save repository | Quake save | native hub semantics, same repository |
| Enhanced bindings | `src/newer/**` reads `GameProfile_Bindings()` | today's literals | Hexen table (model dir `models/`, torches, effects, sounds, power states, textures) |

## 4. Work packages

Each package is implemented on its own branch from `hexen2-unified`, owns the files listed, and must leave Quake's
existing suites green (`node tools/run_tests.mjs` with the maintained suites, `npm run test:distribution`, native
library contracts). Packages communicate only through the seams in §3 and the native protocol definition in
`common/hexen2_protocol.js`.

| ID | Package | Owns | Depends on |
| --- | --- | --- | --- |
| U0 | Profile, seams, builtin registration, de-fork `main.js` | `game_profile.js`, `sv_protocol.js`, seam hooks in `pr_exec.js`, `cl_parse.js`, `host.js`, `main.js` | — |
| U1 | Unified protocol (server and client) | `common/protocol.js`, `sv_main.js`, `cl_parse.js`, `cl_hexen2.js`, `host_cmd.js` spawn | U0 |
| U2 | Native Hexen demo decoder and client entity semantics | `cl_hexen2_demo.js`, `cl_main.js` Hexen relink/EF bits | U1 (message ids) |
| U3 | Builtins: fixes and the 17 missing | `progs/hexen2_*_cmds.js`, strings/puzzles/infolist loaders | U0 |
| U4 | Physics and traces | `sv_phys.js`, `world.js`, `sv_move.js`, `sv_user.js` | U0 |
| U5 | Input, status bar, menus, console | `cl_input.js` Hexen commands, `sbar.js` seam, Hexen menu pages | U0, U2 |
| U6 | Entity render semantics | `gl_rmain.js`, `gl_mesh.js`, alias skin modes, `*rtex078` | U2 |
| U7 | Enhanced features for every game | `src/newer` bindings, `pak.js` Newer scoping, Hexen texture index | U0 |
| U8 | Effects and particles | `client/hexen2_effects_*`, `r_part.js` Hexen types, beams | U2 |
| U9 | Hubs, saves, intermission, music, demos | `host_cmd.js` Hexen branches, save repository, intermission/finale, MIDI, demo playback | U1, U2 |
| U10 | Retire the parallel host | delete `hexen2_page.js`, `_boot`, `_session`, in-process wire copy, unused modules and their tests | U1, U2, U5 |

## 5. Acceptance

- Quake: every maintained suite unchanged and green; the shareware and a mission pack start, play and save.
- Hexen II base, demo and Portal start from the shelf through the shared host; `demo1` → village hub travel and
  back, with combat, weapon switching, artifacts, centerprint text, light styles, statics, ambient sounds, music
  and saves; the enhanced options visibly apply.
- Native `demo1.dem`–`demo3.dem` play back through the demo decoder.
- Owner trial in the packaged app before any release; each milestone cut as a release under the existing rule.

## 6. Pinned references

uHexen2 `475c048b1c8b0806b8585f5cd2715f3ad60bf393` (canonical behaviour), Raven source
`eac5fd50832ce2509226761b3b1a387c468e7a50`, jsHexen2-progs `621f4a9b0f0ff776610ecc4f459aa2b3c0bcdcdf`, jlquake
`69498ea1ea09482b096f06ab7b433e715b7802a8`, UQE Quake `05e1285887683cb235a1a29cb625d72df2a0bcf2` / Hexen II
`333c0b30c410e9416f9f26d19eba3eb9e7e1fc52` (comparison only; protocol 20 and its limits are excluded), FTEQW
(design reference). Read-only clones are kept outside the repository.

## 7. Known defects carried into U3/U4 (verified against uHexen2)

- Builtins 56/57 swapped (`hexen2_server_cmds.js`): native 56 = WriteCoord, 57 = WriteAngle.
- Effect slots never expire (`expire: 0`); native expiry is 1, 3 or 10 s by type (`sv_effect.c`).
- Movetype 13 modelled as "PHASE"; native 13 = PUSHPULL (step physics), 14 = SWIM (toss); `SOLID_PHASE` (5) absent.
- `makestatic` writes the frame as a short and omits scale/drawflags/abslight.
- 17 builtins unimplemented: centerprint, tracearea, dprintf, dprintv, particle2, particleexplosion, particle3,
  plaque_draw, rain_go, getstring, localcmd, setspawnparms, doWhiteFlash, updatesoundpos, coredump/traceon/traceoff.
- Checks to verify while porting: single-player class filtering of spawnflags, worldspawn `message` as a
  `strings.txt` index, the light-style rate prefix (`1`/`2`/`3`), model lighting at mid-height, the Portal hull-4
  size, per-trace hull-0 overrides, `rint` ±0.1.

## 8. Coordination

Bluey returned `storage_error` on 19 October 2026 (correlations `d24795f5…`, `9ddff495…`); until it recovers this
document and the branch history are the ledger. Implementation sub-agents run on DeepSeek V4.1 Flash through the local
DeepSeek Harness (owner instruction, 19 October 2026); the orchestrator reviews and integrates every package.

## 9. Why the parallel host is retired

The `h2` branch ran Hexen II through `hexen2_page.js`, a second host that returned from `main.js` before `Host_Init`,
spawned levels itself and copied edicts into client entities each frame without reading the server's message
stream. As a result centerprint, light styles, statics, ambient sounds, music, intermission and view tints never
reached the player, and `r_hdr` was never set, so no enhanced feature ran. FTEQW and jlquake support both games in
one engine by selecting a game type at load, forking only the protocol parser/writer and builtin table, and keeping
the rest shared; this design follows them.
