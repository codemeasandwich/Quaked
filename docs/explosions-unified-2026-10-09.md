# Explosions: boxes, the ring, and transparency

Cards [X1], [X2] and [X3], from the owner's list of 9 October 2026. They refine the supplied Fireball
([explosions-fireball-2026-10-08.md](explosions-fireball-2026-10-08.md)).

## [X1] Exploding boxes use the Fireball

In the stock QuakeC an exploding box does not send the rocket's explosion message. `barrel_explode` (this progs.dat,
CRC 24778, checked by decoding it) plays the sound, sends `particle(origin, '0 0 0', 75, 255)` (a particle message with
count 255), raises its origin 32 and calls `BecomeExplosion`, which turns the box into the `progs/s_explod.spr` explosion
sprite. So a box showed a brown particle burst and a sprite, not the Fireball. Every other caller of `BecomeExplosion` in
the progs (rockets, grenades, tar babies) sends its own explosion message first, and nothing else sends count 255
(blood is at most 40, chunks 6, lightning 120).

* `R_ParseParticleEffect` (`src/render.js`): a message count of 255 is the box blast and goes through the same path as
  every other explosion: the Fireball in Newer Game, the original 1024-particle burst in Classic, with `r_fireball 0`,
  before the textures load, or when the pool is full. Other particle messages are untouched. The Fireball is centred on
  the box (the message gives the box's corner on the floor; it is offset by 16, 16, 20), and it has the explosion's
  dynamic light like a rocket's (a stock box never had one).
* `R_FireballReplacesSprite` (`src/r_fireball.js`, asked by the sprite draw in `src/gl_rmain.js`): the `s_explod.spr`
  sprite is not drawn **only while a Fireball of ours was spawned within the last second within 128 units of it**.
  So when no Fireball took the blast (Classic, `r_fireball 0`, textures not loaded, a full pool) or an explosion sent no
  message of its own (Hipnotic's Armagon death, Quoth's pyro flame impact, as a reviewer found), the sprite is drawn as
  the game made it.
* The title demo's split view: the Newer half has the Fireball and no sprite, the Classic pass (where Newer is off) keeps the
  sprite and, with the new `classicOnly` flag on `R_RunParticleEffect`, the native burst flagged for the Classic half only.
* The gore blood (`src/sv_gore.js`) is clamped to count 254 so a very large monster's blood can never read as a box.

## [X2] The ring faces the camera

The shock ring was a flat disc lying on the surface the blast hit, so at a shallow angle it became a thin line. It is now
a disc that faces the camera every frame (an orthonormal basis from the direction to the eye, with the world's up as its
reference, and the surface's own plane when the eye is exactly on the burst). It is centred on the explosion rather than
on the floor point, like a shock sphere seen end-on, which the level's geometry cuts by depth: a burst on a floor shows the
half above it, so near a surface the ring reads as an arch, not always a full circle. It fades out as the eye comes inside
its radius (gone at 0.3 of the radius, whole at 0.9), so a burst beside the player does not sweep a band across the screen.
It still exists only for a burst near a surface and follows the same radius and fade curve. Whether the centre belongs on the
burst or on the old surface point is for the owner to judge.

## [X3] The fireball is semi-transparent

The clouds were drawn at the source's full alpha, which read as a solid cut-out where they met the level. A new setting
`r_fireballalpha` (0 to 1, default **0.7**, saved with the other settings; 1 is the source's own alpha) scales the explosion
clouds' opacity. The flash, sparks and ring, and the rocket and grenade smoke trails, are unaffected. Set from the console,
a value that is not a number reads as 0 (the engine's usual rule); values outside 0 to 1 are clamped. The 0.7 is my
starting value for the owner to judge.

## Checks

* `tests/fireball_test.js` (25): a box blast message spawns exactly one Fireball and counts 8, 200 and 254 do not; the sprite
  is hidden only with a nearby recent burst in Newer Game (not for a far sprite, an old one, other sprites, an entity
  without an origin, Classic, `r_fireball 0`, textures not loaded, a full pool); the burst is centred on the box (checked
  through its light's origin); a box blast keeps its native particles in Classic, before the textures load, and with a full
  pool (counted through the real particle system), drops them when the Fireball takes it, and in the demo split the
  Classic half gets them flagged and the Newer half none; the light exists; the ring faces the camera from seven positions
  with a unit, perpendicular basis and fades with the eye inside it; the cloud opacity follows `r_fireballalpha` exactly
  and nothing else scales; the sprite call site and the 255 routing are read from the source.
* Mutation checks, each failing a named test: count `>= 200`; the sprite hidden without a burst; no `classicOnly`
  passthrough; the box not centred; no ring fade; native particles also in the Newer half; plus the earlier ones (no 255
  branch, the ring using the surface plane, the cvar clamp).
* In the real game (Chrome, Newer Game, E1M1): a Fireball at `r_fireballalpha` 1 versus 0.7 (the level behind shows
  through at 0.7), and a low-angle view of a burst with its ring as a clean arc. The pictures are in the session
  scratchpad, not committed. One independent review; all its findings are addressed.

## Not checked

An actual exploding box in the real game (the scratch run of `barrel_explode` stopped at a host-error callback in the test
harness, so the 255-count message is verified at the parser, from the decoded progs). The look of the ring centred on the
burst and the 0.7 opacity are for the owner to judge. Mods that use `s_explod.spr` with their own messages were only read, not
run.
