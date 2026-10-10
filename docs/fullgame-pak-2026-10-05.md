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

Open Single player, select Level Select, choose Game and Skill, step the Episode row to
Episode 2 and select E2M1 (Level Select now lists every episode the loaded data has:
[level-select-cheats-2026-10-09.md](level-select-cheats-2026-10-09.md)). Select it. New Game retains Classic rendering; Newer
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

`src/engine/client/menu.js` adds one catalogue entry to the existing file-availability
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

## Required HDR ownership correction after native qualification failed

The `71083e2` source review and 18/18 CPU controls remain historical evidence.
Independent cold browser QA reached the exact E2M1 BSP and player, but its
strict qualification failed: actual HDR was zero, normals remained unsettled,
enhanced relief was inactive, and the demo coordinator had not observed the
required frames. An observer-only PASS was rejected. File resolution, native
spawn and the earlier focused counts did not qualify the normal Newer game.

Before changing production source, the feature lane reproduced one concrete
cause through existing public menu, command-buffer, cvar and demo APIs. Queue
`playattractdemo hdr_ownership` followed by `wait`, then select E2M1 through
the real Level Select touch controls. The menu queues its mode and map commands
behind that pending attract command. Execute the first command-buffer slice to
start the real header-only attract demo; execute the second slice to apply the
explicit mode and reach the real `CL_Disconnect` boundary used by map launch.
The fixture's map endpoint invokes this actual disconnect API; it does not
spawn a native world or claim browser/GPU readiness.

| Mode | Before selection | Attract starts | Explicit queued mode | After demo disconnect on `71083e2` | After correction |
| --- | --- | --- | --- | --- | --- |
| Newer | 0 | 1 | 1 | 0, incorrect | 1 |
| Classic | 1 | 1 | 0 | 1, incorrect | 0 |

This is an observed causal trace, rather than an inference from source strings.
`R_DemoSplitRelease` cleared only the currently active scope. A pending attract
could start afterward and save the previous HDR value in its private snapshot.
When map launch disconnected the demo, `R_DemoSplitEnd` unconditionally restored
that snapshot over the already applied explicit choice. A same-value ordinary
console HDR choice had the same problem. The definitive pre-edit public
baseline failed four controls and passed two (**2/6**, terminal exit 1).

The repair adds `r_hdr` to the existing borrowed demo-preference loop in
`src/newer/render/r_demosplit.js`. It removes the separate HDR snapshot and unconditional
ordinary `Cvar_Set` restoration. No additional state, flag, manager, cvar,
renderer, transport ordering or asynchronous mechanism is introduced.
`Cvar_SetTemporary` and `Cvar_RestoreTemporary` already provide the required
ownership contract for the flashlight and sixteen Newer features:

- Attract presentation borrows HDR without claiming it as a user choice.
- Demo-only end restores the exact original string while the borrow is owned.
- An ordinary menu/console set, including the same effective value, ends the
  borrow; subsequent demo end cannot overwrite that explicit choice.
- Release restores any remaining borrowed settings and drops the current
  comparison scope. A later queued attract uses the same contract and yields
  when the selected mode command runs.
- Configuration serialization and storage preserve the underlying archived
  owner value while a setting is borrowed. HDR's existing nonarchived
  declaration is unchanged; the test temporarily enables its archive field
  solely to exercise the generic config contract, then restores it.
- Manual/file/timed demos keep their existing non-attract behavior. Ordinary
  disconnect and the actual host `connect local` command stop the demo through
  the same ownership boundary. No remote connection is opened by these checks.

The new `tests/demo_hdr_ownership_test.js` passes **7/7** public lifecycle
controls: Newer/Classic selection before pending attract; both choices during
active attract and explicit same-value ownership; actual local connection;
untouched demo restoration/idempotence; config/storage custody; and ordinary
disconnect/manual/file/timed boundaries. The local connection fixture uses the
existing in-memory loopback driver, allocates no server/browser process and
closes its sockets in `finally`. A first added connection-control run failed
because its fixture omitted the normal single-player `svs.maxclients` capacity;
the fixture now supplies and restores that existing state. Production network
code was unchanged.

The maintained focused command for this correction is:

```sh
QUAKED_THREE_MODULE=/private/tmp/quaked-three.module.mjs \
node tools/run_tests.mjs tests/demo_hdr_ownership_test.js \
  tests/demo_shadow_defaults_test.js tests/profiler_demo_mode_test.js \
  tests/newer_start_test.js tests/singleplayer_menu_test.js
```

It checks the real demo/default/profiler/menu/cvar APIs without a compiled/full
suite, new browser, rebake or performance campaign. All **27/27** focused checks
passed (7 HDR ownership, 4 demo defaults, 8 profiler lifecycle, 6 Newer launch
and archived preferences, 2 existing single-player menu controls). The final
command terminated with exit 0; `git diff --check` passed. Baseline RED and subsequent
green logs are retained in the feature lane's Bluey outbox. The first baseline
iteration (4/6) is also retained: some direct playback calls omitted
`src_command`; they were corrected before production editing, producing the
definitive 2/6 RED above. None of these fixture corrections changed the product
contract or weakened assertions.

This new source still requires exact-candidate independent source review and
normal-game native/browser qualification. The observed HDR overwrite is fixed
by the CPU controls; those controls do not establish that all browser normals,
materials, coordinator frames or player presentation are ready. The previously
failed cold receipts and the `71083e2` registered/PACK receipts remain intact.
Owned archive, bundled program/palette/world bytes and those loading fixes are
unchanged. The new bounded repair retains the card's original 19:53 clock and
has a 21:35 UTC source stop; it grants no further retry, landing or release.

## Presented-frame qualification, 6 October

The owner requested completion of the existing selected cards. The frozen
5865e8c source was exercised through ordinary public single-player and Level
Select actions in three bounded browser trials: owned Newer E2M1, owned
Classic E2M1, and Classic shareware E1M1 with the optional owned archive absent.
All three passed with same-frame world/HUD PNG captures, native signon 4, a
living player at 100 health, advancing server time and gameplay input restored.
The current loaded E2M1 BSP matched the resolved owned file SHA-256
`de2f7b284ee64b24cdfe545ea4b09abdf9cce657f7ba6b1aab7ef06fecf2c26a`;
bundled program identity remained
`f2619787f9aa0f057246eea1665b622b4691b5c5a800b1a46133d1fe8b771580`.

Newer retained HDR 1 and all sixteen enhancement settings. Its welcome
coordinator settled three frames for the actual E2M1 world; texture, normal,
skin, weapon, HUD, shadow and water roles settled without errors. This map
has zero eligible rock/sculpt charts, so those ready empty roles are not
evidence of visible sculpting. Classic used HDR 0. The absent-pack control
retained registered 0 and omitted E2M1 from Level Select. Actual scene/camera
draws and default-framebuffer pixels were checked, rather than a final
fullscreen pass's triangle counter. Shader/runtime errors and GL errors were
zero. Browser pointer-lock denial was retained separately; these receipts
qualify rendering and native game readiness, not physical mouse capture.

Two earlier pages expired before a menu action and were retained as failures.
The observer then used separate finite boot/selection and selected-game
watchdogs, without changing product readiness gates. Immutable JSON/PNG
receipts and independent review are retained outside the distribution at
`/private/tmp/quaked-fullgame-presented-5865-oct6/`. Each terminal observer
stopped its renderer and restored hooks; the owned tab and localhost server
were closed after the controls. This is a first-level loading increment,
not full-campaign completion, timing qualification or production release.
