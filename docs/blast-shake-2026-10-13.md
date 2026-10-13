# Explosion screen shake

Item 3 of the add-on effects for every game (card T-3faa98e3; the plan for all 14 is
[addon-effects-integration-2026-10-13.md](addon-effects-integration-2026-10-13.md)).

## What it does

In Newer Game, in every supported game, an explosion near the player shakes the picture:

| What goes off | Message the client reads | Felt within | Lasts |
|---|---|---|---|
| A rocket or grenade (and the mission packs' coloured blasts) | `TE_EXPLOSION`, `TE_EXPLOSION2` | 640 units | 0.45 s |
| A Spawn bursting | `TE_TAREXPLOSION` | 520 units | 0.4 s |
| Chthon rising from the lava, and falling | `TE_LAVASPLASH` | 1600 units | 1.3 s |

- Strength falls with the square of the distance, and the shake arrives with the blast: the blast
  travels 2600 units a second, so a rocket 500 units away is felt a fifth of a second after its
  flash.
- The eye drops first, then shudders out at 13 beats a second, with a little pitch and roll. The most
  any number of explosions together can move it is 2.4 units, 1.1° of pitch and 0.7° of roll.
- Only the displayed eye moves (the weapon moves with it and keeps its angles). Aim, the player's
  place, physics and what the server knows are untouched.
- Off in New Game, in demos, while paused, in a menu or the console, at intermission and when dead.
  A new map or a restart forgets every shake.

## Setting

`v_blastshake` (saved): 0 off, 1 as designed; between scales it. In the menu: Options, Newer features,
"Explosion shake" (a slider; the list now scrolls past its first 17 rows to reach it).

## What it leaves alone

- **The Shambler's shudder** (`src/newer/render/v_shamblersteps.js`) is not edited. The explosion
  shake is a second, separate share of the view added after it in `V_CalcRefdef` (`view.js`); with
  both at once the two add, each within its own limit.
- **Quake's own damage kick** (`v_kickpitch`, `v_kickroll`) is unchanged; a blast that hurts the
  player gives both.
- **The shotgun and the lightning gun**: a gunshot (`TE_GUNSHOT`) and the lightning bolts do not
  shake the view and their handling is unchanged.
- **Add-ons' own shakes** (Arcane Dimensions' `misc_shake`, the mission packs' earthquakes) are done
  by their QuakeC and already worked; nothing here replaces them.

## Code

- `src/newer/render/v_blastshake.js`: `V_BlastShakeEvent( pos, kind )` notes an explosion;
  `V_BlastShake( playerorg )` gives this frame's `[ height, pitch, roll ]`.
- `src/engine/client/cl_tent.js` calls the first as it reads each of the four messages;
  `src/engine/client/view.js` adds the second to the view. Both reach it through
  `src/engine/common/hooks.js`.
- `src/engine/client/menu_options.js`: the row, and the scrolling list.

## Checks

- `tests/blast_shake_test.js`: the moment of impact is the whole shake; duration; the square law;
  the arrival time; reach; the three kinds; forty rockets at once held to the limits; the setting;
  every case where it must be off; the client's real explosion parser for all four messages and for
  a gunshot and a nail (which do not shake); the real view path (eye and weapon move together, only
  the eye tilts, aim and place untouched, New Game unshaken).
- `tests/addon_effects_guard_test.js`: the gunshot and lightning handling is word for word what it
  was; the new module does not reach into the shotgun's, casings', wall burn's or lightning gun's
  modules; the Shambler's shudder is the same with the explosion shake beside it, on and off.
- `tests/newer_menu_scroll_test.js`: the first page of Newer features is as it was; the page follows
  the cursor; the new row steps its setting by key and by touch.
- `tests/shambler_steps_test.js` (unchanged) passes.

## Independent review corrections

The map/restart reset now resets its clock along with its queue, so a new explosion immediately after
`cl.time` returns to zero still works. `V_RenderView` explicitly clears queued shakes during pause and
intermission, whose normal view-building path is skipped. Tests exercise those actual public paths
and then a fresh explosion, rather than only checking that the old one disappeared.

The scrolling-menu test initializes and uses the real menu command/key/touch dispatch. It verifies the
second page's touched cvar changes, in addition to preserving the first page's unrelated cvar; the
previous fixture could pass after an unknown command or an unregistered target made the action a no-op.


Actual GPU probe: `tests/blast_gpu_trial.html` renders a synthetic scene through the real
`V_CalcRefdef` and engine `R_SetupGL` camera, then reads pixels in WebKit. Five checks passed with no
page/shader errors: 2,859 pixels changed during the blast; settled, off and Classic pictures exactly
matched baseline; aim and player origin remained unchanged. This is real view/camera rendering proof,
not native play-feel acceptance. Independent public/neighbor tests passed 27/27 after the corrections.
