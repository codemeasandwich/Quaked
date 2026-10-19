# Spatial electrical sound integration — 18 October 2026

Current owner update, 19 October 2026: see [gameplay feedback](gameplay-feedback-2026-10-19.md)
for native-cue replacement admission, instant water ambience, capture fixes and
revised sky/DoF policy. Historical verification receipts below retain their
original tested source; they are not relabeled as proof of this successor.

## Owner scope and selections

The owner approved integration, testing, a commit and push to Dev after audition
round 3. Every recording is the full original file, copied byte for byte from
`/Users/bri/SOURCE/QuakedResources/sounds/Lightning`; no normalization, trimming,
artificial fade or duration cutoff is applied. Asset provenance, durations and
SHA256 values are in `evidence/spatial-electric-sounds-2026-10-18/assets.json`.

| Native cue | Clip numbers | Spatial anchor |
| --- | --- | --- |
| Shambler charge | 03, 09 alternating | Creature source, follows its movement |
| Shambler completed cast | 08 | Creature source |
| Player firing | 20 | Closest point on the actual beam to the listener |
| Player stops firing | 10, 05 alternating | Player source |
| Target contact | 06, 14 alternating | Actual contact point per target |
| Miss | 02, 12 alternating | Actual native beam endpoint |
| Water contact | 04, 10 alternating | First verified water crossing/contact |
| Electric eel discharge | 28 | Eel source; target contacts remain separate |

The source, stream and contact positions are independent. Every voice reuses the
existing Quake listener orientation and distance spatializer. A mono point-source
downmix precedes a real Web Audio StereoPanner, then the existing SFX master bus.
Listener turns reverse ear balance; distance attenuates both ears. No second
AudioContext or master volume system is introduced.

## Native facts and compatibility boundary

`sv_electricsounds.js` observes existing QC enter/leave and native traceline
boundaries. It neither changes attacks nor infers sound events from rendered
lightning. It records W_FireLightning, CastLightning, sham_magic1/sham_magic12
and Rogue T_EELZap. Damage contacts are scoped to the actual attack and attacker;
armor and invulnerability contacts still count. Incidental CanDamage/death rays
cannot replace the central beam. Diagnostics have an independent bounded queue,
so draining receipts cannot steal audio events.

Admission requires Newer Game, the actual paired local single-player connection,
a matching client/server world and a living attacker/player. Base stock programs
retain their existing qualification. Rogue is admitted only by a sound-specific
CRC 48868 check: the owned progs.dat SHA256 is
`3d8063a8c84e4660595fb9c52c50eff0f5d9bcde75535567f57a768a38314179`.
The general PR_StockProgs gate is unchanged. Rogue's typed ammo_cells1 field is
used; its legacy ammo_cells field does not determine a real electrical shot.
Unknown programs, Classic Game, demos and remote games do not invent events.

Water means native CONTENTS_WATER, not the trace_inwater flag (which can represent
other contents). The existing bounded rayWater sampler is reused with an optional
water-only predicate; its default water/slime behavior is preserved. A submerged
player's native radius discharge has no invented beam; its water cue uses a
verified wet body/waist/feet point. The eel's native radius zap likewise has no
invented beam; actual damage targets get their own contacts.

## Full-file playback and failure behavior

All media is non-looping. Clip 20 can repeat only after natural completion and a
fresh confirmed native pulse while firing still continues. Repeated pulses do not
restart an admitted recording. A stop cue occurs once after at least 0.25 game
seconds since the last pulse AND actual release, weapon change or cell exhaustion.
A timeout while the trigger stays held cannot invent a release. Charge, strike,
contact and stop tails may overlap, preserving every admitted full recording.

The pool is bounded at 24 voices, with 128 pending events and 128 actor states.
Matching active contacts coalesce. Saturation drops new requests instead of
stealing or cutting a voice. A rejected/failed media deck remains observable and
coalesces repeated requests until lifecycle reset; it cannot create a per-frame
retry storm. Alternatives use a separate deterministic counter, never gameplay RNG.
Source positions freeze when a creature dies, is freed or is replaced, including
same-object reuse between frames detected by native freetime. Fixed contact tails
stay at their original point. Pause, death, intermission, menus, hidden window,
mute, disconnect, map rewind, shutdown and unavailable audio cancel immediately
without fabricating a stop cue. Reset/shutdown also invalidate pending play results.

## Verification and how to try

Current focused verification passes 27/27 checks (7 base native, 3 Rogue native,
17 spatial), plus 56/56 related regression checks. Chrome decodes all twelve
recordings and confirms left/right energy reversal with no page errors.

Independent tests execute actual base QC attacks and the owned Rogue program,
including native eel_melee -> T_EELZap and native WaterMove. Separate public audio
adapter tests use the real Quake spatializer and controlled media endpoints. They
cover source movement and reuse, nearest beam geometry, separately panned victims,
listener turns, attenuation, full tails/alternates, stop timing, voice saturation,
rejected playback and lifecycle cancellation. See `independent-review.md` and the
compressed logs in the evidence directory for exact commands and fixture repairs.

The Chrome check decodes all twelve full MP3s, starts a real streamed charge via
the production adapter, and measures complete-file OfflineAudioContext left/right
energy before/after a listener turn. Browser client metadata is controlled here;
native QC provenance is independently checked, rather than claimed from this
fixture. `browser.json` retains actual results. No listening acceptance or complete
played level is claimed by the agent.

To try: run Newer Game with the sound effects volume enabled. Fire Lightning at a
wall, a living target and across water; release and change weapons. Turn while a
Shambler charges, move away during its attack and listen for the separate contact
position. In Dissolution of Eternity, approach an eel underwater. Long admitted
clips intentionally finish across ordinary attack transitions. Compare Classic
Game to confirm the add-on remains gated.

The explicit distribution manifest includes all twelve files, and both web and
desktop startup inventories assign them priority 0. The maintained exact-index hook
must pass distribution contracts, web/desktop builds, Rust tests, maintained engine
tests (now including base electrical native and spatial regressions) and the universal Mac build before committing. Its staged receipt and
inventory source must match the committed tree; signed app validation and exact
remote Dev hash readback distinguish tested delivery from a source-only change.
Owner listening acceptance remains separate from this authorized Dev publication.

## Coordination and publication ledger

Responsible owner: this Codex session. Implementation reuses
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, branch
`codex/demo-water-sounds`, base Dev `1ee2fb767638955614b391f5296d578be3563584`.
Primary-checkout unrelated work and earlier HUD branches remain preserved.
Independent reviewers own only their tests and review record.

Bluey onboarding was read earlier. Supported agent_whoami remains unavailable
with enrollment storage_error (latest correlation
`bb695e91400641298cf43aaecac0a632`). No board mutation or worker execution is
claimed. This ledger retains scope, evidence, actual owner and next action until
board access returns. Current next action: finish independent verification, retain
prior staged receipt, run the enforced exact-index gate, commit and push to Dev,
then verify exact remote identity. Reconcile the appropriate existing sound card
when the service is available. No separate release or owner acceptance is implied.

Prior successful environment-sound staged output and receipt tree
`80d416a2cbb3819c5b03f4d892d4b338b613a645` were verified and retained at
`dist/retained-staged-80d416a2cbb3819c` before the hook replaces its output.
Publication evidence for this exact candidate is retained under the new
`dist/staged/verification`; no gate or build evidence is inferred from the prior app.
