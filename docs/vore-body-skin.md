# Source-bound Vore body skin

This increment fits the owner's supplied front/back Vore study to the actual
`progs/shalrath.mdl` skin0 atlas. The source JPEG remains local and unchanged;
its SHA-256 is `f702e38e2e415eb791734b43f8f79a6d28f8f9a873c392584252f3a66c6faabc`.
The native body SHA-256 is
`da3dddbf592c05ce0c0340cc2eea842f28b5dcb9c0c03946abfb225c0b0a54ee`.
Native geometry, all35 poses, UV/onseam records, skin pixels, gameplay and the
separate `h_shal` head remain unchanged.

`tools/texture_sheets/fit_vore.py` reads only the named PAK member and reuses
existing connected-island, UV-footprint, edge-spread and height helpers. A
blank destination prevents native pigment from entering the public derivative.
Factor5 produces1060×975 diffuse and scalar assets. The recipe and exact
output/input identities are in `newer/enemies/shalrath/custom/SOURCE.json`.
Coverage is334,921 nativeUV pixels:334,022 donor-derived pixels after per-part
resampling/bleed and899 final edge-filled pixels. These are not pixel-for-pixel
copies or anatomical acceptance by themselves. Detached claw/mouth studies
are excluded. The initial mask failed because Pillow's array-backed image
needed a mutable copy; that failure remains retained. A brightness threshold
also rejected68 legitimate very-dark resampled pixels; the corrected blank
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
bounded Vore run reused the existing native7db normal and added only the fitted
51ed sample. All1,886 existing sample entries/payload hashes, other variant
entries, native-height entries and the protected Ogre remain unchanged.
Distribution closure includes this new directly used payload. Packing these
assets into an enhancement PAK remains the separate9b Backlog card.

Public source/identity/preparation/height checks currently pass20/20, including
actual same-model reload, pending/newer/obsolete digest order, no-crypto and
Classic fallback, real asset family filtering and late completion disposal.
Native posed rendering, anatomical inspection and actual gameplay qualification
are still required before declaring this feature delivered.

Reproduce the fit with the bundled Python runtime containing Pillow/NumPy:

```sh
python3 tools/texture_sheets/fit_vore.py --source /absolute/path/to/Gemini_Generated_Image_ea7a33a03-2346-46b.jpeg --pack /absolute/path/to/owned/pak0.pak
```

Use the existing Node/Three/canvas environment with `tools/bake_normals.mjs`,
`--skins --maps '^progs/shalrath\.mdl$' --variant shalrath/custom --namespace quake`
and the owned PAK. It does not bake other monsters or custom variants.
