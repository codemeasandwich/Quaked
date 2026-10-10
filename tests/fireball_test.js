// "04 Fireball" port: the ported functions against the source's own, and the
// public behaviour that replaces an ordinary explosion's particles. WebGL is not
// involved: the instance buffers a frame writes are inspected directly, so these
// checks do not claim GPU pixel parity (tests/fireball_trial.html does).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { cvar_t, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import * as fb from '../src/r_fireball.js';
import { R_ParticleExplosion, R_ParticleExplosion2, R_BlobExplosion, R_RocketTrail } from '../src/engine/render/render.js';
import * as smoke from '../src/r_smoketrail.js';
import { r_demosplit } from '../src/r_demosplit.js';
import * as part from '../src/engine/render/r_part.js';
import { cl as clientState } from '../src/engine/client/client.js';

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
	fb.R_FireballSetup( { scene, cl: () => ( { time: time.now, oldtime: time.now - .05, worldmodel: w.model } ), pointInLeaf: w.pointInLeaf,
		allocDlight: key => { const l = lights.get( key ) || { origin: new Float32Array( 3 ), radius: 0, die: 0, decay: 0 }; lights.set( key, l ); return l; } } );
	fb.R_FireballClear();
	if ( ready ) fb.R_FireballTextures( ...textures() ); else fb.R_FireballTextures( null, null );
	newer( true );
	r_demosplit.value = 1; fb.r_fireball.value = 1; fb.r_smoketrails.value = 1;
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
	near( c[ 0 ], origin[ 0 ], 1e-6, 'the ring is centred on the explosion (x)' ); near( c[ 1 ], origin[ 1 ], 1e-6, 'and y' ); near( c[ 2 ], origin[ 2 ], 1e-6, 'and z' );
	const n = [ u[ 1 ] * v[ 2 ] - u[ 2 ] * v[ 1 ], u[ 2 ] * v[ 0 ] - u[ 0 ] * v[ 2 ], u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ] ], toEye = view[ 0 ].map( ( e, i ) => e - origin[ i ] ), el = Math.hypot( ...toEye );
	near( Math.abs( n[ 0 ] * toEye[ 0 ] + n[ 1 ] * toEye[ 1 ] + n[ 2 ] * toEye[ 2 ] ) / el, 1, 1e-5, 'the ring faces the camera (its normal is the view direction)' );
	near( c[ 3 ], fb.fireballRingRadius( .15 ) * fb.FIREBALL.unit, 1e-6, 'ring radius follows the source curve' );

} );

Deno.test( 'the ring faces the camera from any side, above and below: always a circle, never an edge-on line', () => {

	const origin = [ 100, 200, 3 ];
	for ( const eye of [ [ - 400, 0, 100 ], [ 500, 700, 5 ], [ 100, 200, 900 ], [ 100, 200, - 900 ], [ 101, 200, 3.5 ], [ 100.0001, 200, 903 ], [ 1e-3 + 100, 200, 3 ] ] ) {

		const env = setup(); check( fb.R_FireballSpawn( origin ), 'spawned' );
		fb.R_FireballFrame( env.time.now, eye, [ 1, 0, 0 ], [ 1280, 720 ] ); env.time.now = 10.15; fb.R_FireballFrame( env.time.now, eye, [ 1, 0, 0 ], [ 1280, 720 ] );
		const a = mesh( env, 'fireball_ring' ).geometry.attributes, u = a.aAxisU.array, v = a.aAxisV.array;
		same( fb.R_FireballSnapshot().rings, 1, 'ring present from ' + eye );
		const un = Math.hypot( u[ 0 ], u[ 1 ], u[ 2 ] ), vn = Math.hypot( v[ 0 ], v[ 1 ], v[ 2 ] ), dot = u[ 0 ] * v[ 0 ] + u[ 1 ] * v[ 1 ] + u[ 2 ] * v[ 2 ];
		near( un, 1, 1e-5, 'u is a unit vector from ' + eye ); near( vn, 1, 1e-5, 'v is a unit vector from ' + eye ); near( dot, 0, 1e-5, 'u and v are perpendicular from ' + eye );
		const toEye = eye.map( ( e, i ) => e - origin[ i ] ), el = Math.hypot( ...toEye );
		if ( el > 0.01 ) { const n = [ u[ 1 ] * v[ 2 ] - u[ 2 ] * v[ 1 ], u[ 2 ] * v[ 0 ] - u[ 0 ] * v[ 2 ], u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ] ]; near( Math.abs( n[ 0 ] * toEye[ 0 ] + n[ 1 ] * toEye[ 1 ] + n[ 2 ] * toEye[ 2 ] ) / el, 1, 1e-3, 'normal along the view direction from ' + eye ); }
		fb.R_FireballClear();

	}

} );

Deno.test( 'r_fireballalpha scales the explosion clouds\' opacity (default 0.7, clamped to 0..1) and nothing else', () => {

	const rows = value => {

		const env = setup(); fb.r_fireballalpha.value = value; check( fb.R_FireballSpawn( [ 100, 200, 3 ] ), 'spawned' );
		fb.R_FireballFrame( env.time.now, ...view ); env.time.now = 10.3; fb.R_FireballFrame( env.time.now, ...view );
		const snap = fb.R_FireballSnapshot(), info = mesh( env, 'fireball_clouds' ).geometry.attributes.aInfo.array;
		const alphas = []; for ( let i = 0; i < snap.puffs; i ++ ) alphas.push( info[ i * 4 + 1 ] );
		const glow = mesh( env, 'fireball_flash' ).geometry.attributes.aColor.array[ 3 ], ring = mesh( env, 'fireball_ring' ).geometry.attributes.aAxisU.array[ 3 ];
		fb.R_FireballClear(); return { alphas, glow, ring };

	};
	same( fb.r_fireballalpha.string, '0.7', 'the default is 0.7' );
	const full = rows( 1 ), seven = rows( 0.7 ), half = rows( 0.5 ), none = rows( 0 ), high = rows( 5 ), low = rows( - 3 ), junk = rows( NaN );
	check( full.alphas.length > 10, 'there are clouds to compare' );
	for ( let i = 0; i < full.alphas.length; i ++ ) {

		near( seven.alphas[ i ], full.alphas[ i ] * 0.7, 1e-5, 'cloud ' + i + ' at 0.7' ); near( half.alphas[ i ], full.alphas[ i ] * 0.5, 1e-5, 'cloud ' + i + ' at 0.5' );
		same( none.alphas[ i ], 0, 'cloud ' + i + ' at 0' ); near( high.alphas[ i ], full.alphas[ i ], 1e-6, 'above 1 is clamped to 1' ); same( low.alphas[ i ], 0, 'below 0 is clamped to 0' ); near( junk.alphas[ i ], full.alphas[ i ], 1e-6, 'a non-number means the source\'s own alpha' );

	}
	same( seven.glow, full.glow, 'the flash is not scaled' ); same( seven.ring, full.ring, 'nor is the ring' );
	fb.r_fireballalpha.value = 0.7;

} );

Deno.test( 'the ring fades out as the eye comes inside it, so a burst beside the player does not sweep a band across the screen', () => {

	const origin = [ 100, 200, 3 ], near = ( eye, age ) => {

		const env = setup(); check( fb.R_FireballSpawn( origin ), 'spawned' );
		fb.R_FireballFrame( env.time.now, eye, [ 1, 0, 0 ], [ 1280, 720 ] ); env.time.now = 10 + age; fb.R_FireballFrame( env.time.now, eye, [ 1, 0, 0 ], [ 1280, 720 ] );
		const a = mesh( env, 'fireball_ring' ).geometry.attributes, out = { fade: a.aAxisV.array[ 3 ], radius: a.aCenterRadius.array[ 3 ], rings: fb.R_FireballSnapshot().rings };
		fb.R_FireballClear(); return out;

	};
	const far = near( [ - 400, 200, 3 ], .15 ); same( far.rings, 1, 'a ring' ); same( far.fade, 1, 'whole from well outside its radius' );
	const close = near( [ 100.5, 200, 3.5 ], .15 ); same( close.fade, 0, 'gone with the eye at the burst (well inside the ring)' );
	// at a growing radius the same eye is inside later: the ring passes the camera and fades rather than sweeping across
	const early = near( [ 100 + 50, 200, 3 ], .02 ), late = near( [ 100 + 50, 200, 3 ], .9 );
	check( early.fade > late.fade, 'the same eye: whole while the ring is small (' + early.fade.toFixed( 2 ) + '), fading as it grows past (' + late.fade.toFixed( 2 ) + ')' );
	check( late.fade >= 0 && late.fade <= 1 && early.fade <= 1, 'always within 0 to 1' );

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

Deno.test( 'an exploding box (particle message with count 255) is the Fireball in Newer Game, and its sprite is hidden only while a Fireball stands in for it', async () => {

	const { R_ParseParticleEffect } = await import( '../src/engine/render/render.js' ), common = await import( '../src/engine/common/common.js' ), net = await import( '../src/engine/net/net.js' );
	const feed = ( count, org = [ 10, 20, 30 ] ) => {

		common.SZ_Alloc( net.net_message, 256 ); common.SZ_Clear( net.net_message ); common.COM_SetNetMessage( net.net_message );
		for ( const v of org ) common.MSG_WriteCoord( net.net_message, v );
		for ( let i = 0; i < 3; i ++ ) common.MSG_WriteChar( net.net_message, 0 );
		common.MSG_WriteByte( net.net_message, count ); common.MSG_WriteByte( net.net_message, 75 );
		common.MSG_BeginReading(); R_ParseParticleEffect();

	};
	const sprite = ( at = [ 10, 20, 62 ] ) => ( { model: { name: 'progs/s_explod.spr' }, origin: at } ); // the box's sprite rises 32 above its origin
	const env = setup();
	feed( 255 ); same( fb.R_FireballActive(), 1, 'a box blast spawns one Fireball' );
	feed( 8 ); feed( 254 ); feed( 200 ); same( fb.R_FireballActive(), 1, 'ordinary particle effects (counts 8, 200 and 254) do not' );
	check( fb.R_FireballReplacesSprite( sprite() ), 'the explosion sprite is hidden while the Fireball takes the blast' );
	check( ! fb.R_FireballReplacesSprite( sprite( [ 900, 20, 62 ] ) ), 'a sprite far from any burst is drawn' );
	check( ! fb.R_FireballReplacesSprite( { model: { name: 'progs/s_bubble.spr' }, origin: [ 10, 20, 62 ] } ) && ! fb.R_FireballReplacesSprite( undefined ) && ! fb.R_FireballReplacesSprite( { model: { name: 'progs/s_explod.spr' } } ), 'other sprites, nothing and an entity without an origin are drawn' );
	env.time.now = 10 + 1.2; check( ! fb.R_FireballReplacesSprite( sprite() ), 'a sprite long after the burst is drawn' ); env.time.now = 10;
	fb.r_fireball.value = 0; check( ! fb.R_FireballReplacesSprite( sprite() ), 'r_fireball 0 keeps the sprite' ); fb.r_fireball.value = 1;
	newer( false ); check( ! fb.R_FireballReplacesSprite( sprite() ), 'Classic keeps the sprite' ); fb.R_FireballClear();
	feed( 255 ); same( fb.R_FireballActive(), 0, 'Classic: no Fireball' ); newer( true );
	// the burst is centred on the box, not on its corner on the floor
	fb.R_FireballClear(); feed( 255, [ 0, 0, 0 ] ); fb.R_FireballFrame( env.time.now, ...view ); const origins = fb.R_FireballSnapshot(); void origins;
	check( fb.R_FireballReplacesSprite( sprite( [ 0, 0, 32 ] ) ), 'the sprite at the box (32 up) is covered by the burst placed at the box centre' );
	fb.R_FireballFrame( env.time.now, ...view ); env.time.now = 10.05; fb.R_FireballFrame( env.time.now, ...view );
	const light = [ ...env.lights.values() ].find( l => l.radius > 0 ); check( light, 'the blast has a light' );
	near( light.origin[ 0 ], 16, 1e-3, 'the blast is centred on the box (x)' ); near( light.origin[ 1 ], 16, 1e-3, 'and y' ); near( light.origin[ 2 ], 20 + .4 * fb.FIREBALL.unit, 1e-3, 'and 20 above the floor corner (the light sits .4 units above the centre)' );
	// no Fireball spawned -> no hiding: textures not loaded, and a full pool
	setup( { ready: false } ); feed( 255 ); same( fb.R_FireballActive(), 0, 'no textures: no Fireball' ); check( ! fb.R_FireballReplacesSprite( sprite() ), 'so the sprite is drawn' );
	const env2 = setup(); for ( let i = 0; i < fb.FIREBALL.maxBursts; i ++ ) check( fb.R_FireballSpawn( [ 500 + i * 400, 0, 40 ] ), 'burst ' + i );
	check( ! fb.R_FireballSpawn( [ 9000, 0, 40 ] ), 'the pool is full and refuses the next' ); feed( 255, [ 7000, 7000, 0 ] );
	check( ! fb.R_FireballReplacesSprite( sprite( [ 7000, 7000, 62 ] ) ), 'a blast the Fireball could not take keeps its sprite' ); env2.group();
	// title demo split
	setup(); r_demosplit.value = 2; feed( 255 ); check( fb.R_FireballReplacesSprite( sprite() ), 'in the split the Newer half hides the sprite (the Classic pass, where Newer is off, draws it)' ); r_demosplit.value = 1;

} );

Deno.test( 'a box blast keeps its native particles for Classic and for a pool that cannot take it, and drops them when the Fireball does', async () => {

	const { R_ParseParticleEffect } = await import( '../src/engine/render/render.js' ), common = await import( '../src/engine/common/common.js' ), net = await import( '../src/engine/net/net.js' );
	const feed = ( count, org = [ 10, 20, 30 ] ) => {

		common.SZ_Alloc( net.net_message, 256 ); common.SZ_Clear( net.net_message ); common.COM_SetNetMessage( net.net_message );
		for ( const v of org ) common.MSG_WriteCoord( net.net_message, v );
		for ( let i = 0; i < 3; i ++ ) common.MSG_WriteChar( net.net_message, 0 );
		common.MSG_WriteByte( net.net_message, count ); common.MSG_WriteByte( net.net_message, 75 );
		common.MSG_BeginReading(); R_ParseParticleEffect();

	};
	const total = out => out.reduce( ( n, m ) => n + m.count, 0 );
	let env = setup(); same( total( particles( env, () => feed( 255 ) ) ), 0, 'Newer with the Fireball: no native particles' );
	newer( false ); env = setup(); newer( false ); check( total( particles( env, () => feed( 255 ) ) ) >= 1000, 'Classic: the native 1024-particle burst' );
	newer( true ); env = setup( { ready: false } ); check( total( particles( env, () => feed( 255 ) ) ) >= 1000, 'Newer before the textures load: the native burst' );
	env = setup(); for ( let i = 0; i < fb.FIREBALL.maxBursts; i ++ ) fb.R_FireballSpawn( [ 500 + i * 400, 0, 40 ] );
	check( total( particles( env, () => feed( 255 ) ) ) >= 1000, 'a full pool: the native burst' );
	// the title demo split: the Classic half keeps its particles (flagged classic-only), the Newer half has the Fireball
	env = setup(); r_demosplit.value = 2; const split = particles( env, () => feed( 255 ) ); r_demosplit.value = 1;
	check( split.some( m => m.classicOnly && m.count >= 1000 ), 'split: the Classic half gets the native burst' ); check( ! split.some( m => ! m.classicOnly && m.count > 0 ), 'and the Newer half none' );
	// the light: a box blast lights the room like a rocket's
	env = setup(); feed( 255 ); fb.R_FireballFrame( env.time.now, ...view ); env.time.now = 10.1; fb.R_FireballFrame( env.time.now, ...view ); check( env.lights.size >= 1, 'a box blast has the Fireball\'s dynamic light' );

} );

Deno.test( 'the sprite draw asks the Fireball, and the particle parser routes count 255 (read from the source)', () => {

	const rmain = readFileSync( new URL( '../src/engine/render/gl_rmain.js', import.meta.url ), 'utf8' ), render = readFileSync( new URL( '../src/engine/render/render.js', import.meta.url ), 'utf8' );
	check( /case mod_sprite:\s*if \( R_FireballReplacesSprite\( currententity \) \) break;[^\n]*\s*R_DrawSpriteModel/.test( rmain ), 'the sprite case skips a sprite the Fireball replaces' );
	check( /msgcount === 255/.test( render ), 'the parser routes count 255' );

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

// ---- 01 RPG smoke on rocket and grenade trails --------------------------------------------

const fly = ( env, from, to, type, key, frames = 1 ) => {

	for ( let k = 0; k < frames; k ++ ) {

		const a = from.map( ( v, i ) => v + ( to[ i ] - v ) * k / frames ), b = from.map( ( v, i ) => v + ( to[ i ] - v ) * ( k + 1 ) / frames );
		env.time.now += .02; R_RocketTrail( a, b, type, key );

	}

};

Deno.test( 'rocket and grenade trails use the supplied smoke in Newer Game; everything else keeps the native trail', () => {

	const env = setup(); smoke.R_SmokeTrailClear();
	fly( env, [ 0, 0, 100 ], [ 40, 0, 100 ], 0, 7 ); check( smoke.R_SmokeTrailCount() > 0, 'rocket (type 0) -> supplied smoke' );
	const n = smoke.R_SmokeTrailCount();
	fly( env, [ 0, 50, 100 ], [ 40, 50, 100 ], 1, 8 ); check( smoke.R_SmokeTrailCount() > n, 'grenade (type 1) -> supplied smoke' );
	const m = smoke.R_SmokeTrailCount();
	for ( const type of [ 2, 3, 4, 5, 6 ] ) fly( env, [ 0, 0, 100 ], [ 40, 0, 100 ], type, 9 );
	same( smoke.R_SmokeTrailCount(), m, 'blood, tracer and voor trails are untouched' );
	newer( false ); fly( env, [ 0, 0, 100 ], [ 40, 0, 100 ], 0, 10 );
	same( smoke.R_SmokeTrailCount(), m, 'Classic keeps the native trail' );
	newer( true ); fb.r_smoketrails.value = 0;
	const off = particles( env, () => fly( env, [ 0, 0, 100 ], [ 40, 0, 100 ], 0, 11 ) );
	same( smoke.R_SmokeTrailCount(), m, 'r_smoketrails 0: no supplied smoke' );
	same( off.length, 1, 'r_smoketrails 0 puts the native trail back (one visible native batch)' ); check( ! off[ 0 ].classicOnly, 'as ordinary particles' );
	fb.r_smoketrails.value = 1; fb.R_FireballTextures( null, null );
	const loading = particles( env, () => fly( env, [ 0, 0, 100 ], [ 40, 0, 100 ], 0, 12 ) );
	same( smoke.R_SmokeTrailCount(), m, 'textures not loaded: no supplied smoke' ); same( loading.length, 1, 'textures not loaded: the native trail' );
	fb.R_FireballTextures( ...textures() );
	const nokey = particles( env, () => { env.time.now += .02; R_RocketTrail( [ 0, 0, 100 ], [ 40, 0, 100 ], 0 ); } );
	same( smoke.R_SmokeTrailCount(), m, 'a call without an entity number never shares a carry: no supplied smoke' ); same( nokey.length, 1, '...it keeps the native trail' );

} );

Deno.test( 'smoke puffs are drawn in the shared puff layer in world coordinates, with the rocket\'s exhaust glow', () => {

	const env = setup(); smoke.R_SmokeTrailClear();
	for ( let k = 0; k < 10; k ++ ) { // one segment per rendered frame, as the game does
		env.time.now += .02; R_RocketTrail( [ k * 40, 0, 100 ], [ ( k + 1 ) * 40, 0, 100 ], 0, 7 ); fb.R_FireballFrame( env.time.now, ...view );
	}
	const snap = fb.R_FireballSnapshot(), K = fb.FIREBALL.unit;
	check( snap.puffs > 60 && snap.smoke === snap.puffs, `the trail's puffs are drawn: ${snap.puffs}` );
	same( snap.glows, 1, 'one exhaust glow for the one rocket' );
	const pos = mesh( env, 'fireball_clouds' ).geometry.attributes.aPosSize.array, info = mesh( env, 'fireball_clouds' ).geometry.attributes.aInfo.array;
	for ( let i = 0; i < snap.puffs; i ++ ) {

		check( pos[ i * 4 ] > - 20 && pos[ i * 4 ] < 420 && Math.abs( pos[ i * 4 + 1 ] ) < 40 && pos[ i * 4 + 2 ] > 90 && pos[ i * 4 + 2 ] < 150, 'puff lies along the flight path (Quake axes, z up)' );
		check( pos[ i * 4 + 3 ] > 0 && pos[ i * 4 + 3 ] < 20 * K * .6, 'puff size in world units' );
		check( info[ i * 4 + 1 ] >= 0 && info[ i * 4 + 1 ] <= .94 && info[ i * 4 + 2 ] === - 1, 'translucent smoke (heat -1: not flame)' );

	}
	let visible = 0;
	for ( let i = 0; i < snap.puffs; i ++ ) if ( info[ i * 4 + 1 ] > 0 ) visible ++;
	check( visible > snap.puffs * .8, `most puffs are already visible (the newest fade in over .08 s): ${visible}/${snap.puffs}` );
	const g = mesh( env, 'fireball_flash' ).geometry.attributes, gp = g.aPosSize.array, gc = g.aColor.array;
	near( gp[ 0 ], 400 - .47 * K, 1e-3, 'glow sits .47 source units behind the nose' ); near( gp[ 3 ], .165 * K, 1e-5, 'glow size' );
	check( gc[ 0 ] === 1 && Math.abs( gc[ 1 ] - .35 ) < 1e-6 && Math.abs( gc[ 3 ] - .7 ) < 1e-6, 'the source\'s exhaust colour' );
	// a grenade has no exhaust glow
	fb.R_FireballClear(); env.time.now += .02; R_RocketTrail( [ 0, 0, 100 ], [ 30, 0, 100 ], 1, 3 ); fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballSnapshot().glows, 0, 'no glow behind a grenade' );
	// the glow exists only on frames the rocket moved
	R_RocketTrail( [ 0, 0, 100 ], [ 30, 0, 100 ], 0, 3 ); env.time.now += .02; fb.R_FireballFrame( env.time.now, ...view ); env.time.now += .02; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballSnapshot().glows, 0, 'a rocket that has stopped leaves no glow behind' );

} );

Deno.test( 'smoke puffs are scaled, boosted and faded near the eye exactly as documented', () => {

	const env = setup(); smoke.R_SmokeTrailClear();
	const K = smoke.SMOKE.unit, eye = view[ 0 ];
	// a flight that starts 40 units from the eye and runs away from it
	for ( let k = 0; k < 8; k ++ ) { env.time.now += .02; R_RocketTrail( [ eye[ 0 ] + 40 + k * 40, eye[ 1 ], eye[ 2 ] ], [ eye[ 0 ] + 80 + k * 40, eye[ 1 ], eye[ 2 ] ], 1, 5 ); fb.R_FireballFrame( env.time.now, ...view ); }
	const expected = [];
	smoke.forEachSmoke( env.time.now, smoke.SMOKE, smoke.SMOKE.timeScale, ( x, y, z, size, angle, alpha ) => {

		const w = [ x * K, z * K, y * K ], d = Math.hypot( w[ 0 ] - eye[ 0 ], w[ 1 ] - eye[ 1 ], w[ 2 ] - eye[ 2 ] );
		const s = Math.min( Math.max( ( d - 24 ) / ( 110 - 24 ), 0 ), 1 );
		expected.push( { w, size: size * K * smoke.SMOKE.sizeScale, alpha: Math.min( alpha * smoke.alphaBoost, .94 ) * s * s * ( 3 - 2 * s ), d } );

	} );
	const pos = mesh( env, 'fireball_clouds' ).geometry.attributes.aPosSize.array, info = mesh( env, 'fireball_clouds' ).geometry.attributes.aInfo.array, n = fb.R_FireballSnapshot().puffs;
	same( n, expected.length, 'one instance per live puff' );
	let near1 = 0, far1 = 0;
	for ( const e of expected ) {

		let hit = - 1;
		for ( let i = 0; i < n; i ++ ) if ( Math.hypot( pos[ i * 4 ] - e.w[ 0 ], pos[ i * 4 + 1 ] - e.w[ 1 ], pos[ i * 4 + 2 ] - e.w[ 2 ] ) < 1e-2 ) { hit = i; break; }
		check( hit >= 0, 'every puff is at its source-space position scaled to world units' );
		near( pos[ hit * 4 + 3 ], e.size, 1e-3, 'size = source size x unit x sizeScale' );
		near( info[ hit * 4 + 1 ], e.alpha, 1e-5, 'alpha = source alpha x alphaBoost, faded near the eye' );
		if ( e.d < 60 ) near1 ++; if ( e.d > 150 ) far1 ++;

	}
	check( near1 > 0 && far1 > 0, `the sample covers puffs inside the fade and well outside it: ${near1}/${far1}` );
	check( smoke.alphaBoost > 1.5 && smoke.alphaBoost < 3.5, 'alphaBoost compensates the wider spacing for the larger puffs: ' + smoke.alphaBoost );

} );

Deno.test( 'trail smoke and explosion clouds are sorted together, expire, and clear on Classic, a clock jump and a map change', () => {

	const env = setup(); smoke.R_SmokeTrailClear();
	fly( env, [ 0, 0, 100 ], [ 300, 0, 100 ], 0, 7, 8 );
	fb.R_FireballSpawn( [ 150, 0, 100 ] ); fb.R_FireballFrame( env.time.now, ...view );
	env.time.now += .3; fb.R_FireballFrame( env.time.now, ...view );
	const pos = mesh( env, 'fireball_clouds' ).geometry.attributes.aPosSize.array, snap = fb.R_FireballSnapshot();
	check( snap.puffs > snap.smoke, 'explosion clouds and smoke share the layer' );
	let last = Infinity;
	for ( let i = 0; i < snap.puffs; i ++ ) { const d = pos[ i * 4 ] - view[ 0 ][ 0 ]; check( d <= last + 1e-3, 'all puffs sorted far to near' ); last = d; }
	check( snap.puffs <= snap.capacity.puffs, 'inside the preallocated buffer' );
	env.time.now += 8 / smoke.SMOKE.timeScale + 5; fb.R_FireballFrame( env.time.now, ...view );
	same( fb.R_FireballSnapshot().puffs, 0, 'everything has expired' ); same( env.group().visible, false, 'nothing drawn' );
	fly( env, [ 0, 0, 100 ], [ 300, 0, 100 ], 0, 7, 8 ); newer( false ); fb.R_FireballFrame( env.time.now, ...view );
	same( smoke.R_SmokeTrailCount(), 0, 'switching to Classic mid-trail removes the smoke' ); newer( true );
	fly( env, [ 0, 0, 100 ], [ 300, 0, 100 ], 0, 7, 8 ); fb.R_FireballFrame( env.time.now, ...view );
	env.time.now -= 30; fb.R_FireballFrame( env.time.now, ...view );
	same( smoke.R_SmokeTrailCount(), 0, 'a clock jump back of seconds (demo loop, new game) clears the smoke' );
	fly( env, [ 0, 0, 100 ], [ 300, 0, 100 ], 0, 7, 8 ); fb.R_FireballClear();
	same( smoke.R_SmokeTrailCount(), 0, 'a map change clears the smoke' );

} );

Deno.test( 'title-demo split: trails get the supplied smoke for the enhanced half and a hidden native trail for the classic half', () => {

	const env = setup(); smoke.R_SmokeTrailClear();
	r_demosplit.value = 2;
	const split = particles( env, () => fly( env, [ 0, 0, 100 ], [ 30, 0, 100 ], 0, 7 ) );
	r_demosplit.value = 1;
	check( smoke.R_SmokeTrailCount() > 0, 'the supplied smoke exists for the Newer half' );
	same( split.length, 1, 'one native batch' ); check( split[ 0 ].classicOnly && ! split[ 0 ].visible, 'it is the Classic-only mesh' );
	same( particles( env, () => fly( env, [ 0, 0, 100 ], [ 30, 0, 100 ], 0, 8 ) ).length, 0, 'outside the split the native trail is not drawn at all' );
	newer( false );
	const classic = particles( env, () => fly( env, [ 0, 0, 100 ], [ 30, 0, 100 ], 0, 9 ) );
	same( classic.length, 1, 'Classic: the native trail' ); check( ! classic[ 0 ].classicOnly, 'as ordinary visible particles' );

} );

Deno.test( 'the engine passes each missile\'s entity number so every trail keeps its own spacing', () => {

	const text = readFileSync( new URL( '../src/engine/client/cl_main.js', import.meta.url ), 'utf8' );
	check( /R_RocketTrail\( _peOldorg, ent\.origin, 0, s1\.number \)/.test( text ), 'live rocket trail call passes the entity number' );
	check( /R_RocketTrail\( _peOldorg, ent\.origin, 1, s1\.number \)/.test( text ), 'live grenade trail call passes the entity number' );
	check( /R_RocketTrail\( _relinkOldorg, ent\.origin, 0, i \)/.test( text ), 'demo-playback rocket trail call passes the entity number' );
	check( /R_RocketTrail\( _relinkOldorg, ent\.origin, 1, i \)/.test( text ), 'demo-playback grenade trail call passes the entity number' );
	const calls = [ ...text.matchAll( /R_RocketTrail\( ([^)]*) \)/g ) ].map( m => m[ 1 ].split( ',' ).map( v => v.trim() ) ).filter( a => a[ 2 ] === '0' || a[ 2 ] === '1' );
	same( calls.length, 4, 'there are exactly four rocket/grenade trail call sites' );
	check( calls.every( a => a.length === 4 ), 'and every one passes a key' );

} );
