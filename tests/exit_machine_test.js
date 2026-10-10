// Native E1M1 signon sound -> public client static-sound parser -> real channel
// spatializer/mixer. Only Web Audio output nodes are silent endpoint doubles.
import { readFileSync } from 'node:fs';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/progs/pr_cmds.js';
import { sv, svs, client_t } from '../src/engine/server/server.js';
import { SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { SV_Move, MOVE_NOMONSTERS } from '../src/engine/server/world.js';
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { skill } from '../src/engine/server/host.js';
import { sv_gravity } from '../src/engine/server/sv_phys.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import * as sound from '../src/engine/sound/sound.js';
import * as mode from '../src/newer/mode.js';
import { cl } from '../src/engine/client/client.js';
import { CL_ParseStaticSound } from '../src/engine/client/cl_parse.js';
import * as common from '../src/engine/common/common.js';
import { svc_spawnstaticsound } from '../src/engine/common/protocol.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} !== ${b}` );
const pack = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.byteLength ) ) );
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); Cbuf_Init();
for ( const variable of [ r_hdr, skill, sv_gravity ] ) if ( ! vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'skill', 1 ); svs.maxclients = 1; svs.clients = [ new client_t() ]; sv.active = false; SV_SpawnServer( 'e1m1' );

class Context {

	constructor() { this.destination = {}; this.sampleRate = 22050; this.state = 'running'; this.nodes = []; }
	node( kind ) { const node = { kind, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( node ); return node; }
	createGain() { return Object.assign( this.node( 'gain' ), { gain: { value: 1 } } ); }
	createStereoPanner() { return Object.assign( this.node( 'pan' ), { pan: { value: 0 } } ); }
	createBufferSource() { return Object.assign( this.node( 'source' ), { start() { this.started = true; }, stop() { this.stopped = true; } } ); }
	createBuffer( channels, length, sampleRate ) { const data = Array.from( { length: channels }, () => new Float32Array( length ) ); return { sampleRate, getChannelData: index => data[ index ] }; }
	close() { this.state = 'closed'; return Promise.resolve(); }

}
function fixture( fn ) {

	const saved = { window: Object.getOwnPropertyDescriptor( globalThis, 'window' ), world: cl.worldmodel, message: common.net_message, hdr: r_hdr.string, viewentity: cl.viewentity };
	try {

		Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } ); dma.S_Init(); dma.S_AmbientOff(); vars.Cvar_SetValue( 'volume', .4 ); vars.Cvar_SetValue( 'r_hdr', 1 ); mode.R_AnimSetClassicPass( false ); cl.worldmodel = sv.worldmodel; cl.viewentity = 1;
		const index = sv.sound_precache.indexOf( 'ambience/drone6.wav' ); check( index > 0, 'real native QC precached exit machine loop' );
		const signature = new Uint8Array( 8 ), signatureView = new DataView( signature.buffer ); signature[ 0 ] = svc_spawnstaticsound; [ 1314, 450, -200 ].forEach( ( value, i ) => signatureView.setInt16( 1 + i * 2, value * 8, true ) ); signature[ 7 ] = index;
		const matches = []; for ( let i = 0; i <= sv.signon.cursize - 10; i ++ ) if ( signature.every( ( value, j ) => value === sv.signon.data[ i + j ] ) ) matches.push( i );
		same( matches.length, 1, 'exact source emitted once by shipped native E1M1 program' );
		const offset = matches[ 0 ], payload = sv.signon.data.slice( offset + 1, offset + 10 );
		cl.sound_precache[ index ] = dma.S_PrecacheSound( 'ambience/drone6.wav' ); check( cl.sound_precache[ index ]?.cache?.loopstart >= 0, 'actual native WAV loads as a loop' );
		const first = sound.total_channels; common.COM_SetNetMessage( { data: payload, cursize: payload.length } ); common.MSG_BeginReading(); CL_ParseStaticSound(); same( sound.total_channels, first + 1, 'public native message creates exactly one static channel' );
		const channel = sound.channels[ first ]; same( channel.entnum, -1, 'native static source class' ); same( Array.from( channel.origin ).join(), '1314,450,-200', 'actual emitted position retained' );
		fn( channel, { volumeByte: payload[ 7 ], attenuationByte: payload[ 8 ] } );

	} finally { dma.S_StopAllSounds( true ); dma.S_AmbientOn(); dma.S_Shutdown(); mode.R_AnimSetClassicPass( false ); cl.worldmodel = saved.world; cl.viewentity = saved.viewentity; common.COM_SetNetMessage( saved.message ); vars.Cvar_Set( 'r_hdr', saved.hdr ); if ( saved.window ) Object.defineProperty( globalThis, 'window', saved.window ); else delete globalThis.window; }

}
function spatial( channel, eye, right = [ 1, 0, 0 ] ) { sound.listener_origin.set( eye ); sound.listener_right.set( right ); dma.SND_Spatialize( channel ); return [ channel.leftvol, channel.rightvol ]; }
function stock( channel, eye, right ) {

	if ( channel.entnum === cl.viewentity ) return [ channel.master_vol, channel.master_vol ];
	const direction = Array.from( channel.origin, ( value, i ) => value - eye[ i ] ), distance = Math.hypot( ...direction ), pan = distance ? direction.reduce( ( sum, value, i ) => sum + value / distance * right[ i ], 0 ) : 0;
	return [ -1, 1 ].map( side => Math.max( 0, Math.floor( channel.master_vol * ( 1 - distance * channel.dist_mult ) * ( 1 + side * pan ) ) ) );

}

Deno.test( 'actual native exit-drone channel becomes subtly audible at the BSP ramp bottom and rises along its real floor geometry', () => fixture( ( channel, message ) => {

	const rows = [];
	for ( const y of [ 1248, 1216, 1184, 1152, 1120 ] ) {

		const expected = -344 + ( 1248 - y ) / 2;
		const trace = SV_Move( [ 1312, y, expected + 50 ], [ 0, 0, 0 ], [ 0, 0, 0 ], [ 1312, y, -500 ], MOVE_NOMONSTERS, null );
		check( ! trace.startsolid && trace.fraction < 1 && trace.plane.normal[ 2 ] > .6, 'native ramp has a real walkable hit: ' + JSON.stringify( { y, startsolid: trace.startsolid, fraction: trace.fraction, end: Array.from( trace.endpos ), normal: Array.from( trace.plane.normal ) } ) );
		check( Math.abs( trace.endpos[ 2 ] - expected ) < .1, 'actual BSP ramp floor, not invented listener altitude' );
		const eye = [ 1312, y, trace.endpos[ 2 ] + 24 + 22 ], volumes = spatial( channel, eye ); rows.push( { y, floor: trace.endpos[ 2 ], eye, volumes } );
	}
	check( rows[ 0 ].volumes.every( value => value > 0 && value / channel.master_vol < .1 ), 'bottom is audible but quieter than10percent native source gain' );
	for ( let i = 1; i < rows.length; i ++ ) check( rows[ i ].volumes[ 0 ] > rows[ i - 1 ].volumes[ 0 ] && rows[ i ].volumes[ 1 ] > rows[ i - 1 ].volumes[ 1 ], 'both ears grow smoothly while climbing toward machine' );
	const approach = spatial( channel, [ 1312, 800, -234 ] ); check( approach.every( ( value, i ) => value > rows.at( -1 ).volumes[ i ] ), 'continuing toward machine gets louder' );
	const outside = spatial( channel, [ 1314, 1400, -200 ] ); same( outside.join(), '0,0', 'extended range has no hard audible step at outer boundary' );
	console.log( 'NATIVE_EXIT_MACHINE_APPROACH ' + JSON.stringify( { message, channelVolume: channel.master_vol, stockDistanceMultiplier: channel.dist_mult, ramp: rows, approach } ) );

} ) );

Deno.test( 'Classic, other maps, sounds, source positions and dynamic channels retain exact stock attenuation and stereo panning', () => fixture( channel => {

	const eye = [ 1250, 850, -220 ], right = [ 1, 0, 0 ], variants = [
		{ label: 'Classic game', apply() { vars.Cvar_SetValue( 'r_hdr', 0 ); } },
		{ label: 'Classic comparison draw', apply() { mode.R_AnimSetClassicPass( true ); } },
		{ label: 'different map', apply() { cl.worldmodel = { ...sv.worldmodel, name: 'maps/e1m2.bsp' }; } },
		{ label: 'different native loop', apply( copy ) { copy.sfx = { ...channel.sfx, name: 'ambience/comp1.wav' }; } },
		{ label: 'different origin', apply( copy ) { copy.origin[ 0 ] += 10; } },
		{ label: 'dynamic channel', apply( copy ) { copy.entnum = 2; } }
	];
	for ( const variant of variants ) {

		vars.Cvar_SetValue( 'r_hdr', 1 ); mode.R_AnimSetClassicPass( false ); cl.worldmodel = sv.worldmodel;
		const copy = new sound.channel_t(); copy.sfx = channel.sfx; copy.origin.set( channel.origin ); copy.master_vol = channel.master_vol; copy.dist_mult = channel.dist_mult; copy.entnum = channel.entnum; variant.apply( copy );
		same( spatial( copy, eye, right ).join(), stock( copy, eye, right ).join(), variant.label + ' uses original equation' );
	}
	vars.Cvar_SetValue( 'r_hdr', 1 ); mode.R_AnimSetClassicPass( false ); cl.worldmodel = sv.worldmodel;
	const left = spatial( channel, eye, right ), reversed = spatial( channel, eye, [ -1, 0, 0 ] ); same( left[ 0 ], reversed[ 1 ], 'turning swaps left pan correctly' ); same( left[ 1 ], reversed[ 0 ], 'turning swaps right pan correctly' ); check( left[ 0 ] !== left[ 1 ], 'off-axis source retains audible directional panning' );

} ) );

Deno.test( 'native exit loop remains on the existing effects bus, follows master volume once and preserves channel/node identity during approach', () => fixture( channel => {

	dma.S_Update( [ 1312, 1248, -298 ], [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] );
	const source = channel._audioSource, gain = channel._gainNode, pan = channel._panNode, master = dma.S_GetMasterGain(), context = dma.S_GetAudioContext();
	check( source?.started && source.loop, 'actual decoded native sample starts as looping AudioBuffer source' ); same( source.target, gain, 'source uses existing channel gain' ); same( gain.target, pan, 'existing stereo panner used' ); same( pan.target, master, 'effect routes through existing master sound gain' ); same( master.target, context.destination, 'one master gain reaches output' );
	const baseGain = gain.gain.value;
	for ( const volume of [ 0, .5, 1 ] ) for ( const music of [ 0, 1 ] ) {

		vars.Cvar_SetValue( 'volume', volume ); vars.Cvar_SetValue( 'bgmvolume', music ); dma.S_Update( [ 1312, 1248, -298 ], [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); same( master.gain.value, volume, 'ordinary effects volume applied once at master' ); same( gain.gain.value, baseGain, 'channel gain independent of master and music sliders' ); same( channel._audioSource, source, 'adjustment does not restart native loop' );
	}
	dma.S_Update( [ 1312, 1120, -234 ], [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); check( gain.gain.value > baseGain, 'existing live channel gain rises along ramp' ); same( channel._gainNode, gain, 'existing gain node reused' ); same( channel._panNode, pan, 'existing stereo node reused' );

} ) );
