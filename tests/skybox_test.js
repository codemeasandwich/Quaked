// Skyboxes as Quakespasm draws them (src/engine/render/r_skybox.js; docs/skybox-2026-10-13.md, card dadcb966): six TGA
// images named by worldspawn `sky` (`_sky`, `skyname`, `qlsky`) or the `sky` command, laid out as Quake II/Quakespasm
// lay them and drawn by the map's own sky surfaces, looked up by direction from the camera.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { Cbuf_Init, Cmd_Init, Cbuf_AddText, Cbuf_Execute } from '../src/engine/common/cmd.js';
import { R_DecodeTGA, R_SkyBoxSide, R_SkyBoxDirection, R_SkyBoxGLSL, R_SkyBoxSet, R_SkyBoxNewMap, R_SkyBoxActive, R_SkyBoxName, R_SkyBoxMaterial, R_SkyBoxInit, SKYBOX_SUFFIXES, SKYBOX_SIDE_IMAGE } from '../src/engine/render/r_skybox.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

// a TGA from rows of RGBA pixels (top row first): type 2, or 10 (run-length) with `packets` [ [ 'run' | 'raw', count ], … ]
function tga( width, height, rows, { bpp = 24, topDown = false, packets = null, id = '' } = {} ) {
	const size = bpp / 8, px = p => size === 4 ? [ p[ 2 ], p[ 1 ], p[ 0 ], p[ 3 ] ] : [ p[ 2 ], p[ 1 ], p[ 0 ] ];
	const order = topDown ? rows.flat() : [ ...rows ].reverse().flat(), body = [];
	if ( packets ) { let at = 0; for ( const [ kind, n ] of packets ) { if ( kind === 'run' ) { body.push( 128 | ( n - 1 ), ...px( order[ at ] ) ); } else { body.push( n - 1 ); for ( let k = 0; k < n; k ++ ) body.push( ...px( order[ at + k ] ) ); } at += n; } }
	else for ( const p of order ) body.push( ...px( p ) );
	const head = [ id.length, 0, packets ? 10 : 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, bpp, topDown ? 0x20 : 0 ];
	return new Uint8Array( [ ...head, ...[ ...id ].map( c => c.charCodeAt( 0 ) ), ...body ] );
}
const R = [ 255, 0, 0, 255 ], G = [ 0, 255, 0, 255 ], B = [ 0, 0, 255, 255 ], H = [ 10, 20, 30, 128 ];
const pixels = image => [ ...Array( image.width * image.height ).keys() ].map( i => [ ...image.data.slice( i * 4, i * 4 + 4 ) ].join( '.' ) ).join( ' ' );

Deno.test( 'TGA images decode to RGBA rows from the top: either row order, run-length packets of every kind, grey, alpha', () => {

	const rows = [ [ R, R, G ], [ G, B, B ] ], want = '255.0.0.255 255.0.0.255 0.255.0.255 0.255.0.255 0.0.255.255 0.0.255.255';
	same( pixels( R_DecodeTGA( tga( 3, 2, rows ) ) ), want, 'bottom-up' );
	same( pixels( R_DecodeTGA( tga( 3, 2, rows, { topDown: true, id: 'name' } ) ) ), want, 'top-down, with an ID field' );
	// bottom-up order is G B B / R R G: a run of 1, a run of 2 (B B), then a raw packet of 3 crossing into the next row
	same( pixels( R_DecodeTGA( tga( 3, 2, rows, { packets: [ [ 'run', 1 ], [ 'run', 2 ], [ 'raw', 3 ] ] } ) ) ), want, 'run-length: runs and raw packets, across rows' );
	same( pixels( R_DecodeTGA( tga( 1, 1, [ [ H ] ], { bpp: 32 } ) ) ), '10.20.30.128', '32-bit alpha kept' );
	const grey = new Uint8Array( [ 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 8, 0, 77 ] );
	same( pixels( R_DecodeTGA( grey ) ), '77.77.77.255', '8-bit grey' );
	same( R_DecodeTGA( new Uint8Array( [ 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 8, 0 ] ) ), null, 'colour-mapped: refused' );
	same( R_DecodeTGA( tga( 4, 4, Array( 4 ).fill( Array( 4 ).fill( R ) ) ).slice( 0, 30 ) ), null, 'a cut-off file: refused before anything is made' );
	same( R_DecodeTGA( new Uint8Array( [ 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 24, 0 ] ) ), null, 'a header asking for 65535 × 65535: refused' );

} );

Deno.test( 'the six sides are laid out as Quakespasm lays them, and the lookup by direction finds the same places', () => {

	same( SKYBOX_SUFFIXES.join(), 'rt,bk,lf,ft,up,dn', 'the suffixes in Quakespasm\'s order' );
	same( SKYBOX_SIDE_IMAGE.map( i => SKYBOX_SUFFIXES[ i ] ).join(), 'rt,lf,bk,ft,up,dn', 'sides +x -x +y -y +z -z show rt lf bk ft up dn (skytexorder)' );
	const rt = R_SkyBoxSide( 0 );
	same( rt[ 0 ].dir.join(), '1,1,-1', '+x side at (s, t) = (-1, -1): towards +y, down' );
	same( rt[ 2 ].dir.join(), '1,-1,1', 'at (1, 1): towards -y, up' );
	same( rt[ 2 ].uv.join(), '1,0', 'the image\'s top right there' );
	for ( let side = 0; side < 6; side ++ ) for ( const corner of R_SkyBoxSide( side ) ) {

		// a point just inside the corner, so its side is not a tie
		const dir = corner.dir.map( ( v, i ) => Math.abs( v ) === 1 && corner.dir.filter( w => Math.abs( w ) === 1 ).length === 3 && i !== [ 0, 0, 1, 1, 2, 2 ][ side ] ? v * 0.99 : v );
		const hit = R_SkyBoxDirection( dir );
		same( hit.side, side, `side ${side}` ); same( hit.image, SKYBOX_SIDE_IMAGE[ side ], 'its image' );
		check( Math.abs( hit.u - corner.uv[ 0 ] ) < 0.01 && Math.abs( hit.v - corner.uv[ 1 ] ) < 0.01, `side ${side} corner ${corner.dir}: ${hit.u},${hit.v} vs ${corner.uv}` );

	}
	const glsl = R_SkyBoxGLSL();
	for ( let side = 0; side < 6; side ++ ) check( glsl.includes( `quakedSkySide${side}(` ) && glsl.includes( `tQuakedSky${SKYBOX_SIDE_IMAGE[ side ]}, ` ), `the shader samples side ${side}'s image` );
	check( glsl.includes( 'float q = d.x; vec2 st = vec2( -d.y, d.z ) / q; return texture2D( tQuakedSky0' ), '+x in the shader as in the table: s = -y, t = z over x' );

} );

Deno.test( 'a map\'s sky keys name it, as Quakespasm reads them; a missing face is grey, none at all keeps the scrolling sky', () => {

	const red = [ [ R, R ], [ R, R ] ], files = [];
	for ( const name of [ 'dusk', 'mge2m1/mge2m1_', 'qlspace_' ] ) for ( const s of SKYBOX_SUFFIXES ) files.push( { name: `gfx/env/${name}${s}.tga`, data: tga( 2, 2, red ) } );
	files.push( { name: 'gfx/env/halfrt.tga', data: tga( 2, 2, red ) } );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'sky.pak', pak.COM_BuildPack( files ) ) );
	const world = keys => `{\n"classname" "worldspawn"\n${keys}\n}`;
	R_SkyBoxNewMap( world( '"sky" "dusk"' ) ); check( R_SkyBoxActive() && R_SkyBoxName() === 'dusk' && R_SkyBoxMaterial(), 'sky' );
	const material = R_SkyBoxMaterial();
	R_SkyBoxNewMap( world( '"sky" "dusk"' ) ); same( R_SkyBoxMaterial(), material, 'the next map with the same skybox keeps it, not decoding again' );
	R_SkyBoxNewMap( world( '"_sky" "mge2m1/mge2m1_"' ) ); same( R_SkyBoxName(), 'mge2m1/mge2m1_', '_sky (Dimension of the Machine)' );
	R_SkyBoxNewMap( world( '"qlsky" "qlspace"' ) ); same( R_SkyBoxName(), 'qlspace_', 'qlsky adds _' );
	R_SkyBoxNewMap( world( '"skyname" "half"' ) ); check( R_SkyBoxActive(), 'one face found: the skybox, the others grey' );
	R_SkyBoxNewMap( world( '"sky" "missing"' ) ); check( ! R_SkyBoxActive(), 'no face found: the scrolling sky' );
	R_SkyBoxNewMap( world( '' ) ); check( ! R_SkyBoxActive() && R_SkyBoxName() === '', 'a map without one: none' );
	Cbuf_Init(); Cmd_Init(); R_SkyBoxInit();
	Cbuf_AddText( 'sky dusk\n' ); Cbuf_Execute(); check( R_SkyBoxActive(), 'the sky command sets it' );
	Cbuf_AddText( 'sky ""\n' ); Cbuf_Execute(); check( ! R_SkyBoxActive(), 'and clears it' );

} );

Deno.test( 'the sky surfaces draw the skybox by direction, with the scrolling sky\'s rules; the renderer is wired', () => {

	R_SkyBoxSet( 'dusk' );
	const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <map_fragment>\n#include <fog_fragment>\n}' };
	R_SkyBoxMaterial().onBeforeCompile( shader, null );
	check( shader.vertexShader.includes( 'vQuakedSkyWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;' ), 'the world position goes to the fragment' );
	check( shader.fragmentShader.includes( 'quakedSky( vQuakedSkyWorld - cameraPosition )' ), 'looked up from whichever camera draws it' );
	check( shader.fragmentShader.includes( 'fogColor, 0.500' ), 'the fog\'s share, not its distance' );
	same( Object.keys( shader.uniforms ).filter( k => k.startsWith( 'tQuakedSky' ) ).length, 6, 'its six images' );
	R_SkyBoxSet( '' );
	const rmain = readFileSync( new URL( '../src/engine/render/gl_rmain.js', import.meta.url ), 'utf8' ), liquids = readFileSync( new URL( '../src/engine/render/gl_rsurf_liquids.js', import.meta.url ), 'utf8' );
	check( /R_SkyBoxNewMap\( cl\?\.worldmodel\?\.entities \)/.test( rmain ) && /R_SkyBoxInit\(\);/.test( rmain ), 'R_NewMap and R_Init' );
	check( /const solidLayerMaterial = skyBox \? skyBoxMaterial : solidSkyMaterial;/.test( liquids ), 'the sky surfaces draw it' );
	check( /skyBoxMaterial\.depthWrite !== skyDepthWrite/.test( liquids ) && /R_RegisterGlow\( skyBoxMaterial, 1\.9 \)/.test( liquids ), 'with the scrolling sky\'s depth and glow rules' );
	check( /if \( alphaSkyMaterial && ! skyBox \)/.test( liquids ), 'no scrolling cloud layer over a skybox' );

} );
