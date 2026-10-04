# Classic demo rendering isolation

The right half of the startup demo uses the original Quake presentation even when every Newer Game feature is enabled on the left. Both halves still use the same camera, simulation tick and scene raster dimensions. The owner accepted the demonstrated result and authorised committing and pushing the fix on 2026-10-01.

## What was leaking

The previous classic callback changed the Newer flags, redrew some entities and swapped upgraded diffuse textures. That left several states from the first draw in the shared scene:

- Enhanced fixed dynamic-light slots and boosted sky/lava colours remained attached.
- Liquid/portal materials were retained because the first world draw had already consumed their texture chains.
- The weapon kept its enhanced pose/material. Forced model interpolation could ignore the classic flag, and enemy coordinates were already smoothed in place.
- Coloured `.lit` lightmaps and reduced baked dynamic-light contributions were shared with the native pass.
- Unreplaced textures inherited forced enhanced filtering, while crate variants retained their enhanced picture/UV phase.
- All `Points` were hidden, including original Quake particles; some enhancement ghosts lacked ownership tags.
- Status-bar artwork and eased underwater tint were drawn once after the native scope had ended.
- Preparation/rendering errors could leave classic flags and renderer output state active.

## Implementation and contracts

`r_anim.js` now provides one explicit classic scope. Its Newer game, active-lighting and animation gates all honour that scope, including `r_lerpmodels 2`. Preferences and the enhanced pack setting are not rewritten during each draw. `gl_portal.js` also checks the scope instead of trusting the frame's cached portal-enabled flag.

`gl_rmain.js` prepares the classic scene inside that scope. It redraws aliases, sprites and the viewmodel using their native paths, rebuilds native dynamic lights, and substitutes cached native material variants. Brush geometry is reused. Existing water and sky meshes are prepared directly through `gl_rsurf.js`; an empty texture chain is never treated as evidence of a native rebuild. Native water materials have their own cache keys, so preparing the right side cannot mutate the enhanced water material.

`r_classicstate.js` snapshots and restores scene membership, visibility, materials, transforms, layers, light properties, alias attribute references/colours, optional original shadow positions and entity pose bookkeeping. The native draw temporarily uses this tick's raw monster coordinates; enhanced smoothed coordinates are restored. Frame mesh-tracking sets, current entity, alias polygon counter and screen blend are restored by the caller. Simulation time, particles and light decay advance once per frame. Original particles and optional `r_shadows` remain; enhanced decals, mist, portal views, light slots, light-driven shadows and teleport ghosts carry explicit exclusion identities.

Native materials disable normal/bump/displacement/environment maps and enhanced emissive boosts while keeping original palette fullbright texels. Material variants are reused and disposed with their source. Native diffuse twins use the original pixels and the owner's `gl_texturemode`, without enhanced forced filtering/anisotropy. Crate variants retain their original base texture, and their cache distinguishes different original faces even when the replacement artwork is equal. Original crate UV phase comes from that base.

Native lightmap atlases are built from original `surf.samples`, not a luminance conversion of `.lit` data. They use original atlas coordinates and the full native baked dynamic-light contribution. Enhanced cached light-style/dynamic bookkeeping is preserved. The native atlas is reused, uploads only when a surface's style/dynamic/fullbright state changes, and is disposed when its source atlas is disposed.

The classic pass bypasses the enhanced compositor: bounce lighting, flashlight relighting, bloom, shafts, caustics, reflections, heat haze and screen effects have no classic output. Its intermediate colour target uses a linear half-float attachment to preserve native overbright texels until the ordinary gamma/exposure conversion in the presentation blit. The previous byte target clipped these values before gamma at low exposure. The classic target retains nearest presentation sampling and exactly matches the enhanced scene dimensions. The active enhanced pipeline already requires the relevant floating-target capability.

`r_demosplit.js` runs preparation, rendering and rollback in `try/finally`. Render target, viewport, scissor, scissor-test state, clear colour/alpha and `autoClear` are restored after success or failure. The enhanced image remains present beneath the clipped native blit.

`gl_screen.js` draws the status bar twice under opposite canvas clips, with the classic scope active on the right. Cached upgraded HUD pictures cannot override this scope; the added gore grin is also suppressed. `R_PolyBlend` clips eased enhanced underwater tint to the left and uses the original blend opacity on the right. Full-classic mode applies these rules to the whole picture.

## Verification

Focused public-interface tests and the real startup-demo observer cover different parts of acceptance. The recorded results are linked below; they do not claim a repository-wide test run or a performance qualification.

- **51/51 focused tests passed**, using Node 24's compatibility runner and the game's pinned Three.js 0.183.0 implementation. Deno was unavailable. The suite covers native material/texture/atlas lifetimes, full dynamic-light contributions, expired baked-light clearing, geometry/scene restoration, original shadow buffers, forced interpolation, render-error rollback, independent visual switches, equal resolution and existing enemy-height/post-render behavior. [Test output](evidence/classic-demo-tests-2026-10-01.txt).
- Independent planning and source review approved the cached-scene approach. Independent review runs passed their focused suite, and identified the original-shadow position buffer restoration gap, which was fixed and included in the regression coverage.
- **6,416 native draws and restorations completed with zero assertion failures** across all-enhancement, individual lighting/normals/liquids, full-classic, native baked-light and native-shadow modes. The actual application's initialized renderer was observed in `tests/classic_demo_trial.html`, including the native scene draw and the presentation blit immediately after rollback. Checks cover disabled feature gates, native material/filter/atlas state, opaque liquids, sky depth writes, original particles, weapon/enemy draws, native dynamic-light counts, restored enhanced material/geometry/membership/poses, and matching raster dimensions. HUD observations use the existing `Sbar_SetExternals` drawing interface and the actual overlay context to verify original/native picture sources and clipping. [Browser results](evidence/classic-demo-browser-2026-10-01.json), [normal startup screenshot](images/classic-demo-2026-10-01.png), [observer screenshot](images/classic-demo-trial-2026-10-01.png).
- A real WebGL colour trial compares the classic presentation against direct native rendering over 16,384 pixels at exposures 0.5, 1, 1.5 and 2. Maximum channel error is **zero** in all four cases; no GL error occurred. [Colour results](evidence/classic-demo-colour-2026-10-01.json). The former byte target failed the low-exposure case by up to 8 channel values.

## Trying it and remaining limits

Hard-refresh the normal game page and let the title demo play. Enable the Newer features: the left should change while the right keeps native artwork, skins, lighting, liquids and HUD. `r_demosplit 2` shows the native pass over the full screen for inspection; `r_demosplit 1` restores the title comparison. Ordinary classic games retain explicit original options such as `gl_texturemode`, `r_wateralpha`, `r_shadows` and forced `r_lerpmodels 2`; the comparison disables enhanced interpolation regardless of that last setting.

For repeatable inspection, serve the repository locally and open `/tests/classic_demo_trial.html`. Its controls cover all enhancements, lighting/normals/liquids individually, full-classic mode, native baked lights and optional native shadows. `/tests/classic_demo_colour_trial.html` runs the isolated GPU colour comparison. The observer deliberately reads GPU errors and inspects buffers; use the normal game page to judge playability.

The renderer reuses the current simulation and cached world visibility/geometry. It does not run a second game, add new assets, or change portal movement. The split remains inactive in WebXR. GPU colour memory for the native intermediate is now 8 bytes per pixel rather than 4, in addition to its depth buffer; no unchanged-FPS claim is made. The owner accepted the demonstrated verification. Full-map manual coverage and every optional mod/skin remain outside the focused checks. No deferred job or release has been submitted.

## October 3 strict animation boundary

The owner requested that Classic contain no enhanced enemy/object intermediate
frames. The split already disabled interpolation, but ordinary Classic could
previously opt into it via `r_lerpmodels 2`. That exception is removed: values 1 and above
now enable pose and monster movement smoothing only while Newer Game
is active. The stored value is retained; toggling modes does not rewrite it.
Native game frames and original client network interpolation are preserved.
The earlier paragraph documenting forced interpolation in ordinary Classic
describes the prior behavior and is superseded by this request.
