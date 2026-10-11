// [SP1] The Scrag's spit as the supplied "TWINSHOT — Venom FX Lab" liquid jet (src/newer/render/r_venom.js), through
// its public interface: the hooks the engine calls (R_VenomFrame, R_VenomTakesEntity, R_VenomTrail, R_VenomImpact)
// and the engine wrappers that use them (render.js R_RocketTrail and R_WizardSpikeImpact). WebGL is not involved: the
// instance counts a frame writes and the diagnostic snapshot are inspected, so these checks do not claim GPU pixel
// parity (tests/venom_trial.html and the browser screenshots do).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { cvar_t, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import * as venom from '../src/newer/render/r_venom.js';
import { R_RocketTrail, R_WizardSpikeImpact } from '../src/engine/render/render.js';
import { r_demosplit } from '../src/newer/render/r_demosplit.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import * as part from '../src/engine/render/r_part.js';
import { cl as clientState } from '../src/engine/client/client.js';

const SOURCE_SHA256 = '7cf9a25dfc9fd8aa9bd5a49319248822f0774501002d23da475cd3a30cf9e934';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const near = ( a, b, eps, label ) => { if ( ! ( Math.abs( a - b ) <= eps ) ) throw new Error( `${label}: ${a} != ${b}` ); };
const same = ( a, b, label ) => { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); };

Cvar_RegisterVariable( new cvar_t( 'r_hdr', '1' ) );
const newer = on => Cvar_SetValue( 'r_hdr', on ? 1 : 0 );
const K = venom.VENOM.unit, SPEED = 600; // Quake units per source metre; the native wizspike speed (units/s)

// a wall at x = 1000 (normal -x), a floor at z = 0; air between, solid beyond
function world() {

	const wall = { flags: 0, plane: { normal: [ - 1, 0, 0 ], dist: - 1000 }, texinfo: { vecs: [ [ 0, 1, 0, 0 ], [ 0, 0, 1, 0 ] ] }, texturemins: [ - 4096, - 4096 ], extents: [ 8192, 8192 ] };
	const floor = { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] }, texturemins: [ - 4096, - 4096 ], extents: [ 8192, 8192 ] };
	const air = { contents: - 1, firstmarksurface: [ wall, floor ], nummarksurfaces: 2 }, solid = { contents: - 2 };
	return { model: { leafs: [ air ] }, pointInLeaf: p => ( p[ 0 ] > 1000 || p[ 2 ] < 0 ) ? solid : air };

}

// the client's entities by number; a w_spike and other models
const model = name => ( { name, type: 2, flags: name.endsWith( 'w_spike.mdl' ) ? 16 : 0 } );
function entity( index, name, origin, angles = [ 0, 0, 0 ] ) {

	return { _entityIndex: index, model: model( name ), origin: Float32Array.from( origin ), angles: Float32Array.from( angles ) };

}

function setup( { time = { now: 10 } } = {} ) {

	const scene = new THREE.Scene(), w = world(), ents = [];
	venom.R_VenomSetup( { scene, cl: () => ( { time: time.now, worldmodel: w.model } ), entity: n => ents[ n ] ?? null, pointInLeaf: w.pointInLeaf } );
	venom.R_VenomClear();
	newer( true ); R_AnimSetClassicPass( false );
	r_demosplit.value = 1; venom.r_venom.value = 1;
	const env = { scene, time, ents, visible: [],
		group: () => scene.children.find( c => c.name === 'quake_venom' ),
		mesh: name => env.group()?.children.find( c => c.name === name ),
		// one client frame: dt seconds later, with these entities drawn
		frame( dt = 1 / 60, list = env.visible ) { time.now += dt; venom.R_VenomFrame( time.now, [ 0, 0, 22 ], list, list.length ); } };
	return env;

}

// What the native particle system puts in the scene during `act` (as tests/fireball_test.js counts it).
function particles( env, act ) {

	part.R_InitParticles(); part.R_ClearParticles();
	part.R_SetParticleExternals( { scene: env.scene } );
	clientState.time = 1; clientState.oldtime = .99;
	act();
	part.R_DrawParticles();
	const out = env.scene.children.filter( c => c.isPoints ).map( c => ( { classicOnly: c.userData.classicOnly === true, visible: c.visible, count: c.geometry.drawRange.count } ) );
	part.R_ClearParticles(); part.R_DrawParticles();
	return out.filter( m => m.count > 0 );

}
const total = batches => batches.reduce( ( n, m ) => n + m.count, 0 );

// A spike flying +x from (100, 0, 64) at 600 units/s, launched as entity 5.
function spike( env, index = 5, from = [ 100, 0, 64 ], dir = [ 1, 0, 0 ] ) {

	const yaw = Math.atan2( dir[ 1 ], dir[ 0 ] ) * 180 / Math.PI, pitch = Math.asin( dir[ 2 ] ) * 180 / Math.PI;
	const e = entity( index, 'progs/w_spike.mdl', from, [ pitch, yaw, 0 ] );
	env.ents[ index ] = e; env.visible.push( e );
	return { e, at: t => { for ( let i = 0; i < 3; i ++ ) e.origin[ i ] = from[ i ] + dir[ i ] * SPEED * t; } };

}

Deno.test( 'the ported stream window and shaders are the source\'s own', () => {

	const path = process.env.QUAKED_VENOM_SOURCE || new URL( '../twin-shot-venom.html', import.meta.url ).pathname;
	const need = process.env.QUAKED_VENOM_SOURCE_REQUIRED === '1', skip = why => { if ( need ) throw new Error( why + ' (QUAKED_VENOM_SOURCE_REQUIRED=1)' ); console.log( 'SKIPPED source equivalence: ' + why ); };
	// absent: read it anyway, so the missing page (a local input, never committed) is reported by tools/run_tests.mjs as
	// this test skipped with the page named, not as passed
	if ( ! existsSync( path ) ) { if ( need ) throw new Error( 'source file not present locally (QUAKED_VENOM_SOURCE_REQUIRED=1)' ); readFileSync( path ); }
	const bytes = readFileSync( path );
	if ( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) !== SOURCE_SHA256 ) return skip( 'different source revision' );
	// the effect's ES module is one JS string literal in the page (`const source="..."`)
	const line = bytes.toString( 'utf8' ).split( '\n' ).find( l => l.startsWith( 'const source="' ) );
	check( line, 'the source module located' );
	const module = JSON.parse( line.slice( 'const source='.length, line.lastIndexOf( '";' ) + 1 ) );
	const fn = module.slice( module.indexOf( 'export function streamWindow' ), module.indexOf( 'export function segmentPlane' ) ).replace( 'export ', '' );
	const ctx = {};
	runInNewContext( fn + '\nthis.streamWindow=streamWindow;', ctx );
	for ( const age of [ - .1, 0, .05, .2, .28, .3, .5, .9 ] ) for ( const limit of [ 3, 8.6, 20 ] ) {

		const a = ctx.streamWindow( age, 22, .28, limit ), b = venom.streamWindow( age, 22, .28, limit );
		for ( const k of [ 'head', 'tail', 'length', 'active' ] ) same( b[ k ], a[ k ], `streamWindow ${k} at age ${age}` );

	}
	// every line of the source's shader functions that carries the look is in the port verbatim
	const glsl = name => { const s = module.indexOf( `export const ${name}` ); return module.slice( module.indexOf( '`', s ) + 1, module.indexOf( '`;', s ) ); };
	const lines = ( text, from, to ) => text.slice( text.indexOf( from ), to ? text.indexOf( to, text.indexOf( from ) ) : undefined ).split( '\n' ).map( l => l.trim() ).filter( l => l.length > 6 );
	const has = ( port, src, label ) => { const missing = src.filter( l => ! port.includes( l ) ); check( missing.length === 0, `${label} lines missing from the port: ${missing.join( ' | ' )}` ); };
	has( venom.STREAM_VERTEX, lines( glsl( 'STREAM_VERTEX' ), 'float thickness', 'void main' ), 'STREAM_VERTEX thickness()' );
	has( venom.STREAM_VERTEX, [ 'float d=mix(uTail,uHead,position.x);', 'float edge=smoothstep(0.0,.055,d-uTail)*smoothstep(0.0,.085,uHead-d);', 'r*=mix(.08,1.0,edge);',
		'vec3 p=vec3(d,position.y*r,position.z*r);', 'float slope=(thickness(d+.008)-thickness(d-.008))/.016;', 'vec3 n=normalize(vec3(-slope,position.y,position.z));' ], 'STREAM_VERTEX main()' );
	const liquid = lines( glsl( 'LIQUID_FRAGMENT' ), 'void main' ).filter( l => ! /vec3 L2?=|gl_FragColor|#include|^}$/.test( l ) );
	has( venom.LIQUID_FRAGMENT, liquid, 'LIQUID_FRAGMENT' );
	const splat = lines( glsl( 'SPLAT_FRAGMENT' ), 'vec2 p=' ).filter( l => ! /gl_FragColor|#include|^}$/.test( l ) );
	has( venom.SPLAT_FRAGMENT, splat, 'SPLAT_FRAGMENT' );
	// the defaults the port takes from the source
	check( /speed=22,duration=\.28,radius=\.015/.test( module ), 'source jet defaults' ); same( venom.VENOM.speed, 22, 'speed' ); same( venom.VENOM.duration, .28, 'duration' ); same( venom.VENOM.radius, .015, 'radius' );
	check( module.includes( 'toxic:0xb9d675' ) && venom.VENOM.tint === 0xb9d675, 'toxic tint' );
	check( module.includes( "quality==='high'?900:360" ) && venom.VENOM.dropCap === 900, 'droplet pool' );
	check( module.includes( 'dt*125*this.density' ) && module.includes( 'dt*85*this.density' ) && module.includes( 'Math.round(30*this.density)' ), 'droplet rates' );
	check( module.includes( 'uLife:{value:4.4}' ) && module.includes( 'this.stains.length>=24' ), 'stain life and cap' );

} );

Deno.test( 'Classic and r_venom 0 keep the native spit: mesh, green tracer and impact particles', () => {

	for ( const mode of [ 'classic', 'off' ] ) {

		const env = setup();
		if ( mode === 'classic' ) newer( false ); else venom.r_venom.value = 0;
		const s = spike( env );
		for ( let f = 0; f < 10; f ++ ) { s.at( f / 60 ); env.frame(); }
		same( venom.R_VenomTakesEntity( s.e ), false, `${mode}: the native mesh is drawn` );
		same( venom.R_VenomTrail( 5 ), false, `${mode}: the native tracer is drawn` );
		same( venom.R_VenomSnapshot().jets.length, 0, `${mode}: no stream` );
		same( env.group()?.visible ?? false, false, `${mode}: nothing of the venom is shown` );
		const trail = particles( env, () => R_RocketTrail( [ 100, 0, 64 ], [ 140, 0, 64 ], 3, 5 ) );
		check( trail.length === 1 && ! trail[ 0 ].classicOnly && trail[ 0 ].count > 0, `${mode}: R_RocketTrail type 3 spawns the native tracer` );
		let took = null;
		const hit = particles( env, () => { took = R_WizardSpikeImpact( Float32Array.of( 999, 0, 64 ) ); } );
		same( took, false, `${mode}: R_WizardSpikeImpact reports the native picture` );
		same( total( hit ), 30, `${mode}: the native TE_WIZSPIKE spray (30 particles)` );

	}
	// switched off with spit in the air: everything goes at once, and the native picture is back
	const env = setup(), s = spike( env );
	for ( let f = 0; f < 10; f ++ ) { s.at( f / 60 ); env.frame(); }
	check( venom.R_VenomSnapshot().jets.length === 1 && env.group().visible, 'a stream in the air' );
	venom.r_venom.value = 0; env.frame();
	same( venom.R_VenomSnapshot().jets.length + venom.R_VenomSnapshot().droplets, 0, 'r_venom 0 drops the stream and its droplets' );
	same( env.group().visible, false, 'and hides the meshes' );
	same( venom.R_VenomTakesEntity( s.e ), false, 'the native mesh is drawn again' );
	newer( true ); venom.r_venom.value = 1;

} );

Deno.test( 'Newer Game: one stream per native spike, its leading edge on the entity, the tracer and mesh left out', () => {

	const env = setup(), a = spike( env, 5 ), b = spike( env, 6, [ 100, 40, 64 ], [ .96, - .28, 0 ] );
	const other = entity( 7, 'progs/k_spike.mdl', [ 0, 0, 64 ] ), plain = entity( 8, 'progs/wizard.mdl', [ 0, 0, 34 ] );
	env.ents[ 7 ] = other; env.ents[ 8 ] = plain; env.visible.push( other, plain );
	for ( let f = 0; f <= 12; f ++ ) { a.at( f / 60 ); b.at( f / 60 ); env.frame(); }
	const snap = venom.R_VenomSnapshot();
	same( snap.jets.length, 2, 'two native spikes, two streams (no extra projectile, nothing for other models)' );
	const ja = snap.jets.find( j => j.entity === 5 ), jb = snap.jets.find( j => j.entity === 6 );
	check( ja && jb, 'each stream belongs to its own entity' );
	// spike 5 has the Scrag (entity 8, 100 units behind it, 30 below its line as QuakeC launches) near its ray: the
	// stream starts at a fang on the Scrag's face. This stand-in model has no mesh, so the mouth is QuakeC's launch
	// point on the centre line (14 forward, 30 up) and the fang 0.13 source metres to the side (the real mesh: the
	// next test); spike 6 has no Scrag behind it and starts where first drawn
	const fang = .13 * K, mouth = [ 14, - fang, 64 ];
	for ( let i = 0; i < 3; i ++ ) near( ja.origin[ i ], mouth[ i ], 1e-4, 'spike 5: the stream starts at the Scrag\'s fang' );
	near( ja.head, 100 + SPEED * 12 / 60 - 14, .05, 'the leading edge is where the entity is drawn (Quake units from the fang, along the ray)' );
	for ( let i = 0; i < 3; i ++ ) { near( jb.origin[ i ], [ 100, 40, 64 ][ i ], 1e-4, 'spike 6: the ray starts where the entity was first drawn' ); near( jb.dir[ i ], [ .96, - .28, 0 ][ i ], 1e-4, 'ray follows the entity\'s motion' ); }
	near( jb.head, SPEED * 12 / 60, .01, 'spike 6: the leading edge is where the entity is drawn' );
	near( jb.tail, 0, 1e-9, 'within 0.28 s of launch the trailing edge is still at the mouth' );
	check( venom.R_VenomTakesEntity( a.e ) && venom.R_VenomTakesEntity( b.e ), 'the native w_spike meshes are left out' );
	check( ! venom.R_VenomTakesEntity( other ) && ! venom.R_VenomTakesEntity( plain ), 'other models are drawn natively' );
	check( venom.R_VenomTrail( 5 ) && ! venom.R_VenomTrail( 7 ), 'the w_spike tracer is left out, other models\' trails are not' );
	same( total( particles( env, () => R_RocketTrail( [ 100, 0, 64 ], [ 140, 0, 64 ], 3, 5 ) ) ), 0, 'R_RocketTrail draws no native tracer for the venom spike' );
	same( total( particles( env, () => R_RocketTrail( [ 100, 0, 64 ], [ 140, 0, 64 ], 3 ) ) ) > 0, true, 'a type 3 trail without an entity number keeps the native tracer' );
	same( venom.R_VenomSnapshot().streams, 2, 'both streams drawn this frame' );
	check( env.group().visible && env.mesh( 'venom_streams' ).userData.newerOnly, 'the meshes are shown, flagged Newer-only' );
	// the trailing edge leaves the mouth 0.28 s after launch, `duration` behind the entity
	for ( let f = 13; f <= 30; f ++ ) { a.at( f / 60 ); b.at( f / 60 ); env.frame(); }
	const later = venom.R_VenomSnapshot().jets.find( j => j.entity === 6 );
	near( later.head - later.tail, SPEED * venom.VENOM.duration, .5, 'the packet is 0.28 s of flight long' );
	check( venom.R_VenomSnapshot().droplets > 0, 'fine droplets ride the streams' );

} );

Deno.test( 'the spit leaves the Scrag\'s face: a fang beside its jaw in the frame drawn, on the side the spike left from', async () => {

	// the real id1 Scrag (shareware pak): its jaw corner, vertex 52, decoded independently of the engine (magatt3 and
	// magatt4, the frames QuakeC fires in, model space: forward, left, up)
	const { COM_LoadPackFile, COM_AddPack } = await import( '../src/engine/common/pak.js' );
	const { Mod_ForName } = await import( '../src/engine/render/gl_model.js' );
	const pak = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
	COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.length ) ) );
	const WIZARD = Mod_ForName( 'progs/wizard.mdl', true );
	const JAW = { 31: [ 11.4602, - .0414, 23.7184 ], 32: [ 11.4602, - .0414, 31.206 ] }, fang = .13 * K;
	for ( const [ frame, yawDeg, side ] of [ [ 32, 90, 1 ], [ 31, 90, - 1 ], [ 32, 30, - 1 ] ] ) {

		const env = setup();
		const yaw = yawDeg * Math.PI / 180, f = [ Math.cos( yaw ), Math.sin( yaw ), 0 ], r = [ Math.sin( yaw ), - Math.cos( yaw ), 0 ];
		const S = [ 200, - 300, 64 ];
		const scrag = { _entityIndex: 9, model: WIZARD, frame, origin: Float32Array.from( S ), angles: Float32Array.of( 0, yawDeg, 0 ) };
		env.ents[ 9 ] = scrag; env.visible.push( scrag );
		// QuakeC's launch point (14 forward, 30 up, 14 to that side), first drawn 70 units along its flight
		const from = [ 0, 1, 2 ].map( i => S[ i ] + f[ i ] * 84 + r[ i ] * 14 * side + ( i === 2 ? 30 : 0 ) );
		const s = spike( env, 5, from, f );
		for ( let k = 0; k <= 3; k ++ ) { s.at( k / 60 ); env.frame(); }
		const jet = venom.R_VenomSnapshot().jets.find( j => j.entity === 5 );
		// the fang: the jaw turned with the Scrag, VENOM_MOUTH.fang to its right (side 1) or left (-1)
		const m = JAW[ frame ], left = [ - r[ 0 ], - r[ 1 ], 0 ];
		const want = [ 0, 1, 2 ].map( i => S[ i ] + f[ i ] * m[ 0 ] + left[ i ] * ( m[ 1 ] - side * fang ) + ( i === 2 ? m[ 2 ] : 0 ) );
		for ( let i = 0; i < 3; i ++ ) near( jet.origin[ i ], want[ i ], .02, `frame ${frame}, yaw ${yawDeg}, side ${side}: the stream starts at the fang beside the jaw` );
		near( Math.hypot( ...[ 0, 1 ].map( i => jet.origin[ i ] - S[ i ] - f[ i ] * m[ 0 ] ) ), fang, .1, 'one fang either side of the centre line, as the source\'s' );
		// one fixed ray from the fang to the end of the spike's flight: the end lies on the flight line, and the spike
		// flies within the fang's offset of the ray
		const end = [ 0, 1, 2 ].map( i => jet.origin[ i ] + jet.dir[ i ] * jet.limit ), w = [ 0, 1, 2 ].map( i => end[ i ] - from[ i ] );
		const wa = w[ 0 ] * f[ 0 ] + w[ 1 ] * f[ 1 ] + w[ 2 ] * f[ 2 ];
		near( Math.hypot( w[ 0 ] - f[ 0 ] * wa, w[ 1 ] - f[ 1 ] * wa, w[ 2 ] - f[ 2 ] * wa ), 0, .01, 'the ray ends on the spike\'s own flight' );
		const v = [ 0, 1, 2 ].map( i => s.e.origin[ i ] - jet.origin[ i ] ), along = v[ 0 ] * jet.dir[ 0 ] + v[ 1 ] * jet.dir[ 1 ] + v[ 2 ] * jet.dir[ 2 ];
		near( jet.head, along, .01, 'the leading edge is the spike\'s place along the ray' );
		check( Math.hypot( v[ 0 ] - jet.dir[ 0 ] * along, v[ 1 ] - jet.dir[ 1 ] * along, v[ 2 ] - jet.dir[ 2 ] * along ) < 16, 'the spike flies close to the ray' );
		same( scrag.frame, frame, 'the Scrag is only read' ); same( scrag.origin[ 0 ], S[ 0 ], 'its origin is untouched' );

	}

} );

Deno.test( 'the fang is on the jaw as drawn: halfway through r_anim.js\'s pose blend it is halfway between the two poses', async () => {

	const { Mod_ForName } = await import( '../src/engine/render/gl_model.js' );
	const WIZARD = Mod_ForName( 'progs/wizard.mdl', true ), h = WIZARD.cache.data;
	const env = setup(), S = [ 0, 0, 40 ];
	// QuakeC changed the frame to magatt4 (32) 0.05 s ago; the blend from magatt3 (31) is half done
	const scrag = { _entityIndex: 9, model: WIZARD, frame: 32, origin: Float32Array.from( S ), angles: Float32Array.of( 0, 0, 0 ),
		_aliasLerp: { model: h, from: h.frames[ 31 ].firstpose, to: h.frames[ 32 ].firstpose, start: env.time.now + 1 / 60 - .05, interval: .1 } };
	env.ents[ 9 ] = scrag; env.visible.push( scrag );
	spike( env, 5, [ 22, 14, 70 ], [ 1, 0, 0 ] ); // (the Scrag's left: side -1)
	env.frame();
	const jet = venom.R_VenomSnapshot().jets.find( j => j.entity === 5 );
	near( jet.origin[ 2 ], 40 + ( 23.7184 + 31.206 ) / 2, .02, 'the jaw height halfway between magatt3 and magatt4' );
	near( jet.origin[ 0 ], 11.4602, .02, 'forward as the jaw' );

} );

// QuakeC's own geometry (wizard.qc Wiz_StartFast / Wiz_FastFire): the spike leaves origin + '0 0 30' + v_forward * 14
// +- v_right * 14 at 600 units/s toward the player's origin -+ 13 * v_right, and is first drawn one 1/72 s server tick
// out. The player's eye is the test's view origin (0, 0, 22).
function quakecSpit( env, side, scragAt, frame, WIZARD ) {

	const scrag = { _entityIndex: 9, model: WIZARD, frame, origin: Float32Array.from( scragAt ), angles: Float32Array.of( 0, 0, 0 ) };
	env.ents[ 9 ] = scrag; if ( ! env.visible.includes( scrag ) ) env.visible.push( scrag );
	const right = [ 0, - 1, 0 ], start = [ scragAt[ 0 ] + 14, scragAt[ 1 ] + 14 * right[ 1 ] * side, scragAt[ 2 ] + 30 ];
	const dst = [ 0, - 13 * right[ 1 ] * side, 0 ], d = [ 0, 1, 2 ].map( i => dst[ i ] - start[ i ] ), l = Math.hypot( ...d );
	const dir = d.map( v => v / l ), first = [ 0, 1, 2 ].map( i => start[ i ] + dir[ i ] * SPEED / 72 );
	return { scrag, start, dir, spike: spike( env, 5 + ( side > 0 ? 0 : 1 ), first, dir ) };

}

Deno.test( 'with QuakeC\'s launch geometry the fang\'s stream still ends at the player, keeps its spike through a stall and takes its splash', async () => {

	const { COM_LoadPackFile, COM_AddPack } = await import( '../src/engine/common/pak.js' );
	const { Mod_ForName } = await import( '../src/engine/render/gl_model.js' );
	const pak = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
	COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.length ) ) );
	const WIZARD = Mod_ForName( 'progs/wizard.mdl', true );
	for ( const D of [ 300, 600, 900 ] ) for ( const side of [ 1, - 1 ] ) {

		const env = setup(), q = quakecSpit( env, side, [ - D, 0, 40 ], 32, WIZARD );
		env.frame();
		let jet = venom.R_VenomSnapshot().jets.find( j => j.entity === q.spike.e._entityIndex );
		check( jet, `D ${D}: a stream` );
		// the limit is the player (the ray passes within PLAYER_REACH of the eye), not the far wall
		const toEye = Math.hypot( jet.origin[ 0 ], jet.origin[ 1 ], jet.origin[ 2 ] - 6 );
		check( Math.abs( jet.limit - toEye ) < 45, `D ${D} side ${side}: the stream ends at the player (${jet.limit.toFixed( 0 )} vs ${toEye.toFixed( 0 )})` );
		// a stall: 0.2 s without a frame, then the flight goes on; still one stream for this spike
		q.spike.at( .05 ); env.frame(); q.spike.at( .25 ); env.frame( .2 ); q.spike.at( .27 ); env.frame();
		const mine = venom.R_VenomSnapshot().jets.filter( j => j.entity === q.spike.e._entityIndex );
		same( mine.length, 1, `D ${D} side ${side}: one stream for the spike after a 0.2 s stall` );
		jet = mine[ 0 ];
		// the spike stays near the ray all the way (droplets ride the ray)
		for ( const t of [ .1, .3, .6, .9 ] ) {

			const p = [ 0, 1, 2 ].map( i => q.start[ i ] + q.dir[ i ] * SPEED * t ), v = [ 0, 1, 2 ].map( i => p[ i ] - jet.origin[ i ] ), a = v[ 0 ] * jet.dir[ 0 ] + v[ 1 ] * jet.dir[ 1 ] + v[ 2 ] * jet.dir[ 2 ];
			if ( a > jet.limit ) break;
			check( Math.hypot( v[ 0 ] - jet.dir[ 0 ] * a, v[ 1 ] - jet.dir[ 1 ] * a, v[ 2 ] - jet.dir[ 2 ] * a ) < 16, `D ${D}: the flight at ${t} s is within 16 units of the stream` );

		}
		// a splash 0.15 s of flight ahead of where the spike was last drawn is matched to this stream
		const hit = Float32Array.from( [ 0, 1, 2 ].map( i => q.start[ i ] + q.dir[ i ] * SPEED * ( .27 + 1 / 72 + .15 ) ) );
		if ( SPEED * ( .27 + 1 / 72 + .15 ) > D - 40 ) continue; // (at or past the player: no wall to splash on there)
		same( venom.R_VenomImpact( hit ), true, 'the splash is the venom\'s' );
		check( venom.R_VenomSnapshot().jets.find( j => j.entity === q.spike.e._entityIndex )?.hitKnown, `D ${D} side ${side}: matched to its own stream` );

	}

} );

Deno.test( 'a TE_WIZSPIKE ends its stream at the point: splash, stain, and the stream drains away within 0.28 s', () => {

	const env = setup(), s = spike( env );
	let f = 0;
	for ( ; 100 + SPEED * f / 60 < 960; f ++ ) { s.at( f / 60 ); env.frame(); }
	// the server's touch: the spike is removed and the impact sent in the same message; the drawn entity is a frame behind
	let took = null;
	const native = particles( env, () => { took = R_WizardSpikeImpact( Float32Array.of( 1000, 0, 64 ) ); } );
	same( took, true, 'the venom takes the impact' );
	same( total( native ), 0, 'no native spray in Newer Game' );
	env.visible.length = 0;
	let snap = null;
	for ( let k = 0; k < 6; k ++ ) { env.frame(); snap = venom.R_VenomSnapshot(); if ( snap.jets[ 0 ]?.hit ) break; }
	const j = snap.jets[ 0 ];
	check( j && j.released && j.hitKnown && j.hit, 'released, matched to the impact, and the leading edge reached it' );
	near( j.head, 900, .01, 'the stream ends exactly at the impact point' );
	same( snap.stains, 1, 'one stain on the wall' );
	check( snap.droplets >= venom.VENOM.splashBurst, 'the splash burst is thrown' );
	const t0 = env.time.now;
	while ( venom.R_VenomSnapshot().jets.length && env.time.now - t0 < 1 ) env.frame();
	check( env.time.now - t0 <= venom.VENOM.duration + .05, `the stream drained within the packet's 0.28 s (${( env.time.now - t0 ).toFixed( 3 )} s)` );
	same( venom.R_VenomSnapshot().stains, 1, 'the stain stays after the stream' );
	while ( env.time.now - t0 < venom.VENOM.stainLife + .1 ) env.frame( .05 );
	const end = venom.R_VenomSnapshot();
	same( end.stains + end.droplets + end.streams, 0, 'after 4.4 s nothing is left' );
	same( env.group().visible, false, 'and the meshes are hidden' );

} );

Deno.test( 'an impact with no stream seen still splashes; a spike gone without one (it hit a monster) just drains', () => {

	let env = setup();
	same( R_WizardSpikeImpact( Float32Array.of( 1000, 0, 64 ) ), true, 'an impact on its own is the venom splash' );
	env.frame();
	check( venom.R_VenomSnapshot().stains === 1 && venom.R_VenomSnapshot().droplets === venom.VENOM.splashBurst, 'stain and 30 droplets' );
	env = setup();
	const s = spike( env );
	for ( let f = 0; f <= 20; f ++ ) { s.at( f / 60 ); env.frame(); }
	env.visible.length = 0;
	env.frame();
	const j = venom.R_VenomSnapshot().jets[ 0 ];
	check( j.released && ! j.hitKnown, 'released without an impact' );
	near( j.head, SPEED * 20 / 60, .01, 'it stops where the entity was last drawn (the launch estimate was far)' );
	for ( let k = 0; k < 30; k ++ ) env.frame();
	const snap = venom.R_VenomSnapshot();
	same( snap.jets.length, 0, 'drained' );
	same( snap.stains, 0, 'no stain without an impact' );

} );

Deno.test( 'gameplay is untouched: the entity is only read, and the module reaches no server or progs code', () => {

	const env = setup(), s = spike( env );
	for ( let f = 0; f <= 10; f ++ ) {

		s.at( f / 60 );
		const before = [ ...s.e.origin, ...s.e.angles ].join(), m = s.e.model;
		env.frame();
		venom.R_VenomTakesEntity( s.e ); venom.R_VenomTrail( 5 );
		same( [ ...s.e.origin, ...s.e.angles ].join(), before, 'origin and angles unchanged' ); same( s.e.model, m, 'model unchanged' );

	}
	const src = readFileSync( new URL( '../src/newer/render/r_venom.js', import.meta.url ), 'utf8' );
	const imports = [ ...src.matchAll( /^import .* from '([^']+)';$/gm ) ].map( m => m[ 1 ] );
	check( imports.every( p => ! /server|progs|client\/cl_|net\//.test( p ) ), 'imports: ' + imports.join( ', ' ) );

} );

Deno.test( 'title-demo split: the Classic half keeps the native tracer, impact and mesh; the Newer half the venom', () => {

	const env = setup(), s = spike( env );
	for ( let f = 0; f <= 6; f ++ ) { s.at( f / 60 ); env.frame(); }
	r_demosplit.value = 2;
	const trail = particles( env, () => R_RocketTrail( [ 100, 0, 64 ], [ 140, 0, 64 ], 3, 5 ) );
	check( trail.length === 1 && trail[ 0 ].classicOnly && trail[ 0 ].visible === false, 'split: the native tracer only for the Classic half' );
	const hit = particles( env, () => same( R_WizardSpikeImpact( Float32Array.of( 1000, 0, 64 ) ), true, 'the venom takes the Newer half' ) );
	check( hit.length === 1 && hit[ 0 ].classicOnly && hit[ 0 ].count === 30, 'split: the native spray only for the Classic half' );
	R_AnimSetClassicPass( true );
	same( venom.R_VenomTakesEntity( s.e ), false, 'the Classic pass draws the native mesh' );
	R_AnimSetClassicPass( false );
	same( venom.R_VenomTakesEntity( s.e ), true, 'the Newer pass leaves it out' );
	r_demosplit.value = 1;

} );

Deno.test( 'fixed pools: the instance buffers are allocated once and reused, frame after frame', () => {

	const env = setup(), s = spike( env );
	s.at( 0 ); env.frame(); s.at( 1 / 60 ); env.frame();
	const arrays = () => [ 'venom_streams', 'venom_droplets', 'venom_stains' ].flatMap( n => Object.values( env.mesh( n ).geometry.attributes ).map( a => a.array ) );
	const first = arrays();
	for ( let f = 2; f < 120; f ++ ) { s.at( f / 60 ); env.frame(); }
	const after = arrays();
	same( env.scene.children.filter( c => c.name === 'quake_venom' ).length, 1, 'one venom group in the scene, built once' );
	check( env.group().children.every( m => m.geometry.attributes.position.array === env.mesh( m.name ).geometry.attributes.position.array ), 'the meshes are the first build\'s' );
	same( after.length, first.length, 'same attributes' );
	check( after.every( ( a, i ) => a === first[ i ] ), 'the same typed arrays every frame (nothing reallocated)' );
	check( venom.R_VenomSnapshot().droplets <= venom.VENOM.dropCap, 'the droplet pool never grows past its capacity' );
	// the clock jumping back (a demo loop, a new game) forgets everything
	env.time.now -= 5; env.frame();
	same( venom.R_VenomSnapshot().jets.length, 1, 'after a rewind only the entity drawn now has a stream' );
	near( venom.R_VenomSnapshot().jets[ 0 ].head, 0, 1e-9, 'and it starts afresh' );

} );
