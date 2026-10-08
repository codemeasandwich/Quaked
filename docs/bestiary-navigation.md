# Native Bestiarium navigation images

Bluey T-0e7a5e62 replaces the book footer's Georgia-rendered Previous, Open/Next and Escape hint with native Quake bitmap text images. The complete 8×8 `gfx.wad/conchars` atlas is the source: these are the same authored glyph pixels used by native menu text, not a downloaded web font or a recreated alphabet. The existing large title-menu sprite compositor has only selected letter crops, not a complete alphabet.

`BuildMenuTextArt` in `menu_art.js` copies a bounded printable label into a transparent picture without resampling or mutating the atlas. `Draw_CacheBookNavigation` in `gl_draw.js` owns the fixed four-picture cache. It retries after an initially missing atlas and rebuilds when Draw_Init replaces that atlas. No asynchronous font loading or per-frame texture creation is introduced.

The book uses the same three footer anchors. Integer magnification and nearest-neighbor blits keep authored pixels crisp; exceptionally small viewports fit the labels proportionally instead of overlapping. Both side-to-center gaps constrain the fit. First-page Previous and final-page Next are dimmed. The corner reservation includes rounded bitmap bounds, preventing the studio logo from touching the text. Page illustrations, locked-page headings, storage messages and their existing rendering remain separate.

Input is unchanged: left/right halves turn pages, Left/Right and Enter navigate, and Escape returns through the existing menu. The center image is an Escape hint, not a new clickable Exit button. This preserves the existing whole-half touch behavior.

## Verification — 8 October 2026

Independent planning selected reuse of the native atlas and existing art/cache responsibilities. Independent test work and a separate source reviewer passed **20/20**: book presentation/input13, native glyph pixels/cache2, studio-branding5. The tests use decoded PAK glyphs and real Canvas2D output. Book presentation tests execute the actual module implementation with controlled dependencies; source/cache tests call the real public pipeline.

Checks cover exact RGBA glyph copies, unchanged atlas, cache identity and recovery, first/middle/last page states, no Georgia navigation calls, nearest-neighbor image draws, canvas restoration on failure, seven book viewports and six branding configurations including DPR2/3 and anisotropic scaling. Strict assertions caught a0.2physical-pixel overlap at DPR2; production reservation rounding was corrected and the zero-overwritten-pixel check then passed. Existing page-image checks still exclude only the separately identified footer pictures, preserving exact folio counts.

The actual public menu/browser trial uses native PAK palette/glyphs and normal Bestiarium image loading, without starting a gameplay map. Saved PNG/DOM receipts are in `docs/evidence/bestiary-navigation-2026-10-08/`:

- Desktop1280×720 CSS/DPR2: cover, middle and last page; correct Open/Next and disabled states; all three footer images have smoothing disabled and no runtime errors.
- Portrait391×845 CSS/DPR1: distinct readable footer labels, no clipping or branding overlap.
- Browser click at CSS310,660 on Previous, routed through `M_TouchInput`, moved off the last page and restored Next alpha from0.4 to1. The receipt records actual coordinates. Escape returned to the main menu.

An early synthetic pointer probe returned before a settled frame and did not establish a transition. The trial now records the click adapter's coordinates and verification uses a settled subsequent frame; no success is inferred from dispatch alone. The production input handlers were not changed.

Reproduce with `/tests/bestiary_navigation_trial.html` on a local server. For Node, set `QUAKED_THREE_MODULE` to the pinned Three.js0.183.0 module and run `node tools/run_tests.mjs tests/bestiary_book_test.js tests/bestiary_navigation_test.js tests/studio_logo_test.js`. The browser controls exercise existing public menu operations; optional `evidence=1` requires the temporary local capture endpoint used during verification.
