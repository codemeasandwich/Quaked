# Q92 channel-map delivery review

Read-only integration review against current texture index SHA256 `f740bc2adeaad393f1924892e19e2139efa5fd0c8bfdd115804f860aef2b5e7a`. No build, packaging, app launch or release performed. Machine evidence: `q92-delivery-closure-review.json` beside this report.

## Current HTML and Tauri collectors cover the added files

Direct calls to `collectAssets` (`tools/distribution/manifest.mjs:36`) returned 3,027 web and 4,686 desktop paths. Every one of the 21 currently registered `normalChannels` images is included in both profiles: zero missing. The collector recursively walks `newer/textures` (`manifest.mjs:9,17-24,38`); it does not select texture companions by JSON property names. Registered assets under `newer/textures/official` are included, while authoring candidates/sources are deliberately excluded (`manifest.mjs:11`). No collector change is necessary for these new properties.

`tools/distribution/build.mjs:20,53-65` consumes this inventory and preserves source bytes, embedding them into the single HTML or copying them to the numbered desktop assets. It records logical path and SHA256 for every payload. `tools/distribution/bootstrap.js:9-28` strips query strings through URL pathname normalization and resolves arbitrary registered logical paths; the new property names do not change resolution. `src-tauri/tauri.conf.json` bundles `dist/desktop-assets` as `assets/`; `tools/distribution/archive-mac.mjs` verifies external packaged bytes against the inventory.

No current index binding contains `glossOpeningFile`. It follows the same generic `loadPicture` -> `COM_NewerURL` -> `AssetURL` path and would be included under the same non-excluded texture directories. That is structural coverage only, not a verified installed glass-mask artifact. Once registered, rerun the inventory closure check including its actual file.

## Existing built artifacts are stale

Both existing `dist/web/inventory.json` and `dist/desktop/inventory.json` report source `a28d939647d93f7c1ea96160ebb79751388d2fcb` and omit all 21 new channel images. Thus the current source collector supports delivery, but these existing built products do not yet contain the change. The smallest next step is the existing authorized distribution build and its normal artifact verification, not a second collector.

## Legacy newer.pak is not currently buildable

`tools/build_newer_pak.py:20-30` recursively enumerates all of `newer/`, including candidates and alternates. It enumerated 6,828 files; all 21 registered channel files are present. However 4,189 paths exceed the serializer's 55-byte limit (`main`, line35). The first deterministic rejection is the pre-existing 56-byte `newer/bestiary/alternates/egyptian-guardian-original.png`; the new channel paths are themselves 68-69 bytes. No `newer.pak` exists in this checkout. This is a legacy archive constraint, not omitted `normalChannels` handling.

The maintained HTML/Tauri route does not depend on this optional archive: `manifest.mjs` lists `newer/maps.pak` and `newer/startup.pak`, not `newer.pak`. Keep the bounded Q92 delivery on that existing route. If standalone legacy PACK delivery is separately required, it needs a product-only inventory plus short logical runtime filenames/references (including all other long paths). Merely skipping long names would not produce a complete standalone pack, and widening the gate would truncate standard PACK names. Do not claim the current legacy builder succeeds.
