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
| Session / edition validation | `hexen2_profile_test.js`, `hexen2_filesystem_test.js`, `hexen2_catalogue_test.js` | Session descriptors and filesystem precedence are module-tested; the public game catalogue now lists Hexen II, its portals sibling and the demo, probes pak0..pak9, recognises loose `progs.dat`/`strings.txt`/`hexen.rc`, and reports found/validated/playable honestly (the demo stays unadvertised until its genuine fixture is verified). Selection/mounting is now engine-level: a playable entry plus a class yields a session plan (with rules/gamecode labels) and mounts gamecode, palette, demo1 and its entities through the existing loaders, placing the Paladin with native stats (`hexen2_mount_test.js`). The shelf click, native boundary and packaged smoke remain. |
| VM (Hexen layouts, opcodes, builtins) | `hexen2_progs_layout_test.js` (2), `hexen2_progdefs_test.js` (7), `hexen2_vm_test.js` (9) | Supplied base and Portal layouts validated; core ABI exercised. Unimplemented builtins still refuse by name (attack frames stop at `particle4`). |
| Model / collision | `hexen2_bsp_test.js` (4), `hexen2_model_test.js` (2), `hexen2_world_test.js` (2) | Eight-hull submodels, RAPO bounds, native hull selection and traces verified. |
| Codec | `hexen2_protocol_test.js`, `hexen2_demo_test.js`, `hexen2_wire_test.js` | Id collision table, native demo framing, and the private `1019 quaked-hexen2-v1` session preamble now round-trips (edition, gamecode mode, rules, class, gamecode CRC, simulation digest) with truncation/foreign-version/unknown-field/mismatch refusal. Native player bodies now round-trip too: `svc_clientdata` (view height, signed punch/velocity quantisation, weapon frame/armour/model, on-ground/water bits) and `svc_update_inv` (SC1/SC2 masked stat deltas, armour/rings, puzzle strings), with truncation and trailing-byte refusal. Those bodies are framed into a private player datagram (`svc_time` + `svc_clientdata` + optional `svc_update_inv`, `hexen2_stream_test.js`) that parses by opcode and refuses unknown/truncated/trailing data. The four native particle messages (`svc_particle/2/3/4`) now encode/decode in their Raven wire format (`hexen2_effects_test.js`), and two endpoints admit each other over a real framed TCP loopback and transfer a player datagram (`hexen2_peer_test.js`). The entity/effect stream is still pending; two endpoints now admit each other over a real framed TCP loopback and transfer a player datagram (`hexen2_peer_test.js`), while the packaged LAN UI/four-peer trial does not exist. |
| Two clients on one server | `hexen2_coop_spawn_test.js`, `hexen2_coop_move_test.js`, `hexen2_coop_leave_test.js` | Two native client slots become players through the supplied gamecode: Paladin and Crusader, distinct classes/models and native health/mana, both settled on the floor, with the gamecode selecting **distinct native co-op starts** once the multi-client co-op flag is set around ClientConnect; both then walk independently through `SV_ClientThink`/`SV_Physics_Client` (A north, B east) and stay on the floor; one can leave (gamecode `ClientDisconnect`, edict freed, the other keeps moving) and rejoin with a fresh edict and the same class. `spawntemp` (#93) allocates a normal edict for now — a recorded divergence from the native per-frame temp pool. |
| Native Paladin on demo1 | `hexen2_spawn_test.js`, `hexen2_player_test.js`, `hexen2_player_bounds_test.js`, `hexen2_boot_test.js`, `hexen2_class_stats_test.js` | Paladin placed by supplied gamecode (`models/paladin.mdl`, class 1, feet-origin box, settles on the floor) and receives the native class statistics: health 70..85, max_mana 84..95, strength/intelligence/wisdom/dexterity. |
| Movement | `hexen2_input_test.js` (1), `hexen2_physics_test.js` (1) | Synthetic usercmd advances the Paladin ~96 units over three frames; ten world frames run with moving monsters. Public input path and camera are not wired to a client. |
| Live soak | `hexen2_soak_test.js` | 120 physics frames with the Paladin walking and attacking on demo1 run without a script error; every entity origin stays finite and the player walks. The message writers (#52–59) and effect slots (#88/#89) were needed for the gamecode's attack feedback; start/end effects are now encoded into the reliable datagram with the native CE_* bodies (`hexen2_effectwire_test.js` round-trips all groups), and the soak asserts effect messages are present. Client-side effect rendering is still absent, but the client applies start/end effects to its effect table, the framed TCP peer carries an effect message, and every mapped native base-game effect sprite (32 CE types) loads through the sprite loader with real frames (`hexen2_effect_assets_test.js`) instead of borrowing Quake art. |
| Combat | `hexen2_combat_test.js` | **Verified.** A held attack on a live level monster reduces its health and leaves the Paladin unhurt. `aim` (44), `findradius` (22), `particle` (48) and `particle4` (86) were added to the Hexen table; `particle4` emits the standard particle burst at the origin and ignores the native radius/effect fields (presentation-only divergence, recorded). |
| Items | `hexen2_items_test.js` | **Verified.** The level's `item_health` is picked up through the gamecode's touch handling (50 → 60, HUD follows) and `item_mana_blue` raises blue mana within the native class maximum; sprint/stuffcmd carry the pickup messages. |
| Native HUD | `hexen2_hud_view_test.js`, `hexen2_status_test.js`, `hexen2_statusbar_test.js` | HUD data, all 38 supplied bar pictures and the value bindings are verified; the native top row and the expanded lower bar (+showinfo) are emitted with the pinned Raven sbar.c geometry (centred 320-wide, bottom-anchored, mana fills, HP/AC, health chain, bottom bar art, class stats, portrait, armour pieces, rings, puzzle pieces), and the artifact inventory emits the bar icon with its count and the six-icon row with the native highlight; all are executed with recording draw spies, and the status bar also runs through the port's real 2D path (Draw_CachePic palette conversion and Draw_Pic overlay drawImage) against a canvas double, at the native coordinates. **Canvas draw and packaged integration** are not yet exercised. |
| Native audio | `hexen2_audio_test.js`, `hexen2_audio_playback_test.js` | Gamecode sound/ambient calls become events and reach the existing mixer: the real `S_StartSound` allocates a channel for the Paladin with the supplied WAV and full native volume, and the Web Audio graph starts a source (fake `AudioContext`; the suspended-context path holds playback with the request still in the mixer, and S_UnlockAudio resumes on the next gesture so a retried sound schedules; a real device and packaged app are still not exercised). |
| Presentation plumbing | `hexen2_render_test.js` (1), `hexen2_client_view_test.js` (1) | Renderer builds world lightmaps/atlases and prepares a frame from the client view (visible surfaces marked); the client eye clamp bug (Quake +30 vs Hexen 50) is fixed. **No WebGL draw call.** |
| End-to-end trace | `hexen2_acceptance_test.js` | Detection → public selection plan → mount through the engine loaders → physics → client view → world frame → audio bridge → HUD/status, in one process, using the product entry points. Still not a drawn or networked session. |
| Public native smoke | — | **Missing.** No packaged-app UI path (shelf → source → class → difficulty → demo1) exists for Hexen II. |

Latest runs after the effect-sprite work: **103/103** Hexen assertions across 52 suites; the existing catalogue suite
(8/8) and the other regression sets remain green. The spawn hands `newclass` to the gamecode (resolved from the loaded
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
3. **HUD drawing**: the native top row, expanded lower bar and artifact inventory are emitted; the top row executes
   through the port's real 2D path against a canvas double. The real browser canvas and packaged integration remain.
   `particle4`'s native radius/effect cloud is also a recorded presentation divergence.
4. **Audio activation**: mixer scheduling is verified; the packaged app's Web Audio unlock/user-gesture path is not.
5. **Public smoke**: shelf → source → Paladin → demo1 through the public UI, not test-only boot.
6. **Codec**: the private session preamble and the native player bodies (`svc_clientdata`, `svc_update_inv`) round-trip
   with refusal cases; the player-channel datagram round-trips; native particle effect bodies, the sound/stop/position messages, their composition into the private datagram (after player state, parsed in order), and the fast entity update (three-byte U_* bits, long entities, origin/angle/model/frame fields) are verified; signon serverinfo (protocol/clients/level/precache lists), signonnum, setview, baselines, static entities, the entity-frame reference and clear-edicts lists now round-trip; the framed TCP loopback peer runs the whole signon then transfers a player datagram and a live entity update, and a client state builds its world from the real mounted level (343 model precaches, entity baselines, view entity, player stats and a live entity). The packaged LAN UI and the four-peer trial remain.
7. **Public/filesystem integration**: catalogue discovery/validation and engine-level selection/mounting are verified;
   the shelf click, native boundary and packaged smoke remain.

No owner deadline was supplied; none is invented here. Presentation and combat work must not be declared complete
because the underlying data paths are verified.

## Next actions

- Continue G1 with the drawn HUD, audible playback and the public smoke.
- Retroactively establish RED controls for the code-first presentation modules before claiming them for a candidate.
- Keep this record updated with each executed run; do not describe it as an owner trial or acceptance.


## Handover at round 50

- Branch/worktree: `h2` at `/Users/bri/worktrees/Quaked/Dev/h2`; the tree is clean after the final commit.
- Evidence: this ledger plus 40 Hexen suites run with
  `QUAKED_THREE_MODULE="/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js" node tools/run_tests.mjs <files>`
  from the worktree.
- Product entry points: `hexen2_mount.js` (plan + mount), `hexen2_boot.js` (level/player steps), the renderer/HUD data modules,
  the private session preamble/datagram/peer modules, and the native body codecs (clientdata, effects, sounds, entity updates).
- Still blocking G1: the packaged shelf click/native smoke, native entity/effect sync inside the packaged LAN UI with four
  real peers and a real client/server peer, a real browser canvas, and a real audio device. The presentation modules were
  written code-first, so their RED controls remain a separate obligation (recorded above).
- Nothing here is an owner trial, qualification, merge or release.
