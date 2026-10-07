# Independent supplied-reference reveal review — 7 October 2026

Scope: verify the root's reverted reveal implementation against the original supplied source, rather than qualify the rejected spatial-hash design. No noise-specific tests were created or launched before the owner redirected that work. Changed only the public capture fixture and these evidence files; no production/browser edit or GPU launch.

## Source identity and exact portions

Re-read Forbidden Summoning v2.0.6 reconstruction/subject source (lines 233–326) and the tailored Quaked 1.0.0 material/timeline module. The original Rend preset is radial/noisy expansion from source center `(0,2.3,0)`, radius `2.55`, with two noise octaves and a field clamped to `.003–.997`. It does not use the later invented `rv_h3(floor(q*24))` threshold.

The current tailored material binding (`f3d9d40bc0e563e9d112ed5570394322e415ce28e9ce464cb9e7eec84f7d6eb0`) restores:

- **Exact supplied `RV_FRAGMENT_MASK`:** physical body only clips while progress < 1 and `rvField(vRVAnchor) > progress`; ghost rejection is formation-only. Ghosts are not assigned a new body dissolve mask.
- **Exact supplied radial field coefficients:** source center/radius, octave mix `.65/.35`, noise strength `.67*.72*(1-progress)` and clamp endpoints match the preserved Quaked integration HTML.
- **Exact supplied `RV_VERTEX_BIND`:** start from the host's already-posed `transformed` position, compute canonical coordinates and capture the anchor, apply original ghost displacement or surface-bound coating, then transform back to the native model frame. This retains the geometry/progression relationship rather than creating another model or shader path.
- Source inspection confirms ghost formation is again the original `silhouetteOpacity * formation * (1-smooth(.45,.99,progress))`, with no `.12` attenuation. Requested dark colour/edge and deferred-MRT fixes remain distinct host/owner overrides.

## Public programme/progression evidence

The expanded fixture compares the mask and vertex chunks directly with the preserved supplied HTML, and compares the radial function body exactly. Actual composed body, custom-depth, custom-distance, ghost and existing native atlas-capture shader source contains that same exported mask.

Using the actual public `R_RendVeilSeen` and capture material callbacks, body/depth/distance/atlas progress agrees at these source Appearance samples:

| Age | Progress |
| ---: | ---: |
| 0 | 0 |
| 0.5 | 0 |
| 0.9 | 0.352 |
| 1.1 | 0.648 |
| 1.5 | 1 |

The body remains an opaque, depth-writing host material whose fragment coverage is controlled by the source mask. The strict positive/less-than-one field clamp establishes hidden body coverage at zero and complete coverage at one from the actual source predicate; this is source logic, not a measured GPU coverage percentage. Ghost visibility matches source formation endpoints. At Focus 2.5, the exact original host material and original depth/distance binding owners are restored.

The complete fixture passes **8/8**: the previous six capture/scale/shadow/MRT checks plus two source/protection checks. Exact command, identities and output are in `rend-veil-reference-mask-tests-2026-10-07.txt`. Initial 7/8 failure was an obsolete Three shader-library fixture key (`distanceRGBA` instead of current `distance`); it is retained with its diagnostics. No production correction was required for that observation.

## Explicit optical deviation and limits

The original tailored optics use `protect = 1 - subjectFront * uFocus`. Root deliberately retains `protect = 1 - subjectFront`, protecting already-formed opaque model pixels before matched Unwind begins, so the surrounding field cannot re-obscure their native reveal. The optical test verifies this emitted expression and its use for support, volume and ripple, but labels it a **native integration override**, not exact supplied optical behavior. Owner-requested larger ritual frame and dark palette also remain explicit deviations from the supplied defaults.

No new reveal design remains in this reviewed candidate. Source equality for mask/field/vertex does not prove the full rendered scene is pixel-equivalent: existing native geometry/skin, lighting, palette, MRT adapters and the stated optical override differ. Actual GPU progression, ground placement and owner appearance acceptance remain separate root/other-lane evidence. No numeric spatial-hash coverage simulation was introduced or claimed.
