// Melee hits on the player bleed, but throw nothing of the player (card [K1], owner 9 Oct 2026: "Melee attacks on the player show
// blood but must not emit physical chunks from the player"). Newer Game only; Classic keeps Quake's.
//
// In the stock progs every melee blow that lands calls SpawnMeatSpray( org, vel ) on its victim: ai_melee and ai_melee_side (the
// knight, the hell knight), the ogre's chainsaw, the fiend's claws and the shambler's. It throws a flying chunk of meat
// (progs/zom_gib.mdl, which leaves a blood trail) from the victim. When the victim is a player, the chunk is not thrown: the same
// spot bleeds instead, with the game's own blood particles (colour 73, the same call SpawnBlood makes), moving the way the chunk
// would have. A monster hitting a monster still throws its chunk, and a death that gibs the player is untouched (that is
// ThrowGib, not SpawnMeatSpray). Nothing in the rules changes: the spray only ever was a picture.

import { sv } from './server.js';
import { R_NewerGame } from './r_anim.js';
import { pr_functions, pr_global_struct, pr_globals_float, PR_GetString, PROG_TO_EDICT } from './progs.js';
import { OFS_PARM0, OFS_PARM1 } from './pr_comp.js';
import { ED_FindFunction } from './pr_edict.js';
import { SV_StartParticle } from './sv_main.js';

export const BLOOD = Object.freeze( { color: 73, count: 24 } );

let program = null, fnSpray = null, fnNull = null;
export const meleeStats = { bled: 0 }; // (for tests: sprays turned to blood)

// QuakeC function hook (pr_exec.js): returns { skip } to run SUB_Null in SpawnMeatSpray's place, or null
export function SV_MeleeSprayEnter( f ) {

	if ( sv.active !== true ) return null;
	if ( program !== pr_functions ) { program = pr_functions; fnSpray = ED_FindFunction( 'SpawnMeatSpray' ); fnNull = ED_FindFunction( 'SUB_Null' ); }
	if ( f !== fnSpray || fnNull == null || ! R_NewerGame() ) return null;
	const attacker = PROG_TO_EDICT( pr_global_struct.self ), victim = attacker ? PROG_TO_EDICT( attacker.v.enemy ) : null;
	if ( ! victim || victim.free || PR_GetString( victim.v.classname ) !== 'player' ) return null;
	const org = [ pr_globals_float[ OFS_PARM0 ], pr_globals_float[ OFS_PARM0 + 1 ], pr_globals_float[ OFS_PARM0 + 2 ] ];
	const vel = [ pr_globals_float[ OFS_PARM1 ], pr_globals_float[ OFS_PARM1 + 1 ], pr_globals_float[ OFS_PARM1 + 2 ] ];
	SV_StartParticle( org, vel.map( v => v * .1 ), BLOOD.color, BLOOD.count );
	meleeStats.bled ++;
	return { skip: fnNull.first_statement - 1 };

}
