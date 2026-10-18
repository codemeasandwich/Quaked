// The view's shake at a nearby explosion (src/newer/render/v_blastshake.js; docs/blast-shake-2026-10-13.md, card
// T-3faa98e3 item 3), through its two public entry points, through the client's real explosion parser (CL_ParseTEnt)
// and through the real view path (V_CalcRefdef). Client, server, key and cvar state are the real module singletons.
import { readFileSync } from './helpers/resource_fs.mjs';
import { V_BlastShake, V_BlastShakeEvent, v_blastshake, BLAST_ROCKET, BLAST_SPAWN, BLAST_ERUPTION } from '../src/newer/render/v_blastshake.js';
import { V_CalcRefdef, V_Init, V_RenderView } from '../src/engine/client/view.js';
import { r_refdef } from '../src/engine/render/render.js';
import { cl, cls, cl_entities, ca_connected, SIGNONS } from '../src/engine/client/client.js';
import { sv } from '../src/engine/server/server.js';
import { STAT_HEALTH } from '../src/engine/common/quakedef.js';
import { key_game, key_console, key_menu, set_key_dest } from '../src/engine/client/keys.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_Set } from '../src/engine/common/cvar.js';
import { Con_SetForcedup } from '../src/engine/common/console.js';
import { COM_SetNetMessage, MSG_BeginReading } from '../src/engine/common/common.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const near = ( a, b, message, epsilon = 1e-9 ) => check( Math.abs( a - b ) < epsilon, `${message}: ${a} != ${b}` );
const LIMITS = [ 2.4, 1.1, 0.7 ], SPEED = 2600;
if ( ! Cvar_FindVar( r_hdr.name ) ) Cvar_RegisterVariable( r_hdr );
V_Init(); // registers v_blastshake the way the game does

const player = [ 0, 0, 0 ];
let clock = 100;
const tick = ( seconds = 0.01 ) => { clock = Math.round( ( clock + seconds ) * 1000 ) / 1000; cl.time = clock; };

// A connected, live, unpaused Newer Game with nothing shaking.
function fixture( { newer = '1', setting = '1' } = {} ) {

	Cvar_Set( 'r_hdr', newer ); Cvar_Set( 'v_blastshake', setting ); R_AnimSetClassicPass( false );
	cls.state = ca_connected; cls.signon = SIGNONS; cls.demoplayback = false; set_key_dest( key_game );
	cl.worldmodel = { name: 'maps/test.bsp' }; cl.paused = false; cl.intermission = 0; cl.stats[ STAT_HEALTH ] = 100;
	sv.active = false; tick( 10 );
	V_BlastShake( player ); // a new world: nothing from an earlier test is felt

}

// the shake sampled every 10 ms for `seconds`, as [ time since the blast, [ z, pitch, roll ] ]
function feel( seconds, sample = () => Array.from( V_BlastShake( player ) ) ) {

	const start = clock, samples = [];
	for ( let i = 0; i < Math.round( seconds * 100 ); i ++ ) { tick(); samples.push( [ Math.round( ( clock - start ) * 1000 ) / 1000, sample() ] ); }
	return samples;

}
const peak = ( samples, axis = 0 ) => Math.max( 0, ...samples.map( s => Math.abs( s[ 1 ][ axis ] ) ) );
const first = samples => samples.find( s => s[ 1 ].some( v => v !== 0 ) )?.[ 0 ];
const last = samples => samples.filter( s => s[ 1 ].some( v => v !== 0 ) ).pop()?.[ 0 ];
const blast = ( distance, kind = BLAST_ROCKET, seconds = 2 ) => { fixture(); V_BlastShakeEvent( [ distance, 0, 0 ], kind ); return feel( seconds ); };

Deno.test( 'a rocket going off beside the player shakes the eye at once, down first, and is over in under half a second', () => {

	const samples = blast( 0 );
	near( samples[ 0 ][ 0 ], 0.01, 'felt in the first frame' );
	check( samples[ 0 ][ 1 ][ 0 ] < 0, 'the eye drops first' );
	fixture(); V_BlastShakeEvent( [ 0, 0, 0 ] );
	const impact = Array.from( V_BlastShake( player ) ); // the moment it arrives: the whole of it
	near( impact[ 0 ], - LIMITS[ 0 ], 'the eye drops its most' ); near( Math.abs( impact[ 1 ] ), LIMITS[ 1 ], 'pitches its most' ); near( Math.abs( impact[ 2 ] ), LIMITS[ 2 ], 'rolls its most' );
	check( last( samples ) < BLAST_ROCKET.duration + 0.011, 'over after its duration: ' + last( samples ) );
	check( samples.every( s => s[ 1 ].every( ( v, i ) => Math.abs( v ) <= LIMITS[ i ] ) ), 'never past the limits' );

} );

Deno.test( 'it is weaker with the square of the distance, arrives with the blast, and is not felt past its reach', () => {

	const at = distance => blast( distance );
	near( first( at( 500 ) ), Math.ceil( 500 / SPEED * 100 ) / 100, 'the blast from 500 units arrives 0.2 s after its flash' );
	const strength = distance => peak( at( distance ) ) / peak( at( 0 ) );
	// the first sample is 10 ms (or less) into the shake, so the measured peak is a little under the designed one
	for ( const distance of [ 160, 320, 480 ] ) check( Math.abs( strength( distance ) - ( 1 - distance / 640 ) ** 2 ) < 0.06, `strength at ${distance}: ${strength( distance )}` );
	check( peak( at( 640 ) ) === 0 && peak( at( 2000 ) ) === 0, 'nothing at or past 640 units' );

} );

Deno.test( 'a Spawn bursting is smaller; Chthon rising is felt across the cave and for longer', () => {

	check( peak( blast( 100, BLAST_SPAWN ) ) < peak( blast( 100 ) ), 'a Spawn\'s burst shakes less than a rocket\'s' );
	check( peak( blast( 600, BLAST_SPAWN ) ) === 0, 'and not from 600 units' );
	const eruption = blast( 900, BLAST_ERUPTION, 3 );
	check( peak( eruption ) > 0.3, 'Chthon rising 900 units away is felt: ' + peak( eruption ) );
	check( last( eruption ) - first( eruption ) > 1, 'for over a second: ' + first( eruption ) + '..' + last( eruption ) );

} );

Deno.test( 'many explosions at once stay within the limits; the setting scales it and 0 switches it off', () => {

	fixture();
	for ( let i = 0; i < 40; i ++ ) V_BlastShakeEvent( [ 10, 0, 0 ] ); // every one the same way
	const many = feel( 1 );
	check( many.every( s => s[ 1 ].every( ( v, i ) => Math.abs( v ) <= LIMITS[ i ] + 1e-12 ) ), 'forty rockets together are held to the limits' );
	near( peak( many ), LIMITS[ 0 ], 'at the limit' );
	const withSetting = setting => { fixture( { setting } ); V_BlastShakeEvent( [ 0, 0, 0 ] ); return peak( feel( 1 ) ); };
	near( withSetting( '0.5' ), withSetting( '1' ) / 2, 'v_blastshake 0.5 halves it' );
	near( withSetting( '3' ), withSetting( '1' ), 'above 1 is 1' );
	check( withSetting( '0' ) === 0, 'v_blastshake 0: none' );
	fixture( { setting: '0' } ); V_BlastShakeEvent( [ 0, 0, 0 ] ); Cvar_Set( 'v_blastshake', '1' );
	check( peak( feel( 1 ) ) === 0, 'an explosion while it was off is not felt when it is switched on' );

} );

Deno.test( 'New Game, demos, pauses, menus, death and a new map are never shaken', () => {

	fixture( { newer: '0' } ); V_BlastShakeEvent( [ 0, 0, 0 ] );
	check( peak( feel( 1 ) ) === 0, 'New Game: none' );
	Cvar_Set( 'r_hdr', '1' ); check( peak( feel( 1 ) ) === 0, 'and none kept from New Game for Newer Game' );
	const gates = {
		'a demo': () => { cls.demoplayback = true; },
		'a client pause': () => { cl.paused = true; },
		'a server pause': () => { sv.active = true; sv.paused = true; },
		'a dead player': () => { cl.stats[ STAT_HEALTH ] = 0; },
		'intermission': () => { cl.intermission = 1; },
		'the console': () => set_key_dest( key_console ),
		'a menu': () => set_key_dest( key_menu ),
		'a missing world': () => { cl.worldmodel = null; },
		'an incomplete signon': () => { cls.signon = SIGNONS - 1; },
		'the classic half of the title demo': () => R_AnimSetClassicPass( true ),
	};
	for ( const [ name, gate ] of Object.entries( gates ) ) {

		fixture(); V_BlastShakeEvent( [ 0, 0, 0 ] ); gate();
		const felt = peak( feel( 0.2 ) );
		sv.paused = false; sv.active = false; R_AnimSetClassicPass( false );
		check( felt === 0, 'no shake for ' + name );

	}
	fixture(); V_BlastShakeEvent( [ 0, 0, 0 ] ); tick(); check( V_BlastShake( player )[ 0 ] !== 0, 'shaking' );
	cl.worldmodel = { name: 'maps/next.bsp' }; check( peak( feel( 0.3 ) ) === 0, 'a new map forgets it' );
	fixture(); V_BlastShakeEvent( [ 0, 0, 0 ] ); tick( 0.05 ); V_BlastShake( player );
	cl.time = clock - 0.005; check( V_BlastShake( player )[ 0 ] !== 0, 'a 5 ms step back in the predicted clock keeps it' );
	cl.time = clock - 5; check( V_BlastShake( player ).every( v => v === 0 ), 'a restart (time going back) forgets it' );

} );

Deno.test( 'the client\'s explosion parser starts it, and V_CalcRefdef moves the eye and the weapon together, tilting only the eye', async () => {

	const tent = await import( '../src/engine/client/cl_tent.js' ), main = await import( '../src/engine/render/gl_rmain.js' ), part = await import( '../src/engine/render/r_part.js' );
	const { COM_LoadPackFile, COM_AddPack, COM_FindFile } = await import( '../src/engine/common/pak.js' ), { VID_SetPalette } = await import( '../src/engine/render/vid.js' );
	const pak = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.byteLength ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data );
	main.R_Init(); tent.CL_InitTEnts(); part.R_SetParticleExternals( { scene: main.scene } );
	// svc_temp_entity's body: the kind, then the place as three 13.3 fixed-point coordinates (and two colour bytes for 12)
	const send = ( kind, pos, extra = [] ) => {

		const data = new Uint8Array( 7 + extra.length ), view = new DataView( data.buffer );
		data[ 0 ] = kind; for ( let i = 0; i < 3; i ++ ) view.setInt16( 1 + i * 2, pos[ i ] * 8, true );
		extra.forEach( ( b, i ) => { data[ 7 + i ] = b; } );
		COM_SetNetMessage( { data, cursize: data.length, maxsize: data.length } ); MSG_BeginReading(); tent.CL_ParseTEnt();

	};
	const felt = ( kind, pos, extra ) => { fixture(); send( kind, pos, extra ); return peak( feel( 2 ) ); };
	const rocket = felt( 3, [ 64, 0, 0 ] );
	check( rocket > 1, 'TE_EXPLOSION (a rocket or grenade) shakes: ' + rocket );
	near( felt( 12, [ 64, 0, 0 ], [ 230, 5 ] ), rocket, 'TE_EXPLOSION2 (coloured, the mission packs) the same' );
	const spawn = felt( 4, [ 64, 0, 0 ] ); check( spawn > 0.5 && spawn < rocket, 'TE_TAREXPLOSION (a Spawn) less: ' + spawn );
	check( felt( 10, [ 1200, 0, 0 ] ) > 0.05, 'TE_LAVASPLASH (Chthon) is felt from 1200 units' );
	check( felt( 2, [ 16, 0, 0 ] ) === 0 && felt( 0, [ 16, 0, 0 ] ) === 0, 'a gunshot or a nail hitting the wall does not' );

	fixture();
	const self = { origin: new Float32Array( [ 0, 0, 0 ] ), angles: new Float32Array( 3 ) };
	cl_entities[ 0 ] = self; cl.viewentity = 0; cl.viewheight = 22; cl.onground = true; cl.num_entities = 1;
	cl.velocity.fill( 0 ); cl.viewangles.fill( 0 ); cl.punchangle.fill( 0 );
	const view = () => { V_CalcRefdef(); return [ r_refdef.vieworg[ 2 ], cl.viewent.origin[ 2 ], r_refdef.viewangles[ 0 ], r_refdef.viewangles[ 2 ], cl.viewent.angles[ 0 ], cl.viewent.angles[ 2 ] ]; };
	tick(); const still = view();
	send( 3, [ 0, 0, 0 ] );
	const shaken = feel( 0.3, view ).map( s => s[ 1 ] );
	const moved = i => Math.max( ...shaken.map( s => Math.abs( s[ i ] - still[ i ] ) ) );
	check( moved( 0 ) > 1.5, 'the eye moves: ' + moved( 0 ) );
	check( shaken.every( s => Math.abs( ( s[ 0 ] - still[ 0 ] ) - ( s[ 1 ] - still[ 1 ] ) ) < 1e-4 ), 'the weapon moves with the eye' );
	check( moved( 2 ) > 0.5 && moved( 3 ) > 0.3, 'the eye pitches and rolls' );
	check( moved( 4 ) < 1e-5 && moved( 5 ) < 1e-5, 'the weapon\'s angles are untouched' );
	check( cl.viewangles.every( v => v === 0 ) && self.origin.every( v => v === 0 ), 'aim and the player\'s place are untouched' );
	Cvar_Set( 'r_hdr', '0' ); tick();
	const classic = view();
	check( classic.every( ( v, i ) => Math.abs( v - still[ i ] ) < 1e-5 ), 'New Game\'s view is the unshaken view' );
	Cvar_Set( 'r_hdr', '1' );

} );


Deno.test( 'new explosions work immediately after a restart or map clock reset', () => {
 for ( const newMap of [ false, true ] ) {
  fixture(); clock = 1000; cl.time = clock; V_BlastShake( player );
  clock = 1; cl.time = clock;
  if ( newMap ) cl.worldmodel = { name: 'maps/new-clock.bsp' };
  check( V_BlastShake( player ).every( v => v === 0 ), 'reset has no stale shake' );
  V_BlastShakeEvent( [ 0, 0, 0 ] ); tick();
  check( V_BlastShake( player ).some( v => v !== 0 ), 'new blast after ' + ( newMap ? 'map change' : 'restart' ) );
 }
} );

Deno.test( 'the actual render entry clears queued blasts when pause or intermission skips refdef', () => {
 Con_SetForcedup( false );
 for ( const gate of [ 'paused', 'intermission' ] ) {
  fixture(); cl.viewentity = 0; cl_entities[ 0 ] = { origin: new Float32Array( 3 ), angles: new Float32Array( 3 ) };
  V_BlastShakeEvent( [ 0, 0, 0 ] ); check( V_BlastShake( player )[ 0 ] !== 0, 'blast starts' );
  cl[ gate ] = 1; V_RenderView(); cl[ gate ] = 0;
  check( V_BlastShake( player ).every( v => v === 0 ), gate + ' does not replay its queued blast on return' );
  V_BlastShakeEvent( [ 0, 0, 0 ] ); check( V_BlastShake( player )[ 0 ] !== 0, 'a fresh blast still works' );
 }
} );
