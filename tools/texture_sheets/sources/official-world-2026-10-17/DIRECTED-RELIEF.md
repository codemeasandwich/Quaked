# Directional texture pairs

`TF_Metal3_02` and `TF_Metal4_02` transition from steel above to rust below. Their `_03` partners reverse that transition. Each texture repeats horizontally. The vertical cycle is `_02 → _03 → _02`; making either image self-periodic vertically changes its intended material layout.

The version 2 colour candidates were held because separate GPT photographs left visible cuts at the directed joins. `finish_transition_pairs.py` concatenates the pair, uses the established quiet-edge colour finisher at one cycle boundary, rolls by one tile, and applies the same finisher at the other boundary. It neither resamples nor invents detail. The middle half of each source-fitted candidate stays byte-identical. All previous inputs and held candidates remain available for reproduction.

Version 3 colour joins passed, but independent review found false relief rims. The existing generic height recipe uses periodic filters; running it on each directional image separately incorrectly connected rust to steel. Deriving only the final normal gradient across the pair would leave those height-filter artifacts in place.

`encode_official_maps.py` therefore accepts an optional `--vertical-neighbour <partner-authoring.png> --neighbour-name <partner-name>`. It requires equal dimensions and identical material profiles. Both diffuse masters are encoded at lossy WebP quality 92 and decoded before height creation. Height filtering runs on the two-image cycle with the original per-tile detail scale (`k=2` for a 512-square tile). Each height is independently encoded at quality 92. Normal generation then reads the two decoded heights, uses the existing 3/1 diagonal derivative stencil and the original per-tile slope scale, and stores independent lossy92 grayscale X/Y/Z maps. Doubling the cycle area is compensated by dividing the helper's strength argument by `sqrt(2)`; the registered material strength remains 0.2 and cap 0.5.

Each receipt names and hashes its opposite master, encoded diffuse and encoded height. Reciprocal hashes must match the partner's actual files. Run both partner encodes with the opposite image supplied; do not substitute an unrelated image or apply this recipe to materials with different height profiles. Omitting the new arguments retains the generic authoring path and its previously published bytes.

Example, from the repository root:

```sh
/usr/bin/python3 tools/texture_sheets/encode_official_maps.py \
  --original tools/texture_sheets/sources/official-world-2026-10-17/native-TF_Metal3_02.png \
  --diffuse newer/textures/candidates-2026-10-17/TF_Metal3_02-photographic-pair-v3-4x.png \
  --name TF_Metal3_02 \
  --output-stem /private/tmp/TF_Metal3_02-replay \
  --strength 0.2 --cap 0.5 --normal-layout channels \
  --vertical-neighbour newer/textures/candidates-2026-10-17/TF_Metal3_03-photographic-pair-v3-4x.png \
  --neighbour-name TF_Metal3_03
```

New output stems are required: the encoder refuses to overwrite earlier assets.

Acceptance remains separate: decoded full 512, half 64 and quarter 32 visual comparisons; horizontal repeat; both directed colour and relief joins; independent coordinate-based normal mathematics and quality 92 replay; actual native PAK guards; public loader/Classic fallback/UV checks; companion-pack reachability; engine-material rendering; independent final review; and the maintained full commit gate before Dev publication. A working authoring trial is not owner appearance acceptance or a release.
