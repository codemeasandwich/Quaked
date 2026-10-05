# Normal Newer Game enhancement loading — 2026-10-04

## Owner request and proven gap

The owner reported that enhancements were not loading as part of normal Newer Game, and clarified that this included enhancements beyond the rock-wall correction. The normal menu used a startup batch containing lighting, normal maps and shadow switches, while the rock trial explicitly enabled relief after signon. Those paths were different.

`r_rockfield` and `r_powerups` are archived. An earlier OFF choice could therefore survive a reload and a new Newer Game. Other binary options, including textures, weapons, liquids, enemies, portals and HUD, could remain OFF within the same session. Existing map/material/asset loaders were already wired and responded correctly when their gates were enabled. No replacement loader or parallel rendering system was required.

## Implementation and boundaries

`src/newer_defaults.js` is a pure, shared list of sixteen binary enhancement switches. Normal **Newer Game** and **Newer Level Select** derive their existing command batch from that list and apply it **before** dispatching the map command. The commands keep the existing gamma midpoint and FPS default. Each explicit Newer launch starts with these enhancements enabled:

| Feature | Switches |
| --- | --- |
| Lighting and shadows | `r_newer_lighting`, `r_newer_shadows`, `r_pointshadows`, `r_heightshadows` |
| Surface detail | `r_newer_normals`, `r_newer_textures`, `r_rockfield` |
| Models and animation | `r_newer_weapons`, `r_newer_enemies`, `r_newer_variety`, `r_lerpmodels` |
| Other enhanced rendering | `r_newer_water`, `r_newer_portals`, `r_newer_hud`, `r_powerups`, `r_decals` |

This is a launch boundary, not a per-frame override. Existing feature controls and console OFF choices remain effective during play; they reset at the next explicit Newer launch. Classic entry, opening/canceling menus, ordinary console `map` commands, and load/save handling do not gain this startup batch. Appearance/intensity controls, water appearance, crate frequency, dynamic resolution and seamless-travel policy remain owned by their existing settings. `r_bounce`, `r_volumetric` and `r_caustics` are numeric gains, not binary flags; their tuned values are preserved. Flashlight startup remains under the existing fresh-map/corridor policy: the welcome level starts with the flashlight OFF.

The title comparison temporarily uses the same sixteen-feature baseline plus its existing flashlight setting. Review identified a real persistence boundary: ordinary cvar setting immediately writes archived values, and page shutdown serializes current values. Temporary demo ON values could therefore overwrite prior preferences.

`Cvar_SetTemporary` now retains the original value without updating immediate storage. `Cvar_WriteVariables` writes that retained value while the borrow exists, so ordinary configuration saving/page shutdown also preserves it. Repeated temporary updates retain the first base value. An ordinary `Cvar_Set` clears temporary ownership and commits the explicit choice even when it equals the displayed value. `Cvar_RestoreTemporary` restores only still-owned values; a subsequent user choice is not overwritten by an old demo snapshot.

| Example action | Effective value | Archived/config value |
| --- | --- | --- |
| Previous relief OFF | 0 | 0 |
| Title demonstration borrows ON | 1 | 0 |
| Demo ends without a user change | 0 | 0 |
| User explicitly selects ON during demo | 1 | 1 |
| Demo ends after that selection | 1 | 1 |

Menu ordering remains the existing one: the menu queues launch defaults, immediate demo release restores only still-owned temporary values, then the queued launch defaults execute before the map. A pure shared list avoids importing renderer owners into the menu and introducing another dependency cycle.

## Trustworthy verification

Independent planning traced normal menu -> command buffer -> real cvars -> existing renderer/loaders. Independent review found the archive and explicit-choice restoration defects; both were corrected before final qualification.

**63/63 public compatibility tests passed**, including six new tests in `tests/newer_start_test.js`. They use an independent literal sixteen-feature oracle, actual archived cvar registration, actual menu touch/key entry and actual command-buffer execution. Only the map endpoint is replaced with a capture, proving all feature values are enabled at dispatch. The tests cover both Newer starts, both Classic starts, menu cancel, actual ongoing feature controls, direct map dispatch, numeric appearance preservation, demo scope ownership, immediate storage, configuration serialization and ordinary config replay. [Receipt](evidence/newer-start-final-compatibility-2026-10-04.txt), [frozen source hashes](evidence/newer-start-final-source-2026-10-04.sha256).

Native integration uses one ordinary engine in `tests/newer_start_trial.html`. Its checked test setup first turns all sixteen switches OFF, then buttons enter the actual public menus; there are **no direct HDR/map commands or post-signon feature enabling**. It verifies the real server, signon, normal asset readiness and rendering:

- **Newer Game -> START:** all sixteen switches ON, readiness complete, 604 resident rock tiles with no missing visible tiles; 73 enhanced textures ready, 11 skin resources ready, held/pickup weapon resources settled with no failures. Flashlight OFF. [Actual readback](evidence/newer-start-native-hub-2026-10-04.json), [game frame](evidence/newer-start-native-hub-2026-10-04.jpg).
- **Newer Level Select -> E1M1:** all sixteen ON; readiness complete; 343 prepared rock tiles resident, 78 textures and 19 skin resources ready, weapon resources settled with no failures. [Actual readback](evidence/newer-start-native-levelselect-2026-10-04.json).
- **New Game -> START:** HDR 0, Newer mode false, relief and power-up rendering inactive; previous disabled choices retained. [Actual readback](evidence/newer-start-native-classic-2026-10-04.json).

The texture loader reports three existing native-art fallbacks in each enhanced map, with no texture errors; the record does not claim every map texture has replacement artwork. Native captures report GL error 0 and no asset-loading failures, but the background browser emitted Chromium's `UnknownError` Promise rejection during menu entry. This is retained verbatim in the raw diagnostics; the native input helper calls `requestPointerLock()` without handling its returned Promise, so pointer-lock entry is a likely source. This is a separate input/browser diagnostic, not evidence of missing enhanced assets or a claim of zero runtime errors.

The initial public test receipt contains a 3/4 result caused by comparing numeric zero's formatting (`0.000000` versus `0`); the assertion was corrected to compare numeric behavior. The initial compatibility and failed receipt remain alongside the final evidence. [Initial test](evidence/newer-start-initial-public-test-2026-10-04.txt), [earlier compatibility](evidence/newer-start-initial-compatibility-2026-10-04.txt).

The ordinary `/` game page was also exercised directly with native keyboard input: Escape -> Single Player -> Newer Game. It completed loading and displayed the enhanced welcome level with no diagnostic fixture controls. [Ordinary game frame](evidence/newer-start-ordinary-game-2026-10-04.jpg).

## Try and continue

Open the [ordinary game](http://127.0.0.1:8015/), then choose **Single Player -> Newer Game**. Newer Level Select uses the same baseline. [Native startup comparison](http://127.0.0.1:8015/tests/newer_start_trial.html) provides the deliberately-disabled setup and real startup diagnostics.

This is an implemented, verified local increment awaiting the owner's visual/gameplay acceptance. Earlier respawn, rock-band changes and owner artwork are preserved. No commit or push has been performed for this increment. Source and evidence identity are recorded in `docs/evidence/newer-start-source-2026-10-04.json`.
