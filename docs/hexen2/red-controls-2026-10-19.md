# Retroactive RED controls — 19 October 2026

Purpose: several behavioural fixes were made **code-first** during G1. Plan section 8 requires a failing assertion
against the unmodified baseline first. This record supplies executed **retroactive** controls for the fixes that can be
reversed in isolation, and states plainly where that is impossible.

Method: a detached temporary worktree at `737e9730` (the evidence commit of that day), one fix reversed by a minimal
patch, the named maintained test run, the failing assertion retained, the worktree removed. No product change in the
`h2` worktree results from this record.

Command pattern (from the `h2` worktree):

```sh
git worktree add --detach /tmp/h2-red-<name> HEAD
# reverse exactly one fix, then:
QUAKED_THREE_MODULE="/Users/bri/SOURCE/Quaked/node_modules/three/build/three.module.js" \
  node tools/run_tests.mjs tests/<suite>.js
git worktree remove --force /tmp/h2-red-<name>
```

## C1 — Hexen eye height clamp (client view)

- Fix under test: `V_BoundOffsets` covers the client's eye height (`Math.max( 30, cl.viewheight )`); Quake keeps +30.
- Reversal: the bound returns to the Quake `+30`.
- Test: `hexen2_client_view_test.js`.
- Retained failure: `view z: 30.03125 != 50.0625` (a Hexen eye at 50 was clamped to 30).
- Current tree: passes.

## C2 — `newclass` hand-off at spawn (class statistics)

- Fix under test: `Hexen2_SpawnPlayer` writes the chosen class into the gamecode's `newclass` field (resolved per
  program: offset 212 base, 214 Portal).
- Reversal: remove the hand-off.
- Test: `hexen2_class_stats_test.js`.
- Retained failure: `native Paladin starting health (70..85): 100` — without `newclass`, `stats_NewClass` returns
  through its class guard and the player has no native statistics.
- Current tree: passes.

## C3 — co-op spawn flag around `ClientConnect`

- Fix under test: `Hexen2_SpawnPlayer` sets the multi-client co-op flag before and after `ClientConnect`.
- Reversal: remove both assignments.
- Test: `hexen2_coop_spawn_test.js`.
- Retained failure: `both feet are on the floor` — the second client is returned to the occupied start and cannot settle
  (the gamecode saw `coop = 0`).
- Current tree: passes.

## Limits (do not overclaim)

- These controls cover three **behavioural fixes** that could be reversed in isolation. They do not retroactively
  create a pre-code RED for the **new presentation modules** (HUD data, status-bar layout, inventory, audio bridge,
  view binding, mount): no prior public interface existed against which to assert a baseline failure. Under plan
  section 8 those modules remain **code-first**, and that obligation is not waived by this record.
- A missing-module import failure was deliberately not used as a RED; plan section 8 excludes it.
- The three controls were executed at `737e9730`; later commits do not change the code paths they reverse except where
  the unaffected suites still pass (reported with every all-suite run).
