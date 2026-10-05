# Local owned full-game content: first E2M1 trial

The normal game now optionally reads `resources/id1/pak0.pak`. Missing files
from that local installation become available through the existing native
PACK search path. **Single player > Level Select > E2M1 — The Installation**
is the first supplied non-shareware level exposed by the existing menu. Choose
Newer Game or New Game on its Game row, then select E2M1 with Enter or touch.
This is a bounded loading increment, not qualified acceptance of the complete
campaign or expansions.

## Trying it

Serve this checkout with the existing local preview setup and reload
`index.html`. Its ignored `resources/id1/pak0.pak` must resolve to your legally
owned installation. In an isolated worktree, a separately inspected link to the
canonical `resources` directory may be borrowed for read-only testing; record
and later remove only that link. Never copy, stage or publish the archive.
No such link was created by the feature lane's focused checks.

Open Single player, select Level Select, choose Game and Skill, and scroll down
one row past E1M8 to E2M1. Select it. New Game retains Classic rendering; Newer
Game retains its established defaults. `map e2m1` is also available through the
existing console command, using the current game mode. Without the local
archive the E2M1 row is hidden and bundled startup continues normally.

## Architecture and preserved contracts

`main.js` fetches the owned archive alongside the existing independent pack
transports with `COM_FetchOptionalPak`. All settle before dependent host
initialization. If the required bundled pack succeeds, it mounts the owned
archive first with `COM_AddPack`, then mounts the bundled archive. Existing
last-mounted precedence in `COM_FindFile` therefore preserves **every bundled
file**, including `progs.dat`, palette, title demos and native startup worlds.
The owned archive supplies only paths missing from the bundled search path.
It does not replace programs or act as a Newer-only pack.

The Newer art and explicitly selected Newer map pack keep their existing
separate routing above native content. This change adds no state flag, loader,
resource manager, renderer, corpus generation, or campaign override. The
owned pack is fetched once during ordinary startup and retained in memory by
the existing pack system (179,618,935 bytes in the inspected installation).
This first increment retains the current loader's linear lookup; no new
indexing or performance claim is made.

`src/menu.js` adds one catalogue entry to the existing file-availability
filter. Ten available levels fit the current 320×200 menu with its existing
keyboard, wrapping, touch, skill and mode selection. The rest of the full-game
catalogue would require a separately scoped presentation decision.

`Host_Map_f` checks the selected BSP via `COM_FindFile`, then follows existing
server/map initialization. There is no JavaScript registered-content switch
in this path. `PF_cvar` continues to delegate to the existing cvar registry.
Bundled QuakeC and hub entities are preserved. `Host_Init` now invokes
`COM_CheckRegistered` after command initialization and pack installation, before
native consumers. This faithfully reuses the [native WinQuake registration
contract](https://github.com/id-Software/Quake/blob/master/WinQuake/common.c):
register the standard nonarchived `registered` cvar at zero, compare all 128
big-endian words of `gfx/pop.lmp` against native `pop[]`, then set one only for
an exact 256-byte marker. A missing or corrupt marker resets zero. This is
content-derived native state, not a saved preference or URL/entitlement switch.
The checker uses the existing native search path and does not patch programs.

Independent review found the required compatibility gap in the first candidate:
bundled QC reads `registered` in `ExitIntermission`, `NextLevel` and
`trigger_onlyregistered_touch`; the absent cvar returned zero. Mounting full-game
files alone therefore left ordinary hub and progression behavior shareware-gated.
The wiring closes that gap through existing cvar/builtin behavior. Actual native
E2M1 spawn and normal browser player/render readiness remain required independent
QA; CPU program execution alone cannot prove browser gameplay.

## Failure behavior

Absent archives, HTTP failures, HTML responses and parser exceptions return
`null` through the existing optional fetch contract. No optional pack is
mounted when the required bundled archive is missing. The existing parser
now checks header length, nonnegative/aligned/in-bounds directory ranges and
nonnegative/in-bounds payload ranges before registering a pack. This closes a
specific deferred failure: corrupt payload offsets previously installed a
pack successfully but threw when a later `COM_FindFile` created its byte view,
outside the optional fetch's catch. Malformed optional content now declines
as a whole rather than exposing partially installed files. Required pack
errors retain their existing failure path.

## Focused evidence and limits

On 5 October 2026 the feature lane ran the maintained Node/Three harness:

```sh
QUAKED_THREE_MODULE=/private/tmp/quaked-three.module.mjs \
QUAKED_OWNED_PAK=/Users/bri/SOURCE/Quaked/resources/id1/pak0.pak \
node tools/run_tests.mjs tests/fullgame_pack_test.js \
  tests/startup_preload_test.js tests/singleplayer_menu_test.js \
  tests/newer_pack_test.js
```

All **17/17** focused tests passed: three owned-pack/public-menu controls,
eight actual-entry orchestration/preload controls, two existing menu controls,
and four Newer-pack controls. The controls read the canonical archive directly,
without copying game bytes, creating a resources link or starting a preview
server. The menu harness captures commands rather than initializing a server;
its native Newer-default commands outside that narrow fixture are not
registered. They are not gameplay failures or proof of native execution.

| Witness | Value |
| --- | --- |
| Bundled entries | 339; every resolved entry hash preserved in both modes |
| Owned entries | 1071 |
| Owned E2M1 BSP SHA-256 | `de2f7b284ee64b24cdfe545ea4b09abdf9cce657f7ba6b1aab7ef06fecf2c26a` |
| Bundled program SHA-256 | `f2619787f9aa0f057246eea1665b622b4691b5c5a800b1a46133d1fe8b771580` |

The malformed controls cover missing file, HTML, directory outside the buffer,
unaligned directory and out-of-range payload. Startup tests exercise the actual
entry source under controlled I/O, including its owned-pack barrier and mount
order. Public keyboard controls queue E2M1 with both Classic and Newer mode
commands. Independent public/native QA and source review must bind their
results to the committed candidate before Ready; owner acceptance, dev landing
and release are separate. No compiled build, full suite, rebake, performance
campaign, integration landing or remote publication was run by this lane.

### Required registration correction

The first candidate's 17/17 results are historical controls, not campaign
qualification. After the required registration correction the same focused
command plus `tests/fullgame_registered_test.js` passed **18/18**. That additional
control executes the actual bundled program via `PR_ExecuteProgram`, including
builtin cvar lookup. Missing and corrupt markers keep the native registered
trigger intact and `NextLevel` from START selects E1M1. With the exact owned
marker, that trigger removes itself and START with completed Episode 1
(`serverflags=1`) selects E2M1. Programs remain the bundled bytes. This CPU VM
fixture uses ordinary edicts and globals, not a mocked `Host_Map` or cvar-only
assertion. It checks the nonarchived default as well.

Two initial native-control failures are retained as fixture corrections: the
QC-only `attack_finished` field required `GetEdictFieldValue` rather than a JS
object property; completed Episode 1 is flags1, not flags2. The corrected native
control passed 1/1, then the combined focused gate passed 18/18. No production
contract was weakened to make those controls pass.

The malformed optional archive controls also cover the existing 2048-file cap
and assert that rejection leaves the game DOM unchanged. Count overflow now
throws ordinary Error within the parser, like other structural rejections;
calling fatal `Sys_Error` there previously destroyed the DOM before the optional
fetch catch could decline the archive. Native mandatory startup retains its
existing entrypoint-owned fatal error handling. All owned marker mutations in
the negative control affect its in-memory buffer and are restored in `finally`;
the local archive is never written.
