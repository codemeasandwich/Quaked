# Enemy animation: jumps and deaths audited, early frames no longer snap

Card [43]. Newer Game's smoothed enemy animation (`src/newer/render/r_anim.js`, `R_AliasPoseBlend`, applied in `src/engine/render/gl_mesh.js`)
blends from the pose the game showed last to the pose it shows now, over the frame's interval (0.1 s, or a group frame's
own). This is a runtime blend between the model's own frames; nothing new is generated or stored on disk. Classic Game
draws the game's exact poses, unchanged.

## What was audited

A browser trial (Chrome for Testing, E1M1 and E1M2, Newer Game) made real monsters run their own QuakeC: a Rottweiler's leap
(`dog_leap1`), a Fiend's leap (`demon1_jump1`), and the deaths of a Rottweiler, a Grunt, an Ogre and a Knight (their
`*_die1`). Every frame, it recorded the client entity's frame and its blend state (from, to, blend, start, interval, and
whether the state was restarted).

* **Order and endpoints: correct.** Each blend leaves the pose the last one was heading for, in the game's own order.
  Every death ends holding its final pose (blend 1, steady), with no restarts. The leaps keep one blend state throughout:
  a Fiend's leap does not trip the 96-unit "teleport" restart.
* **One defect: early frames snapped.** Quake's monsters think every 0.1 s, but the server runs in steps of its own frame
  (about 1/60 s). So a frame change sometimes arrives one step early, 0.083 s after the last. Measured at each change,
  the blend had reached 0.83 in 3 of 30 changes in the Rottweiler's leap, 1 of 8 in its death and 3 of 9 in the Grunt's
  (7 of 47, about one in seven).
  The next blend then started from the last frame's pose, so the model jumped the remaining sixth of the way in one
  drawn frame. This happens in every animation, walks included, and is easiest to see in a leap or a fall.

## The fix

When the game changes pose before the last blend is done (short of its end by its own interval; rounding on a change
that comes on time does not count), `R_AliasPoseBlend` marks the change early (`lead: { from, to, t }`: the two frames and
how far between them). At the first draw after it, the mesh keeps what it drew last (its blended positions and normals)
and the new blend leaves exactly that, however many early changes come in a row. Only when the entity was not blended at
its last draw is the lead rebuilt from the two frames and t. The lead is dropped once the blend arrives, and whenever the
state restarts (first sight, a different model, a stale or foreign state, a teleport). Shadows read the blended positions
as before.

## Checks

* `tests/classic_alias_frames_test.js`, the real Grunt through `R_DrawAliasModel`: at an early change the drawn positions
  and normals are byte-for-byte what was on screen; a draw later, every vertex is exactly the blend from that pose to the
  new frame; a second early change in a row again draws exactly what was on screen; on arrival the new frame is drawn
  exactly. It fails when the mesh ignores the lead, when it rebuilds the lead instead of keeping what it drew, and when it
  re-takes the lead at every draw.
* `tests/r_anim_test.js`: a change arriving at 0.0833 s is marked early at 0.833, measured by the last frame's own
  interval (0.833, not 0.42, when the next frame lasts 0.2 s); a change on time is not early; the lead is gone on arrival,
  for a late change and after a restart. Each fails when its part is broken. The suite's other failure (texture filtering)
  is a known existing one, unrelated.
* Animation suites unchanged: `alias_mesh_cache`, `alias_mesh_native`, `classic_alias_frames`, `weapon_rotor` and
  `model_lighting` all pass; `gl_model` keeps its known existing failure.
* Browser (the trial above, after the fix): early changes are marked in the Rottweiler's leap and death, the Grunt's
  death and the Fiend's leap, with no errors and the deaths still holding their last pose. The trial script and the
  numbers above: [evidence/animation-audit-trial-2026-10-10.mjs](evidence/animation-audit-trial-2026-10-10.mjs),
  [evidence/animation-audit-2026-10-10.json](evidence/animation-audit-2026-10-10.json).

## Not checked

The trial's sampling on this machine was sometimes slower than the frames (several changes between samples on E1M2), so
the per-change numbers above come from E1M1 only. There is no side-by-side capture of Classic and Newer at matched times,
and no frame-by-frame image of the snap or its absence. The Fiend's death was not reached (only one Fiend was available
to the trial). Grouped frames are covered by the existing interval test, not by a real model in this trial.
