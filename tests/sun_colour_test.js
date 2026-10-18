// A map's own sun colour (card T-3faa98e3 item 13; docs/small-touches-2026-10-14.md): worldspawn `_sunlight_color`
// (62 installed maps set it, Arcane Dimensions' among them) colours the Newer Game sun everywhere the sun's colour is
// used: the sky's sunlight, the surfaces' sunlight and the height shadows. A map without one keeps the colour read
// from its sky, exactly as before; the next map starts over. Through the public map builder (R_BuildWorldLights).
import { readFileSync } from './helpers/resource_fs.mjs';
await import( '../src/engine/render/gl_rsurf.js' );
const post = await import( '../src/newer/render/gl_post.js' );
const { skyState, R_SunTint } = await import( '../src/newer/render/r_post_sky.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Array.from( a ).every( ( v, i ) => Math.abs( v - b[ i ] ) < 1e-6 ), `${m}: ${Array.from( a )} != ${b}` );
const map = keys => ( { entities: `{\n"classname" "worldspawn"\n${keys}\n}\n`, firstmodelsurface: 0, nummodelsurfaces: 0, surfaces: [], nodes: [ { contents: - 1 } ], leafs: [ { contents: - 2 }, { contents: - 1 } ], numleafs: 1 } );

Deno.test( 'a map\'s _sunlight_color is the sun\'s colour; 0..255 values are read as such; without one, the sky\'s colour as before', () => {

	post.R_BuildWorldLights( map( '' ) );
	same( skyState.sunColor, null, 'no key: none' ); same( R_SunTint(), skyState.info.color, 'the sky\'s own colour, as before' );
	post.R_BuildWorldLights( map( '"_sunlight_color" "0.85 0.9 0.8"' ) );
	near( R_SunTint(), [ 0.85, 0.9, 0.8 ], 'Arcane Dimensions\' ad_ac' );
	post.R_BuildWorldLights( map( '"_sunlight_color" "120 120 200"' ) );
	near( R_SunTint(), [ 120 / 255, 120 / 255, 200 / 255 ], '0..255 (ad_dm1)' );
	for ( const bad of [ '"_sunlight_color" "0 0 0"', '"_sunlight_color" "red"', '"_sunlight_color" "-1 0.5 0.5"' ] ) {

		post.R_BuildWorldLights( map( bad ) ); same( skyState.sunColor, null, 'ignored: ' + bad );

	}
	post.R_BuildWorldLights( map( '"_sunlight_color" "1 0.5 0.25"' ) ); post.R_BuildWorldLights( map( '' ) );
	same( skyState.sunColor, null, 'the next map without one is back to its sky\'s colour' );

} );

Deno.test( 'every consumer of the sun\'s colour reads it: the sky and surface sunlight and the height shadows', () => {

	const sky = readFileSync( new URL( '../src/newer/render/r_post_sky.js', import.meta.url ), 'utf8' ), shadows = readFileSync( new URL( '../src/newer/render/r_post_shadows.js', import.meta.url ), 'utf8' );
	check( /const tint = R_SunTint\(\);/.test( sky ) && ! /skyState\.info\.color/.test( sky.slice( sky.indexOf( 'export function R_PostSkyUniforms' ) ) ), 'the sky and surface sunlight' );
	check( /sun: \{ direction: skyState\.sunDirection, on: [^}]*color: skyState\.sunColor \? SUN_SURFACE_COLOR\.map/.test( shadows ), 'the height shadows, unchanged without a map colour' );

} );
