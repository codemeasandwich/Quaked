# Travelling enemy resources survive death and level revisits

## Owner problem and demonstrated failure

A knight follows the player from E1M2 to E1M3, dies there, and remains in the
saved E1M3 session. After the player visits E1M2 and returns, the engine crashes
with `SV_ModelIndex: model progs/knight.mdl not precached`. E1M3's own entity
spawns do not precache a knight. The seamless session restored the corpse's
fields but did not restore resources introduced by travellers.

The public native regression reproduces this exact failure through
`SV_SeamlessFrame`, actual BSP crossings, `SV_SpawnServer`, stock QuakeC
`T_Damage`, and native baseline creation. The failing receipt is retained at
`evidence/seamless-corpse-before-fix-2026-10-03.txt`.

## Small reuse of the existing session boundary

`src/newer/gameplay/sv_seamless.js` retains copied model and sound precache manifests alongside
each existing level snapshot. One shared source manifest also accompanies the
existing follower batch. This first-arrival manifest includes native/mod-specific
pain, attack, death and head resources, rather than guessing them from the body
model's filename. It fixes the related first-kill gap where a travelling knight
could need `progs/h_knight.mdl` before any destination snapshot exists.

The manifest includes named external assets, including external brush-model
pickups. It excludes the source world BSP and inline `*` brush models. Those are
owned and precached by the destination's existing map spawn; loading a source
world during follower arrival could replace inline model definitions.

The same loading-time helper restores both kinds of manifest. It uses the
existing model loader with required-file semantics, respects the native
256-entry model/sound protocol limits, and reports explicit loader/capacity
errors. It does not add resources after server activation or skip an enemy whose
required model is unavailable.

Before restored edicts are linked, their numeric model indices are resolved
again from their model names in the current server's precache. This applies to
every non-free edict, including corpses, heads and gibs; health is not a filter.
Free `{}` tombstones remain free. Saved health, position, frame, callbacks,
globals, timers and monster counts retain the existing serialization behavior.
Native physics may continue death animation or gib motion after restoration.

The existing single-player seamless enablement and session-reset boundaries are
unchanged. No renderer, menu, flashlight, game assets or QuakeC binary changed.
Snapshots remain in-memory for the current seamless run; this adds no new disk
save format or durable session storage.

## Trustworthy verification and its limit

Run with the existing Node/Three test runner:

```sh
QUAKED_THREE_MODULE=/private/tmp/quaked-three.module.mjs \
  /Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  tools/run_tests.mjs tests/seamless_corpse_restore_test.js
```

The two native tests verify:

- A real E1M2 knight follows the real doorway into E1M3, dies through stock
  QuakeC damage, and survives two E1M2/E1M3 return cycles with dead health,
  settled death pose and position preserved, no duplicate or resurrection,
  loaded native model, and the correct current numeric model index.
- The first arrival already has the knight head and native death sound. Actual
  200-point damage produces the native head and three gib models; those restore
  once with current model indices, while a freed entity remains a tombstone.

Current focused results are at `evidence/seamless-corpse-tests-2026-10-03.txt`.
This is server/QuakeC/BSP/baseline proof with real supplied native data, not an
automated browser playthrough or owner acceptance. To try the visible behavior,
let a knight chase through E1M2's exit to E1M3, kill it, walk back to E1M2, and
return to E1M3. The corpse should remain where it fell without a fatal model
lookup. A gib kill exercises the first-arrival death resources too.
