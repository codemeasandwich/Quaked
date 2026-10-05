# Persistent player death remains and ammunition backpack

Local Newer Game increment, 2026-10-04, based on `038fe593277e771a104a5412c611aedaadb6a206`. Code and working trial are uncommitted; owner visual acceptance and publication remain separate.

## Behavior

A nongibbed player leaves one independent native player-model corpse at the actual death site. It retains the native pose, skin, colormap, position, angles, velocity and death-animation thinker. Nonclient toss physics finishes the authored death animation and settles the body. It is nonblocking and cannot yield duplicate inventory. The original camera-owned player's dead render model is hidden until native spawning restores it; the established clockwise first-person motion and contact teleport are unchanged.

A gibbed death keeps the three actual native gib entities and copies the actual player head into one independent entity before the player is reused. No replacement whole body or invented additional gib set is generated. Native toss/bounce and spin remain; only the gib removal thinker/deadline is disabled. These bodies, heads and pieces have no time-based expiry and remain through later deaths, saves and seamless level return. The native four-slot body queue is not used or overwritten.

The starting shotgun is a recoverable dropped weapon because respawn still grants only the axe,100health and zero ammunition. Its exact remaining shells are stored, including zero. Recovery selects that weapon as stock single-player pickup does and calls native `W_SetCurrentAmmo`, so the real gun/viewmodel and ammo display update. It grants no stock pickup refill. Other carried ranged weapons still drop individually with the existing exact shared-pool split.

Unmatched ammunition is grouped into one native backpack. In particular, a player carrying only the axe and ammunition leaves **one backpack holding all four exact pools**, with no ranged weapon granted. An axe-only player with no ammunition leaves no empty pickup. Existing carried ammunition is added on recovery. All four sums are validated before any mutation; if one sum cannot be represented exactly, the entire backpack stays intact and no pool transfers. No axe or power-up collectible is created. Active powers are still removed immediately.

## Native implementation and custody

`sv_respawn.js` uses the existing native death-function entry/leave hooks. At entry it captures only admitted live edicts below `sv.num_edicts`; the preallocated tail is not live even though its constructor has `free=false`. Newly-live native gib models at callback completion identify this death's pieces, including reuse of formerly-free slots. Existing unrelated monster gibs are untouched.

One body/head edict is reserved **before** dropped inventory is committed. Failure to allocate the remaining pickup set releases partial pickups and that reservation, leaving the player's fields, inventory and custody record unchanged. The private reservation pointer lives in a WeakMap, never in save JSON. Unsupported externally supplied model data releases the reserved slot. Stock invisibility retains the native player model string and only changes its model index; its ordinary death path remains supported.

The original held weapon is retained only while native death code chooses its authored animation family; it is cleared at callback completion. This preserves axe death poses without retaining a usable weapon or ammo during respawn. A detached body has ordinary native fields and no live respawn coordinator. Existing model/lighting/shadow rendering handles it without a separate corpse renderer or changed geometry/textures.

`respawn_record.js` retains legacy version1 scalar weapon/ammo records. New ammo-only backpacks use version2 `{weapon:0,pools:[shells,nails,rockets,cells],id,born}` with four bounded nonnegative integer totals and at least one nonzero pool. `Respawn_DropAmmo` exposes one canonical four-pool view of both formats. `_clockwise_remains` is a bounded, validated value-only marker `{version:1,id,kind,born}`; model, frame, skin and native physics remain in ordinary entity serialization. `progs.js` clears the marker whenever an edict is reused. The optional `sequence.remainsRetained` boolean prevents duplicate retention when native death callbacks nest, and remains backward-compatible when absent.

Saved old scalar drops remain recoverable. New four-pool backpacks and ordinary remains survive real Host save/load, including Classic loading of an owned Enhanced save. Native seamless snapshots retain their posed models and actual locations for portal previews and return. The feature remains admitted by the existing stock local single-player Newer Game policy; it does not alter native Classic death behavior or redesign multiplayer/custom QC.

## Working trial

Open `tests/respawn_trial.html` on the local server. **Inspect courtyard death → Die → Inspect last remains** shows the original body and starting shotgun. **Axe with stored ammo → Gib death** exercises actual native lethal damage and one four-pool backpack. The trial protects the inspection player and offers shortcuts, while the normal game uses the same production coordinator without those helpers. **Arm seven weapons** remains available for shared-ammo recovery testing.

The native browser evidence contains one older body, one later head and three actual gib models, plus the older25-shell shotgun and a separate `[19,61,7,13]` ammo backpack. After each respawn the player had100health, axe only and `[0,0,0,0]` ammunition. The trial's own setup explicitly supplies the later stored ammo; it is not a respawn refill. Both native snapshots reported GL error0 and no captured page errors.

- [Body and shotgun data](evidence/death-remains-native-body-2026-10-04.json), [visible body and shotgun](evidence/death-remains-native-body-2026-10-04.jpg).
- [Later retained gibs and backpack data](evidence/death-remains-native-gibs-backpack-2026-10-04.json), [inspection view](evidence/death-remains-native-gibs-backpack-2026-10-04.jpg).

## Verification and retained failures

Independent native planning/source review came from `surface_plan`; `surface_public_tests` authored public/native tests and checked the source identities. `tests/respawn_remains_test.js` passes **7/7**: starting shotgun selection and exact shells followed by a real shot; native gun/axe nongib death animation; more than four persistent bodies plus actual gibs beyond100000seconds; one atomic four-pool backpack; legacy/new serialization; real seamless preview/return; Host save/load/resource headers; and the exact edict-capacity boundary with transactional failure and successful control.

Related verification covers **83 distinct cases across10 files**. The original broad invocation is retained as **82/83**, because an older test expected the complete items value to contain only weapon bits. Correct native gun selection also sets the HUD's `IT_SHELLS` flag. That assertion was corrected to the owned-weapon mask, strengthened with selected gun/currentammo/viewmodel/HUD-flag checks, and the affected17-case file rerun **17/17** against unchanged production. All other66 cases passed unchanged. This is source-identical constituent verification, not a claim that a later single83-case command was run. [Reconciliation](evidence/death-remains-verified-constituents-2026-10-04.json), [broad receipt](evidence/death-remains-broad-2026-10-04.txt), [corrected respawn receipt](evidence/death-remains-respawn-corrected-2026-10-04.txt).

Earlier4/6 and5/6 remains runs remain retained. The first exposed the preallocated-tail identity bug; it was fixed using the live edict bound. A timer assertion was corrected to native semantics (`think==0 && nextthink<=0`), with the no-expiry behavior still checked. The next fixture omitted the normal `SV_SaveSpawnparms` departure step before direct server spawning; adding that public carry boundary proved death serial and custody survive actual departure/return. The allocation-order issue found in independent review was repaired before the final capacity test. No producer failure was relabeled as a pass.

The final manifest binds implementation, test, native data and browser evidence hashes; the151-file verified source/fixture identity was rechecked unchanged. `git diff --check` passed. Existing renderer, powered axe/bisection, face, coating, welcome-aid and Newer-start behavior passed their corresponding native regression constituents. The native engine's finite edict budget remains; persistent objects are not an unlimited-storage redesign.

## Continuation requirements

Keep native death animation and gib initialization intact; retain pieces after their timers are assigned, preserve pose/skin/colormap, and avoid the reusable body queue. Reserve new owned allocations before inventory transfer. Keep old payload formats readable, all backpack pools atomic, zero-ammo weapons recoverable and gun selection delegated to native ammo/model setup. Do not restore automatic shotgun/ammo at respawn, duplicate old drops, turn dead remains into active players, expire owned remains, or modify the existing camera transition. Owner assets and concurrent work remain preserved; no commit, push or deployment was performed.
