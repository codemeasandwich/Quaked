# Supplied ordinary nailgun — 2026-10-05

The owner requested copying and using the nailgun from the extracted Quake
archive in Quaked. Newer Game now binds the supplied held and pickup models to
native `progs/v_nail.mdl` / `progs/g_nail.mdl` through the existing weapon loader.
The source geometry, UVs, authored normals and firing poses are preserved.
The original axe and previously installed super nailgun/weapons are unchanged.

## Source, conversion and boundaries

Source: `/Users/bri/Downloads/Quake/Id1/PAK3.pk3`.
`progs/v_nail.mdl` is MDL6 with727vertices,681triangles andnine simple poses.
`progs/g_nail.mdl` is MD3v15 despite its extension, with499vertices,444triangles
andone pose. Conversion detects the format magic rather than trusting the name.
[Source/output hashes, mappings and bounds](../newer/weapons/nailgun/provenance.json).

`tools/import_nailgun.py` stages the donor in the existing weapon JSON schema.
MDL UVs keep native half-texel sampling and seam duplication; vertex normals use
Quake's162-entry table. MD3 coordinates decode short/64 and packed normal angles;
[the original renderer implementation](https://raw.githubusercontent.com/id-Software/Quake-III-Arena/master/code/renderer/tr_surface.c)
was checked for the packed-normal convention. Triangle winding is reversed to
Three's outward-facing orientation. Source vertex mappings are retained so the
conversion can be independently inverted and checked.

Both roles use identity scale/offset in Quake coordinates. The source held model
already aligns with the native barrel, but its receiver extends farther downward;
it is not squashed to the old box. Source9/1 poses map directly to native9/1
pose indices. The pickup's authored long axis differs from native art; its source
orientation remains intact while native pickup rotation still owns world pose.
No rigid animation/rotor is synthesized, and no renderer change is required.

The held `progs/v_nail.mdl_0.png` is copied byte-for-byte. Its similarly named
`textures/v_nail_norm.tga` uses another atlas and is deliberately not bound.
Authored held vertex normals remain available. The pickup uses its matching
`textures/g_nail.tga` and `textures/g_nail_norm.tga`, losslessly decoded to PNG.
Held and pickup material sources remain separate; colors are not regraded.

The manifest adds only `v_nail`/`g_nail` and their source entries. Existing startup
preload automatically includes both. Optional asset failures retain the current
native fallback and diagnostics. Native model identities, pose timing, damage,
ammunition, firing, pickup touch/collision, Classic mode and the weapon-art
switch remain owned by the existing engine. `r_newer_weapons 0` restores native
art. Existing weapon/texture hashes and prior manifest entries are unchanged.

## Trial and verification

Reload Quaked, choose Newer Game and select weapon4. The existing gameplay trial
also offers Nailgun, firing and native-art comparison. The fitting gallery now
has a dynamic row count, so the thirteenth role (new pickup) is visible.
[Model gallery](http://127.0.0.1:8027/tests/weapon_models_trial.html),
[gameplay trial](http://127.0.0.1:8027/tests/weapon_gameplay_trial.html).

Independent planning/review and4independently written source/interface tests
verify every pose, position, normal, UV/source corner and triangle, source pixel
conversion, real `R_WeaponLoad` and native `R_DrawAliasModel`, Classic/toggle
fallback, no rotor, immutable native entities and33prior weapon assets.
Combined with the review, modes and startup gates, **17/17 checks pass**.
[Current results](evidence/nailgun-tests-2026-10-05.txt),
[independent receipt](evidence/nailgun-source-2026-10-05.json).

The broader historical weapon-fit/source suites are not qualified by this run:
they require missing original `supernailgun.zip` / `supernailgun2.zip` source
archives. Their failure output is retained, not relabeled as passed. The new
ordinary nailgun's archive is present and its complete source checks pass;
previous weapon payloads remain byte-identical. The old fitting checks retain
native-fit assertions for older models; the new identity-source/deforming poses
are checked directly against their donor rather than incorrectly forced rigid.

Automatic approval review initially failed twice because its selected model
was at capacity. The later retry was approved and the gallery check executed:
all13replacement roles settled, held727/pickup499vertices rendered, both new
roles were visible on the expanded1200x1200canvas, and no runtime/console errors
were recorded. [GPU gallery receipt](evidence/nailgun-gallery-2026-10-05.json),
[appearance](evidence/nailgun-gallery-2026-10-05.png).
This is bounded gallery rendering, not live firing/frame-rate or XR qualification.
Owner appearance/placement acceptance remains pending; inspect held firing and
pickup views in the trials. No commit, push or release is implied.

To reproduce into a staging directory with Python, NumPy and Pillow:

```
python3 tools/import_nailgun.py --archive /Users/bri/Downloads/Quake/Id1/PAK3.pk3 --root /Users/bri/SOURCE/Quaked --out /tmp/NailgunImport
```

Review those outputs and merge only the two source/role entries; do not run the
older whole-weapon importer over unrelated owner-calibrated assets.
