# Opening demo and fresh Newer Game readiness

The owner distinguishes strict introductions from seamless level travel. The
opening comparison demo fades its black logo into a real native Quake console.
That console stays full until enabled Enhanced assets and first-view mechanisms
are ready, then rolls up with the existing `scr_conspeed` animation. A fresh local
Newer Game likewise waits before gameplay, using an opaque loading plaque rather
than automatically opening a console. Ordinary level crossings keep proximity
prewarming and native/older art while Enhanced art arrives in real time.

## Ownership and lifecycle

`r_demoloading.js` is a dependency-free coordinator shared by main, client,
screen and renderer. Main arms the opening scope before initialization, starts
optional weapon/HUD requests concurrently, and marks console/menu artwork ready
after its existing loaders have completed or retained their native fallback.
Only after an actual full console frame has been presented does main start the
logo opacity transition. Its event completes removal; reduced motion skips the
animation and a bounded DOM timer handles interrupted transitions.

The first attract demo reads native signon packets normally. After signon4,
client time and its retained demo packet position pause while real hidden world
frames continue rendering behind the console. Asset completion does not jump
demo playback forward. Three completed frames with the same readiness revision
are required before native console roll-up. Manual demos, timedemos, networking,
explicit gameplay and later attract loops do not rearm that opening presentation.

A successful fresh single-player Newer `map` arms welcome readiness after local
connect. It does not intercept `changelevel` or seamless crossings. Movement is
blocked while reliable signon messages continue flowing; local physics and
seamless crossing checks pause, but connection/client message processing continues.
The world renders behind an opaque palette-black backdrop and the existing load
artwork, without exposing incomplete world/HUD art. The same readiness check
releases gameplay directly, without a demo console animation. A user-opened
console and menus remain available. Classic startup is unchanged.

## What “ready” observes

Enabled current-level wall textures/crafted scalar heights, current precache
enemy/item custom variants and all native skin animation slots, held/pickup
weapons/shells and HUD canvases use their existing caches. Readiness reports actual
requests rather than inferring success from a fixed delay or signon4. Optional
network/image failures have a 30-second bound, diagnostics, terminal native or
generated fallback and late-response guards. HUD preparation returns the exact
enhanced canvas synchronously on the first live draw, avoiding a one-frame native
flash. Future level prewarming is not a global “wait for everything” dependency.

The renderer explicitly uploads prepared shader-owned normal/luma/gloss textures
and warms actual cached material families through the existing scratch group.
GPU compile promises are tracked; scratch meshes never remain in the scene.
World rendering initializes sculpted plaques, current rock pages, source-shadow
cubes, the shoulder spotlight, and in-view water reflections. Disabled mechanisms
do not wait on stale caches. Stable asset/material/program revisions prevent
release across a late replacement. Failures never conceal another in-flight
request: a failed tile can retain native shading while other required tiles still
complete; shadow capture errors continue blocking/retrying instead of pretending
the remaining captures are ready.

The existing proximity path remains `SV_SeamlessFrame`/`R_WarmLevel` and
`R_WarmFrame`. Existing `SCR_ChangingLevel`, last-frame preservation and actual
crossing/transform logic retain their normal gameplay contracts.

## Evidence and working trial

- Independent public startup/welcome/collector gate: 18/18. It exercises real
  native console pixels, reliable signon traffic, retained demo time packets,
  native server physics pause/resume, opaque welcome presentation, normal travel,
  disabled options and partial failures.
- Coordinator integration and asset/map regression:
  `docs/evidence/intro-readiness-final-tests-2026-10-04.txt`, 51/51.
- Independent source review and loader/prepare/native-height/HUD checks also
  passed. Public tests distinguish transport success, terminal fallback, stable
  frames and visible presentation; they do not replace owner appearance acceptance.
- Actual browser startup receipt: `intro-startup-clean-final-2026-10-04.txt`. In a
  diagnostic slow-manifest run, the logo faded after the console appeared, console
  height stayed full and demo position/time stayed fixed throughout texture,
  skin, relief, shadow and shader preparation. Only zero pending work plus three
  stable draws started roll-up. No GPU or page errors were recorded.

`tests/intro_loading_trial.html?slow=1` is one actual main-entry game, with a
diagnostic-only ten-second manifest transport delay to make the hold observable.
`slow=0` has ordinary production loading speed. It retains an actual native
console canvas captured while work was pending and reports the lifecycle history.
The delay is not a production readiness timer. The normal app at `/` has no
diagnostic panel or artificial delay.

At the initial trial handoff these changes were local, with no commit or push
claimed. The owner subsequently requested commit and push on 2026-10-04;
`enhanced-landing-2026-10-04.md` records that scope and its final verification.
Owner appearance acceptance and durable background follow-up remain separate
from source verification and Git landing.

## Final runtime and identity receipts

`intro-console-held-final-2026-10-04.png` is the native console overlay captured by the ordinary renderer while startup work remained pending. It is a real console canvas, not an illustration or a recreated console. Comparison labels stay hidden during the startup console. The diagnostic slow transport affects only the test page.

`intro-welcome-live-2026-10-04.txt` records an actual menu-started fresh Newer Game reaching START. Welcome has no automatic console, holds texture/skin/shader/rock/sculpt/shadow/reflection preparation, then releases only after no pending work and three stable completed frames. Page and GPU error lists are empty. The normal app has been left open at `http://localhost:8013/`, without artificial delay or diagnostic controls.

`intro-readiness-final-identity-2026-10-04.json` records tested production, test and receipt hashes with the local HEAD. The earlier missing guessed prewarm-test path failure is retained in the initial integration receipt; no absent test is counted as passed. Native proximity prewarming/ordinary travel behavior is preserved in source and covered by the existing public travel/presentation contracts.
