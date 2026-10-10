// "01 RPG smoke" port: the ported emission and per-puff motion against the source's own
// functions, and the Quake-specific behaviour (distance-based emission independent of frame
// rate, no bridging across teleports, bounded pool). The renderer is not involved.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import * as st from '../src/newer/render/r_smoketrail.js';

const SOURCE_SHA256 = '7e35fc808c24200e9dbf2b010a72d2fbea04aca567528ebd2e61e79979afc7d6';
const check = ( v, label ) => { if ( ! v ) throw new Error( label ); };
const near = ( a, b, eps, label ) => { if ( ! ( Math.abs( a - b ) <= eps ) ) throw new Error( `${label}: ${a} != ${b}` ); };
const same = ( a, b, label ) => { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); };
const P = { density: st.SMOKE.density, spread: st.SMOKE.spread, wind: st.SMOKE.wind };

function collect( time, scale ) {

	const out = [];
	st.forEachSmoke( time, P, scale, ( x, y, z, size, angle, alpha, heat, tile, r, g, b, seed ) => out.push( { pos: [ x, y, z ], size, angle, alpha, heat, tile, tint: [ r, g, b ], seed } ) );
	return out;

}

// a straight flight along +x at `speed` units/s from (0,0,100), sampled at `fps`, trail key `key`
function fly( key, { from = [ 0, 0, 100 ], dir = [ 1, 0, 0 ], distance = 1000, speed = 1000, fps = 60, t0 = 10, rocket = true } = {} ) {

	const dt = 1 / fps, frames = Math.max( 1, Math.round( distance / speed * fps ) ), per = distance / frames;
	let made = 0, pos = [ ...from ], time = t0;
	for ( let k = 0; k < frames; k ++ ) {

		const next = [ pos[ 0 ] + dir[ 0 ] * per, pos[ 1 ] + dir[ 1 ] * per, pos[ 2 ] + dir[ 2 ] * per ];
		time += dt; made += st.R_SmokeTrailEmit( pos, next, rocket, key, time, dt ); pos = next;

	}
	return { made, end: pos, time };

}

Deno.test( 'ported emission and puff motion equal the source\'s own emitSmoke and smokeList', () => {

	const path = new URL( '../fieldlab-fx-3d-updated.html', import.meta.url );
	const need = process.env.QUAKED_FIREBALL_SOURCE_REQUIRED === '1', skip = why => { if ( need ) throw new Error( why + ' (QUAKED_FIREBALL_SOURCE_REQUIRED=1)' ); console.log( 'SKIPPED source equivalence: ' + why ); };
	if ( ! existsSync( path ) ) return skip( 'source file not present locally' );
	const bytes = readFileSync( path );
	if ( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) !== SOURCE_SHA256 ) return skip( 'different source revision' );
	const lines = bytes.toString( 'utf8' ).split( '\n' ), pick = re => lines.find( l => re.test( l ) );
	const code = [ pick( /^const clamp=/ ), pick( /^const V=\{add:/ ), pick( /^function hashJS\(n\)/ ), pick( /^function emitSmoke/ ), pick( /^function smokeList/ ) ].join( '\n' );
	check( code.split( '\n' ).every( l => l && l.length > 20 ), 'all five source definitions located' );
	const ctx = { Math, trails: [], S: { smoke: { density: .25, spread: .5, wind: 0, speed: 1.8 }, time: 0 } };
	runInNewContext( code + '\nthis.emitSmoke=emitSmoke;this.smokeList=smokeList;', ctx );

	st.R_SmokeTrailClear();
	fly( 'rocket', { fps: 30 } ); fly( 'grenade', { rocket: false, from: [ 300, 200, 50 ], dir: [ 0, 1, 0 ], distance: 600, speed: 600, fps: 25 } );
	const records = st.smokeRecords();
	check( records.length > 200, 'a meaningful pool: ' + records.length );

	// emitSmoke: seed, life and tile are exactly the source's for the same (position, direction, birth time, index)
	records.forEach( ( r, i ) => {

		ctx.trails.length = 0; ctx.emitSmoke( r.pos, r.dir, r.t, i );
		const s = ctx.trails[ 0 ];
		near( r.seed, s.seed, 1e-12, 'seed' ); near( r.life, s.life, 1e-12, 'life' ); same( r.tile, s.tile, 'tile' );

	} );

	// smokeList: every puff's position, size, angle, alpha, tile and tint at several times, with the source's own clock
	let compared = 0;
	for ( const time of [ 10.1, 10.5, 11, 12.5, 14 ] ) {

		ctx.trails = records.map( r => ( { pos: r.pos, dir: r.dir, t: r.t, life: r.life, seed: r.seed, tile: r.tile } ) );
		ctx.S.time = time;
		const expected = ctx.smokeList().filter( ( _, i ) => ( time - records[ i ].t ) < records[ i ].life ), got = collect( time, 1 );
		same( got.length, expected.length, 'puff count at ' + time );
		expected.forEach( ( e, i ) => {

			compared ++;
			for ( let k = 0; k < 3; k ++ ) near( got[ i ].pos[ k ], e.pos[ k ], 1e-9, 'position' );
			for ( const key of [ 'size', 'angle', 'alpha', 'heat', 'tile', 'seed' ] ) near( got[ i ][ key ], e[ key ], 1e-9, key );
			for ( let k = 0; k < 3; k ++ ) near( got[ i ].tint[ k ], e.tint[ k ], 1e-12, 'tint' );

		} );

	}
	check( compared > 500, 'meaningful sample compared: ' + compared );

} );

Deno.test( 'the same flight gives the same puffs at any frame rate', () => {

	const run = fps => { st.R_SmokeTrailClear(); const r = fly( 'a', { fps } ); return { r, list: st.smokeRecords() }; };
	const base = run( 20 );
	// 1000 units at the spacing, the first puff at the start
	same( base.list.length, Math.floor( 1000 / st.SMOKE.spacing ) + 1, 'puffs for a 1000-unit flight' );
	for ( const fps of [ 7, 30, 60, 144, 240, 1000 ] ) {

		const other = run( fps );
		same( other.list.length, base.list.length, `puff count at ${fps} fps` );
		other.list.forEach( ( p, i ) => {

			for ( let k = 0; k < 3; k ++ ) near( p.pos[ k ], base.list[ i ].pos[ k ], 1e-6, `puff ${i} position at ${fps} fps` );
			near( p.t, base.list[ i ].t, 1e-6, `puff ${i} birth time at ${fps} fps` );

		} );

	}

} );

Deno.test( 'spacing is exact, the rocket starts behind its nose, a grenade at it', () => {

	st.R_SmokeTrailClear(); fly( 'r', { fps: 50 } );
	const r = st.smokeRecords(), K = st.SMOKE.unit;
	// source axes: x = quake x; along a +x flight the puffs are spaced spacing/K apart in x
	for ( let i = 1; i < r.length; i ++ ) near( r[ i ].pos[ 0 ] - r[ i - 1 ].pos[ 0 ], st.SMOKE.spacing / K, 1e-9, 'spacing in source units' );
	near( r[ 0 ].pos[ 0 ], 0 / K - st.SMOKE.noseRocket, 1e-9, 'rocket smoke starts behind the nose' );
	near( r[ 0 ].pos[ 1 ], 100 / K, 1e-9, 'height (quake z) maps to the source y' );
	st.R_SmokeTrailClear(); fly( 'g', { fps: 50, rocket: false } );
	near( st.smokeRecords()[ 0 ].pos[ 0 ], 0, 1e-9, 'grenade smoke starts at the grenade' );

} );

Deno.test( 'a teleport is never bridged and a stale or new trail starts afresh', () => {

	const K = st.SMOKE.unit, S = st.SMOKE.spacing, nose = st.SMOKE.noseRocket;
	st.R_SmokeTrailClear();
	st.R_SmokeTrailEmit( [ 0, 0, 0 ], [ S * 1.5, 0, 0 ], true, 'x', 1, .05 ); // carry: .5 spacing
	const before = st.R_SmokeTrailCount();
	same( st.R_SmokeTrailEmit( [ S * 1.5, 0, 0 ], [ 3000, 0, 0 ], true, 'x', 1.05, .05 ), 0, 'a ~3000-unit jump emits nothing' );
	same( st.R_SmokeTrailCount(), before, 'and adds no puff across the gap' );
	st.R_SmokeTrailEmit( [ 3000, 0, 0 ], [ 3000 + S, 0, 0 ], true, 'x', 1.1, .05 );
	const first = st.smokeRecords()[ before ];
	near( first.pos[ 0 ], 3000 / K - nose, 1e-9, 'the first puff after the jump is exactly at the new start (the carry was reset)' );
	// a key unseen for longer than staleAfter (a new missile reusing the entity number) starts afresh:
	// 1 unit of carry would otherwise delay the next puff past a second 1-unit segment
	st.R_SmokeTrailClear();
	st.R_SmokeTrailEmit( [ 0, 0, 0 ], [ 1, 0, 0 ], true, 'y', 1, .05 ); // first puff at 0, carry 1
	const n1 = st.R_SmokeTrailCount();
	st.R_SmokeTrailEmit( [ 500, 0, 0 ], [ 501, 0, 0 ], true, 'y', 1.1, .05 ); // not stale: carry 1 + 1 < spacing 3, no puff
	same( st.R_SmokeTrailCount(), n1, 'a live trail carries its distance (no puff yet)' );
	st.R_SmokeTrailClear();
	st.R_SmokeTrailEmit( [ 0, 0, 0 ], [ 1, 0, 0 ], true, 'y', 1, .05 );
	st.R_SmokeTrailEmit( [ 500, 0, 0 ], [ 501, 0, 0 ], true, 'y', 5, .05 ); // stale: starts afresh, so a puff at once
	same( st.R_SmokeTrailCount(), n1 + 1, 'a stale trail starts afresh: its first puff is at its first segment' );

} );

Deno.test( 'the pool is bounded under sustained firing and every puff expires', () => {

	st.R_SmokeTrailClear();
	let time = 10;
	for ( let i = 0; i < 40; i ++ ) { fly( 'k' + ( i % 5 ), { t0: time, fps: 40 } ); time += .3; }
	same( st.R_SmokeTrailCount(), st.SMOKE.cap, 'the pool is full and never exceeds its cap' );
	check( collect( time, st.SMOKE.timeScale ).length <= st.SMOKE.cap, 'drawn puffs stay within the cap' );
	const far = time + 12 / st.SMOKE.timeScale;
	same( collect( far, st.SMOKE.timeScale ).length, 0, 'nothing is left after the smoke has lived its time' );
	same( st.R_SmokeTrailCount(), 0, 'and expired puffs are released' );
	fly( 'z', { t0: 50 } ); st.R_SmokeTrailClear();
	same( st.R_SmokeTrailCount(), 0, 'clear empties the pool' );

} );

Deno.test( 'two missiles in flight at once each keep exactly the spacing (independent carries)', () => {

	const S = st.SMOKE.spacing, K = st.SMOKE.unit;
	st.R_SmokeTrailClear();
	// interleaved frame by frame at 144 fps: different speeds, so the carries differ at every step
	let a = [ 0, 0, 100 ], b = [ 0, 300, 100 ], time = 10;
	for ( let k = 0; k < 90; k ++ ) {

		time += 1 / 144;
		const a2 = [ a[ 0 ] + 600 / 144, a[ 1 ], a[ 2 ] ], b2 = [ b[ 0 ] + 937 / 144, b[ 1 ], b[ 2 ] ];
		st.R_SmokeTrailEmit( a, a2, true, 'a', time, 1 / 144 ); st.R_SmokeTrailEmit( b, b2, false, 'b', time, 1 / 144 ); a = a2; b = b2;

	}
	for ( const [ name, line ] of [ [ 'a', 0 ], [ 'b', 300 / K ] ] ) {

		const r = st.smokeRecords().filter( p => Math.abs( p.pos[ 2 ] - line ) < 1e-6 );
		check( r.length > 20, `trail ${name} has puffs: ${r.length}` );
		for ( let i = 1; i < r.length; i ++ ) near( r[ i ].pos[ 0 ] - r[ i - 1 ].pos[ 0 ], S / K, 1e-9, `trail ${name} spacing between puffs ${i - 1} and ${i}` );

	}

} );
