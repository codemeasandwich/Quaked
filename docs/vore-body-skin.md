# Source-bound Vore body skin

This increment fits the owner's supplied front/back Vore study to the actual
`progs/shalrath.mdl` skin0 atlas. The source JPEG remains local and unchanged;
its SHA-256 is `f702e38e2e415eb791734b43f8f79a6d28f8f9a873c392584252f3a66c6faabc`.
The native body SHA-256 is
`da3dddbf592c05ce0c0340cc2eea842f28b5dcb9c0c03946abfb225c0b0a54ee`.
Native geometry, all 35 poses, UV/onseam records, skin pixels, gameplay and the
separate `h_shal` head remain unchanged.

`tools/texture_sheets/fit_vore.py` reads only the named PAK member and reuses
existing connected-island, UV-footprint, edge-spread and height helpers. A
blank destination prevents native pigment from entering the public derivative.
Factor 5 produces 1060×975 diffuse and scalar assets. The recipe and exact
output/input identities are in `newer/enemies/shalrath/custom/SOURCE.json`.
Coverage is 334,921 nativeUV pixels: 334,022 donor-derived pixels after per-part
resampling/bleed and 899 final edge-filled pixels. These are not pixel-for-pixel
copies or anatomical acceptance by themselves. Detached claw/mouth studies
are excluded. The initial mask failed because Pillow's array-backed image
needed a mutable copy; that failure remains retained. A brightness threshold
also rejected 68 legitimate very-dark resampled pixels; the corrected blank
check preserves those samples, while provenance proves zero matte seed and
native fallback pixels.

The existing skin selector supports an optional `nativeModelSha256` constraint.
The loader captures immutable bytes once and hashes asynchronously; Classic
and native decode stay synchronous. Missing/unavailable identity safely keeps
the native skin. Preparation and its cache follow the current identity object;
obsolete pending work cannot affect current readiness or publish after an
epoch change. Filename-only BSP prefetch cannot authorize constrained art.
Legacy unconstrained variants retain their prior behavior. The exact inherited
base MDL is eligible wherever it resolves; only owned id1 is the runtime
qualification target, and no other campaign qualification is inferred.

The normal baker now honors both model and explicit variant filters, validates
constrained native identity and rejects an unmatched explicit variant. The
bounded Vore run reused the existing native sample 7db normal and added only the fitted
51ed sample. All 1,886 existing sample entries/payload hashes, other variant
entries, native-height entries and the protected Ogre remain unchanged.
Distribution closure includes this new directly used payload. Packing these
assets into an enhancement PAK remains the separate 9b Backlog card.

Public source/identity/preparation/height checks currently pass 20/20, including
actual same-model reload, pending/newer/obsolete digest order, no-crypto and
Classic fallback, real asset family filtering and late completion disposal.
The actual native-model trial captured all 35 poses plus front/back/oblique,
relief/native and exact Classic controls. Independent reviews inspected all
45 images; no concrete mapping blocker was observed at that resolution. Both
normal sets loaded from shipped data, with zero generation. This qualifies
controlled native rendering, not natural gameplay or owner aesthetic approval.

Actual owned E2M6 inspection on the runtime-equivalent `4e510d3` used the
existing Newer menu and public `map e2m6`, temporary `noclip` and movement/look
commands. No transforms, models, AI, health, inventory, readiness or journal
were fabricated. The corrected Newer receipt proves the real visible native
Vore, current model/BSP hashes, fitted diffuse and actual GL-program `qrNormal`
sampler bound to the prepared `51ed` texture in the same observed draw. GL
active texture state was restored immediately. Native player/server time,
signon, all sixteen defaults and required asset roles were checked; the
native head remained unselected by the body variant. Inputs and temporary
noclip were restored before stopping the owned renderer. Pointer-lock denial
is a separate browser permission limit, not mouse-capture qualification.

An earlier timeout during natural Bestiary holds and an earlier receipt whose
normal field came from a synthetic shader callback are retained with their
limitations. The final observer uses only actual draw/sampler evidence and
fresh public Escape actions for natural holds. Each trial met its own finite
watchdog, but the Classic capture at 03:55:29 and physical tab/server closure
at 03:58 UTC exceeded the coordinator's 03:55 phase cutoff. That deadline
failure is retained separately from valid renderer evidence. No more runtime
work followed the physical closure. Combat/gib events were not synthesized;
their unchanged family/geometry boundaries are source/public-test evidence.

Four real CLI controls verify explicit missing-variant and same-name changed
MDL rejection, and generic native-only/shareware compatibility. All output
manifest/index/Ogre hashes remained identical. The modified native-member
negative PAK was private scratch and was removed after diagnostic/hash
custody; original game archives remained untouched. Local dev landing and
creator-resource cleanup remain required by the task workflow.

Reproduce the fit with the bundled Python runtime containing Pillow/NumPy:

```sh
python3 tools/texture_sheets/fit_vore.py --source /absolute/path/to/Gemini_Generated_Image_ea7a33a03-2346-46b.jpeg --pack /absolute/path/to/owned/pak0.pak
```

Use the existing Node/Three/canvas environment with `tools/bake_normals.mjs`,
`--skins --maps '^progs/shalrath\.mdl$' --variant shalrath/custom --namespace quake`
and the owned PAK. It does not bake other monsters or custom variants.
