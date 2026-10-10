// Shotgun pellets and underwater bubbles (the supplied ARC ShotgunEffect): the ported kinematics, shaders and
// bubbles against the source's own code, and the public behaviour that turns native rays into pellets. WebGL
// is not involved: the instance buffers a frame writes are inspected, so these checks claim no GPU pixel
// parity (tests/shotgun_trial.html photographs it). The native rays themselves are tests/shotgun_native_test.js.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { cvar_t, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { GL_DrawAliasFrame } from '../src/engine/render/gl_mesh.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import * as sg from '../src/newer/render/r_shotgun.js';

const SOURCE_SHA256 = '8b1569225ae56f2e53a6f5748435e77699aa7e0f1c8c0082a12cfc3d0a401adf';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const near = ( a, b, eps, label ) => { if ( ! ( Math.abs( a - b ) <= eps ) ) throw new Error( `${label}: ${a} != ${b}` ); };
const same = ( a, b, label ) => { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); };
const K = sg.SHOTGUN.unit;

const pak = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.length ) ) );
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data );
Cvar_RegisterVariable( new cvar_t( 'r_hdr', '1' ) );
if ( ! sg.r_shotgunfx.registered ) Cvar_RegisterVariable( sg.r_shotgunfx );

// the source, run in a sandbox, or null (with a console note) when it is not here
function loadSource() {

	const path = new URL( '../arc-weapons-wall-canvas-shotgun.html', import.meta.url );
	const need = process.env.QUAKED_FIREBALL_SOURCE_REQUIRED === '1', skip = why => { if ( need ) throw new Error( why + ' (QUAKED_FIREBALL_SOURCE_REQUIRED=1)' ); console.log( 'SKIPPED source equivalence: ' + why ); return null; };
	if ( ! existsSync( path ) ) return skip( 'source file not present locally' );
	const bytes = readFileSync( path );
	if ( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) !== SOURCE_SHA256 ) return skip( 'different source revision' );
	const text = bytes.toString( 'utf8' ), from = text.indexOf( 'const SHOTGUN_PRESETS' ), to = text.indexOf( '// ─── Small math library' );
	check( from > 0 && to > from, 'the effect class was located in the source' );
	const ctx = { Math };
	runInNewContext( text.slice( from, to ) + '\nthis.ShotgunEffect=ShotgunEffect;this.sgDistance=sgDistance;this.sgTimeAt=sgTimeAt;this.sgRandom=sgRandom;this.V=SHOTGUN_VERTEX_SHADER;this.F=SHOTGUN_FRAGMENT_SHADER;this.M=SHOTGUN_PELLET_MOTION;', ctx );
	return { ...ctx, text };

}

// a source pellet's cosmetic values as the port takes them
const draws = ( p, base ) => ( { speed: p.speed / base, radius: p.radius, seed: p.seed, nextBubble: p.nextBubble, spacing: p.spacing } );

Deno.test( 'the random stream, pellet flight and trail equal the source\'s own at its own speed, in air and under water, and the speeds are doubled', () => {

	const src = loadSource();
	if ( ! src ) return;
	// the random numbers
	const a = src.sgRandom( 84391 ), b = sg.sgRandom( 84391 );
	for ( let i = 0; i < 1000; i ++ ) same( a(), b(), 'random ' + i );
	same( sg.SHOTGUN.airSpeed, 2 * src.M.airSpeed, 'air speed is the source\'s doubled' ); same( sg.SHOTGUN.underwaterSpeed, 2 * src.M.underwaterSpeed, 'water speed is the source\'s doubled' ); same( sg.SHOTGUN.speedScale, 2, 'the doubling' );
	same( sg.SHOTGUN.trailSeconds, src.M.trailSeconds, 'trail seconds' ); same( sg.SHOTGUN.maxTrail, src.M.maxTrailLength, 'max trail' );
	let compared = 0;
	for ( const underwater of [ false, true ] ) for ( const reach of [ 4, 11.5, 22, 40 ] ) {

		const effect = new src.ShotgunEffect( null, { raycast: reach < 30 ? () => ( { distance: reach } ) : null } );
		effect.fire( { mode: 'double', origins: [ [ 0, 1, 0 ], [ 0, 1, 0 ] ], direction: [ 0, 0, - 1 ], underwater, spreadHalfAngleDeg: 7.2 } );
		for ( const p of effect.pellets ) {

			// (the source's pellet speed is given to the port as a factor of the port's own, doubled, speed: the kinematics are then compared at one speed)
			const base = underwater ? sg.SHOTGUN.underwaterSpeed : sg.SHOTGUN.airSpeed;
			// (an all-water pellet is one water span over its whole path)
			const mine = sg.makePellet( { origin: [ 0, 0, 0 ], dir: [ 0, 0, 1 ], distance: p.distance, underwater, waterSpans: underwater ? [ [ 0, p.distance ] ] : [], c: draws( p, base ) } );
			near( mine.life, p.life, 1e-12, 'life' );
			for ( const age of [ 0, .004, .016, .05, .2, .5, 1, 2, p.life, p.life + 1 ] ) {

				near( sg.pelletDistance( mine, age ), Math.min( p.distance, src.sgDistance( p, age ) ), 1e-12, `distance at ${age}` );
				near( sg.pelletTrailLength( mine, age ), effect._pelletTrailLength( p, age ), 1e-12, `trail at ${age}` );
				compared += 2;

			}
			for ( const d of [ .1, 1, p.distance / 2, p.distance ] ) { near( sg.pelletTimeAt( mine, d ), src.sgTimeAt( p, d ), 1e-12, 'time at distance' ); compared ++; }

		}

	}
	check( compared > 1500, 'comparisons: ' + compared );

} );

Deno.test( 'a bubble and a pellet\'s wake are the source\'s, at any frame rate', () => {

	const src = loadSource();
	if ( ! src ) return;
	// one bubble: placement over its life, in the source's axes (x, y up, z) against Quake's (x, y, z up)
	const effect = new src.ShotgunEffect( null, {} );
	let n = 0;
	for ( const [ dir, seed, scale ] of [ [ [ 1, 0, 0 ], .31, 1 ], [ [ .6, -.3, .74 ], .77, .6 ], [ [ 0, 0, 1 ], .05, 1 ] ] ) {

		effect.bubbles.length = 0; effect.time = 0;
		effect._addBubble( [ 0, 0, 0 ], dir, 0, seed, scale ); const s = effect.bubbles[ 0 ];
		const mine = sg.makeBubble( [ 0, 0, 0 ], [ dir[ 0 ], dir[ 2 ], dir[ 1 ] ], 0, seed, scale ); // (Quake y is the source's z)
		for ( const k of [ 'life', 'radius', 'rise', 'seed', 'drift' ] ) near( mine[ k ], s[ k ], 1e-12, 'bubble ' + k );
		for ( const t of [ .01, .1, .5, 1, 1.3 ] ) { // (all within the bubble's life)

			effect.update( t - effect.time ); const q = sg.bubbleAt( mine, t, [ 0, 0, 0 ] );
			near( q[ 0 ], K * s.position[ 0 ], 1e-9, 'x' ); near( q[ 1 ], K * s.position[ 2 ], 1e-9, 'y' ); near( q[ 2 ], K * s.position[ 1 ], 1e-9, 'rises along Quake z' ); n += 3;

		}

	}
	// the wake of a pellet under water: the same births from one big step and from many small ones
	const wake = new src.ShotgunEffect( null, { raycast: () => ( { distance: 20 } ) } );
	wake.fire( { mode: 'single', origins: [ [ 0, 1, 0 ] ], direction: [ 1, 0, 0 ], underwater: true, spreadHalfAngleDeg: 0 } );
	const pellets = wake.pellets.slice( 0, 3 ), ours = pellets.map( p => sg.makePellet( { origin: [ 0, 0, 0 ], dir: [ 1, 0, 0 ], distance: p.distance, underwater: true, waterSpans: [ [ 0, p.distance ] ], c: draws( p, sg.SHOTGUN.underwaterSpeed ) } ) );
	wake.bubbles.length = 0; const muzzle = wake.totalBubbles;
	wake.pellets = pellets; wake.bubbles.length = 0;
	for ( let t = 0; t < 1.6; t += 1 / 144 ) wake.update( 1 / 144 );
	const sourceBorn = wake.bubbles.map( b => b.born ).sort( ( a, b ) => a - b );
	const mineSmall = [], mineBig = [];
	for ( const p of ours ) { const copy = structuredClone( p ); for ( let t = 0; t <= 1.6 + 1e-9; t += 1 / 144 ) sg.emitWake( copy, t, b => mineSmall.push( b ) ); }
	for ( const p of ours ) { const copy = structuredClone( p ); sg.emitWake( copy, 1.6, b => mineBig.push( b ) ); }
	check( mineBig.length > 20, 'a real wake: ' + mineBig.length );
	same( mineSmall.length, mineBig.length, 'a long step and many short ones make the same number of bubbles' );
	const key = list => list.map( b => b.born ).sort( ( a, b ) => a - b );
	key( mineBig ).forEach( ( t, i ) => near( t, key( mineSmall )[ i ], 1e-9, 'birth ' + i ) );
	// the source's own list (bubbles still alive at 1.6 s, born after the limit) is a subset of ours, with the same births
	const aliveMine = mineBig.filter( b => 1.6 - b.born < b.life ).map( b => b.born );
	check( sourceBorn.length > 0 && sourceBorn.every( t => aliveMine.some( m => Math.abs( m - t ) < 1e-6 ) ), 'every bubble the source has is one of ours, born when the source born it' );
	check( n === 45, 'bubble placements compared: ' + n );

} );

Deno.test( 'the pellet, bubble and smoke shaders are the source\'s, statement for statement', () => {

	const src = loadSource();
	if ( ! src ) return;
	const flat = text => text.replace( /\s+/g, '' ).replace( /texture2D\(/g, 'texture(' );
	const fragment = flat( src.F );
	const mine = sg.SHOTGUN_SHADERS.fragment;
	// the pellet branch and the bubble branch of the fragment shader
	const branch = ( text, from, to ) => text.slice( text.indexOf( from ), text.indexOf( to ) );
	const pellet = flat( branch( mine, 'float along=', '}else if(kind>1.5)' ) ).split( ';' ).filter( Boolean );
	const wisp = flat( branch( mine, 'p.x+=sin', '}else{\n  float ring' ) ).split( ';' ).filter( Boolean );
	const bubble = flat( branch( mine, 'float ring=', 'if(max(max' ) ).split( ';' ).filter( Boolean );
	const helpers = flat( branch( mine, 'float h(vec2', 'void main' ) ).split( ';' ).filter( Boolean ).map( x => x + ';' );
	check( wisp.length >= 4 && helpers.length >= 2, 'the smoke branch and its noise helpers were found' );
	for ( const x of helpers ) check( fragment.includes( x.replace( /;$/, '' ) ), 'the source has the helper: ' + x );
	let compared = 0;
	for ( const s of [ ...pellet, ...wisp, ...bubble ] ) { check( fragment.includes( s ), 'the source has the fragment statement: ' + s ); compared ++; }
	check( compared >= 19, 'fragment statements compared: ' + compared );
	check( fragment.includes( 'if(max(max(radiance.r,radiance.g),max(radiance.b,alpha))<.0005)discard;' ) && flat( mine ).includes( 'if(max(max(radiance.r,radiance.g),max(radiance.b,alpha))<.0005)discard;' ), 'the discard threshold' );
	// the vertex shader: the pellet ribbon branch, with the few changes the renderer needs listed
	const vertex = flat( src.V );
	const changes = new Map( [ [ 'floatradiusPx=max(aPositionRadius.w*S*uProjectionScale/max(edge.w,nearW),1.45)', 'floatradiusPx=max(aPositionRadius.w*uProjectionScale/max(edge.w,.055),1.45)' ] ] );
	const ribbon = flat( branch( sg.SHOTGUN_SHADERS.vertex, 'float nearHead', '#include <clipping_planes_vertex>' ) ).split( ';' ).filter( Boolean );
	let ribbons = 0;
	for ( const s of ribbon ) { const original = changes.get( s ) ?? s; check( vertex.includes( original ), 'the source has the vertex statement: ' + original ); ribbons ++; }
	check( ribbons >= 15, 'vertex statements compared: ' + ribbons );
	same( sg.SHOTGUN.maxPellets, 256, 'default pellet pool' ); same( sg.SHOTGUN.maxBubbles, 1800, 'default bubble pool' );
	check( src.text.includes( 'maxDistance=underwater?23:30' ) && src.text.includes( 'drag=underwater?.45:0' ), 'range and drag located in fire()' );

} );

// ---------------------------------------------------------------------------
// Behaviour: native rays in, pellets out
// ---------------------------------------------------------------------------

const muzzle = [ 100, 0, 50 ];
const ray = ( x, y, z, water = [] ) => ( { start: [ 90, 0, 56 ], end: [ x, y, z ], water } );
const event = ( weapon, rays, extra = {} ) => ( { kind: 'rays', id: 1, weapon, function: weapon === 2 ? 'W_FireSuperShotgun' : 'W_FireShotgun', rays, submerged: false, ...extra } );
const sixRays = () => Array.from( { length: 6 }, ( _, i ) => ray( 700, ( i - 2.5 ) * 12, 50 + i * 3 ) );

function setup( contents = undefined ) {

	sg.R_ShotgunClear();
	const scene = new THREE.Scene();
	sg.R_ShotgunSetup( { scene, muzzles: count => count === 2 ? [ [ 100, - 3, 50 ], [ 100, 3, 50 ] ] : [ muzzle ], contents } );
	Cvar_SetValue( 'r_hdr', 1 ); sg.r_shotgunfx.value = 1; R_AnimSetClassicPass( false );
	return { scene, group: () => scene.children.find( c => c.name === 'quake_shotgun' ) };

}

Deno.test( 'each native pellet ray becomes one pellet from the muzzle along the muzzle-to-hit line, all the way to the hit', () => {

	setup();
	const random = Math.random; let drawn = 0; Math.random = () => { drawn ++; return random(); };
	try {

		same( sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 5 ), 6, 'the shotgun: six pellets' );

	} finally { Math.random = random; }
	same( drawn, 0, 'no game random numbers are drawn' );
	const list = sg.R_ShotgunPellets();
	same( list.length, 6, 'six live pellets' );
	list.forEach( ( p, i ) => {

		const end = sixRays()[ i ].end, length = Math.hypot( end[ 0 ] - muzzle[ 0 ], end[ 1 ] - muzzle[ 1 ], end[ 2 ] - muzzle[ 2 ] );
		same( p.origin.join(), muzzle.join(), 'leaves the muzzle' );
		for ( let k = 0; k < 3; k ++ ) near( p.direction[ k ], ( end[ k ] - muzzle[ k ] ) / length, 1e-9, 'aims at where the native ray stopped' );
		near( p.distance, length / K, 1e-9, 'flies all the way to where the game\'s ray stopped' );
		same( p.born, 5, 'born at the time of the frame' ); check( p.life > 0 && p.life < 1, 'life ' + p.life );

	} );
	// a hit close by ends the flight there, a far one is not cut short at 30 source units
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 1, [ ray( 220, 0, 50 ) ] ), [ muzzle ], 0 );
	near( sg.R_ShotgunPellets()[ 0 ].distance, 120 / K, 1e-9, 'a wall 120 units away' );
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 1, [ ray( 2100, 0, 50 ) ] ), [ muzzle ], 0 );
	near( sg.R_ShotgunPellets()[ 0 ].distance, 2000 / K, 1e-9, 'a hit 2,000 units away is reached (83 source units)' );
	// a target closer than the muzzle's reach: the pellet leaves from the game's own start instead of flying backwards
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 1, [ { start: [ 90, 0, 56 ], end: [ 95, 0, 56 ], water: [] } ] ), [ muzzle ], 0 );
	check( sg.R_ShotgunPellets()[ 0 ].direction[ 0 ] > 0 && sg.R_ShotgunPellets()[ 0 ].origin.join() === '90,0,56', 'a point-blank pellet does not fly backwards' );

} );

Deno.test( 'the super shotgun\'s fourteen pellets alternate between its two barrels', () => {

	setup();
	const rays = Array.from( { length: 14 }, ( _, i ) => ray( 700, ( i - 6.5 ) * 8, 50 ) ), left = [ 100, - 3, 50 ], right = [ 100, 3, 50 ];
	same( sg.R_ShotgunFire( event( 2, rays ), [ left, right ], 0 ), 14, 'fourteen pellets' );
	sg.R_ShotgunPellets().forEach( ( p, i ) => { same( p.barrel, i % 2, 'barrel ' + i ); same( p.origin.join(), ( i % 2 ? right : left ).join(), 'from its own barrel' ); } );
	same( sg.R_ShotgunFire( event( 2, rays ), [ left ], 0 ), 0, 'one muzzle for two barrels draws nothing rather than guessing' );
	// the super shotgun's one-shell fallback is the single gun's blast: one barrel, though the player holds the super shotgun
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 2, rays.slice( 0, 6 ), { function: 'W_FireShotgun' } ), [ left ], 0 );
	check( sg.R_ShotgunPellets().length === 6 && sg.R_ShotgunPellets().every( p => p.barrel === 0 ), 'one barrel' );
	same( sg.R_ShotgunFire( event( 1, rays ), null, 0 ), 0, 'no muzzle, no pellets' );

} );

Deno.test( 'under water: slower pellets, a wake only where it is wet, and bubbles at the muzzle', () => {

	setup();
	// 30 units of air then water: the ray enters the water 200 units out
	const mixed = [ ray( 800, 0, 50, [ [ 200, 800 ] ] ) ];
	sg.R_ShotgunFire( event( 1, mixed ), [ muzzle ], 0 );
	const p = sg.R_ShotgunPellets()[ 0 ];
	check( p.segs.length === 2 && ! p.segs[ 0 ].water && p.segs[ 1 ].water, 'air then water' );
	near( p.segs[ 0 ].d1, 200 / Math.hypot( 710, 0, 6 ) * ( 700 / K ), 1e-6, 'the surface is where the native ray crosses it, mapped onto the pellet\'s path' );
	check( p.segs[ 0 ].v > p.segs[ 1 ].v, 'faster through the air' ); same( p.segs[ 1 ].k, sg.SHOTGUN.drag, 'with drag in the water' );
	near( sg.pelletDistance( p, sg.pelletTimeAt( p, 4 ) ), 4, 1e-9, 'distance and time are inverses across the surface' );
	near( sg.pelletDistance( p, sg.pelletTimeAt( p, 12 ) ), 12, 1e-9, 'also in the water' );
	const born = []; sg.emitWake( p, p.born + p.life, b => born.push( b ) );
	check( born.length > 0 && born.every( b => b.oz !== undefined && b.ox > muzzle[ 0 ] + 200 - 1e-6 ), 'every wake bubble is past the surface: ' + born.length );
	// a blast fired from under water: range 23, four muzzle bubbles per barrel, all rising
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 2, sixRays().concat( sixRays() ).slice( 0, 14 ).map( r => ( { ...r, water: [ [ 0, 500 ] ] } ) ), { submerged: true } ), [ [ 100, - 3, 50 ], [ 100, 3, 50 ] ], 1 );
	same( sg.R_ShotgunBubbles().length, 8, 'four bubbles for each of two barrels' ); check( sg.R_ShotgunPellets().every( q => q.underwater && q.wet ), 'every pellet of an underwater blast is in water' );
	for ( const b of sg.R_ShotgunBubbles() ) { const a = sg.bubbleAt( b, 1, [ 0, 0, 0 ] ), c = sg.bubbleAt( b, 1.8, [ 0, 0, 0 ] ); check( c[ 2 ] > a[ 2 ] && a[ 2 ] > b.oz, 'bubbles rise along +z' ); }
	// in air there are no bubbles at all
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 2, sixRays() ), [ [ 100, - 3, 50 ], [ 100, 3, 50 ] ], 1 );
	same( sg.R_ShotgunBubbles().length, 0, 'no muzzle bubbles in air' ); check( sg.R_ShotgunPellets().every( q => ! q.wet ), 'and no wake' );

} );

Deno.test( 'a frame draws pellets and bubbles in world coordinates, sorted back to front, and lets go of them when they are done', () => {

	const env = setup(), eye = [ 0, 0, 50 ], forward = [ 1, 0, 0 ], view = [ 1280, 720 ];
	sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 10 );
	sg.R_ShotgunFrame( 10.1, eye, forward, view );
	let snap = sg.R_ShotgunSnapshot(); same( snap.drawn.pellets, 6, 'six pellets drawn' ); check( snap.drawn.smoke >= 1, 'and the first muzzle wisp, born 26 ms after the shot' ); same( snap.instances, 6 + snap.drawn.smoke, 'one instance each' ); check( env.group().visible && env.group().userData.newerOnly, 'visible, and Newer Game only' );
	const attr = env.group().children[ 0 ].geometry.getAttribute( 'aPositionRadius' ).array, motion = env.group().children[ 0 ].geometry.getAttribute( 'aMotionKind' ).array;
	const p0 = sg.R_ShotgunPellets()[ 0 ], d = sg.pelletDistance( p0, .1 ) * K;
	let found = false;
	for ( let i = 0; i < snap.instances; i ++ ) if ( motion[ i * 4 + 3 ] === 0 && Math.abs( attr[ i * 4 + 1 ] - ( p0.origin[ 1 ] + p0.direction[ 1 ] * d ) ) < 1e-3 ) { found = true; near( attr[ i * 4 ], p0.origin[ 0 ] + p0.direction[ 0 ] * d, 1e-3, 'x' ); near( attr[ i * 4 + 3 ], p0.radius * K, 1e-6, 'radius in Quake units' ); same( motion[ i * 4 + 3 ], 0, 'kind 0: a pellet' ); check( Math.hypot( motion[ i * 4 ], motion[ i * 4 + 1 ], motion[ i * 4 + 2 ] ) <= sg.SHOTGUN.maxTrail * K + 1e-6, 'the streak is at most the source\'s .95 units long' ); }
	check( found, 'a pellet is where the flight says' );
	// sorted far to near
	const depth = i => ( attr[ i * 4 ] - eye[ 0 ] ) * forward[ 0 ];
	for ( let i = 1; i < snap.instances; i ++ ) check( depth( i - 1 ) >= depth( i ) - 1e-3, 'back to front' );
	// pause: the same time draws the same frame
	const before = Array.from( attr ).join(); sg.R_ShotgunFrame( 10.1, eye, forward, view ); same( Array.from( env.group().children[ 0 ].geometry.getAttribute( 'aPositionRadius' ).array ).join(), before, 'a frozen clock freezes the picture' );
	// all pellets end; nothing is left
	sg.R_ShotgunFrame( 12, eye, forward, view ); snap = sg.R_ShotgunSnapshot(); same( snap.pellets + snap.bubbles + snap.instances, 0, 'nothing is left after the flight' ); check( ! snap.visible, 'and the layer is hidden' );

} );

Deno.test( 'bounded, and cleared by Classic, the effect switch, a map change and the clock jumping back', () => {

	const env = setup(), eye = [ 0, 0, 50 ], forward = [ 1, 0, 0 ], view = [ 1280, 720 ];
	for ( let i = 0; i < 40; i ++ ) sg.R_ShotgunFire( event( 2, Array.from( { length: 14 }, ( _, j ) => ray( 700, j * 4 - 28, 50 ) ) ), [ [ 100, - 3, 50 ], [ 100, 3, 50 ] ], 1 );
	same( sg.R_ShotgunPellets().length, sg.SHOTGUN.maxPellets, 'the pellet pool is bounded at 256' );
	for ( let i = 0; i < 400; i ++ ) sg.R_ShotgunFire( event( 1, [ ray( 700, 0, 50, [ [ 0, 900 ] ] ) ], { submerged: true } ), [ muzzle ], 1 );
	sg.R_ShotgunFrame( 1.2, eye, forward, view ); check( sg.R_ShotgunSnapshot().instances <= sg.SHOTGUN.maxPellets + sg.SHOTGUN.maxBubbles + sg.SHOTGUN.maxSmoke, 'the instance buffer cannot overflow' ); check( sg.R_ShotgunBubbles().length <= sg.SHOTGUN.maxBubbles, 'the bubble pool is bounded at 1,800' );
	sg.R_ShotgunClear(); same( sg.R_ShotgunPellets().length + sg.R_ShotgunBubbles().length, 0, 'a map change clears' );
	sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 5 ); sg.R_ShotgunFrame( 5.1, eye, forward, view ); check( sg.R_ShotgunSnapshot().instances > 0, 'drawn' );
	Cvar_SetValue( 'r_hdr', 0 ); sg.R_ShotgunFrame( 5.2, eye, forward, view ); same( sg.R_ShotgunSnapshot().pellets, 0, 'Classic Quake: none' ); Cvar_SetValue( 'r_hdr', 1 );
	sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 5 ); sg.r_shotgunfx.value = 0; sg.R_ShotgunFrame( 5.3, eye, forward, view ); same( sg.R_ShotgunSnapshot().pellets, 0, 'r_shotgunfx 0: none' ); check( ! env.group().visible, 'hidden' ); sg.r_shotgunfx.value = 1;
	sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 50 ); sg.R_ShotgunFrame( 50.1, eye, forward, view ); sg.R_ShotgunFrame( 3, eye, forward, view ); same( sg.R_ShotgunSnapshot().pellets, 0, 'the clock jumping back (a demo loop, a new game) clears' );

} );

Deno.test( 'the muzzle is the front of the viewmodel\'s own geometry: one point, or the two barrels of the super shotgun', () => {

	const single = Mod_ForName( 'progs/v_shot.mdl', true ), double = Mod_ForName( 'progs/v_shot2.mdl', true );
	const place = model => { const mesh = new THREE.Mesh(); mesh.position.set( 10, 20, 30 ); mesh.rotation.z = Math.PI / 2; mesh.updateMatrixWorld( true ); return mesh; };
	const mesh = place(), a = GL_DrawAliasFrame( single.cache.data, 0 ), b = GL_DrawAliasFrame( double.cache.data, 0 );
	const one = sg.viewModelMuzzles( mesh, a, 1 ), two = sg.viewModelMuzzles( mesh, b, 2 );
	same( one.length, 1, 'one muzzle' ); same( two.length, 2, 'two barrels' );
	// in the model's own space the front is its largest x; the mesh is turned 90 degrees about z and moved, so it becomes world +y of (10, 20, 30)
	const P = a.posAttr.array; let hi = - Infinity; for ( let i = 0; i < P.length; i += 3 ) hi = Math.max( hi, P[ i ] );
	near( one[ 0 ][ 1 ], 20 + hi, 4, 'the muzzle is at the model\'s front, in world space' ); near( one[ 0 ][ 0 ], 10, 4, 'on the barrel axis' );
	const Q = b.posAttr.array; let hi2 = - Infinity; for ( let i = 0; i < Q.length; i += 3 ) hi2 = Math.max( hi2, Q[ i ] );
	near( two[ 0 ][ 1 ], 20 + hi2, 4, 'both barrels at the front' ); near( two[ 1 ][ 1 ], 20 + hi2, 4, 'both barrels at the front' );
	check( Math.abs( two[ 0 ][ 0 ] - two[ 1 ][ 0 ] ) > 1, 'the barrels are side by side: ' + Math.abs( two[ 0 ][ 0 ] - two[ 1 ][ 0 ] ).toFixed( 2 ) + ' units apart' );
	same( sg.viewModelMuzzles( null, a, 1 ), null, 'no mesh, no muzzle' ); same( sg.viewModelMuzzles( mesh, null, 1 ), null, 'no geometry, no muzzle' );

} );

Deno.test( 'bubbles fade in over 35 ms and out over their last half second, as the source draws them', () => {

	const env = setup(), eye = [ 0, 0, 50 ], forward = [ 1, 0, 0 ], view = [ 1280, 720 ];
	sg.R_ShotgunFire( event( 1, [ ray( 700, 0, 50, [ [ 0, 900 ] ] ) ], { submerged: true } ), [ muzzle ], 100 );
	const b = sg.R_ShotgunBubbles()[ 0 ], alphaAt = age => {

		sg.R_ShotgunFrame( b.born + age, eye, forward, view );
		const A = env.group().children[ 0 ].geometry.getAttribute( 'aProperties' ).array, K4 = env.group().children[ 0 ].geometry.getAttribute( 'aMotionKind' ).array;
		for ( let i = 0; i < env.group().children[ 0 ].geometry.instanceCount; i ++ ) if ( K4[ i * 4 + 3 ] === 1 && Math.abs( env.group().children[ 0 ].geometry.getAttribute( 'aProperties' ).array[ i * 4 + 2 ] - age / b.life ) < 1e-6 ) return A[ i * 4 ];
		return null;

	};
	const fadeIn = alphaAt( .0175 ), full = alphaAt( 1 ), out = alphaAt( b.life - .25 );
	near( fadeIn, .5, 1e-6, 'half way through the 35 ms fade-in' ); same( full, 1, 'fully opaque in the middle of its life' );
	near( out, Math.pow( .5, .8 ), 1e-6, 'fading out over the last half second' );

} );

Deno.test( 'the muzzle comes out in the scene\'s own units, even when the scene is scaled (XR)', () => {

	const scene = new THREE.Scene(); scene.scale.setScalar( 1 / 32 ); // as webxr.js scales the scene to metres
	const mesh = new THREE.Mesh(); mesh.position.set( 10, 20, 30 ); scene.add( mesh ); scene.updateMatrixWorld( true );
	const a = GL_DrawAliasFrame( Mod_ForName( 'progs/v_shot.mdl', true ).cache.data, 0 );
	const unscaled = new THREE.Mesh(); unscaled.position.set( 10, 20, 30 ); unscaled.updateMatrixWorld( true );
	const inXr = sg.viewModelMuzzles( mesh, a, 1 )[ 0 ], plain = sg.viewModelMuzzles( unscaled, a, 1 )[ 0 ];
	for ( let k = 0; k < 3; k ++ ) near( inXr[ k ], plain[ k ], 1e-6, 'the same Quake-unit point however the scene is scaled' );
} );

Deno.test( 'muzzle smoke: the source\'s three tiny delayed wisps a barrel, in air only, anchored where the shot was fired', () => {

	const src = loadSource();
	if ( src ) {

		// creation: the source's fire() in air, wisp for wisp, for both modes and several seeds
		let compared = 0;
		for ( const [ mode, barrels ] of [ [ 'single', 1 ], [ 'double', 2 ] ] ) for ( const seed of [ 1, 4242, 99999 ] ) {

			const effect = new src.ShotgunEffect( null, {} );
			const axes = [ [ 1, 0, 0 ], [ .6, .8, 0 ] ].slice( 0, barrels ), origins = axes.map( ( a, i ) => [ i, 2 + i, 3 ] );
			effect.fire( { mode, origins, directions: axes, underwater: false, seed } );
			same( effect.smoke.length, 3 * barrels, 'three a barrel' );
			for ( let b = 0; b < barrels; b ++ ) {

				const cosmetic = sg.sgRandom( ( seed >>> 0 ) + b * 7121 + 99 ), axisQuake = [ axes[ b ][ 0 ], axes[ b ][ 2 ], axes[ b ][ 1 ] ], originQuake = [ origins[ b ][ 0 ] * K, origins[ b ][ 2 ] * K, origins[ b ][ 1 ] * K ];
				const mine = sg.makeSmoke( originQuake, axisQuake, 0, cosmetic );
				mine.forEach( ( m, i ) => {

					const s = effect.smoke[ b * 3 + i ];
					near( m.born, s.born, 1e-12, 'birth' ); near( m.life, s.life, 1e-12, 'life' ); near( m.radius, s.radius, 1e-12, 'radius' ); near( m.seed, s.seed, 1e-12, 'seed' ); near( m.drift, s.drift, 1e-12, 'drift' );
					near( m.ox, s.position[ 0 ] * K, 1e-9, 'x' ); near( m.oy, s.position[ 2 ] * K, 1e-9, 'y (source z)' ); near( m.oz, s.position[ 1 ] * K, 1e-9, 'z (source y, up)' ); compared ++;

				} );

			}

		}
		check( compared === 27, 'wisps compared: ' + compared );
		// underwater: none
		const wet = new src.ShotgunEffect( null, {} ); wet.fire( { mode: 'single', origins: [ [ 0, 1, 0 ] ], direction: [ 1, 0, 0 ], underwater: true } ); same( wet.smoke.length, 0, 'the source makes no smoke under water' );
		// the render statement of the source is the one the port uses
		const line = src.text.slice( src.text.indexOf( 'for(const s of this.smoke){const a=now-s.born' ), src.text.indexOf( 'for(const f of this.flashes)' ) ).replace( /\s+/g, '' );
		for ( const x of [ 'Math.sin(sgClamp(a/s.life,0,1)*Math.PI)', 's.position[0]+s.drift*a+Math.sin(a*6+s.seed)*.012*a', 's.position[1]+a*.18', 's.position[2]+a*.05', 's.radius+a*.045', '[0,.035+a*.05,0]', '.19*f' ] ) check( line.includes( x ), 'the source\'s render has: ' + x );

	}
	// motion over a wisp's life, in Quake axes
	const wisp = { ox: 100, oy: 10, oz: 50, born: 0, life: .7, radius: .04, seed: 3, drift: .02 }, out = { x: 0, y: 0, z: 0, radius: 0, rise: 0, alpha: 0 };
	sg.smokeAt( wisp, .35, out );
	near( out.z, 50 + K * .35 * .18 * .5, 1e-9, 'it rises along world +z, half as far as the source\'s .18 a second (owner)' ); same( sg.SHOTGUN.smokeRise, .5, 'the owner\'s halving' ); near( out.rise, ( .035 + .35 * .05 ) * .5 * K, 1e-9, 'and the quad\'s stretch along the climb is halved with it' ); near( out.y, 10 + K * .35 * .05, 1e-9, 'and drifts a little along y' ); near( out.alpha, .19, 1e-9, 'most opaque half way through its life' ); near( out.radius, ( .04 + .35 * .045 ) * K, 1e-9, 'and grows' );
	near( sg.smokeAt( wisp, 0, out ).alpha, 0, 1e-9, 'invisible at birth' ); near( sg.smokeAt( wisp, .7, out ).alpha, 0, 1e-9, 'and at the end' );
	// behaviour
	const env = setup(), eye = [ 0, 0, 50 ], forward = [ 1, 0, 0 ], view = [ 1280, 720 ], left = [ 100, - 3, 50 ], right = [ 100, 3, 50 ];
	sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 10 ); same( sg.R_ShotgunSmoke().length, 3, 'a shotgun blast in air: three wisps' );
	sg.R_ShotgunFire( event( 2, Array.from( { length: 14 }, ( _, i ) => ray( 700, ( i - 6.5 ) * 8, 50 ) ) ), [ left, right ], 10 ); same( sg.R_ShotgunSmoke().length, 9, 'a super shotgun blast: three at each barrel' );
	check( sg.R_ShotgunSmoke().slice( 3 ).every( ( s, i ) => Math.abs( s.born - ( 10 + .026 + ( i % 3 ) * .047 ) ) < 1e-9 ), 'each born 26, 73 and 120 ms after the shot' );
	sg.R_ShotgunFrame( 10.02, eye, forward, view ); same( sg.R_ShotgunSnapshot().drawn.smoke, 0, 'nothing yet at 20 ms: the wisps are delayed' );
	sg.R_ShotgunFrame( 10.2, eye, forward, view ); same( sg.R_ShotgunSnapshot().drawn.smoke, 9, 'all of them by 200 ms' );
	// anchored in the world at the muzzle of the shot: a later view or gun position cannot move it
	const where = sg.R_ShotgunSmoke()[ 0 ].ox; sg.R_ShotgunFrame( 10.25, [ 500, 500, 500 ], [ 0, 1, 0 ], view ); same( sg.R_ShotgunSmoke()[ 0 ].ox, where, 'the wisp stays where the shot was fired when the view moves' );
	sg.R_ShotgunFrame( 11.5, eye, forward, view ); same( sg.R_ShotgunSmoke().length, 0, 'all gone by 1.5 s' );
	// never under water, and bounded
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 1, sixRays().map( r => ( { ...r, water: [ [ 0, 900 ] ] } ) ), { submerged: true } ), [ muzzle ], 5 ); same( sg.R_ShotgunSmoke().length, 0, 'a blast under water makes no smoke' );
	sg.R_ShotgunClear(); for ( let i = 0; i < 100; i ++ ) sg.R_ShotgunFire( event( 2, sixRays(), { id: i + 1 } ), [ left, right ], 5 ); same( sg.R_ShotgunSmoke().length, sg.SHOTGUN.maxSmoke, 'the smoke pool is bounded at 96' );
	sg.R_ShotgunClear(); same( sg.R_ShotgunSmoke().length, 0, 'a map change clears it' );
	sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 5 ); Cvar_SetValue( 'r_hdr', 0 ); sg.R_ShotgunFrame( 5.2, eye, forward, view ); same( sg.R_ShotgunSmoke().length, 0, 'Classic Quake: none' ); Cvar_SetValue( 'r_hdr', 1 );

} );

Deno.test( 'smoke or bubbles are decided at the barrel, not at the game\'s ray start (a wader at the surface)', () => {

	const dry = [ 100, 0, 50 ], wetPoint = [ 100, 0, 30 ], level = p => p[ 2 ] < 40 ? - 3 : - 1;
	setup( level );
	// the ray starts under water (chest 30) but the gun is in air (50): smoke, no bubbles
	sg.R_ShotgunFire( event( 1, [ { start: [ 90, 0, 30 ], end: [ 700, 0, 50 ], water: [ [ 0, 40 ] ] } ], { submerged: true } ), [ dry ], 1 );
	same( sg.R_ShotgunSmoke().length, 3, 'a dry muzzle smokes' ); same( sg.R_ShotgunBubbles().length, 0, 'and leaves no muzzle bubbles' );
	// the reverse: the ray starts dry but the muzzle is under water: bubbles, no smoke
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 1, [ { start: [ 90, 0, 56 ], end: [ 700, 0, 20 ], water: [] } ], { submerged: false } ), [ wetPoint ], 1 );
	same( sg.R_ShotgunSmoke().length, 0, 'a wet muzzle makes no smoke' ); same( sg.R_ShotgunBubbles().length, 4, 'four bubbles escape it' );
	// the two barrels of the super shotgun are decided one by one
	sg.R_ShotgunClear(); sg.R_ShotgunFire( event( 2, Array.from( { length: 4 }, ( _, i ) => ray( 700, i, 50 ) ) ), [ dry, wetPoint ], 1 );
	same( sg.R_ShotgunSmoke().length, 3, 'the dry barrel smokes' ); same( sg.R_ShotgunBubbles().length, 4, 'the wet barrel bubbles' );
	// slime is water, lava is not
	for ( const [ contents, wet ] of [ [ - 4, true ], [ - 5, false ] ] ) { setup( () => contents ); sg.R_ShotgunFire( event( 1, sixRays() ), [ dry ], 1 ); same( sg.R_ShotgunBubbles().length > 0, wet, 'contents ' + contents ); }
	// no way to look: the event's own answer
	setup(); sg.R_ShotgunFire( event( 1, sixRays(), { submerged: true } ), [ dry ], 1 ); same( sg.R_ShotgunSmoke().length, 0, 'without a contents function the event decides' );

} );

Deno.test( 'smoke is drawn as the source draws it: kind 2 rows from the fire-time muzzle, however the gun and view move later', () => {

	const env = setup(), eye = [ 0, 0, 50 ], forward = [ 1, 0, 0 ], view = [ 1280, 720 ];
	let current = muzzle; sg.R_ShotgunSetup( { scene: env.scene, muzzles: () => [ current ] } );
	sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 10 );
	const wisps = sg.R_ShotgunSmoke().slice(), geometry = () => env.group().children[ 0 ].geometry;
	current = [ 5000, 5000, 5000 ]; // the gun goes somewhere else; the view moves and turns
	sg.R_ShotgunFrame( 10.3, [ 900, 900, 900 ], [ 0, 1, 0 ], view );
	const P = geometry().getAttribute( 'aPositionRadius' ).array, M = geometry().getAttribute( 'aMotionKind' ).array, A = geometry().getAttribute( 'aProperties' ).array, out = { x: 0, y: 0, z: 0, radius: 0, rise: 0, alpha: 0 };
	let rows = 0;
	for ( let i = 0; i < geometry().instanceCount; i ++ ) {

		if ( M[ i * 4 + 3 ] !== 2 ) continue;
		const wisp = wisps.find( s => Math.abs( s.seed - A[ i * 4 + 1 ] ) < 1e-4 ); check( wisp, 'a kind-2 row carries its wisp\'s seed in aProperties.y' );
		sg.smokeAt( wisp, 10.3 - wisp.born, out );
		near( P[ i * 4 ], out.x, 1e-3, 'x from the fire-time muzzle' ); near( P[ i * 4 + 1 ], out.y, 1e-3, 'y' ); near( P[ i * 4 + 2 ], out.z, 1e-3, 'z (it has risen)' ); near( P[ i * 4 + 3 ], out.radius, 1e-4, 'radius' );
		same( M[ i * 4 ], 0, 'no motion along x' ); same( M[ i * 4 + 1 ], 0, 'or y' ); near( M[ i * 4 + 2 ], out.rise, 1e-4, 'the stretch is world-up' ); near( A[ i * 4 ], out.alpha, 1e-5, 'opacity' ); near( A[ i * 4 + 2 ], ( 10.3 - wisp.born ) / wisp.life, 1e-5, 'age' ); rows ++;

	}
	check( rows >= 2, 'kind-2 rows drawn: ' + rows );

} );

Deno.test( 'the blast\'s wisps are the source\'s fire() wisps for the same blast stream, one barrel or two', () => {

	const src = loadSource();
	if ( ! src ) return;
	for ( const [ weapon, barrels ] of [ [ 1, 1 ], [ 2, 2 ] ] ) for ( const id of [ 1, 7, 321 ] ) {

		setup();
		const muzzles = barrels === 2 ? [ [ 100, - 3, 50 ], [ 100, 3, 50 ] ] : [ [ 100, 0, 50 ] ], rays = Array.from( { length: barrels === 2 ? 14 : 6 }, ( _, i ) => ray( 700, ( i - 3 ) * 9, 50 + i ) );
		sg.R_ShotgunFire( event( weapon, rays, { id } ), muzzles, 0 );
		const mine = sg.R_ShotgunSmoke().slice();
		const effect = new src.ShotgunEffect( null, {} );
		const axes = muzzles.map( ( m, b ) => { const e = rays[ b ].end, d = [ e[ 0 ] - m[ 0 ], e[ 1 ] - m[ 1 ], e[ 2 ] - m[ 2 ] ], n = Math.hypot( ...d ); return [ d[ 0 ] / n, d[ 2 ] / n, d[ 1 ] / n ]; } ); // Quake -> source axes
		effect.fire( { mode: barrels === 2 ? 'double' : 'single', origins: muzzles.map( m => [ m[ 0 ] / K, m[ 2 ] / K, m[ 1 ] / K ] ), directions: axes, underwater: false, seed: sg.SHOTGUN && ( ( 84391 + id * 7919 ) >>> 0 ) } );
		same( mine.length, effect.smoke.length, 'the same number of wisps' );
		mine.forEach( ( m, i ) => { const s = effect.smoke[ i ]; for ( const k of [ 'life', 'radius', 'seed', 'drift', 'born' ] ) near( m[ k ], s[ k ], 1e-9, k ); near( m.ox, s.position[ 0 ] * K, 1e-6, 'x' ); near( m.oy, s.position[ 2 ] * K, 1e-6, 'y' ); near( m.oz, s.position[ 1 ] * K, 1e-6, 'z' ); } );

	}
	check( src.text.includes( 'maxSmoke=96' ), 'the source\'s smoke pool default is 96' ); same( sg.SHOTGUN.maxSmoke, 96, 'and so is the port\'s' );
	// the vertex shader's non-pellet branch (bubbles and wisps)
	const flat = t => t.replace( /\s+/g, '' ).replace( /S\*/g, '' ).replace( /nearW/g, '.055' );
	const vertex = flat( src.V ), mine = sg.SHOTGUN_SHADERS.vertex, branch = flat( mine.slice( mine.indexOf( 'vec2 motion=(clip.xy/max(clip.w,.001)' ), mine.lastIndexOf( '#include <clipping_planes_vertex>' ) ) ).split( ';' ).filter( Boolean );
	let compared = 0;
	for ( const x of branch ) { check( vertex.includes( x ), 'the source has the vertex statement: ' + x ); compared ++; }
	check( compared >= 8, 'vertex statements of the bubble and wisp branch compared: ' + compared );

} );

Deno.test( 'smoke is cleared by the effect switch with no pellets about, and by a clock jump back', () => {

	const env = setup(), eye = [ 0, 0, 50 ], forward = [ 1, 0, 0 ], view = [ 1280, 720 ];
	sg.R_ShotgunFire( event( 1, sixRays() ), [ muzzle ], 5 ); sg.R_ShotgunFrame( 5.01, eye, forward, view ); sg.R_ShotgunFrame( 7, eye, forward, view );
	same( sg.R_ShotgunPellets().length, 0, 'the pellets are long gone' );
	sg.R_ShotgunFire( event( 1, sixRays(), { id: 2 } ), [ muzzle ], 50 ); sg.R_ShotgunFrame( 50.1, eye, forward, view ); sg.R_ShotgunPellets().length = 0; sg.R_ShotgunBubbles().length = 0;
	check( sg.R_ShotgunSmoke().length > 0, 'only smoke is alive' ); sg.r_shotgunfx.value = 0; sg.R_ShotgunFrame( 50.2, eye, forward, view ); same( sg.R_ShotgunSmoke().length, 0, 'r_shotgunfx 0 clears smoke even with no pellets' ); sg.r_shotgunfx.value = 1;
	sg.R_ShotgunFire( event( 1, sixRays(), { id: 3 } ), [ muzzle ], 80 ); sg.R_ShotgunFrame( 80.1, eye, forward, view ); check( sg.R_ShotgunSmoke().length > 0, 'smoke alive' ); sg.R_ShotgunFrame( 3, eye, forward, view ); same( sg.R_ShotgunSmoke().length, 0, 'the clock jumping back clears smoke' );

} );
