# First photographic world-texture pair

Two built-in GPT image edits are ready for owner inspection: Hexen II `rtex337` (native64×128 →256×512) and expansion-own Portal of Praevus `rtex450` (native128×128 →512×512). Current outputs are `base/rtex337-v2-*` and `portals/rtex450-v1-*`. Each has diffuse, height and separate normal XYZ files, all lossy WebP quality92. Exact prompts, original identities, generated masters, registration/encoding receipts and the local review page are in `assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/`; `manifest.json` identifies the current maps.

Open `index.html` there in a browser, or inspect `first-two-preview.jpg` and the per-material review sheets. The page shows actual decoded Q92 colour, repeated tiles, both distance comparisons and two static relief-light directions. Prompt text files preserve the exact built-in generation instructions. Original PNGs remain native identity witnesses; generated/finished PNGs are authoring masters, not delivered runtime maps.

## Checks and corrections

Independent art review accepted grey masonry v1. Sandstone v1 was held because its upper joint shifted left; v2 uses the existing photographic finisher on transposed images to register the measured original joint centre30.5 to generated26.6606538895 in native coordinates. Fixed endpoints retain tile cropping, and no native pixel-grid reconstruction was introduced. Independent re-review accepted v2; the v1 HOLD receipt remains intact.

Both delivered textures passed half- and quarter-native BOX comparisons against originals on identical grids. Sandstone uses32×64 and16×32 (RGB MAE10.4487 and8.5007); grey stone uses64×64 and32×32 (MAE5.6873 and3.2669). These metrics describe similarity, not automatic visual acceptance. Photographic detail, course scale, colour/intention, existing edge phase and the decoded repeated tiles were reviewed independently. Existing masonry joints at native tile boundaries are retained; edge MAE alone does not distinguish an intended mortar joint from an artificial frame.

All10 delivered maps independently passed source/receipt/hash/dimension checks, exact quality92 byte replay and lossyVP8 verification. Actual source occurrences were re-read from owned archives; both copied Portal PAKs match. The normal equation and decoded angular errors were independently checked, with floating-point tie effects separated from exact production replay. A short-lived loopback HTTP preview returned14 exact referenced resources and was closed. The maps are derived relief interpretations; no measured physical displacement is claimed.

## Source inventory and preservation

The bounded source audit found980 WORLD embedded native variants:594base and386expansion-own. Effective maps are42base and59withPortal (42base+17expansion). Triage is887ordinary,72animated,12liquid,5sky,4utility; numeric names and opaque markers still require material inspection. Enemy/model skins and unreferenced WAD content are outside this first WORLD audit. Two ordinary identities now have this initial art pair; that does not imply the full campaign or runtime coverage is complete.

The inventory CLI's seven public test groups pass. Independent source review prompted two preservation fixes: refuse top-level relevant loose-directory symlinks before traversing, and preflight every native/contact output with exclusive contact creation. A fresh audit after those fixes was byte-identical to the retained final native inventory; source, test and receipt hashes are recorded in `docs/evidence/hexen2-textures-2026-10-19/final-source-verification-v3.json`. Earlier failures and superseded receipts are retained as history and do not establish current acceptance.

## Delivery state

This is a technically and artistically reviewed offline authoring increment, pending owner acceptance. It is not installed in the game: current Dev has the approved Hexen support design, not qualified Hexen runtime support. Authoring storage avoids Quake's recursive runtime texture packaging and name registry. No shared PAK reader, Quake texture index, runtime distribution binding, release ref or retained rock trial was changed by this texture work. Concurrent renderer and sound edits belong to other work and were left untouched. No commit, push, full build, game launch or release of these assets is claimed.

Evidence: `first-batch-art-review.json` (v1HOLD/450PASS), `first-batch-art-review-v2.json` (current artPASS), `first-batch-public-verification.json` (current technicalPASS), `first-batch-public-final-metadata.json` (final manifest/status binding), `source-review-v2.json` (adapter review) and the separate source-audit verification. The manifest records current reviewed asset versions; owner acceptance and runtime integration remain pending.

Next action: owner inspects the first pair and confirms the visual direction; continue ordinary base/expansion batches from the native identity inventory, retaining the same4×/Q92, half+quarter and edge/relief checks. Runtime/profile and packaging integration remain a separately qualified implementation gate. The initiating coordinator retains the obligation while Bluey identity/storage is unavailable; reconcile to the existing feature after service-owner repair. No durable worker execution or board mutation is claimed.
