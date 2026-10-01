# Equal resolution in the startup demo

The enhanced and classic halves of the startup demo now render the scene at exactly the same pixel dimensions. The classic half retains the original textures, skins, lighting and filtering. Texture detail can therefore still look different; the scene raster resolution is equal.

## Cause and implementation

Previously, `src/r_demosplit.js` allocated the classic target at a fixed 240-pixel height and calculated its width from the viewport aspect ratio. The enhanced pass used the HDR target selected by `R_PostBegin`, including device pixel ratio, dynamic resolution and even-dimension rounding.

`R_RenderView` in `src/gl_rmain.js` now captures the bound enhanced scene target after the world draw and before `R_PostFinish` changes the active target. It passes that target to `R_DemoSplitClassic`, which uses its exact width and height. The classic target is reused when both dimensions match, and disposed and replaced when either changes. This avoids duplicating the HDR pipeline's scaling or rounding rules.

The optional target argument keeps the helper usable by existing callers: without a scene target, it uses physical viewport dimensions, falling back to logical dimensions multiplied by the renderer's pixel ratio. Existing full-classic mode, scene/camera identity, callbacks, target restoration, viewport and split scissor behavior are preserved.

## Verification

- **23/23 focused automated tests passed**, covering the new resolution behavior, demo lifecycle/commands, post-processing, independent visual options and model interpolation. [Recorded output](evidence/demo-resolution-tests-2026-10-01.txt).
- Three new tests exercise exact HDR dimensions, odd viewport rounding, high-DPI dimensions, dynamic scaling down to half resolution, width-only and height-only changes, allocation reuse/disposal, classic filtering, full-classic mode and renderer state restoration.
- A real browser startup-demo trial observed over **8,000 classic scene passes with zero mismatches** at device pixel ratio 2. Matching target sizes included 2562×1440, 2050×1152, 1640×922, 1306×734 and 1282×720. [Recorded dimensions](evidence/demo-resolution-browser-2026-10-01.json), [screenshot](images/demo-resolution-2026-10-01.png).
- The observer in `tests/demo_resolution_trial.html` wraps the initialized renderer instance, where Three.js installs its methods. It checks the actual classic scene render against the bound enhanced HDR target. It reports nonzero observed frame counts and provides full/dynamic resolution controls. No browser errors or warnings were recorded.
- Independent final review approved the production change, corrected browser observer and documentation, and independently reran all **23 focused tests: 23/23 passed**. The review caught an initial prototype-based observer that could not see actual frames; the instance observer above replaces it.

These are focused local renderer and browser checks. They do not qualify every browser, GPU, VR path or fullscreen configuration, and owner visual acceptance remains pending.

## Try it and reproduce

Hard-refresh the normal game page and let the startup demo play. Both halves now follow the same render resolution automatically, including when dynamic resolution reduces the enhanced target.

For visible measurements, serve the repository locally and open `/tests/demo_resolution_trial.html`. Wait for a nonzero PASS frame count and use its full/dynamic resolution buttons. The overlay lists identical dimensions for both scene targets.

The tests use the repository's Deno interface and real Three.js import map:

```sh
deno test --allow-read --import-map=tests/render_imports.json \
  tests/r_demosplit_resolution_test.js tests/cl_demo_test.js \
  tests/cl_demo_commands_test.js tests/gl_post_test.js \
  tests/visual_options_test.js tests/r_anim_test.js
```

Deno was unavailable in this workspace. The recorded run used Node 24 with a small compatibility runner providing the tests' Deno registration and filesystem APIs, and the same pinned Three.js 0.183.0 implementation. The browser trial used the game's normal startup and rendering pipeline.
