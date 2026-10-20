# Independent Shareware Quake alignment plan review

Reviewed owner screenshot, `tools/box_art/standardize.mjs`, the Shareware rows in `docs/evidence/box-art-standardization-2026-10-20/derivation.json`, retained spine original and current front/back assets. Review only; no build, test, generation or product edits performed.

The screenshot shows a real presentation failure: the 340x2000 spine has its intact 340x1539 material strip at y=230, leaving flat blank caps. Canvas dimensions and mesh alignment pass while visible printed material stops short of the box edges. The existing proportional contain operation explains this exactly.

## Smallest sound correction

Keep the established 1640x2000 front/back and 340x2000 spine canvases and shelf geometry. Keep all source lettering, id logo, disk icon and specifications at their current proportional scale. Generate/author only matching background material to fill the spine's exposed 230-row upper and 231-row lower regions. Composite the intact retained proportional source panel over that background, preserving its printed content rather than trusting a generated copy of text. Make the extension visually continuous across the join: no repeated logo, mirrored letters, smeared edge or uniform black cap.

Do the same narrow background-only completion for the front's 19/20-pixel side margins and back's 38/39-pixel side margins so material reaches the face edges. Leave meaningful face content unchanged. Avoid changing the crop to cover: at height 2000 the spine source would be about 442 pixels wide, losing about 102 pixels horizontally and clipping its widest text.

Inspect the three panels together before choosing exact spine placement. If the owner's intended alignment includes the gold/dark horizontal background transition, align that background landmark to the front/back transition by moving the *whole* intact proportional spine strip and extending the resulting unequal end regions. Measure the seam from source pixels; do not treat an estimated row or matching border dimensions as proof. If the three independently authored backgrounds cannot support a continuous wrap seam without moving printed content, retain printed content and explicitly show the material extension for owner acceptance instead of silently reflowing it.

## Required acceptance evidence

- Flat back/spine/front contact at equal 2000-pixel height shows edge-to-edge printed material, complete text/logos and no blank caps or sidebars.
- Original proportional spine source region remains intact after resampling/compositing; only background outside that region is new. Record source/generated identities and composition bounds.
- Actual shelf at the owner's oblique angle, plus direct front, back and spine views at large/small viewports: full-height material reaches mesh corners and no patch boundary appears at y=230/1769.
- Front/back and spine output dimensions remain 1640x2000 / 340x2000. Only Shareware runtime assets and exact related manifest/provenance entries change. Local overrides and all other boxes remain unaffected.
- A correct result is a one-box trial for explicit owner acceptance. It does not establish that all other boxes meet this stronger visible-edge requirement.

Bluey remains unavailable as reported by coordinator: storage_error correlation `215288f8ac894e3f991cde2d083507a3`; no board mutation is claimed. Coordinator owns implementation and durable source ledger.
