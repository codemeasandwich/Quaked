# E1M3 Classic demo shadow investigation

The owner reports a large shadow in the Classic half around rendered frame
1,470: outside E1M3's yellow-key door, looking toward the wall across the bridge.
This record is separate from the procedural-relief correction and is not proof
that a visual leak has been fixed.

**Outcome:** the owner independently confirmed that this is a pre-existing issue
from the original port. Targeted GPU comparisons also found no enhanced-relief
bleed in the three captured views. No production renderer change was made for
this report. This does not claim the original port issue itself is fixed, or
identify its precise cause as intended BSP lighting rather than a port defect.

## Reproduction identity

The shipped `pak0.pak` contains E1M3 in `demo1.dem`. That recording has 975
network records; rendered frame numbers depend on playback rate. Independent
inspection locates the yellow door in inline brushes `*21` and `*22`, centered
near `[-496,-160,0]`. The recorded player turns back toward the bridge around
records 845–850:

| Record | Server time | Player position | Pitch / yaw |
| --- | --- | --- | --- |
| 840 | 66.296 | -650.625, -163.375, -71.875 | -2.692 / 267.061 |
| 845 | 66.750 | -650.625, -163.375, -71.875 | 15.194 / 208.306 |
| 850 | 67.208 | -710.875, -157.75, -71.875 | 17.240 / 176.348 |

The view height is 22. Record 850's upper view intersects rock face 1579,
`rock4_1`; its original BSP lightmap has 160 samples ranging from 0 to 122,
including five zero samples. Nearby rock faces likewise have native dark
regions. Those facts alone do not identify the reported visible shape.

## Required discriminating check

Freeze a real recorded pose and compare the same actual Classic render target
with enhanced rock/height-shadow uniforms disabled. Separately hide native model
shadow geometry and replace native lightmaps with white diagnostic lightmaps.
Record pixel differences and retain the view so the owner can identify the
reported shape. Restore every temporary diagnostic setting. Do not remove
original level lighting merely because it contains a large shadow.

Current source review finds Classic variants without rock metadata or normal
maps, a closed enhanced height-shadow scope, hidden enhanced shadow meshes, and
a separate cleared Classic render target. The existing isolation/shadow suite
passed 27/27. Neither code review nor that suite substitutes for the targeted
same-pose GPU comparison.

## Actual frozen-frame results

`tests/classic_shadow_trial.html` initializes the real application, stops its
animation loop, replays `demo1.dem` through the production message parser, and
freezes the selected recorded pose. It intercepts the actual Classic scene draw
and rerenders the same scene/camera/target without advancing simulation.

| Record | Nonblack pixels | Pixels changed with enhanced relief disabled | GL error |
| --- | ---: | ---: | ---: |
| [840](evidence/classic-shadow-840-2026-10-04.json) | 591,453 | 0 | 0 |
| [845](evidence/classic-shadow-845-2026-10-04.json) | 763,552 | 0 | 0 |
| [850](evidence/classic-shadow-850-2026-10-04.json) | 791,278 | 0 | 0 |

Every target was 1600×1002. `classicLook` was 1, the retained rock uniform was
1 and height-shadow scope was already 0. Forcing both enhanced uniforms to 0
produced identical RGB values, including zero maximum linear-channel error.
`r_shadows` was 0 and no native alias-shadow meshes were visible; hiding that
empty set likewise changed no pixels. Thus the captured shape is not caused
by the procedural relief or native alias-shadow geometry in these views.

The [captured view](evidence/classic-shadow-845-2026-10-04.jpg) and repeatable
diagnostic are retained. Temporary uniforms/visibility and the original render
method are restored after each bounded capture. The native inspection script
and raw evidence remain in
`/private/tmp/quaked-classic-native-audit-2026-10-04/`; they do not mutate the PAK.

The owner confirmation closed the enhancement-isolation investigation before
expanding into repair of the original port issue. No independent future repair
was queued or claimed complete.
