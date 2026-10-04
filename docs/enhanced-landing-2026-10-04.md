# Enhanced rendering and startup landing

The owner requested commit and push after the opening-demo and fresh Newer Game
readiness work. This increment includes the completed changes since
`a1ac867aef4c1255810f7a46efc10c2fe9c84908` on `main`, whose remote value was
confirmed immediately before staging.

## Included behavior and contracts

- Classic enemies and objects retain native frames; Enhanced interpolation is
  scoped to the Enhanced pass.
- Emissive sources and the offset flashlight have geometric shadows. Height
  materials have source-specific self-shadows; the rock-wall lighting response
  is scoped separately. Source-free haze is removed, bounced lighting remains,
  and Enhanced brightness defaults to the slider midpoint.
- Rock fields retain continuous saved presets and original geometry. Visible
  surfaces keep their working pages, macro amplitude does not fade by distance,
  and corner sampling is bounded. Prepared maps cover all 29 available levels;
  unknown or invalid prepared data falls back to bounded generation.
- Fresh Newer runs select flashlight defaults through native difficulty
  triggers. Travel preserves the current choice; the first manual switch-off
  prints the requested native message once per run.
- Seamless snapshots carry external resource manifests and remap restored
  enemy/corpse/gib model indices before use, preventing the reported missing
  knight precache failure on revisits.
- The opening demo fades the logo into the actual console and holds playback
  until enabled assets, shaders and first-view mechanisms are ready. Fresh
  Newer welcome uses an opaque loading plaque with the same readiness gate.
  Ordinary level travel retains proximity prewarming and live replacement.
- The owner's current tracked ogre, soldier and crate artwork is included
  unchanged. All four WebP files were fully decoded successfully. Unused shield
  geometry and duplicate `copy.webp` files remain outside this increment.

The feature documents describe implementation relationships, fallback behavior,
trials and limitations. Historical failed/superseded receipts are retained rather
than presented as current passing evidence.

## Final checks

`docs/evidence/commit-push-regression-2026-10-04.txt` records **112/112 passing**
tests across 22 isolated suites on the final source tree. This includes actual
prepared-map coverage and generator comparisons, native difficulty triggers,
seamless corpse restoration, Classic isolation, startup/welcome and asset
readiness, relief lighting, shadows, visual settings and portal behavior.
`git diff --check` passed. The largest included file is a 12.5 MB prepared map.

Independent public-interface testing and source review were completed for the
startup/readiness increment before the landing request. Actual browser receipts
for both introductions report no page or GPU errors; see `intro-readiness.md`.
Other feature records retain their native and GPU evidence. These checks prove
the recorded behavior, not universal GPU compatibility or owner acceptance of
every visual choice. In particular, the latest restored rock appearance remains
available for the owner's visual assessment.

Commit and push are authorized by the owner's latest request. The resulting Git
identity and remote confirmation are reported after the operation completes;
this preparation record does not itself assert that a push succeeded.
