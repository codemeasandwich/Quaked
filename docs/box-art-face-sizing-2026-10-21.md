# Box face sizing — 21 October 2026

Owner requests physical front/back faces fitted to complete artwork, all spine widths/heights unchanged. Follow-up explicitly requires front/back dimensions to match; present every differing pair for owner choice of which side to resize. Do not infer permission to stretch, crop or regenerate either side.

The existing recipe records the exact published-content rectangles; use those to exclude only previously added authoring padding, without image-byte changes. Audit found 11 differing pairs and 8 matching pairs. Even one-source-pixel differences are included. No size/geometry or artwork mutations have been made for this increment.

| Game | Front artwork pixels | Back artwork pixels |
|---|---|---|
| Arcane Dimensions | 1525×2000 | 1523×2000 |
| Dawn of the Machine | 1452×2000 | 1433×2000 |
| Dimension of the Past | 1452×2000 | 1440×2000 |
| Alkaline | 1565×2000 | 1640×1963 |
| Hexen II: Portal of Praevus | 1568×2000 | 1562×2000 |
| Hexen II shareware | 1415×2000 | 1417×2000 |
| Hexen II | 1576×2000 | 1416×2000 |
| Quaked | 1399×2000 | 1389×2000 |
| The Immortal Lock | 1565×2000 | 1624×2000 |
| Tremor | 1452×2000 | 1426×2000 |
| Quake | 1640×1912 | 1640×1914 |

Matching pairs: Abyss of Pandemonium, Scourge of Armagon, Malice, Dimension of the Machine, Quoth, Dissolution of Eternity, Quake shareware, X-Men.

Responsibility remains with this chat. Next: obtain owner front/back choices for mismatched pairs, implement shared per-box face geometry using accepted proportions, preserve every340×2000 spine and test rendered fronts/backs at desktop/mobile. Independent planning review recommends content rectangles, bundled-URL-only metadata and unchanged local-override behavior. Bluey whoami failed storage_error correlation152f516866024e9eb0de95e3d8ce107a; no board assignment/update is claimed. The native app currently running remains the preceding mission-wrap trial.

Owner decision: crop both Quake faces to1640×1912, both Arcane Dimensions faces to1523×2000, both Hexen II shareware faces to1415×2000, and both Portal of Praevus faces to1562×2000. All other mismatches remain pending visual inspection. Apply these eight exact output-canvas crops after existing source derivation/composition, without further resampling or generation. Original archived sources and all nineteen spines stay unchanged. Retained pre-crop runtime images are in dist/box-face-crops-20261021/baseline. Approved rectangles/provenance are in the adjacent approved-crops.json evidence. Independent planning confirms existing front-natural-aspect shelf geometry already produces the correct box widths with unchanged spine depth/height; no runtime geometry change is needed for these four pairs.

Current work: finish deterministic derivation support, verify exact crop pixels and all49 untouched image hashes, run public shelf front/back checks, then build and open a new Mac feedback trial. No source commit or release is claimed. Bluey whoami again failed storage_error correlationd21ae9cacd6e4c1a84062331f0b789c4; this chat retains responsibility for verification and launch.

Four-pair implementation verified: all8results equal exact crops of retained baseline pixels, all49other images including every19spine remain unchanged. The maintained artwork tests pass9/9. Independent actual shelf checks pass at desktop/phone with16front/back captures and identical spine dimensions per viewport. Mac universal build exited0, all57packaged artwork faces match the retained manifest, strict deep signing passed, and the retained app opened successfully with exact process PID10042. App: dist/box-face-crops-20261021/Quaked.app. Owner appearance feedback remains pending.

Owner additionally authorized synchronization of all this chat's completed changes to Dev. Current checkout is already Dev; scope includes the mission-wrap source increment and these eight approved crops. Preserve concurrent agents' dirty/staged work, run the unchanged normal checkpoint hook, then publish and fetch/pull remote Dev without discarding unrelated changes. A subsequent global synchronization waits for the owner's later instruction.
