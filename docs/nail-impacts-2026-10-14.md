# Nail contact additions

Effect 8, card T-3faa98e3. Options → Newer Game features → **Nail impacts** (`r_nailhits`, saved,
default 1) adds a few sparks and one small dust puff at a proven dry world contact. The existing
native puff, hole and tink/ricochet sound stay in their original order, with their original random
sequence. Only `TE_SPIKE` and `TE_SUPERSPIKE` call the addition. Classic keeps the native result.

Water and slime contacts, including entity contacts away from a world face, produce a few bubbles
only when the existing point hull proves an open surface above them. They rise in that exact column;
there is no cosmetic sideways sway. Lava and capped/unresolved pools receive no addition. Existing
nail surface-crossing ripples remain unchanged. Bubbles have a transparent center and a soft visible
rim in the same premultiplied point shader; the ring masks both color and alpha before fog.

Dry contacts reuse `R_DecalSurface`. Seven bounded probes (the packet position and half a unit along
each axis) recover coordinates rounded onto or just inside a plane. Each shared result is copied
before the next query. Only nearby projected points, sufficient surface margin and a verified outward
spawn are admitted; competing surfaces at corners are rejected. This is a conservative world-face
query, not a reconstructed projectile ray. Moving brush faces are not transformed or newly supported.
Disabling decals does not disable this separate visual addition.

The shared layer reserves 128 nail slots and never overwrites another owner. New motes use only
`FX_Random('nails')`; original particle/decal/audio random choices are untouched. World solid traces
retire a blocked mote before drawing. Pause holds motion, while an off toggle removes nail-owned
motes immediately. The shared map/clock/mode reset clears them. No extra light or ripple is allocated.

## Verification

The independent public probe first reproduced missing dry and submerged additions. Nine maintained
cases now drive actual temp packets, native particle geometry, actual decal geometry, real sound
channel selection with a doubled AudioContext, and production cvar registration. Both nail kinds
retain exact native geometry and sound parameters. Sixty-four seeded trials exercise tink and all
three ricochet branches with identical global random counts. Other cases prove quantized-contact
recovery, wall containment, decals-off independence, paused-off, Classic, water/slime/capped/lava
behavior, ambiguous corners and exhausted queries, and preservation of 256 preexisting drips/sparks while saturating the nail reservation.

Five actual WebKit GPU checks passed: visible rim with an exactly clear bubble center, unchanged
filled puff and spark centers, fog preserving the empty center, and opaque-wall occlusion. These are
synthetic public-interface and shader checks, not a claim of owner acceptance or audible/native play.
The scoped commit and complete distribution/release gate are separate delivery steps.
