# Flashlight defaults and run status

The owner's 2026-10-03 rule replaces the former unconditional flashlight-on game default. The enhanced title demo still starts with its flashlight on independently of game-run policy.

| Entry | Automatic flashlight |
| --- | --- |
| Fresh Newer Game at `start` | Off until a difficulty corridor selects a default |
| Fresh/restarted level, Easy or Normal | On |
| Fresh/restarted level, Hard or Nightmare | Off |
| Ordinary/seamless level travel or save restore | Preserve the current manual setting |
| Classic game | Preserve the cvar; the existing Classic beam gate keeps it invisible |

The first actual user on-to-off change during a connected, non-demo Newer game prints **No duct tape in Mars** through the existing `Con_Printf`/`Con_DrawNotify` corner. Subsequent off changes do not repeat it in that run. A successful explicit `map` (including `restart`, which queues the current map) resets the counter. Automatic hub/Hard defaults, demo changes and Classic changes do not consume it. F, the flashlight checkbox and a directly changed console cvar share this behavior.

## Existing architecture and ownership

`src/r_flashlightrun.js` holds a small local run record and automatic-change baseline. It has no renderer, server loop, browser or save-file ownership. `r_flashlight.js` retains its shoulder offset and lag. It observes direct console changes once per view frame; the F/menu toggle supplies its actual previous setting immediately.

The successful `Host_Map_f` hook runs after `connect local`, because that connection first disconnects previous client state. Native loopback connection is synchronous. Failed map fetch/spawn returns before the hook; an unsuccessful or dedicated connection does not activate Newer run policy. `Host_Changelevel_f` and server portal/seamless code do not reset this state. Client serverinfo updates the current map and can establish a loaded-game context without applying new defaults or resetting a continuing run's notice. Only an explicit disconnect ends the record; generic load/connect disconnects preserve it.

The START difficulty decision uses the existing QuakeC `cvar_set` builtin rather than new corridor collision logic. The shipped BSP has `trigger_setskill` brushes `*9`, `*10`, `*11`, `*35`, with messages `0`, `1`, `2`, `3`. Independently inspected shipped bytecode installs `trigger_skill_touch` (function429, statement10395), which calls `cvar_set` at statement10402; that callee is builtin72. Its two inputs are `skill` and the trigger's existing message.

The additional builtin hook acts only for that trigger class in `start`, with local player edict1. Selecting Normal activates the light even when the existing skill cvar already equals1. The run remembers its selected choice: repeated touches of the same trigger do not undo a manual switch-off. Entering a different difficulty corridor applies the new choice. No trigger geometry, difficulty cvar semantics, server portal code or collision behavior changes.

`r_demosplit.js` synchronizes the observation baseline after its temporary feature-enable and feature-restore writes. This prevents a demo-on/restore-off followed immediately by loading a continuing Hard game from being misidentified as a user switch-off. The existing End/Release HDR and feature ownership remains intact.

The shared Newer menu defaults still enable lighting, normals, world/height shadows and FPS, and keep gamma at the owner's slider midpoint `.75`. The unconditional flashlight command was removed; successful fresh-map policy now chooses it. The counter is local runtime state and does not change the save-game format.

## How to try

1. Choose Newer Game. In the hub, the flashlight starts off. Enter Easy or Normal and it turns on; Hard/Nightmare keep it off.
2. Press F to turn an enabled flashlight off. The normal corner shows the exact status line once. Toggle it on and off again: no second line.
3. Continue into another level with it off: it remains off. A fresh/restarted Easy/Normal level starts on again and allows one new status line.
4. Use Level Select to start Easy/Normal versus Hard/Nightmare directly. The initial flags follow the table above.
5. Stop an enhanced title demo: its temporary flashlight preference restores without creating a run status message.

## Verification and limits

`tests/flashlight_run_test.js` exercises public run APIs, the real command and menu input routes, the actual QuakeC builtin72 with native trigger evidence, and the actual console notify glyph route. It tests all four fresh difficulty defaults, same-value Normal selection, repeated touches, local/nonlocal gates, manual preservation, once-run reset, and the Hard-run/demo/restore/resume boundary.

The focused gate also runs existing flashlight beam, demo scope, emissive-light/brightness and single-player menu tests. Receipt: `docs/evidence/flashlight-run-tests-2026-10-03.txt`; earlier harness attempts are retained separately. The emissive menu regression was updated from its superseded unconditional-on expectation to hub-off followed by Normal-corridor-on. No browser/game instance was started by this implementation agent. Parent-coordinator live-game acceptance and release remain separate from these CPU/public-interface receipts.

## Native linked-touch proof

`tests/flashlight_native_touch_test.js` uses actual `SV_SpawnServer`, shipped QuakeC player initialization and public `SV_LinkEdict` for all four native START skill triggers. Easy/Normal activate the light, Hard/Nightmare leave it off; valid corridor-facing hull contacts do not teleport before selecting difficulty. The initial trial placed the player in a neighboring teleporter at the trigger center and did not exercise the skill touch. That trial failure is retained; its corrected entrance-side contact requires no production policy change. The coordinator reran this native suite in `docs/evidence/flashlight-native-linked-final-tests-2026-10-03.txt`.
