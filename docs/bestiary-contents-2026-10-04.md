Later increment: [nine additional folios and parchment page backs](bestiary-verso-2026-10-04.md) adds one creature per right-hand page and expands the researched catalog to 28. This document retains the earlier 19-entry verification.

# Contents and Complete Edition — 4 October 2026

The book now opens in the owner's requested sequence: outer leather cover, ordinary illustrated inner cover, supplied Contents, then existing creature spreads. Each introductory page occupies the right side with a blank reverse on the left. Forward/backward keyboard and touch navigation share the same page mapping and animation bounds.

The inner illustration alone changes to the supplied **Complete Edition** when all **47 distinct Contents identities** are collected. The owner explicitly selected the full 47-page requirement over the currently implemented 19. Neither the outer cover nor Contents changes on completion; viewing either grants no discoveries. The ordinary inner illustration remains visible while the replacement loads or if it fails. Existing 30-second transport bounds and late-callback protection apply to both new assets.

## Source and persistence contracts

- `newer/bestiary/contents.png` is byte-identical to clipboard `01d77215-c444-43df-978d-4ab51034f57b`: SHA-256 `2e8b4119a9aa82d6cf380aaffb627bf3a7a072835bf5f0a646f4ec4565057abb`.
- `newer/bestiary/frontispiece-complete.png` is byte-identical to clipboard `d0697f31-83b8-4490-a654-6088f0fcd999`: SHA-256 `9652c3e3c81446454e348d8ec12a6aebd8ab6c82e3f038538595025d0825fb0f`.
- All 18 earlier PNGs remain unchanged. `SOURCE.json` records provenance for all 20 files. No source image pixels, lettering or printed folios were edited.
- `BESTIARY_ENTRIES` remains the existing 19 verified runtime identities. `BESTIARY_COLLECTION_IDS` separately records the 47 names from Contents as stable IDs. Completion uses membership of every required ID; counts, repeated IDs, unrelated IDs, downloaded art and a saved `complete` flag cannot qualify it.
- `BestiaryJournal.complete()` derives state from the current in-memory journal; runtime frontispiece selection explicitly reloads first, allowing discoveries saved by another tab to take effect. `snapshot().complete` exposes the derived state for diagnostics. Storage namespace and version remain `quaked.bestiary.v1` / 1. The existing 19 IDs and snapshot order are retained, with reserved discoveries appended in Contents order.
- Collection-only IDs can be retained for future implementations but cannot start first-sighting encounters. Native classification still requires the existing verified catalog. No invented classname or model aliases were added for the remaining 28.

The printed Contents numbering differs from the folios on earlier supplied creature illustrations. This increment preserves their established order and immutable artwork; it does not renumber or reorganize those creature spreads to match the new numbering.

## Verification and trial

Independent planning and source review found no correctness blocker. An independent tester ran the production public interfaces and real-canvas book rendering alongside existing native/menu/startup controls: **60/60 passed, exit 0** across ten suites. Checks include every missing-one combination (all 47 cases of 46/47), only-19 rejection, full-47 persistence and cross-tab selection, duplicates/unknown IDs, collection-only encounter rejection, decode/failure fallback, unchanged outer cover/Contents, forward/reverse turns and locked artwork isolation.

The final gate's 174 source/test/asset hashes were checked again after completion and remained unchanged. Two earlier test-oracle mistakes and a later test-edit syntax failure were fixed and their logs retained; neither failed run is presented as a passing gate.

- [Passing test log](evidence/bestiary-contents-tests-2026-10-04.txt)
- [Public receipt and limits](evidence/bestiary-contents-public-receipt-2026-10-04.json)
- [Qualified source hashes](evidence/bestiary-contents-source-2026-10-04.sha256.json)
- [All 20 original-byte comparisons](evidence/bestiary-contents-art-proof-2026-10-04.json)
- [Native browser diagnostics](evidence/bestiary-contents-native-2026-10-04.json)
- [Displayed Contents screenshot](evidence/bestiary-contents-native-2026-10-04.jpg)

Browser verification used the actual Newer E1M2 menu book: cover → original inner illustration → Contents. Existing profile discoveries remained `grunt, knight, zombie, ogre, fiend`; completion remained false and GL error was zero. A Chromium pointer-lock/input UnknownError is retained in diagnostics, so this is not a claim of zero browser errors. Completion rendering/selection was tested with controlled journal inputs; the user's browser profile was never seeded with artificial discoveries.

Try [the game trial](http://127.0.0.1:8015/tests/bestiary_trial.html): choose **Open bestiary**, then **Next page** twice to reach Contents. Controls can be hidden; F2 restores them. In the normal game use the Bestiary menu entry. Existing discoveries persist in the same browser origin/profile.

## Current delivery boundary

The requested sequencing and strict completion swap work. Only 19 of 47 entries have verified native discovery mappings, and only 16 have supplied creature folios. Consequently, the current game cannot yet earn the Complete Edition through ordinary gameplay. Expansion-pack gameplay remains unverified because its packs are not installed. Remaining creature assets and native mappings are separate future work, not queued or claimed implemented by this increment.

This is an uncommitted working trial awaiting owner presentation acceptance. No release, commit or push was authorized by this request. Explanatory README/trial copy and this documentation were updated after the gate; the tested runtime and assets stayed unchanged.
