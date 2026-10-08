// "04 Fireball" port: the ported functions against the source's own, and the
// public behaviour that replaces an ordinary explosion's particles. WebGL is not
// involved: the instance buffers a frame writes are inspected directly, so these
// checks do not claim GPU pixel parity (tests/fireball_trial.html does).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { cvar_t, Cvar_RegisterVariable, Cvar_SetValue } from '../src/cvar.js';
import * as fb from '../src/r_fireball.js';
import { R_ParticleExplosion, R_ParticleExplosion2, R_BlobExplosion } from '../src/render.js';
import { r_demosplit } from '../src/r_demosplit.js';
import * as part from '../src/r_part.js';
import { cl as clientState } from '../src/client.js';

const SOURCE_SHA256 = '7e35fc808c24200e9dbf2b010a72d2fbea04aca567528ebd2e61e79979afc7d6';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const near = ( a, b, eps, label ) => { if ( ! ( Math.abs( a - b ) <= eps ) ) throw new Error( `${label}: ${a} != ${b}` ); };
const same = ( a, b, label ) => { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); };

Cvar_RegisterVariable( new cvar_t( 'r_hdr', '1' ) );
const newer = on => Cvar_SetValue( 'r_hdr', on ? 1 : 0 );

// floor z=0 (normal up), air above, solid below
function world() {

	const floor = { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] },
		texturemins: [ - 512, - 512 ], extents: [ 1024, 1024 ] };
	const air = { contents: - 1, firstmarksurface: [ floor ], nummarksurfaces: 1 }, solid = { contents: - 2 };
	return { model: { leafs: [ air ] }, pointInLeaf: p => p[ 2 ] < 0 ? solid : air };

}
const textures = () => [ new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 ), new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 ) ];

function setup( { ready = true, time = { now: 10 } } = {} ) {

	const scene = new THREE.Scene(), w = world(), lights = new Map();
	fb.R_FireballSetup( { scene, cl: () => ( { time: time.now, worldmodel: w.model } ), pointInLeaf: w.pointInLeaf,
		allocDlight: key => { const l = lights.get( key ) || { origin: new Float32Array( 3 ), radius: 0, die: 0, decay: 0 }; lights.set( key, l ); return l; } } );
	fb.R_FireballClear();
	if ( ready ) fb.R_FireballTextures( ...textures() ); else fb.R_FireballTextures( null, null );
	newer( true );
	r_demosplit.value = 1; fb.r_fireball.value = 1;
	return { scene, time, lights, group: () => scene.children.find( c => c.name === 'quake_fireball' ) };

}
const mesh = ( env, name ) => env.group().children.find( c => c.name === name );
const view = [ [ - 400, 0, 100 ], [ 1, 0, 0 ], [ 1280, 720 ] ];

Deno.test( 'ported cloud, spark and spark-position functions equal the source\'s own', () => {

	const path = new URL( '../fieldlab-fx-3d-updated.html', import.meta.url );
	const need = process.env.QUAKED_FIREBALL_SOURCE_REQUIRED === '1', skip = why => { if ( need ) throw new Error( why + ' (QUAKED_FIREBALL_SOURCE_REQUIRED=1)' ); console.log( 'SKIPPED source equivalence: ' + why ); };
	if ( ! existsSync( path ) ) return skip( 'source file not present locally' );
	const bytes = readFileSync( path );
	if ( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) !== SOURCE_SHA256 ) return skip( 'different source revision' );
	const lines = bytes.toString( 'utf8' ).split( '\n' ), pick = re => lines.find( l => re.test( l ) );
	const code = [ pick( /^const clamp=/ ), pick( /^const V=\{add:/ ), pick( /^function hashJS\(n\)/ ), pick( /^function sparkPosition/ ), pick( /^function burstClouds/ ), pick( /^function burstSparks/ ) ].join( '\n' );
	check( code.split( '\n' ).every( l => l && l.length > 20 ), 'all six source definitions located' );
	const Q = { medium: { clouds: 40, sparkCap: 300 } }, center = [ 0, .45, 0 ];
	const ctx = { Math, Q, fxCenter: () => center, S: { mode: 'explosion', quality: 'medium', burstAge: 0, burstID: 1, explosion: { size: 1.6, flash: 1, smoke: .15, sparks: 1.8 } } };
	runInNewContext( code + '\nthis.burstClouds=burstClouds;this.burstSparks=burstSparks;this.sparkPosition=sparkPosition;', ctx );
	const rel = ( v, c ) => v.map( ( x, i ) => x - c[ i ] );
	let clouds = 0, sparks = 0;
	for ( const id of [ 1, 2, 7, 31 ] ) for ( const age of [ .01, .05, .1, .3, .8, 1.5, 3, 4.5, 4.8 ] ) {

		ctx.S.burstID = id; ctx.S.burstAge = age;
		const a = ctx.burstClouds(), b = fb.fireballClouds( age, id );
		same( b.length, a.length, `cloud count at age ${age} id ${id}` );
		a.forEach( ( c, i ) => {

			clouds ++;
			for ( let k = 0; k < 3; k ++ ) near( b[ i ].pos[ k ], c.pos[ k ] - center[ k ], 1e-12, 'cloud position' );
			for ( const key of [ 'size', 'angle', 'alpha', 'heat', 'tile', 'seed' ] ) near( b[ i ][ key ], c[ key ], 1e-12, 'cloud ' + key );
			for ( let k = 0; k < 3; k ++ ) near( b[ i ].tint[ k ], c.tint[ k ], 1e-12, 'cloud tint' );

		} );
		const s = ctx.burstSparks(), t = fb.fireballSparks( age, id, fb.FIREBALL, center[ 1 ] );
		same( t.length, s.length, `spark count at age ${age} id ${id}` );
		s.forEach( ( sp, i ) => {

			sparks ++;
			for ( let k = 0; k < 3; k ++ ) { near( t[ i ].start[ k ], sp.start[ k ] - center[ k ], 1e-12, 'spark start' ); near( t[ i ].end[ k ], sp.end[ k ] - center[ k ], 1e-12, 'spark end' ); }
			for ( const key of [ 'width', 'alpha', 'brightness' ] ) near( t[ i ][ key ], sp[ key ], 1e-12, 'spark ' + key );
			for ( let k = 0; k < 3; k ++ ) near( t[ i ].color[ k ], sp.color[ k ], 1e-12, 'spark colour' );

		} );

	}
	check( clouds > 500 && sparks > 1000, `meaningful sample compared: ${clouds} clouds, ${sparks} sparks` );

} );

Deno.test( 'burst is bounded and finite: counts within the source caps, nothing left after the duration', () => {

	for ( const age of [ .02, .3, 1, 2.5 ] ) {

		check( fb.fireballClouds( age, 3 ).length <= fb.FIREBALL.clouds, 'cloud cap' );
		check( fb.fireballSparks( age, 3 ).length <= Math.round( 86 * fb.FIREBALL.sparks ), 'spark cap' );

	}
	same( fb.fireballClouds( fb.FIREBALL.duration, 3 ).length, 0, 'no cloud outlives the 4.8 s burst' );
	same( fb.fireballSparks( fb.FIREBALL.duration, 3 ).length, 0, 'no spark outlives the burst' );
	near( fb.fireballFlash( 0 ), 1.5, 1e-12, 'flash starts at 1.5' );
	check( fb.fireballFlash( .5 ) < .001, 'flash is gone within half a second' );
	for ( const c of fb.fireballClouds( 1.2, 5 ) ) check( c.pos[ 1 ] > 0 && c.alpha <= .94, 'clouds rise from the detonation and stay translucent' );

} );

Deno.test( 'native particles remain when Classic, textures are not ready, or nothing was set up', () => {

	const env = setup( { ready: false } );
	same( fb.R_FireballSpawn( [ 0, 0, 0 ] ), false, 'textures not loaded' );
	fb.R_FireballTextures( ...textures() ); newer( false );
	same( fb.R_FireballSpawn( [ 0, 0, 0 ] ), false, 'Classic Quake keeps its own explosion' );
	newer( true );
	same( fb.R_FireballSpawn( [ 0, 0, 0 ] ), true, 'Newer Game with textures uses the Fireball' );
	same( fb.R_FireballActive(), 1, 'one burst' );
	fb.R_FireballSetup( { scene: null, cl: () => null } );
	same( fb.R_FireballSpawn( [ 0, 0, 0 ] ), false, 'no scene' );
	env.group();

} );

Deno.test( 'a frame writes world-space Quake coordinates: rising clouds, flash, sparks and a wall/floor ring', () => {

	const env = setup(), origin = [ 100, 200, 3 ];
	check( fb.R_FireballSpawn( origin ), 'spawned' );
	fb.R_FireballFrame( env.time.now, ...view ); // first frame: the burst's clock starts
	env.time.now = 10.15; fb.R_FireballFrame( env.time.now, ...view );
	const snap = fb.R_FireballSnapshot();
	check( snap.puffs > 10 && snap.sparks > 50, `clouds and sparks drawn: ${snap.puffs}/${snap.sparks}` );
	same( snap.glows, 1, 'flash card' ); same( snap.rings, 1, 'ring on the floor under the explosion' );
	const pos = mesh( env, 'fireball_clouds' ).geometry.attributes.aPosSize.array;
	for ( let i = 0; i < snap.puffs; i ++ ) {

		const x = pos[ i * 4 ], y = pos[ i * 4 + 1 ], z = pos[ i * 4 + 2 ], size = pos[ i * 4 + 3 ];
		check( z >= origin[ 2 ] - 1e-6, 'clouds are above the detonation (Quake Z is up)' );
		check( Math.hypot( x - origin[ 0 ], y - origin[ 1 ] ) < 4 * fb.FIREBALL.unit * fb.FIREBALL.size, 'cloud stays within the fireball radius' );
		check( size > 0 && size < 3 * fb.FIREBALL.unit * fb.FIREBALL.size, 'cloud size is in world units' );

	}
	// back to front: depth along the view forward never decreases toward the camera
	let last = Infinity;
	for ( let i = 0; i < snap.puffs; i ++ ) { const d = pos[ i * 4 ] - view[ 0 ][ 0 ]; check( d <= last + 1e-4, 'puffs sorted far to near' ); last = d; }
	const ru = mesh( env, 'fireball_ring' ).geometry.attributes, c = ru.aCenterRadius.array, u = ru.aAxisU.array, v = ru.aAxisV.array;
	near( c[ 2 ], 1.2, 1e-6, 'ring lies on the floor, a hair above it' );
	const n = [ u[ 1 ] * v[ 2 ] - u[ 2 ] * v[ 1 ], u[ 2 ] * v[ 0 ] - u[ 0 ] * v[ 2 ], u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ] ];
	near( Math.abs( n[ 2 ] ), 1, 1e-6, 'ring basis spans the floor plane' );
	near( c[ 3 ], fb.fireballRingRadius( .15 ) * fb.FIREBALL.unit, 1e-6, 'ring radius follows the source curve' );

} );

Deno.test( 'bursts are bounded, expire after 4.8 s, survive nothing across maps or into Classic', () => {

	const env = setup();
	const taken = [];
	for ( let i = 0; i < 20; i ++ ) taken.push( fb.R_FireballSpawn( [ i * 10, 0, 40 ] ) );
	same( fb.R_FireballActive(), fb.FIREBALL.maxBursts, 'pool never exceeds its fixed size' );
	fb.R_FireballFrame( env.time.now, ...view );
	same( taken.filter( Boolean ).length, fb.FIREBALL.maxBursts, 'a full pool of young bursts refuses more: those explosions stay native' );
	env.time.now = 10.2; fb.R_FireballFrame( env.time.now, ...view );
	const snap = fb.R_FireballSnapshot();
	check( snap.puffs <= snap.capacity.puffs && snap.sparks <= snap.capacity.sparks, 'instance counts stay inside the fixed buffers' );
	env.time.now = 10 + fb.FIREBALL.duration + .01; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballActive(), 0, 'every burst expired' );
	same( env.group().visible, false, 'nothing drawn after expiry' );
	fb.R_FireballSpawn( [ 0, 0, 40 ] ); fb.R_FireballFrame( env.time.now, ...view ); env.time.now = 5; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballActive(), 0, 'a burst whose clock jumped back by seconds (demo loop / new level) is dropped' );
	fb.R_FireballSpawn( [ 0, 0, 40 ] ); fb.R_FireballClear();
	same( fb.R_FireballActive(), 0, 'map change clears every burst' );
	fb.R_FireballSpawn( [ 0, 0, 40 ] ); newer( false ); fb.R_FireballFrame( 10.1, ...view );
	same( fb.R_FireballActive(), 0, 'switching to Classic mid-burst removes it' );
	same( env.group().visible, false, 'hidden in Classic' );

} );

Deno.test( 'every explosion family uses the Fireball in Newer Game and the native particles otherwise', () => {

	const env = setup();
	same( R_ParticleExplosion( [ 0, 0, 40 ] ), true, 'ordinary (rocket, grenade) -> Fireball' );
	same( R_ParticleExplosion2( [ 20, 0, 40 ], 0, 4 ), true, 'colour-mapped -> Fireball' );
	same( R_BlobExplosion( [ 40, 0, 40 ] ), true, 'tar baby (blob) -> Fireball' );
	same( fb.R_FireballActive(), 3, 'exactly one burst per event' );
	fb.R_FireballClear(); newer( false );
	same( R_ParticleExplosion( [ 0, 0, 40 ] ), false, 'Classic ordinary -> native particles' );
	same( R_ParticleExplosion2( [ 0, 0, 40 ], 0, 4 ), false, 'Classic colour-mapped -> native particles' );
	same( R_BlobExplosion( [ 0, 0, 40 ] ), false, 'Classic tar -> native particles' );
	same( fb.R_FireballActive(), 0, 'nothing spawned in Classic' );
	newer( true ); fb.r_fireball.value = 0;
	same( R_ParticleExplosion( [ 0, 0, 40 ] ), false, 'r_fireball 0 puts the native particles back' );
	fb.r_fireball.value = 1; r_demosplit.value = 2;
	same( R_ParticleExplosion( [ 0, 0, 40 ] ), true, 'in the demo split the Newer half still gets the Fireball' );
	r_demosplit.value = 1;
	env.group();

} );

Deno.test( 'no wall or floor in reach: the burst still works and simply has no ring', () => {

	const env = setup(), air = { contents: - 1, firstmarksurface: [], nummarksurfaces: 0 };
	fb.R_FireballSetup( { scene: env.scene, cl: () => ( { time: 10, worldmodel: { leafs: [ air ] } } ), pointInLeaf: () => air } );
	check( fb.R_FireballSpawn( [ 0, 0, 500 ] ), 'spawned in open air' );
	fb.R_FireballFrame( env.time.now, ...view );
	env.time.now = 10.1; fb.R_FireballFrame( env.time.now, ...view );
	const snap = fb.R_FireballSnapshot();
	check( snap.puffs > 0 && snap.sparks > 0, 'effect drawn' ); same( snap.rings, 0, 'no ring without a surface' );

} );

Deno.test( 'frames are rebuilt from the current bursts every time (no state stuck from an earlier frame)', () => {

	const env = setup(), K = fb.FIREBALL.unit, o1 = [ 100, 0, 50 ], o2 = [ -300, 40, 80 ];
	fb.R_FireballSpawn( o1 ); fb.R_FireballFrame( 10, ...view );
	env.time.now = 10.2; fb.R_FireballFrame( env.time.now, ...view );
	fb.R_FireballSpawn( o2 ); fb.R_FireballFrame( env.time.now, ...view );
	env.time.now = 10.5; fb.R_FireballFrame( env.time.now, ...view );
	const pos = mesh( env, 'fireball_clouds' ).geometry.attributes.aPosSize.array, snap = fb.R_FireballSnapshot();
	const R = 4 * K * fb.FIREBALL.size;
	let n1 = 0, n2 = 0;
	for ( let i = 0; i < snap.puffs; i ++ ) {

		const d1 = Math.hypot( pos[ i * 4 ] - o1[ 0 ], pos[ i * 4 + 1 ] - o1[ 1 ], pos[ i * 4 + 2 ] - o1[ 2 ] );
		const d2 = Math.hypot( pos[ i * 4 ] - o2[ 0 ], pos[ i * 4 + 1 ] - o2[ 1 ], pos[ i * 4 + 2 ] - o2[ 2 ] );
		if ( d1 < R ) n1 ++; else if ( d2 < R ) n2 ++; else throw new Error( 'puff belongs to neither live burst' );

	}
	check( n1 > 0 && n2 > 0, `both bursts drawn from their own origins: ${n1} / ${n2}` );
	// their own ages (.5 and .3) and their own seeds: compare positions with the ported function
	const expect = ( id, age, o ) => fb.fireballClouds( age, id ).map( c => [ o[ 0 ] + c.pos[ 0 ] * K, o[ 1 ] + c.pos[ 2 ] * K, o[ 2 ] + c.pos[ 1 ] * K ] );
	const wanted = [ ...expect( 1, .5, o1 ), ...expect( 2, .3, o2 ) ], got = [];
	for ( let i = 0; i < snap.puffs; i ++ ) got.push( [ pos[ i * 4 ], pos[ i * 4 + 1 ], pos[ i * 4 + 2 ] ] );
	same( got.length, wanted.length, 'one instance per cloud of each burst' );
	for ( const w of wanted ) check( got.some( g => Math.hypot( g[ 0 ] - w[ 0 ], g[ 1 ] - w[ 1 ], g[ 2 ] - w[ 2 ] ) < 1e-3 ), 'every ported cloud appears at its own age and origin' );

} );

Deno.test( 'fireball layers draw after the scorch decals and in the source order; sparks honour the model matrix (XR)', () => {

	const env = setup();
	fb.R_FireballSpawn( [ 0, 0, 40 ] ); fb.R_FireballFrame( 10, ...view ); env.time.now = 10.1; fb.R_FireballFrame( env.time.now, ...view );
	const order = [ 'fireball_clouds', 'fireball_ring', 'fireball_flash', 'fireball_sparks' ].map( n => mesh( env, n ).renderOrder );
	const DECALS = 5; // r_decals.js: the scorch mesh's renderOrder
	check( order.every( o => o > DECALS ), 'every layer is above the scorch decals (renderOrder 5): ' + order );
	check( order.every( ( o, i ) => i === 0 || o > order[ i - 1 ] ), 'puffs, ring, glow, sparks in the source\'s draw order: ' + order );
	const sparkVertex = mesh( env, 'fireball_sparks' ).material.vertexShader;
	check( ! /projectionMatrix\s*\*\s*viewMatrix/.test( sparkVertex ), 'sparks are projected through the model matrix, so XR\'s scene scale applies' );

} );

Deno.test( 'the dynamic light follows the source curve (strength and radius) and exists only where there was one', () => {

	const env = setup();
	fb.R_FireballSpawn( [ 100, 200, 3 ] ); fb.R_FireballFrame( 10, ...view );
	same( env.lights.size, 1, 'one light for one burst' );
	const dl = [ ...env.lights.values() ][ 0 ], seen = [];
	for ( const age of [ .05, .3, .6, .85 ] ) {

		env.time.now = 10 + age; fb.R_FireballFrame( env.time.now, ...view );
		const k = Math.min( 1, fb.fireballLight( age ) / 3.15 );
		near( dl.die - env.time.now, .5 * k, 1e-9, `strength at ${age}s follows the source brightness` );
		near( dl.radius, 200 + 150 * k, 1e-9, `radius at ${age}s follows it too` );
		seen.push( dl.radius );

	}
	check( seen.every( ( r, i ) => i === 0 || r < seen[ i - 1 ] ), 'radius shrinks as the light fades: ' + seen );
	near( dl.origin[ 2 ], 3 + .4 * fb.FIREBALL.unit, 1e-6, 'light sits .4 source units above the detonation' );
	near( fb.fireballLight( 0 ), 3.15, 1e-9, 'peak of the source curve' );
	env.time.now = 11.6; const before = dl.die; fb.R_FireballFrame( env.time.now, ...view );
	same( dl.die, before, 'past the cut-off the light is left to expire' );
	check( dl.die - env.time.now < 0, 'and has expired by then' );
	fb.R_FireballClear(); env.lights.clear();
	R_BlobExplosion( [ 0, 0, 40 ] ); fb.R_FireballFrame( env.time.now, ...view );
	same( env.lights.size, 0, 'a tar explosion (no native light) gets none' );

} );

Deno.test( 'a burst survives the client clock being stepped back after the message was parsed', () => {

	// CL_ReadFromServer parses the message with cl.time ahead; CL_RelinkEntities (or a remote
	// server's latency estimate) then clamps it back. The first drawn frame can be earlier than the spawn.
	const env = setup( { time: { now: 10.000 } } );
	check( fb.R_FireballSpawn( [ 0, 0, 40 ] ), 'spawned' );
	env.time.now = 9.995; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballActive(), 1, 'a 5 ms step back does not delete the burst' );
	same( fb.R_FireballSnapshot().glows, 1, 'and it is drawn from its first frame (the flash is at full strength)' );
	env.time.now = 10.1; fb.R_FireballFrame( env.time.now, ...view );
	check( fb.R_FireballSnapshot().puffs > 0 && fb.R_FireballSnapshot().sparks > 0, 'with its clouds and sparks following' );
	env.time.now = 9.2; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballActive(), 1, 'nor does a step back of under a second (the age is held at zero)' );
	env.time.now = 7; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballActive(), 0, 'a real rewind of seconds does end it' );

} );

Deno.test( 'a full pool lets its oldest burst go once that burst is old, and no sooner', () => {

	const env = setup();
	for ( let i = 0; i < fb.FIREBALL.maxBursts; i ++ ) fb.R_FireballSpawn( [ i * 10, 0, 40 ] );
	fb.R_FireballFrame( 10, ...view );
	env.time.now = 11.0; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballSpawn( [ 0, 99, 40 ] ), false, 'at 1.0 s the oldest is still dense: refused (native particles)' );
	env.time.now = 11.6; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballSpawn( [ 0, 99, 40 ] ), true, 'at 1.6 s its smoke is faint: it yields' );
	same( fb.R_FireballActive(), fb.FIREBALL.maxBursts, 'the pool stays at its fixed size' );

} );

// What the particle system puts in the scene after an explosion, for each mode.
function particles( env, explode ) {

	part.R_InitParticles(); part.R_ClearParticles();
	part.R_SetParticleExternals( { scene: env.scene } );
	clientState.time = 1; clientState.oldtime = .99;
	explode();
	part.R_DrawParticles();
	const points = env.scene.children.filter( c => c.isPoints );
	const out = points.map( c => ( { classicOnly: c.userData.classicOnly === true, visible: c.visible, count: c.geometry.drawRange.count } ) );
	part.R_ClearParticles(); part.R_DrawParticles(); // empties both meshes again
	return out;

}

Deno.test( 'title-demo split: the enhanced half gets the Fireball, the classic half the original explosion, never both in one half', () => {

	const env = setup(), org = [ 0, 0, 40 ];
	// Newer Game, no split: the Fireball only, no native particles at all
	same( particles( env, () => R_ParticleExplosion( org ) ).length, 0, 'Newer Game draws no native explosion particles' );
	same( fb.R_FireballActive(), 1, '...because the Fireball took the event' );
	fb.R_FireballClear();
	// the split: Fireball for the Newer half PLUS native particles that only the Classic half draws
	r_demosplit.value = 2;
	const split = particles( env, () => same( R_ParticleExplosion( org ), true, 'Fireball taken in the split' ) );
	r_demosplit.value = 1;
	same( split.length, 1, 'one native batch in the split' );
	check( split[ 0 ].classicOnly && split[ 0 ].visible === false, 'it is the Classic-only mesh, hidden unless the Classic pass shows it' );
	same( split[ 0 ].count, 1024, 'the full original explosion (1,024 particles)' );
	same( fb.R_FireballActive(), 1, 'and the Fireball exists for the Newer half' );
	fb.R_FireballClear();
	// Classic Quake: the original, visible, nothing else
	newer( false );
	const classic = particles( env, () => R_ParticleExplosion( org ) );
	same( classic.length, 1, 'Classic: one native batch' );
	check( ! classic[ 0 ].classicOnly && classic[ 0 ].count === 1024, 'ordinary visible particles, as before' );
	same( fb.R_FireballActive(), 0, 'no Fireball in Classic' );

} );
