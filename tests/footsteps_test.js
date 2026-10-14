// Footsteps (src/newer/sound/s_footsteps.js; card T-3faa98e3 item 1, docs/material-sounds-2026-10-14.md): the player
// steps at a walker's cadence on the floor's own material; monsters step by their size; nothing in the air, standing
// still or swimming steps; a game's own footsteps win; New Game, demos and the switch off are silent. Through the
// public frame function and the real sound system, with e1m1's real floors and the shareware pack's real models.
import { readFileSync } from 'node:fs';
await import( '../src/newer/install.js' );
const dma = await import( '../src/engine/sound/snd_dma.js' ), sound = await import( '../src/engine/sound/sound.js' ), pak = await import( '../src/engine/common/pak.js' );
const { Mod_Init, Mod_ForName } = await import( '../src/engine/render/gl_model.js' );
const { cl, cls, cl_entities } = await import( '../src/engine/client/client.js' );
const cvar = await import( '../src/engine/common/cvar.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const { s_footsteps, S_FootstepsFrame, STEPS } = await import( '../src/newer/sound/s_footsteps.js' );
const { S_MaterialAt, S_FLOOR } = await import( '../src/newer/sound/s_material.js' );
const { FX_Stop } = await import( '../src/newer/render/fx_world.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
Mod_Init();
for ( const v of [ r_hdr, s_footsteps ] ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
const node = kind => ( { kind, gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } } );
class Context {
	constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; this.sources = []; }
	createGain() { return node( 'gain' ); } createStereoPanner() { return node( 'pan' ); }
	createBuffer( c, l, r ) { return { channels: c, length: l, rate: r, data: new Float32Array( l ), getChannelData() { return this.data; } }; }
	createBufferSource() { const s = node( 'source' ); this.sources.push( s ); return s; }
	resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
}
const e1m1 = Mod_ForName( 'maps/e1m1.bsp', true );
const m = /"classname" "info_player_start"[^}]*"origin" "([^"]+)"|"origin" "([^"]+)"[^}]*"classname" "info_player_start"/.exec( e1m1.entities );
const spawn = ( m[ 1 ] ?? m[ 2 ] ).split( ' ' ).map( Number );
const soldier = Mod_ForName( 'progs/soldier.mdl', true ), dog = Mod_ForName( 'progs/dog.mdl', true ), shambler = Mod_ForName( 'progs/shambler.mdl', true ), wizard = Mod_ForName( 'progs/wizard.mdl', true ), gib = Mod_ForName( 'progs/gib1.mdl', true );
// a model's first frame whose name says how it moves (soldier: run1; wizard: hover1; a gib its only frame)
const frameOf = ( model, re ) => Math.max( 0, model.cache.data.frames.findIndex( f => re.test( f.name ) ) );
// a tiny sound file under a name, in its own pack: what a game with its own footsteps ships
function shipSound( name ) {

	const wav = new Uint8Array( 44 + 64 ), v = new DataView( wav.buffer ), tag = ( at, t ) => { for ( let i = 0; i < 4; i ++ ) wav[ at + i ] = t.charCodeAt( i ); };
	tag( 0, 'RIFF' ); v.setUint32( 4, wav.length - 8, true ); tag( 8, 'WAVE' ); tag( 12, 'fmt ' ); v.setUint32( 16, 16, true ); v.setUint16( 20, 1, true ); v.setUint16( 22, 1, true ); v.setUint32( 24, 11025, true ); v.setUint32( 28, 11025, true ); v.setUint16( 32, 1, true ); v.setUint16( 34, 8, true ); tag( 36, 'data' ); v.setUint32( 40, 64, true ); wav.fill( 150, 44 );
	pak.COM_AddPack( pak.COM_LoadPackFile( name + '.pak', pak.COM_BuildPack( [ { name: 'sound/' + name, data: wav } ] ) ) );

}
let clock = 100;
function withSound( body ) {

	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' ), world = cl.worldmodel, ne = cl.num_entities, view = cl.viewentity, precache = cl.sound_precache.slice();
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
	try {

		dma.S_Init(); dma.S_StopAllSounds( true ); for ( const c of sound.channels ) c.sfx = null;
		cl.worldmodel = e1m1; cls.demoplayback = false; cl.paused = false; cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 's_footsteps', '1' );
		cl.sound_precache.fill( null ); cl.viewentity = 1; cl.num_entities = 2; cl.stats[ 0 ] = 100; cl.intermission = 0;
		cl.worldmodel = null; S_FootstepsFrame( clock ); cl.worldmodel = e1m1; // (a new map: whose steps the game plays is forgotten)
		cl_entities[ 1 ] = { origin: Float32Array.from( spawn ), angles: new Float32Array( 3 ), model: Mod_ForName( 'progs/player.mdl', true ) };
		clock += 50; S_FootstepsFrame( clock );
		body();

	} finally {

		dma.S_Shutdown(); cl.worldmodel = world; cl.num_entities = ne; cl.viewentity = view; precache.forEach( ( v, i ) => { cl.sound_precache[ i ] = v; } ); cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 's_footsteps', '1' ); cls.demoplayback = false;
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}

}
// `seconds` of frames at 60 a second; `move( t )` runs each frame; returns every step started
function run( seconds, move = () => {} ) { const steps = []; for ( let i = 0; i < seconds * 60; i ++ ) { clock = Math.round( ( clock + 1 / 60 ) * 10000 ) / 10000; cl.time = clock; move( i / 60 ); steps.push( ...S_FootstepsFrame( clock ) ); for ( const c of sound.channels ) c.sfx = null; } return steps; }
const walkPlayer = speed => t => { const me = cl_entities[ 1 ]; cl.onground = true; cl.velocity.set( [ speed, 0, 0 ] ); me.origin[ 0 ] = spawn[ 0 ] + Math.sin( t ) * 20; };

Deno.test( 'the player steps at a walker\'s cadence, on the floor\'s own material; standing or in the air, never', () => withSound( () => {

	const floor = S_MaterialAt( e1m1, [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] - 23 ], 24, S_FLOOR );
	const running = run( 4, walkPlayer( 320 ) ), walking = run( 4, walkPlayer( 160 ) );
	check( running.length >= 10 && running.length <= 14, 'running: about 3 steps a second: ' + running.length );
	check( walking.length >= 8 && walking.length <= 11 && walking.length < running.length, 'walking: about 2.4 a second: ' + walking.length );
	check( running.every( s => s.startsWith( `quaked/step_${floor}` ) ), `on e1m1's ${floor} floor: ` + running.slice( 0, 3 ) );
	same( run( 2, () => { cl.onground = true; cl.velocity.fill( 0 ); } ).length, 0, 'standing still: none' );
	same( run( 2, () => { cl.onground = false; cl.velocity.set( [ 320, 0, 0 ] ); } ).length, 0, 'in the air: none' );
	cl.stats[ 0 ] = 0; same( run( 2, walkPlayer( 320 ) ).length, 0, 'dead: none' ); cl.stats[ 0 ] = 100;

} ) );

Deno.test( 'monsters step by their size: a dog lightly and often, a Shambler heavily; a hovering Scrag and a still one never', () => withSound( () => {

	cl.onground = false; cl.velocity.fill( 0 );
	const floorZ = FX_Stop( e1m1, Float32Array.from( spawn ), - 64 );
	const walker = ( model, speed, height = 24, pose = /^(run|walk|prowl)/ ) => { cl.num_entities = 3; const e = cl_entities[ 2 ] = { model, frame: frameOf( model, pose ), origin: Float32Array.from( [ spawn[ 0 ], spawn[ 1 ], floorZ + height ] ), angles: new Float32Array( 3 ) }; return run( 4, t => { e.origin[ 1 ] = spawn[ 1 ] + ( t * speed ) % 60 - 30; } ); };
	const d = walker( dog, 200 ), s = walker( soldier, 120 ), sh = walker( shambler, 120 );
	check( d.length > s.length && d.every( n => /^quaked\/step_/.test( n ) ), 'a dog: light steps, more of them: ' + d.length + ' vs ' + s.length );
	check( sh.length > 0 && sh.every( n => /^quaked\/steph_/.test( n ) ), 'a Shambler: heavy steps: ' + sh.length );
	same( walker( wizard, 120, 80, /^hover/ ).length, 0, 'a Scrag 80 units up: none' );
	same( walker( wizard, 120, 28, /^hover/ ).length, 0, 'a Scrag hovering low: no walking pose, none' );
	same( walker( gib, 200, 4, /./ ).length, 0, 'a gib sliding along the floor: none' );
	same( walker( soldier, 120, 24, /^death/ ).length, 0, 'a soldier\'s corpse sliding: none' );
	same( walker( soldier, 0 ).length, 0, 'standing still: none' );

} ) );

Deno.test( 'a game with its own footsteps keeps its own; a creature with its own keeps its own', () => withSound( () => {

	shipSound( 'steps/stone1.wav' ); shipSound( 'soldier/step1.wav' ); shipSound( 'misc/step1.wav' );
	cl.sound_precache[ 1 ] = dma.S_PrecacheSound( 'misc/step1.wav' );
	check( run( 2, walkPlayer( 320 ) ).length > 0, 'a footstep sound only loaded (Malice\'s misc/step1.wav, a trap): ours go on' );
	dma.S_StartSound( 1, 4, dma.S_PrecacheSound( 'steps/stone1.wav' ), cl_entities[ 1 ].origin, 1, 1 );
	same( run( 2, walkPlayer( 320 ) ).length, 0, 'once the game plays its own steps/… for the player: none of ours for the player' );
	cl.onground = false; cl.velocity.fill( 0 );
	const floorZ = FX_Stop( e1m1, Float32Array.from( spawn ), - 64 );
	cl.num_entities = 3; const e = cl_entities[ 2 ] = { model: soldier, frame: frameOf( soldier, /^run/ ), origin: Float32Array.from( [ spawn[ 0 ], spawn[ 1 ], floorZ + 24 ] ), angles: new Float32Array( 3 ) };
	const walk = () => run( 3, t => { e.origin[ 1 ] = spawn[ 1 ] + ( t * 120 ) % 60 - 30; } ).length;
	check( walk() > 0, 'the soldier steps' );
	dma.S_StartSound( 2, 4, dma.S_PrecacheSound( 'soldier/step1.wav' ), e.origin, 1, 1 );
	same( walk(), 0, 'once the game plays soldier/step1.wav for a soldier: none of ours for soldiers' );

} ) );

Deno.test( 'New Game, a demo, a pause and the switch off: no steps', () => withSound( () => {

	for ( const [ name, set, undo ] of [ [ 'New Game', () => cvar.Cvar_Set( 'r_hdr', '0' ), () => cvar.Cvar_Set( 'r_hdr', '1' ) ], [ 'a demo', () => { cls.demoplayback = true; }, () => { cls.demoplayback = false; } ], [ 'paused', () => { cl.paused = true; }, () => { cl.paused = false; } ], [ 's_footsteps 0', () => cvar.Cvar_Set( 's_footsteps', '0' ), () => cvar.Cvar_Set( 's_footsteps', '1' ) ] ] ) {

		set(); const n = run( 2, walkPlayer( 320 ) ).length; undo(); same( n, 0, name );

	}
	check( STEPS.perFrame === 4, 'at most four a frame' );

} ) );
