# Explicit rtex008 content reuse

19 October 2026. `batch-004-public-alias.json` qualifies an explicit source
content alias from Hexen II's `rtex008` to the already reviewed Portal material
`ttex013`. This preserves both native names, content IDs, edition and map/slot
bindings. It does not register or merge runtime resources.

Independent reads checked **all 60 unique retained PAK/BSP occurrences**: 42
for `rtex008`, 18 for `ttex013`. Both are ordinary 64×64 miptex sources with the
same native palette, indexed pixels and RGBA identity. **Every byte of all four
mip levels matches** across those occurrences. Relevant texinfo has no special
flags, neither name carries a sky/liquid/animation/transparency marker, and the
Low PNGs have opaque alpha and are byte-identical. Full archive hashes stayed
unchanged through the check. This is source semantics, not renderer acceptance.

The existing `batch-002/masters/ttex013` RGB and float32 height package replays
exactly against `rtex008`'s own Low. The qualified package and tier receipt
hashes match the earlier actual-map proof; all ten existing map hashes match.
There is no new `generated/rtex008.png`, master package or tier directory.

`generationCount: 0` on the new alias means **zero new generations**. The shared
physical package retains its original single generation and single full-precision
relief authoring operation. The seven other batch-004 bindings require their own
single sources and packages. Once qualified, this batch represents eight native
bindings and 80 map references, with **seven new masters/70 new maps plus one
reused master/10 existing maps**. These are not eight new generations or 80 new
files.

The batch's independent source/codec/math verifier follows the explicit shared
paths and still compares the alias's delivered tiers against its own unchanged
Low at half and quarter native resolution. Artistic acceptance and the rest of
the campaign remain separate.
