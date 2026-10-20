// Native demo camera qualification through playback, the shared parser/linker and the rendered view calculation.
// The installed game remains read-only; no licensed bytes are fixtures or outputs of this suite.
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from './helpers/resource_fs.mjs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_PointInLeaf } from '../src/engine/render/gl_model.js';
import { R_Init } from '../src/engine/render/gl_rmain.js';
import { r_refdef } from '../src/engine/render/render.js';
import { V_Init, V_CalcRefdef } from '../src/engine/client/view.js';
import { CL_Init, CL_ReadFromServer, CL_Disconnect_f } from '../src/engine/client/cl_main.js';
import { CL_Parse_SetExternals } from '../src/engine/client/cl_parse.js';
import { CL_PlayDemoFromData } from '../src/engine/client/cl_demo.js';
import { cl, cls, cl_entities } from '../src/engine/client/client.js';
import { NET_Init } from '../src/engine/net/net_main.js';
import { Cbuf_Init, Cmd_Init } from '../src/engine/common/cmd.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { set_host_frametime } from '../src/engine/common/host_state.js';
import { SV_HullPointContents } from '../src/engine/server/world.js';
import { COM_Parse, com_token } from '../src/engine/common/common.js';
import { CONTENTS_SOLID } from '../src/engine/common/bspfile.js';
import { R_DemoLoadingCancel } from '../src/newer/ui/r_demoloading.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const BASE = '/Users/bri/quaked/Hexen 2/data1';
let initialised = false;

function initialise() {

	if ( initialised ) return;
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const raw = readFileSync( BASE + '/' + name );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'camera-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
	VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
	Mod_Init(); Cbuf_Init(); Cmd_Init(); CL_Init(); R_Init(); V_Init(); NET_Init();
	initialised = true;

}

for ( const demo of [ 'demo1', 'demo2', 'demo3' ] ) Deno.test( demo + ' native playback keeps the rendered camera inside the level and continuous', () => {

	if ( ! [ 'pak0.pak', 'pak1.pak', demo + '.dem' ].every( name => existsSync( BASE + '/' + name ) ) ) {

		console.log( 'SKIP: installed Hexen II packs/demo absent: ' + demo );
		return;

	}
	initialise();
	GameProfile_Set( 'hexen2' );
	CL_Parse_SetExternals( { Host_EndGame: message => { throw new Error( 'Host_EndGame: ' + message ); } } );
	const bytes = readFileSync( BASE + '/' + demo + '.dem' );
	const oldLog = console.log;
	const metrics = { demo, frames: 0, valid: 0, solid: 0, outside: 0, maxJump: 0, jumps: 0, teleports: 0, discontinuities: [], samples: [] };
	let previous = null, ended = false;
	const destinations = new WeakMap();
	const trace = [];
	const tracePrefix = process.env.QUAKED_DEMO_CAMERA_TRACE;
	console.log = () => {};
	try {

		CL_PlayDemoFromData( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
		set_host_frametime( 1 / 60 );
		for ( let frame = 0; frame < 60000 && cls.demoplayback; frame ++ ) {

			R_DemoLoadingCancel();
			try { CL_ReadFromServer(); }
			catch ( error ) {

				// Native files end with svc_disconnect; any other parser error still fails the test.
				if ( ! /Host_EndGame: Server disconnected/.test( error.message ) ) throw error;
				check( cls.demopos === bytes.length, 'disconnect accounts for the complete demo file' );
				ended = true;
				break;

			}
			if ( cls.signon !== 4 || ! cls.demoplayback ) continue;
			V_CalcRefdef();
			const origin = Array.from( r_refdef.vieworg );
			const world = cl.worldmodel;
			const outside = origin.some( ( v, i ) => ! Number.isFinite( v ) || v < world.mins[ i ] || v > world.maxs[ i ] );
			const contents = SV_HullPointContents( world.hulls[ 0 ], world.hulls[ 0 ].firstclipnode, origin );
			check( contents === Mod_PointInLeaf( origin, world ).contents, 'shared hull and renderer leaf agree on camera contents' );
			const solid = contents === CONTENTS_SOLID;
			metrics.frames ++;
			if ( outside ) metrics.outside ++;
			if ( solid ) metrics.solid ++;
			if ( ! outside && ! solid ) metrics.valid ++;
			if ( previous && previous.world === world ) {

				const jump = Math.hypot( ...origin.map( ( v, i ) => v - previous.origin[ i ] ) );
				metrics.maxJump = Math.max( metrics.maxJump, jump );
				if ( jump > 128 ) {

					if ( ! destinations.has( world ) ) destinations.set( world, teleportDestinations( world.entities ) );
					const serverOrigin = Array.from( cl_entities[ cl.viewentity ].msg_origins[ 0 ] );
					const teleport = destinations.get( world ).some( target => target.every( ( v, i ) => Math.abs( v - serverOrigin[ i ] ) <= 0.125 ) );
					if ( teleport ) metrics.teleports ++; else metrics.jumps ++;
					metrics.discontinuities.push( { time: cl.time, from: previous.origin, to: origin, serverOrigin, teleport } );

				}

			}
			previous = { origin, world };
			if ( tracePrefix || metrics.frames === 1 || metrics.frames % 1800 === 0 ) {

				const sample = {
					frame: metrics.frames, time: cl.time, origin, angles: Array.from( cl.viewangles ), viewheight: cl.viewheight,
					entities: [ 1, 2, 3 ].map( n => Array.from( cl_entities[ n ].origin ) )
				};
				if ( tracePrefix ) trace.push( sample );
				if ( metrics.frames === 1 || metrics.frames % 1800 === 0 ) metrics.samples.push( sample );

			}

		}
		check( ended, 'the whole demo reached its recorded disconnect within the frame bound' );

	} finally {

		console.log = oldLog;
		CL_Disconnect_f();
		GameProfile_Set( 'quake' );
		metrics.validPercent = 100 * metrics.valid / metrics.frames;
		if ( tracePrefix ) writeFileSync( tracePrefix + '-' + demo + '.json.gz', gzipSync( JSON.stringify( trace ) ) );
		console.log( 'CAMERA ' + JSON.stringify( metrics ) );

	}
	check( metrics.frames > 1000, 'measured the full rendered demo: ' + metrics.frames );
	check( metrics.validPercent >= 98, 'camera in non-solid space within world bounds: ' + metrics.validPercent.toFixed( 3 ) + '%' );
	check( metrics.teleports === ( demo === 'demo1' ? 1 : 0 ), 'only the recorded map teleport is exempted' );
	check( metrics.jumps === 0, 'no camera jumps over 128 units per 60 Hz frame: ' + metrics.jumps );

} );

// Reuse the engine's entity-text tokenizer. Only connected native teleport destinations qualify; arbitrary jumps
// remain failures. uhexen2 gamecode/hc/h2/triggers.hc:1077,1109-1117 moves to the map destination plus 27 Z.
function teleportDestinations( text ) {

	const entities = [];
	while ( text !== null ) {

		text = COM_Parse( text );
		if ( com_token !== '{' ) break;
		const entity = {};
		while ( text !== null ) {

			text = COM_Parse( text );
			if ( com_token === '}' ) break;
			const key = com_token;
			text = COM_Parse( text );
			entity[ key ] = com_token;

		}
		entities.push( entity );

	}
	return entities.filter( e => e.classname === 'info_teleport_destination' &&
		entities.some( t => t.classname === 'trigger_teleport' && t.target === e.targetname ) ).map( e => {

		const origin = e.origin.trim().split( /\s+/ ).map( Number );
		origin[ 2 ] += 27;
		return origin;

	} );

}
