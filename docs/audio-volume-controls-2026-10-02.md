# Separate music and sound volume controls

Options now contains adjacent **Sound Volume** and **Music Volume** sliders. Both use the existing 0–1 archived console variables: `volume` for every non-music sound, and `bgmvolume` for classic soundtrack tracks and streamed ambient music. Keyboard arrows, Enter/touch adjustments, bounds, saved settings and reset defaults follow the existing menu controls. Seventeen rows still fit the original menu; other action identities are preserved.

## Audio routing and reuse

Sound effects already share the existing `snd_dma` gain node, including weapons, monsters, environment/water/wind loops and local menu sounds. It remains controlled only by `volume`. The public `S_GetMasterGain` name is retained for compatibility and documented as the effects bus.

The ambient music player already owns a music gain and applies `bgmvolume` there. Its host adapter now sends that bus directly to the audio context destination and no longer suppresses playback when the effects slider is zero. Its gameplay, pause, menu, visibility, combat, autoplay and shutdown rules remain unchanged.

Classic CD-style playback already had a gain connected to the audio destination, but also set the HTML media element to the same volume. That multiplied two music gains: a fresh track at 0.5 played at 0.25. Routed playback now keeps the element at unity and applies `bgmvolume` once through its music gain, on both start and update. Playback without a Web Audio route uses the media element's volume directly. The unused dependence on the effects gain is removed.

No new mixer abstraction or volume variable was introduced. Global `nosound`/audio shutdown/stop commands retain their established lifecycle behaviour; setting the Sound slider to zero is independently different from those global controls. Reset defaults uses Sound 0.4 and Music 1. Existing ambient baseline/swell constants are retained, so removing effects attenuation increases ambient output at the same stored settings; the Music slider controls that balance.

## Verification and trial

**17/17 public-interface checks passed**, independently reviewed: actual menu labels/knobs, 17-row navigation, keyboard and touch clamping, separate `quake_cvar_volume`/`quake_cvar_bgmvolume` persistence, archived config values, default reset, all 0/0.5/1 sound/music combinations, classic gain applied once, direct playback/routing-failure fallback, ambient output routing and independent mute, pause/resume, visibility, stop and shutdown. [Final output](evidence/audio-volume-tests-2026-10-02.txt), [implementation identity](evidence/audio-volume-identity-2026-10-02.json).

The retained first **24/25** run included duplicated ambient-player cases and failed an archive-string expectation: the existing public `Cvar_SetValue` stores six-decimal strings. The assertion was corrected to that established format without changing persistence code. [Initial output](evidence/audio-volume-tests-attempt-01-2026-10-02.txt).

The [Options preview](images/options-music-sound-volume-2026-10-02.png) renders the actual menu code and original bitmap graphics through a software canvas. Reproduce with the existing `tools/render_credits_preview.mjs --options` helper and installed Three/canvas runtimes. Audio endpoints in the tests are doubles; this establishes graph/gain behaviour rather than an audible browser playback measurement.

Reload the app, open **Options**, and adjust either slider. Sound 0/Music positive should leave tracks audible while muting effects; Music 0/Sound positive should do the inverse. Both preferences persist. The owner authorised committing and pushing this increment. Audible browser playback and owner acceptance remain unqualified by the automated checks above.
