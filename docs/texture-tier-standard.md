# Shared Quake and Hexen texture standard

Owner instruction,19 October2026: this standard applies to Quake, its official expansions, Hexen II and Portal of Praevus going forward.

| Tier | Dimensions relative to native | Source |
|---|---|---|
| Low | 1×width and height | Unchanged original game texture |
| Mid (default) | 4×width and height | Direct reduction of the one retained master |
| High | 8×width and height | Direct reduction of the same retained master |

Generate exactly one photographic source per native texture identity, at least8× native width and height. Retain it and its exact prompt. Complete colour/layout/edge registration once at master resolution and retain one active RGB/relief master package. Never generate or author Mid and High independently. Do not infer a native alias from a matching texture name alone.

Author scalar relief once at master resolution, with full-precision height values. Derive each tier's height directly from that scalar master and correctly scaled normals from that uncompressed reduced height. Height amplitude is shared; normal slopes account for texel density. Do not derive a tier or its normals from an already compressed tier map. The masters are retained lossless authoring data; every enhanced-tier colour, height and normal XYZ map is lossy WebP quality92, compression method6.

Use a Python3 environment with Pillow and NumPy installed (the current verified authoring environment is `/usr/bin/python3`). The shared offline CLI is `tools/texture_sheets/derive_texture_tiers.py`:

```sh
/usr/bin/python3 tools/texture_sheets/derive_texture_tiers.py \
  --original original.png --master master-color.png \
  --height-master master-height.npy --output NEW_OUTPUT_DIRECTORY
```

It requires unchanged native input, lossless RGB PNG master of matching aspect and at least8× dimensions, and a matching finite float32/float64 height array in[0,1]. It refuses existing destinations, too-small masters, malformed scalar sources and invalid strengths. It does not generate art, author height, register resources, change runtime settings or alter Low. Output manifests declare Mid as default for future integration; existing game settings are not silently rewritten by an authoring tool.

Both enhanced tiers require comparisons against the original at half and quarter original dimensions, using the same BOX reduction on both inputs. Record decoded measurements but review actual colour/style/intention, forms and feature scale visually. Check repeated tiles and relief under opposed lights at both resolutions. Preserve source edge alignment and intended material joints; reject new perimeter bevels/shading, missing little bricks, pixel contours and artificial grain. Record decoded height/normal compression divergence rather than assuming exact equality.

The first application is the Hexen authoring increment in `docs/hexen2/textures/TWO-TIER.md`. Existing Quake deliveries and historical receipts are preserved; new Quake assets use this common standard. Retrofitting older assets requires their retained adequate-resolution source, never upscaling or transcoding the compressed4× counterpart. Runtime/pack binding and owner acceptance remain independently verified steps.

The current derivation CLI covers opaque RGB surfaces with scalar relief and separate XYZ normals. Alpha/glass masks, emission, liquid, sky and animation families require their own reviewed source semantics; this tool does not qualify them by merely resizing them. Their future enhanced tiers must still obey the same common-master4×/8× and Q92/method6 standard.
