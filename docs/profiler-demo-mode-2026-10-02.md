# Enhanced-only demo profiling

Options → Performance profiler now measures one enhanced main-camera scene per frame. The 50–50 enhanced/classic comparison is confined to idle attract-loop playback. Ordinary `playdemo`, browser-provided demo data and `timedemo` playback do not acquire the attract comparison. The profiler uses Newer Game mode and the player's selected enhancement options, at full resolution; it does not force every optional enhancement on.

## Cause and implementation

Previously `CL_PlayDemoFromData` unconditionally called `R_DemoSplitStart`, including when the profiler queued `timedemo`. That saved a title-mode override and enabled a second classic render. Checking `cls.timedemo` alone at startup would be too late: the flag is assigned after `CL_PlayDemo_f` opens playback. Checking `cls.demonum` alone would also misclassify a title demo when opening the menu, which pauses the loop by setting it to -1.

The existing demo command path now carries explicit attract intent: `CL_NextDemo` queues registered `playattractdemo`, whose wrapper calls ordinary playback with `attract=true`. Manual/file playback defaults to false and preserves the selected game mode. This intent travels with the queued command, avoiding a global pending flag that another command could consume. `R_DemoSplitActive` additionally rejects profiler/timedemo scopes, including the existing forced full-classic diagnostic mode. Failed timedemo loading no longer leaves `cls.timedemo=true` without playback.

`R_PerfStart` first ends any current title HDR override, then saves the underlying HDR/comparison/dynamic-resolution/FPS settings and demo-loop position. It forces `r_hdr=1`, `r_demosplit=0`, `r_dynres=0`, shows FPS and sets `cls.demonum=-1`, so only the profiler advances its three demos. Completion, cancellation and failure restore preferences/loop state and retain the established disconnect behavior. This does not resume an interrupted active game.

Report mode is captured in the run metadata, rather than read after restoring preferences. A run begun while the owner uses classic mode therefore still reports the enhanced renderer it actually measured. Esc still retains a useful partial report. `R_PerfPump` cleans up and rethrows unexpected frame errors; the existing `Host_Frame` recovery branch also stops profiling on `Host_Error`, which otherwise swallows that error before it reaches the pump. Normal demo end remains a normal transition to the next profiling demo.

Production changes are confined to `cl_demo.js`, `cl_main.js`, `r_demosplit.js`, `r_perf.js` and the host's existing error-recovery hook. The rendering architecture, comparison resolution/classic isolation, enhancement preferences and game assets remain intact.

## Verification

The focused public-interface suite passed **23/23** with Node 24, the existing Deno compatibility runner and pinned Three.js 0.183.0. Deno is unavailable locally. [Test output](evidence/profiler-demo-mode-tests-2026-10-02.txt), [current source identity](evidence/profiler-demo-mode-identity-2026-10-02.json). An independent reviewer authored eight new tests in [profiler_demo_mode_test.js](../tests/profiler_demo_mode_test.js) and independently reran all 23 tests.

Those tests use the real cvar registry, registered/queued attract and timedemo commands and tiny in-memory demo fixtures. They cover idle attract playback through `CL_NextDemo`, continued comparison behind an open menu, ordinary/file demos, forced full-classic suppression, successful three-demo completion, measured report mode after HDR restoration, menu cancellation, bounded missing-file handling, pump exceptions and recovered `Host_Error` through the actual `Host_Frame` command path. Existing FPS, demo recording/registration, classic scope/isolation and resolution checks also pass. The shared Node harness runs its absolute-clock FPS test before lifecycle tests; standard isolated Deno file workers do not share that private accumulator.

The normal application and real renderer were inspected in the browser, using [profiler_demo_trial.html](../tests/profiler_demo_trial.html) and its [observer](../tests/profiler_demo_trial.js). “Profile through Options” selects the real menu row through its public touch interface, which queues the same `perfprofile` command as the owner flow. The helper stops that trial after 180 enhanced main-camera draws; this bound is test-only, while the normal Options profiler remains an unbounded three-demo run. A separate `perfprofile 20` trial exercises all three demos without modifying their files.

| Actual browser trial | Enhanced main-camera draws | Classic draws | Maximum main-camera draws per host frame |
| --- | --- | --- | --- |
| Options invoked from idle title comparison | 180 | 0 | 1 |
| Complete demo1/demo2/demo3 run, 20 measured frames each | 73 including loading/warm-up | 0 | 1 |
| Options invoked after starting New Game | 180 | 0 | 1 |

All runs report `newerGame=true`, disable split and dynamic resolution while measuring, and restore the pre-run settings. In the title case, the visible title's HDR was temporarily one but the underlying preference restored to zero. The three-demo report contains exactly 20 measured frames for each demo. The title comparison was observed before profiling and resumed paired draws after explicitly returning to the idle loop. [Browser evidence](evidence/profiler-demo-mode-browser-2026-10-02.json), [enhanced-only profiling screenshot](images/profiler-enhanced-only-2026-10-02.jpg), [restored title comparison](images/profiler-idle-comparison-2026-10-02.jpg).

The observer reads `hostRuntime.host_framecount` through the live module namespace; destructuring a mutable exported counter would freeze its value and falsely classify later frames as duplicate draws. It distinguishes main-camera scene presentation from legitimate sun-shadow, probe, portal and post-processing auxiliary renders. Zero classic scope draws and inactive comparison were verified alongside the one-main-draw count. This is render-mode proof, not a new gameplay FPS benchmark or a claim that the enhanced pipeline contains only one total GPU draw.

## Trying it and delivery state

Hard-refresh the game, open Options and choose Performance profiler. It should show the enhanced demo across the whole view with no CLASSIC half or divider. Esc stops and reports the measurements collected so far. `perfprofile 20` in the console runs a short complete three-demo check. Idle title-loop playback retains the comparison.

The independent source/interface review passed. This increment is local and uncommitted; owner acceptance is pending. It does not alter or publish the prior committed water work, unrelated photographs/resources, or game data. No packaged release or durable follow-up obligation has been submitted.
