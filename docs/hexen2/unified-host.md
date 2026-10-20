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
document and the branch history are the ledger. Implementation sub-agents ran on DeepSeek V4.1 Flash through the local DeepSeek Harness (owner instruction, 19 October
2026) and, from 20 October, on GPT Sol 6.1 high through the Codex CLI (owner instruction); the orchestrator reviews and
integrates every package.

## 9. Why the parallel host is retired

The `h2` branch ran Hexen II through `hexen2_page.js`, a second host that returned from `main.js` before `Host_Init`,
spawned levels itself and copied edicts into client entities each frame without reading the server's message
stream. As a result centerprint, light styles, statics, ambient sounds, music, intermission and view tints never
reached the player, and `r_hdr` was never set, so no enhanced feature ran. FTEQW and jlquake support both games in
one engine by selecting a game type at load, forking only the protocol parser/writer and builtin table, and keeping
the rest shared; this design follows them.

## 10. Progress ledger (20 October 2026)

All packages U0–U12 are implemented on `hexen2-unified` (local branch, not pushed, not merged to Dev). Every commit
passed the full pre-commit hook (distribution suites, staged desktop build, engine suites 218/218).

| Commit | Package | Content |
| --- | --- | --- |
| `33fe52ef` | merge | `h2` (103 commits + preserved working tree `refs/claude/snapshots/2026-10-19/h2-worktree`) onto Dev |
| `698f0d71` | U0 | one host path (`main.js` has no Hexen fork), one builtin table, BSP hull layout from the file |
| `54406a74` | U4 | native movetypes 11–14, `SOLID_PHASE`, traces, hover/flight/crouch, move chains |
| `a02dd649` | U1 U3 U7 | one protocol (ids 50–71, scale/drawflags/abslight bits), complete builtins, Newer content bindings |
| `66ab7b81` | U2 | native protocol 18/19 demos translated into the unified protocol; Hexen entity effects |
| `0cd14796` | U5 U8 | Hexen input, status bar, menus, console font; all 62 client effects, particles, beams |
| `ebd98e99` | U6 U9 | drawflags/abslight/scale/translucency, skin modes, class colours; hubs, saves, intermission, music |
| `3e9bc6a3` | U10 U11 | parallel host retired (~9,300 lines); packaged music through the scoped library reader |
| `5082d07e` | fix | packaged start: no `SetNewParms` for Hexen; no unreviewed rock relief; packaged-trial tracing |
| `b99b7fb0` | U12 | acceptance coverage on the shared host: every base/Portal map, routes, co-op, soak |
| `72236e8e` | review R1 | Quake temp-string slot, 56-bit stat masks, desktop Level Select, bounce in solid, `playerclass` gating, damaged hub saves, skill 4 |
| `43fbca10` | review R2 / F1 | builtins write unified ids; native `WriteByte` service translation; reserved temp edicts; Portal objectives; full stat resend on level change; animated `lightstylevalue` |
| `e46a77bb` | review R3 / F2 | Hexen never loads Quake beam models (stock `trap_lightning`); puzzle and fractional-timer stat deltas; King of the Hill; out-of-range `lightstylevalue`; native message bodies |
| `0ca3857c` | review R4 / F3 | King of the Hill in native demos and the deathmatch signon; native objective bits in the inventory translator |
| `659b4026` | owner trial 1 | fullbright index taken from each game's `colormap.lmp` (Hexen's yellow dotted world textures) |
| `31498a84` | owner trial 2 / M1 | native Hexen II menus on the shared menu framework: main with the sliding title, single player, multiplayer, options, keys, help, quit, load/save |
| `8cc2c3c7` | owner request | Help as one scroll with sticky section headings |
| `245a5cb3` | owner request / M2 | high-resolution Hexen II menus on the one dynamic renderer: per-game skin with a runtime font from the installed bigfont/conchars, grey stone, smoothed original pictures, sliding title, menudot selector; Quake unchanged |
| `b3f6580c` | browser trial T1 | Hexen II in a local source checkout; M2's font made legible on the GPU; Hexen's own console background |
| `592220ad` | H1, trial T2 | hub saves on IndexedDB; Portal's text lists and the native demos mounted; Hexen's own plaques; no Quake files requested |
| `35a3973b` | E1, E2 | Enhanced Hexen II: neutral grading at launch and the 3D view kept above Raven's status bar |
| `4a47cd8c` | MS | Hexen II MIDI music through an original FM synthesiser; library music streamed in a source checkout |
| `33e1fef8` | merge Dev | Dev's standardised box art (`6e3e0237`) and Hexen texture batch 7 with the authoring method (`8f0e96bc`); on the unified host `Hexen 2 Shareware` stays the Hexen II demo's game folder, not a display-only box |
| `8426b4b9` | owner trial 3 | every game started from the app's shelf fell back to the shelf (`Can't find variable: saveTrial`) |
| `e77d7b3f` | DP | test of the ordinary shelf start (`tests/desktop_prepare_test.js`) in the engine list |
| `9c0753c3` | owner trial 4 | Hexen small menu text in the game's own crisp pixels; help scrolls smoothly, held arrows scroll, text fades under pins |
| `87922a8c` | owner trial 5 | Hexen II starts on its title demos like Quake (Enhanced and Classic halves); Portal mounts the base game's loose files |
| (this commit) | DD, owner trial 6 | native demos play from inside the level; Hexen menu legible over the title demo; split labels clear of its plaque |

Four independent adversarial reviews (R1 Quake regressions, R2 the Hexen path, R3 and R4 confirming the fixes; DeepSeek
V4.1 Flash) found 20 defects, converging to minor ones in R4;
every one was verified against the code and fixed with a test that fails before and passes after. Verification after
the fixes: 263/263 across every Hexen II, unified-protocol, profile, Newer, hook and touched Quake suite; engine list
218/218 in the pre-commit hook; native library contracts 22/22; skin-identity results unchanged by the Newer bindings (60 runs compared
before/after). The packaged app was run with `HEXEN2_TRIAL_GAME=hexen2`: `demo1` spawned, the client connected and the
host ran at ~28 fps with the Hexen HUD font. The first frames were held by the enhanced warm-up waiting on rock relief
(fixed in `5082d07e`); a visual confirmation of the fixed build was not possible because the Mac was locked (macOS
pauses a hidden window's frame loop), so it is the first item for the owner's trial.

Owner trial follow-up (20 October, 06:40, packaged app from `31498a84`, Enhanced mode): the main menu shows the MAIN
plaque above the items in the gray big font with the cursor on the selected row; one Down moves one row; Options opens
the Hexen Options page (legible, OPTIONS plaque); Help opens the Hexen help pages on the stone frame and Right turns
the page. Still Quake-looking in Enhanced mode: the selector is the rotating Q and the text uses Quake's distance-field
font, because the WebGL menu skin is Quake's. Package M2 (running) gives the dynamic renderer a per-game skin: a
runtime font from the installed `bigfont2.lmp`, gray stone instead of bronze, high-resolution plaques with the slide and
the menudot selector, with Quake's command stream unchanged.

Owner request (20 October, 06:50): Help is one scroll inside the help panel instead of five pages, with accordion-style
sticky headings: the section being read keeps its yellow heading pinned to the top row, the next unseen heading is
pinned to the bottom row (first line of each), and the rows next to a pin fade. The text is transcribed from the five
native pictures (identical in the full game and the demo; the owner approved keeping it in the repository) and drawn
with `M_Print`/`M_PrintWhite`, so the WebGL menu redraws it at full resolution; help01's stone frame is kept with its
panel cut out. Keys: Up/Down and the wheel scroll, Page Up/Down and Space a panel, Left/Right a section, Enter the next
section (wrapping), Home/End; touching a pinned heading goes to that section. Module `hexen2_help_scroll.js`, test
`tests/hexen2_help_scroll_test.js` (red against the paged help, then green).

M2 verification before commit: 245/245 across 81 suites (every `tests/hexen2_*`, menu, hook, binding and protocol
suite) with M2 on top of the help scroll; M2's own run reported the engine list 217/217 and a Quake command-stream
snapshot unchanged. `tests/cheats_menu_test.js` fails one case ("Enter on it opens Cheats: 8 != 23") identically on the
Dev base `713b47d3`, so it predates this branch; it is not in the hook's engine list and is left for a separate fix.

Browser trial T1 (20 October, `tools/distribution/hexen2-trial.mjs`, headed muted Chrome, the owner's library through
`tools/serve.py --game-root`; keys go to the trial page only). The first run could not start Hexen II at all: since the
parallel host was retired a local source checkout refused Hexen II (`GameSelection_Startable`) and fell back to Quake
without its shareware pack, dying with `W_GetLumpinfo: conchars not found`. A source checkout now offers Hexen II and
mounts the edition from the library in the desktop app's order (`GameSelection_FetchLibraryGame`); the published web
product still refuses it. The trial then showed M2's high-resolution Hexen lettering unreadable on the GPU (its tests
checked commands, not pixels). Five defects, each now pinned by a test that fails without its fix where a CPU test can
see it: the distance field was inverted; the skin uploaded its atlas before the renderer's own DpQuake upload finished,
which then overwrote it (Hexen metrics over Quake's texture); glyph tiles sampled the neighbouring sheet cells into
their padding (boxes round letters); the bigfont's 255 grid line counted as ink (a bar after every word); the distance
range was two to three times Quake's relative to the em (letters swelling into each other). Lettering now takes the
game's own colours from its charset and palette (tan plain bank, red highlighted bank, the bigfont's stone). Hexen
II's console background is `gfx/menu/conback.lmp`; Quake's `conback.webp` wallpaper is no longer shown behind Hexen
menus. Verified by screenshots of the main, options, help (sticky headings) and single-player pages, and 289/289
across the Hexen, menu, selection, hook and protocol suites.

Package H1 (GPT Sol 6.1 high; owner, 20 October: sub-agents run GPT Sol) measured real hub saves: demo1 alone
134,400 bytes, the first hub 1,223,081, Portal's Keep 844,884 and Tibet 1,285,484, so three slots of the larger hubs
(about 7.5 MB) exceed localStorage's ~5 MB. Hub saves now go through `Hexen2_SaveStore` on IndexedDB (localStorage
and memory fallbacks; a failed write keeps the previous save; old localStorage slots migrate after the new write
commits; the menus show cached slot comments and refresh them in the background). Review change: the `save`/`load`
commands stay synchronous, so Quake's failure handling is unchanged; only the Hexen branch runs in the background.
Details and measurements: [h1-save-storage.md](h1-save-storage.md).

Trial T2 (all scenarios, browser): demo1 start, walking, hub travel demo1 → demo2 → demo1 (286 edicts restored),
save and load back to the saved position through IndexedDB, Portal of Praevus on keep1, the demo edition, and
`playdemo demo1` through the native-demo decoder: 21/21 checks. It found and this commit fixes: the base game's
native demos and Portal's own `puzzles.txt`, `infolist.txt` and `maplist.txt` were never mounted, by the desktop app
(`library.rs` HEXEN_LOOSE_FILES) or a source checkout, so Portal used the base game's lists; the loading and pause
plaques used Quake's paths (Hexen's are `gfx/menu/loading.lmp`, `paused.lmp`); every Hexen session requested Quake's
wizard/hell-knight hit sounds and composed Quake's single-player menu picture. The trial now reads the engine console
(`Con_RecentLines`) and fails on any file the engine could not load (shown failing with the old plaque path).
For the owner's eye: Enhanced mode looked darker and hazier than Classic in demo1, with the hands drawn lower (fixed
by E2 below; the remaining softness at a 2x window is dynamic resolution, `r_dynres`, a frame-rate governor).

Package MS (owner approved a small FM synthesiser, 20 October): Hexen II's native `midi/*.mid` tracks are parsed
(`midi_smf.js`), rendered off-thread by an original FM synthesiser with procedural General MIDI families and
synthesised percussion (`midi_fm.js`, `midi_fm_worker.js`; no third-party code, banks or samples) to a cached WAV,
and played through the shared music bus like the OGG conversions, which stay preferred. All 29 installed tracks
render within budget (a four-minute track 0.57 s typical, 2.34 s for 48 sustained voices; about 21 MB of WAV);
details in [ms-midi.md](ms-midi.md) and [ms-verification.md](ms-verification.md). A source checkout now streams the
library's loose music conversions as the desktop app reads them (`GameSelection_LibraryMusicSource`). Browser trial:
the base game plays `music/casa1.ogg`, the demo edition (MIDI only) plays `midi/casa1.mid` through the synthesiser.
The Enhanced storm's fallback gust is now a binding (Quake's `ambience/windfly.wav`; none chosen for Hexen II, whose
storm flashes silently until a gust sound is picked).

Owner trial 3 (20 October, after the Dev merge): the box art showed, but choosing any game on the shelf (Quake
shareware, Quake, Hexen II) showed the loading screen and returned to the shelf. `Desktop_Prepare` returned
`saveTrial`, never declared since the h2 snapshot (`9fbaec20`); a trial launch assigned it first (an implicit global in
the non-strict bundle) and worked, an ordinary shelf start threw. Every packaged check before this used the trial
launch, so none saw it; Dev never had the line. Fixed in `8426b4b9`; package DP adds a test that runs the real
ordinary shelf start with stubbed Tauri modules. Lesson recorded: packaged checks must include an ordinary shelf start,
not only `HEXEN2_TRIAL_GAME`.

The merged Hexen texture batch 7 is authoring output (reviewed masters and tiers); no runtime Hexen texture index
(`newer/textures/hexen2/index.json`) exists yet, so it is not visible in game until registered under the texture skill.

Owner trial 4 (20 October): the help text was illegible, holding Up/Down did not scroll, and the rows next to a pin
were dimmed instead of fading; then "apply that to the credits and the other settings". M2 drew Hexen's 8-pixel
charset as distance-field lettering, whose bevel and weight merge an 8-pixel font's strokes (S read as Z). Hexen's
small text, text boxes and sliders now stay native (`smallTextNative` in menu_webgl.js; the dynamic layer composites
over native drawing, so the boxes and sliders under the text are native too); the bigfont, plaques, pictures and
menudot stay high-resolution, and the runtime atlas holds the bigfont only. The help scrolls by the pixel and eases,
a held arrow scrolls steadily after a short pause (menus get no autorepeat, so the page reads `Key_IsDown`), the
section heading pinned at the top is pushed out by the next one, and the text fades into the darkness under the top
pin and above the bottom one (`Draw_FadeBand`). Verified by screenshots of the main, options, help (held), credits
and Customize Controls pages (trial 10/10, every page checked by name), 290/290 suites and the engine list 220/220.

Owner trial 5 (20 October): "like quake when the game starts it's supposed to play the demo", with the menu over
the playing demo, and "this is also where we need to have the split between the classic and the enhanced". Quake's
title demo is the split (r_demosplit: Enhanced left, Classic right) and its menu dims it lightly; native hexen.rc
opens the menu instead and ships `startdemos demo1 demo2 demo3` commented out. A Hexen II start with no explicit map
now queues `startdemos` with the native demos installed (`Hexen2_AttractDemos`) and `menu_close`, a new command that
leaves the main menu as Escape does, which resumes the loop the menu paused (hexen.rc's `menu_main` runs first). The
split, the light dim and the world's own effects behind the menu are Quake's code, unchanged. Portal of Praevus now
mounts the base game's loose files under its own, as the native engine searches data1 too (its demos live there); the
shareware demo ships no demos and keeps its menu. Verified in the browser: the title demo plays at start with the
split, Escape opens the menu over it (trial 11/11), playdemo 4/4; 304/304 suites, engine list 220/220. Owner trial 6: the title demo's camera was outside the level ("still extremely broken").

Package DD (GPT Sol) fixed the native demo decoder: packet and baseline field order, native reference frames,
retained clientdata, restoring entity visibility, and no-lerp links (a transient `PE2_NOLERP` bit; the live writer
never sets it). The camera was valid on 6.06%, 0% and 1.78% of frames in demo1-3 before and 100% of 8,282 frames
after (`tests/hexen2_demo_camera_test.js`; report [dd-demo-camera.md](dd-demo-camera.md)). Browser: the title demo
plays inside the cathedral and hands over to rider1a. With the Hexen menu over the split demo, the ENHANCED/CLASSIC
labels move to the bottom of the picture (Hexen's plaque covered the top-left one), the demo is veiled more deeply
(0.55, Quake keeps 0.32) and the bigfont is drawn as raised stone in the lit-face ink of its own sheet (it had been
the supplied renderer's recessed carving, near-black over the demo). 311/311 suites, engine list 220/220, browser
trial menus 11/11, base 8/8, Portal 3/3, demo 4/4, playdemo 4/4.

Open decisions and known limits:

- Base-game hull 4 is the 1.11 hydra size (±40) and Portal's the pentacle (±8), following each game's own engine;
  uHexen2 uses ±8 for both. Confirm in play.
- Procedural rock relief is off for Hexen II until its surfaces pass the texture review.
- Hub saves use the existing localStorage save boundary (one atomic record per slot); IndexedDB is not yet used.
- Hexen music prefers the OGG conversions in `data1/music`/`portals/music`; MIDI-only tracks use the FM synthesiser.
- Hexen II texture art and skins: the per-game index and tiers exist, no Hexen art is indexed yet.
- Native coordinates and angles re-encoded from gamecode writes truncate like Quaked's `MSG_WriteCoord`/`MSG_WriteAngle`
  (uhexen2 rounds): at most 1/8 unit or 1.4 degrees, kept consistent with the rest of the engine (review R4 finding 3).

E2 (20 October 2026; investigation E1 and a same-spot browser comparison of Classic, Enhanced and neutral grading;
verified at integration 288/288 suites, engine list 217/217, and the trial's launch screenshot): profile-bound neutral Hexen Enhanced grading and a Classic-sized
3D rectangle above its HUD; Quake launch text and viewport policy retained. Implementation, RED/GREEN evidence,
consumer audit, Bluey outage and remaining integration/visual acceptance gates: [e2-enhanced-look.md](e2-enhanced-look.md).
