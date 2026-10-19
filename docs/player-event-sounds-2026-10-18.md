# Ending, death/reset and power-up sounds

Current owner update, 19 October 2026: see [gameplay feedback](gameplay-feedback-2026-10-19.md)
for native-cue replacement admission, instant water ambience, capture fixes and
revised sky/DoF policy. Historical verification receipts below retain their
original tested source; they are not relabeled as proof of this successor.

Owner request, 18 October 2026: copy seven supplied MP3s into the project, wire
them to the matching game events, then commit and push to Dev. This increment
has no production release, gameplay-rule or asset re-encoding authority.

## Architecture and chosen behavior

The native face observer already brackets stock QuakeC `powerup_touch`, checks
that the touching player is this local single-player client and the item is an
armed trigger, then confirms a changed timer, item bits or consumed trigger.
Reuse that confirmation through a small subscriber fanout. The HUD's existing
reward queue remains independent and unchanged: drawing the HUD cannot consume
the sound's event. Each sound event captures before/after masks at the actual
touch so several pickups in one frame retain their individual transitions.

`SV_PlayerPowerMask` reads the paired player's item bits and native deadlines;
expired-but-not-yet-cleared bits and enabled Options cheat powers do not count.
Quad, Ring and Pentagram are three distinct powers; Biosuit is excluded. The
native game still owns every timer, item, health transition and completion.
Protocol-only/custom games use newly gained client item bits after full signon;
initial inventory and saved inventory arriving during signon are silent.
Protocol-only renewal cannot be inferred from an unchanged bit, so only native
confirmed touches provide renewal cues. Custom local protocol fallback also
filters this player's Options cheat switches.

`S_PlayerInventory`, `S_PlayerHealthChanged` and `S_PlayerFinale` are installed
through the existing engine/Newer hooks. Clientdata notifies before replacing
the old inventory/health; an actual `svc_finale` message notifies the ending.
`S_UpdatePlayerEvents` runs every host frame. A bounded 32-event queue decouples
parsing/QuakeC from streaming media without persistent state or a second mixer.

| Runtime file | Event and playback |
| --- | --- |
| `end_of_quake1.mp3` | Once for an actual finale message on base Quake's `maps/end.bsp`. Other episode finales, ordinary intermissions, expansions/add-ons and title demos do not trigger it. |
| `newerGame_die_reset.mp3` | Once when this player's clientdata changes from living to dead. Repeated dead packets and initial dead inventory are silent. It can finish during death or a same-world respawn, without retriggering. A cleared client/world stops it. |
| `on-quad-pickup.mp3` | One shot for a confirmed Quad acquisition or genuine native renewal. |
| `on-ring-pickup.mp3` | One shot for a confirmed Ring acquisition or genuine native renewal. |
| `on-pentagram-pickup.mp3` | One shot for a confirmed Pentagram acquisition or genuine native renewal. |
| `two-active-powerups.mp3` | A loop armed by a real second distinct acquisition. It plays while exactly two powers remain active and fades over 1.8 seconds when the count leaves two. The bounded trailing fade is the only overlap outside that count. It resumes when three drop back to two within the same client epoch. |
| `third-powerup-pickup.mp3` | One shot only for a real two-to-three distinct-power pickup. Refreshing one of three powers does not fabricate a fourth acquisition or replay this cue. |

Individual pickup cues and the combination layer may overlap. Same-power
refreshes restart that power's individual cue, without inventing a combination
transition. A client clear/new world starts a fresh audio epoch; no previous
life's cues or restored inventory can replay a pickup. A genuine later pickup
still uses its native before/after masks, including powers carried by native
level travel. The combination loop is not armed merely by loading two powers.

## Streaming, lifecycle and packaging

The existing water cue's small media-deck primitives were extracted into
`s_effectdeck.js` and shared by water and these cues. It reuses the already
unlocked Quake AudioContext, existing SFX master bus, per-deck gain, pending
play-generation guard, error status and unload/disconnect lifecycle. Sound
Volume applies once; Music Volume remains independent. The long MP3s stream
instead of keeping decoded PCM buffers permanently resident. The largest
combination source is about 122 seconds; no trimming or re-encoding is used.

Pause, menu/console, hidden page, mute, disconnected/unsigned client, Classic
mode and demo playback stop the new cues. Notifications suppressed by those
states are consumed rather than replayed when control returns. Death is an
explicit one-shot rather than an alive-only loop. Entering a finale stops the
other player event layers. `CL_ClearState`, `S_StopAllSounds` and `S_Shutdown`
reset or release the appropriate media/history, and pending play results cannot
resurrect a stopped cue. Failed media remains visible in
`S_GetPlayerEventsStatus`, without a new play request each frame.

All seven runtime files are byte-identical copies of the owner's source files.
The names with spaces were shortened only at the runtime destination. At copy time, every source file was read and compared directly. The loose external
originals subsequently became unavailable; no source mutation was performed by
this increment. Exact source names, byte lengths and SHA-256 identities are in
[assets.json](evidence/player-event-sounds-2026-10-18/assets.json). Both web and
desktop distribution inventories include them explicitly. Literal
`new URL(..., import.meta.url)` calls use the existing package resolver, and all
seven have startup priority so eager URLs cannot permanently bind a deck to a
background-data silent placeholder.

## Independent planning, verification and trial

An independent reviewer traced the native observer, client message boundaries,
cheat switches and ending classifications before implementation. The reviewer
independently authored `player_events_native_test.js` and
`player_events_audio_test.js`, exercising actual stock QC pickups and public
clientdata/finale parsing. Existing water, face and hook checks cover the shared
deck extraction and preserve the engine/Newer dependency boundary.

The browser trial decodes all seven actual MP3s and starts real media elements
through public clientdata/finale messages. This verifies codec support and event
wiring with no audio endpoint doubles; the native tests separately exercise
actual local QuakeC timing. It does not establish owner listening acceptance or
a fully played end-game session. The [browser report](evidence/player-event-sounds-2026-10-18/browser.json)
retains the exact scope and durations. Test logs retain initial failures and
corrected results rather than relabeling them as successes. The first combined
regression pass was 35/35 (including the new local-custom cheat filter); the final
independent pass passed 13/13 (7 parser/audio and 6 native checks), adding same-packet power replacement coverage. Original
water/face/hook regressions passed 19/19, demo water 4/4, and the updated web/desktop
pack contracts 8/8. Full gate receipts below remain separate from targeted tests.

To try: enter Newer Game with Sound Volume audible. Pick up Quad, Ring or
Pentagram and hear its supplied cue. Acquire two distinct powers for the
combination bed; a third adds its one-shot and fades the two-power bed. Let a
power expire and observe the exact-two policy. Renewing the same power should
repeat only its individual cue. Die, then respawn: the death/reset track starts
once. Finish base Quake's final map for its ending track; a normal level exit or
episode finale must not use the game-ending track. Music Volume does not control
these sound effects; pausing or muting silences them.

## Coordination and publication ledger

Responsible owner: this Codex session. Reuse the existing clean worktree
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup` on
`codex/demo-water-sounds`, starting at pushed water commit `0e96c121`. The main
checkout and prior `codex/remove-old-hud-faces` branch remain preserved.

Bluey onboarding was already read in this session. A fresh supported
`agent_whoami` attempt for this increment failed with enrollment `storage_error`,
correlation `5a1ed1f2c3b94042906d82de8409f2b9`. No task assignment, update,
completion or durable worker execution is claimed. The existing coordination
obligation is to find/reconcile the appropriate sound work on the shared board
when storage is restored, preserving this scope, evidence and actual owner.

Dev publication remains subject to the unchanged exact-index pre-commit gate:
distribution tests, web and desktop builds, Rust and maintained engine checks,
and universal Mac application build. Prior water build outputs and receipts are
retained before replacement. Successful final tree/build and publication
receipts live under `dist/staged/verification`; a source document alone does not
claim a successful commit, push, production release or owner acceptance.

A protocol review found one corrected transition error: when a clientdata packet
both removed a power and added another, counting gains on the old mask could
invent a second or third power. The fallback now removes lost bits before
classifying the new acquisitions, and independent parser regressions cover both
single-power replacement and replacement of one member of a pair.

Before the commit gate, the prior water build and exact-tree receipt
`326c7092418d4c1e97df94bf094686a86ef47999` were retained at
`dist/retained-staged-326c7092418d4c1e`. The exact tracked snapshot is about
2.9GB; the larger checkout size includes ignored build outputs. The gate uses
bundled Node 24.19.0 and the established shared Cargo target.
