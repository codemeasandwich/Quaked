/**
 * @module engine/render/r_skybox
 *
 * Skyboxes, as Quakespasm and FitzQuake draw them, which add-ons use (Arcane Dimensions, Quoth, Dimension of the
 * Machine; card dadcb966, docs/skybox-2026-10-13.md): a map's worldspawn `sky` key (`_sky`, `skyname`, or `qlsky`,
 * read as Quakespasm reads them) names six images, `gfx/env/<name>rt`, `bk`, `lf`, `ft`, `up` and `dn` (TGA, decoded
 * here), and the `sky` console command changes it (`sky` alone prints it; `sky ""` returns to the scrolling sky).
 *
 * The map's own sky surfaces draw it: their material looks up the six images by the direction from the camera to each
 * point (R_SkyBoxMaterial), so every view that draws the world (teleporter windows, water reflections, each eye in XR)
 * sees the sky around its own camera, and the sky surfaces keep their depth, glow and fog rules. The sides are laid out
 * as Quakespasm lays them (its st_to_vec and skytexorder, from Quake II): right +x, left -x, back +y, front -y, up +z,
 * down -z, each image's first row at the side's t = +1; the GLSL is generated from the same table the layout is tested
 * by (R_SkyBoxDirection). A face whose image is missing shows dark grey, as Quakespasm keeps a skybox with a missing
 * face; with none found the map keeps its scrolling sky and the console says so.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: module-level `skyName` and `loaded` ({ name, textures, material } of the skybox shown, kept while the next
 * map names the same one).
 *
 * Errors: none raised; unreadable images are reported and replaced.
 */
import * as THREE from 'three';
import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from '../common/cmd.js';
import { Con_Printf } from '../common/console.js';
import { COM_FindFile } from '../common/pak.js';
import { R_FogSkyMaterial } from './r_fog.js';

/** The image name suffixes, in Quakespasm's order. */
export const SKYBOX_SUFFIXES = Object.freeze( [ 'rt', 'bk', 'lf', 'ft', 'up', 'dn' ] );
// Quakespasm's (Quake II's) st_to_vec: for each side (+x, -x, +y, -y, +z, -z), which of (s, t, 1) gives each of x, y, z
// (1-based, negative for minus)
const ST_TO_VEC = Object.freeze( [ [ 3, - 1, 2 ], [ - 3, 1, 2 ], [ 1, 3, 2 ], [ - 1, - 3, 2 ], [ - 2, - 1, 3 ], [ 2, - 1, - 3 ] ] );
/** Which suffix each side (+x, -x, +y, -y, +z, -z) shows: Quakespasm's skytexorder. */
export const SKYBOX_SIDE_IMAGE = Object.freeze( [ 0, 2, 1, 3, 4, 5 ] );
const MAX_PIXELS = 4096 * 4096; // per image: a damaged header cannot ask for more

let skyName = '', loaded = null;

/**
 * Decodes a TGA image (uncompressed or run-length, true colour or greyscale, 8, 24 or 32 bits), as skyboxes ship.
 *
 * @param {Uint8Array} bytes the file
 * @returns {?{ width: number, height: number, data: Uint8Array }} RGBA rows from the top, or null when it cannot be read
 */
export function R_DecodeTGA( bytes ) {

	if ( ! bytes || bytes.length < 18 ) return null;
	const idLength = bytes[ 0 ], mapType = bytes[ 1 ], type = bytes[ 2 ];
	const width = bytes[ 12 ] | ( bytes[ 13 ] << 8 ), height = bytes[ 14 ] | ( bytes[ 15 ] << 8 ), bpp = bytes[ 16 ], topDown = ( bytes[ 17 ] & 0x20 ) !== 0;
	const grey = type === 3 || type === 11, rle = type === 10 || type === 11;
	if ( mapType !== 0 || ! [ 2, 3, 10, 11 ].includes( type ) || width === 0 || height === 0 || width * height > MAX_PIXELS ) return null;
	if ( grey ? bpp !== 8 : bpp !== 24 && bpp !== 32 ) return null;
	const size = bpp / 8, count = width * height;
	// an uncompressed image must be all there before anything is made for it
	if ( ! rle && bytes.length < 18 + idLength + count * size ) return null;
	const out = new Uint8Array( count * 4 );
	let at = 18 + idLength, n = 0;
	const put = p => { // p: the source offset of one pixel
		const row = Math.floor( n / width ), col = n % width, y = topDown ? row : height - 1 - row, o = ( y * width + col ) * 4;
		if ( grey ) { out[ o ] = out[ o + 1 ] = out[ o + 2 ] = bytes[ p ]; out[ o + 3 ] = 255; }
		else { out[ o ] = bytes[ p + 2 ]; out[ o + 1 ] = bytes[ p + 1 ]; out[ o + 2 ] = bytes[ p ]; out[ o + 3 ] = size === 4 ? bytes[ p + 3 ] : 255; }
		n ++;
	};
	while ( n < count ) {

		if ( ! rle ) { put( at ); at += size; continue; }
		if ( at >= bytes.length ) return null;
		const head = bytes[ at ++ ], run = ( head & 127 ) + 1;
		if ( head & 128 ) { if ( at + size > bytes.length ) return null; for ( let k = 0; k < run && n < count; k ++ ) put( at ); at += size; }
		else for ( let k = 0; k < run && n < count; k ++ ) { if ( at + size > bytes.length ) return null; put( at ); at += size; }

	}
	return { width, height, data: out };

}

// for one side: which axis and sign give the distance, s and t (the inverse of its st_to_vec row)
function sideAxes( side ) {

	const row = ST_TO_VEC[ side ], find = k => { const i = row.findIndex( j => Math.abs( j ) === k ); return { axis: i, sign: Math.sign( row[ i ] ) }; };
	return { s: find( 1 ), t: find( 2 ), dist: find( 3 ) };

}

/**
 * The corners of one side, as Quakespasm draws it: the direction for each (s, t) corner and its texture place, the
 * image's first row at the side's t = +1.
 *
 * @param {number} side 0..5: +x, -x, +y, -y, +z, -z
 * @returns {Array<{ dir: Array<number>, uv: Array<number> }>} four corners, (s, t) = (-1, -1), (1, -1), (1, 1), (-1, 1)
 */
export function R_SkyBoxSide( side ) {

	return [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ].map( ( [ s, t ] ) => {

		const b = [ s, t, 1 ], dir = ST_TO_VEC[ side ].map( j => j < 0 ? - b[ - j - 1 ] : b[ j - 1 ] );
		return { dir, uv: [ ( s + 1 ) / 2, ( 1 - t ) / 2 ] };

	} );

}

/**
 * Where the sky is seen in one direction: the side (by the direction's largest component) and the place in its image.
 * The GLSL the sky material draws with does the same (generated from the same table).
 *
 * @param {Array<number>} dir a direction (x, y, z), any length
 * @returns {{ side: number, image: number, u: number, v: number }} the side 0..5, its image (suffix index) and 0..1 place
 */
export function R_SkyBoxDirection( dir ) {

	const a = dir.map( Math.abs ), axis = a[ 0 ] >= a[ 1 ] && a[ 0 ] >= a[ 2 ] ? 0 : a[ 1 ] >= a[ 2 ] ? 1 : 2;
	const side = axis * 2 + ( dir[ axis ] < 0 ? 1 : 0 ), { s, t, dist } = sideAxes( side );
	const d = dist.sign * dir[ dist.axis ], ss = s.sign * dir[ s.axis ] / d, tt = t.sign * dir[ t.axis ] / d;
	return { side, image: SKYBOX_SIDE_IMAGE[ side ], u: ( ss + 1 ) / 2, v: ( 1 - tt ) / 2 };

}

// the GLSL that colours a sky point from the six images, by side
function skyGLSL() {

	const comp = i => [ 'x', 'y', 'z' ][ i ], sgn = k => k < 0 ? '-' : '';
	const sides = [ 0, 1, 2, 3, 4, 5 ].map( side => {

		const { s, t, dist } = sideAxes( side );
		return `vec4 quakedSkySide${side}( vec3 d ) { float q = ${sgn( dist.sign )}d.${comp( dist.axis )}; vec2 st = vec2( ${sgn( s.sign )}d.${comp( s.axis )}, ${sgn( t.sign )}d.${comp( t.axis )} ) / q; return texture2D( tQuakedSky${SKYBOX_SIDE_IMAGE[ side ]}, vec2( ( st.x + 1.0 ) * 0.5, ( 1.0 - st.y ) * 0.5 ) ); }`;

	} );
	return `varying vec3 vQuakedSkyWorld;\n${SKYBOX_SUFFIXES.map( ( _, i ) => `uniform sampler2D tQuakedSky${i};` ).join( '\n' )}\n${sides.join( '\n' )}
vec4 quakedSky( vec3 d ) {
	vec3 a = abs( d );
	if ( a.x >= a.y && a.x >= a.z ) return d.x >= 0.0 ? quakedSkySide0( d ) : quakedSkySide1( d );
	if ( a.y >= a.z ) return d.y >= 0.0 ? quakedSkySide2( d ) : quakedSkySide3( d );
	return d.z >= 0.0 ? quakedSkySide4( d ) : quakedSkySide5( d );
}`;

}

/**
 * The shader pieces the sky material uses, for tests.
 *
 * @returns {string} the generated GLSL functions
 */
export function R_SkyBoxGLSL() {

	return skyGLSL();

}

// the material the map's sky surfaces draw a skybox with: the images looked up by direction from the camera
function makeMaterial( textures ) {

	const material = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } );
	const before = material.onBeforeCompile, glsl = skyGLSL();
	material.onBeforeCompile = function ( shader, renderer ) {

		before?.call( this, shader, renderer ); // (the Newer Game G-buffer patch, when installed)
		textures.forEach( ( texture, i ) => { shader.uniforms[ `tQuakedSky${i}` ] = { value: texture }; } );
		shader.vertexShader = 'varying vec3 vQuakedSkyWorld;\n' + shader.vertexShader.replace( '#include <project_vertex>',
			'#include <project_vertex>\n\tvQuakedSkyWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;' );
		shader.fragmentShader = glsl + '\n' + shader.fragmentShader.replace( '#include <map_fragment>',
			'diffuseColor *= quakedSky( vQuakedSkyWorld - cameraPosition ); // the skybox (r_skybox.js)' );

	};
	const key = material.customProgramCacheKey.bind( material );
	material.customProgramCacheKey = () => key() + '|quaked-skybox';
	return R_FogSkyMaterial( material ); // the fog's share, after the lookup

}

function release() {

	if ( ! loaded ) return;
	loaded.textures.forEach( t => t.dispose() );
	loaded.material.dispose();
	loaded = null;

}

// the six images of `name` as textures (a missing one dark grey); null when none is there
function loadTextures( name ) {

	let found = 0;
	const textures = SKYBOX_SUFFIXES.map( suffix => {

		const file = COM_FindFile( `gfx/env/${name}${suffix}.tga` );
		const image = file ? R_DecodeTGA( file.data ) : null;
		if ( image ) found ++;
		else Con_Printf( 'Couldn\'t load gfx/env/%s%s.tga\n', name, suffix );
		const texture = image ? new THREE.DataTexture( image.data, image.width, image.height ) : new THREE.DataTexture( new Uint8Array( [ 32, 32, 32, 255 ] ), 1, 1 );
		texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
		texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
		return texture;

	} );
	if ( found === 0 ) { textures.forEach( t => t.dispose() ); Con_Printf( 'No skybox images for "%s": the map keeps its scrolling sky\n', name ); return null; }
	return textures;

}

/**
 * Sets the skybox by name ('' for none). The same name as the one shown keeps it, without decoding its images again.
 *
 * @param {string} name the images' name, without `gfx/env/`, the suffix or `.tga`
 * @returns {boolean} whether a skybox is shown
 */
export function R_SkyBoxSet( name ) {

	skyName = typeof name === 'string' ? name.trim() : '';
	if ( loaded && loaded.name === skyName ) return true;
	release();
	if ( ! skyName ) return false;
	const textures = loadTextures( skyName );
	if ( textures ) loaded = { name: skyName, textures, material: makeMaterial( textures ) };
	return loaded !== null;

}

/**
 * Starts a map's skybox from its entities, as Quakespasm's Sky_NewMap: worldspawn `sky` or `skyname` (a leading `_` on
 * the key allowed: Dimension of the Machine uses `_sky`), or `qlsky` (the name with `_` added), else none. Called by the
 * renderer's R_NewMap.
 *
 * @param {?string} entities the map's entity text (model.entities)
 */
export function R_SkyBoxNewMap( entities ) {

	const world = /\{([^}]*)\}/.exec( entities ?? '' )?.[ 1 ] ?? '';
	let name = '';
	for ( const [ , rawKey, value ] of world.matchAll( /"([^"]*)"\s*"([^"]*)"/g ) ) {

		const key = rawKey.replace( /^_/, '' ).toLowerCase();
		if ( key === 'sky' || key === 'skyname' ) name = value;
		else if ( key === 'qlsky' ) name = value + '_';

	}
	R_SkyBoxSet( name );

}

/**
 * The material the map's sky surfaces draw with while a skybox is shown (gl_rsurf_liquids.js), or null for the
 * scrolling sky.
 *
 * @returns {?THREE.Material} the material
 */
export function R_SkyBoxMaterial() {

	return loaded ? loaded.material : null;

}

/** Whether a skybox is shown. @returns {boolean} whether one is */
export function R_SkyBoxActive() {

	return loaded !== null;

}

/** The skybox's name ('' for none). @returns {string} the name */
export function R_SkyBoxName() {

	return loaded ? loaded.name : '';

}

// `sky` alone prints the skybox's name; `sky <name>` sets it ("" for none)
function R_Sky_f() {

	if ( Cmd_Argc() < 2 ) { Con_Printf( '"sky" is "%s"\n', R_SkyBoxName() ); return; }
	R_SkyBoxSet( Cmd_Argv( 1 ) );

}

/** Registers the `sky` command. Called once by R_Init. */
export function R_SkyBoxInit() {

	Cmd_AddCommand( 'sky', R_Sky_f );

}
