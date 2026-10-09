# Melee hits on the player bleed, and throw nothing

Card [K1] (owner, 9 October 2026): "Melee attacks on the player show blood but must not emit physical chunks from the player."
Newer Game only; Classic keeps Quake's.

## What threw the chunks

In the stock QuakeC, a melee blow that lands calls `SpawnMeatSpray( org, vel )` on its victim: the ogre's chainsaw on its side
swings, the shambler's `ShamClaw`, the fiend's claws (and the hell knight's side swings in the registered game). It throws a
flying chunk of meat (`progs/zom_gib.mdl`, which trails blood) from the victim. The knight's sword (`ai_melee`) never threw
anything. A death that gibs the player is a different call (`ThrowGib`), untouched.

## What happens now

`src/sv_meleespray.js` hooks `SpawnMeatSpray` (through the interpreter's function hooks in `src/pr_exec.js`, the same way the
respawn sequence and the shotgun's delayed pellets are hooked). When the attacker's enemy is a player, the function does
nothing (`SUB_Null` runs in its place) and the same spot bleeds instead, with the game's own blood particles (colour 73, the
call `SpawnBlood` makes, 24 of them), moving the way the chunk would have. A monster hitting a monster still throws its chunk.
The damage is untouched: the spray never was part of the rules.

The choice of case was the owner's open question on the card; this follows the card's own words (blood yes, chunks of the
player no; a death that gibs still gibs). If the owner wants lethal blows to leave the body whole too, that is a separate rule.

## Checks

* `tests/melee_spray_native_test.js` (3), real QuakeC on stock E1M5: an ogre's chainsaw and a shambler's claw on the player
  hurt as before, throw no chunk, and send blood particles (read from the server's datagram); the knight's sword hurts and, as
  in Quake, throws nothing; an ogre's chainsaw on a knight still throws its chunk; in Classic the chunk still flies off the
  player; and a gibbing death still throws the player's pieces. Mutants: the hook off (a chunk flies) and no blood (none sent)
  both fail.
* Interpreter-dependent suites pass (respawn, guard, unseen, shotgun, face, cheats, bestiary, quad movement, pr_address).
* Real browser on E1M5: three chainsaw swings at the player (side swing): three bleeds, no chunk entity, the red pain tint.

## Not checked

The fiend and the hell knight in the browser (the same function and the same hook; the fiend is not in the shareware maps).
