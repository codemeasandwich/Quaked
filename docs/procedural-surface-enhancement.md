# Procedural surface enhancement, in plain words

![Procedural Surface Enhancement: displacement for cliff walls plus a height map for outdoor ground. Four panels: the base surface with repeating tiled textures, a single whole-wall displacement map, a subtle ground height map, and the final result with the same textures and layout but large-scale rock relief and ground detail.](../assets/docs/procedural-surface-enhancement.png)

*Owner-supplied concept infographic, published unchanged (SHA-256 `5177cab2ca88b9d996723b90abcc664aedbf8072e0a13f8abf37e11b28ff2242`, moved from the repository root to `assets/docs/procedural-surface-enhancement.png`). It is an illustration of the idea, **not a screenshot, a benchmark or proof that every surface, collision or effect in the game matches it.***

## What it shows

In Newer Game the rock walls and rocky ground of Quake's levels get depth they never had, **without changing the textures or the level layout**.

1. **Base surface.** The original level: flat walls with one rock texture repeated over and over, and flat ground.
2. **Cliff wall displacement.** One height map is laid across the *whole wall*, not repeated per texture tile. A tile-by-tile pattern would repeat visibly; one field across the wall gives large rock forms, with crags, ledges, cracks and recesses that are different everywhere along the wall. The wall keeps its shape, size and boundaries.
3. **Height map for outdoor ground.** A much gentler version of the same idea for earth and loose stones: small bumps, dips and shallow ruts, with the same ground texture.
4. **Final result.** The same textures and layout, with relief, shadows that settle into the recesses, and less repetition.

## How the game does it

* **One field per surface family, in world space** (`src/newer/assets/rockfield.js`, `src/newer/render/r_rocksurfaces.js`). The generator is extracted from the owner's rock-field tool. A wall profile makes broad cracks and ridges, a gentler ground profile makes soil and stones. The field is placed by *world position*, never by texture tile or face, so neighbouring faces and corners share one continuous surface and nothing repeats at tile edges. Which textures count as bedrock, soil or loose stone is an explicit list (`ROCK_MATERIALS`), because names alone can mislead: some "ground" textures are paving.
* **Streamed in small pieces** (`src/newer/render/r_rockfield.js`). Pieces of the field are made on demand by two background workers (no unbounded queue) and kept in a fixed-size cache; prepared maps (`docs/prepared-rock-maps-2026-10-03.md`) supply them without work at run time where they exist.
* **Drawn as apparent depth in the lighting, not as new geometry.** The height becomes surface normals (`src/newer/render/gl_normals.js` does the same job for ordinary textures, turning a texture's own brightness into relief) and a bounded parallax march in the shader, so light, shadow and reflections respond to the relief.
* **Visual only; the level's solid shape never moves.** The original BSP vertices, texture coordinates, lightmaps, hulls and collision are untouched: you collide with the flat wall the map always had, and the relief you see is depth painted by the renderer. A cliff may look a little deeper or shallower than where a shot or a footstep lands.

It is Newer Game only, and `r_rockfield 0` (with the related `r_newer_*` switches) turns the relief off.

## Where to read more

[Continuous natural rock and terrain relief](continuous-rockfield-2026-10-02.md) (the contract, projection and streaming), [connected surfaces](rockfield-connected-surfaces-2026-10-03.md), [prepared rock maps](prepared-rock-maps-2026-10-03.md), [required materials](rockfield-required-materials-2026-10-03.md), [lighting stability](rock-lighting-stability-2026-10-03.md), and the [technical notes](technical-notes.md).

## Checks

The image file's hash was compared before and after the move (identical), the Markdown links are checked by `tests/docs_index_test.py`, and `tools/check_distribution_policy.py` passes with the new path as a protected public asset (the local-only rules cannot match it). The text above was written from the current source headers and the existing rock documents; it makes no performance claim.
