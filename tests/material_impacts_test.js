// Impacts that sound like what they strike (src/newer/sound/s_impacts.js, s_material.js, s_surfacesounds.js; card
// T-3faa98e3 item 2, docs/material-sounds-2026-10-14.md): a nail's ricochet, the axe on a wall and a player landing
// bring a quiet second sound of the surface, beside the game's own sound and never instead of it; the shotgun and
// lightning gun bring none; New Game, demos and the switch off bring none. Through the public sound system, the
// client's real nail parser (CL_ParseTEnt) and e1m1's real surfaces.
import { readFileSync } from './helpers/resource_fs.mjs';
await import( '../src/newer/install.js' );
const dma = await import( '../src/engine/sound/snd_dma.js' ), sound = await import( '../src/engine/sound/sound.js' ), pak = await import( '../src/engine/common/pak.js' );
const { Mod_Init, Mod_ForName, Mod_PointInLeaf } = await import( '../src/engine/render/gl_model.js' );
const { cl, cls, cl_entities } = await import( '../src/engine/client/client.js' );
const cvar = await import( '../src/engine/common/cvar.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const { s_impacts } = await import( '../src/newer/sound/s_impacts.js' );
const { S_MaterialOfTexture, S_MaterialAt, MATERIALS } = await import( '../src/newer/sound/s_material.js' );
const { R_DecalSurface } = await import( '../src/newer/render/r_decals.js' );
const { SYNTH_Sound } = await import( '../src/newer/sound/s_synth.js' );
const { GetWavinfo } = await import( '../src/engine/sound/snd_mem.js' );
const { COM_SetNetMessage, MSG_BeginReading } = await import( '../src/engine/common/common.js' );
const tent = await import( '../src/engine/client/cl_tent.js' );
const { SV_RecursiveHullCheck, trace_t } = await import( '../src/engine/server/world.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
Mod_Init();
for ( const v of [ r_hdr, s_impacts ] ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
const node = kind => ( { kind, gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } } );
class Context {
	constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; this.sources = []; }
	createGain() { return node( 'gain' ); } createStereoPanner() { return node( 'pan' ); }
	createBuffer( c, l, r ) { return { channels: c, length: l, rate: r, data: new Float32Array( l ), getChannelData() { return this.data; } }; }
	createBufferSource() { const s = node( 'source' ); this.sources.push( s ); return s; }
	resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
}
const e1m1 = Mod_ForName( 'maps/e1m1.bsp', true );
const start = /"classname" "info_player_start"[^}]*"origin" "([^"]+)"|"origin" "([^"]+)"[^}]*"classname" "info_player_start"/.exec( e1m1.entities );
const spawn = ( start[ 1 ] ?? start[ 2 ] ).split( ' ' ).map( Number );
// walls around the start: 8 rays out at eye height; the point where each meets solid, 2 units back
function walls() {

	const hull = e1m1.hulls[ 0 ], out = [];
	for ( let k = 0; k < 16; k ++ ) {

		const a = k * Math.PI / 8, from = Float32Array.from( [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] + 16 ] ), to = Float32Array.from( [ from[ 0 ] + Math.cos( a ) * 2048, from[ 1 ] + Math.sin( a ) * 2048, from[ 2 ] ] ), t = new trace_t();
		t.fraction = 1; t.allsolid = true; t.endpos.set( to );
		SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, from, to, t );
		if ( t.fraction < 1 && ! t.startsolid ) out.push( { at: [ t.endpos[ 0 ] - Math.cos( a ) * 2, t.endpos[ 1 ] - Math.sin( a ) * 2, t.endpos[ 2 ] ], yaw: k * 22.5, dist: t.fraction * 2048 } );

	}
	return out;

}
let clock = 100;
function withSound( body ) {

	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' ), world = cl.worldmodel;
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
	try {

		dma.S_Init(); dma.S_SetCallbacks( { getHostFrametime: () => .05 } ); dma.S_StopAllSounds( true ); for ( const c of sound.channels ) c.sfx = null;
		cl.worldmodel = e1m1; cls.demoplayback = false; cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 's_impacts', '1' ); tent.CL_InitTEnts();
		body();

	} finally {

		dma.S_Shutdown(); cl.worldmodel = world; cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 's_impacts', '1' ); cls.demoplayback = false;
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}

}
const playing = () => sound.channels.map( c => c.sfx?.name ).filter( Boolean );
const clear = () => { for ( const c of sound.channels ) c.sfx = null; };
// svc_temp_entity's body: the kind, then the place
function tempEntity( kind, pos ) { const data = new Uint8Array( 7 ), v = new DataView( data.buffer ); data[ 0 ] = kind; for ( let i = 0; i < 3; i ++ ) v.setInt16( 1 + i * 2, Math.round( pos[ i ] * 8 ), true ); COM_SetNetMessage( { data, cursize: 7, maxsize: 7 } ); MSG_BeginReading(); tent.CL_ParseTEnt(); }

Deno.test( 'the material table reads what Quake\'s texture names say', () => {

	const want = { metal5_6: 'metal', tech04_1: 'metal', cop1_1: 'metal', sliplite: 'metal', wizwood1_2: 'wood', crate0_side: 'wood', bookshelf11: 'wood', rock3_8: 'stone', city4_2: 'stone', wbrick1_5: 'stone',
		ground1_5: 'ground', wswamp2_1: 'ground', sand: 'ground', window02_1: 'glass', '*04water1': 'water', '*lava1': 'water', nonesuch: 'stone' };
	for ( const [ name, m ] of Object.entries( want ) ) same( S_MaterialOfTexture( name ), m, name );
	same( MATERIALS.join(), 'stone,metal,wood,ground,glass,water', 'the materials' );

} );

Deno.test( 'every surface sound is a short, clean, distinct sound', () => {

	const seen = new Set();
	for ( const m of MATERIALS ) for ( const name of [ `quaked/hit_${m}1.wav`, `quaked/step_${m}1.wav`, `quaked/steph_${m}1.wav` ] ) {

		const w = SYNTH_Sound( name ); check( w, 'made: ' + name );
		const i = GetWavinfo( name, w, w.length ); same( i.channels, 1, name + ' mono' ); same( i.loopstart, - 1, name + ' plays once' );
		check( i.samples / i.rate < 0.6, name + ' short' );
		const pcm = new Int16Array( w.buffer.slice( i.dataofs, i.dataofs + i.samples * 2 ) ), peak = Math.max( ...Array.from( pcm, Math.abs ) ) / 32767;
		check( peak > 0.5 && peak < 0.9, name + ' audible, never clipped: ' + peak );
		seen.add( Buffer.from( w ).toString( 'base64' ).slice( 200, 400 ) );

	}
	same( seen.size, MATERIALS.length * 3, 'all different' );

} );

Deno.test( 'a nail on a wall: the game\'s own ricochet as before, and the wall\'s own sound beside it', () => withSound( () => {

	const hits = walls(); check( hits.length >= 4, 'walls round the start: ' + hits.length );
	for ( const w of hits.slice( 0, 6 ) ) {

		clear();
		// the game's random draws for the nail are the same with or without the surface's sound
		const draws = on => { cvar.Cvar_Set( 's_impacts', on ? '1' : '0' ); clear(); let n = 0; const real = Math.random; Math.random = () => { n ++; return 0.5; }; try { tempEntity( 1, w.at ); } finally { Math.random = real; } return [ n, playing().filter( s => ! s.startsWith( 'quaked/' ) ).join() ]; };
		const off = draws( false ), on = draws( true );
		same( on.join( '|' ), off.join( '|' ), 'the game\'s draws and its own sound are the same' );
		const surface = R_DecalSurface( e1m1, w.at, 8, Mod_PointInLeaf ), material = S_MaterialAt( e1m1, w.at, 8 );
		if ( surface ) same( material, S_MaterialOfTexture( surface.surf.texinfo.texture.name ), 'the material is the wall texture\'s (' + surface.surf.texinfo.texture.name + ')' );
		check( playing().some( s => s.startsWith( `quaked/hit_${material}` ) ), `the ${material} wall's sound: ` + playing() );

	}
	// every wall round the start is found, even where the point's own leaf does not list it (two of them on e1m1)
	const found = hits.filter( w => R_DecalSurface( e1m1, w.at, 8, Mod_PointInLeaf ) ).length;
	check( found < hits.length, 'some walls are not in the point\'s own leaf: ' + found + ' of ' + hits.length );
	same( hits.filter( w => S_MaterialAt( e1m1, w.at, 8 ) === 'metal' ).length, hits.length, 'and every one of e1m1\'s metal walls there is heard as metal' );

} ) );

Deno.test( 'landing on the floor and the axe on a wall bring the surface\'s sound; the shotgun and lightning gun none', () => withSound( () => {

	const me = cl.viewentity = 1, self = cl_entities[ me ] = cl_entities[ me ] ?? {}; self.origin = Float32Array.from( [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] ] ); self.angles = new Float32Array( 3 );
	clear(); dma.S_StartSound( me, 4, dma.S_PrecacheSound( 'player/land2.wav' ), self.origin, 1, 1 );
	const floor = S_MaterialAt( e1m1, [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] - 23 ], 24, ( s, sign ) => s.plane.normal[ 2 ] * sign > 0.7 );
	check( playing().includes( 'player/land2.wav' ) && playing().some( s => s.startsWith( `quaked/hit_${floor}` ) ), 'landing: its own and the floor\'s: ' + playing() );
	const w = walls().find( w => w.dist < 60 ) ?? walls()[ 0 ];
	self.origin.set( [ w.at[ 0 ] - Math.cos( w.yaw * Math.PI / 180 ) * 30, w.at[ 1 ] - Math.sin( w.yaw * Math.PI / 180 ) * 30, w.at[ 2 ] - 16 ] ); cl.viewangles.set( [ 0, w.yaw, 0 ] );
	clear(); dma.S_StartSound( me, 1, dma.S_PrecacheSound( 'player/axhit2.wav' ), self.origin, 1, 1 );
	check( playing().some( s => s.startsWith( 'quaked/hit_' ) ), 'the axe on the wall: ' + playing() );
	clear(); tempEntity( 2, w.at ); check( ! playing().some( s => s.startsWith( 'quaked/' ) ), 'TE_GUNSHOT (shotgun, axe\'s own puff, laser): none from it' );
	clear(); dma.S_StartSound( me, 1, dma.S_PrecacheSound( 'weapons/lstart.wav' ), self.origin, 1, 1 ); check( ! playing().some( s => s.startsWith( 'quaked/' ) ), 'the lightning gun: none' );

} ) );

Deno.test( 'New Game, a demo and the switch off: the game\'s own sound only', () => withSound( () => {

	const w = walls()[ 0 ];
	for ( const [ name, set, undo ] of [ [ 'New Game', () => cvar.Cvar_Set( 'r_hdr', '0' ), () => cvar.Cvar_Set( 'r_hdr', '1' ) ], [ 'a demo', () => { cls.demoplayback = true; }, () => { cls.demoplayback = false; } ], [ 's_impacts 0', () => cvar.Cvar_Set( 's_impacts', '0' ), () => cvar.Cvar_Set( 's_impacts', '1' ) ] ] ) {

		set(); clear(); tempEntity( 1, w.at ); const heard = playing(); undo();
		check( heard.length > 0 && ! heard.some( s => s.startsWith( 'quaked/' ) ), name + ': ' + heard );

	}

} ) );

Deno.test( 'no game sound is ever cut off: with nearly every channel busy the surface sound waits', () => withSound( () => {

	const other = dma.S_PrecacheSound( 'misc/talk.wav' ), w = walls()[ 0 ];
	// all but two of the 32 dynamic channels busy with game sounds from different entities
	for ( let i = 0; i < sound.MAX_DYNAMIC_CHANNELS - 2; i ++ ) dma.S_StartSound( 100 + i, 1, other, [ i, 0, 0 ], 1, 0 );
	const busy = () => sound.channels.filter( c => c.sfx?.name === 'misc/talk.wav' ).length, before = busy();
	tempEntity( 1, w.at ); tempEntity( 1, w.at ); tempEntity( 1, w.at );
	same( busy(), before, 'every game sound still playing' );
	check( ! playing().some( s => s.startsWith( 'quaked/' ) ), 'the surface sounds waited (fewer than the reserve free)' );

} ) );
