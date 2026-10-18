// Installs the engine callbacks the physics module expects, as sv_main's SV_SpawnServer does at every map load.
// The port injects these to avoid import cycles; an isolated world test must supply the same set or SV_movestep
// fails on a missing EDICT_TO_PROG/NEXT_EDICT. PF_changeyaw has no standalone engine export here, so a no-op is
// installed for the tests that do not exercise monster turning.
import { SV_SetCallbacks } from '../../src/engine/server/sv_phys.js';
import { SV_Move_SetCallbacks } from '../../src/engine/server/sv_move.js';
import { EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, G_FLOAT, G_FLOAT_SET } from '../../src/engine/progs/progs.js';
import { GetEdictFieldValue } from '../../src/engine/progs/pr_edict.js';

export function installServerCallbacks( world ) {

	SV_SetCallbacks( {
		SV_Move: world.SV_Move,
		SV_TestEntityPosition: world.SV_TestEntityPosition,
		SV_LinkEdict: world.SV_LinkEdict,
		SV_PointContents: world.SV_PointContents,
		PR_ExecuteProgram: world.PR_ExecuteProgram,
		EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, GetEdictFieldValue
	} );
	SV_Move_SetCallbacks( { PF_changeyaw: () => {}, G_FLOAT, G_FLOAT_SET } );

}
