// Installs the engine callbacks the physics module expects, as sv_main's SV_SpawnServer does at every map load.
// The port injects these to avoid import cycles; an isolated world test must supply the same set or SV_movestep
// fails on a missing EDICT_TO_PROG/NEXT_EDICT. PF_changeyaw has no standalone engine export here, so a no-op is
// installed for the tests that do not exercise monster turning.
import { SV_SetCallbacks } from '../../src/engine/server/sv_phys.js';
import { SV_Move_SetCallbacks } from '../../src/engine/server/sv_move.js';
import { EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, G_FLOAT, G_FLOAT_SET } from '../../src/engine/progs/progs.js';
import { GetEdictFieldValue } from '../../src/engine/progs/pr_edict.js';
import { SV_StartSound, SV_StartParticle } from '../../src/engine/server/sv_main.js';
import { sv as serverSv } from '../../src/engine/server/server.js';

export function installServerCallbacks( world ) {

	SV_SetCallbacks( {
		SV_Move: world.SV_Move,
		SV_TestEntityPosition: world.SV_TestEntityPosition,
		SV_LinkEdict: world.SV_LinkEdict,
		SV_PointContents: world.SV_PointContents,
		PR_ExecuteProgram: world.PR_ExecuteProgram,
		EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, GetEdictFieldValue, SV_StartSound, SV_StartParticle
	} );
	SV_Move_SetCallbacks( { PF_changeyaw: () => {}, G_FLOAT, G_FLOAT_SET } );
	// the engine's SV_SpawnServer initialises the per-frame message buffers; sounds and effects write to them, so an
	// isolated world test that installs the real SV_StartSound must do the same.
	for ( const [ buffer, bytes ] of [ [ 'datagram', 'datagram_buf' ], [ 'reliable_datagram', 'reliable_datagram_buf' ] ] )
		if ( serverSv[ buffer ] && serverSv[ bytes ] && ! serverSv[ buffer ].data ) {

			serverSv[ buffer ].data = serverSv[ bytes ];
			serverSv[ buffer ].maxsize = serverSv[ bytes ].length;
			serverSv[ buffer ].cursize = 0;
			serverSv[ buffer ].allowoverflow = true;

		}

}
