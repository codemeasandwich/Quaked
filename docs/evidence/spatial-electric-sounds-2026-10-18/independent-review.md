# Independent review: full-clip spatial electrical sounds

Reviewed 18 October 2026 in
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, branch
`codex/demo-water-sounds`. The coordinator confirmed the current integration
base is `1ee2fb767638955614b391f5296d578be3563584`; the original planning snapshot
was `5c590342` before that clean Dev fast-forward.

The reviewer independently traced native attack/water/damage boundaries,
authored `tests/electric_native_test.js` and
`tests/electric_rogue_native_test.js`, ran their actual native-program tests,
reviewed the final production changes and wrote this report. A separate agent
authored and ran the spatial adapter suite. The coordinator implemented the
production code and owns the maintained gate and publication.

## Conclusion

No outstanding blocking source findings after the corrections below. The
implementation preserves native QC damage, ammunition, timers, traces and beam
messages. It observes the existing VM entry/leave/traceline boundaries rather
than inferring a hit from the rendered beam endpoint. Audio uses shared streamed
decks, the existing listener/spatializer and SFX bus, with independent source,
stream and contact anchors.

This source and targeted-test conclusion permits the maintained exact-index
verification gate to proceed. It does not waive that gate or claim commit,
Dev push, production release or owner listening acceptance.

## Owner selection and full-file contract

The checked role mapping matches `approved-selection.json`:

| Role | Original clip IDs |
| --- | --- |
| Shambler charge | 3, 9 |
| Shambler stop | 8 |
| Player firing | 20 |
| Player stop | 10, 5 |
| Target contact | 6, 14 |
| Miss / solid scenery | 2, 12 |
| Water contact | 4, 10 |
| Electric eel discharge | 28 |

The reviewer independently compared all twelve current source MP3s with their
runtime copies and checked byte lengths and SHA-256 against `assets.json`.
Every file is byte-identical. The earlier audition trim proposals are obsolete;
no trim, preview normalization, re-encoding or shortened stop excerpt was used
for these runtime assets.

Admitted voices start at media time zero and finish naturally across ordinary
charge, cast and release transitions. Existing tails may overlap the full stop
recording. Repeated pulses coalesce an existing matching voice; a whole firing
file repeats only after natural completion while fresh native pulses still
confirm firing. At the 24-voice limit new requests are dropped and counted,
rather than stealing an admitted recording. Pause, death, menu, mute, hidden
page, disconnect, world reset or audio shutdown are explicit lifecycle
cancellations and never fabricate a firing-stop cue.

## Native authority and source corrections reviewed

- The existing global `PR_StockProgs` remains restricted to its established base
  program identities. A sound-only gate additionally admits the actual owned
  Rogue program: whole-file CRC **48868**, 575762 bytes, SHA-256
  `3d8063a8c84e4660595fb9c52c50eff0f5d9bcde75535567f57a768a38314179`.
  Header CRC 5927 is an ABI marker and is not used as a program identity.
- Entry/leave scopes distinguish player `W_FireLightning`, Shambler
  `CastLightning` and Rogue `T_EELZap`. The central picture trace and all three
  `LightningDamage` traces remain separate. Direct `T_Damage` attempts record
  contact plus actual health/armour loss, including invulnerable contact with
  zero applied loss. Incidental `CanDamage` traces do not become invented beams.
- Review identified Rogue's actual `ammo_cells1` pool rather than the base
  `ammo_cells` projection. The final implementation uses the typed public field
  accessor for Rogue admission and confirmation. The native regression
  deliberately sets the legacy projection to zero while the actual Rogue pool
  contains twenty cells; actual QC consumes one and the pulse is observed.
- Native waist-deep liquid discharge consumes all cells and returns before the
  ordinary beam path. Water receipts use explicit `CONTENTS_WATER`; generic
  `trace.inwater` is insufficient because the hull walker also marks other
  nonempty, nonsolid contents. Review identified a dry-eye fallback anchor for
  waist-level discharge. The final fallback selects a verified water body point;
  the actual BSP regression requires its reported positions to be water.
- The existing ray sampler gained an optional predicate while preserving its
  water-or-slime default for existing shotgun callers. Native water-only
  sampling observes contents without changing trace globals or native physics.
- Shambler charge starts at actual `sham_magic1`; terminal `sham_magic12` emits a
  stop only after an actual cast. New world/program identity and error paths
  reset abandoned observation state. Explicit reset/isolation is tested;
  `PR_HostError`/`PR_RunError` reset wiring was inspected, without forcing a live
  fatal QC crash in these suites.

## Spatial and lifecycle corrections reviewed

Source voices follow the native emitter. Player firing uses the clamped closest
point of the native stream to the current listener, rather than its midpoint.
Contact voices retain their actual native contact in world space. The recorded
stereo signal is downmixed before point-source panning; existing Quake ear
amplitudes supply distance attenuation and StereoPanner supplies ear balance.

Independent review found and the coordinator corrected three audio conditions:

1. A player stop now requires **both** at least 0.25 seconds since the last
   confirmed pulse and actual release, weapon change or exhausted native cells.
   A timeout alone cannot invent cessation. A completed firing file does not
   restart after actual cessation while waiting for the hold to expire.
2. Source following snapshots native `freetime` as well as object identity.
   Freeing and reallocating the same edict object between updates freezes the
   former full-file tail rather than dragging it to the new creature.
3. A blocked matching contact remains eligible for coalescing, including across
   the update's inactive-voice sweep. Repeated native pulses cannot fill the
   pool with repeated rejected playback attempts. The first attempted fix was
   checked through that sweep and corrected before final spatial verification.

The final spatial suite includes regressions for all three conditions and passed
17/17. Source review confirms the final guards and bounded state/queue/pool
limits. Native events and diagnostic draining fan out independently, so reading
evidence cannot steal audio or HUD observations.

## Direct native verification

Exact command run from this worktree:

```sh
QUAKED_SHAREWARE_PAK=/Users/bri/SOURCE/Quaked/.distribution-cache/shareware.pak QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/electric_native_test.js tests/electric_rogue_native_test.js
```

Final result: **10/10 passed**, base **7/7** and actual Rogue **3/3**, in
`/private/tmp/quaked-electric-native-independent-final2.log`.

Base tests run actual map/spawn/begin, paired loopback and QC attacks. They prove
one-cell normal fire, the central trace plus three damage rays, actual target
health/armour receipts, invulnerable contact, a miss, actual waist-water
all-cell discharge without a normal beam, dry firing across actual BSP water,
real Shambler charge/cast/stop functions, negative scope gates and independent
observer fanout. A seeded comparison with the sound identity gate disabled
matches native ammunition, target health/armour, final trace globals and RNG
call counts.

Rogue tests load its actual owned `progs.dat` and R1M3 map. They execute actual
`eel_melee` -> `T_EELZap`, actual `WaterMove`, actual damage and actual Rogue
lightning ammunition code. Eel damage receipt equals the native player health
loss; the radius discharge has no fabricated beam. Mission qualification does
not change global stock qualification. Unknown program, wrong model, demo and
unpaired connection controls remain silent.

The Rogue test mounts missing registered `progs/*` resources with bounded
positional reads from `/Users/bri/quaked/Quake/pak0.pak`; it does not duplicate
that entire 171MB archive. Its mission input is
`/Users/bri/quaked/Dissolution of Eternity/pak0.pak`, or
`QUAKED_OWNED_PAK` when explicitly supplied. These owned archives remain
read-only and are separate inputs from ordinary checkout-only maintained tests.

## Retained failure history

The earlier failed runs are retained, not reclassified as successful checks:

| Log | Result and correction |
| --- | --- |
| `quaked-electric-native-independent.log` | 5/10. Initial soldier placement was behind obstructing geometry; E1M3 Shamblers were excluded at Normal by actual spawnflags; shareware alone lacked registered `progs/k_spike.mdl` required by Rogue. |
| `quaked-electric-native-independent-corrected.log` | 8/10. Base fixtures and registered resource reads corrected; remaining eel fixture incorrectly rejected any `trace.inopen`, whereas actual eel QC rejects only a combined open/water crossing. |
| `quaked-electric-rogue-fixture.log` | Diagnostic 1/3 Rogue run retained actual wet points, hull-safe placements and traces proving the fixture predicate mistake. |
| `quaked-electric-native-independent-final.log` | 9/10. Eel pulse observed; fixture had not run native `WaterMove`, so required native `FL_INWATER` was still unset and QC correctly withheld damage. |
| `quaked-electric-native-independent-final2.log` | 10/10 after actual `WaterMove` established the native flag. No synthetic flag, callback, fake program identity or gameplay-rule change replaced the missing native lifecycle step. |

The corrected soldier geometry follows an already-proven native shotgun test
position. Shambler execution uses an actually spawned E1M6 monster. These were
fixture corrections; final production corrections are separately identified
above.

## Other inspected evidence and limits

The reviewer read `/private/tmp/electric-spatial-tests.log`: **17/17 passed**.
That independently authored suite drives the public event adapter through real
Quake spatialization with media/AudioContext endpoint doubles. It covers role
mapping, closest-point math, stereo reversal/distance, moving source/fixed
contacts, full-file tails and natural completion, saturation/reuse, alternatives,
all lifecycle cancellations and the corrected stop/reuse/rejection conditions.
Together with the directly run native suites this is **27/27** distinct targeted
checks. The coordinator separately reports the related regression run and owns
its retained log and full maintained gate receipts.

The reviewer read `browser.json`: Chrome decoded all twelve complete original
recordings; real streamed charge playback through the production adapter and
SFX spatializer reversed left/right with listener orientation and attenuated
with distance. Complete-file OfflineAudioContext energy measurements reversed
the actual output ears. No page errors were reported. This browser trial uses
controlled client metadata; the native suites independently establish event
provenance.

These results do not claim subjective owner listening acceptance, final mix
acceptance, a complete played base/Rogue campaign, a full production build or
publication. Those outcomes must remain tied to their actual receipts. No
additional broad tests are requested by this review before the maintained gate.
