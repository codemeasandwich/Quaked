// Real material, light builder and public post-frame pipeline. Renderer calls
// are observed here; the bounded browser fixture supplies actual GPU proof.
import * as THREE from 'three';
import * as post from '../src/newer/render/gl_post.js';
import * as surf from '../src/engine/render/gl_rsurf.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
import { readFileSync } from 'node:fs';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { cl } from '../src/engine/client/client.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( a, b, message ) => check( a === b, `${message}: ${a} != ${b}` );
const near = ( a, b, message ) => check( Math.abs( a - b ) < 1e-8, `${message}: ${a} != ${b}` );
function pipeline() {

	let target = null; const draws = [], color = new THREE.Color();
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true }, getRenderTarget: () => target, setRenderTarget: t => { target = t; }, setViewport() {}, getClearColor: c => c.copy( color ), getClearAlpha: () => 1, setClearColor: c => color.set( c ), clear() {}, render( scene ) {

		const material = scene.children[ 0 ]?.material; if ( material?.uniforms ) draws.push( { material, volume: material.uniforms.uVolume?.value, sun: material.uniforms.uSunScatter?.value, point: material.uniforms.uScatter?.value } );

	} };
	const camera = new THREE.PerspectiveCamera( 75, 1.6, 4, 4096 ); camera.updateMatrixWorld();
	return { renderer, draws, camera, frame( sky = false ) { draws.length = 0; post.R_PostBegin( renderer, true, 320, 200 ); post.R_PostBind( renderer ); post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 0, 1, sky ); return draws.at( -1 ); } };

}
function withControls( fn ) {

	const controls = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_pillars, post.r_bounce, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
	for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const saved = controls.map( v => v.string ), p = pipeline();
	try { for ( const v of controls ) vars.Cvar_Set( v.name, '1' ); for ( const name of [ 'r_dynres', 'r_bloom', 'r_bounce', 'r_newer_normals', 'r_newer_water' ] ) vars.Cvar_Set( name, '0' ); vars.Cvar_Set( 'r_pillars', '.5' ); fn( p ); }
	finally { controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); post.R_PostBegin( p.renderer, false, 0, 0 ); }

}
function leafModel( surfaces ) { const leaf = { contents: -1, visframe: 0 }; return { entities: '', surfaces, firstmodelsurface: 0, nummodelsurfaces: surfaces.length, nodes: [ leaf ], leafs: [ { contents: -2 }, leaf ], numleafs: 1 }; }
function lavaFace( x, y, size = 192 ) { return { flags: 16, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: { name: '*lava1' } }, polys: { numverts: 4, verts: [ [ x, y, 0 ], [ x + size, y, 0 ], [ x + size, y + size, 0 ], [ x, y + size, 0 ] ], next: null } }; }

Deno.test( 'default shafts retain one4x sun/flashlight gain with broad point fog removed while the .5 slider stays nominal and off modes stay off', () => withControls( p => {

	const gains = [];
	for ( const strength of [ .125, .5, 1 ] ) {

		vars.Cvar_SetValue( 'r_pillars', strength ); const final = p.frame( true ), volume = p.draws.find( draw => draw.sun !== undefined );
		check( volume, 'public frame executes volumetric pass' ); same( final.volume, strength * 8, 'single common shaft compositing gain' );
		near( volume.point, 0, 'owner-requested broad point fog is removed' );
		check( volume.material.fragmentShader.includes( 'uSunCol * lit * uSunScatter' ) && volume.material.fragmentShader.includes( 'result + acc * uScatter' ) && volume.material.fragmentShader.includes( 'result += beam * ds' ), 'all three sources share the same volume texture' );
		check( final.material.fragmentShader.includes( 'texture2D( tVolume, uvd ).rgb * uVolume' ), 'all shaft colour multiplied once at composition' ); gains.push( { gain: final.volume, sun: volume.sun } );

	}
	near( gains[ 1 ].gain / gains[ 0 ].gain, 4, 'default is exactly4x the preserved nominal shaft buffer' ); same( gains[ 0 ].sun, gains[ 1 ].sun, 'sun does not multiply slider a second time' );
	vars.Cvar_SetValue( 'r_pillars', 0 ); const off = p.frame(); same( off.volume, 0, 'slider zero removes every shaft' ); check( ! p.draws.some( draw => draw.sun !== undefined ), 'zero slider skips the expensive pass' );
	vars.Cvar_SetValue( 'r_pillars', .5 ); vars.Cvar_SetValue( 'r_newer_lighting', 0 ); same( p.frame().volume, 0, 'lighting off has no shaft multiplier' );
	vars.Cvar_SetValue( 'r_hdr', 0 ); same( post.R_PostBegin( p.renderer, true, 320, 200 ), false, 'Classic bypasses HDR and shafts' );

} ) );

Deno.test( 'lava material becomes emissive above bloom range without texture/opacity/physics changes, then returns to native colour', () => withControls( p => {

	const texture = new THREE.DataTexture( new Uint8Array( [ 255, 150, 32, 255 ] ), 1, 1 ), named = { name: '*lava1', gl_texture: texture };
	post.R_PostBegin( p.renderer, true, 320, 200 ); const material = surf.R_LiquidSurfaceMaterial( named, 1 );
	try {

		same( material.map, texture, 'original lava picture' ); same( material.opacity, 1, 'lava remains opaque' ); same( material.depthWrite, true, 'opaque native lava depth retained' );
		same( post.R_LiquidOpacity( '*lava1', 1 ), 1, 'physical liquid opacity policy unchanged' );
		for ( let i = 0; i < 8; i ++ ) { post.R_PostBegin( p.renderer, true, 320, 200 ); check( material.color.r > 4.7 && material.color.r < 7.3, 'owner-intensified 6x lava HDR glow retains the same bounded pulse above bloom threshold' ); }
		vars.Cvar_SetValue( 'r_newer_lighting', 0 ); post.R_PostBegin( p.renderer, true, 320, 200 ); near( material.color.r, 1, 'lighting off uses native intensity' );
		vars.Cvar_SetValue( 'r_hdr', 0 ); post.R_PostBegin( p.renderer, false, 0, 0 ); near( material.color.r, 1, 'Classic native intensity' ); same( material.map, texture, 'texture never replaced by glow' );

	} finally { material.dispose(); texture.dispose(); }

} ) );

Deno.test( 'subdivided lava emits from local surface patches and broad area falloff leaves ordinary lamps unchanged', () => withControls( p => {

	const a = lavaFace( 0, 0 ), b = lavaFace( 192, 0 ), c = lavaFace( 384, 0 ); a.polys.next = b.polys; b.polys.next = c.polys;
	const lights = post.R_BuildWorldLights( leafModel( [ a ] ) ); same( lights.length, 3, 'one existing cluster per local192-unit lava patch' );
	check( lights.every( light => light.texture === '*lava1' && light.pos[ 2 ] === 10 && light.radius === 96 ), 'emitters lie above actual lava, with measured area radius and source provenance' );
	const final = p.frame(), fragment = final.material.fragmentShader;
	const extentExpression = /float extent = ([^;]+);/.exec( fragment )[ 1 ], fallExpression = /float fall = ([^;]+);/.exec( fragment )[ 1 ];
	const extent = new Function( 'uLightPos', 'index', 'max', 'return ' + extentExpression ), fall = new Function( 'distance', 'extent', 'return ' + fallExpression );
	for ( const radius of [ 28, 40 ] ) for ( const distance of [ 0, 30, 80, 150 ] ) near( fall( distance, extent( [ { w: radius } ], 0, Math.max ) ), 1 / ( 1 + distance ** 2 / 3600 ), 'ordinary lamp/dynamic attenuation remains native policy' );
	check( fall( 96, extent( [ { w: 96 } ], 0, Math.max ) ) > fall( 96, 60 ) * 1.7, 'actual area source reaches neighboring surface more strongly' );
	const opposite = lavaFace( 0, 0 ); opposite.flags |= 2;
	const separated = post.R_BuildWorldLights( leafModel( [ lavaFace( 0, 0 ), opposite ] ) ); same( separated.length, 2, 'opposed emitting faces are not averaged into one hidden source' ); check( separated.some( light => light.pos[ 2 ] === 10 ) && separated.some( light => light.pos[ 2 ] === -10 ), 'each emission remains on its own facing side' );

} ) );

Deno.test( 'actual START lava generates local warm emitters with unchanged native pool geometry and liquid boundaries', () => {

	const bytes = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
	const previous = cl.worldmodel, previousModels = [ cl.model_precache[ 1 ], cl.model_precache[ 2 ] ];
	try {

		const model = Mod_ForName( 'maps/start.bsp', true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null; surf.GL_BuildLightmaps();
		const pools = model.surfaces.filter( face => face.texinfo.texture.name.startsWith( '*lava' ) ), snapshot = pools.flatMap( face => { const polys = []; for ( let p = face.polys; p; p = p.next ) polys.push( [ p, Array.from( p.verts ) ] ); return polys; } );
		check( pools.length > 0, 'native hub contains lava' );
		const lights = post.R_BuildWorldLights( model ).filter( light => light.texture?.startsWith( '*lava' ) ); check( lights.length > 0 && lights.length <= 500, 'bounded native lava surface emitters' );
		check( lights.every( light => light.color[ 0 ] > light.color[ 1 ] && light.color[ 1 ] > light.color[ 2 ] && light.power > 0 ), 'native lava radiates warm orange light' );
		for ( const [ polygon, original ] of snapshot ) same( Array.from( polygon.verts ).join(), original.join(), 'native lavaXYZ/turbulentUV vertices unchanged' );
		check( post.R_GetLavaRegions().length > 0 && ! post.R_GetLiquidRegions().some( region => region.kind === 2 ), 'lava keeps separate opaque region; water volume classification unchanged' );
		const nearHard = lights.slice().sort( ( a, b ) => Math.hypot( a.pos[ 0 ] - 864, a.pos[ 1 ] - 1104, a.pos[ 2 ] + 96 ) - Math.hypot( b.pos[ 0 ] - 864, b.pos[ 1 ] - 1104, b.pos[ 2 ] + 96 ) ).slice( 0, 4 );
		console.log( 'NATIVE_START_LAVA ' + JSON.stringify( { surfaces: pools.length, emitters: lights.length, nearHard: nearHard.map( light => ( { pos: light.pos, radius: light.radius, power: light.power } ) ) } ) );

	} finally { cl.worldmodel = previous; [ cl.model_precache[ 1 ], cl.model_precache[ 2 ] ] = previousModels; }

} );
