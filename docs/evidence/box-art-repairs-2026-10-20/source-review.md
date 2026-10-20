# Independent source review — Abyss front and Hexen II back repairs

Reviewer: supervised independent lane `art_contract_update`, `/Users/bri/SOURCE/Quaked`. Review scope is the final composed Abyss front, supplied Hexen II back and their existing shelf wiring. Only this new review and `shelf-check.log` were written by this lane. Public contract/browser checks belong to the separate public tester; this lane made no artwork, product-source, contract-file or index edits and ran no native build or commit.

## Disposition

**PASS for source integration and visual quality of these two repair roles.** Current inventory is57 canonical faces over19 titles. All19 supplied boxes now have front/back/spine. Only the Abyss front changed and Hexen II back was added compared with `b61e928e1594fab07acf0894e33a1e07d9183b57`; all55 other prior runtime face hashes are identical. The parent owns subsequent exact-index ordinary delivery verification, packaged57-face readback, publication and owner trial. This report is not owner appearance acceptance or release authority.

## Abyss front: complete elements, wider faithful composition

Compared the original full wrap, retained retail square scan, physical packaging references, final808×975 master and normalized runtime front/back. The original supplied front panel was narrower than the back; the earlier split retained its meaningful content. Source x940–942 is a scanned fold line, not artwork. The final clean source starts atx943. The accepted final master is `front-expanded-master.png`, SHA-256 `5f95e591f4bd3981a23d39a9223483793d967b31fd10e2f5c0581fcc6a5390df`.

The compositor uses AI-v2 background as donor only for new69px wings and the independently inspected12px background-only join strips. A smoothstep original weight becomes exactly1 at clean source x12 and stays1 throughx657. Thus master x81–726,646×975, is exactly original full-wrap source x955–1600. Those protected RGB pixels independently match SHA-256 `a3ae4bbc9f72f3c7452c6a91594beb258d2f644bf9fa77c3898adedc21d95e58`. Every title glyph, mascot eye/tooth/face feature, PC/MAC line, subtitle, legal line and circular logo lies inside this unchanged region. The blended original-edge strips contain smoke/haze/fire/scan texture only. No original meaningful element is redrawn, stretched, shortened or relocated.

Strict restoration of the entire670px background rectangle caused an artificial hard texture join. Direct row correction then created bands; later Hermite/Poisson trials left a fine border. Those failed candidates remain source-only. The accepted bounded background feather eliminates the previous hard seam in both full808×975 view and250×302 shelf preview. The extension continues the original smoky green/brown upper field and orange lower haze; no new letters, logos or objects were observed. Physical references support this palette and wider packaging shape. They were comparison material, not a license to replace the original typography or central artwork.

Independent direct pixel reconstruction confirms the normalized runtime front is exactly the accepted full master uniformly resized and contained according to its recipe. Its content placement is **left0, top10, width1640, height1979**, exactly the same as the unchanged back, inside the1640×2000 canvas. Full normalized front/back inspection found complete text/logos and no visible pasted vertical crease. Runtime front SHA-256 is `e50c3843460e87f82dd31cc9fbcfaf5dbc8cbbaa1e57a740068ede86e4653c1a`.

## Hexen II back: supplied original panel

Inspected `mod_hexen_2/owner-wrap.png` and the actual normalized back. Recorded crop **left22, top120, width950, height1342** selects the complete main-game back panel. It excludes only white printer margins and the neighboring spine/front; the front's Steam Backup Disc header is not imported into the back. The top Hexen II title and description, four screenshots, section headings/body, central emblem and bottom publisher/developer/distributor logos and URLs are complete and retain source proportions. This is supplied original artwork, not an AI reconstruction.

Independent direct pixel reconstruction confirms the runtime back equals this crop uniformly resized to1416×2000 and centered atleft112. Side padding preserves the tall source panel inside the1640×2000 face. Source SHA-256 is `f4e3f4eebdf35052c943895178d45fe591a334d39a2af5630f47c7770d816118`; runtime SHA-256 is `ef7ce484563f8b166cfa99ad029eb332cee926c2a0863d3cd94b940f2c164c14`.

## Source wiring and checks actually performed

The shelf source diff only adds the canonical Hexen II back path. Abyss retains its existing front path with newly derived bytes. Existing CSS `contain`, per-face local overrides, fallbacks, game selection and playability boundaries remain unchanged. Supplying a back does not grant Hexen II engine compatibility or mountable game data.

Reviewed `compose_abyss_extension.mjs`: fixed in-project inputs/output; original center copied with weight1; changes limited to the two new wings and reviewed background joins; post-write center identity asserted; composition receipt names the precise protected source rectangle, blend bounds, removed scan fold and owner authority. The final derivation selects only the accepted master and supplied Hexen II wrap. No path named draft/trial/rejected/band/Hermite/Poisson directly supplies a live face. Earlier rejected AI spine layouts remain historical source-only material.

Read-only verification results:

- Accepted master SHA and protected646×975 RGB identity: **PASS**.
- Runtime Abyss front/back and Hexen II back decoded RGB equal independent proportional recipe reconstruction: **PASS**.
- Front/back Abyss artwork placement equality: **PASS**.
- Only the intended two repair roles differ from prior inventory: **PASS**.
- Scoped whitespace check: **PASS**.

Maintained shelf command:

```sh
QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_shelf_test.js
```

**13/13 passed**, preserved in `shelf-check.log`. No maintained contract suite, browser trial, native build, packaged-app verification, commit, push or source cleanup was run in this review lane for this increment. Those remaining gates must be tied to the actual final candidate.

## Reviewed snapshot

| Path | SHA-256 |
|---|---|
| `tools/box_art/compose_abyss_extension.mjs` | `cb136b4f0046c961440a66568b4e44592ab215b121148e9b95cacc022bb4ab6a` |
| `src/newer/ui/game_shelf.js` | `36f929174ddf9905a0f3a2651101880329167e92225a1941b43405a3de394e20` |
| `assets/boxes/manifest.json` | `68fe0479a1b385c82dc8d45a68d98ab5c35887a30919f495455d78791fbdcccc` |
| `docs/evidence/box-art-standardization-2026-10-20/derivation.json` | `01a490d2d38c44b182aced55f75472e5b92dfcbe6bc38f84f8be4ec7dbe5046c` |
| `assets/authoring/box_art/import-2026-10-20/aopfm_v2/cover.png` | `3ba9aba5948221135496cce392aa509eb605ff6995837ff09e23df5e09f60c40` |
| `assets/authoring/box_art/repairs-2026-10-20/aopfm_v2/front-expanded-master.png` | `5f95e591f4bd3981a23d39a9223483793d967b31fd10e2f5c0581fcc6a5390df` |
| `assets/authoring/box_art/repairs-2026-10-20/mod_hexen_2/owner-wrap.png` | `f4e3f4eebdf35052c943895178d45fe591a334d39a2af5630f47c7770d816118` |
| `assets/boxes/aopfm_v2/front.webp` | `e50c3843460e87f82dd31cc9fbcfaf5dbc8cbbaa1e57a740068ede86e4653c1a` |
| `assets/boxes/aopfm_v2/back.webp` | `3db4d7d5ba07c683d5ca65272696eabe9079ca1dc6f51a42d3f4fc32d4bdf216` |
| `assets/boxes/mod_hexen_2/back.webp` | `ef7ce484563f8b166cfa99ad029eb332cee926c2a0863d3cd94b940f2c164c14` |
