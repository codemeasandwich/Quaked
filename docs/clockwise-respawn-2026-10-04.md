# Clockwise death, persistent weapons and exact ammunition

The owner requested the death/respawn behavior using
`/Users/bri/Downloads/clockwise-respawn-v1.1.0`. Their instructions override the
reference README: **the axe is excluded from drops**. They chose to split each
shared Quake ammunition pool between its matching weapons and asked for the
smallest camera integration change. The original source, README and manifest
are retained locally in `tools/respawn_reference/clockwise-respawn-v1.1.0/`. This unused reference bundle remains outside the scoped runtime commit; the ported engine implementation and its tests are included.

## Integration and inventory contracts

New sequences are admitted only in local, single-player Newer Game with the
stock QuakeC program identity. Native damage, death callbacks, sounds and scores
continue. The coordinator replaces the owned death's stock backpack and restart;
it does not reload the level. Existing enemies, doors, consumed items, secrets
and earlier uncollected drops remain in that world.

At confirmed death, each carried ranged weapon gets a separate native-model
server edict. Zero-ammunition weapons still drop. Shells split between shotgun
and double shotgun; nails between nailgun and super nailgun; rockets between
grenade and rocket launcher. Ascending weapon bits receive integer quotient and
then remainder, conserving each pool exactly. For example 19 shells become
10+9, 61 nails become 31+30, and 7 rockets become 4+3. Ammunition without a matching
weapon is grouped with all other unmatched pools in one native backpack-model
ammunition drop. Neither an axe nor a power-up collectible is created. The
[persistent death remains increment](death-remains-2026-10-04.md) also retains
the native corpse/head/gibs, keeps old scalar records readable, and verifies
the starting shotgun and its remaining shells are recoverable after respawn.

All active power-up item bits, real QuakeC finished timers and warning fields are
cleared immediately. Weapon ownership/current ammunition/held model are removed.
Allocation is transactional: all payload edicts are allocated before relinquishing
inventory, and an allocation failure removes partial new edicts. The engine's
existing finite edict budget remains; this is not an infinite-storage redesign.

Native toss gravity and BSP collision scatter and settle the pickups. They have
no `SUB_Remove` lifetime. Pickup requires a living, ready local player, actual
bounding-box contact, settled ground state and a short initial separation interval.
An atomic custom touch transfers the stored weapon bit and exact ammo, then frees
the consumed entity. Ranged recovery selects that gun and uses native ammo/model
setup, while ammo-only recovery keeps the selected weapon. It never calls stock
weapon/backpack default-ammo grants.
Recovered ammo adds above stock caps, with exact Float32 integer bounds rather
than silent rounding. The stock ammo-clamp helper preserves admitted overflow,
and paired local HUD statistics retain exact counts instead of eight-bit wrapping.
A zero-ammo pickup and an already-owned gun remain valid transfers. Consumed
pickups cannot transfer twice. Every subsequent death captures only current
ownership and remaining ammo; older drops retain their payloads and identity.

At contact, native `PutClientInServer` supplies the ordinary player setup. The
coordinator then sets health exactly 100, weapon inventory to the starting axe,
all ammunition to zero, armor to zero and power-ups inactive. Keys are retained
within the persistent level so a consumed key cannot disappear and softlock a
closed door. Global rune/progression state and world objectives are retained.
Input and damage are held only during the owned cinematic, matching the supplied
sequence's input/damage lock; this is not an active invulnerability power-up.
Standing completion restores ordinary movement and damage immediately.

Every living native enemy receives the respawned player as enemy/goal without a
PVS or distance filter. Valid native running callbacks perform pursuit. Pinned
zombies and scripted immobile actors receive the target without being unpinned
or assigned a NULL thinker. Their existing movement limitations remain.

## Camera and the chosen coordinate interpretation

The original sampler integrates a raised-cosine angular velocity:

`theta = pi * (u - sin(2*pi*u)/(2*pi))`

`omega = pi * (1 - cos(2*pi*u)) / turnDuration`

The port retains the original 0.22-second post-lethal lead-in and 2.6-second
half-turn. There is no transition fade, pause, mirror or reversal. Ground contact
occurs at the half-turn midpoint, with maximum continuous angular velocity.
The original demo's additional upright presentation hold is omitted: normal play
resumes as soon as the rise finishes. Airborne deaths can extend the turn to
accommodate the actual distance to the floor.

The head follows a fixed-radius rigid-body arc about an unpitched heading;
look pitch is transported separately. Actual BSP sweeps validate both complete
arcs, and the contact floors are measured under their lateral head positions.
In constrained spaces a smoothly sliding pivot retains that body radius. Quintic
pivot drift and destination-height adjustment have zero velocity at contact.
The final standing eye includes native view height and node-line bias, eliminating
the earlier 0.96875-unit release jump. A pathological squish/void with no safe
rigid arc retains a last-resort camera ray guard; that fallback is not qualified
as universal physical body collision. No level vertices or gravity are rotated.

The supplied reference uses opposing destination up directions. The smallest
integration keeps Quake physics, rendering and all level coordinates native and
carries a **proper presentation-frame rotation P**. The actual renderer camera
is expressed in the current native frame; its transported presentation orientation
is `P * Qcamera`. At contact P advances by a half-turn about the captured horizontal
forward axis, while the local roll changes coordinate basis from +90 to -90.
The transported orientation and angular/head velocity remain continuous. This
local basis change is explicit; native camera quaternion equality across the cut
is not claimed. The camera uses the last physics-processed motion timestamp:
the server advances its clock after the physics pass, so sampling the next clock
would teleport the camera one frame before the actor, health and frame change.
This synchronization keeps all four at the same actual handoff. The correct rendering equivalence is

`(P * camera)^-1 * (P * world) = camera^-1 * world`.

`r_respawn.js` constructs its presentation matrix from the **actual** camera matrix
after `R_SetupGL`, not from a duplicate diagnostic sampler. The proper rotation
has determinant +1. Ordinary player/world physics and the existing renderer's
logical coordinates remain unchanged, as requested. Native alias pitch convention
is applied to the fresh axe so it stays aligned with pitched camera views.

## Persistence, travel and mode changes

Validated private underscore metadata is serialized through existing ED save
and seamless snapshot mechanisms. Loaded drops restore their native model resources
before the reconnect header, including when loading an admitted save in Classic.
Resources are bounded and admitted at local map startup, so enabling Newer later
on START cannot fail because its original map had no ordinary weapon pickups.

Native `SetChangeParms` secretly raises an axe-only player's shells to 25. Admitted
inventory custody overrides that minimum when travelling: exact weapon bits,
ammo, selected weapon, death serial and presentation frame cross with the player.
The update to native held ammo executes outside interpreter leave callbacks.
Fresh map commands and load commands clear stale pending travel captures.
New map starting positions still come from the actual native spawn.

Turning the render option off during an admitted sequence does not strand the
player frozen or damage-disabled: ownership finishes and performs terminal cleanup.
Already admitted drops/overflow remain recoverable in that local context. A fresh
Classic death remains native. Dedicated, remote, demo, multiplayer and modified-QC
contexts do not admit this mechanic. Native pre-contact console saving still rejects
a dead player; ED phase roundtrips establish metadata integrity, not permission to
bypass that existing save rule. Actual post-contact save/load is tested.

## Verification and trial

Independent planning, public-interface tests and read-only source review were
performed by the existing `surface_plan` and `surface_public_tests` helpers.
Final native verification passes 17/17, including twelve complete death/fire/
recovery cycles, exact shared-pool conservation, zero-ammo and orphan pools,
partial recovery followed by another death, distant-touch rejection, actual
area-link pickup, model resources, full console save/load in both modes, nine
actual pinned START zombies, native AI targets, mode-change cleanup, exact HUD
statistics, and actual bidirectional native travel without hidden refills.
[Final native wire/mesh receipt](evidence/respawn-clientkill-final-wire-mesh-2026-10-04.txt),
[full physics-to-render timing receipt](evidence/respawn-full-physics-phase-2026-10-04.txt).

Actual `V_CalcRefdef -> R_SetupGL` camera checks cover two yaw/pitch families and
three successive deaths each. They prove proper bases, rigid head radius,
transported orientation/velocity continuity, transformed-world/camera rendering
equivalence and zero standing release jump. Actual `R_DrawAliasModel` checks
prove axe alignment. Real native ammo-box BSP obstacles and uneven level floors
prove swept clearance where the former horizontal-only ray missed collisions.

A live browser inspection identified a real `ClientKill` gap missed by earlier
camera-only tests: native QuakeC can leave health 100 and the old weapon model on
a dead player. The fixed path explicitly enforces dead health/empty held model
after native callbacks. A real server packet -> client decode -> actual render
scene/viewmodel test confirms absence before contact and 100 health/axe afterward.
[Initial failure](evidence/respawn-clientkill-initial-health-2026-10-04.txt),
[native opcodes](evidence/respawn-clientkill-native-opcodes-2026-10-04.txt).

The final combined regression passes **239/239 across 45 test files**, exit 0.
The receipt is
[evidence/respawn-regression-2026-10-04.txt](evidence/respawn-regression-2026-10-04.txt).
The local playable trial is `http://127.0.0.1:8015/tests/respawn_trial.html`.
Use Inspect courtyard death, Arm seven weapons, Die, then Return near last death
and walk over pickups. Its positioning shortcut and protection checkbox are
explicit inspection conveniences, not production respawn rules. Its actual-frame
telemetry/captures inspect the live simulation without scrubbing or time edits.

The final live GPU record has seven persistent drops containing exactly
19/61/7/13 ammo, an axe-only player at 100 health, zero powers/timers, 23/23
living enemies targeted, no runtime errors and GL error 0. Sixty-three actual
rendered motion rows plus five raw canvas frames record the synchronized fall,
contact, rise and standing endpoint.
[Live outcome](evidence/respawn-final-gpu-2026-10-04.json),
[motion trace](evidence/respawn-motion-gpu-2026-10-04.json),
[contact frame](evidence/respawn-contact-after-frame-2026-10-04.png),
[death-site pickup view](evidence/respawn-deathsite-preview-2026-10-04.jpg),
[final source and reference hashes](evidence/respawn-source-2026-10-04.json).
Earlier live traces and failed/native control receipts are retained separately.

This working implementation is uncommitted. The prior commit-and-push request was
completed for the preceding enhancements; no new publication is inferred here.
Owner visual acceptance and gameplay performance qualification remain separate.
The current chat owns the final live proof and acceptance; no unattended job is
claimed to be running. Unrelated owner artwork and model files remain untouched.

**Update 2026-10-08 (card [41]):** at contact the water state of the player (`waterlevel`, `watertype`) is refreshed for the destination, and again when the sequence completes, so a death in slime or lava no longer hurts the respawned player on dry ground. See `docs/respawn-hazard-state-2026-10-08.md`.

## Update, 9 October 2026

The 100 health this sequence gives at contact is now the rule for Easy, Hard and Nightmare only. On Normal the respawn health falls by 10 at each completed respawn (to a floor of 60) and is topped up by 10 on the first arrival in a new level; see [respawn health on Normal](respawn-health-2026-10-09.md). Tests that check a full-health respawn run on Hard.

Also since 9 October 2026: a guard monster (a Fiend on Normal, a Shambler on Hard and Nightmare) is left at the death location after the respawn lands: [respawn-guard-2026-10-09.md](respawn-guard-2026-10-09.md).

Also since 9 October 2026: the way back to the previous level shuts when the respawn lands: [respawn-return-closed-2026-10-09.md](respawn-return-closed-2026-10-09.md).
