# Independent review: ending, death/reset and power-up sounds

Reviewed 18 October 2026 in
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, branch
`codex/demo-water-sounds`, based on pushed water commit
`0e96c121f3a76b30f8ba8b0706093b50ed49adf5`.

The reviewer independently traced the existing architecture before implementation
and authored only `tests/player_events_audio_test.js`,
`tests/player_events_native_test.js` and this review. Gameplay, audio and
packaging implementation belongs to the coordinating agent.

## Source conclusion

No outstanding blocking source findings in the reviewed increment. The change
reuses the existing stock `powerup_touch` observer, public client message parser,
hook/install boundary, host sound updates and SFX bus. It extracts the existing
water media-deck primitives into a small shared helper. No audio policy writes
health, item ownership, native timers, damage, respawn or completion state.

The sound observer is independent of the HUD's destructive reward drain. Its
before/after masks are captured at each confirmed touch, so two pickups in one
server frame retain both transitions. Distinct counts include Quad, Ring and
Pentagram with live native deadlines; suit and enabled Options cheat powers are
excluded. Public custom-progs fallback also filters cheat powers only when the
actual local peer/player/world pairing is present. Remote protocol fallback can
infer gained item bits, not same-power renewals or native deadlines.

Pair arming follows a genuine distinct acquisition, with a 1.8-second tail when
the count leaves two and resumption on three-to-two expiry within that epoch.
Restoring inventory alone does not arm it. The third cue requires a two-to-three
pickup. The parser fallback removes lost powers before applying gained powers,
so a same-packet replacement cannot invent a third acquisition.

Death notifications run before client health is replaced and allow the one-shot
to finish through death and a same-world respawn. Final victory requires an
actual finale message, base Quake identity and `maps/end.bsp`; ordinary
intermissions, episode finales, expansions and demos are excluded. Client clear
stops the audio history. Stop-all/shutdown release context-bound decks, and
pending play generations cannot restart an exited cue.

All seven eager asset URLs have startup priority before the generic background
sound rule and are explicitly included in both distribution inventories.

## Independent checks and evidence

The first complete independent implementation run passed **11/11**: six public
parser/audio checks and five stock-QC checks. Its retained log is
`quaked-player-events-independent-final2.log`. A later local-custom-progs cheat
regression passed with the other tests, giving **12/12** in
`quaked-player-events-independent-final3.log`. The final same-packet power
replacement regression passed in the final independent run: **13/13**, comprising
public parser/audio **7/7** and stock-QC/custom-fallback **6/6**, in
`quaked-player-events-independent-final4.log`. This final run covers the final
reviewed custom-cheat and replacement-mask fixes.

The native tests use real host map/spawn/begin commands, paired loopback,
stock QC pickup functions and actual server clientdata. They prove:

- Pickup sound survives the HUD consuming its own reward queue.
- A genuine same-power timer renewal plays once; touching an already consumed
  trigger produces no duplicate.
- An actual Ring collected in E1M3 travels through native `changelevel` to E1M8.
  Quad and Pentagram collected there at the same server time retain separate
  one-to-two and two-to-three transitions. Native deadlines exclude expired
  powers even before QC clears their stale item bits.
- Real suit acquisition and public cheat switches cannot fabricate distinct
  combinations. A supported `PR_SetCRC(0)` fixture selects the custom-progs
  fallback while retaining the real peer, cheat API and clientdata writer; it
  proves cheat filtering in that branch without claiming a full custom-game
  compatibility trial.
- Actual native `ClientKill` reaches clientdata parsing and plays one death/reset
  cue. Recorded playback and preexisting ownership remain silent.

The parser/audio suite exercises actual `CL_ParseClientdata` and
`CL_ParseServerMessage` boundaries, initial signon baseline, exact-two looping
and fade, three-to-two resumption, death/respawn, final-map/game-identity guards,
SFX bus ownership, pause/hide/mute/disconnect/Classic/demo gates and late play
completion after reset. Audio endpoints are doubles in these Node suites.

The reviewer inspected the coordinator's initial regression log (19/19 existing
water, native face, public face and hooks checks) and distribution/pack log
(8/8, zero failures). The reviewer also inspected
`quaked-player-events-combined.log`: **35/35**, including the existing 19, real
demo water 4, then-current player audio 6 and native/custom-fallback 6. The final
independent 13-test run above adds the replacement regression afterward.
Earlier independent logs retain fixture failures: the
initial endpoint lacked `window.location`, the packet-end probe was incorrectly
asserted to leave `msg_badread` false, and deathmatch-only BSP items were
mistakenly selected as single-player pickups. Those test fixtures were corrected
using real supported boundaries; production safeguards were not weakened.

The reviewer read `browser.json`: Chrome decoded all seven actual MP3s and
played their actual media elements through public clientdata/finale parsing,
with zero reported page errors. This independently read evidence verifies codec
and parser/media wiring through the protocol fallback. It does not establish a
complete played final-boss campaign or subjective owner listening acceptance.

The coordinator compared owner sources and copies at copy time. During the
reviewer's later asset check, the seven external loose source paths recorded
in `assets.json` were no longer present under
`/Users/bri/SOURCE/QuakedResources/sounds`. The reviewer did not alter those
sources. The reviewer independently verified all seven runtime files against
`assets.json` byte lengths and SHA-256 hashes; this is runtime-hash verification,
not a repeated current source-to-copy byte comparison. The manifest remains
copy-time provenance.

## Qualification and publication limits

This is independent source review and targeted public-interface qualification.
Owner listening acceptance, the maintained full exact-index gate, the requested
Dev commit/push and any production release are separate outcomes. The
coordinator must retain their actual receipts; this review does not waive a
gate or claim a commit, push or release succeeded.
