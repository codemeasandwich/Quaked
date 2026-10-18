DEM4_4 — INFERRED NORMAL AND DISPLACEMENT MAPS

These maps reconstruct plausible surface relief from dem4_4.webp. They are
an approximation, not a measured scan or a bake from the original mesh.

FILES

dem4_4_displacement_16bit.png
  Single-channel, 16-bit grayscale PNG; white is raised and black is recessed.

dem4_4_normal_opengl.png
  RGB8 tangent-space normal map; OpenGL / +Y convention.

dem4_4_normal_directx.png
  RGB8 tangent-space normal map; DirectX / -Y convention. Its green channel
  is exactly 255 minus the OpenGL version; red and blue are unchanged.

All three main maps are 2048 x 4096 pixels and preserve the source's 1:2
canvas aspect ratio. They share exactly the same reconstructed height field.

ORIGIN AND ACCURACY

The original texture is 256 x 512 pixels. Image generation produced an
887 x 1774 RGB8 relief interpretation. That scalar field was resampled to
2048 x 4096 and exported as 16-bit height data. This does not recover native
4K detail or measured 16-bit depth from the original image.

The normal maps were calculated numerically from the exact quantized height
samples in the exported displacement file. They were not independently
painted. The pair is internally consistent, but it is not an exact recovery
of the original surface: some fine teeth, horn contours, mouth edges and
stone details differ from the original. Residual source-style lighting can
also appear as unintended relief. Check alignment with the original color
texture before using this as a final asset.

IMPORT

Treat both normals and displacement as linear / Non-Color data. Do not
apply an sRGB-to-linear conversion to the channel values. In Blender,
use the OpenGL file through a Tangent-space Normal Map node.

Use only one normal convention, according to your renderer. Neither normal
file belongs in the base-color input. The original color texture is unchanged.

The encoded normal strength assumes a surface one unit wide and two units
tall, with a full height range of 0.05 units. For a physical texture width W,
the corresponding displacement is:

  z = 0.05 * W * (height - midlevel)

Midlevel moves the surface along its normal; it does not change its slopes.
Set midlevel near the background value if the wall should stay near its
original position. The background median is approximately 0.3974.

For a flat surface, use the normal map for shading or the displacement field
for a height-based effect. If actual geometry is displaced using the same
full height field, ensure your renderer does not add the full slope twice
through both displaced geometry and its normal input.

The maps have not been made seamless at the outer canvas edges. They use
one-sided derivatives at the boundaries. Do not assume periodic tiling.

REPRODUCTION

The archive includes the unchanged original reference, the selected native
height interpretation and the numerical conversion script. Node.js plus
the sharp package are required to rerun the conversion. From this folder:

  node encode_maps.mjs sources/dem4_4_height_inferred_native.png regenerated 0.05

No new relief or
material detail is invented by the numerical conversion stage.

The exact conversion settings, channel encoding and validation results are
recorded in manifest.json.

Reference: Blender normal map convention and Non-Color import guidance:
https://docs.blender.org/manual/en/dev/render/shader_nodes/displacement/normal_map.html
