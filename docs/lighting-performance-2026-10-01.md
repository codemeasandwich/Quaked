# Lighting performance investigation

## Finding and working change

The lighting toggle's large cost was reproduced in the real game. Its final compositor ray-marched up to eight lights with eight visibility steps each, sampled eight neighbouring points for bounce light, and calculated corner accents at full device-pixel display resolution. Dynamic resolution reduced the scene, volumetric and bloom targets, but never reduced that compositor's output rectangle. At a 50% scene scale, it still shaded four times the scene's pixel count.

The implementation reuses the existing pipeline in `src/gl_post.js`:

1. `R_PostBegin` continues to size the scene according to the existing dynamic-resolution controller, including DPR and even-dimension rounding.
2. When lighting is enabled and the scene scale is below one, `R_PostFinish` draws the expensive compositor to a lazily allocated half-float target with the exact scene dimensions.
3. A small presentation shader upscales that linear colour, converts it to display colour and applies the same brightness/contrast about the same pivot. The split-demo scissor applies to this presentation only.
4. At full scene scale, and with lighting disabled, the direct display path remains in use. Resizing disposes/recreates the lighting target with the other scene targets; unchanged dimensions reuse it.

No light counts, bounce strengths, ray step counts, dynamic-resolution floor or visual-option defaults were reduced. Two zero-contribution cases also skip unnecessary work: volumetric lights whose range falloff is already zero skip their visibility marches; coplanar/back-facing bounce samples whose transfer weight is zero skip their HDR colour reads and beam estimate.

`src/r_perf.js` names the additional presentation stage `lighting upscale`, keeping it separate from `final lighting pass`.

## Evidence

The test view was the stationary player spawn in the `start` map, with all other enhanced feature options enabled, eight selected lights, device pixel ratio 2 and a 2560×1440 drawing buffer. The comparative matrices set `r_newer_crates` to **1**, special crate variants on every eligible crate (the product default is **40**, one in 40); before and after use the same rarity setting. This controls texture-variant odds, not entity count or density. Before measurements ran the committed implementation at `517f00b`; after measurements ran this working-tree change. The same trial page, scene and options were used. These are sequential local measurements, with normal browser scheduling and hardware-load variability. The retained trial uses the product's default rarity setting of 40. Historical JSON field `crateCount` names that cvar value; it is not a counted population.

| Normal animation-loop measurement | Before | After |
| --- | ---: | ---: |
| Lighting off, full scale | 29.1 ms / 34.3 FPS | 36.4 ms / 27.5 FPS |
| All lighting, full scale | 111.7 ms / 9.0 FPS | 104.0 ms / 9.6 FPS |
| All lighting, 50% scene scale | 53.4 ms / 18.7 FPS | 21.1 ms / 47.3 FPS |
| Lighting compositor target at 50% scale | 2560×1440 | 1282×720 |

See [before normal frames](evidence/lighting-before-frames-2026-10-01.json) and [after normal frames](evidence/lighting-after-frames-2026-10-01.json). This browser reproduced the large lighting cost, but did not reproduce the owner's exact 60 FPS lighting-off baseline; even the unchanged off path varied between runs. Normal-run per-pass values measure CPU submission only; their frame intervals measure the actual loop's throughput. The first after run ended frame sampling at the offscreen compositor; presentation was attributed to the following frame's `other` bucket. Aggregate throughput remains comparable. The retained trial now ends sampling at presentation and names that pass explicitly. A [repeat with corrected presentation attribution](evidence/lighting-after-dynamic-repeat-2026-10-01.json) measured 46.5 FPS / 21.5 ms with the same rarity-1 setting.

A separate final run with the **default rarity-40 setting** measured **34.3 FPS / 29.1 ms**, all lighting enabled, at the same 50% scene scale. This is an after-only acceptance trial, not a matched before/after comparison. No browser warnings/errors were recorded in that fresh tab. [Default-scene evidence](evidence/lighting-after-default-scene-2026-10-01.json), [screenshot](images/lighting-default-scene-2026-10-01.png).

To identify actual expensive draws, the GPU-pass trial forces completion with a one-pixel `readPixels` after each draw. `gl.finish` alone returned quickly in this browser and was insufficient for per-pass attribution. These synchronized timings include readback/serialization overhead and **are not normal-play FPS**:

| Synchronized mean draw cost | Before | After |
| --- | ---: | ---: |
| Full-scale compositor, all lighting | 58.8 ms | 37.4 ms |
| Full-scale light shafts | 35.9 ms | 24.6 ms |
| Compositor at 50% scene scale | 28.5 ms | 9.8 ms |
| Additional lighting presentation at 50% scale | none | 1.4 ms |

See [before synchronized passes](evidence/lighting-before-gpu-2026-10-01.json) and [after synchronized passes](evidence/lighting-after-gpu-2026-10-01.json). Before the fix, turning bounce off reduced the full compositor from 58.8 to 17.2 ms. The case labelled `without screen reflections` changed reflection colour to the probe fallback, but the existing `r_reflect_screen 0` implementation **retains its ray march**; it therefore cannot exclude reflection-marching cost. The retained trial labels that case explicitly. Reflections are controlled independently by the liquid option, whereas the source dependency and bounce/volume ablations identify substantial work added by the lighting toggle.

## Verification and limits

- **25/25 focused tests passed** using real Three.js 0.183.0 and the repository's Deno test interfaces through a Node compatibility runner (Deno is unavailable locally). The suite covers lighting resolution, target reuse/disposal/height-only resize, direct full-scale and lighting-off paths, option independence, split-demo resolution, model interpolation and profiler behavior. [Recorded output](evidence/lighting-tests-2026-10-01.txt).
- Independent planning and production review approved the change and the exact-zero work skips; an independent final run passed **25/25 tests**. Review also corrected the reflection-ablation and crate-variant qualifications above.
- **9/9 real GPU display-colour comparisons passed**, across three brightness/contrast pairs and dark, midtone and bright colours, within one 8-bit channel value. The full-scale MSAA input is explicitly resolved before sampling. This proves conversion/grade parity; the empty test scene does not prove all geometric bounce/volume appearances. [Colour evidence](evidence/lighting-colour-2026-10-01.json).
- Real gameplay measurements keep bounce, volume and reflection options enabled. The automatic dynamic-resolution controller retains its existing 50% floor; this local trial demonstrates a substantial improvement, **not a guaranteed steady 60 FPS**. Opting out with `r_dynres 0` still requests the costly full-scale picture.
- The split demo uses equal scene target dimensions for both halves. A fresh startup trial observed **2,322 real comparison frames with zero dimension mismatches**. [Recorded demo dimensions](evidence/lighting-demo-resolution-2026-10-01.json). Its reduced-resolution enhanced compositor renders a complete target before the half-screen presentation; at 50% scale, the demo's lighting fragment count falls approximately twofold, compared with approximately fourfold in full-screen play.
- Owner visual acceptance and cross-device/browser qualification remain pending. One generic Chromium `UnknownError` was recorded during the browser session; the game continued rendering and completing measurements. No shader-compilation failure was recorded. This does not establish a Chromium root cause or universal renderer health.

## Try it and reproduce

Hard-refresh the game, choose Newer Game and keep the enhanced lighting, normal maps and liquids enabled. Leave dynamic resolution enabled (`r_dynres 1`, its existing default). The FPS counter shows the active scale alongside frame time.

Serve the repository and open `/tests/lighting_perf_trial.html`. `Measure frame rate` compares seven cases with 45 warm-up frames and 60 measured frames (180 warm-up frames for dynamic resolution and initial map load). `Measure GPU passes` uses the same cases with forced GPU readback. `Measure dynamic only` repeats the all-enabled case without the lengthy ablations. The raw measurements are visible beneath the compact summary. `/tests/lighting_colour_trial.html` runs the colour comparisons.

Focused tests can run through the normal Deno interface:

```sh
deno test --allow-read --import-map=tests/render_imports.json \
  tests/lighting_resolution_test.js tests/gl_post_test.js \
  tests/visual_options_test.js tests/r_demosplit_resolution_test.js \
  tests/r_anim_test.js tests/r_perf_test.js
```

The implementation and evidence are retained together for owner evaluation. The trial is a working increment; it does not qualify every map, portal arrangement, GPU, fullscreen configuration or VR path.
