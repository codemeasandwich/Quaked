// The supplied "FIREBALLS — Straight-flight FX Lab" fireball on Quake's flying lava balls
// (progs/lavaball.mdl: misc_fireball and Chthon). The source's shader statements and constants are
// compared against the port when the owner's page is present locally, and the public entry points
// (R_LavaBall, the frame flush, R_RocketTrail) are driven with real entities and the real stock
// models. WebGL is not involved: the instance buffers a frame writes are inspected, so these checks
// claim no GPU pixel parity (tests/lavaballs_trial.html photographs it).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { cvar_t, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import { COM_LoadPackFile, COM_AddPack } from '../src/engine/common/pak.js';
import { Mod_ForName } from '../src/engine/render/gl_model.js';
import { entity_t, R_RocketTrail, R_KnightSpikeImpact } from '../src/engine/render/render.js';
import * as part from '../src/engine/render/r_part.js';
import { cl as clientState } from '../src/engine/client/client.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { r_demosplit } from '../src/newer/render/r_demosplit.js';
import { FIREBALL } from '../src/newer/render/r_fireball.js';
import * as lb from '../src/newer/render/r_lavaballs.js';

const SOURCE_SHA256 = '9913ff9ff80bf9f89aeed49eb2b88c0e12f2a17089e961d34501241337b925ae';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const near = ( a, b, eps, label ) => { if ( ! ( Math.abs( a - b ) <= eps ) ) throw new Error( `${label}: ${a} != ${b}` ); };
const same = ( a, b, label ) => { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); };

const pak = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.length ) ) );
const LAVABALL = Mod_ForName( 'progs/lavaball.mdl', true ), MISSILE = Mod_ForName( 'progs/missile.mdl', true );
// The Death Knight's shot is in the registered game only, not the shareware pak: the module reads its name alone (the
// browser trial draws the real model)
const KSPIKE = { name: 'progs/k_spike.mdl', flags: 0x40 };
Cvar_RegisterVariable( new cvar_t( 'r_hdr', '1' ) );
if ( ! lb.r_lavaballs.registered ) Cvar_RegisterVariable( lb.r_lavaballs );
const newer = on => Cvar_SetValue( 'r_hdr', on ? 1 : 0 );

// contents: solid below z = 0 (a floor) and beyond x = 1000 (a wall), empty elsewhere
function setup( { contents = p => ( p[ 2 ] < 0 || p[ 0 ] > 1000 ? - 2 : - 1 ) } = {} ) {

	const scene = new THREE.Scene();
	lb.R_LavaBallsSetup( { scene, contents } );
	lb.R_LavaBallsClear();
	newer( true ); R_AnimSetClassicPass( false ); lb.r_lavaballs.value = 1; r_demosplit.value = 0;
	return { scene, time: 10, group: () => scene.children.find( c => c.name === 'quake_lavaballs' ) };

}
const ball = ( key, origin, model = LAVABALL ) => { const e = new entity_t(); e.model = model; e._entityIndex = key; e.origin = Float32Array.from( origin ); return e; };
// one rendered frame: the entity list registers what is in view, then the flush draws it
function frame( env, entities, dt = .02 ) {

	env.time += dt;
	lb.R_LavaBallsBegin();
	const taken = entities.map( e => lb.R_LavaBall( e ) );
	lb.R_LavaBallsFlush( env.time, [ 1280, 720 ] );
	return taken;

}
const layerOf = ( env, name ) => env.group().children.find( c => c.name === name );

Deno.test( 'the fireball, particle and noise shaders are the source\'s own, and so are the trail and impact constants', () => {

	const path = new URL( process.env.QUAKED_LAVABALLS_SOURCE || '../fireballs.html', import.meta.url );
	const need = process.env.QUAKED_LAVABALLS_SOURCE_REQUIRED === '1', skip = why => { if ( need ) throw new Error( why + ' (QUAKED_LAVABALLS_SOURCE_REQUIRED=1)' ); console.log( 'SKIPPED source equivalence: ' + why ); };
	// absent: read it anyway, so the missing page (a local input, never committed) is reported by tools/run_tests.mjs as
	// this test skipped with the page named, not as passed
	if ( ! existsSync( path ) ) { if ( need ) throw new Error( 'source file not present locally (QUAKED_LAVABALLS_SOURCE_REQUIRED=1)' ); readFileSync( path ); }
	const bytes = readFileSync( path );
	if ( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) !== SOURCE_SHA256 ) return skip( 'different source revision' );
	const text = bytes.toString( 'utf8' );
	const glsl = name => { const from = text.indexOf( `const ${name} = /* glsl */\`` ); check( from > 0, name + ' located' ); return text.slice( text.indexOf( '`', from ) + 1, text.indexOf( '`;', from ) ); };
	const statements = body => body.slice( body.indexOf( 'void main(){' ) + 12 ).split( '\n' ).map( l => l.trim() ).filter( l => l && l !== '}' );
	same( lb.LAVABALL_SHADERS.noise.trim(), glsl( 'NOISE_GLSL' ).trim(), 'NOISE_GLSL verbatim' );
	// every statement of the source's main() is in the port, but the output (premultiplied for the shared blending) and the
	// point coordinate (a quad's)
	const fire = statements( glsl( 'FIREBALL_FRAGMENT' ) ).filter( l => ! l.startsWith( 'gl_FragColor' ) );
	check( fire.length === 17, 'FIREBALL_FRAGMENT has its 17 statements' );
	for ( const l of fire ) check( lb.LAVABALL_SHADERS.plane.includes( l ), 'fireball statement: ' + l );
	check( lb.LAVABALL_SHADERS.plane.includes( 'vec4 src=vec4((col*body+vec3(1.0,0.13,0.008)*glow)*uPower,body*0.94+glow);' ), 'the source\'s output, kept as src' );
	const particle = statements( glsl( 'PARTICLE_FRAGMENT' ) ).filter( l => ! l.startsWith( 'gl_FragColor' ) && ! l.includes( 'gl_PointCoord' ) );
	check( particle.length === 13, 'PARTICLE_FRAGMENT has its 13 statements' );
	for ( const l of particle ) for ( const f of [ lb.LAVABALL_SHADERS.glow, lb.LAVABALL_SHADERS.smoke ] ) check( f.includes( l ), 'particle statement: ' + l );
	// the constants the port names, at the places the source uses them
	for ( const s of [ 'const plane=new THREE.PlaneGeometry(3.6,1.8); plane.translate(-1.65,0,0);', 'uPhase:{value:i*5.1}', 'mesh.rotation.x=i*Math.PI/3',
		'const scale=f.size*Math.min(1,0.3+f.age*9);', 'f.emit+=dt*480*this.density*f.size;', 'const behind=fxRand(0,Math.min(f.distance,2.6*f.size));',
		'const spark=Math.random()<0.23;', 'Math.floor(65*this.density*scale)', 'this._ring(p,n,0xff982d,0.35,1.6*scale);', 'Math.ceil(12*scale)',
		'flightTime=0.82,range=22,power=1,size=0.42', "this.glow=new FxParticles(this.root,quality==='low'?900:2200,true);", "this.smoke=new FxParticles(this.root,quality==='low'?250:600,false);",
		'r.mesh.scale.setScalar(0.1+u*r.size); r.mesh.material.opacity=(1-u)*0.45;' ] ) check( text.includes( s ), 'source constant: ' + s );
	const L = lb.LAVABALL;
	same( [ L.planeLength, L.planeWidth, L.planeShift, L.planePhase, L.growFrom, L.growRate, L.trailRate, L.trailBehind, L.sparkShare, L.impactSparks, L.impactSmoke, L.ringLife, L.ringSize, L.size, L.power, L.glowCap, L.smokeCap ].join(),
		[ 3.6, 1.8, - 1.65, 5.1, .3, 9, 480, 2.6, .23, 65, 12, .35, 1.6, .42, 1, 2200, 600 ].join(), 'the port\'s constants' );

} );

Deno.test( 'only Newer Game\'s lava balls are taken: Classic, the classic pass, r_lavaballs 0 and other models keep the native model', () => {

	const env = setup();
	const e = ball( 40, [ 0, 0, 100 ] );
	check( lb.R_LavaBall( e ), 'Newer Game takes a lava ball' );
	check( ! lb.R_LavaBall( ball( 41, [ 0, 0, 100 ], MISSILE ) ), 'a rocket is not a lava ball' );
	check( ! lb.R_LavaBall( ball( undefined, [ 0, 0, 100 ] ) ), 'an entity without a number keeps its model' );
	newer( false );
	check( ! lb.R_LavaBall( e ) && ! lb.R_LavaBallTakes( LAVABALL ), 'Classic: native' );
	newer( true ); R_AnimSetClassicPass( true );
	check( ! lb.R_LavaBall( e ), 'the classic half of the title demo: native' );
	R_AnimSetClassicPass( false ); lb.r_lavaballs.value = 0;
	check( ! lb.R_LavaBall( e ) && ! lb.R_LavaBallTakes( LAVABALL ), 'r_lavaballs 0: native' );
	lb.r_lavaballs.value = 1;
	lb.R_LavaBallsSetup( { scene: null } );
	check( ! lb.R_LavaBall( e ), 'no scene: native' );
	setup();
	check( lb.R_LavaBallTakes( LAVABALL ) && ! lb.R_LavaBallTakes( MISSILE ) && ! lb.R_LavaBallTakes( null ), 'the trail question answers the same' );
	// a full pool: the 65th ball keeps its native model and its native trail; the 64 held keep theirs replaced
	const many = Array.from( { length: lb.LAVABALL.max }, ( _, k ) => ball( 100 + k, [ k * 10, 0, 100 ] ) );
	lb.R_LavaBallsBegin();
	check( many.every( e2 => lb.R_LavaBall( e2 ) ), 'the pool takes 64' );
	check( ! lb.R_LavaBall( ball( 999, [ 0, 0, 0 ] ) ) && ! lb.R_LavaBallTakes( LAVABALL, 999 ), 'the 65th: native model and native trail' );
	check( lb.R_LavaBallTakes( LAVABALL, 100 ), 'a held ball\'s trail stays replaced' );
	void env;

} );

Deno.test( 'one fireball per native ball, at its origin and along its motion; gone with it; no projectile added', () => {

	const env = setup();
	// a misc_fireball ball arcing under gravity, and two of Chthon's flying straight at 300 units/s
	const a = ball( 50, [ 0, 0, 100 ] ), b = ball( 51, [ 200, 0, 200 ] ), c = ball( 52, [ 200, 100, 200 ] );
	const va = [ 30, - 20, 1100 ];
	frame( env, [ a, b, c ] );
	same( lb.R_LavaBallsSnapshot().drawn, 3, 'drawn from the very frame their native models are hidden (direction not yet known)' );
	for ( let k = 0; k < 10; k ++ ) {

		const taken = frame( env, [ a, b, c ] );
		check( taken.every( Boolean ), 'every ball taken' );
		va[ 2 ] -= 800 * .02;
		for ( let i = 0; i < 3; i ++ ) a.origin[ i ] += va[ i ] * .02;
		b.origin[ 0 ] += 300 * .02; c.origin[ 1 ] -= 300 * .02;

	}
	frame( env, [ a, b, c ] );
	const snap = lb.R_LavaBallsSnapshot();
	same( snap.balls, 3, 'three balls held' ); same( snap.drawn, 3, 'three fireballs drawn, no more' );
	const at = key => snap.keys.indexOf( key );
	for ( const [ e, key ] of [ [ a, 50 ], [ b, 51 ], [ c, 52 ] ] ) for ( let i = 0; i < 3; i ++ ) near( snap.positions[ at( key ) ][ i ], e.origin[ i ], 1e-3, `ball ${key} drawn at its origin` );
	near( snap.directions[ at( 51 ) ][ 0 ], 1, 1e-6, 'Chthon\'s ball flying +x points +x' );
	near( snap.directions[ at( 52 ) ][ 1 ], - 1, 1e-6, 'the other points -y' );
	// the arcing ball turns with its motion: mostly up, leaning with its horizontal speed
	const da = snap.directions[ at( 50 ) ];
	check( da[ 2 ] > .99 && da[ 0 ] > 0 && da[ 1 ] < 0, 'the lava spurt points along its arc: ' + da.map( v => v.toFixed( 3 ) ) );
	// the instance buffer the GPU draws holds those three, at those origins
	const planes = layerOf( env, 'lavaball_fireballs' );
	same( planes.geometry.instanceCount, 3, 'three plane instances' );
	same( planes.geometry.getAttribute( 'position' ).count, 12, 'three crossed planes per fireball' );
	const P = planes.geometry.getAttribute( 'aPosScale' ).array;
	const drawn = [ 0, 1, 2 ].map( n => [ P[ n * 4 ], P[ n * 4 + 1 ], P[ n * 4 + 2 ] ] );
	for ( const e of [ a, b, c ] ) check( drawn.some( d => d.every( ( v, i ) => Math.abs( v - e.origin[ i ] ) < 1e-3 ) ), 'an instance at each ball' );
	near( P[ 3 ], lb.LAVABALL.size * FIREBALL.unit, 1e-4, 'grown to its full size (0.42 source units at 24 Quake units each)' );
	check( layerOf( env, 'lavaball_glow' ).geometry.instanceCount > 0, 'the trail is burning' );
	// gameplay untouched: the entities are only read
	same( a.model, LAVABALL, 'the model is untouched' ); same( a.origin.length, 3, 'the origin is untouched' );
	// the middle ball goes (mid-air: no impact); the others stay
	frame( env, [ a, c ] );
	const after = lb.R_LavaBallsSnapshot();
	same( after.balls, 2, 'the ball that went is forgotten' ); same( after.drawn, 2, 'and not drawn' ); check( ! after.keys.includes( 51 ), 'by its number' );
	same( after.rings, 0, 'a ball gone in the air gets no impact' );
	frame( env, [] );
	same( lb.R_LavaBallsSnapshot().drawn, 0, 'none left' );
	// a ball that turns: the drawn direction turns with it
	const d = ball( 53, [ 0, 0, 100 ] );
	for ( let k = 0; k < 10; k ++ ) { frame( env, [ d ] ); d.origin[ 0 ] += 6; }
	near( lb.R_LavaBallsSnapshot().directions[ 0 ][ 0 ], 1, 1e-6, 'first along +x' );
	for ( let k = 0; k < 20; k ++ ) { frame( env, [ d ] ); d.origin[ 1 ] += 6; }
	check( lb.R_LavaBallsSnapshot().directions[ 0 ][ 1 ] > .99, 'then along +y' );

} );

Deno.test( 'a ball that went against a wall or floor ends with the source\'s impact; the trail and impact particles expire', () => {

	const env = setup();
	const e = ball( 60, [ 900, 0, 100 ] );
	for ( let k = 0; k < 6; k ++ ) { frame( env, [ e ] ); e.origin[ 0 ] += 300 * .02; } // 300 units/s toward the wall at x = 1000
	e.origin[ 0 ] = 996; frame( env, [ e ] );
	const glowBefore = lb.R_LavaBallsSnapshot().glow;
	frame( env, [] ); // removed on contact
	const s = lb.R_LavaBallsSnapshot();
	same( s.rings, 1, 'the impact ring' ); same( s.drawn, 0, 'the fireball is gone' );
	check( s.glow >= glowBefore + 20, `the impact sparks (${glowBefore} -> ${s.glow})` ); check( s.smoke >= 5, 'and its smoke' );
	for ( let k = 0; k < 120; k ++ ) frame( env, [] );
	const end = lb.R_LavaBallsSnapshot();
	same( end.glow + end.smoke + end.rings, 0, 'everything expires' ); check( ! end.visible, 'and the layers hide' );

} );

Deno.test( 'leaving Newer Game, r_lavaballs 0, a clock jump back and a new map drop everything', () => {

	for ( const leave of [ () => newer( false ), () => { lb.r_lavaballs.value = 0; }, env => { env.time -= 5; }, () => lb.R_LavaBallsClear() ] ) {

		const env = setup();
		const e = ball( 70, [ 0, 0, 100 ] );
		for ( let k = 0; k < 4; k ++ ) { frame( env, [ e ] ); e.origin[ 2 ] += 10; }
		check( lb.R_LavaBallsSnapshot().drawn === 1, 'drawn before' );
		leave( env );
		lb.R_LavaBallsBegin(); lb.R_LavaBallsFlush( env.time, [ 1280, 720 ] );
		const s = lb.R_LavaBallsSnapshot();
		same( s.balls + s.drawn + s.rings + s.smoke, 0, 'nothing held after ' + leave.toString() ); check( ! s.visible, 'hidden' );

	}

} );

Deno.test( 'a clock jump back keeps the balls in view and drops only the particles', () => {

	const env = setup();
	const e = ball( 75, [ 0, 0, 100 ] );
	for ( let k = 0; k < 6; k ++ ) { frame( env, [ e ] ); e.origin[ 2 ] += 10; }
	check( lb.R_LavaBallsSnapshot().glow > 0, 'a trail before' );
	env.time -= 5;
	frame( env, [ e ], 0 );
	const s = lb.R_LavaBallsSnapshot();
	same( s.drawn, 1, 'the ball registered this frame is still drawn (its native model is hidden)' );
	same( s.glow + s.smoke + s.rings, 0, 'the old trail is gone' );

} );

Deno.test( 'per-frame work reuses its buffers', () => {

	const env = setup();
	const e = ball( 80, [ 0, 0, 100 ] );
	frame( env, [ e ] ); e.origin[ 2 ] += 10; frame( env, [ e ] );
	const arrays = [ 'lavaball_fireballs', 'lavaball_glow', 'lavaball_smoke', 'lavaball_rings' ].map( n => Object.values( layerOf( env, n ).geometry.attributes ).filter( a => a.isInstancedBufferAttribute ).map( a => a.array ) ).flat();
	const children = env.group().children.slice();
	for ( let k = 0; k < 30; k ++ ) { e.origin[ 2 ] += 10; frame( env, [ e ] ); }
	const later = [ 'lavaball_fireballs', 'lavaball_glow', 'lavaball_smoke', 'lavaball_rings' ].map( n => Object.values( layerOf( env, n ).geometry.attributes ).filter( a => a.isInstancedBufferAttribute ).map( a => a.array ) ).flat();
	same( later.length, arrays.length, 'the same attributes' );
	check( later.every( ( a, i ) => a === arrays[ i ] ), 'the same typed arrays every frame' );
	check( env.group().children.every( ( c, i ) => c === children[ i ] ), 'the same meshes' );
	same( env.scene.children.filter( c => c.name === 'quake_lavaballs' ).length, 1, 'one group in the scene' );

} );

// native trail particles spawned by one call (r_part.js points meshes)
function particles( env, spawn ) {

	part.R_InitParticles(); part.R_ClearParticles();
	part.R_SetParticleExternals( { scene: env.scene } );
	clientState.time = 1; clientState.oldtime = .99;
	spawn();
	part.R_DrawParticles();
	const out = env.scene.children.filter( c => c.isPoints ).map( c => ( { classicOnly: c.userData.classicOnly === true, visible: c.visible, count: c.geometry.drawRange.count } ) );
	part.R_ClearParticles(); part.R_DrawParticles();
	return out.filter( o => o.count > 0 );

}

Deno.test( 'a lava ball\'s native trail gives way to the fireball\'s own in Newer Game only; the split demo\'s classic half keeps it', () => {

	const env = setup();
	const trail = () => R_RocketTrail( [ 0, 0, 100 ], [ 0, 0, 130 ], 0, 90, LAVABALL );
	same( particles( env, trail ).length, 0, 'Newer Game: no native trail for a lava ball' );
	lb.r_lavaballs.value = 0;
	check( particles( env, trail ).length > 0, 'r_lavaballs 0: the native trail is back (r_smoketrails is not set up here)' );
	// a full pool: the ball left out keeps its native trail through the real entry point; a held ball's stays replaced
	lb.r_lavaballs.value = 1;
	lb.R_LavaBallsBegin();
	for ( let k = 0; k < lb.LAVABALL.max; k ++ ) lb.R_LavaBall( ball( 200 + k, [ k * 10, 0, 100 ] ) );
	check( particles( env, () => R_RocketTrail( [ 0, 0, 100 ], [ 0, 0, 130 ], 0, 999, LAVABALL ) ).length > 0, 'full pool: a new ball\'s native trail' );
	same( particles( env, () => R_RocketTrail( [ 0, 0, 100 ], [ 0, 0, 130 ], 0, 200, LAVABALL ) ).length, 0, 'a held ball: none' );
	lb.R_LavaBallsClear();
	lb.r_lavaballs.value = 1; newer( false );
	const classic = particles( env, trail );
	check( classic.length === 1 && ! classic[ 0 ].classicOnly, 'Classic: the ordinary native trail' );
	newer( true ); r_demosplit.value = 2;
	const split = particles( env, trail );
	check( split.length === 1 && split[ 0 ].classicOnly, 'split title demo: a native trail for the classic half only' );
	r_demosplit.value = 0;

} );

Deno.test( 'the engine draws no lava ball model while the fireball has it and hands each EF_ROCKET trail its model', () => {

	const rmain = readFileSync( new URL( '../src/engine/render/gl_rmain.js', import.meta.url ), 'utf8' );
	const fn = rmain.slice( rmain.indexOf( 'function R_DrawAliasModel( e ) {' ) );
	const take = fn.indexOf( 'if ( R_LavaBall( e ) ) return;' ), build = fn.indexOf( 'R_DrawAliasModel_mesh(' );
	check( take > 0 && take < build, 'R_DrawAliasModel returns before building the mesh (and its shadow) when the fireball has the ball' );
	const begin = rmain.indexOf( 'R_LavaBallsBegin();' ), list = rmain.indexOf( 'R_DrawEntitiesOnList();', begin ), flush = rmain.indexOf( 'R_LavaBallsFlush(' );
	check( begin > 0 && list > begin && flush > list, 'begin, the entity list, then the flush' );
	check( /R_LavaBallsSetup\(/.test( rmain ) && /R_LavaBallsClear\(\)/.test( rmain ) && /Cvar_RegisterVariable\( r_lavaballs \)/.test( rmain ), 'set up per map, cvar registered' );
	const clmain = readFileSync( new URL( '../src/engine/client/cl_main.js', import.meta.url ), 'utf8' );
	check( /R_RocketTrail\( _peOldorg, ent\.origin, 0, s1\.number, model \)/.test( clmain ) && /R_RocketTrail\( _relinkOldorg, ent\.origin, 0, i, ent\.model \)/.test( clmain ), 'both EF_ROCKET trail calls pass the model' );
	// the module reads entities only: it imports nothing of the server or client
	const own = readFileSync( new URL( '../src/newer/render/r_lavaballs.js', import.meta.url ), 'utf8' );
	check( ! /from '[^']*(server|client)\//.test( own ), 'no server or client import' );

} );

// card [FB2]: the Death Knight's fan, one supplied fireball on each of its native shots
Deno.test( 'each Death Knight shot is drawn as the supplied fireball, one per native shot, in Newer Game only', () => {

	const env = setup();
	// hknight.qc's fan: six k_spike shots at 300 units/s, spread across its aim
	const shots = [ - 3, - 2, - 1, 1, 2, 3 ].map( ( k, n ) => ball( 300 + n, [ 0, 0, 100 ], KSPIKE ) );
	const vel = [ - 3, - 2, - 1, 1, 2, 3 ].map( k => { const a = k * .04; return [ 300 * Math.cos( a ), 300 * Math.sin( a ), 0 ]; } );
	for ( let f = 0; f < 10; f ++ ) {

		check( frame( env, shots ).every( Boolean ), 'every shot taken: its native model is not drawn' );
		shots.forEach( ( e, n ) => { for ( let i = 0; i < 3; i ++ ) e.origin[ i ] += vel[ n ][ i ] * .02; } );

	}
	frame( env, shots );
	const snap = lb.R_LavaBallsSnapshot();
	same( snap.balls, 6, 'six shots held' ); same( snap.drawn, 6, 'six fireballs drawn: one per native shot, none added' );
	shots.forEach( ( e, n ) => {

		const at = snap.keys.indexOf( 300 + n );
		for ( let i = 0; i < 3; i ++ ) near( snap.positions[ at ][ i ], e.origin[ i ], 1e-3, `shot ${n} drawn at its origin` );
		const len = Math.hypot( ...vel[ n ] );
		for ( let i = 0; i < 3; i ++ ) near( snap.directions[ at ][ i ], vel[ n ][ i ] / len, 1e-5, `shot ${n} points along its own flight` );

	} );
	check( layerOf( env, 'lavaball_glow' ).geometry.instanceCount > 0, 'the source\'s trail is burning' );
	same( shots[ 0 ].model, KSPIKE, 'the entity is only read' );
	newer( false );
	check( ! lb.R_LavaBall( shots[ 0 ] ) && ! lb.R_LavaBallTakes( KSPIKE ), 'Classic: the native shot' );
	newer( true ); R_AnimSetClassicPass( true );
	check( ! lb.R_LavaBall( shots[ 0 ] ), 'the classic half of the title demo: native' );
	R_AnimSetClassicPass( false ); lb.r_lavaballs.value = 0;
	check( ! lb.R_LavaBall( shots[ 0 ] ) && ! lb.R_LavaBallTakes( KSPIKE ), 'r_lavaballs 0: native' );
	lb.r_lavaballs.value = 1;
	// the Scrag's spike and the vore's ball are not the Knight's
	check( ! lb.R_LavaBallTakes( { name: 'progs/w_spike.mdl' } ) && ! lb.R_LavaBallTakes( { name: 'progs/v_spike.mdl' } ), 'other tracers: native' );

} );

Deno.test( 'a Death Knight shot\'s native tracer gives way to the fireball\'s own; Classic and the split demo\'s classic half keep it', () => {

	const env = setup();
	const trail = () => R_RocketTrail( [ 0, 0, 100 ], [ 30, 0, 100 ], 5, 310, KSPIKE );
	same( particles( env, trail ).length, 0, 'Newer Game: no native tracer for a Knight shot' );
	check( particles( env, () => R_RocketTrail( [ 0, 0, 100 ], [ 30, 0, 100 ], 5 ) ).length > 0, 'a type-5 tracer without a model: native' );
	lb.r_lavaballs.value = 0;
	check( particles( env, trail ).length > 0, 'r_lavaballs 0: the native tracer is back' );
	lb.r_lavaballs.value = 1; newer( false );
	const classic = particles( env, trail );
	check( classic.length === 1 && ! classic[ 0 ].classicOnly, 'Classic: the ordinary native tracer' );
	newer( true ); r_demosplit.value = 2;
	const split = particles( env, trail );
	check( split.length === 1 && split[ 0 ].classicOnly, 'split title demo: a native tracer for the classic half only' );
	r_demosplit.value = 0;

} );

Deno.test( 'a Death Knight shot hitting a wall ends in the source\'s impact at the server\'s point, once; Classic keeps the native spray', () => {

	let env = setup();
	const e = ball( 320, [ 900, 0, 100 ], KSPIKE );
	for ( let k = 0; k < 6; k ++ ) { frame( env, [ e ] ); e.origin[ 0 ] += 300 * .02; }
	e.origin[ 0 ] = 996; frame( env, [ e ] ); // (close enough that the lava ball's contents probe would find the wall)
	const glowBefore = lb.R_LavaBallsSnapshot().glow;
	// the server removes the shot and sends TE_KNIGHTSPIKE at the wall (x = 1000) in the same message
	let took;
	const native = particles( env, () => { took = R_KnightSpikeImpact( Float32Array.of( 1000, 0, 100 ) ); } );
	same( took, true, 'the fireball takes the event' ); same( native.length, 0, 'no native spray' );
	frame( env, [] );
	const s = lb.R_LavaBallsSnapshot();
	same( s.rings, 1, 'one impact ring: the shot\'s disappearance adds no second impact' ); same( s.drawn, 0, 'the fireball is gone' );
	check( s.glow >= glowBefore + 20 && s.smoke >= 5, `the source's sparks and smoke (${glowBefore} -> ${s.glow}, smoke ${s.smoke})` );
	const R = layerOf( env, 'lavaball_rings' ).geometry.getAttribute( 'aCenterRadius' ).array, N = layerOf( env, 'lavaball_rings' ).geometry.getAttribute( 'aNormalAlpha' ).array;
	near( R[ 0 ], 1000, 1e-3, 'the ring at the server\'s point' ); near( N[ 0 ], - 1, 1e-5, 'facing back along the shot (the source\'s fallback normal)' );
	// a hit with no shot in view: the impact still, facing up
	env = setup();
	same( R_KnightSpikeImpact( Float32Array.of( 0, 0, 0 ) ), true, 'an unseen shot\'s hit is the source\'s impact too' );
	frame( env, [] );
	near( layerOf( env, 'lavaball_rings' ).geometry.getAttribute( 'aNormalAlpha' ).array[ 2 ], 1, 1e-6, 'facing up' );
	// a lava ball nearer the point than the Knight's shot: the shot's direction is the one taken
	env = setup();
	const shot = ball( 330, [ 400, 0, 100 ], KSPIKE ), lava = ball( 331, [ 470, 0, 74 ] );
	for ( let k = 0; k < 6; k ++ ) { frame( env, [ shot, lava ] ); shot.origin[ 0 ] += 6; lava.origin[ 2 ] += 6; }
	R_KnightSpikeImpact( Float32Array.of( 470, 0, 100 ) );
	frame( env, [ lava ] );
	const NA = layerOf( env, 'lavaball_rings' ).geometry.getAttribute( 'aNormalAlpha' ).array;
	near( NA[ 0 ], - 1, 1e-5, 'the ring faces back along the Knight shot (-x), not the lava ball (up)' ); near( NA[ 2 ], 0, 1e-5, 'no vertical part' );
	// the pool full with lava balls: a Knight shot left native ends in the native spray
	env = setup();
	lb.R_LavaBallsBegin();
	for ( let k = 0; k < lb.LAVABALL.max; k ++ ) lb.R_LavaBall( ball( 400 + k, [ k * 10, 500, 100 ] ) );
	const left = ball( 999, [ 0, 0, 100 ], KSPIKE );
	check( ! lb.R_LavaBall( left ) && ! lb.R_LavaBallTakes( KSPIKE, 999 ), 'full pool: the shot keeps its native model and tracer' );
	const spray = particles( env, () => { took = R_KnightSpikeImpact( Float32Array.of( 0, 0, 0 ) ); } );
	same( took, false, 'full pool: the native spray' ); check( spray.length === 1 && ! spray[ 0 ].classicOnly, 'the ordinary native spray' );
	lb.R_LavaBallsClear();
	// Classic: the native spray, reported
	newer( false );
	const classic = particles( env, () => { took = R_KnightSpikeImpact( Float32Array.of( 0, 0, 0 ) ); } );
	same( took, false, 'Classic: native' ); check( classic.length === 1 && ! classic[ 0 ].classicOnly, 'the ordinary native spray' );
	newer( true ); r_demosplit.value = 2;
	const split = particles( env, () => { took = R_KnightSpikeImpact( Float32Array.of( 0, 0, 0 ) ); } );
	check( took && split.length === 1 && split[ 0 ].classicOnly, 'split title demo: the native spray for the classic half only' );
	r_demosplit.value = 0;
	lb.R_LavaBallsClear();

} );

Deno.test( 'the engine hands each EF_TRACER2 trail its key and model and routes TE_KNIGHTSPIKE through the fireball', () => {

	const clmain = readFileSync( new URL( '../src/engine/client/cl_main.js', import.meta.url ), 'utf8' );
	check( /R_RocketTrail\( _peOldorg, ent\.origin, 5, s1\.number, model \)/.test( clmain ) && /R_RocketTrail\( _relinkOldorg, ent\.origin, 5, i, ent\.model \)/.test( clmain ), 'both EF_TRACER2 trail calls pass the key and model' );
	const tent = readFileSync( new URL( '../src/engine/client/cl_tent.js', import.meta.url ), 'utf8' );
	const at = tent.indexOf( 'case TE_KNIGHTSPIKE:' ), next = tent.indexOf( 'break;', at );
	check( at > 0 && /R_KnightSpikeImpact\( pos \)/.test( tent.slice( at, next ) ) && /cl_sfx_knighthit/.test( tent.slice( at, next ) ), 'TE_KNIGHTSPIKE draws through R_KnightSpikeImpact and keeps its sound' );

} );
