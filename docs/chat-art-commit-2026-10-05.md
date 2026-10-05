# Chat art commit scope — 2026-10-05

This commit contains only the current chat's Quad lighting/spark-removal,
reviewed glass regions and source-faithful ordinary nailgun changes, plus their
assets, independent tests, trials, provenance and retained failure receipts.
Shared source files were reconstructed as HEAD plus the recorded chat delta;
concurrent loading, BSP2, prepared-normal, displacement, rockfield, cache,
server and other rendering work remains outside the commit.

The candidate was tested independently of those working-tree changes. HEAD's
native brush loader supports BSP29. Two selected expansion source maps use
BSP2; the test explicitly verifies the expected format rejection and separately
checks their original texture/palette bytes and catalog binding. This is source
asset coverage, not a claim that HEAD runs those maps. In the combined working
tree, all ten campaign samples loaded through its separate BSP2 implementation.
The capability receipt distinguishes native acceptance and source-only coverage.

The preserved donor Quad excerpt keeps original CRLF/spacing and its exact hash;
its precise path is marked raw whitespace evidence, following the repository's
existing evidence policy. Executable source retains ordinary whitespace checks.
Earlier screenshots/results came from the combined working tree and remain
historical evidence; isolated-candidate results below are the commit gate.

No release or push is implied. Source/model placement and glass appearance
remain subject to owner acceptance.

The corrected native capability test passes: 8 BSP29 campaign samples / 56
materials load natively on isolated HEAD plus this commit; DOPA and MG1
BSP2 samples reject the exact expected format while their 6 source materials
pass raw pixel/palette/catalog checks. All 10 campaign sources / 62 materials
are covered. The combined working tree separately accepts all 10 natively.
[Isolated capability receipt](evidence/chat-native-capability-isolated-2026-10-05.json).

The complete isolated gate passes **63/63** checks.
[Isolated gate](evidence/chat-isolated-commit-tests-2026-10-05.txt).
