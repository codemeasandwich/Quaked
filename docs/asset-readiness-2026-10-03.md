# Selected replacement asset readiness

## Purpose and ownership

The startup coordinator needs to distinguish assets still loading from explicit
native fallbacks. These hooks extend the existing texture, skin and weapon
loaders; they do not add a second loader, start rendering, choose demo frames,
modify camera state or enable an option. The coordinator still owns when to warm
actual selected materials and when to release the loading screen.

## Public snapshots

- `R_NewerTexturesStatus(model)` reports `index`, numeric `pending`, `ready`,
  `fallback`, `total`, `settled` and `errors`. It examines that model's existing
  non-sky/nonliquid material textures. It does not count unrelated portal-model
  work as pending. Unknown manifest names and explicit failures settle to the
  existing native pixels. `R_NewerTextureSettled` recognizes this terminal
  fallback too, preventing an infinite wait after an image failure.
- `R_NewerSkinsStatus(modelNames)` reports the same fields for actual chosen
  replacement map requests and native skin-height requests. The optional filter
  accepts one `progs/*.mdl` name or an array of names/model objects, such as the
  current model precache. Omitting it reports all requested sets. The hook does
  not start every variant or preload future maps; actual alias material selection
  starts the existing requests. Index state is shared and explicit.
- `R_NewerSkinsPrepare(models)` is an explicit startup coordinator call for
  already-loaded current-map model objects. It shares the bounded index request,
  prepares every listed custom variant for those names, and visits every native
  enemy skin/animation slot in `model.cache.data.gl_texturenum` through the
  existing native material loader. It imports no model loader and changes no
  style selection. The promise is reused for the same model identity set,
  feature gates and manifest version; it resolves after requests are started.
  `R_NewerSkinsStatus` adds scoped `preparePending` and still waits for actual
  images to reach ready/fallback. Thus preparation does not falsely imply image
  readiness. Feature gates skip their own work, and shutdown prevents a pending
  retired-map preparation from starting its images. The coordinator calls this
  while holding the first demo/welcome view, not during ordinary travel.
- `R_WeaponStatus()` retains `ready` model-key arrays and `failures` diagnostics,
  and adds `index`, `preload`, pending model keys and `settled`.
  `R_WeaponsPreload()` remains a reused, awaitable promise and can be started
  concurrently behind the loading UI. Optional missing art retains native models.
- `R_NewerHudPreload()` starts the existing HUD index and all unique catalog
  image promises without requiring status-bar draws behind the full console.
  Repeated preload and lazy sprite requests share the same decoded canvas cache.
  `R_NewerHudStatus()` reports `preload`, `index`, numeric `pending`, `ready`,
  `fallback`, `settled` and `errors`. It uses the same 30-second per-request
  deadline and terminal native fallback, while retaining the HUD rendering gate.

Index/preload state uses `idle`, `loading`, `ready`, `fallback`. `settled` means
the requested selected work is terminal, not that every optional asset succeeded
or was uploaded to the GPU. Error dictionaries retain shared file diagnostics;
the coordinator can present them without blocking on failed optional artwork.

## Bounded requests and late responses

Each manifest, picture, stored scalar/height and weapon geometry/image request
has a 30-second deadline. A manifest followed by a later-started image request
can span two request waves; this is a per-request bound, not a universal startup
deadline. Existing packed-asset URL/JSON resolution is reused.

Timeouts choose explicit native/generated fallback. Late index/JSON results
cannot publish into the terminal request. Browser picture callbacks are detached
and guarded; late Three texture callbacks dispose the incoming texture without
attaching it. The Three `TextureLoader` API has no transport abort method, so
terminal cancellation suppresses publication rather than claiming its network
request was aborted. Stored scalar fetches use an actual AbortSignal. Skin
shutdown and native-height revision changes cancel their owned request timers.

Failed world requests do not retry every draw. Successful authored diffuse and
height maps retain their existing UVs, pixel ownership and update event. Failed
custom height/normal maps retain or generate relief from the matching diffuse.
Native diffuse textures remain owned by the model loader. Classic/option gates
continue to select native rendering independently of downloaded readiness.

## Verification

`tests/asset_readiness_test.js` drives public loader APIs with controlled image,
fetch and timer endpoints. It checks selected-world filtering, success and
explicit failure, index/image deadlines, no late texture/index publication,
stored native skin-height pending counts, generated-normal fallback, concurrent
weapon/shell preload, reused terminal promises and disposal of late textures.
`tests/enemy_heights_test.js` remains the native/custom height and lifetime
regression. Both suites pass 17/17 checks in the retained receipt.
`tests/hud_preload_test.js` and the native portrait regression pass another 7/7
checks for eager catalog selection, shared canvas identity, option gating,
timeouts, late image/index rejection and native fallback.
`tests/skin_prepare_test.js` adds three checks for all unseen custom variants,
two native skins with four animation slots each, actual loaded Quake dog-header
reuse, later material selection without duplicate downloads, native texture
ownership, disabled-feature behavior and retired preparation cancellation.
The preparation/readiness/enemy-height suites together pass 20/20.

The old `weapon_preload_test.js` main-entry fixture requires the startup
coordinator's new loading-screen boundaries and is owned by that coordinator.
Its existing missing-manifest loader check passes. These loader checks do not
claim browser startup acceptance, full GPU upload readiness or release authority.
