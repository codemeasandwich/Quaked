# Weapon Models credits

The credits now show **Weapon Models**, with the owner's supplied **小林 団那紀** artwork and `(dannaki)` beneath. The Japanese picture matches the standard 8-pixel text height, and the handle sits on the same row with a 6-pixel gap. The centred top line reads **Quake by id Software**, without a version label or number. One blank row precedes each section after Programming, and the creator name follows Weapon Models with a two-pixel gap. The GitHub link is centred in white at the bottom; the former **Source code** heading is removed. The box grows from 320×200 to 320×272 virtual pixels. The Enhancements row reads **Brian Shannon + Claude + Codex**, replacing the former parenthesised handle. Original Quake contributors, port credit and ambient musician keep their existing ordering and text.

The name PNG remains byte-identical to the attachment. The existing `Draw_CachePicFromPNG` accepts optional near-black keying, transparent-margin trimming and proportional display-height settings. Ordinary startup uses threshold 3 and height 8, producing a 58×8 picture matching the standard text; native bitmap menu drawing remains unchanged. Processing exceptions reject the load promise, and the optional startup path retains ASCII fallback rather than hanging or repeatedly looking for a missing PAK picture. Existing PNG loads without options keep their original behaviour.

`Draw_WithVirtualSize(320,272,callback)` scopes minimum UI space and the canvas transform to the credits drawing and pointer mapping. It lowers integer UI scale if necessary, preserving the owner's UI preference. Transform, size requirements and metrics restore in `finally`, including callback failure. The box is vertically centred using a −36 offset relative to existing 200-high menu helpers. Other menus keep their existing coordinates and scale. Physical viewports must be at least 320×272 to fit the unscaled bitmap menu.

The GitHub footer has an exact hit region covering its own white text. The enlarged bottom area and creator name no longer count as the old broad source-link target. Enter still opens the existing repository URL; Escape/back behaviour is retained.

[640×560 preview](images/weapon-models-credits-2026-10-02.png) and [640×400 preview](images/weapon-models-credits-small-2026-10-02.png) were rendered through the real public `menu_credits`/`M_Draw`, existing PNG loader, original PAK charset and original menu-box pictures with a software canvas. The supplied Japanese glyphs are visible without a black rectangle, and the white footer is centred inside the larger box. These are actual menu-code renders, not browser/gameplay screenshots. No additional game or browser instance was started. Owner visual acceptance remains pending.

**7/7 checks passed** for the section-spacing layout before the final two-pixel gap/title-centering adjustment: three independent public credits tests plus four startup, save-menu and options regressions. Tests verify the version-free header, original contributor names, changed enhancement row, 8-pixel native picture and six-pixel handle gap, section/name positions, centred white footer, ASCII fallback, clicks past the former 200-high bounds, Enter/Escape, and nested/error restoration of temporary UI sizing. Independent source review also confirmed optional image failures reject before cache assignment, and the no-options PNG path remains unchanged. [Final results](evidence/weapon-credits-final-tests-2026-10-02.txt), [implementation/artwork identity](evidence/weapon-credits-identity-2026-10-02.json). The owner accepted the 8-pixel Japanese text and then requested the final spacing/version edits shown here; final visual acceptance of that last layout remains in the initiating chat. No full browser/GPU presentation is claimed by the software preview.

Reproduce with installed runtimes:

```sh
QUAKED_THREE_MODULE=/path/to/three.module.mjs \
QUAKED_CANVAS_MODULE=/path/to/@napi-rs/canvas/index.js \
node tools/render_credits_preview.mjs
```

Add `--small` for the 640×400 view. In the ordinary app, reload and open **Credits** to try the final UI. This local increment does not commit, publish or release assets. Concurrent liquid work remains untouched.

The final two-pixel spacing and centred header were independently reviewed; **3/3 public credits checks passed** again, including both the native image and ASCII fallback, footer navigation and UI-size restoration. [Latest results](evidence/weapon-credits-spacing-tests-2026-10-02.txt). The updated previews above render that exact final code.
