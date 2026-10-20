# Retroactive RED controls — 19 October 2026

> **Historical record — the parallel host is retired.** This document describes the `h2` branch's parallel Hexen II
> host (`hexen2_page.js`, its private 1019 protocol and its private wire/session modules) as it stood before package
> U10. That host and those modules were deleted when Hexen II moved onto the shared host; file, module and test names
> below are evidence of that earlier work, not current entry points. The current architecture is
> [unified-host.md](unified-host.md).

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

## C4 — control sound origin for brush doors

- Fix under test: `Hexen2_SoundOrigin` returns the model/entity bounds centre when a brush entity reports origin 0.
- Reversal: return the raw origin (skip the bounds-centre fallback).
- Test: `hexen2_native_ui_test.js` (current uncommitted tree).
- Retained failure: `a brush door is heard at its bounds centre: [0,0,0] != [528,0,166]`.
- Current tree: passes. This is a **retroactive** control: the helper and its test were added code-first in the same
  increment, so it is not a pre-code RED.

## C5 — control local item rotation

- Fix under test: `Hexen2_ItemRotation` spins `EF_ROTATE` items at 100 deg/s and leaves other items still.
- Reversal: return `null` unconditionally.
- Test: `hexen2_native_ui_test.js` (current uncommitted tree).
- Retained failure: `the MDL effect bit spins at 100 deg/s: null != [0,10,0]`.
- Current tree: passes. Retroactive, as C4.

## C6 — attempted queue-drain control (not counted)

- Attempt: remove `queue.shift()` from `Hexen2_TakeSounds` to prove the "queue is drained" assertion.
- Result: the reversal made the drain loop forever and the suite crashed without a bounded assertion
  (`TOTAL 0/0 passed`), so it is **not** a valid RED control and is recorded only as a failed method. The restored
  tree passes 2/2.

## Limits (do not overclaim)

- C1–C3 cover three **behavioural fixes** that could be reversed in isolation. C4–C5 are retroactive controls for
  helpers introduced code-first in the 19 October increment; they do not create a pre-code RED. The presentation
  modules (HUD data, status-bar layout, inventory, audio bridge, view binding, mount, page sound queue/use/rotation)
  remain **code-first** where no prior public interface existed; that obligation is not waived by this record.
- A missing-module import failure was deliberately not used as a RED; plan section 8 excludes it.
- C1–C3 were executed at `737e9730`; C4–C5 in the current dirty tree (HEAD `7f5c01b0` plus the delta worktree). Later
  commits do not change the code paths they reverse except where the unaffected suites still pass (reported with every
  all-suite run).
