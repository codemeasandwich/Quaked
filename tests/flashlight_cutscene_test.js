// The flashlight is out during intermissions and cutscenes (owner report, 11 Oct 2026, card [END2]): the last level's
// ending (svc_finale) showed the beam over the scene of Shub-Niggurath blowing up, and the mission packs' end scenes
// (svc_cutscene) and every end-of-level view (svc_intermission) are the same. The switch is left as it is, and the
// beam is back once play resumes. Through the public interface: R_FlashlightUpdate and R_FlashlightBeam, with the
// client state cl_parse.js sets from those messages.
import { cvar_t, Cvar_RegisterVariable, Cvar_FindVar, Cvar_SetValue } from '../src/engine/common/cvar.js';
import { cl } from '../src/engine/client/client.js';
import { R_AnimSetLighting, R_AnimSetClassicPass } from '../src/newer/mode.js';
import { r_flashlight, R_FlashlightUpdate, R_FlashlightBeam } from '../src/newer/render/r_flashlight.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( new cvar_t( 'r_hdr', '1' ) );
if ( ! Cvar_FindVar( 'r_flashlight' ) ) Cvar_RegisterVariable( r_flashlight );

Deno.test( 'the flashlight is out during the end-of-level view, the finale and a cutscene, and back after; its switch untouched', () => {

	Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false ); R_AnimSetLighting( true ); Cvar_SetValue( 'r_flashlight', 1 );
	const view = () => R_FlashlightUpdate( [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ] );
	const was = cl.intermission;
	try {

		cl.intermission = 0; view();
		check( R_FlashlightBeam().on, 'in play: the beam is on' );
		for ( const [ state, name ] of [ [ 1, 'the end-of-level view (svc_intermission)' ], [ 2, 'the finale (svc_finale: Shub-Niggurath\'s death)' ], [ 3, 'a cutscene (svc_cutscene: the mission packs\' end scenes)' ] ] ) {

			cl.intermission = state; view();
			check( ! R_FlashlightBeam().on, `${name}: the beam is out` );
			check( r_flashlight.value === 1, `${name}: the switch is left on` );

		}
		cl.intermission = 0; view();
		check( R_FlashlightBeam().on, 'play again: the beam is back' );

	} finally { cl.intermission = was; Cvar_SetValue( 'r_flashlight', 0 ); R_AnimSetLighting( false ); }

} );
