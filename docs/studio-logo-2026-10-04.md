# Studio logo on loading and menus — 4 October 2026

The supplied Stronger Faster Better Harder Game Studio logo is installed unchanged at `newer/ui/studio-logo.png`. SHA-256: `07ce5e05295e20d104cc337dffcb4eeee690471710fc64d71d9f8251717b4aec`; original RGBA dimensions 1254×1254. The source path/hash are recorded in `newer/ui/studio-logo-source.json`. Existing owner files such as root `logo.png` were not replaced.

The initial black loading screen contains the image directly in `index.html`, so it can display before application code or game data finishes loading. It sits bottom-right, at up to 128 CSS pixels, capped at 20% of viewport width/height with a minimum 16px or device safe-area inset. It has no pointer interaction. The original centered Quaked SVG and progress fill remain unchanged. The studio image is a child of `#loading`, so the existing fade/removal also removes it; a failed DOM image hides its broken-image placeholder.

All active game menus draw the logo after their own content through the existing `M_Draw` state/key guard, in both Classic and Newer modes. `src/studio_logo.js` uses the existing overlay canvas, preserves aspect ratio, converts CSS placement to independent physical X/Y scales, respects safe-area values and restores caller canvas state. It performs one lazy image request with a 30-second deadline and terminal failure protection. Failure omits the logo without blocking startup, retries or touching game settings/progress. No logo draw occurs for gameplay, inactive menu state or console input; the ordinary overlay frame clear removes prior menu pixels.

Review identified a genuine Bestiary footer collision at smaller viewports. `R_BestiaryBookCorner()` reports the occupied page/footer extent using the book's actual layout. The menu passes it only for Bestiary; the logo then fits beside its right edge or below its footer, whichever has more space. At 640×480 it is 45.6 CSS pixels rather than the ordinary 96px viewport cap. Large/narrow viewports can keep the larger size where space allows. Book artwork, controls, page indexing and discoveries remain unchanged.

## Verification

Independent planning, public-interface tests and final source review completed. Final reserved-corner gate: **78/78 passed, exit 0**, across 12 suites, including five new studio checks, existing loading/menu/startup checks and the complete Bestiary/native controls. **216 source/test/art hashes** stayed unchanged through the gate and were checked again afterward. Earlier 77-case pre-reservation constituents remain separate; they do not replace the final qualification.

Real-canvas checks cover aspect ratio, ordinary placement, HiDPI and unequal canvas scaling, safe insets, decode/error/timeout/cache behavior and state restoration. The actual `M_Draw` body is exercised with controlled surrounding menu callbacks and the real logo renderer, proving its active-state boundary and forwarding of Bestiary bounds. Six configurations preserve a visible logo with **zero overwritten book pixels**, including measured navigation/footer text. The old 640×480 placement is a positive collision control. These controlled tests are distinguished from full native rendering.

- [78/78 test log](evidence/studio-logo-tests-2026-10-04.txt)
- [Public receipt, command and viewport collision evidence](evidence/studio-logo-public-receipt-2026-10-04.json)
- [Qualified source hashes](evidence/studio-logo-source-2026-10-04.sha256.json)
- [Loading-screen screenshot](evidence/studio-logo-loading-2026-10-04.jpg)
- [Actual game-menu screenshot](evidence/studio-logo-menu-2026-10-04.jpg)
- [Native menu diagnostics](evidence/studio-logo-menu-native-2026-10-04.json)

The loading screenshot uses `tests/studio_logo_loading_trial.html`, copied from production `index.html` with only a relative base and omitted game launch so the initial screen remains available for inspection. It verified a decoded 1254×1254 image drawn at 128×128, 16px from the right/bottom of a 1280×720 viewport. A temporary delayed-PAK server reached actual application startup, but its first screenshot was taken after loading ended; that attempt is not presented as loading visual proof. The temporary server expired as designed. The controlled fixture does not change production launch behavior.

The menu screenshot comes from actual Newer E1M2 with main menu state 1 and GL error 0. Existing discoveries stayed unchanged. A retained Chromium input/pointer-lock UnknownError and a subsequent unsuccessful keyboard wrapper are not relabeled as clean browser input; inactive-menu visibility is verified by the public drawing/frame-clear checks rather than that unsuccessful visual attempt.

Try the [normal game](http://127.0.0.1:8015/index.html) for startup and menus, or the [held loading preview](http://127.0.0.1:8015/tests/studio_logo_loading_trial.html) to inspect the first screen. Changes remain uncommitted; no release or push was performed. Owner visual acceptance remains separate. The held fixture and documentation were added after the runtime gate and recorded separately; qualified runtime/tests/assets remained unchanged.
