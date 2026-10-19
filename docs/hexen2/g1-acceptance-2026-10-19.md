# G1 acceptance record — 19 October 2026

Status: **G1 NOT COMPLETE.** This record maps the G1 definition in
[the approved plan](../hexen2-support-plan.md#9-ordered-increments-and-completion-boundaries) (increment 2) to executed
evidence in the `h2` worktree, and lists what still blocks the first playable slice. It is an evidence ledger, not an
owner trial, not qualification and not permission to release.

## G1 definition (plan, section 9 item 2)

> Implement session/filesystem/VM/model/collision/codec foundations and native Paladin selection into `demo1`, using
> the supplied Installed retail gamecode first, with working movement/combat/items and native HUD/audio. … Complete the
> slice's RED → GREEN assertions and public native smoke before the owner receives a trial.

## Executed evidence

Run from `/Users/bri/worktrees/Quaked/Dev/h2` with
`QUAKED_THREE_MODULE="/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js" node tools/run_tests.mjs <files>`.

| G1 element | Evidence (test) | State |
| --- | --- | --- |
| Session / edition validation | `hexen2_profile_test.js` (9), `hexen2_filesystem_test.js` (9) | Foundations only: modules tested; no public catalogue/native-boundary integration, no shelf/source display. |
| VM (Hexen layouts, opcodes, builtins) | `hexen2_progs_layout_test.js` (2), `hexen2_progdefs_test.js` (7), `hexen2_vm_test.js` (9) | Supplied base and Portal layouts validated; core ABI exercised. Unimplemented builtins still refuse by name (attack frames stop at `particle4`). |
| Model / collision | `hexen2_bsp_test.js` (4), `hexen2_model_test.js` (2), `hexen2_world_test.js` (2) | Eight-hull submodels, RAPO bounds, native hull selection and traces verified. |
| Codec | `hexen2_protocol_test.js` (6), `hexen2_demo_test.js` (3) | Foundations only: id collision table, private `1019 quaked-hexen2-v1`, framing helpers. No live encode/decode round trip or network peer. |
| Native Paladin on demo1 | `hexen2_spawn_test.js`, `hexen2_player_test.js`, `hexen2_player_bounds_test.js`, `hexen2_boot_test.js`, `hexen2_class_stats_test.js` | Paladin placed by supplied gamecode (`models/paladin.mdl`, class 1, feet-origin box, settles on the floor) and receives the native class statistics: health 70..85, max_mana 84..95, strength/intelligence/wisdom/dexterity. |
| Movement | `hexen2_input_test.js` (1), `hexen2_physics_test.js` (1) | Synthetic usercmd advances the Paladin ~96 units over three frames; ten world frames run with moving monsters. Public input path and camera are not wired to a client. |
| Combat | `hexen2_combat_test.js` | **Verified.** A held attack on a live level monster reduces its health and leaves the Paladin unhurt. `aim` (44), `findradius` (22), `particle` (48) and `particle4` (86) were added to the Hexen table; `particle4` emits the standard particle burst at the origin and ignores the native radius/effect fields (presentation-only divergence, recorded). |
| Items | `hexen2_items_test.js` | **Verified.** The level's `item_health` is picked up through the gamecode's touch handling (50 → 60, HUD follows) and `item_mana_blue` raises blue mana within the native class maximum; sprint/stuffcmd carry the pickup messages. |
| Native HUD | `hexen2_hud_view_test.js` (1), `hexen2_status_test.js` (1) | HUD data, all 38 supplied bar pictures and the value bindings are verified. **No drawing**: no bar layout and no WebGL draw of it. |
| Native audio | `hexen2_audio_test.js` (1) | Gamecode sound/ambient calls become events and reach the existing `S_StartSound` bridge with native conversions; the named sample is a real supplied WAV. **No audible output** is verified (Web Audio activation/user gesture untested). |
| Presentation plumbing | `hexen2_render_test.js` (1), `hexen2_client_view_test.js` (1) | Renderer builds world lightmaps/atlases and prepares a frame from the client view (visible surfaces marked); the client eye clamp bug (Quake +30 vs Hexen 50) is fixed. **No WebGL draw call.** |
| End-to-end trace | `hexen2_acceptance_test.js` (1) | Detection → Installed Paladin session → boot → physics → client view → world frame → audio bridge → HUD/status, in one process. Still not a drawn or networked session. |
| Public native smoke | — | **Missing.** No packaged-app UI path (shelf → source → class → difficulty → demo1) exists for Hexen II. |

Latest runs after the class-stat fix: **73/73** Hexen assertions across 27 suites and **41/41** server, interpreter,
movement, aim, shotgun and enemy regressions. The spawn hands `newclass` to the gamecode (resolved from the loaded
program: offset 212 base, 214 Portal) and `setclass` (#66) records the class, so `stats_NewClass` applies the native
tables instead of returning through its class guard; sprint (#24) and stuffcmd (#21) carry the pickup/class text.

## RED → GREEN discipline

The plan (section 8) requires each new executable test to be written against the unmodified baseline before its product
change, with the failing assertion retained. Foundational work followed that order (layout/bounds/opcode/builtin
refusals, player bounds, spawn, walking, physics). **The later presentation modules (HUD data, status bindings, audio
bridge, view binding, renderer frame preparation) were written code-first**, with tests after the fact. Under the
plan's contract they are evidence of behaviour, not qualified RED → GREEN records; they need retroactive RED controls
against the pre-change baseline when the candidate is qualified. This is a process gap, not a passing waiver.

## Remaining G1 blockers

1. ~~Combat~~ — verified this round: the attack damages a level monster and the Paladin stays unhurt.
2. ~~Items~~ — verified: health and mana pickups both work; the class-stat fix (`newclass` handed to `setclass`) is
   covered by `hexen2_class_stats_test.js`.
3. **HUD drawing**: lay out and draw the native bar (data and art are ready). `particle4`'s native radius/effect
   cloud is also a recorded presentation divergence.
4. **Audio activation**: verify Web Audio unlock and audible playback in the packaged app.
5. **Public smoke**: shelf → source → Paladin → demo1 through the public UI, not test-only boot.
6. **Codec**: a live private-protocol round trip between real client/server state (foundations exist).
7. **Public/filesystem integration**: catalogue selection and native-boundary discovery for the supplied installation.

No owner deadline was supplied; none is invented here. Presentation and combat work must not be declared complete
because the underlying data paths are verified.

## Next actions

- Continue G1 with the drawn HUD, audible playback and the public smoke.
- Retroactively establish RED controls for the code-first presentation modules before claiming them for a candidate.
- Keep this record updated with each executed run; do not describe it as an owner trial or acceptance.
