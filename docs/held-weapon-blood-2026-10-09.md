# Held-weapon blood stays with its weapon

Card [16]. Before this change the player had one blood-and-wet coating, drawn on whichever weapon was in hand, so
splatter on the shotgun was still there after switching to the nailgun. Now each weapon keeps its own, and the
player's body keeps one of its own.

## Behaviour

* **Which weapon.** A weapon is identified by the model the renderer draws for it: `cl.viewent.model`, which
  `V_CalcRefdef` sets every frame from `STAT_WEAPON` and clears at intermission (it is empty while dead and before
  the first client data). The model name (`progs/v_shot.mdl`, ...) is the key, so the axe and each weapon are
  told apart, and precache indices that change between maps do not matter. (Mission packs are not supported by
  this engine; their weapons would key the same way.)
* **Blood events.** A hit on the player or a nearby spray (`R_PlayerSurfaceBlood`, `R_WeaponSurfaceBloodAt`) goes
  to the weapon drawn in the most recent frame, the same weapon whose posed mesh places the spot. Everything
  parsed between two renders (damage, a new weapon stat, particles, however many messages) goes to the weapon
  drawn in the previous render, so nothing is split across a switch.
* **Switching.** A weapon without blood shows none; switching back shows that weapon's spots exactly as they were.
* **No weapon drawn.** While dead, at intermission or while loading, no weapon gets blood and none is washed or
  soaked. The respawn axe therefore carries nothing from the death.
* **Water and drying.** The weapon in hand is washed under water and soaked on leaving it, as before. Every other
  weapon only dries: its wet film runs down by the game time that passes (also after a level change resets the
  clock), it is never washed (it keeps its blood: blood never ages), and it is not soaked by an exit it was not
  there for. Paused frames change nothing.
* **The body.** The player's body, drawn only with the chase camera, has its own coating. It takes every player
  blood event, dead or alive and whatever weapon is held, and is washed and soaked with the player: the behaviour
  the single shared coating had before. Its spots are placed at random (deterministically), because the contact
  point the renderer finds is on the gun's skin, not the body's.
* **Demos** have their own coatings and never touch the live game's.
* **Pickups and other players** never show held blood: only the held-weapon and own-body materials have the
  coating switched on, as before. No texture or shared material is edited.

## Where

* `src/r_weapon_surface.js`: `WeaponSurfaceBank` holds a `WeaponSurfaceState` per weapon model plus `body`.
  `frameAll` (from `R_WeaponSurfaceFrame`) frames the body and the drawn weapon and `dry()`s the rest; `bleed`
  (from both blood events) adds to the body and to the drawn weapon. `R_ActiveWeaponSurface()` is the drawn
  weapon's state (a blank one when none is drawn) and `R_PlayerBodySurface()` the body's. The bank also answers the
  old single-state API for the drawn weapon, so the lens, post-processing wet film and older tests are unchanged.
* `src/r_newerskins.js`: the held-weapon material reads the drawn weapon's spots, the own-body material the body's.
* `src/host_cmd.js`: the `// weapon-surface` save line is now `{version: 2, body, weapons: {<model>: <coating>}}`
  (weapons that are bloody or wet only). A load checks everything first and applies all or nothing; keys must be
  model-like names, at most 64 weapons, and the writer keeps only what the reader accepts. A save made while a
  version 1 coating was still pending keeps it pending. A save from before this change (version 1, one shared coating) becomes the
  body's coating and that of the first weapon drawn after the load; weapons from the session before the load are
  cleared. Saves without the line keep the current coatings, as before.

## Checks

* `tests/weapon_blood_test.js` (12): shotgun, clean nailgun, shotgun; the axe has its own coating and a stat change
  before the next render does not split events; nothing reaches a weapon while none is drawn and the respawn axe is
  clean; water washes only the weapon in hand and nothing is soaked by an exit it missed; the body takes every event
  across switches, with its own spot placement; blood never ages while wet film dries for every weapon, across a
  level clock reset and not while paused; version 2 round trip including a wet-only weapon and the body, holstered
  clocks rebased, six kinds of bad data each rejected with nothing changed; version 1 load adopted only by a frame
  or event with a drawn weapon, old-session weapons cleared, the body and pending clocks rebased, a save made while
  pending loads back pending; the writer leaves out names and a 65th weapon the reader would reject; the blank
  no-weapon state cannot be written; the key comes from the real `V_CalcRefdef` / `V_CalcIntermissionRefdef`
  (axe drawn, dead, intermission); demo isolation.
* `tests/model_surface_native_test.js` (6), real `progs.dat` and Host save/load: the harness's frame helper sets the
  drawn weapon from the player's `weaponmodel`, as the server's `STAT_WEAPON` and `V_CalcRefdef` would (this CPU
  fixture does not parse client packets, so it does not cover intermission; the unit test above does). The save
  test expects the version 2 line; a new test carries two weapons' blood through a real `save` and `load`; the
  legacy-load test also checks the body is not dried by the clock jump; the death/respawn/seamless test checks that
  the body and the scattered shotgun keep their blood, the respawn axe is clean, and the final water wash cleans the
  body but not the shotgun.
* `tests/model_lighting_test.js` (8): a new test compiles held and body materials and checks each reads its own
  coating, also across a switch; the snapshot test now draws a weapon; two identity assertions compare states.
* Mutation checks, each failing a named test: one key for all weapons; no drying; drying keeping the water flag;
  every weapon framed as in hand; body skipped while dead; legacy adopted by any read; wet-only weapons dropped from
  saves; clock rebase only on the drawn weapon, or missing the body; any key accepted; version 1 keeping old
  weapons; body not framed; water reaching weapons while none is drawn; both materials reading the weapon; saving
  only the drawn weapon; the `(legacy)` entry not read back; the writer not filtering keys.
* Two independent reviews: the first found eight issues (one blocking: the axe and "no weapon" shared a key); the
  second confirmed them fixed and found seven smaller ones, all addressed here.
* Wider suites: `r_newerskins_test` 8/8, `weapon_review` 5/5, `weapon_modes` 6/6, `weapon_preload` 2/2,
  `axe_original` 5/5, `shotgun_test` 16/16, `weapon_rotor_test` 6/6, and (run by the reviewer) `held_framing_test`
  5/5 and `respawn_native_test` 17/17. Failures that exist without this change: `r_anim_test` 6/7
  (`normalSamplerUpdates`), and `weapons_test` / `weapons_refinement_test` need weapon archives not in this checkout.

Run with `QUAKED_THREE_MODULE=<three.module.js> node tools/run_tests.mjs tests/weapon_blood_test.js tests/model_lighting_test.js tests/model_surface_native_test.js`.

## Not checked

No browser capture of a weapon switch was made, and the browser GPU trials (`tests/model_lighting_gpu_trial.html`,
`tests/model_surface_gameplay_trial.html`) were not re-run. The shader path is the same one, now given the drawn
weapon's (or the body's) spots. Each coating keeps the same twelve spots as before.
