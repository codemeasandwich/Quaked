# Options, portal motion and flashlight colour

The preceding menu-lettering fix was committed and pushed to `origin/main` as
`5ec91e9` before these requested changes began. The follow-on implementation and
verification evidence are retained together, with owner acceptance pending.

## Options order

Options now displays Newer Game features first, Performance profiler immediately
above Go to console, and FPS counter immediately above Texture Filtering. The
remaining controls retain their relative order. `src/engine/client/menu.js` keeps cursor and
touch indices as visible rows, translating them through a single ordered list
to the existing action IDs. Drawing uses the inverse mapping for labels and
their widgets. Keyboard, touch and slider dispatch therefore agree with the
visible list.

The public test exercises all 16 label positions, the FPS/filter checkboxes,
feature/customize/profiler/console/default actions, FPS/filter keyboard and touch
toggles, the screen-size slider and cursor wrapping. Independent review passed
**5/5** focused menu/visual-option tests. [Test output](evidence/options-order-tests-2026-10-01.txt),
[actual menu screenshot](images/options-order-2026-10-01.png).

## Same-level camera portals

The server now uses the renderer's existing rigid portal transform for the
player's lateral position, view direction and momentum, while QuakeC retains
teleport authorization and side effects. This includes safe backing-wall
contact, per-physics-call recovery of a clipped normal velocity component, and
the actual client angle packet's full pitch. Source and destination matching,
failure handling, classic/disabled/multiplayer exclusions and geometric limits
are documented in [the portal implementation record](same-level-portal-motion-2026-10-01.md).

The normal browser entry initializes without a special renderer bootstrap.
**71/71 checks passed** against the real start map and shipped QuakeC, including
six mirrored angled difficulty approaches and an actual player-physics traversal
at the backed nightmare window. A body that does not fit the arch remains blocked;
the fix does not grant noclip. [Live QC evidence](evidence/portal-qc-browser-2026-10-01.json).

## Flashlight and black surfaces

Two existing approximations caused the charcoal effect. The world material forced
a minimum baked-light term of 0.025, even when its lightmap was zero. The compositor
then reconstructed colour from the already-lit scene and supplied a neutral grey
flashlight lift where that scene had lost its material colour.

With lighting enabled, the shared scene target carries a third attachment for **unlit diffuse colour**.
World materials capture it after their map/parallax lookup, and aliases/enemy
materials capture it before their vertex colours multiply baked illumination into
the texture. This requires no additional geometry pass. It uses SRGB8 storage
(four bytes per pixel), with automatic encoding on writes and linear decoding on
texture reads, preserving dark authored texels without the bandwidth of another
half-float attachment. Alpha marks a valid material; nearest filtering avoids
mixing invalid surfaces into neighbouring pigments.
Turning lighting off returns to the original two attachments, preserving the
normal/liquid path's original bandwidth. Target reuse also checks attachment count.

`src/newer/render/gl_post.js` removes the unconditional baked-light floor and the grey beam
fallback. Flashlight diffuse response and direct-light lift use the retained
material colour, while the existing scene lighting, occlusion, normals, beam
falloff, HDR grading and dynamic scene-resolution presentation remain in place.
Flashlit neighbours can contribute their real colour to bounced light even when
their baked scene sample is black. Black pigment remains black under diffuse light.

All scene writers participate: original aliases through the standard material
patch, world detail, custom/native enemy shaders, portals, level views and decals.
Precomposited portals and special effects invalidate unavailable albedo. Decals
multiply the stored colour using the existing destination-colour blend, retaining
validity and their painted marks under subsequent illumination.

**92/92 real GPU checks passed**. Zero-lightmap world surfaces, zero-vertex-light
original aliases and enemy height shaders display `[0,0,0]` with the beam off.
With it on, red, green and blue textures recover their coloured response, black
pigment stays black, and readback retains the authored diffuse values. Additional
near-black pigment values such as `[14,4,2]` survive the compact attachment within
one channel value. [GPU results](evidence/flashlight-albedo-browser-2026-10-01.json),
[off/on comparison](images/flashlight-albedo-2026-10-01.png).
The final repeat after conditional buffer allocation passed **94/94**, adding an
actual lighting-off render with two attachments and no GL error.
[Final GPU results](evidence/flashlight-albedo-final-browser-2026-10-01.json).

Independent shader review approved the change and passed **39 unique tests** across
albedo, flashlight, post-processing, dynamic resolution, visual options, enemy skins,
height maps and normals. This does not mean every material or mod was tested.
Legitimate fog, volumetric light, emission and bounced light can still illuminate
otherwise unlit areas; the fix does not turn genuinely lit surroundings black.

## Verification and trying the result

The combined focused run passed **50/50**, plus the separate deep-world collision
check passed **1/1**. [Combined output](evidence/game-follow-on-tests-2026-10-01.txt),
[world output](evidence/game-follow-on-world-test-2026-10-01.txt). Deno is unavailable
locally, so these Deno interfaces ran with the Node compatibility harness and real
Three.js 0.183.0.

The final combined run after conditional attachment allocation passed **51/51**,
including that world check in the same process. [Final output](evidence/game-follow-on-final-tests-2026-10-01.txt).

### Performance sanity check

The authored-colour attachment has a real cost. In sequential normal-loop trials
at DPR 2, a 2560×1440 display and 50% scene scale, the committed lighting shader
averaged **24.8 ms / 40.4 FPS**; the corrected shader averaged **32.1 ms / 31.2 FPS**.
Both used the stationary start-map view with the same enhanced options and rarity-40
crate-variant setting. The reference preview served only the committed `gl_post.js`
instead of the working-tree version, leaving the remaining current files in place.
This isolates the lighting implementation, but sequential browser/host variation
means it does not establish a universal 7.3 ms cost or steady 60 FPS.
[Reference frames](evidence/flashlight-albedo-reference-frames-2026-10-01.json),
[corrected frames](evidence/flashlight-albedo-performance-frames-2026-10-01.json).

An earlier corrected run averaged **62.3 ms / 16.1 FPS** under heavier contention.
Its synchronized readback run averaged **436.6 ms** with substantial per-pass
readback/serialization overhead, including the tiny bloom and presentation passes.
Those synchronized results are **not normal gameplay FPS**. A later synchronized
reference averaged 53.9 ms. These measurements are retained rather than treated as
passing frame-rate qualification. [Initial frames](evidence/flashlight-albedo-performance-initial-2026-10-01.json),
[corrected readback](evidence/flashlight-albedo-performance-gpu-2026-10-01.json),
[reference readback](evidence/flashlight-albedo-reference-gpu-2026-10-01.json).

The existing scene-resolution lighting presentation remains active; its target was
1282×720 in both normal-loop trials. Colour precision was retained, and no additional
geometry pass was introduced. The all-lighting performance target remains unqualified
on this browser; owner appearance/performance acceptance is still required.

### Reproduce

Run the focused public interfaces through Deno with the renderer import map:

```sh
deno test --allow-read --import-map=tests/render_imports.json \
  tests/options_order_test.js tests/flashlight_albedo_test.js \
  tests/lighting_resolution_test.js tests/visual_options_test.js \
  tests/gl_post_test.js tests/r_flashlight_test.js tests/r_newerskins_test.js \
  tests/r_demosplit_resolution_test.js tests/sv_portal_motion_test.js \
  tests/sv_portal_hull_test.js tests/gl_portal_test.js tests/sv_phys_test.js \
  tests/menu_test.js tests/menu_save_test.js tests/world_test.js
```

Hard-refresh and start Newer Game. Open Options to see the new order. Keep camera
portals enabled, approach a difficulty window at a valid angle and offset, then
compare the view and movement with its preview. Toggle F on a dark textured surface
to inspect material colour and relief. Dedicated local trials are
`/tests/game_options_portal_trial.html` and `/tests/flashlight_albedo_trial.html`.

Additional maps, custom mods, devices and owner play-feel/appearance acceptance are
not qualified by these focused local checks. Historical lighting-performance
notes now correctly identify `r_newer_crates` as texture-variant odds, not entity
count; old JSON field names are retained as recorded evidence.
