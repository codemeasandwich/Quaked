# Lava embers

Effect 9, T-3faa98e3. **Lava embers** in Newer Game features (`r_embers`, saved, default 1)
adds occasional glowing flecks over actual lava. The existing map-light build already collects lava
faces; a borrowed read-only accessor retains that unfiltered collection. Heat-haze merged regions,
water/slime regions, torch effects, lighting and liquid optics are unchanged. Small pools omitted by
the heat-haze area filter can therefore still emit embers.

Face boxes are candidate bounds only. The source must be open above the face and the existing point
hull must prove a lava interface at that height. Gaps, underside faces, misleading texture names over
water/slime and unresolved geometry are rejected. Every 0.2 seconds (a birth batch) it scans at most 128
candidate faces in rotating order and makes at most four births, one per accepted face: one lava
surface gives five embers a second (`tests/embers_test.js` counts them). Later faces are eventually visited; no first-128 cutoff can hide a nearby pool.

Embers rise vertically within the verified column, flickering through the existing shared shader.
There is no cosmetic sideways drift. Existing solid traces stop motion at walls/ceilings. A dedicated
128-slot reservation and independent FX random stream preserve every other effect; no extra light,
mesh or renderer is allocated. Off removes the owner reservation even while paused. Map, mode and
clock resets restart emission. Mist and water controls do not own or disable embers.

Independent public tests first reproduced the missing effect, then caught small-pool drift and a
permanent source cutoff. Twelve cases now cover the real world-light inventory path, small pools,
gaps, undersides, water/slime, later near faces, ceiling collision, birth/reservation caps, pause/off,
rewind, Classic and untouched haze/mist inventory. Other FX random streams and native Math.random
remain unchanged. GPU, complete distribution and release checks are separate evidence.
