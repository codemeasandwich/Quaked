# Dev integration checks

Candidate based on `ab554cf61a2650c7ae84ed5dc96dcc45c4cb1010`.
Fresh tracked Dev resource files and feature implementations were retained;
filesystem and URL boundaries were adapted to the shared layout.

Resource/sound checks cover 190 distinct cases after fixing two latest-Dev VM
fixture bindings; their original assertions are retained. Separate final
startup11/11 and studio5/5 receipts supersede the corresponding failures in
`resource-sounds.txt`. Canonical resource/layout/codec contracts passed8/8.
The unpacked demon regression passed7/7, including all131072 runtime scalar
samples,15969 normal samples, source hash/convention/glow and Classic checks.

Policy classification passed1918 paths and2263 runtime dependencies. The game
index retains its committed identities. All8 existing pack mutants were
rejected. Every one of the6565 relocated resource files preserves its original
Dev Git blob, mode and SHA256; no foreign main working-tree feature was copied.

The normal staged pre-commit gate remains required. Its receipt and full builds
are separate from these focused checks and from owner acceptance or release.
