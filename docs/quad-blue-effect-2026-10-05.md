# Quad Damage blue spark port — 2026-10-05

## Current owner revision: sparks removed

The owner subsequently requested removal of the Quad Damage sparks.
`r_powerups.js` no longer imports or creates the particle emitter. The white
flame renderer, blue surface tint and blue environmental light are retained.
The imported assets/helper below are historical source, with no live Quad wiring.
The current public gate passes17/17 checks, including explicit absence of spark
meshes, unchanged flame shaders/color, Classic isolation and lifecycle disposal.
[Current verification](evidence/quad-no-sparks-tests-2026-10-05.txt).
Earlier spark/GPU receipts below describe the prior increment.

The owner requested the blue Quad pickup effect from the extracted Quake archive,
retaining Quaked's existing white flame. This supersedes the earlier purple Quad
halo/tint/light specification in `powerup-flames-2026-10-04.md` for Quad only.

`src/newer/render/r_powerups.js` now attaches the donor blue central and lower spark layers,
uses blue native-surface emission and a `[0,0,1.1]` light with radius metadata80.
The white `[1.5,1.5,1.5]` volumetric fire, its native geometry fuel and glyph guard,
and `src/newer/render/r_powerupfire.js` are unchanged. Native pickup shape, artwork, gameplay,
collection, inventory, Classic mode and other powerups retain their owners.

## Source and adaptation

`newer/effects/quad/quad-effectinfo.txt` retains the donor's exact Quad block
from `Id1/PAK3.pk3`, effectinfo lines6142–6216. `provenance.json` records the
archive, definition and atlas hashes. The original compiled `progs.dat`
`item_artifact_super_damage` sets `traileffectnum` to `quad` for
`progs/quaddama.mdl`; there is no Quad-specific QuakeC emission timer.

`quad-particles.png` losslessly crops original particlefont RGBA tiles0–7 and61
into nine128px columns. The shader uses inset UVs and the supplied texture,
not a generated spark substitute. The lower layer's tex0..7 upper bound is
exclusive, so it samples0–6; tile7 is retained as source context.

Quaked uses Three.js rather than DarkPlaces' particle engine. The small
`r_quadparticles.js` adapter (never wired into the game; deleted in [44g], debt D9, by the owner's decision) retains the four count/size/color/fade/jitter/
stretch/friction/rotation configurations, and integrates friction on a fixed
60Hz reference.64 repeating batches provide4800 persistent instanced quads.
This is a prewarmed deterministic repeating cohort, not a bit-exact recreation
of DarkPlaces' stochastic frame-dependent trail emission. Different pickup
origins seed different cohorts; the native item transform drives their pose.
Negative particle sizes are suppressed; the donor's tiny third layer expires
almost immediately rather than creating inverted expanding geometry.

The existing bounded light selection, receiver reach, shadow slots and gentle
Quad radiance pulse remain in use. Radius80 is donor metadata; effective room
lighting still follows Quaked's existing power-based range. No separate light
system or donor model replaces native geometry. Particle depth/clipping tests
and zero-alpha auxiliary MRT outputs preserve opaque receiver packets.

Engine semantics were checked against the primary
[DarkPlaces particle implementation](https://raw.githubusercontent.com/DarkPlacesEngine/darkplaces/master/cl_particles.c).

## Ownership and failure handling

Each pickup owns its particle geometry/material and texture request. Collection,
model replacement, feature disable and map clear dispose those resources with
the existing registry. A late texture callback cannot reconnect a retired item.
An unavailable atlas leaves the existing white fire and blue illumination
working, logs a warning and suppresses the missing spark layer. Texture URLs use the existing `COM_NewerURL` pack-aware loader, with a
module-relative loose fallback for subpath serving. Packed and loose deployments
therefore retain the established asset-loading boundary.

## Trial and acceptance

Open `tests/powerups_gameplay_trial.html?kind=quad` through the local server;
Orbit inspects the real E1M1 pickup, Effects toggles presentation and Collect
uses native QuakeC touch handling. `tests/powerups_gpu_trial.html` provides
Quad focus, item/camera rotation and20-second animation with bounded GPU checks.
Normal use: choose Newer Game, then find the E1M1 Quad. Reload the browser to
load the changed module. The owner should accept the blue density/brightness
alongside the retained white flames. Visual acceptance, commit, push and release
are not implied.

## Verification

Independent planning and source review found no blocking preservation/lifecycle
issue. Independently authored public-interface tests cover exact light values,
unchanged fire shaders/color, native attributes/gameplay, deterministic bounded
animation, Classic isolation and disposal. A separately written pixel decoder
verified all nine PNG tiles byte-for-byte against the original bottom-origin
BGRA TGA. The current13 existing powerup tests plus4 independent cases pass.
- [Focused tests](evidence/quad-blue-tests-2026-10-05.txt): 17/17 pass.
- [Production GPU checks](evidence/quad-blue-gpu-2026-10-05.json): native
  pickup rendering and separate white-flame volume checks pass; all measured
  GL errors are zero. White volume animation changes39,700 RGB components with
  camera and native pose fixed, without nonfinite output.
- [Isolated final particle GPU check](evidence/quad-blue-sparks-2026-10-05.json):
  1,858 emitting pixels; time advancement changes7,839 RGB components; repeated
  time is exact. Full-wall occlusion yields zero spark RGB, auxiliary receiver
  attachments remain zero and GL error is zero. The final pack-aware loose
  atlas load succeeds.
- [Source identities](evidence/quad-blue-source-2026-10-05.json) tie the receipts
  to the implementation; the existing white-fire source SHA256 is unchanged.
- [Preview](evidence/quad-blue-preview-2026-10-05.png) shows blue sparks and
  native white fire together on the original Quad model.

The first isolated-wall test used a standard single-output wall material in a
four-attachment framebuffer and reported GL1282/failed occlusion. Correcting the
oracle to output all four attachments produced the passing check; both receipts
are retained. The production fixture also requested its existing unused
`/tests/newer/enemies/index.json` path, which returned404; the atlas loaded200
and no shader/runtime error occurred. Software-rendered screenshot capture in
an initial native-game attempt timed out; this is not a frame-rate qualification.
The live native-game trial did not complete within a bounded160-second
headless software-rendered attempt; its owned helper was stopped. Native
collection was therefore not verified live in this request. Public lifecycle
and native draw-dispatch tests passed; the remaining acceptance action belongs
to the owner: use the interactive native gameplay trial to inspect and collect
the pickup. [Retained trial state](evidence/quad-blue-gameplay-2026-10-05.json).
This limitation does not change the tested GPU rendering result.
