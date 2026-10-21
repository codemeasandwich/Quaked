# Screenshot native scene intake, 21 October 2026

**Finding:** the screenshots depict e1m1, The Slipgate Complex. The second view's layout matches the owner's installed remastered base map, not the stock shareware layout. Use the **base** face/UV rows for repair planning. Both native PAKs are retained as discriminating evidence; this does not claim the app's effective mount order was observed.

This is a bounded, offline source/geometry investigation. No artwork, map, registry, engine or Git state was changed. There is no runtime, correction, acceptance or release claim.

## Readable screenshot coordinates

- 08.09.45: `(74, 1986, -162)`, yaw `93`, pitch `-27`.
- 08.10.01: `(-454, 2689, -82)`, yaw `89`, pitch `-21`.

The second X is **-454**, verified at original screenshot resolution in `overlay-08.10.01.png`. An initial reduced preview suggested -74; that transcription was corrected before the final receipt. Source screenshots remain unchanged on Desktop. The wall crops retain only product wall content; overlay crops retain readable camera text.

## Actual native proof

`inspect-scene.py` imports the existing `batch-001-native-source-proof.py` PACK reader and four-mip parser without changing them. `scene-proof.json` retains full PAK/member/palette hashes, per-texture indexed and RGBA hashes, all four embedded mip hashes, flags, strong native identity, face vertices and UV vectors. It reads only two actual PAKs: repository `games/shareware/pak0.pak` and `/Users/bri/quaked/Quake/pak0.pak`.

`render-native-walls.py` samples those actual native textures through actual coplanar BSP UVs. `base-native-wall-y2816.png` matches screenshot 08.10.01: one large upper-left tapered louver, a separate horizontal rivet band, the broad lower-left louver, the control-door and cable panel above. Stock `shareware-native-wall-y2816.png` instead repeats X struts around the entire door. These diagnostic images are nearest enlarged native-only planes, with no lighting, perspective or runtime renderer claim.

First view wall: Y=2112. Native tech08_1 meets tech11_2 machinery. Base face3256 is tech11_2 with `S=x+192,T=-z+176`; neighboring tech08_1 face3257 has `S=x+48,T=-z+176`. Along world X=64, tech11 U=256 (mod128=0) meets tech08 U=112. This is an **internal cut through tech08**, not a full right-to-left tile boundary. Preserve it.

Second view wall: Y=2816. Base tech09_3 face2818 spans X[-448,-352], Z[-32,96], with `S=x+80,T=-z+96`. Its native U range is [-368,-272], modulo128=[16,112]: the map intentionally cuts away the side strips of the native 128-wide control-door. It meets tech08_1, tech08_3, tech10_1, tech04_3 and tech01_6 through different cuts. Nearby tech08_4 and tech10_3 make the lower vent and edge-strip layout. The stock shareware door has a different bounding box and phase; do not apply its simpler joins to the owner's screenshot.

`wall-joins.json` records each actual shared edge with world endpoints and **both** endpoint UVs. For the base bottom edge, tech09_3 T=128 meets tech08_1 T=128 over the same S range. At the left upper side (Z32..96), tech09_3 U=16 joins tech08_1 U=64, with different T phase. At the four-unit side strip around Z[-4,0], the joins differ again. Use actual native landmark sampling at those cuts; forcing entire texture edges equal would damage intended composition.

## Repair implication and limits

The smallest defensible repair should preserve the owner's existing artwork and restore only demonstrated native phase/spacing/coarse-colour mismatches. Evaluate this **base map composition**, half/quarter native reductions, self repeats and corners. A global seam or self-repeat score alone does not establish these neighbor relationships. This packet establishes native identity and layout, not which current HD pixel adjustment should be selected.

Normal standing-eye ray probes (+22) hit tech11_2 in the first view and the left rivet-band tech10_1 in the second base view. Zero-eye probes are retained as sensitivity checks. These are native CPU ray diagnostics, not actual screenshots of a native renderer. The ray implementation uses polygon normals robust to initial collinear T-junction vertices; an initial such diagnostic omission was corrected before the final receipt.

Bluey remains owned by the root coordinator: its earlier identity read returned `storage_error`, c10dc, outcome unknown, automatic retry false. No board mutation was retried and no identity invented. Root must reconcile this packet when service access returns.
