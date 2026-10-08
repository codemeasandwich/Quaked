# Bestiarium discovery eligibility — T-15cbb0a7

New discoveries require a living enemy with direct sight and a native body
facing within **89 degrees inclusive** of the player. Back and 90-degree side
views cannot start a reveal. Turning toward the player permits a later first
discovery. Existing journal entries are preserved.

`Bestiary_FacesPlayer` derives model +X from the renderer's native
`Rz(yaw) × Ry(-pitch) × Rx(roll)` convention: forward Z is **+sin(pitch)**.
The target direction runs from the enemy's native origin to the player's
native origin. Pose deformation, borrowed encounter-camera orientation and
head-bound changes cannot manufacture facing. The normalized-dot comparison
uses `cos(89°)` with a 1e-7 numerical tolerance for native float coordinates.
Invalid/nonfinite and coincident origins are rejected.

The existing current-pose bounds, frustum, main-scene visibility and direct
camera-to-enemy brush trace remain required. Portal-only views and Quad's
through-wall proxies do not replace direct sight. Failed eligibility returns
before journal writes, encounter start, input suspension or artwork requests.

## Native exclusions

- Crucified zombies require the actual stock classname/model, spawnflag 1,
  `MOVETYPE_NONE` and `zombie_cruc1` through `zombie_cruc6` thinker. Damage and
  pain fields are deliberately excluded from this predicate: the existing
  pinned-zombie fix changes them while leaving the zombie attached.
- Rogue statue identities are ineligible while current `think`, `th_stand`,
  `th_walk` or `th_run` contains `knight_pause1`/`hknight_pause1`. Checking the
  callbacks also covers initialization before the first waiting think.
- The unsuffixed `knight_pause`/`hknight_pause` functions activate the statue.
  Actual QC replaces the waiting callbacks with ordinary behavior and
  `FoundTarget`. The original skin/spawnflag identity remains, so the awakened
  creature unlocks its Statue Knight/Statue Death Knight entry.

Ordinary standing/idle enemies remain eligible. No classname-wide zombie ban,
proximity-to-wall guess or generic frozen-frame exclusion is introduced.

## Evidence

**30/30 checks passed** across catalog, native encounter, new eligibility and
pinned-zombie suites. Independent source review found no blocker. Tests include
55 signed-angle/model-matrix cases, ±88.9°, ±89°, just outside the threshold,
90°/180°, pitched/yawed/rolled models, invalid inputs, no-side-effect rejection,
and a facing-positive actor behind real BSP occlusion.

Actual START crucified zombies remain excluded after their existing damage fix
and real nonlethal `T_Damage`. Both real Rogue statue activation routines were
executed from the installed program; each then became eligible with its distinct
folio identity. That program is CRC 48868, SHA-256
`3d8063a8c84e4660595fb9c52c50eff0f5d9bcde75535567f57a768a38314179`.
Owned program/model bytes were read, not modified or copied into this commit.

The existing native positive fixture initially failed because its selected
candidate did not satisfy the new eligibility rules. Candidate selection was
corrected; encounter, clock, camera and dismissal assertions were retained.
The original failure log is preserved. Headless audio/campaign diagnostics are
also retained; these tests do not qualify all Rogue audio or campaign behavior.

The browser trial visibly rejected back and side views, accepted front view,
showed the Grunt reveal, and rejected a repeat after dismissal. Its journal is
page-local memory, and its player/enemy poses are explicitly staged. Model
smoothing is disabled in that fixture while paused so rendered orientation
matches its staged native angle. Production animation settings are unchanged.
Browser error logs were empty, and the test game tab was closed.

Run with Three.js 0.183.0:

```sh
QUAKED_THREE_MODULE=/path/to/three.module.js node tools/run_tests.mjs \
  tests/bestiary_test.js tests/bestiary_native_test.js \
  tests/bestiary_eligibility_native_test.js tests/pinned_zombies_test.js
```

Native visual trial: `tests/bestiary_facing_trial.html`.
Receipts: `docs/evidence/bestiary-eligibility-2026-10-08/`.
No remote push or release is implied.
