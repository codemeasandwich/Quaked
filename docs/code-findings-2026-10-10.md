# Code findings from the JSDoc pass, checked and fixed (card [44m]), 10 October 2026

While documenting every export for [44g], the agents listed things in the code that looked wrong, without changing
any. This card took each item in turn.

- **Real defects** are fixed, each with a public-interface test. Each test was also run against the old code, and
  failed there.
- **Dead code** is removed.
- **By-design items, and those left for the owner,** are recorded below with their reasons.

## Fixed

| # | What was wrong | What now happens | Commit | Check |
|---|---|---|---|---|
| 1 | Nothing called `S_Startup`, the only place that loaded the water and wind ambient sounds, so neither ever played. | `S_Init` loads them, as WinQuake's does. | 63fb4bb6 | `ambient_sounds_test` on e1m1's real leaves. Browser, e1m1: in a water and sky leaf both channels play at 77; Dev played neither. |
| 3 | `BoxOnPlaneSide` called `Sys_Error` without importing it, so a bad `signbits` was a ReferenceError. | The WinQuake Sys_Error. | c5ad576a | `mathlib_errors_test` |
| 4 | `ED_Free` unlinked only through `sv.SV_UnlinkEdict`, which nothing set, so freed edicts stayed in the area lists. | `SV_SpawnServer` sets the hook, and a freed edict leaves the world at once. | 4a1e3573 | `ed_free_unlink_native_test` on e1m1's triggers |
| 5 | `R_ParseBsp` threw a RangeError for a file cut short inside its models lump. | It returns null. | c961500b | `r_levelgraph_test` |
| 8 | 14 messages in pak.js, zone.js and main.js ended in a literal backslash-n. | They end in a real newline. | 098ffdcf | `console_newlines_test` |
| 10 | `PR_PrintStatement` used placeholders that printed bare offsets. | QuakeC error and trace dumps name their operands, through pr_edict.js's `PR_GlobalString`. | d29b6e42 | `pr_statement_print_native_test` |
| 10 | `paintedtime` never advanced. Also, `SND_PickChannel` weighed every empty channel after the first as a sound to steal, so a playing sound could be taken while a channel was free. | A new sound takes a free channel, else the one nearest its end. | 483da188 | `sound_channel_steal_test` |
| 11 | The menu was never given `SCR_EndLoadingPlaque`, so a failed room creation left the loading plaque up. | Host_Init passes it. | efa78b3b | Browser, game options with an unreachable `?server=`: the plaque clears; on Dev it stayed. |
| 12, 13 | `Sys_Error` and `Host_Error` took one argument, so their messages showed a literal `%i`. `SV_ClientPrintf` and `SV_BroadcastPrintf` expanded only `%s`, and printed 0 as nothing. | All of them format their arguments. A message given no values is used as written. | 9fa2a5f9 | `error_format_test` |
| 14 | The keepalive's send was commented out, and its clear discarded whatever else was queued. | The keepalive reaches a remote server. It is skipped for this page's own server, as in WinQuake. | ac572bcc | `cl_keepalive_test` |
| 15 | Leaving the page wrote the lobby's framing on the game stream, which the server read as a length of 257. | The page sends `clc_disconnect` through `WT_QSendMessage`. | 80dbe88c | `net_webtransport_test`, through the real handler with a stand-in WebTransport |
| 16 | With no view leaf, contents 0 was passed, which tints the view as water. | `CONTENTS_EMPTY` is passed. | 26cd4aa4 | `view_contents_test` |
| 17 | `Draw_PicFromWad` caught a missing lump only after `Sys_Error` had already replaced the page. | It looks the lump up with the new `W_FindLumpinfo` first. | b6c23a5c | `wad_missing_lump_test`, with a page stand-in |
| 18 | The ranking and "complete" pictures called `Draw_Pic` without checking for it. | Both check first. | c329cef6 | `sbar_overlay_guard_test` |
| 19 | A second `IN_Init` doubled every listener. `IN_Shutdown` left the touch-start listener and the touch controls. | Input starts once and stops completely. | 47aac516 | `in_web_lifecycle_test` |
| 20 | Cutscenes (`cl.intermission` 3) drew the status bar and crosshair, where WinQuake draws only the text. | The text alone. `SCR_CenterPrint` counts the lines it keeps. | b22a2586 | `cutscene_screen_test`, the real screen on a real canvas |
| 21 | The room server never registered skill, coop and the other rule cvars, so at spawn it printed "Cvar_Set: variable skill not found" and ignored its skill. | `Host_InitRuleCvars` registers them, called by `Host_InitLocal` and by server/game_server.js. | 927b6362 | `rule_cvars_test`. The real room server, run for 25 s on e1m1: Dev printed the message, the fix does not. |
| 22 | Three of the four Python verifiers failed on later, deliberate changes. | The level-texture and head-skin verifiers check the shipped files, exempting by name only those a later increment changed by design, each with its commit. The wizard verifier, whose twelve textures the 2 October level sheet replaced, is a labelled historical reproduction, and fails unless the level recipe covers all twelve. The heights verifier compares decoded pixels, since the encoder's bytes vary. The verifiers rewrite their dated evidence only with `--write-evidence`. | c141653c, review fix | Level textures, head skins and wizard pass. Heights: see below. |
| 23 | `unseen_native_test` sampled the hunt once, at 2 s. A hurt ogre's random pain sequence could outlast that; 4 seeds in 36 failed. | The test watches for up to 2 s more, within the spot's 5 s life. | be0ab043 | 36 of 36 seeds pass; the slowest needs 0.4 s. |
| review | Once ED_Free unlinked, a trigger whose touch freed the next trigger in its area list left `SV_TouchLinks` walking a self-linked edict forever, hanging the page. | Triggers are gathered first and touched after, each checked again, as QuakeSpasm does. | 7738d85e | `trigger_touch_order_native_test`, the game's own `multi_touch` killtargeting its neighbour. The old code hangs (killed at 60 s). |
| 24 | (Found in [34e]'s review.) [44g]'s and [34e]'s re-hashes left each level's bake `generatorFingerprint` as it was, so the prepared-corpus audit failed. | The fingerprints are restated, in the manifests and the registry modules, as [44e] did. The audit also reads `quake:` as the full game's pak. | 5d21492f | The audit walks all 159 maps. |

## Dead code removed

- **gl_rmisc.js:** `R_Misc_SetCallbacks`, which nothing called, and `envmap` (6c128e7d). The particles are started by
  gl_rmain's own `R_Init`. WinQuake's `envmap`, a developer tool that writes six views to files, is not ported.
- **mathlib.js:** `Q_log2`. Nothing called it, and it looped forever on a negative value (c5ad576a).
- **wad.js:** `SwapPic`, which nothing called (c4360265).
- **The rest of item 10** (11c227e0, 8e1eee7b):
  - render.js's eight software-renderer stubs and its `R_TeleportSplash`. The teleport burst was dropped on purpose in
    69279b3f, "Soften teleporting".
  - server.js's `host_time`, `sv_player` and their setters.
  - gl_model.js's `glpoly_t` and `dtriangle_t`; gl_rlight.js's `dlight_t` and `R_AddDynamicLights`; glquake.js's
    `particle_t`.
  - net_main.js's unread `configRestored`.
  - server/sys_deno.js, which `sys_server.ts` replaced.
- **gl_draw.js:** its canvas-mode `GL_LoadTexture`, `GL_FindTexture` and their table (b6c23a5c). Nothing used them;
  the world uses gl_model.js's own.

## Recorded, not changed

- **6, CD music. By design in Newer Game, and the owner's decision for Classic.**
  - Newer Game plays its streamed ambient music instead of CD tracks (docs/ambient-music-2026-10-01.md).
  - In Classic no soundtrack plays, because no track URL provider is set.
  - Pointing it at the owner's `resources/id1/music/trackNN.ogg` would bring Quake's CD music back to Classic. It would
    need a gate so it never plays over Newer Game's ambience. That is an audible change, left for the owner.
- **18, `sb_updates`. By design.** It is WinQuake's page-flip counter, written and never read, and documented as such.
  The mission packs' flags have been passed to the status bar since [34c].
- **22, enemy heights. Still failing, truthfully.**
  - The ogre's and soldier's height maps were authored from their earlier skins. The owner's new skins (b229ee1f, 4
    October) replaced the diffuse maps but not the heights, so their relief no longer matches their pictures.
  - Regenerating the heights (`tools/texture_sheets/update_enemy_heights.py`) changes how both monsters look.
  - The owner's checkout also has an uncommitted edit to the ogre's skin. So this is the owner's decision, recorded as
    card [44n] (T-743276ec), with the owner responsible.
- **24, `gl_model.js` and `gl_rsurf.js`. Stale until a re-bake.** Their recorded source hashes in the displacement
  manifest are still the bake-time ones. The audit reports them, as module-layout.md already says, until the next
  re-bake.

## Checks

- **Tests:** each fix's test fails with the fix reverted and passes with it. Those runs are in the card's notes.
- **Browser:** items 1 and 11, the fix against Dev.
- **The real room server:** item 21, the fix against Dev.
- **The full suite** runs on the branch before merging.
