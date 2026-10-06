# E1M1 exit corridor ceiling fixtures

The bundled E1M1 end corridor has six downward 32×32 `tlight01` panels,
with authored light helpers on the same vertical axes. The former 192-unit
surface clustering merged these into four isotropic records and discarded
direction. The enhancement now moves each uniquely matched helper to ten
units inside its physical panel and adds a soft downward cone. It retains
the authored color, intensity and style and suppresses only that panel's
additional procedural emission. Native geometry, baked lightmaps, texture
pixels, edicts, collision and Classic rendering are unchanged.

`r_fixturelights.js` admits only the inspected bundled E1M1 source (1,365,176
bytes; SHA-256 `7b7061ec63c3e8ecb9c0e0a8075f18823efea6578666d57d601c191bcaf16c26`).
A synchronous FNV admission fingerprint avoids asynchronous map state; it is
not an authenticity/security check. Geometry and the actual sole exit to
E1M2 are independently checked. Six connected panels must have unique
same-axis authored helpers 64–88 units below them, with an air segment from
the relocated source. Unknown variants, incomplete geometry, unmatched or
ambiguous helpers retain the previous behavior. Face numbers and arbitrary
world-point tables are not used to place lights. The owned full-game E1M1
is a different BSP and is deliberately not silently assumed equivalent.

The initial 18-degree inner and 32-degree outer cone and 96-unit source
falloff are presentation calibration, not values authored by Quake's BSP.
Source membership gets fixture priority without doubling authored radiance.
Relocated source leaves are rebuilt for PVS selection.

This adapts the existing eight selected point-light slots, point shadow
cubes, caster borrowing, and ordered height-shadow mask bits. No additional
shadow atlas, sampler, manager, flashlight target or runtime asset is added.
Directions rotate with the camera as vectors and are copied with the frozen
pre-HDR snapshot. Absent/invalid directions remain isotropic. World/alias
receiver lighting, separate specular highlights, reflection incident-light
ranking and height-source weights use the same cone. Cone volumes integrate
twelve samples on the clipped view ray and sample existing cube visibility;
ordinary point volumes retain their analytic path. The flashlight continues
to own its single independent spot target. Live sources and actors keep
existing selection and refresh budgets.

Required qualification includes native-load classification, cone boundary
and camera-rotation controls, existing point/flashlight/height regressions,
and actual corridor floor/ramp/occluder captures in Newer with Classic
controls. Code or source inventory alone does not qualify the visible pools.
