# Continuous surface relief correction — 2026-10-04

Publication authority update: the owner requested **commit and push** on
2026-10-04. This supersedes the earlier local-only authority statements below;
those statements and receipts describe their original verification stage.
See [combined commit verification](enhancements-commit-2026-10-04.md).

The owner asked for connected, deterministic virtual rock relief while retaining
texture artwork, base geometry and collision, and identified the principal
visible failure as **flat relief or incorrect lighting**. This correction reuses
the existing connected-surface walker, supplied RockField generator, presets,
two-worker cache, baked tiles and world/brush material integration. It does not
substitute tessellation or physical displacement. The infographic is a visual
reference; its geometry illustrations do not override the owner's no-geometry
requirement.

This is a working correction for the existing renderer and audited levels.
Owner appearance acceptance and performance qualification remain open. The
single-projection limitation below prevents claiming universal arbitrary-surface
support. No commit, push or release is included in this work.

## Defects and implementation

1. `r_rocksurfaces.js` previously seeded from all component vertices. Adding a
   neighboring face or discovering a bridge changed existing heights. Seeds now
   depend only on map identity, canonical material name and wall/ground role.
   Components still govern connected coverage, bounds and batching; they no
   longer define randomness. Separate pieces of the same material sample the
   same world field before they are known to connect. This is necessary to join
   them later without changing either original region.
2. `r_rockshader.js` normalized projected coordinate axes as if they were an
   orthonormal tangent frame. That loses their physical lengths and can change
   slope signs/scales. It now reuses `qrHeightGradients` from
   `r_heightshadows.js`. For height `h(u,v)`, physical normal perturbation uses
   `amplitude * 256 * (dh/du * grad(u) + dh/dv * grad(v))`. The same gradients
   convert view and light travel to procedural coordinates. Native texture
   gradients convert the accepted view ray directly to pigment UVs; there is
   no inverse of a potentially singular projected-UV matrix or screen-axis
   conditioning fade. One hit distance and one shift limiter control both
   height and pigment samples.
3. Per-polygon UV clipping treated every internal BSP subdivision as a material
   boundary. It forced the departing polygon's parallax toward zero while its
   neighbor retained an offset. The six clipping attributes and shader clamp
   are removed. Repeat-wrapped native textures support the extrapolated sample;
   unchanged triangle rasterization still owns coverage and silhouettes. This
   also removes artificial boundaries at partial-edge T junctions.
4. An unseen brush's undefined transformed distance passed the scheduler's
   `distance > 512` rejection. It now defaults to infinity until the actual
   brush-draw hook supplies a distance/visibility mark. The native eight-face
   E1M4 door test verifies bounded dispatch and transformed rest coordinates.

The 40-step view march, three refinements, .18 view-depth cap, .75 texture-UV
shift cap and full-depth normal/cavity/shadow response are retained. These are
existing artistic/aliasing limits: view parallax is intentionally compressed at
large amplitudes and is not exact geometric displacement. Ground retains its
lower preset amplitudes and existing height function. No texture art, native UV,
lightmap UV, position, normal or collision data is rewritten by the correction.

## Research and architecture decisions

[Mikkelsen, Bump Mapping Unparametrized Surfaces on the GPU (2010)](https://mmikk.github.io/papers3d/mm_sfgrad_bump.pdf)
supports deriving perturbed normals from surface position, height and the original
normal. The implementation already contains the required derivative helper;
reuse avoids another tangent-frame system.
[Tatarchuk, Practical Parallax Occlusion Mapping (2006)](https://advances.realtimerendering.com/s2006/Tatarchuk-POM.pdf)
describes tracing view and light rays against a height field for virtual depth
and self-occlusion without extra triangles. The current renderer uses that class
of approximation, retaining its existing bounded marches and caps.

The supplied deterministic 2D function and integer global sample addresses were
already appropriate for adjoining tile windows. No per-tile random seed, edge
stitching, per-tile normalization or replacement noise library was needed.
Height tiles retain exact matching shared samples and gutters in all directions.
Changing the seed contract required rebuilding the maintained prepared assets:
`tools/bake_rockfield.mjs` regenerated the manifest and seven nonempty changed
level files. Tests validate all 29 packaged map records and 144 real chart tiles
against source hashes, signatures and newly generated half-float data. The
existing signature contract rejects old chart seeds rather than serving stale
heights. The binary format did not change.

## Verification

Independent planning identified seed, clipping and projection defects before
implementation. A separate agent wrote the public continuity and GPU metric
tests. Final independent source review found no actionable error in the bounded
correction, while retaining the limits below.

The [source identity receipt](evidence/rockfield-correction-source-2026-10-04.json)
records the base commit and SHA-256 of the actual uncommitted implementation,
shared helper, generator, prepared-map manifest and regression sources.

- [Combined automated receipt](evidence/rockfield-correction-tests-2026-10-04.txt):
  **61/61** tests pass across generator, connected surfaces, growth/bridging,
  runtime, native materials/brushes, cache, prepared maps, height shadows and
  loading readiness. Native coverage audits include all 21 PAK levels.
- [Actual GPU continuity](evidence/rockfield-continuity-gpu-2026-10-04.json): eight
  bounded draws, real production workers, 36 tiles per profile, unchanged native
  attributes/albedo, and populated normal/albedo attachments. Both wall and
  ground pass unsplit/split/T-junction comparisons. Final-image mean differences
  are at most .00355 on a 0–255 channel scale; isolated outer-edge rasterization
  pixels are not claimed bit-identical. Both roles exhibit nonzero relief.
- [Physical normal oracle](evidence/rockfield-metric-gpu-2026-10-04.json): four
  actual shader draws on an oblique wall, two view directions and 0/45-degree
  camera roll, with `h=.5+u/16+v/32`. Independent analytic world normals agree
  with GPU readback: mean vector error .00073–.00107, below .003. Maximum error
  stays within the derived R16F/normal-encoding bound .02206. Every GL error is 0.
- The exact original shader from base commit
  `b229ee1f039d01aab20e904c933eb487a46c5bbb`, served through a temporary localhost
  override without editing the workspace, fails all four oracle cases with
  mean errors .00749–.00818. See
  [original-shader countercheck](evidence/rockfield-original-metric-gpu-2026-10-04.json).
  A Node load-hook substitution of the original chart module likewise fails
  two of the three new public tests: expansion and bridging. These tests detect
  the original defects rather than merely accepting both implementations.
- [Native E1M1 GPU evidence](evidence/rockfield-native-gpu-2026-10-04.txt): real
  client/server, rock receivers in the four-attachment target, no GL or runtime
  errors, and all requested tiles eventually resident. The local prepared-map
  load hit the existing five-second timeout, so this observation exercises the
  procedural fallback, not a claim of live prepared-map startup success.
- [Native timing](evidence/rockfield-native-timing-2026-10-04.txt): 59 frames per
  mode at forced 2560×1440 measured mean 144.93ms off / 184.74ms on, median
  149.90 / 183.30ms. The base scene is already slow in this environment; these
  figures are not performance acceptance. Relief adds about 40ms in this short
  sample. Normal dynamic-resolution settings are restored by the trial.

An initial GPU test fixture used the wrong BSP winding and rendered no surfaces;
the effect assertion correctly failed. Corrected clockwise native fixture data
and explicit covered-pixel checks prevent an empty render from passing. An
initial metric maximum bound did not account for half-float filtering error;
the final bound is derived in the fixture, while its strict mean bound remains
unchanged and rejects the original shader.

## Try and acceptance

Run a local static server from the repository, for example
`python3 -m http.server 8013 --bind 127.0.0.1`, then open
[the gameplay trial](http://localhost:8013/tests/rockfield_gameplay_trial.html).
Use **Outdoor entrance**, **Cliff close-up**, **Step back from cliff** and
**Look at roof**, and toggle **Relief**. Compare broad wall shading and recesses
as the view changes; the ground should remain quieter. Diagnostics expose missing
tiles, fallback errors and actual GPU shadow-mask measurements.

[Continuity trial](http://localhost:8013/tests/rockfield_continuity_trial.html)
and [physical metric trial](http://localhost:8013/tests/rockfield_metric_trial.html)
are bounded, non-game GPU checks. The metric trial's optional
`?mutation=normalized-frame` deliberately restores the old normalization error
and must report FAIL. It does not edit production files.

Owner acceptance is requested for the rendered appearance, especially the reported
flatness/lighting issue. Automated tests do not substitute for that decision.

## Remaining contract limits and accountable next action

The wall field remains the existing fixed oblique 3D-to-2D projection. An arbitrary
wall whose normal equals `ROCK_AXIS_U` has a direction in its plane along which
the field is constant: detail collapses to one dimension. Correct gradient math
makes that case stable but does not create missing variation. Full arbitrary
orientation support therefore remains unimplemented. The least disruptive
candidate is two fixed, nonparallel projections with constant global weights,
reusing the source generator and atlas but requiring two tile streams and
additional shader samples. Normal-dependent blending would create discontinuous
height at hard corners and is not an acceptable substitute.

Field generation is lazy and bounded, but live BSP topology insertion is not a
renderer API. Rebuilding charts after added coverage now preserves mathematical
heights; it still rebuilds batching/cache identities. The existing generator's
tile coordinate limit is ±1,000,000, with ordinary GPU floating-point precision
limits. “Infinite” describes expandable windows, not unbounded exact arithmetic.

The current coordinator owns documenting this finding and the next bounded
projection design review; implementation needs a separately verified increment.
Do not call this arbitrary-orientation guarantee delivered, or claim visual,
frame-rate or release acceptance from these receipts. Preserve unrelated user
work, including the concurrently changed ogre diffuse and pre-existing untracked
assets.

### Durable follow-up custody

The shared service durably acknowledged read-only projection design review
`cc0a871b-a016-4ef1-aa81-7517925bea91`, owned by
`followup:2d417270-a815-41d2-a21f-de7f7291ddb0`. The submitted profile is
`codex/gpt-6-astra/high`, bounded cumulatively to four invocations, 360 seconds,
90 seconds per invocation and one retry, with automatic interruption recovery.
Authority prohibits all source/asset/Git/environment changes and release.
The private authority and prerequisite records are retained under
`/private/tmp/quaked-surface-followup-2026-10-04/` and pinned by the service.

Post-submission `followup_status` reports **BLOCKED / GUARDIAN_FAILED**, version
3, no acknowledged native session, cleanup confirmed, remaining three
invocations / 359 seconds / one retry, and no next reconciliation. Events show
acceptance, one launch reservation and collection; `followup_result` returns
NOT_READY. This is an acknowledged obligation, not running or completed work.
The current coordinator retains responsibility; next action is for the shared
service operator to diagnose the guardian startup failure and use the same job
ID for supported recovery within its existing allowance. No substitute native
background child or duplicated follow-up job was started. The reviewed current
increment remains separate from that blocked future design review.
