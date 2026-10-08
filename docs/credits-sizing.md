# Credits panel sizing

Bluey T-0c465f36: reduce both linear dimensions by 25 percent at the same viewport. The existing 320×272 layout, names, Quake glyphs, Japanese credit picture, colors, source URL, and Enter/Escape behavior are preserved.

`M_Draw` and `M_TouchInput` use the same `.75` credits scale through `Draw_WithVirtualSize`. The latter first calculates the established integer fit and then applies a scoped relative factor. Changing only the virtual minimum would quantize the result instead of giving the requested ratio. Nested drawing and failures restore both metrics and Canvas2D state without changing `scr_conheight`.

Credits pointer mapping inverts the actual physical canvas scale before subtracting the same integer-centered offsets used for drawing. It must not use the ceil-rounded virtual extent: that displaced the last pixels of the source link, which independent edge-click tests detected. Other menu coordinates retain their original path.

## Verification, 8 October 2026

Independent planning confirmed the existing scope is the correct reuse boundary. Independent public-interface tests passed 5/5, and the separate source reviewer reran those tests and found no blocking findings. The combined credits/menu/single-player run passed 8/8. Tests capture real native PAK border/glyph destination rectangles through Canvas2D, including ten viewport/DPR/UI-preference states, exact .75 ratios, contributor/picture preservation, pointer edges, keyboard actions, resizing and nested/error restoration.

Actual browser verification uses `tests/credits_trial.html`, which invokes the public menu and native drawing functions with the original PAK palette/artwork and the production PNG credit loader. The baseline control replays the same unchanged primitives at their previous scale; it is not a second production renderer. The trial observes source-link requests locally instead of opening external tabs.

- 1280×720 CSS, DPR2: baseline 1600×1360 physical pixels; current 1200×1020, ratio .75 on both axes. All content fits.
- 391×845 CSS, DPR1 after resize: baseline 320×272; current 240×204, ratio .75 on both axes. All content fits and remains centered.
- Clicking the rendered footer and pressing Enter each requested the unchanged GitHub source URL. Escape returned to the native main menu.
- Captured PNGs and DOM receipts: `docs/evidence/credits-2026-10-08/`.

Retained failure history: strict initial tests exposed a fractional pointer-coordinate error, corrected before passing. Initial browser trial omitted palette initialization and production PNG sizing; those test-harness defects were corrected. One old localhost origin mixed cached modules from the prior branch, so verification used a fresh origin. A browser disconnect was recovered through its documented APIs. None of these initial observations is represented as passing raster evidence.

Reproduce with a local server and `/tests/credits_trial.html`. For Node tests, set `QUAKED_THREE_MODULE` to the repository-pinned Three.js 0.183.0 module (with its core sibling), then run `node tools/run_tests.mjs tests/ambient_credits_test.js tests/menu_test.js tests/singleplayer_menu_test.js`.
