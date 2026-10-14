// What the add-on effects for every game must leave alone (card T-3faa98e3, the owner's rules of 13 Oct 2026;
// docs/addon-effects-integration-2026-10-13.md): the shotgun and the lightning gun are excluded entirely, and every
// landed enhancement keeps its behaviour. This fixes, in one place, the lines the new effects may not cross: the
// client's handling of a gunshot and of the lightning bolts is word for word what it was, none of the new effects'
// modules reaches into the excluded weapons' modules, and the Shambler's shudder is the same with the explosion shake
// beside it. Each new effect adds its module to NEW_MODULES below.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { V_ShamblerStepShake } from '../src/newer/render/v_shamblersteps.js';
import { V_BlastShake, V_BlastShakeEvent } from '../src/newer/render/v_blastshake.js';
import { V_CalcRefdef, V_Init } from '../src/engine/client/view.js';
import { r_refdef } from '../src/engine/render/render.js';
import { cl, cls, cl_entities, ca_connected, SIGNONS } from '../src/engine/client/client.js';
import { sv } from '../src/engine/server/server.js';
import { STAT_HEALTH } from '../src/engine/common/quakedef.js';
import { key_game, set_key_dest } from '../src/engine/client/keys.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { r_lerpmodels } from '../src/newer/render/r_anim.js';
import { R_AnimSetNewer, R_AnimSetClassicPass } from '../src/newer/mode.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_Set } from '../src/engine/common/cvar.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ), 'utf8' );
const sha = text => createHash( 'sha256' ).update( text ).digest( 'hex' );

// the modules the add-on effects have added
const NEW_MODULES = [ 'src/newer/render/v_blastshake.js', 'src/newer/render/r_motes.js', 'src/newer/render/fx_world.js', 'src/newer/render/r_ambientplaces.js', 'src/newer/render/r_drips.js', 'src/newer/render/r_sparks.js', 'src/newer/render/r_nailhits.js', 'src/newer/render/r_embers.js', 'src/newer/render/gib_rest.js', 'src/newer/sound/s_gibs.js', 'src/newer/sound/s_lava.js', 'src/newer/sound/s_synth.js', 'src/newer/render/r_itemturn.js', 'src/newer/render/r_mapliquids.js', 'src/newer/render/r_storm.js', 'src/newer/sound/s_impacts.js', 'src/newer/sound/s_material.js', 'src/newer/sound/s_surfacesounds.js', 'src/newer/sound/s_footsteps.js', 'src/newer/ui/r_controller.js', 'src/newer/ui/r_wheelicons.js' ];
// the excluded weapons' own modules: the shotgun (pellets, bubbles, smoke, casings, its rays and flight), the
// lightning gun's beam, and the wall burns both leave
const EXCLUDED = [ 'r_shotgun.js', 'r_shells.js', 'r_shelltrace.js', 'r_wallburn.js', 'r_lightning.js', 'sv_shotrays.js', 'sv_shotdelay.js', 'shotgun_flight.js' ];

Deno.test( 'a gunshot and the lightning bolts are handled word for word as before the add-on effects', () => {

	const tent = read( 'src/engine/client/cl_tent.js' );
	const part = ( from, to ) => { const a = tent.indexOf( from ), b = tent.indexOf( to, a ); check( a >= 0 && b > a, 'found ' + from ); return tent.slice( a, b ); };
	// (a deliberate change to these for another card updates the value here, with that card's reason)
	same( sha( part( 'case TE_GUNSHOT:', 'case TE_EXPLOSION:' ) ), 'dd63ced89e83deffaec4eb4c7ac5fee9f8bb14c298195482ea2a60bd43cacd0f', 'TE_GUNSHOT: the shotgun\'s (and laser\'s) impact' );
	same( sha( part( 'case TE_LIGHTNING1:', 'case TE_LAVASPLASH:' ) ), '7298c6245e542469a7999ddac653bc115c30c909c6ed49dbc992b5509620a0b3', 'TE_LIGHTNING1..3 and TE_BEAM' );
	same( sha( part( 'function CL_ParseBeam', 'export function CL_ParseTEnt' ) ), '7cfca3ad864aabba9999b490b1e6bebb432f41d75d699f232f38e6451457f7da', 'CL_ParseBeam' );
	const gunshot = part( 'case TE_GUNSHOT:', 'case TE_EXPLOSION:' );
	check( ! /V_BlastShakeEvent|R_Mote|S_Material|S_Footstep/.test( gunshot ), 'no add-on effect is called for a gunshot' );

} );

Deno.test( 'no add-on effect module reaches into the shotgun\'s, the casings\', the wall burn\'s or the lightning gun\'s', () => {

	for ( const path of NEW_MODULES ) {

		const source = read( path );
		for ( const name of EXCLUDED ) check( ! new RegExp( `from '[^']*/${name.replace( '.', '\\.' )}'` ).test( source ), `${path} imports ${name}` );
		check( ! /R_Shotgun|R_Shell|R_WallBurn|R_Lightning|r_shotgunfx|TE_GUNSHOT|TE_LIGHTNING/.test( source ), `${path} names an excluded weapon's effect` );

	}

} );

Deno.test( 'the Shambler\'s shudder is the same with the explosion shake beside it, and each keeps its own share of the view', () => {

	for ( const variable of [ r_hdr, r_lerpmodels ] ) if ( ! Cvar_FindVar( variable.name ) ) Cvar_RegisterVariable( variable );
	V_Init();
	const names = [ 'stand1', ...Array.from( { length: 12 }, ( _, i ) => 'walk' + ( i + 1 ) ) ];
	const shambler = { name: 'progs/shambler.mdl', cache: { data: { frames: names.map( name => ( { name } ) ) } } };
	const self = { origin: new Float32Array( 3 ), angles: new Float32Array( 3 ) }, player = [ 0, 0, 0 ];
	let clock = 500;
	const tick = () => { clock = Math.round( ( clock + 0.01 ) * 1000 ) / 1000; cl.time = clock; };
	// one walk past a heel strike (walk12 to walk1), sampled every 10 ms: the Shambler's share, the blast's share, the view
	const run = ( { blast, setting = '1' } ) => {

		Cvar_Set( 'r_hdr', '1' ); Cvar_Set( 'v_shamblersteps', '1' ); Cvar_Set( 'v_blastshake', setting ); Cvar_Set( 'r_lerpmodels', '1' ); R_AnimSetNewer( false ); R_AnimSetClassicPass( false );
		cls.state = ca_connected; cls.signon = SIGNONS; cls.demoplayback = false; set_key_dest( key_game );
		cl.worldmodel = { name: 'maps/guard.bsp' }; cl.paused = false; cl.intermission = 0; cl.stats[ STAT_HEALTH ] = 100; sv.active = false;
		cl_entities[ 0 ] = self; cl.viewentity = 0; cl.viewheight = 22; cl.onground = true;
		cl.velocity.fill( 0 ); cl.viewangles.fill( 0 ); cl.punchangle.fill( 0 );
		clock += 20; cl.time = clock; V_ShamblerStepShake( player, true ); V_BlastShake( player );
		const entity = { model: shambler, frame: names.indexOf( 'walk12' ), origin: [ 60, 0, 0 ] };
		cl_entities[ 1 ] = entity; cl.num_entities = 2;
		const samples = [];
		for ( const frame of [ 'walk12', 'walk1', 'walk2', 'walk3' ] ) {

			entity.frame = names.indexOf( frame );
			if ( frame === 'walk1' && blast ) V_BlastShakeEvent( [ 0, 40, 0 ] );
			for ( let i = 0; i < 10; i ++ ) {

				tick(); V_CalcRefdef();
				const view = [ r_refdef.vieworg[ 2 ], r_refdef.viewangles[ 0 ], r_refdef.viewangles[ 2 ] ];
				// (asked again in the same frame: both give the same answer for the same moment)
				samples.push( { view, step: Array.from( V_ShamblerStepShake( player, true ) ), blast: Array.from( V_BlastShake( player ) ) } );

			}

		}
		return samples;

	};
	const alone = run( { blast: false } ), off = run( { blast: true, setting: '0' } ), both = run( { blast: true } );
	const still = alone[ 0 ].view;
	check( alone.some( s => s.step[ 0 ] !== 0 ), 'the Shambler shakes the view' );
	check( both.some( s => s.blast[ 0 ] !== 0 ), 'and so does the explosion' );
	for ( let i = 0; i < alone.length; i ++ ) {

		for ( let k = 0; k < 3; k ++ ) {

			// (each run has its own clock, so the same moment differs by a rounding of its time: 1e-9 is that, not a change)
			check( Math.abs( both[ i ].step[ k ] - alone[ i ].step[ k ] ) < 1e-9, `sample ${i}: the Shambler's share is the same with an explosion shaking too: ${both[ i ].step[ k ]} ${alone[ i ].step[ k ]}` );
			check( Math.abs( off[ i ].step[ k ] - alone[ i ].step[ k ] ) < 1e-9, `sample ${i}: and with the explosion shake switched off` );
			check( Math.abs( off[ i ].view[ k ] - alone[ i ].view[ k ] ) < 1e-6, `sample ${i}: with the explosion shake off the view is the Shambler's alone` );
			check( Math.abs( alone[ i ].view[ k ] - ( still[ k ] + alone[ i ].step[ k ] ) ) < 1e-4, `sample ${i}: without an explosion the view is the still view and the Shambler's share, nothing else` );
			check( Math.abs( both[ i ].view[ k ] - ( still[ k ] + both[ i ].step[ k ] + both[ i ].blast[ k ] ) ) < 1e-4, `sample ${i}: with one, the two shares add` );

		}

	}

} );
