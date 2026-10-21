# Independent exact replay and offline artwork review

**PASS for the bounded colour-only legacy trial:** `tech08_1`, `tech09_3` and `tech10_1`. This accepts the three reviewed PNG candidates only. Actual scene-neighbor qualification, spatial repair, installation, runtime/owner acceptance and8× qualification remain separate.

The unchanged `finish()` reproduces each full PNG byte-for-byte. An independent reconstruction of the reduced native/donor fields, wrapped Fourier Gaussian and wrapped bicubic interpolation reproduces every pixel. All source/tool/receipt hashes match. No spatial resampling is performed because each donor already equals its4× target dimensions; the candidates use an additive smooth colour field without landmarks or edge anchoring. Seven pinned product files—the index and three selected diffuse/height pairs—remain byte-identical. See [replay.json](replay.json) and [replay.py](replay.py).

|Artwork|Native/2 MAE before → after|Native/4 MAE before → after|New clipped channels|
|---|---:|---:|---:|
|tech08_1|16.045 → 13.530|13.119 → 10.289|0.0827%|
|tech09_3|17.678 → 14.252|14.517 → 10.703|1.4432%|
|tech10_1|16.656 → 12.214|15.551 → 10.691|0.1673%|

These numbers support the colour finding; the artwork verdict also follows inspection of actual literal images, native/2 and native/4 views and the clipping maps. The photographic metal, rivets, red-streaked louver paint and inherited layout all remain. No new grain, geometry, perimeter decoration or artificial detail is visible. `tech10_1` remains warmer than native; its improvement does not establish final family consistency.

`tech09_3` has1.4432% newly clipped channels across3.3386% of pixels. Those pixels average donor RGB(8.28,4.13,1.51), predominantly pre-existing near-black shadows and dark ink. Literal [label, emblem, indicators and grille crops](tech09-key-regions.png) show the lettering and indicators remain readable and the bars retain separate highlighted surfaces. Shadows become slightly deeper, with no observed new loss of a distinguishing shape. This actual inspection supports the bounded pass despite the nonzero clipping count. Clipping masks and exact counts remain in the JSON; they were not suppressed or treated as automatically acceptable.

The `tech08_1` upper wrapped strip/cut rivets and existing joins remain. This colour-only trial cannot repair or qualify alignment. The separate investigator must use actual base-game BSP UV neighbors, not assumed shareware joins. The candidates also preserve historical relief bytes; they do not turn lossy historical height into a current full-precision master.

Execution history was read from `../execution-reconciliation.json` and the three CLI receipts. The initial root metadata attempt failed for missingPIL before metadata was written; the subsequent two existing CLI calls completed. This review does not invent a sealed pre-call record for those two. The third candidate retains its own actual pretrial approval. There was no provider call or newly generated artwork.

Exact candidate hashes, inspected image hashes, clipping findings and all remaining gates are recorded in [verdict.json](verdict.json).
