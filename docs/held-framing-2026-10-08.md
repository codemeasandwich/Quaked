# Held-weapon framing — T-13733908

Rocket launcher held art now moves an additional **0.5 Quake units toward the
camera**. Super nailgun held art moves **1 unit**, exactly twice that change.
These are the small values chosen and verified for this increment; they are
not presented as a numeric value previously specified or accepted by the owner.

The existing baked rocket −3 offset and super nailgun −7 translation/8° tilt
remain intact. Manifest version 13 stores the new `cameraPullback` metadata.
The existing loader exposes it only on ready imported held assets. The ordinary
non-XR viewmodel draw applies a camera-backward translation after resetting its
base transform. It does not accumulate across frames. The importer preserves
the runtime metadata without baking it into model poses.

Geometry, normals, textures, scale, rotation, rotor pivot, animation, native
entity origins and projectile behavior are unchanged. Pickups, other held
roles, Classic, unavailable art and XR retain their previous placement. Native
muzzle lighting remains camera-relative; there is no attached barrel-flash
sprite to relocate. Actual firing views showed no new visible separation.

## Verification

```sh
QUAKED_THREE_MODULE=/path/to/three.module.js node tools/run_tests.mjs \
  tests/held_framing_test.js tests/weapon_modes_test.js \
  tests/weapon_preload_test.js
```

Combined result: **13/13 passed**, using Three.js 0.183.0. Independent source
review found no blocker. Importer Python syntax also passed.

The new public tests exercise actual `V_CalcRefdef`, `R_SetupGL` and
`R_DrawViewModel`: all seven rocket poses and nine super nailgun poses, 36 bob
phases, speeds 0/200/320, pitch −45/0/+45 and horizontal FOV 75/90/110. Across
**15,552 samples**, no near-plane intersections occurred within the visible
frustum. Super nailgun's stationary near clearance is approximately **0.17
units**. Rear geometry can cross the near plane offscreen, including in the
prior rocket model; this is not claimed to put every vertex in front of it.
Unusual settings outside the tested ranges were not exhaustively qualified.

Exact camera-axis deltas, the 2:1 ratio, ten repeated draws, native origin/pose
preservation, role exclusions, Classic, pending/failed art and malformed
metadata are checked. Expected invalid-asset fixtures emit fallback warnings.
Older donor-reimport suites could not run because their original root ZIPs are
absent; they are not counted as passes. No donor geometry was regenerated.

The native E1M1 browser trial exercised both weapons at narrow/wide FOV,
baseline/updated placement, firing and walking. The super nailgun's rotor and
rocket recoil remained visible without new clipping; browser error logs were
empty. Those observations are visual checks, not a pixel-exact screenshot
comparison. The agent-created game tab was closed after verification.

## Trying it

Reload the ordinary Newer Game. For a controlled comparison, open
`tests/held_framing_trial.html`, select the weapon, then use **Baseline framing**
and **Updated framing**. Those controls alter only the test page's loaded
metadata; the production manifest is unchanged. FOV, firing and walking
controls reuse the existing native weapon trial.

Evidence is in `docs/evidence/held-framing-2026-10-08/tests.txt`. This increment
does not include a remote push, release, or owner visual-acceptance claim.
