# The Ring of Shadows hides you from monsters already hunting you

Owner request, 9 October 2026. Newer Game only; New Game (Classic) keeps Quake's rules.

In stock Quake the Ring of Shadows only stops monsters *noticing* you: a monster already hunting you keeps hunting, and one you shoot knows exactly where you are from then on. In Newer Game:

* **Unseen.** The moment you have the Ring (picked up, or switched on in Options > Cheats), every monster hunting you loses track of you and goes back to its patrol or its stand, as a Quake monster does when its enemy dies. While the Ring lasts none of them finds you again (Quake's own rule: a monster cannot notice an invisible player).
* **Heard, not seen.** A monster you hurt while unseen turns on **the place you were when you fired**, not on you. It goes there and attacks that spot with its ordinary attacks (so standing still where you fired is still dangerous). Monsters hurt by the same shot share the spot; a later shot from somewhere else gives a new spot. After 5 seconds without a new hit, or when the Ring ends, it gives up and goes back to its patrol or stand; once you are visible again it can notice you in the ordinary way.

## How

`src/sv_unseen.js`. Two hooks on the game's own QuakeC functions (`pr_exec.js`, as for the respawn and face events): `W_Attack` records where you were when you fired; `T_Damage`, when it leaves a monster you hurt with you as its enemy while you have the Ring, gives it an invisible spot entity (`unseen_spot`: not solid, cannot be damaged) at that position as its enemy and goal. A per-frame check (`SV_UnseenFrame`, from the host frame, also while a menu holds the game) drops any monster still hunting an unseen player, and removes spots that have expired or once the Ring ends, first sending their monsters back to patrol or stand. No monster code is replaced: it is the game's own AI working on a different enemy. Spots in a saved game are picked up again when it is loaded. Local single player with the stock progs only.

## Checks

* `tests/unseen_native_test.js` (4, real QuakeC monsters, real `T_Damage` and `W_Attack`, real physics frames):
  * a monster hunting you keeps hunting without the Ring, loses you the moment you have it, goes to its patrol or stand, and in five seconds right beside you does not find you again;
  * a monster you hurt while unseen, after you fired and moved 300 units, takes the spot you fired from (not damageable, not solid) and not you, heads for it (an Ogre closed from 200 to 53 units in two seconds, facing it), a second monster hurt from the same place shares the spot, and it gives up when the spot's 5 seconds are over; without the Ring a hurt monster hunts you as in Quake;
  * a second shot from elsewhere gives a new spot; a spot in a loaded game is picked up again; the Ring ending removes the spots;
  * Classic keeps Quake's rules.
* Mutation checks (9), all caught: no drop when the Ring comes, the spot at your current position instead of your firing position, no retarget, no expiry, no sharing, Classic not excluded, spots kept after the Ring ends, saved spots not adopted, the spot damageable.
* The respawn, face, cheats, power-up, power-vision, axe and Bestiary suites pass (225 tests).
* Real browser (E1M2, the real game loop): a Soldier hunting the player lost them when `cheat_power ring` went on (its enemy became the world), a shotgun blast made it hunt the spot the player fired from, and seven seconds later it had given up.

## Not checked

Every monster type by eye (the Ogre and the Soldier were checked); a monster attacking the spot while you still stand there will still hit you, as intended. Mission-pack monsters are not covered (other progs).
