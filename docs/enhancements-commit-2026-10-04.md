# Enhanced surfaces, pickups, travel and axe: commit record

The owner explicitly requested commit and push on 2026-10-04. This authorizes
publishing the completed changes from this conversation to the current `main`
branch of `codemeasandwich/Quaked`. Earlier local-only statements in individual
feature records describe their original stage and are superseded by this request.

The commit covers continuous rock-field corrections and updated bakes, actual
procedural pickup fire, corridor flashlight and approach sound, the authored
one-way welcome passage, measured arch depth and returns, powered axe cuts/gibs,
and restrained water distortion and filtered wall grain. Implementation, trials,
independent tests, review notes and successful/failed evidence travel together.

The final combined gate passed **222/222 tests across 44 test files**, exit 0,
on the current implementation after the water/wall changes. It combines the
travel/axe, surface correction and water compatibility suites without counting
overlapping tests twice. [Exact command](evidence/enhancements-commit-command-2026-10-04.json),
[output](evidence/enhancements-commit-tests-2026-10-04.txt),
[source and asset hashes](evidence/enhancements-commit-source-2026-10-04.json).
The independent planning, public tests and source reviews are recorded in the
individual feature documents. Existing GPU receipts retain their actual phases
and limitations; this gate does not turn construction coverage into universal
mesh qualification or establish a gameplay frame-rate improvement.

The unrelated modified ogre artwork, copied texture files, standalone shield-saw
model and root reference image remain outside this commit and are preserved.
Original packs and existing concurrent work are retained. No force push, rewrite,
separate application deployment or formal release is part of this action.

The blocked read-only rock-projection follow-up remains documented in
[its feature record](rockfield-correction-2026-10-04.md). The service has no
acknowledged running worker. Repository publication does not resolve that
independent future design obligation or owner appearance acceptance.
