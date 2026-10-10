// Card [44h]: proves the split of gl_post.js draws identical frames. The same native E1M1 views go through the whole
// Newer post pipeline (R_PostBegin, R_PostLightsFrame, R_PostBind, the world, R_PostFinish) with fixed game time and a
// frozen page clock; each view's pixels are SHA-256 hashed. tools: run it on the commit before the split and after each
// step (tools/post_split_frames.mjs); every hash must match. The views are chosen from the map's own leaves: the
// open air under its sky, inside and above its water and its slime, an interior with the flashlight, depth of field and
// the split screen.
import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import * as post from '../src/newer/render/gl_post.js';
import * as main from '../src/engine/render/gl_rmain.js';
import * as surf from '../src/engine/render/gl_rsurf.js';
import * as mode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import { r_flashlight } from '../src/newer/render/r_flashlight.js';
import { r_dof } from '../src/newer/render/r_dof.js';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName, Mod_PointInLeaf } from '../src/engine/render/gl_model.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { cl } from '../src/engine/client/client.js';
import { r_refdef } from '../src/engine/render/render.js';
import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
const W = 640, H = 400, report = document.querySelector( '#report' ), button = document.querySelector( '#run' ), views = document.querySelector( '#views' );
const errors = [];
window.addEventListener( 'error', e => errors.push( { runtime: e.message } ) ); window.addEventListener( 'unhandledrejection', e => errors.push( { rejection: String( e.reason ) } ) );
const CLOCK = 123456.789; Object.defineProperty( performance, 'now', { configurable: true, value: () => CLOCK } ); // the page clock post reads
const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_bounce, post.r_volumetric, post.r_pointshadows, post.r_heathaze, post.r_mist, post.r_reflect, post.r_caustics, post.r_pillars,
	mode.r_newer_lighting, mode.r_newer_normals, mode.r_newer_water, mode.r_newer_textures, mode.r_newer_enemies, mode.r_newer_shadows, r_flashlight, r_dof ];
const styles = new Array( 64 ).fill( 264 );
const hash = async bytes => Array.from( new Uint8Array( await crypto.subtle.digest( 'SHA-256', bytes ) ), v => v.toString( 16 ).padStart( 2, '0' ) ).join( '' );
let renderer, world;

// every post pass a view draws: its fragment shader and every uniform's value (textures by the order first seen),
// so a pass that drifts is caught even where a view is dark
const passes = [], textureIds = new Map();
function value( v ) {
	if ( v == null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' ) return v;
	if ( v.isTexture ) { if ( ! textureIds.has( v ) ) textureIds.set( v, textureIds.size ); return 'tex' + textureIds.get( v ); }
	if ( Array.isArray( v ) || ArrayBuffer.isView( v ) ) return Array.from( v, value );
	if ( v.isVector2 || v.isVector3 || v.isVector4 || v.isColor || v.isMatrix3 || v.isMatrix4 || v.isQuaternion ) return v.toArray();
	return typeof v === 'object' ? Object.fromEntries( Object.entries( v ).filter( ( [ k ] ) => ! k.startsWith( '_' ) ).map( ( [ k, x ] ) => [ k, value( x ) ] ) ) : String( v );
}
function recordPasses( r ) {
	const render = r.render;
	r.render = function ( scene, camera ) {
		const material = scene.children?.[ 0 ]?.material;
		if ( material?.isShaderMaterial ) {
			const target = r.getRenderTarget();
			passes.push( JSON.stringify( [ material.fragmentShader, target ? [ target.width, target.height, target.textures?.length ?? 1 ] : null,
				Object.fromEntries( Object.entries( material.uniforms ).sort().map( ( [ k, u ] ) => [ k, value( u.value ) ] ) ) ] ) );
		}
		return render.call( this, scene, camera );
	};
}

// a deterministic point in a leaf of `contents`: of the points of a 9x9x9 grid over each such leaf's box that lie in that
// leaf (a box's centre need not, and leaf boxes are loose), the one nearest `near`
function pointIn( contents, near ) {
	let point = null, best = Infinity, top = 0;
	for ( const leaf of world.leafs ) {
		if ( leaf.contents !== contents ) continue;
		const m = leaf.minmaxs;
		for ( let i = 1; i < 10; i ++ ) for ( let j = 1; j < 10; j ++ ) for ( let k = 1; k < 10; k ++ ) {
			const p = [ m[ 0 ] + ( m[ 3 ] - m[ 0 ] ) * i / 10, m[ 1 ] + ( m[ 4 ] - m[ 1 ] ) * j / 10, m[ 2 ] + ( m[ 5 ] - m[ 2 ] ) * k / 10 ];
			const d = ( p[ 0 ] - near[ 0 ] ) ** 2 + ( p[ 1 ] - near[ 1 ] ) ** 2 + ( p[ 2 ] - near[ 2 ] ) ** 2;
			if ( d < best && Mod_PointInLeaf( p, world ) === leaf ) { best = d; point = p; top = m[ 5 ]; }
		}
	}
	if ( ! point ) throw Error( 'E1M1 has no reachable leaf of contents ' + contents );
	return { point, top };
}

async function draw( label, { origin, angles, flashlight = 0, dof = 0, split = false } ) {
	cl.time = 10; cl.worldmodel = world; r_refdef.vrect.width = W; r_refdef.vrect.height = H; r_refdef.fov_y = 65; r_refdef.fov_x = 90;
	r_refdef.vieworg.set( origin ); r_refdef.viewangles.set( angles );
	vars.Cvar_SetValue( 'r_flashlight', flashlight ); vars.Cvar_SetValue( 'r_dof', dof ); post.R_PostSetSplit( split );
	passes.length = 0;
	renderer.setRenderTarget( null ); renderer.clear(); // each view from a cleared screen (the split fills only its left half)
	main.R_SetupFrame(); main.R_SetupGL(); post.R_PostBegin( renderer, true, W, H );
	surf.R_DrawWorld(); surf.R_WorldShowAll( true );
	for ( let i = 0; i < 4; i ++ ) {
		post.R_PostLightsFrame( renderer, main.scene, main.camera, main.r_visframecount, styles, [], 10, false );
		post.R_PostBind( renderer ); renderer.clear(); renderer.render( main.scene, main.camera );
		post.R_PostFinish( renderer, main.scene, main.camera, { lx: 0, ly: 0, lw: W, lh: H }, main.r_visframecount, styles, [], 10, 1, false );
	}
	const pixels = new Uint8Array( W * H * 4 ), gl = renderer.getContext(); renderer.setRenderTarget( null ); gl.readPixels( 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels );
	const figure = document.createElement( 'figure' ), img = document.createElement( 'img' ), caption = document.createElement( 'figcaption' ); img.src = renderer.domElement.toDataURL(); caption.textContent = label; figure.append( img, caption ); views.append( figure );
	let lit = 0; for ( let i = 0; i < pixels.length; i += 4 ) if ( pixels[ i ] + pixels[ i + 1 ] + pixels[ i + 2 ] > 30 ) lit ++;
	post.R_PostSetSplit( false );
	return { label, sha256: await hash( pixels ), passes: passes.length, passesSha256: await hash( new TextEncoder().encode( passes.join( '\n' ) ) ), litPixels: lit, glError: gl.getError(), contents: Mod_PointInLeaf( origin, world )?.contents };
}

async function run() {
	button.disabled = true; views.replaceChildren(); const frames = [];
	try {
		const start = [ 480, - 352, 88 + 22 ]; // info_player_start, at eye height
		const outside = [ 160, 3044, 0 ]; // a leaf the map marks loud with both water and sky ambience
		const water = pointIn( - 3, outside ), slime = pointIn( - 4, outside );
		const VIEWS = [
			[ 'Start, looking out', { origin: start, angles: [ 0, 90, 0 ] } ],
			[ 'The open air, up at the sky', { origin: outside, angles: [ - 35, 90, 0 ] } ],
			[ 'Over the water', { origin: outside, angles: [ 45, 90, 0 ] } ],
			[ 'Under the water', { origin: water.point, angles: [ 0, 90, 0 ] } ],
			[ 'Above the slime', { origin: [ slime.point[ 0 ], slime.point[ 1 ], slime.top + 30 ], angles: [ 45, 90, 0 ] } ],
			[ 'Flashlight', { origin: start, angles: [ 10, 180, 0 ], flashlight: 1 } ],
			[ 'Depth of field', { origin: start, angles: [ 0, 90, 0 ], dof: 0.6 } ],
			[ 'Split screen', { origin: start, angles: [ 0, 90, 0 ], split: true } ]
		];
		// a first pass over every view starts what is made in the background (normal maps, probes); once it has settled,
		// the measured pass draws them all again, so a busy machine cannot change what is measured
		for ( const [ label, view ] of VIEWS ) await draw( label, view );
		views.replaceChildren();
		for ( let settled = 0, last = ''; settled < 3; ) {
			await new Promise( r => setTimeout( r, 500 ) );
			const now = JSON.stringify( await draw( 'settling', VIEWS[ 0 ][ 1 ] ) ); views.replaceChildren();
			settled = now === last ? settled + 1 : 0; last = now;
		}
		for ( const [ label, view ] of VIEWS ) frames.push( await draw( label, view ) );
	} catch ( error ) { errors.push( { thrown: String( error.stack || error ) } ); }
	finally { renderer.setRenderTarget( null ); button.disabled = false; }
	const result = { status: errors.length === 0 && frames.length === 8 && frames.every( f => f.glError === 0 && f.passes > 0 ) ? 'PASS' : 'FAIL', frames, errors,
		digest: await hash( new TextEncoder().encode( frames.map( f => f.sha256 + f.passesSha256 ).join( '' ) ) ) };
	window.postSplitResult = result; report.textContent = JSON.stringify( result, null, 2 );
}
try {
	main.R_Init(); for ( const c of options ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
	for ( const [ name, value ] of Object.entries( { r_hdr: 1, r_dynres: 0, r_bloom: .9, r_bounce: 1, r_volumetric: 1, r_pointshadows: 1, r_heathaze: .6, r_mist: .6, r_reflect: .6, r_caustics: 1, r_pillars: .5,
		r_newer_lighting: 1, r_newer_normals: 1, r_newer_water: 1, r_newer_textures: 0, r_newer_enemies: 0, r_newer_shadows: 1, r_flashlight: 0, r_dof: 0 } ) ) vars.Cvar_SetTemporary( name, String( value ) );
	const response = await fetch( new URL( '../games/shareware/pak0.pak', import.meta.url ) ); if ( ! response.ok ) throw Error( 'Bundled shareware pack missing' );
	COM_AddPack( COM_LoadPackFile( 'pak0.pak', await response.arrayBuffer() ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); vid.fullbright = 224; Mod_Init();
	world = Mod_ForName( 'maps/e1m1.bsp', true ); cl.worldmodel = world; cl.model_precache[ 1 ] = world; cl.model_precache[ 2 ] = null; main.R_NewMap();
	post.R_BuildWorldLights( world ); post.R_BuildSunOccluder( world );
	renderer = new THREE.WebGLRenderer( { antialias: false, preserveDrawingBuffer: true } ); renderer.setPixelRatio( 1 ); renderer.setSize( W, H ); renderer.autoClear = false; renderer.setClearColor( 0, 0 );
	recordPasses( renderer );
	renderer.debug.onShaderError = ( gl, p, v, f ) => errors.push( { program: gl.getProgramInfoLog( p ), vertex: gl.getShaderInfoLog( v ), fragment: gl.getShaderInfoLog( f ) } );
	button.addEventListener( 'click', run ); button.disabled = false; report.textContent = 'Ready.';
} catch ( error ) { report.textContent = String( error.stack || error ); window.postSplitResult = { status: 'FAIL', error: String( error ) }; }
window.addEventListener( 'pagehide', () => { for ( const c of options ) vars.Cvar_RestoreTemporary( c.name ); renderer?.dispose(); } );
