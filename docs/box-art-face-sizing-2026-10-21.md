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


## Wider-face geometry clarification

The owner clarified that both artwork sides must be uniformly scaled to the common box height; the physical box width follows whichever side is wider at that height. Center the narrower side so its remaining gap can be inspected. This authorizes geometry changes for every box while the other seven artwork/crop decisions remain pending. No image bytes change for this increment, including all nineteen spines.

The synchronized continuation checkout is /Users/bri/.codex/worktrees/box-art-dev-sync/Quaked, branch codex/box-art-dev-sync tracking origin/Dev. The owner then explicitly requested a fresh pull: git pull --ff-only origin Dev confirmed ae03a8b2 up to date before implementation.

The existing shelf now reads a tiny generated module containing only the retained38front/back content rectangles. Each printed face uses scale=boxHeight/contentHeight, the physical width is boxHeight*max(frontContentWidth/frontContentHeight,backContentWidth/backContentHeight), and the complete narrower print is centered. Only previously declared authoring padding is outside the visible face. Box height and existing depth=round(height*.17) remain common; the spine fitting path is unchanged. Fractional box widths preserve the full widest edge without integer rounding.

Both front and back optional overrides are decoded before settling their shared geometry; whole custom images use their actual dimensions, without the old aspect clamp. A failed local image switches to the bundled face for that shelf session and recomputes the shared width, without rewriting saved owner overrides. Missing faces retain printed placeholders. The generated metadata is refreshed by the existing standardization tool, and a maintained contract compares every entry to the retained final recipe.

Execution remains with this chat: independent source and public rendering checks, native feedback build and launch. Source publication/owner appearance acceptance remain distinct. Bluey whoami again returned storage_error (d9c1670d1be74b52abbf023591ee2a75); this ledger retains actual scope and next action without claiming board mutations.

The owner corrected synchronization scope to LOCAL Dev only. No further GitHub fetch, pull or push is authorized for this increment. Local Dev advanced to0cf557a6 with other agents' committed texture work; all four existing geometry-file baselines were byte-identical to this chat's isolated base, and only the six owned geometry/doc/test files were transferred onto the clean local Dev checkout. Primary local Dev is the delivery workspace; other agents' sources, indices and artwork remain intact. The first isolated native attempt failed ENOSPC before Rust compilation; its log is retained under dist/wider-face-geometry-20261021/build.log, and the owner has since freed space.

Owner isolation correction: stop work on primary Dev because staged changes block other agents. The primary commit process was stopped at the owner's direction; all10owned files and the exact patch were retained and restored out of primary Dev, whose working tree/index are now clean. Continuation is exclusively /Users/bri/.codex/worktrees/box-art-width-fit/Quaked on codex/box-art-width-fit, created from latest local Dev24cac38c. All10transferred file hashes matched before this ledger update. Do not stage or run long verification on primary Dev. Qualify in this worktree, incorporate later local Dev changes here, and only briefly fast-forward the completed work into local Dev when safe. No GitHub operations are authorized. Cancelled gate/source recovery evidence remains /private/tmp/quaked-wider-faces-transfer and dist/wider-face-geometry-20261021.


## Hexen II catalogue artwork identity repair

Owner reported missing Hexen box art after the combined build. All nine Hexen images are present and verified in the packaged app, but the integrated native/engine catalogue now uses hexen2, hexen2-demo and hexen2-portals while the retained artwork inventory uses mod_hexen_2, mod_hexen_2_shareware and mod_hexen_2_portal_of_praevus. Previous visual tests exercised the legacy artwork identities and missed this caller-integration mismatch.

Use one private artwork-alias resolver for initial defaults, late image-probe fallback and initial layout fallback. Keep all image bytes, canonical inventory identities, dimensions and geometry unchanged; preserve both actual engine IDs and legacy artwork IDs. Local per-face overrides still win independently. Add Hexen II kind labels so actual entries do not say A Quake add-on. Artwork never changes playable status or validation reasons. A maintained regression uses the actual GAME_CATALOGUE_GAMES entries; focused public browser checks must exercise all three actual IDs and their override/fallback paths. Work remains isolated in codex/box-art-width-fit, with only brief qualified integration into local Dev; no GitHub operations.

Hexen identity repair independent checks passed for all three actual catalogue identities at both viewport sizes, including default front/back/spine, initially missing overrides and later-disappearing overrides. All57image hashes/dimensions remain unchanged. Local Dev was pulled into the isolated worktree at45d7924a before qualification. Bluey whoami remains unavailable with storage_error correlation500af33e760e477a91deec80e562d933; this chat retains scope, evidence, native-build and local Dev delivery responsibility. No assignment or Done mutation is claimed.
