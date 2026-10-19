// Owner-restricted enemy footsteps: only the five named humanoid enemy families.
// Public frame -> actual floor tracing -> ordinary sound cache/mixer; browser
// audio output is doubled. Missing shareware models use explicit named-alias
// boundary fixtures, without claiming full native Enforcer/Death Knight AI proof.
import { readFileSync } from './helpers/resource_fs.mjs';
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
const ogre = Mod_ForName( 'progs/ogre.mdl', true ), knight = Mod_ForName( 'progs/knight.mdl', true ), demon = Mod_ForName( 'progs/demon.mdl', true ), zombie = Mod_ForName( 'progs/zombie.mdl', true );
const named = name => ( { ...soldier, name: 'progs/' + name + '.mdl' } );
const enforcer = named( 'enforcer' ), hknight = named( 'hknight' ), army = named( 'army' ), ogre2 = { ...ogre, name: 'progs/ogre2.mdl' };
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
		cl.worldmodel = { ...e1m1 }; cls.demoplayback = false; cl.paused = false; cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 's_footsteps', '1' );
		cl.sound_precache.fill( null ); cl.viewentity = 1; cl.num_entities = 2; cl.stats[ 0 ] = 100; cl.intermission = 0;
		S_FootstepsFrame( clock ); // a fresh world identity resets native ownership history
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

function walker( model, speed = 120, height = 24, pose = /^(run|walk|prowl)/, seconds = 4 ) {
 const floorZ = FX_Stop( cl.worldmodel, Float32Array.from( spawn ), - 64 );
 check( floorZ !== null, 'actual BSP supplies the source floor' );
 cl.num_entities = 3; const e = cl_entities[ 2 ] = { model, frame: frameOf( model, pose ), origin: Float32Array.from( [ spawn[ 0 ], spawn[ 1 ], floorZ + height ] ), angles: new Float32Array( 3 ) };
 return run( seconds, t => { e.origin[ 1 ] = spawn[ 1 ] + ( t * speed ) % 60 - 30; } );
}
Deno.test( 'player movement never produces these enemy-only footsteps', () => withSound( () => {
 same( run( 4, walkPlayer( 320 ) ).length, 0, 'running player is excluded' );
 same( run( 4, walkPlayer( 160 ) ).length, 0, 'walking player is excluded' );
 cl.onground = false; same( run( 2, walkPlayer( 0 ) ).length, 0, 'stationary player is excluded too' );
} ) );
Deno.test( 'all five approved enemy families step on the real floor and retain weight and movement cadence', () => withSound( () => {
 cl.velocity.fill( 0 ); cl.onground = false;
 const floor = S_MaterialAt( cl.worldmodel, [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] - 23 ], 24, S_FLOOR );
 for ( const [ label, model ] of [ [ 'grunt', soldier ], [ 'enforcer named-alias fixture', enforcer ], [ 'ogre', ogre ], [ 'knight', knight ], [ 'death knight named-alias fixture', hknight ], [ 'army alias', army ], [ 'ogre2 alias', ogre2 ] ] ) {
  const steps = walker( model ); check( steps.length > 0, label + ' steps while moving in a native walking pose' );
  check( steps.every( name => new RegExp( '^quaked/steph?_' + floor + '[1-4]\\.wav$' ).test( name ) ), label + ' uses the floor material' );
 }
 const slow = walker( soldier, 90 ), fast = walker( soldier, 240 ); check( fast.length > slow.length, 'movement still controls stride cadence' );
 const heavy = walker( ogre ); check( heavy.every( name => name.startsWith( 'quaked/steph_' ) ), 'actual Ogre retains its heavy tread' );
} ) );
Deno.test( 'dogs Shamblers fiends zombies players and unknown walkers never gain human enemy footsteps', () => withSound( () => {
 for ( const [ label, model ] of [ [ 'dog', dog ], [ 'Shambler', shambler ], [ 'fiend', demon ], [ 'zombie', zombie ], [ 'other player', cl_entities[ 1 ].model ], [ 'unknown walking alias', named( 'unknown_walker' ) ] ] ) same( walker( model, 120 ).length, 0, label + ' excluded despite actual walking pose and nearby floor' );
 same( walker( wizard, 120, 80, /^hover/ ).length, 0, 'high hovering Scrag excluded' );
 same( walker( wizard, 120, 28, /^hover/ ).length, 0, 'low hovering Scrag excluded' );
 same( walker( gib, 200, 4, /./ ).length, 0, 'sliding gib excluded' );
} ) );
Deno.test( 'approved enemies still need movement a walking pose and a nearby floor', () => withSound( () => {
 same( walker( soldier, 0 ).length, 0, 'standing still' );
 same( walker( soldier, 120, 24, /^death/ ).length, 0, 'sliding corpse' );
 same( walker( soldier, 120, 80 ).length, 0, 'walker too far above the floor' );
 same( walker( soldier, 2000 ).length, 0, 'teleport-sized movement cannot synthesize steps' );
 const floor = FX_Stop( cl.worldmodel, Float32Array.from( spawn ), -64 ); cl.num_entities = 3;
 const e = cl_entities[ 2 ] = { model: soldier, frame: frameOf( soldier, /^run/ ), origin: Float32Array.from( [ ...spawn.slice( 0, 2 ), floor + 24 ] ) };
 same( run( .1, () => { e.origin[ 2 ] += 4; e.origin[ 1 ] += 1; } ).length, 0, 'rising enemy has no ground stride' );
} ) );
Deno.test( 'native enemy footsteps take ownership only after playback, never merely because a sound is precached', () => withSound( () => {
 shipSound( 'soldier/step1.wav' ); cl.sound_precache[ 1 ] = dma.S_PrecacheSound( 'soldier/step1.wav' );
 check( walker( soldier ).length > 0, 'precached native footstep does not disable custom cadence' );
 dma.S_StartSound( 2, 4, cl.sound_precache[ 1 ], cl_entities[ 2 ].origin, 1, 1 );
 same( walker( soldier ).length, 0, 'a played native step owns this model family' );
 check( walker( knight ).length > 0, 'ownership of soldier steps cannot silence a different eligible model' );
} ) );
Deno.test( 'Classic demos pause and the switch silence an otherwise eligible moving enemy', () => withSound( () => {
 check( walker( soldier ).length > 0, 'positive eligible enemy control' );
 for ( const [ name, set, undo ] of [ [ 'Classic', () => cvar.Cvar_Set( 'r_hdr', '0' ), () => cvar.Cvar_Set( 'r_hdr', '1' ) ], [ 'demo', () => { cls.demoplayback = true; }, () => { cls.demoplayback = false; } ], [ 'pause', () => { cl.paused = true; }, () => { cl.paused = false; } ], [ 's_footsteps 0', () => cvar.Cvar_Set( 's_footsteps', '0' ), () => cvar.Cvar_Set( 's_footsteps', '1' ) ] ] ) { set(); const count = walker( soldier ).length; undo(); same( count, 0, name ); }
} ) );
Deno.test( 'enemy footsteps keep the four-per-frame bound and cannot steal full native sound channels', () => withSound( () => {
 const floor = FX_Stop( cl.worldmodel, Float32Array.from( spawn ), -64 ); cl.num_entities = 14;
 for ( let i = 2; i < 14; i++ ) cl_entities[ i ] = { model: soldier, frame: frameOf( soldier, /^run/ ), origin: Float32Array.from( [ spawn[ 0 ], spawn[ 1 ], floor + 24 ] ) };
 run( 1 / 60 );
 const step = () => { clock += 1 / 60; cl.time = clock; for ( let i = 2; i < 14; i++ ) cl_entities[ i ].origin[ 1 ] += 3; return S_FootstepsFrame( clock ); };
 same( STEPS.perFrame, 4, 'explicit global budget' ); const started = step(); same( started.length, 4, 'many eligible enemies admit at most four steps in one frame' );
 const sfx = dma.S_PrecacheSound( 'misc/talk.wav' );
 for ( let i = 0; i < sound.MAX_DYNAMIC_CHANNELS; i++ ) dma.S_StartSound( 200 + i, 1, sfx, sound.listener_origin, 1, 0 );
 const context = dma.S_GetAudioContext(), before = context.sources.length, occupied = sound.channels.map( channel => channel.entnum );
 // Let stride debt expire without releasing native channels.
 clock += .4; cl.time = clock; for ( let i = 2; i < 14; i++ ) cl_entities[ i ].origin[ 1 ] += 30; S_FootstepsFrame( clock );
 same( context.sources.length, before, 'full native channels prevent new optional source starts' );
 check( sound.channels.every( ( channel, i ) => channel.entnum === occupied[ i ] ), 'all native channel owners preserved' );
} ) );
