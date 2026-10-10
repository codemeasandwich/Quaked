// The post pipeline's sky stage on its own (card [44h]): a sky's light and colour judged as they look, the sun's
// direction from its angles, and the map's and frame's sky flags. Through the public interface of r_post_sky.js.
import * as sky from '../src/newer/render/r_post_sky.js';
import * as post from '../src/newer/render/gl_post.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, near = ( a, b, m ) => check( Math.abs( a - b ) < 1e-9, `${m}: ${a} != ${b}` );
const layer = ( size, rgb ) => { const d = new Uint8Array( size * size * 4 ); for ( let i = 0; i < d.length; i += 4 ) { d[ i ] = rgb[ 0 ]; d[ i + 1 ] = rgb[ 1 ]; d[ i + 2 ] = rgb[ 2 ]; d[ i + 3 ] = 255; } return d; };

Deno.test( 'a bright sky lets more light through than a dark one, and keeps its colour', () => {
	const bright = sky.R_AnalyseSky( layer( 8, [ 230, 200, 160 ] ), null, 8 ), dark = sky.R_AnalyseSky( layer( 8, [ 20, 20, 30 ] ), null, 8 );
	check( bright && dark && bright.luma > dark.luma, 'brighter sky, higher luma' );
	check( bright.color[ 0 ] >= bright.color[ 2 ], 'a warm sky stays warm' );
	check( bright.cookie instanceof Float32Array && bright.cookie.length > 0, 'a light pattern' );
	check( sky.R_AnalyseSky( null, null, 8 ) === null, 'no sky, no analysis' );
	near( sky.R_SkyBrightness( 0 ), 0, 'black lets no light' ); near( sky.R_SkyBrightness( 1 ), 1, 'white lets it all' );
	check( sky.R_SkyBrightness( .3 ) > sky.R_SkyBrightness( .1 ), 'in order' );
} );

Deno.test( 'the sun\'s direction from its angles; the sky flags', () => {
	const down = sky.sunFromAngles( 0, - 90 );
	near( down[ 2 ], 1, 'a sun straight above: the direction to it points up' ); near( Math.hypot( ...down ), 1, 'a unit vector' );
	sky.skyState.hasSky = true; check( sky.R_MapHasSky() === true, 'the map has sky' ); sky.skyState.hasSky = false;
	sky.skyState.seen = false; sky.R_PostNoteSky(); check( sky.skyState.seen === true, 'the world drew sky this frame' );
	check( post.R_MapHasSky === sky.R_MapHasSky && post.R_GetSkyInfo === sky.R_GetSkyInfo, 'gl_post.js re-exports the same functions' );
	check( sky.R_GetSkyInfo() === sky.skyState.info, 'the current analysis' );
} );
