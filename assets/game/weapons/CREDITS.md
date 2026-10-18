# Weapon asset attribution

The owner supplied these archives/GLB on 2026-10-02. Original files remain untouched at the repository root. `source.json` in each asset directory and `index.json` retain source URLs, embedded author/license metadata, source SHA-256, geometry counts, selected mesh, material factors and axis calibration. The retained `license.txt` files are copied verbatim from the archives. Weapon-model derivatives change coordinates, scale and pose motion; textures are copied byte for byte. The axe uses its complete original Quake mesh and skin; donated axe assets are not used by the renderer. These are separate third-party assets, not GPL code.

## 小林 団那紀 — weapons

Owner-supplied author link: [小林 団那紀](https://sketchfab.com/dannaki_). The archives' embedded metadata identifies the author as **旦那気 大安**, [dannaki_tayan](https://sketchfab.com/dannaki_tayan). Both identities are preserved without rewriting the source metadata.

- [Supershotgun](https://sketchfab.com/3d-models/supershotgun-3df3bb71d79e4eac8126f53a5b54b874)
- [Shotgun](https://sketchfab.com/3d-models/shotgun-9f58537324794d53b317676555f41fc9)
- [Supernailgun](https://sketchfab.com/3d-models/supernailgun-53ab89b5c3c64cc7bc13b66636c430e2)
- [Grenadelauncher](https://sketchfab.com/3d-models/grenadelauncher-e9b8f4c575d74190a7840cfe6417dad0)
- [Rocketlauncher](https://sketchfab.com/3d-models/rocketlauncher-e988bdc7c79e450e80984f9b8c192fcd)
- [Thuderbolt](https://sketchfab.com/3d-models/thuderbolt-c1c82903dfb84be187eadac3465b2ef8)

All six supplied weapon models identify **Sketchfab Standard**. The author-supplied archive licenses remain beside their derivatives; public redistribution/release requires the owner's rights under those source licenses. This local implementation does not publish or change those licenses.

The super nailgun geometry now comes directly from the FBX nested in the owner's `supernailgun2.zip`. Its outer albedo/normal PNGs are copied unchanged; explicit texture orientation and normal green-channel settings preserve their authored wrapping. Uniform scaling and rigid placement preserve the supplied shape, including its mid-barrel ridges. A mild shader colour balance applies only to the bare barrels. The original supplied `supernailgun.zip` retains the embedded author/license provenance for this same model.

During held firing, only its four supplied barrel assemblies rotate about their shared centreline. The body and common rear ring stay fixed. Authored barrel normals rotate with the geometry; textures and UVs are unchanged. Pickup geometry is not animated this way.

## Shotgun-shell source and license

Only `shotgun_shell_bullets_0` (mesh 11, node 26) and its `bullets_baseColor.png` texture from Weapon Pack are used. No gun, knife, bullet, magazine or ammo box from that pack is imported. The casing is centred, reoriented to lie on its side at rest and scaled to 2.4 Quake units in length. The pack's original source and CC BY 4.0 attribution remain in the supplied [license file](shell/license.txt) and [source metadata](shell/source.json).

Original Quake weapon model transforms/poses and the native axe hand remain owned and loaded through the original game data. The importer reads their geometry for calibration; gameplay model identities and their skins are not overwritten.
