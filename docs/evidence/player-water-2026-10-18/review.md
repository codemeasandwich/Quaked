# Independent review: demo face water and player water sounds

Reviewed on 18 October 2026 in
`/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup`, branch
`codex/demo-water-sounds`, based on
`0cb14d4dddf3c324f416b61adabed46fcf6a69c8`. This review covers the working
changes before the requested Dev publication. The reviewer independently
planned the public-interface checks and authored `tests/face_demo_water_test.js`
and `tests/water_audio_test.js`; the reviewer did not implement the gameplay,
audio or distribution changes.

## Conclusion

No outstanding blocking source findings after the corrections below. The
implementation reuses the existing face stages, overlay compositor, surface
drain, engine host updates, hook boundary and sound-effects bus. Live native
air remains authoritative and read-only; recorded playback receives an
explicitly identified visual estimate. Four bounded media decks supply the
requested cues without creating a parallel sound engine.

This conclusion is source and targeted-test qualification. It does not certify
a packaged Mac build, release, owner listening acceptance, commit or push.

## Findings and corrections checked

1. The original adapter explicitly disabled face water for every demo. The
   shared observation now samples actual recorded player geometry in the BSP
   and advances only a visual twelve-second reserve. A replay of real
   `demo2.dem`, through the public demo reader, message parser and entity
   interpolation, produced 987 signed-on samples, including 210 submerged
   samples. The public HUD state reached stage 10 and 100 percent visual air
   consumption.
2. Initial review found that death and respawn delivered between visible HUD
   frames could retain the old demo fill timestamp. `R_FaceHealthChanged` now
   resets `CL_WaterReset` on death and respawn alongside the overlay reset. An
   independently authored regression calls both public health notifications
   without an intermediate water observation and requires a fresh stage 1 and
   zero consumed visual reserve. It passes in the corrected run.
3. The first integration run exposed a native compatibility regression when
   `cl.viewentity` was unset in the existing native fixture: three established
   native checks failed. The final implementation selects server edict 1 only
   after `SV_FaceLocalActive` proves the paired local single-player ownership,
   matching the previous implementation. All six established native checks
   pass without weakening those tests.
4. Packaged asset URLs are evaluated when the new sound module imports. The
   distribution startup-priority rule now includes all four exact water asset
   paths before the generic background-sound rule, following the existing
   jingle's eager URL requirement. This closes the silent-placeholder risk by
   source inspection. Inventory tests cover both web and desktop inclusion;
   the lightweight production-transform bundle result reports zero warnings.

## Verification inspected

The reviewer directly ran the first independent suites: seven tests passed.
After adding the hidden-HUD death/respawn regression, the implementation owner
ran the corrected integration suites; the reviewer inspected their log output.

| Evidence log basename | Result and scope |
| --- | --- |
| `quaked-water-independent-tests.log.gz` | Independently run initial 7/7: real demo2, controlled BSP lifecycle, audio policy/envelopes/routing and late-promise cleanup. |
| `quaked-water-initial-tests.log.gz` | 26/26 existing face, audio volume and low-health regressions. |
| `quaked-water-native-tests.log.gz` | Initial 14/17; retains the three native failures described above and passing 3/3 hook-boundary checks. |
| `quaked-water-native-corrected-tests.log.gz` | Final 14/14: native face water 6/6, independent demo/geometry/lifecycle 4/4, independent audio 4/4. |
| `quaked-water-distribution-tests.log.gz` | Distribution and pack contracts 8/8, zero failures. |

These logs were read from `/tmp` (the independent log from `/private/tmp`);
the implementation owner is retaining copies beside this review. Failure
history must remain with the corrected results.

The public audio tests cover entry once per real dive, looping underwater,
bubbles during filling, suit behavior, 120ms walking fade-in and 1.8s tail,
Sound Volume bus ownership independent of Music Volume, immediate inactive
silence, shutdown/unload and a late play promise after surfacing. Audio and
AudioContext endpoints are doubles; the actual shared water observation and
public sound update run normally.

The reviewer also independently read each owner-supplied MP3 and its runtime
copy and verified byte equality, length and SHA-256 against `assets.json`. All
four matched, including the renamed `walking-in-water.mp3` copy. Only the
runtime filename changed.

## Limits and next action

The twelve-second demo reserve is a presentation estimate: demo packets do
not carry the original native `air_finished`. It cannot establish the exact
remaining air when a recording begins underwater and cannot alter damage or
health. Remote native air remains unknown.

At review time the coordinator's real-browser composition/decoder trial was
still running. Its result must be recorded separately; these Node tests do not
prove audible MP3 decoding, final rendered pixels or subjective sound levels.
The JavaScript production-transform result in `bundle.json` is a lightweight
bundle check, not a full web data-pack or universal Mac build.

The coordinator reported the required commit hook's full staged snapshot and
universal Mac build cannot safely run with current disk space. The source
review does not waive that gate or authorize bypassing it. Preserve this
qualified working increment and evidence; complete the mandatory hook with
adequate space, then perform the already-authorized Dev commit/push. Owner
trial/acceptance and any release remain distinct from that publication.
