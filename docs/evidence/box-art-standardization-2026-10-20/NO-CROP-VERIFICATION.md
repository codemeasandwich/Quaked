# Final artwork proportion and no-crop verification

The owner's final ruling makes **340×2000 mandatory only for spines**. Front and back images can have different dimensions and shapes. Every face must retain its complete meaningful artwork, original proportions, lettering and logos. The current front/back canvases remain 1640×2000 as this batch's recipe; those numbers are not a universal acceptance requirement.

The final runtime uses the complete supplied Malice and Quoth spine originals with uniform scaling and padding. All three AI drafts and their prompts remain retained as rejected history; none is selected for runtime. Earlier receipts record earlier trials and do not override this final ruling.

Both focused contract files pass: **nine checks** cover all **56 faces, 19 titles and 49 retained sources**. Spine dimensions remain strict. Front/back dimensions must be positive decoded values matching each individual manifest and derivation row. Source fit proportions, custody, canonical roles, source-only packaging exclusion, local overrides and missing-face fallbacks remain checked. For the disputed Malice and Quoth spines, decoded runtime RGB matches a uniform resize of the complete supplied source plus padding **pixel-for-pixel**. Their glyphs and the original elliptical CD are not redrawn.

The original shareware, Armagon, Dissolution and Machine spine canvases were independently inspected. Their existing reviewed full-height printed-strip bounds remove only outer black/gradient authoring padding; no lettering, logo or meaningful strip artwork falls outside those bounds. Combined covers retain their separately reviewed panel boundaries, including the repaired Immortal Lock footer seam.

The actual shelf passed **114 default face views** at 1440×1000 and 390×844. All 56 real images decode to their recorded dimensions, every image face uses `background-size: contain`, and every title turns over correctly. Six new contact sheets from those actual screenshots were inspected. The complete original Malice/Quoth art occupies a smaller region within its uniform spine canvas because padding preserves its proportions.

Two deliberately mismatched local-art fixtures prove the display rule: a square front with a tall back, and a tall front with a square back. The test samples the actual rendered PNG pixels at four distinct colored corner markers after each real turnover. **All 32 corner samples across eight views match their expected RGB values exactly**, showing that every source edge remains visible at both viewport sizes. These SVGs exist only as test responses; they are not product artwork. Partial overrides, corrupt-image fallbacks and the real desktop adapter with an explicitly mocked empty native library also pass. There are no page, console or HTTP errors.

```sh
node --test tests/box_art_contract_test.mjs
node docs/evidence/box-art-standardization-2026-10-20/no-crop-browser-check.mjs
```

The final receipts are `no-crop-contracts.log`, `no-crop-browser.json` and `no-crop-independent-review.json`. The last report confirms a fresh readback of every browser receipt source hash. The initial disk-full browser failure is retained separately; cleanup now runs even when receipt writing fails. The final browser and loopback server completed and closed normally.

This verifies source assets and public browser behavior. Native execution, landing, release and owner acceptance remain separate gates.
