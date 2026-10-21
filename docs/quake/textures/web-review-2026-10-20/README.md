# Web material review — 20 October 2026

Open <http://127.0.0.1:4329/tests/quake_texture_tiers_trial.html> while the supervised local server is running. This shows the actual retained Mid 4× and High 8× maps through the existing engine world-material constructor, authored-normal preparation and HDR/relief shader. It does not change installed game bindings.

Use the texture and tier controls, half/quarter comparison, 3×3 repeat, opposite angles, lights and relief toggle. Close view preserves each decoded image's own pixel dimensions; front GPU view uses the chosen export's full-sized square framebuffer. Download links retain the full framebuffer and one native/replacement comparison pair. On-page repeat count applies to both displayed canvases and the GPU, not the downloaded single comparison pair.

Both distance inputs receive equal-weight integer BOX reduction with final nearest-integer rounding. This is the same operation for native and enhanced inputs; it is not a claim of byte identity to Pillow's separable intermediate-rounding implementation. The independent Python verifier reconstructs the actual downloaded comparisons exactly.

Browser receipts bind native/export file hashes, exact decoded scalar channels, authored packed XYZ+height, framebuffer readback hashes, controls and hardware. The public-artifact verifier checks actual retained image bytes, independent packed-data assembly and comparisons. It does not reproduce the GPU shader or grant art acceptance. `verify-browser-artifacts-v1-failed.py` and its log preserve an oracle mistake: it initially expected the single downloaded comparison to contain the on-page repeats. That assumption was corrected without adding pixel tolerance.

`church1` and `maya1_9` already passed source/master, mixed-codec and independent affected art review. Their actual browser views are being reviewed here. Captures labelled `before` for `city8_2`, `rock3_2` and `wwall1_1` remain ART HOLD for source-geometry X splices; successful loading, exact maps and a working shader do not qualify these defects.

The owner stopped desktop build verification for this texture work. The normal commit attempt was terminated (exit 143); its reviewed isolated index remains preserved, with no completed commit, full build or CI claim. No hook was bypassed. Continue texture production and browser checks.

Current server invocation and source are recorded in `server-record.json` and `serve-current-checkout.py`. The source is a minimal local static-server witness with a read-only Three dependency alias, not a new app server. Run it only for this checkout; the original supervised exec handle is 36703. The game PAKs are not copied or served through a new mount.
