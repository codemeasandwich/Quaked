# E1M3 emissive lighting and source-based illumination

The owner reported missing shadows and uneven illumination near the E1M3
start, including the adjoining stairs and hall tower. Subsequent instructions
clarified the look: retain bounced light, directional light and the default-on
Enhanced flashlight, intensify real emitters, and remove haze. Reducing the
bounce setting was superseded; the final default remains **1**.

## Findings from the shipped level

With the real palette fullbright threshold of 224, E1M3 has 227 native light
entities, including 44 fires, plus two emissive surface sources. All 44 fire
positions are in air and their QuakeC spawn code does not move their origins.
The parser was collecting them correctly. No guessed position offsets or new
light entities are added.

The former eight-light ranking favored sources in front of the camera by a
factor of more than three. Turning in place could evict a nearby torch and
replace it with a plain map-light helper. Fire flicker also changed ranking.
The existing point-shadow test used only the visible depth buffer: offscreen
samples counted as lit, and its averaged result could let most illumination
pass through a blocker. It could not reliably shadow hidden pillars or walls.

Two independent early headless audits initially failed to initialize the
palette threshold and falsely classified organic textures as emissive. Those
claims were rejected; the tests initialize the actual native threshold before
loading the map. The original organic textures have no fullbright pixels.

## Lighting changes

The actual renderer's selector now ranks independently of camera orientation.
A physical emitter (a native fire or a genuinely emissive surface) receives a
fourfold selection priority over unmodeled baked-light helper points, within
the same eight-light budget. Fire flicker changes radiance without changing
slot membership. Native source records, styles, base powers, positions, geometry
and palette colors are preserved.

Physical emitters send twice the prior local radiance. Ordinary map helpers
and dynamic lights retain their previous scaling. Standard fullbright glow
increases from 3 to 4.5, lava from 4 to 6 with the same bounded pulse, and the
Enhanced flame-model shading from 640 to 960. Classic flame shading remains
256. Direct sunlight and full-strength source-based bounce are retained.

Source-free brightness is removed from Enhanced: the haze-color addition,
gloss-rim minimum and native player/weapon minimum-light clamps. Classic keeps
its original 8/24 player/weapon readability floors. Real receiver lighting
still uses the authored albedo, so a source can illuminate a surface whose
baked light is zero; no neutral grey is substituted for that surface's color.

The owner's final haze instruction also removes global atmospheric extinction
and its compositor uniform, sets sun background fog to zero and disables broad
ordinary point-light air scatter. The disabled point-air loop is skipped.
Directional shaft edge density, sunlight, the flashlight cone/receiver lighting,
source-lit surfaces, bloom and full bounce remain. Local lava heat shimmer and
liquid optics/material mist are unchanged; they are not a global room veil.

The existing menu already starts Enhanced with `r_flashlight 1`, FPS display on. After accepting the haze-free lighting, the owner requested
the brightness slider midpoint as the new Enhanced default: gamma **0.75**
(the slider ranges from gamma1 to gamma.5). Enhanced New Game, Enhanced level
selection and Enhanced Reset Defaults use that value. Classic startup is not
changed; Classic Reset Defaults retains gamma1. The working trial uses the
same flashlight-on, midpoint-brightness startup values. Torch-only
pictures retained from earlier tuning are not final default-appearance receipts.

## Whole-world point shadows and budgets

`src/r_pointshadows.js` reuses the complete solid-world sun-occluder position
buffer, including actual demon displacement. Private indexed 256-unit spatial
chunks provide frustum culling without copying or altering source vertices.
Each chunk owns its indices/bounds; disposal removes its borrowed position
attribute before disposing the private geometry, preserving the owner's buffer.

Eight cached sources share a 768x1024 RGBA8 radial-distance atlas: six 128-square
faces per source. The color attachment is 3 MiB, with an additional hardware
depth buffer. Indexed chunk storage uses one uint32 per source triangle corner.
Map/geometry changes invalidate captures; ordinary camera rotation, fire
flicker and style/radiance variation do not. All requested residents are protected
before LRU eviction. At most one six-face capture is submitted per update.

Source far distances conservatively cover Enhanced gain and native style peaks,
without using the momentary flicker value as a cache key. Five radial PCF taps
use a two-world-unit bias and clamp within each face; no neighboring atlas face
is sampled. The six cameras and direction-to-face mapping agree independently.
Target viewport/scissor use physical pixels via render-target properties, so
retina/DPR2 captures do not double their tile dimensions. Target, active cube
face/mip, logical/physical viewport and scissor, clear state, auto-clear and XR
state are restored, including after a capture failure.

Static world visibility multiplies the existing screen-space contact test for
receivers and participating volume paths. Hidden static walls cannot leak light;
visible current actors and moving doors retain their prior contact shadows.
Actors and doors are not baked into complete offscreen point-light cubes: their
existing screen-space, floor-projection and sun-shadow paths remain. Missing or
failed captures use the prior screen-space approximation while status reports
pending work/errors. The shader has no extra static-light slots or unbounded
capture queue. `r_pointshadows 0` is a diagnostic comparison with that prior path.

## Verification and working trial

Independent planning and review checked native source coverage, selection,
projection, renderer restoration, cache bounds and the source-only lighting
boundary. The new public suite passes **9/9**, including native E1M3 rays,
actual post-pipeline binding, DPR2 and exception rollback, map invalidation,
Classic/off gates, exact emitter gains, native minimum-light preservation in
Classic, default flashlight startup and haze removal.

The live GPU trial read packed atlas texels for the native torch at
`(-966,-1750,256)`: the start ray's first caster is 414.05 units away, beyond
its 314.93-unit receiver; the hidden corner caster is 19.98 units away, before
its 243.47-unit receiver. Both match the independent native BSP ray tests.
A third stair-direction caster at 239.17 units is detected, but that receiver
is outside this source's range, so this is an atlas-direction witness rather
than evidence that the distant stair receiver receives this torch's light.
The retained final GPU receipt reports GL error 0 and no page errors.

Try `http://localhost:8013/tests/emissive_lighting_trial.html`. It runs one
ordinary client/server in the shipped E1M3. Buttons select BSP-hull-verified
start, corner, landing, stairs and hall-tower positions; the flashlight starts
on. Inspection buttons hold a non-colliding camera in the live native game,
so moving traps/doors cannot damage or push it during lighting review. World shadows on/off compares the static atlas against the previous
approximation. Verify shadow rays reads the actual GPU target. The warm-frame
measurement is a short delivery sample, not overall performance qualification.

Code, tests and current evidence remain local and uncommitted. Earlier Classic
animation-boundary changes are preserved in the same working tree. Final owner
appearance acceptance and broad, sustained GPU performance/stability are not
claimed by the source and focused rendering receipts.

An initial stairs capture was rejected: native trap/door interaction produced
a red damage overlay and camera kick, invalidating appearance comparison.
That image remains retained as rejected evidence; inspection cameras now stay
non-colliding at the chosen native locations. No production gameplay physics
or damage behavior is changed by the trial fix.

## Subsequent height and flashlight shadow work

The owner accepted the haze-free lighting when brightness was manually centered; Enhanced startup/reset now uses that midpoint. Later shadow and rock-contrast work is recorded in [height-map-shadows-2026-10-03.md](height-map-shadows-2026-10-03.md), which supersedes earlier static-only flashlight limitations and describes current local receipts. Extreme contrast is confined to displaced rock walls. Final appearance acceptance of that later increment and broad sustained performance remain separate from the owner's prior lighting acceptance.
