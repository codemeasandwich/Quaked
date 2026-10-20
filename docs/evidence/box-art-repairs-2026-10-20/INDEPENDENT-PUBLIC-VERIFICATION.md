# Independent verification of the two owner-reference repairs

**PASS:** the main Hexen II back is integrated, and Abyss of Pandemonium now has matching front/back artwork proportions. This review covers those two boxes. The earlier claim that the main Hexen II back was not provided is withdrawn; absence from an incomplete inventory did not justify it. Earlier receipts remain historical evidence rather than being rewritten.

The supplied Hexen II wrap is retained unchanged with SHA-256 `f4e3f4eebdf35052c943895178d45fe591a334d39a2af5630f47c7770d816118`. The approved back crop is `{left:22, top:120, width:950, height:1342}`. It includes the full back, four screenshots, all copy, id/Activision/Raven/3dfx logos and footer URLs. It excludes the white printer header/footer and adjacent spine/front. Its copy identifies the original base game, with Eidolon alive and the four original classes. The runtime back matches a uniform resize of this complete crop plus padding pixel-for-pixel.

Abyss uses one expressly authorized generated composite for its **front background extension only**. The accepted 808×975 master preserves the original 646×975 center exactly at x81. Its RGB hash is `a3ae4bbc9f72f3c7452c6a91594beb258d2f644bf9fa77c3898adedc21d95e58`, matching the original wrap crop `{left:955, top:0, width:646, height:975}` pixel-for-pixel. The 69-pixel wings and 12-pixel background-only joins do not contain title lettering, mascot, legal line or logos. Original and composed images were inspected independently. No distracting straight join was observed in either tested shelf viewport.

Both Abyss faces have 1640×2000 canvases and the same complete content rectangle `{left:0, top:10, width:1640, height:1979}`. Both runtime payloads match their recorded full source images and uniform resizing exactly. This dimension pair describes the current recipe; only the spine size, 340×2000, is universal. All spines retain the previously approved original artwork. The three rejected Malice/Quoth AI drafts remain source-only history.

Nine integrated image/custody/package contracts and all 13 shelf unit checks pass. They now require **57 faces across 19 complete boxes**, including the actual Hexen II back. The exhaustive archive check accounts for **62 recipe sources and 74 authoring images**. The temporary failure while trial files were awaiting ledger entries is retained; the gate was not weakened.

The actual public shelf passed front/back/spine views for both boxes at 1440×1000 and 390×844, using the real Turn over control. All 57 default images decoded to their individually recorded dimensions and used `contain`. Twelve face screenshots were inspected, with complete artwork and matching Abyss front/back placement. Partial overrides, corrupt-image fallback and the real desktop adapter with its explicitly mocked empty native library also passed. There were no page, console or HTTP errors. The final browser/server session closed normally.

Compared with `b61e928e1594fab07acf0894e33a1e07d9183b57`, **55 previous runtime images remain byte-identical**. Only the Abyss front changed, and the main Hexen II back was added. The browser receipt's current source hashes were independently read back and match.

```sh
node --test tests/box_art_contract_test.mjs
QUAKED_THREE_MODULE=/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_shelf_test.js
node docs/evidence/box-art-standardization-2026-10-20/owner-repair-browser-check.mjs
```

The detailed result is `independent-public-review.json`. Its linked contract logs, browser receipt and runtime-delta receipt are new evidence; earlier receipts are preserved. Native builds, publication, owner acceptance and release are separate gates. This verifier performed no provider calls, builds, commits or landing.
