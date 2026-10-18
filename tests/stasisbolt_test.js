// "STASIS 02" bolt port (card [LZ1]): every laser shot in Newer Game is drawn as one supplied bolt. The source's own
// CombatFX is run (without a renderer) and compared with the port's dimensions, colours, shader statements, spark and
// impact distributions and particle motion; the public entry points are then driven as the engine drives them: the
// real entity draw loop (R_DrawEntitiesOnList), the real TE_GUNSHOT parser (CL_ParseTEnt) and the frame. WebGL is not
// involved: instance buffers are inspected, so no GPU pixel parity is claimed here (tests/stasisbolt_trial.html shows
// it in the browser).
import { readFileSync, existsSync } from './helpers/resource_fs.mjs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { cvar_t, Cvar_RegisterVariable, Cvar_SetValue, Cvar_FindVar } from '../src/engine/common/cvar.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { r_demosplit } from '../src/newer/render/r_demosplit.js';
import * as sb from '../src/newer/render/r_stasisbolt.js';
import * as part from '../src/engine/render/r_part.js';
import { COM_SetNetMessage, MSG_BeginReading } from '../src/engine/common/common.js';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { entity_t } from '../src/engine/render/render.js';

const SOURCE_SHA256 = '8ae01c6dbfdc442b43dec7c48d622963f52069a8c6e665a785b6a1da248c52a8';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const near = ( a, b, eps, label ) => { if ( ! ( Math.abs( a - b ) <= eps ) ) throw new Error( `${label}: ${a} != ${b}` ); };
const same = ( a, b, label ) => { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); };

if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( new cvar_t( 'r_hdr', '1' ) );
const newer = on => Cvar_SetValue( 'r_hdr', on ? 1 : 0 );

// A wall at x = 100 facing -x (air for x < 100), 1024 units square, as the BSP leaf code sees it.
function wallWorld() {

	const wall = { flags: 2 /* SURF_PLANEBACK */, plane: { normal: [ 1, 0, 0 ], dist: 100 }, texinfo: { vecs: [ [ 0, 1, 0, 0 ], [ 0, 0, 1, 0 ] ] },
		texturemins: [ - 512, - 512 ], extents: [ 1024, 1024 ] };
	const air = { contents: - 1, firstmarksurface: [ wall ], nummarksurfaces: 1 }, solid = { contents: - 2 };
	return { model: { leafs: [ air ] }, pointInLeaf: p => p[ 0 ] >= 100 ? solid : air };

}

function setup( { scene = new THREE.Scene(), time = { now: 10 } } = {} ) {

	const w = wallWorld();
	sb.R_StasisBoltSetup( { scene, cl: () => ( { time: time.now, oldtime: time.now - .016, worldmodel: w.model } ), pointInLeaf: w.pointInLeaf } );
	sb.R_StasisBoltClear();
	newer( true ); R_AnimSetClassicPass( false ); sb.r_stasisbolt.value = 1;
	return { scene, time, group: () => scene.children.find( c => c.name === 'quake_stasis_bolts' ) };

}
// a laser entity as the client links it: origin, angles from vectoangles (pitch up positive)
const LASER = { name: 'progs/laser.mdl', type: 0 };
function laser( origin, yaw = 0, pitch = 0, model = LASER ) {

	const e = new entity_t(); e.model = model; e.origin.set( origin ); e.angles.set( [ pitch, yaw, 0 ] ); return e;

}
const frame = ( env, ents, dt = 0 ) => { env.time.now += dt; for ( const e of ents ) sb.R_StasisBoltTakes( e ); sb.R_StasisBoltFrame( env.time.now, [ 1280, 720 ] ); return sb.R_StasisBoltSnapshot(); };

// ---------------------------------------------------------------------------
// Against the source
// ---------------------------------------------------------------------------

function source() {

	const path = new URL( process.env.QUAKED_STASIS_SOURCE ? 'file://' + process.env.QUAKED_STASIS_SOURCE : '../stasis-combat-fx-v2.html', import.meta.url );
	const need = process.env.QUAKED_STASIS_SOURCE_REQUIRED === '1';
	const skip = why => { if ( need ) throw new Error( why + ' (QUAKED_STASIS_SOURCE_REQUIRED=1)' ); console.log( 'SKIPPED source equivalence: ' + why ); return null; };
	// absent: read it anyway, so the missing page (a local input, never committed) is reported by tools/run_tests.mjs as
	// this test skipped with the page named, not as passed
	if ( ! existsSync( path ) ) { if ( need ) throw new Error( 'source file not present locally (QUAKED_STASIS_SOURCE_REQUIRED=1)' ); readFileSync( path ); }
	const bytes = readFileSync( path );
	if ( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) !== SOURCE_SHA256 ) return skip( 'different source revision' );
	const text = bytes.toString( 'utf8' ), lines = text.split( '\n' );
	const from = lines.findIndex( l => l.startsWith( '// ---- physics.js ----' ) ), to = lines.findIndex( l => l.startsWith( '// ---- main.js ----' ) );
	check( from > 0 && to > from, 'the source\'s module sections located' );
	const ctx = { THREE, Math, Number, Object, Array, Set, Map, TypeError, RangeError, Error };
	runInNewContext( lines.slice( from, to ).join( '\n' ) + '\nthis.CombatFX=CombatFX;this.NOISE_GLSL=NOISE_GLSL;this.PLASMA_FRAGMENT=PLASMA_FRAGMENT;this.PARTICLE_FRAGMENT=PARTICLE_FRAGMENT;', ctx );
	return ctx;

}

Deno.test( 'the bolt\'s size, colours, shader and the owner\'s call equal the source\'s CombatFX at scale 0.24', () => {

	const src = source();
	if ( src === null ) return;
	const fx = new src.CombatFX( new THREE.Scene() );
	// the owner's call, verbatim
	const burst = fx.fireBurst( 'bolt', { origin: new THREE.Vector3( - 6, 1.8, 0 ), direction: new THREE.Vector3( 1, 0, 0 ), count: 4, frequency: 8, scale: .24, freezeAt: 7.5 } );
	check( burst !== null && fx.bolts.length === 1, 'the burst emits its first pulse at once' );
	const b = fx.bolts[ 0 ];
	near( b.length, sb.STASIS.length, 1e-12, 'bolt length (3.15 x scale)' );
	near( b.radius, sb.STASIS.radius, 1e-12, 'bolt radius (max(0.014, 0.115 x scale))' );
	near( b.volume.mesh.scale.x, sb.STASIS.length / 2, 1e-12, 'proxy box half length' );
	near( b.volume.mesh.scale.y, sb.STASIS.radius * sb.STASIS.sheath, 1e-12, 'proxy box half width' );
	check( b.uniforms.uColor.value.equals( new THREE.Color( sb.STASIS.color ) ) && b.uniforms.uHot.value.equals( new THREE.Color( sb.STASIS.hot ) ), 'colours' );
	same( b.uniforms.uSteps.value, sb.STASIS.steps, 'steps (quality high)' ); near( b.uniforms.uRoughness.value, sb.STASIS.roughness, 1e-12, 'roughness' );
	same( b.uniforms.uPower.value, sb.STASIS.power, 'power' );
	same( b.motion.freezeAt, 7.5, 'freezeAt is the travel distance (m) where the first pulse stops' );
	same( sb.NOISE_GLSL, src.NOISE_GLSL, 'noise GLSL verbatim' );
	// every statement of the source's ray march is in the port (the camera and phase become per-instance varyings)
	const norm = s => s.trim().replace( /\s+/g, ' ' );
	const mine = new Set( sb.PLASMA_FRAGMENT.split( '\n' ).map( norm ) );
	const body = src.PLASMA_FRAGMENT.split( '\n' ).map( norm ).filter( l => l && ! l.startsWith( '//' ) && ! /^(uniform|varying)\b/.test( l ) && ! l.startsWith( 'float hash31' ) );
	const replaced = [ 'vec3 ro = uCameraLocal;', 'gl_FragColor=vec4(radiance*uPower,clamp(opacity,0.0,1.0));' ];
	let statements = 0;
	for ( const l of body ) {

		if ( replaced.includes( l ) || src.NOISE_GLSL.split( '\n' ).map( norm ).includes( l ) ) continue;
		check( mine.has( l ), 'source statement missing from the port: ' + l ); statements ++;

	}
	check( statements > 35, 'a meaningful number of statements compared: ' + statements );
	check( mine.has( 'vec3 ro = vCam;' ) && mine.has( 'float uPhase = vPhase;' ), 'the replaced inputs' );
	for ( const l of [ 'float fade=smoothstep(0.0,0.25,vLife);', 'alpha=exp(-r*r*5.5)*fade;', 'col+=vec3(0.3)*exp(-r*r*40.0);' ] ) {

		check( src.PARTICLE_FRAGMENT.includes( l ) && sb.SPARK_FRAGMENT.includes( l ), 'glow particle statement: ' + l );

	}

} );

Deno.test( 'glow sparks and the bolt impact draw from the source\'s distributions; particle motion matches its integrator', () => {

	const src = source();
	if ( src === null ) return;
	const fx = new src.CombatFX( new THREE.Scene() ), emitted = [];
	const emit = fx.glow.emit.bind( fx.glow );
	fx.glow.emit = p => { emitted.push( p ); emit( p ); };
	fx.shootBolt( { origin: { x: 0, y: 2, z: 0 }, direction: { x: 1, y: 0, z: 0 }, length: sb.STASIS.length, radius: sb.STASIS.radius, freezeAt: null, maxDistance: 100 } );
	for ( let i = 0; i < 24; i ++ ) fx.update( 1 / 60 ); // 0.4 s of flight
	near( emitted.length, .4 * sb.STASIS.glow.rate, 1, 'sparks per second while flying' );
	const g = sb.STASIS.glow, out = new Float64Array( 8 );
	for ( const p of emitted ) {

		check( p.size >= g.size[ 0 ] && p.size <= g.size[ 1 ] && p.life >= g.life[ 0 ] && p.life <= g.life[ 1 ], 'spark size and life range' );
		check( p.color.every( ( c, i ) => c === g.color[ i ] ), 'spark colour' );

	}
	for ( let m = 0; m < 200; m ++ ) {

		sb.glowSpark( 3, m, out );
		check( Math.abs( out[ 0 ] ) <= sb.STASIS.length / 2 && Math.abs( out[ 1 ] ) <= sb.STASIS.radius && Math.abs( out[ 2 ] ) <= sb.STASIS.radius, 'port: spark placed on the bolt' );
		check( out[ 6 ] >= g.life[ 0 ] && out[ 6 ] <= g.life[ 1 ] && out[ 7 ] >= g.size[ 0 ] && out[ 7 ] <= g.size[ 1 ], 'port: spark life and size range' );

	}
	// the impact, as _updateBolts calls it for this bolt (visual scale = length / 3.15)
	emitted.length = 0;
	fx._impact( 'bolt', { point: { x: 0, y: 2, z: 0 }, normal: { x: - 1, y: 0, z: 0 } }, { x: 1, y: 0, z: 0 }, 1, sb.STASIS.length / 3.15 );
	const k = sb.STASIS.impact;
	same( emitted.length, k.count, 'impact particle count' );
	for ( const p of emitted ) {

		check( p.size >= k.size[ 0 ] - 1e-12 && p.size <= k.size[ 1 ] + 1e-12 && p.life >= k.life[ 0 ] && p.life <= k.life[ 1 ], 'impact size and life range' );
		same( p.gravity, k.gravity, 'gravity' ); same( p.drag, k.drag, 'drag' ); check( p.color.every( ( c, i ) => c === k.color[ i ] ), 'impact colour' );
		const s = - p.velocity.x; // (normal -x: x is the normal speed plus a -1.5..1.5 spread)
		check( s >= k.speed[ 0 ] - 1.5 && s <= k.speed[ 1 ] + 1.5 && p.velocity.y >= 0 && p.velocity.y <= 2.5 && Math.abs( p.velocity.z ) <= 2, 'impact velocity ranges' );

	}
	const ring = fx.rings[ fx.rings.length - 1 ];
	near( ring.size, k.ringSize, 1e-12, 'ring growth' ); same( ring.life, k.ringLife, 'ring life' );
	check( ring.mesh.material.color.equals( new THREE.Color( k.ringColor ) ), 'ring colour' );
	const pOut = new Float64Array( 5 );
	for ( let j = 0; j < k.count; j ++ ) {

		sb.impactParticle( 9, j, - 1, 0, 0, pOut );
		const s = - pOut[ 0 ];
		check( s >= k.speed[ 0 ] - 1.5 && s <= k.speed[ 1 ] + 1.5 && pOut[ 2 ] >= 0 && pOut[ 2 ] <= 2.5 && Math.abs( pOut[ 1 ] ) <= 2, 'port: impact velocity ranges (z up)' );
		check( pOut[ 3 ] >= k.size[ 0 ] && pOut[ 3 ] <= k.size[ 1 ] && pOut[ 4 ] >= k.life[ 0 ] && pOut[ 4 ] <= k.life[ 1 ], 'port: impact size and life' );

	}
	// the ring as update() grows and fades it
	fx.update( .2 );
	const u = ring.age / ring.life;
	const rr = sb.impactRing( ring.age, [ 0, 0 ] ); near( rr[ 0 ], ring.mesh.scale.x, 1e-9, 'ring radius' ); near( rr[ 1 ], ( 1 - u ) * .45, 1e-9, 'ring opacity' );
	// motion: the source's step-by-step integration against the closed form (the source's y up is the port's z)
	fx.clear(); const probe = fx.glow;
	probe.emit( { position: { x: 0, y: 5, z: 0 }, velocity: { x: 2, y: 3, z: - 1 }, gravity: 6, drag: 1, life: 2, size: .1 } );
	const slot = ( probe.cursor + probe.capacity - 1 ) % probe.capacity, d = new Float64Array( 3 );
	for ( let i = 0; i < 30; i ++ ) probe.update( 1 / 60, 0 );
	sb.particleOffset( .5, 2, - 1, 3, 6, 1, d );
	near( probe.arrays.position[ slot * 3 ], d[ 0 ], 1e-5, 'x after 0.5 s' );
	near( probe.arrays.position[ slot * 3 + 1 ] - 5, d[ 2 ], 1e-5, 'up after 0.5 s' );
	near( probe.arrays.position[ slot * 3 + 2 ], d[ 1 ], 1e-5, 'z after 0.5 s' );

} );

// ---------------------------------------------------------------------------
// The public interface
// ---------------------------------------------------------------------------

Deno.test( 'Newer Game only: Classic, the split\'s Classic pass, r_stasisbolt 0, other models and no scene keep the native laser', () => {

	const env = setup(), e = laser( [ 0, 0, 0 ] );
	same( sb.R_StasisBoltTakes( e ), true, 'Newer Game: the bolt takes the laser' );
	newer( false ); same( sb.R_StasisBoltTakes( e ), false, 'Classic draws the native laser' ); newer( true );
	R_AnimSetClassicPass( true ); same( sb.R_StasisBoltTakes( e ), false, 'the title demo\'s Classic half draws the native laser' ); R_AnimSetClassicPass( false );
	sb.r_stasisbolt.value = 0; same( sb.R_StasisBoltTakes( e ), false, 'r_stasisbolt 0 puts the native laser back' );
	sb.R_StasisBoltFrame( env.time.now, null ); same( sb.R_StasisBoltSnapshot().tracked, 0, '...and drops what was tracked' ); sb.r_stasisbolt.value = 1;
	for ( const name of [ 'progs/spike.mdl', 'progs/s_spike.mdl', 'progs/k_spike.mdl', 'progs/w_spike.mdl', 'progs/missile.mdl' ] ) same( sb.R_StasisBoltTakes( laser( [ 0, 0, 0 ], 0, 0, { name } ) ), false, name + ' is not a laser' );
	sb.R_StasisBoltSetup( { scene: null, cl: () => ( { time: 1 } ) } ); same( sb.R_StasisBoltTakes( e ), false, 'no scene' );
	// Classic: nothing drawn, the layers hidden
	const env2 = setup(); same( frame( env2, [ e ] ).bolts, 1, 'drawn in Newer' );
	newer( false ); const snap = frame( env2, [ e ], .016 );
	check( snap.bolts === 0 || ! snap.visible, 'Classic draws no bolt' ); check( ! env2.group().visible, 'the layers are hidden in Classic' ); newer( true );

} );

Deno.test( 'one bolt per native projectile, at its origin along its flight, following it, gone when it is', () => {

	const env = setup();
	const a = laser( [ 0, 0, 64 ] ), b = laser( [ 0, 200, 64 ], 90, 30 );
	let s = frame( env, [ a, b ] );
	same( s.bolts, 2, 'two lasers, two bolts (one for one, not a burst of four)' );
	check( env.group()?.userData.newerOnly === true && env.group().visible, 'the layers are Newer-only and shown' );
	const C = env.group().children.find( c => c.name === 'stasis_bolts' ).geometry.attributes;
	near( C.aCenter.array[ 0 ], 0, 1e-4, 'centred on the origin x' ); near( C.aCenter.array[ 2 ], 64, 1e-4, 'z' );
	near( C.aAxis.array[ 0 ], 1, 1e-6, 'yaw 0 flies +x' ); near( C.aAxis.array[ 3 ], sb.STASIS.length * .5 * sb.STASIS.unit, 1e-4, 'half length in Quake units (scale 0.24)' );
	near( C.aAxis.array[ 4 ], 0, 1e-6, 'yaw 90 pitch 30: x' ); near( C.aAxis.array[ 5 ], Math.cos( Math.PI / 6 ), 1e-6, 'y' ); near( C.aAxis.array[ 6 ], .5, 1e-6, 'pitched up' );
	// the projectiles move (the game moves them; the bolt follows)
	for ( let i = 0; i < 5; i ++ ) { a.origin[ 0 ] += 10; b.origin[ 1 ] += 8; s = frame( env, [ a, b ], 1 / 60 ); }
	same( s.bolts, 2, 'still two' ); near( s.centers[ 0 ][ 0 ], 50, 1e-4, 'follows a' ); near( s.centers[ 1 ][ 1 ], 240, 1e-4, 'follows b' );
	check( s.sparks > 0, 'the bolts shed glow sparks' );
	// b is removed by the game: not listed any more
	s = frame( env, [ a ], 1 / 60 );
	same( s.bolts, 1, 'a removed projectile\'s bolt is gone at once' );
	s = frame( env, [ a ], .4 );
	same( s.tracked, 1, 'its slot is free after its sparks\' life' );
	// gameplay untouched: the entity is read, never written
	const before = JSON.stringify( [ Array.from( a.origin ), Array.from( a.angles ), a.model, a.frame ] );
	frame( env, [ a ], 1 / 60 ); sb.R_StasisBoltImpact( [ a.origin[ 0 ] + 30, a.origin[ 1 ], a.origin[ 2 ] ] );
	same( JSON.stringify( [ Array.from( a.origin ), Array.from( a.angles ), a.model, a.frame ] ), before, 'the entity is unchanged' );

} );

Deno.test( 'a shot wrongly marked struck that is still flying a moment later is drawn again', () => {

	const env = setup(), e = laser( [ 0, 0, 64 ] );
	frame( env, [ e ] ); e.origin[ 0 ] = 40; frame( env, [ e ], 1 / 15 );
	same( sb.R_StasisBoltImpact( [ 60, 0, 64 ] ), true, 'an event on its path is taken as its impact' );
	same( frame( env, [ e ], 1 / 60 ).bolts, 0, 'still listed at once: taken as the removal not yet arrived, not drawn' );
	e.origin[ 0 ] = 120; same( frame( env, [ e ], .15 ).bolts, 1, 'still flying 0.1 s later: it was not this shot\'s event; drawn again' );

} );

Deno.test( 'an entity number reused by a new shot starts a new bolt; a full pool keeps the native model', () => {

	const env = setup(), e = laser( [ 0, 0, 0 ] );
	frame( env, [ e ] );
	const phase = env.group().children.find( c => c.name === 'stasis_bolts' ).geometry.attributes.aCenter.array[ 3 ];
	e.origin.set( [ 900, 900, 0 ] ); e.angles.set( [ 0, 180, 0 ] );
	frame( env, [ e ], 1 / 60 );
	const C = env.group().children.find( c => c.name === 'stasis_bolts' ).geometry.attributes;
	check( C.aCenter.array[ 3 ] !== phase, 'a new bolt (new phase) for the reused entity' ); near( C.aAxis.array[ 0 ], - 1, 1e-6, 'with its own heading' );
	const many = Array.from( { length: sb.STASIS.maxBolts }, ( _, i ) => laser( [ i * 40, 500, 0 ] ) );
	let taken = 0;
	sb.R_StasisBoltClear();
	for ( const l of many ) if ( sb.R_StasisBoltTakes( l ) ) taken ++;
	same( taken, sb.STASIS.maxBolts, 'the pool holds 32' );
	same( sb.R_StasisBoltTakes( laser( [ 0, - 500, 0 ] ) ), false, 'the 33rd stays native' );

} );

Deno.test( 'a laser striking a wall gets the source\'s impact on the wall; real bullets keep theirs', () => {

	// a shot at 30 degrees to the wall's normal, so the struck point, the event point and their perpendiculars differ
	const env = setup(), d = [ Math.cos( Math.PI / 6 ), Math.sin( Math.PI / 6 ), 0 ], e = laser( [ 40, 0, 64 ], 30 );
	frame( env, [ e ] ); e.origin[ 0 ] += d[ 0 ] * 45; e.origin[ 1 ] += d[ 1 ] * 45; frame( env, [ e ], 1 / 15 );
	// Laser_Touch: TE_GUNSHOT 8 units back along the shot from where it touched the wall (x = 100)
	const t = 60 / d[ 0 ], touch = [ 40 + d[ 0 ] * t, d[ 1 ] * t, 64 ], event = [ touch[ 0 ] - d[ 0 ] * 8, touch[ 1 ] - d[ 1 ] * 8, 64 ];
	same( sb.R_StasisBoltImpact( [ 0, 300, 64 ] ), false, 'a gunshot far off the bolt\'s path is a bullet' );
	same( sb.R_StasisBoltImpact( [ event[ 0 ], event[ 1 ] + 40, 64 ] ), false, 'a gunshot level with the bolt but 40 units off its line is a bullet' );
	const side = [ - d[ 1 ], d[ 0 ], 0 ], ahead = [ e.origin[ 0 ] + d[ 0 ] * 100 + side[ 0 ] * 8, e.origin[ 1 ] + d[ 1 ] * 100 + side[ 1 ] * 8, 64 ];
	same( sb.R_StasisBoltImpact( ahead ), false, 'a gunshot 8 units off the line, 100 units ahead, is a bullet' );
	const beside = [ e.origin[ 0 ] + d[ 0 ] * 20 + side[ 0 ] * 8, e.origin[ 1 ] + d[ 1 ] * 20 + side[ 1 ] * 8, 64 ];
	same( sb.R_StasisBoltImpact( beside ), false, 'a gunshot 8 units off the line, just ahead of the bolt, is a bullet' );
	same( sb.R_StasisBoltImpact( event ), true, 'the gunshot on its path is the laser\'s impact' );
	same( sb.R_StasisBoltImpact( event ), false, 'one impact per bolt' );
	let s = frame( env, [], 1 / 60 );
	same( s.bolts, 0, 'the bolt ends at its impact' ); same( s.impacts, 1, 'one impact' ); same( s.rings, 1, 'its ring' );
	check( s.sparks >= sb.STASIS.impact.count - 2, 'its particles: ' + s.sparks );
	const R = env.group().children.find( c => c.name === 'stasis_rings' ).geometry.attributes;
	near( R.aCenterRadius.array[ 0 ], 99.5, 1e-3, 'the ring lies on the struck wall (half a unit off it)' );
	near( R.aCenterRadius.array[ 1 ], touch[ 1 ], 1e-3, '...where the shot touched it, along the shot' );
	near( Math.abs( R.aAxisU.array[ 0 ] ) + Math.abs( R.aAxisV.array[ 0 ] ), 0, 1e-6, 'in the wall\'s plane' );
	s = frame( env, [], .5 ); same( s.rings, 0, 'the ring is over after 0.45 s' ); check( s.impacts === 1, 'particles live up to 0.8 s' );
	s = frame( env, [], .4 ); same( s.impacts, 0, 'all over after 0.8 s' );
	newer( false ); same( sb.R_StasisBoltImpact( event ), false, 'Classic: native' ); newer( true );

} );

Deno.test( 'engine: the entity draw loop leaves out the laser\'s mesh in Newer only, and TE_GUNSHOT loses its puff only for a laser', async () => {

	const main = await import( '../src/engine/render/gl_rmain.js' ), client = await import( '../src/engine/client/client.js' ), tent = await import( '../src/engine/client/cl_tent.js' );
	const pak = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.byteLength ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
	main.R_Init(); main.R_NewMap();
	const savedView = client.cl.viewent, savedCount = client.cl_numvisedicts, savedList = client.cl_visedicts.slice(), savedTime = client.cl.time;
	// the shareware has no laser.mdl: the nail model under the laser's name stands in (the draw loop decides by name)
	const spike = Mod_ForName( 'progs/spike.mdl', true ), model = Object.assign( Object.create( Object.getPrototypeOf( spike ) ), spike, { name: 'progs/laser.mdl' } );
	try {

		newer( true ); R_AnimSetClassicPass( false ); sb.r_stasisbolt.value = 1; client.cl.time = 5;
		const e = laser( [ 10, 20, 30 ], 0, 0, model );
		client.cl_visedicts.splice( 0, 1, e ); client.set_cl_numvisedicts( 1 );
		main.R_DrawEntitiesOnList(); sb.R_StasisBoltFrame( client.cl.time, null );
		check( e._aliasMesh?.parent !== main.scene, 'Newer: the native laser mesh is not in the scene' );
		same( sb.R_StasisBoltSnapshot().bolts, 1, 'Newer: one bolt instead' );
		check( main.scene.children.some( c => c.name === 'quake_stasis_bolts' && c.visible ), 'the bolt layers joined the renderer\'s scene' );
		// a TE_GUNSHOT on its path: no native puff; one elsewhere: the native puff
		let classicOnlyPuffs = 0;
		const puffs = gunshot => {

			part.R_ClearParticles(); part.R_SetParticleExternals( { scene: main.scene } );
			const data = new Uint8Array( 7 ), view = new DataView( data.buffer );
			data[ 0 ] = 2; for ( let i = 0; i < 3; i ++ ) view.setInt16( 1 + i * 2, gunshot[ i ] * 8, true );
			COM_SetNetMessage( { data, cursize: 7, maxsize: 7 } ); MSG_BeginReading(); tent.CL_ParseTEnt();
			client.cl.oldtime = client.cl.time - .01; part.R_DrawParticles();
			const points = main.scene.children.filter( c => c.isPoints );
			classicOnlyPuffs = points.filter( c => c.userData.classicOnly === true ).reduce( ( n, c ) => n + c.geometry.drawRange.count, 0 );
			return points.reduce( ( n, c ) => n + c.geometry.drawRange.count, 0 );

		};
		same( puffs( [ 400, 400, 30 ] ), 20, 'a bullet keeps its 20 native particles' );
		same( puffs( [ 30, 20, 30 ] ), 0, 'the laser\'s impact has no native particles (the bolt\'s impact draws it)' );
		sb.R_StasisBoltFrame( client.cl.time, null ); same( sb.R_StasisBoltSnapshot().impacts, 1, 'the bolt impact is live' ); same( sb.R_StasisBoltSnapshot().rings, 1, 'with its ring' );
		// the title demo's split view: the Newer half gets the bolt impact, the Classic half the native puff (flagged for it alone)
		const e3 = laser( [ 10, 60, 30 ], 0, 0, model ); client.cl_visedicts.splice( 0, 1, e3 ); main.R_DrawEntitiesOnList(); sb.R_StasisBoltFrame( client.cl.time, null );
		r_demosplit.value = 2;
		try { same( puffs( [ 30, 60, 30 ] ), 20, 'split: the native puff is spawned' ); same( classicOnlyPuffs, 20, '...for the Classic half only' ); } finally { r_demosplit.value = 0; }
		same( sb.R_StasisBoltSnapshot().impacts, 2, 'split: and the Newer half has the bolt impact' );
		// Classic and the Classic pass draw the native mesh
		client.cl_visedicts.splice( 0, 1, e ); newer( false ); main.R_DrawEntitiesOnList();
		check( e._aliasMesh?.parent === main.scene, 'Classic: the native laser mesh is drawn' );
		same( puffs( [ 30, 20, 30 ] ), 20, 'Classic: the gunshot keeps its native particles' );
		const e2 = laser( [ 50, 20, 30 ], 0, 0, model ); client.cl_visedicts.splice( 0, 1, e2 );
		newer( true ); main.R_DrawEntitiesOnList(); check( e2._aliasMesh == null, 'Newer: a new laser gets no native mesh' );
		R_AnimSetClassicPass( true ); main.R_DrawEntitiesOnList();
		check( e2._aliasMesh?.parent === main.scene, 'the split\'s Classic pass draws the native laser mesh' ); R_AnimSetClassicPass( false );

	} finally { R_AnimSetClassicPass( false ); newer( true ); client.cl.viewent = savedView; client.cl.time = savedTime; client.cl_visedicts.splice( 0, client.cl_visedicts.length, ...savedList ); client.set_cl_numvisedicts( savedCount ); sb.R_StasisBoltClear(); }

} );

Deno.test( 'per-frame buffers are allocated once: the same arrays and meshes every frame, bounded by the pools', () => {

	const env = setup(), e = laser( [ 0, 0, 0 ] );
	frame( env, [ e ] );
	const layers = env.group().children.map( c => [ c, ...Object.values( c.geometry.attributes ).map( a => a.array ) ] );
	for ( let i = 0; i < 120; i ++ ) { e.origin[ 0 ] += 10; frame( env, [ e ], 1 / 60 ); if ( i % 10 === 0 ) sb.R_StasisBoltImpact( [ e.origin[ 0 ] + 20, 0, 0 ] ); }
	const after = env.group().children.map( c => [ c, ...Object.values( c.geometry.attributes ).map( a => a.array ) ] );
	same( after.length, layers.length, 'same layers' );
	after.forEach( ( l, i ) => l.forEach( ( x, j ) => same( x, layers[ i ][ j ], 'same object ' + i + '.' + j ) ) );
	const sparks = env.group().children.find( c => c.name === 'stasis_sparks' );
	check( sparks.geometry.instanceCount <= sparks.geometry.attributes.aPosSize.count, 'within the spark pool' );

} );
