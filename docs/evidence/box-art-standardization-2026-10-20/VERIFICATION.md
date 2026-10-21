# Independent public-interface verification

This verification belongs to the 20 October 2026 box-art normalization increment. It exercises the existing public shelf functions and desktop asset collector. It does not compile or launch the native application, open an owner game archive, authorize compatibility, publish a release, or record owner visual acceptance.

Run the focused source/image contracts from the repository root:

```sh
node --test tests/box_art_standardization_test.mjs
```

The checks fully decode every shipped image with Sharp, require front/back 1640×2000 and spine 340×2000, bind the runtime source to the manifest and actual file inventory, verify retained source bytes and crop bounds, check per-face overrides and missing-face behavior, and use the actual desktop asset collector to check shipping inclusion and authoring exclusion. The saved `baseline-runtime-manifest.json` is the original 29-face manifest captured before normalization; historical hash checks resolve superseded paths through the explicit derivation record.

Run the public browser trial separately:

```sh
node docs/evidence/box-art-standardization-2026-10-20/browser-check.mjs
```

The trial starts a temporary loopback HTTP server and installed headless Chrome. Its main phase imports the actual `GameShelf_Show` function and decodes all real shipped images, checks physical CSS proportions at 1440×1000 and 390×844, cycles through all 18 boxes, uses the real Turn over button, and saves every front, back and actual shelf spine at both sizes. A second phase checks one local back override, a corrupt optional local front falling back to its bundled front, and a corrupt unboxed face becoming a printed placeholder.

The desktop phase imports the actual `Desktop_ShowShelf` adapter with an explicitly labelled mocked native `library_scan` result containing empty packs and artwork plus the approved retained folder identities. It verifies that all defaults display while all play controls remain unavailable and no native data read or launch occurs. This is browser adapter coverage, not proof of a native filesystem scan. The focused source contract separately checks that the real Rust scanner retains each approved boxed folder after source artwork is moved; no Rust compilation is part of this trial.

The script writes `browser.json` with source hashes, image dimensions and geometry, fixture calls, screenshots, request paths, failures, and its scope. A FAIL result is retained rather than treated as a pass. The receipt and screenshots must be inspected before claiming visual acceptance; exact dimensions alone cannot establish correct crops, upright lettering, or attractive fit.

The first focused Node run exposed two harness assumptions (mixed locale/codepoint sorting and prompt-file nesting); those were corrected and its log retained. All six contracts then passed. The initial sandboxed browser invocation could not bind its loopback server (`EPERM`); the same authorized trial passed with the approved sandbox escalation, and its failure log is retained. The expanded trial passed all 108 face views plus the override and desktop fixture overviews with no page, console or HTTP errors.

Independent visual review then found a material fidelity defect in the Malice AI reflow: the supplied original says **23RD CENTURY**, while the edit and its prompt say **3RD CENTURY**. This failure is retained in `independent-visual-review-first.json`; dimensions and browser mechanics passing did not qualify that candidate. A focused regression assertion now requires the exact original wording in repair instructions.

The corrected Malice edit now visibly reads **23RD CENTURY ULTRACONVERSION FOR QUAKE**. The rejected edit and original prompt remain retained; the correction has its own prompt and source identity. All six contracts passed again against 53 active faces and 48 retained sources. `browser-malice-corrected.json` passes the affected Malice front/back/spine views at both sizes, re-decodes all 53 current default images, repeats the override and desktop fixture checks, and binds the current implementation, manifest, derivation, prompts, test and harness hashes. Use `--game=malice` with the browser command to repeat this targeted check. The six contact sheets were refreshed with those corrected screenshots. `independent-visual-review.json` records the final independent PASS and its limits; owner acceptance remains separate.

`make-ui-contacts.mjs` produces six contain-fit review sheets from the actual screenshots. Each sheet was inspected; all box boundaries, front/back roles and other spine layouts fit both viewports. Screenshots are deliberately dim because these artwork-only fixtures contain no supported game data. No claim of native application execution, owner acceptance or release follows from these browser trials.

## Newly arrived Immortal Lock artwork

A subsequent owner-library scan found a newly added combined cover for **The Immortal Lock**, after the initial 18-title batch had been committed and pushed as `6e3e0237`. Its additional verification is recorded separately: the earlier receipts and screenshots remain historical evidence for that batch.

Independent visual review caught a split footer in the first crop: the x792 back/spine boundary put a stray **P** on the back and clipped the start of **PC / MAC** from the spine. `immortal-lock-visual-first.json` and its retained first-panel images preserve that failure. Moving the shared seam to x770 keeps the entire footer on the spine without affecting the back's main copy; a regression check now protects that source feature and contiguous panel boundaries. No AI was used for this title.

The focused six contracts passed against **56 active faces, 19 boxed titles, 49 retained sources and seven retained folder identities**. The new `immortal-lock-browser-check.mjs` re-decoded all 56 current defaults and checked their actual CSS proportions, exercised the new front/back/spine and real Turn over control at both viewport sizes, and checked the actual desktop adapter with its explicitly labelled empty-data fixture. All six new UI views and the adapter overview passed with no page, console or HTTP errors. The normalized panels, original wrap and all six actual shelf images were inspected; title, emblem, footer, back copy and artwork remain complete.

`immortal-lock-source-custody.json` independently compares the actual supplied PNG with its retained project original and verifies that all 53 previous runtime image hashes still match the committed first-batch manifest. `immortal-lock-independent-review.json` records the supplemental independent PASS and a successful readback of every current source hash in `immortal-lock-browser.json`.

```sh
node --test tests/box_art_standardization_test.mjs
node docs/evidence/box-art-standardization-2026-10-20/immortal-lock-browser-check.mjs
```

Native application execution, owner acceptance, landing and release remain separate gates.
