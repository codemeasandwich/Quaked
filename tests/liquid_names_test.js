// Which textures are water (card [B3]): Episode 3's E3M3 to E3M5 use *04mwat1 / *04mwat2, which have no "water" in
// the name, so the Newer water treatment (see-through surface, underwater look) skipped them. Every '*' texture of the
// stock maps must be classified as the game means it.
import { readFileSync, existsSync } from 'node:fs';
const { R_IsWaterTextureName, R_LiquidOpacity, LIQUID_LOOKS } = await import( '../src/gl_post.js' );
const { r_newer_water } = await import( '../src/newer/render/r_anim.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const WATER = [ '*water0', '*water1', '*water2', '*04water1', '*04water2', '*04awater1', '*04mwat1', '*04mwat2' ];
const NOT_WATER = [ '*lava1', '*teleport', '*slime', '*slime0', '*slime1' ]; // slime is a liquid too, with its own look: not water
const SENTINEL = 0.4242;

Deno.test( 'every stock water texture is water, slime lava and teleporter textures are not water', () => {

	for ( const n of WATER ) check( R_IsWaterTextureName( n ), n + ' is water' );
	for ( const n of NOT_WATER ) check( ! R_IsWaterTextureName( n ), n + ' is not water' );

} );

Deno.test( 'every water texture gets its look: Clear for ordinary water, Muddy for E1M3\'s brown water and Episode 3\'s murky water, Toxic for slime', () => {

	const saved = r_newer_water.value; r_newer_water.value = 1;
	try {

		const look = n => R_LiquidOpacity( n, SENTINEL );
		for ( const n of [ '*water0', '*water1', '*water2', '*04water2', '*04awater1' ] ) same( look( n ), LIQUID_LOOKS[ 0 ].opacity, n + ' is Clear' );
		for ( const n of [ '*04water1', '*04mwat1', '*04mwat2' ] ) same( look( n ), LIQUID_LOOKS[ 2 ].opacity, n + ' is Muddy' );
		for ( const n of [ '*slime', '*slime0', '*slime1' ] ) same( look( n ), LIQUID_LOOKS[ 3 ].opacity, n + ' is Toxic' );
		for ( const n of [ '*lava1', '*teleport' ] ) same( look( n ), SENTINEL, n + ' keeps the fallback' );
		check( new Set( [ 0, 2, 3 ].map( i => LIQUID_LOOKS[ i ].opacity ) ).size === 3, 'control: the three looks differ in coverage, so the assertions above can tell them apart' );

	} finally { r_newer_water.value = saved; }

} );

Deno.test( 'every * texture in the full-game maps is accounted for (when the full-game pak is present)', () => {

	const path = new URL( '../resources/id1/pak0.pak', import.meta.url );
	if ( ! existsSync( path ) ) { console.log( 'LIQUID_NAMES full-game pak absent: the every-texture table check did NOT run' ); return; }
	console.log( 'LIQUID_NAMES full-game pak present: every * texture of its maps is checked' );
	const d = readFileSync( path ), off = d.readInt32LE( 4 ), len = d.readInt32LE( 8 ), seen = new Map();
	for ( let i = off; i < off + len; i += 64 ) {

		const name = d.subarray( i, i + 56 ).toString( 'latin1' ).split( '\0' )[ 0 ]; if ( ! /^maps\/.*\.bsp$/.test( name ) ) continue;
		const p = d.readInt32LE( i + 56 ), bsp = d.subarray( p, p + d.readInt32LE( i + 60 ) ), o = bsp.readInt32LE( 4 + 2 * 8 ); // the textures lump
		const count = bsp.readInt32LE( o );
		for ( let k = 0; k < count; k ++ ) { const to = bsp.readInt32LE( o + 4 + k * 4 ); if ( to < 0 ) continue; const t = bsp.subarray( o + to, o + to + 16 ).toString( 'latin1' ).split( '\0' )[ 0 ]; if ( t.startsWith( '*' ) ) seen.set( t, ( seen.get( t ) || 0 ) + 1 ); }

	}
	const known = new Set( [ ...WATER, ...NOT_WATER ] );
	for ( const t of seen.keys() ) check( known.has( t ), 'unclassified liquid-style texture in the stock maps: ' + t + ' (add it to the table and decide whether it is water)' );
	for ( const t of [ '*04mwat1', '*04mwat2' ] ) check( seen.has( t ), t + ' really occurs in the stock maps (E3M3 to E3M5)' );

} );
