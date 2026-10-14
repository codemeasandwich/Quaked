# Footsteps

Item 1 of the add-on effects for every game (card T-3faa98e3; plan:
[addon-effects-integration-2026-10-13.md](addon-effects-integration-2026-10-13.md)), as Arcane
Dimensions, Quoth and Abyss of Pandemonium have them. The material of each floor comes from the table
in [material-sounds-2026-10-14.md](material-sounds-2026-10-14.md); the step sounds are made by the
engine as those are (`quaked/step_<material><1..4>.wav`, `quaked/steph_…` for a heavy tread).

## What it does (Newer Game, every supported game)

- **The player** steps once each stride while moving on the ground. The stride grows with speed, so
  walking (160 units a second) is about 2.4 steps a second and running (320) about 3. The step is the
  floor's own (stone, metal, wood, ground, glass) and wading sounds as water. A little quieter than
  the game's own sounds (0.22 to 0.32).
- **Everything else that walks** (other players, monsters) steps once each stride it moves along the
  ground in a walking or running pose (its own frame names: walk, run, prowl ...). How heavily, from
  the size of its model's first pose: light (a dog, a zombie: under 35 000 cubic units, shorter
  strides, quieter), heavy (an ogre, a Shambler: over 150 000, longer strides, the deeper `steph_`
  sounds), the rest between. Nothing else steps: not gibs, heads, grenades or slow projectiles, not a
  corpse sliding, not a Scrag hovering or a fish swimming (no walking pose), not anything more than 30
  units over the floor below it (a walker's middle is 24 over it), rising or falling fast, standing
  still, more than 1500 units away, or jumping a long way in one frame (a teleport). The player steps
  only while alive and in the level.
- **A game's own footsteps win:** once a game plays a footstep sound of its own for the player
  (Arcane Dimensions' `steps/…`; any sound named `…step…` or `…foot…`), the player's steps are left
  to it for that map; once it plays one for a creature (Quoth's Gug: `gug/step1.wav`), that kind of
  creature's are. A footstep sound the game only loads and never plays changes nothing (Malice loads
  `misc/step1.wav` for a trap).
- Only on a free sound channel, at most four steps in a frame, so no game sound is ever cut off.
- Off in New Game, in demos, while paused and with `s_footsteps 0` (saved; Options, Newer features,
  "Footsteps").

## Code

`src/newer/sound/s_footsteps.js`: `S_FootstepsFrame( time )`, called once a frame by the renderer
(`gl_rmain.js`) after the entities are placed.

## Checks

`tests/footsteps_test.js`, with e1m1's real floors and the shareware pack's real models: the player
running steps 10 to 14 times in 4 s and walking fewer, all on the floor's material; standing, in the
air or dead, none; a dog steps lightly and more often than a soldier, a Shambler heavily; a Scrag
hovering 30 units up, a gib or a corpse sliding along the floor and a still soldier not at all; once
the game plays its own `steps/…` for the player, ours stop for the player, and once it plays
`soldier/step1.wav` for a soldier, ours stop for soldiers; only loading them changes nothing; New
Game, a demo, a pause and the switch off, none.
Not yet heard in a browser.
