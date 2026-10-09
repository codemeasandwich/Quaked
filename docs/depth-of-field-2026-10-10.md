# Depth of field with autofocus

Card [38]. Newer Game only. What the crosshair rests on is sharp; what is much nearer or further is softened, as by a
camera lens. **Options → Newer Game features → Depth of field** is a slider: all the way left is off, the default is 0.3,
all the way right is strong. Console: `r_dof` (0 to 1, saved).

![E1M1 at strength 0, 0.3 and 1. Top: focus on the wall 108 units ahead. Bottom: focus down the corridor, 1120 units away; the near walls soften, the gun and status bar stay sharp](images/depth-of-field-2026-10-10.jpg)

## How it works

* **Autofocus** (`src/r_dof.js`). Each frame, five rays go from the eye through the middle of the view (straight ahead
  and 0.03 to each side, up and down) against the level's own hull. The focus target is the median of their view depths,
  clamped to 16..4096 units, so a thin post on the crosshair does not snatch it. The focus follows the target in log
  distance with a 0.25 s time constant on the client's clock (the same at any frame rate), holds while the game is
  paused, and snaps to the target at once on a new level, a jump of the eye of more than 96 units in a frame (a teleport,
  a respawn) or the clock going back (a loaded game). It does not see monsters: aiming at one focuses on what is behind it.
* **The blur** (the present pass in `src/gl_post.js`). Each pixel's circle of confusion is
  `min( largest, strength x | 1 - focus / depth | )` pixels, strength = 14 x `r_dof` pixels of a 1080-line picture, the
  largest twice that, in the composite's own pixels (so dynamic resolution changes nothing on screen). A 16-tap
  golden-angle gather averages the pixel's disc. A nearer sample counts only as far as its own circle reaches there,
  so a sharp thing in front keeps its edge. The sky counts as infinitely far.
* **What is never blurred.** The held gun (marked in the G-buffer, the packet's alpha below -2) is neither blurred nor
  blurred into its surroundings, and never takes the focus. The status bar, menus, console and the Bestiary's paper are
  drawn after the picture.
* **Where it runs.** The present pass, after lighting, bloom and the vision modes and before the display's brightness and
  contrast, so it is applied once. With depth of field on, the picture always goes through the present pass (as with
  ripples or dynamic resolution). It is off in Classic, in the Classic half of the title demo, at strength 0 and in WebXR.

## Checks

* `tests/dof_test.js` (3): the target is the median of the rays (a post on the middle ray alone does not move it), the far
  and near clamps; the smoothing in log distance by `1 - exp( -dt / 0.25 )`, held while paused, settled within 1.5 s, the
  same at 30 and 150 frames a second; snaps on a new level, a teleport and time going back; off in Classic, at 0 and in
  WebXR and back on at once; the circle scaled by height (half the lines, half the pixels).
* Browser, E1M1 (picture above): the focus found 108 units (a wall) and 1120 units (down the corridor); strength 0, 0.3
  and 1 render without shader errors; the gun and status bar stay sharp. The median frame time measured the same with it
  off and at 0.3 (33.3 ms), but that headless browser caps its frames at about 33 ms, so this only bounds the cost.
* Options menu, module graph, `gl_post` and `gl_rmain` suites pass with the new slider and import.

## Not checked

The cost on a real GPU or a phone (16 taps of colour, depth and G-buffer per pixel); portals and mirrors (the present pass
is the main view's only); the bright halo a blurred near edge could leave over a sharp background (the gather keeps sharp
near edges; a blurred near object does not spread over what is behind it). Whether the default strength suits is the
owner's to judge.
