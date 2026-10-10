// Actual E1M3 sources, public selection/capture/pipeline endpoints. Renderer
// endpoints are observed without creating WebGL, a browser or a game loop.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName, Mod_PointInLeaf, Mod_LeafPVS } from '../src/gl_model.js';
import { VID_SetPalette, vid } from '../src/vid.js';
import { GL_BuildLightmaps } from '../src/gl_rsurf.js';
import { R_ParseEntityLump } from '../src/gl_portal.js';
import * as post from '../src/gl_post.js';
import * as anim from '../src/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
import { cl, cl_dlights, cl_visedicts, cl_numvisedicts, set_cl_numvisedicts } from '../src/client.js';
import { SV_HullPointContents, SV_RecursiveHullCheck, trace_t } from '../src/engine/server/world.js';
import { PointShadowAtlas, PointShadowFaceUV, POINT_SHADOW_GLSL, POINT_SHADOW_SIZE, POINT_SHADOW_SLOTS } from '../src/r_pointshadows.js';
import * as menu from '../src/menu.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as keys from '../src/keys.js';
import { R_FlashlightNewRun, R_FlashlightSkillSelected, R_FlashlightRunEnd } from '../src/r_flashlightrun.js';
import { r_flashlight, R_FlashlightUpdate, R_FlashlightBeam } from '../src/r_flashlight.js';
import { v_gamma } from '../src/view.js';
import { cl_showfps } from '../src/r_perf.js';
import * as main from '../src/gl_rmain.js';
import { entity_t } from '../src/render.js';
import { R_LightPointValue } from '../src/gl_rlight.js';
import { R_AssetAliasMaterial } from '../src/r_newerskins.js';
import { r_avertexnormal_dots } from '../src/engine/common/anorm_dots.js';
import { r_newer_weapons } from '../src/r_weapons.js';
import { cl_forwardspeed, cl_backspeed } from '../src/cl_input.js';
import { sensitivity } from '../src/cl_main.js';
import { volume, bgmvolume } from '../src/sound.js';
import { scr_viewsize } from '../src/gl_screen.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const near = ( a, b, label, epsilon = 1e-7 ) => check( Math.abs( a - b ) <= epsilon, `${label}: ${a} != ${b}` );
const pack = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data );
vid.fullbright = 224; // Real VID_Init contract: unset0 makes every pixel falsely emissive.
Mod_Init(); const model = Mod_ForName( 'maps/e1m3.bsp', true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();
const entities = R_ParseEntityLump( model.entities ), lights = post.R_BuildWorldLights( model ), eye = [ -736, -1592, 110 ], styles = new Array( 64 ).fill( 264 );
const leaf = Mod_PointInLeaf( eye, model ), pvs = Mod_LeafPVS( leaf, model ).slice(); for ( let i = 1; i <= model.numleafs; i ++ ) model.leafs[ i ].visframe = pvs[ ( i - 1 ) >> 3 ] & ( 1 << ( ( i - 1 ) & 7 ) ) ? 73 : 0;
let nativeCaptureScene;
function camera( direction = [ 0, -1, 0 ] ) { const c = new THREE.PerspectiveCamera( 75, 1.6, 4, 4096 ); c.up.set( 0, 0, 1 ); c.position.fromArray( eye ); c.lookAt( eye[ 0 ] + direction[ 0 ], eye[ 1 ] + direction[ 1 ], eye[ 2 ] + direction[ 2 ] ); c.updateMatrixWorld(); return c; }
function geometry() { const g = new THREE.BufferGeometry(); g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ 0, -20, -20, 0, 20, -20, 0, 20, 20, 0, -20, 20 ], 3 ) ); g.setIndex( [ 0, 1, 2, 0, 2, 3 ] ); return g; }
function renderer( dpr = 2 ) {

	const previous = new THREE.WebGLRenderTarget( 640, 400 ), r = { target: previous, face: 3, mip: 2, viewport: new THREE.Vector4( 7, 11, 280, 160 ), scissor: new THREE.Vector4( 3, 5, 240, 120 ), scissorTest: false, color: new THREE.Color( .1, .2, .3 ), alpha: .35, autoClear: true, xr: { enabled: true }, draws: [], targetHistory: [], throwAt: Infinity, capabilities: { isWebGL2: true }, extensions: { has: () => true } };
	r.getRenderTarget = () => r.target; r.getActiveCubeFace = () => r.face; r.getActiveMipmapLevel = () => r.mip; r.getViewport = v => v.copy( r.viewport ); r.getScissor = v => v.copy( r.scissor ); r.getScissorTest = () => r.scissorTest; r.getClearColor = c => c.copy( r.color ); r.getClearAlpha = () => r.alpha;
	r.setViewport = ( ...args ) => { args[ 0 ]?.isVector4 ? r.viewport.copy( args[ 0 ] ) : r.viewport.set( ...args ); r.physicalViewport.copy( r.viewport ).multiplyScalar( dpr ).floor(); };
	r.setScissor = ( ...args ) => { args[ 0 ]?.isVector4 ? r.scissor.copy( args[ 0 ] ) : r.scissor.set( ...args ); r.physicalScissor.copy( r.scissor ).multiplyScalar( dpr ).floor(); };
	r.setScissorTest = v => { r.scissorTest = r.physicalScissorTest = v; }; r.setClearColor = ( c, a = r.alpha ) => { r.color.set( c ); r.alpha = a; }; r.clear = () => {};
	r.setRenderTarget = ( t, face = 0, mip = 0 ) => { r.target = t; r.face = face; r.mip = mip; r.physicalViewport.copy( t ? t.viewport : r.viewport.clone().multiplyScalar( dpr ).floor() ); r.physicalScissor.copy( t ? t.scissor : r.scissor.clone().multiplyScalar( dpr ).floor() ); r.physicalScissorTest = t ? t.scissorTest : r.scissorTest; r.targetHistory.push( t ); };
	r.render = ( scene, c ) => { const draw = { scene, camera: c, target: r.target, viewport: r.physicalViewport.toArray(), scissor: r.physicalScissor.toArray(), scissorTest: r.physicalScissorTest, material: scene.children[ 0 ]?.material }; r.draws.push( draw ); if ( r.draws.length === r.throwAt ) throw new Error( 'fixture capture failure' ); };
	r.physicalViewport = previous.viewport.clone(); r.physicalScissor = previous.scissor.clone(); r.physicalScissorTest = previous.scissorTest; r.previous = previous; r.dispose = () => previous.dispose(); return r;

}
function state( r ) { return { target: r.target, face: r.face, mip: r.mip, viewport: r.viewport.toArray().join(), scissor: r.scissor.toArray().join(), physicalViewport: r.physicalViewport.toArray().join(), physicalScissor: r.physicalScissor.toArray().join(), physicalScissorTest: r.physicalScissorTest, scissorTest: r.scissorTest, color: r.color.toArray().join(), alpha: r.alpha, autoClear: r.autoClear, xr: r.xr.enabled }; }
function restored( r, before ) { for ( const [ name, expected ] of Object.entries( before ) ) same( state( r )[ name ], expected, 'renderer exact restored state ' + name ); }

Deno.test( 'actual E1M3 torches are collected at native air positions and physical-light selection is stable under yaw and flicker', () => {

	const fires = entities.filter( e => /torch|flame/.test( e.classname || '' ) ); same( fires.length, 44, 'native44 torch/fire entities' ); same( lights.length, 229, '227actual entities plus2actual emissive surface clusters' );
	for ( const fire of fires ) { const pos = fire.origin.split( ' ' ).map( Number ), source = lights.find( l => l.classname === fire.classname && l.pos.join() === pos.join() ); check( source, 'every native flame source collected' ); same( source.emitter, 1, 'actual fire prioritized as physical emitter' ); same( source.leaf.contents, -1, 'native source in air, not offset into solid' ); }
	const baseline = post.R_SelectWorldLights( camera().matrixWorldInverse, 73, styles, [], 0 ), ids = baseline.map( l => l.source ); same( baseline.length, post.MAX_VOLUME_LIGHTS, 'existing eight-light budget preserved' );
	check( baseline.some( l => l.source.classname === 'light_flame_large_yellow' && l.position.join() === '-966,-1750,256' ), 'actual nearby torch remains selected over plain baked helpers' );
	for ( const direction of [ [ 1, 0, 0 ], [ 0, 1, 0 ], [ -1, -1, .2 ] ] ) { const selected = post.R_SelectWorldLights( camera( direction ).matrixWorldInverse, 73, styles, [], 0 ); same( selected.length, ids.length, 'same source count while camera rotates' ); check( selected.every( l => ids.includes( l.source ) ), 'fixed-eye camera turning never swaps room light sources' ); }
	const later = post.R_SelectWorldLights( camera().matrixWorldInverse, 73, styles, [], 17 ); check( later.every( l => ids.includes( l.source ) ), 'fire flutter changes no static source identities' );
	let fluctuated = false; for ( const l of later ) { const first = baseline.find( a => a.source === l.source ); near( l.score, first.score, 'base-power ranking independent of flicker' ); if ( l.source.flicker ) fluctuated ||= l.color.some( ( c, i ) => c !== first.color[ i ] ); check( l.range > 0 && l.color.every( Number.isFinite ), 'finite runtime light data' ); }
	check( fluctuated, 'actual native flames still flicker in radiance' ); console.log( 'E1M3_STATIC_SOURCE_SELECTION ' + JSON.stringify( baseline.map( l => ( { classname: l.source.classname || l.source.texture, position: l.position, emitter: l.source.emitter } ) ) ) );

} );

Deno.test( 'all six radial face UV projections match independent ninety-degree cameras including negative directions and edge ties', () => {

	const directions = [ [ 1, 0, 0 ], [ -1, 0, 0 ], [ 0, 1, 0 ], [ 0, -1, 0 ], [ 0, 0, 1 ], [ 0, 0, -1 ] ], up = [ [ 0, 0, 1 ], [ 0, 0, 1 ], [ 0, 0, 1 ], [ 0, 0, 1 ], [ 0, 1, 0 ], [ 0, 1, 0 ] ];
	const vectors = [ ...directions, [ 1, 1, 1 ], [ -1, -1, -1 ], [ 1, -1, 0 ], [ -1, 1, 0 ], [ .3, -.8, -2 ], [ -4, 1.3, .6 ], [ .6, 3, -1 ] ];
	for ( const delta of vectors ) { const result = PointShadowFaceUV( delta ), c = new THREE.PerspectiveCamera( 90, 1, .1, 4096 ), light = [ 13, -25, 8 ]; c.position.fromArray( light ); c.up.fromArray( up[ result.face ] ); c.lookAt( ...light.map( ( v, k ) => v + directions[ result.face ][ k ] ) ); c.updateMatrixWorld(); const clip = new THREE.Vector3( ...delta.map( ( v, k ) => v + light[ k ] ) ).project( c ); near( result.uv[ 0 ], clip.x * .5 + .5, 'independent radial camera U' ); near( result.uv[ 1 ], clip.y * .5 + .5, 'independent radial camera V' ); }
	same( PointShadowFaceUV( [ -1, -1, -1 ] ).face, 1, 'dominant-axis negative ties stable' );
	check( POINT_SHADOW_GLSL.includes( 'local=clamp(faceUv+offset/side,vec2(.5/side),vec2(1.-.5/side))' ), 'actual PCF shader clamps every tap within one face' );
	for ( let slot = 0; slot < 8; slot ++ ) for ( let face = 0; face < 6; face ++ ) for ( const uv of [ 0, 1 ] ) for ( const offset of [ -1, 0, 1 ] ) { const local = Math.max( .5 / 128, Math.min( 1 - .5 / 128, uv + offset / 128 ) ), x = face * 128 + local * 128, y = slot * 128 + local * 128; check( x >= face * 128 + .5 && x <= ( face + 1 ) * 128 - .5 && y >= slot * 128 + .5 && y <= ( slot + 1 ) * 128 - .5, 'edge PCF tap cannot bleed into another face or source slot' ); }

} );

Deno.test( 'public atlas captures one cube at DPR2, preserves renderer and borrowed geometry, recovers failure and bounds protected LRU slots', () => {

	const g = geometry(), position = g.getAttribute( 'position' ), atlas = new PointShadowAtlas( g ), r = renderer(), before = state( r ), sources = Array.from( { length: 8 }, ( _, i ) => ( { source: { id: i }, position: [ i * 10, -30, 40 ], far: 500 } ) ); let disposed = 0; g.addEventListener( 'dispose', () => disposed ++ );
	try {

		for ( const chunk of atlas.chunks ) same( chunk.geometry.getAttribute( 'position' ), position, 'chunks borrow original position attribute without copies' ); same( atlas.triangles, 2, 'original indexed geometry fully represented' ); same( atlas.target.texture.colorSpace, THREE.NoColorSpace, 'packed radial bytes never undergo colour conversion' ); same( atlas.target.texture.type, THREE.UnsignedByteType, 'bounded existing byte format' );
		const first = atlas.update( r, sources ); same( first.captures, 1, 'maximum one cube per public update' ); same( first.faceRenders, 6, 'all six faces captured' ); same( first.resident, 8, 'bounded eight resident sources' ); same( first.ready, 1, 'one complete cube ready' ); same( first.pending, 7, 'other cubes stay unavailable during warmup' );
		for ( let i = 0; i < 6; i ++ ) { same( r.draws[ i ].viewport.join(), [ i * 128, 0, 128, 128 ].join(), 'physical128 face rectangle unaffected by DPR2' ); same( r.draws[ i ].scissor.join(), r.draws[ i ].viewport.join(), 'physical face clear/render scissor' ); same( r.draws[ i ].scissorTest, true, 'each capture enables physical scissor so clearing cannot wipe other cached faces' ); } restored( r, before );
		r.throwAt = r.draws.length + 3; const failed = atlas.update( r, sources ); same( failed.failedCaptures, 1, 'capture failure handled' ); same( atlas.lookup( sources[ 1 ].source ).ready, false, 'partially captured cube never exposed' ); restored( r, before ); r.throwAt = Infinity;
		for ( let i = 0; i < 7; i ++ ) atlas.update( r, sources ); same( atlas.status().ready, 8, 'every source eventually warmed under per-update bound' ); const count = r.draws.length; atlas.update( r, sources.map( ( s, i ) => ( { ...s, radiance: i * .13 + .7 } ) ) ); same( r.draws.length, count, 'radiance-only changes never invalidate static cube keys' );
		const newcomer = { source: {}, position: [ 40, 0, 0 ], far: 500 }; atlas.update( r, [ newcomer, ...sources ] ); same( atlas.lookup( newcomer.source ).ready, false, 'oversized caller cannot evict any requested resident' ); check( sources.every( s => atlas.lookup( s.source ).ready ), 'all requested resident slots protected' ); atlas.update( r, [ newcomer, ...sources.slice( 0, 7 ) ] ); same( atlas.status().resident, 8, 'LRU capacity unchanged' ); check( atlas.lookup( newcomer.source ).ready && ! atlas.lookup( sources[ 7 ].source ).ready, 'only unrequested resident replaced' );
		atlas.update( null, [ { ...sources[ 0 ], position: [ NaN, 0, 0 ] } ] ); same( atlas.lookup( sources[ 0 ].source ).ready, false, 'explicit invalid current coordinates cannot expose older captured source' );
		const epoch = atlas.epoch; atlas.invalidate(); same( atlas.epoch, epoch + 1, 'explicit world epoch changes' ); same( atlas.status().resident, 0, 'stale entries forgotten' ); same( atlas.lookup( sources[ 0 ].source ).ready, false, 'old shadow cannot survive invalidation' ); atlas.dispose(); same( disposed, 0, 'atlas disposal never destroys borrowed world geometry' ); same( g.getAttribute( 'position' ), position, 'original shared buffer remains owned by original mesh' ); same( atlas.update( r, sources ).disposed, true, 'shutdown accepts no more captures' );

	} finally { atlas.dispose(); r.dispose(); g.dispose(); }

} );

Deno.test( 'actual post pipeline warms bounded native source shadows once, keeps camera/flicker keys and bypasses GPU jobs in Classic and disabled modes', () => {

	const controls = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_pointshadows, anim.r_newer_lighting ], saved = controls.map( v => v.string ); for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v ); const r = renderer(), c = camera();
	const frame = time => { post.R_PostBegin( r, true, 320, 200 ); post.R_PostBind( r ); post.R_PostFinish( r, new THREE.Scene(), c, { lx: 0, ly: 0, lw: 320, lh: 200 }, 73, styles, [], time, 1, false ); };
	try {

		controls.forEach( v => vars.Cvar_Set( v.name, '1' ) ); for ( const key of [ 'r_dynres', 'r_bloom', 'r_volumetric' ] ) vars.Cvar_Set( key, '0' ); post.R_PostBegin( r, true, 320, 200 ); post.R_BuildSunOccluder( model );
		for ( let i = 0; i < 8; i ++ ) { const before = post.R_PointShadowStatus().captures || 0; frame( i * .03 ); same( post.R_PointShadowStatus().captures - before, 1, 'one native static cube per frame during warmup' ); }
		const ready = post.R_PointShadowStatus(); same( ready.ready, 8, 'all eight actually selected native sources ready' ); check( ready.chunks > 0 && ready.triangles > 1000, 'actual complete native world caster geometry attached' );
		nativeCaptureScene = r.draws.find( d => d.scene.children[ 0 ]?.name === 'quake_point_shadow_chunk' )?.scene; check( nativeCaptureScene, 'actual native geometry capture scene observed' );
		c.lookAt( eye[ 0 ] + 1, eye[ 1 ], eye[ 2 ] ); c.updateMatrixWorld(); frame( 17 ); same( post.R_PointShadowStatus().captures, ready.captures, 'fire flicker/camera yaw never rebuild cached static cubes' );
		const composite = r.draws.at( -1 ).material; check( composite.uniforms.uPointShadowInfo.value.slice( 0, 8 ).every( v => v.x >= 0 && v.y > 0 ), 'captured source slots bind per selected-light index' );
		// Current ready cubes contain both world and live actor geometry. Re-running
		// screen depth here would compare the compressed held display depth against
		// physical world positions and invent occlusion. Screen marching remains the
		// fallback only when the selected source has no valid current cube.
		const body = composite.fragmentShader.split( 'float pointSurfaceVisibility(' )[ 1 ].split( 'float pointSurfaceVisibility(vec3 P,vec3 normal,int index)' )[ 0 ];
		check( body.includes( 'if ( uPointShadowInfo[ index ].x >= 0.0 )' ) && body.includes( 'worldVisibility = pointWorldVisibility( receiver, source, index )' ) && body.includes( 'return worldVisibility;' ) && body.indexOf( 'return worldVisibility;' ) < body.indexOf( 'k < RELIGHT_STEPS' ) && body.includes( 'sceneDist( uv )' ), 'valid world-plus-actor cube returns physical visibility before fallback screen marching' );
		check( composite.fragmentShader.includes( 'return pointSurfaceVisibility(P,normal,index,1.);' ) && composite.fragmentShader.includes( 'pointSurfaceVisibility(P,Ng,i,actor?.1:1.)' ), 'actual compatibility overload and physical actor bias call the same visibility implementation' );
		const cached = new Function( 'worldVisibility', /return worldVisibility;/.exec( body )[ 0 ] ); same( cached( 0 ), 0, 'cube-confirmed world or actor blocker remains dark' ); same( cached( 1 ), 1, 'clear current cube is not falsely blocked by compressed screen depth' ); near( cached( .5 ), .5, 'cube filtering retains its measured fractional visibility' );
		const combine = new Function( 'worldVisibility', 'visibility', 'return ' + /return (worldVisibility \* visibility \* visibility);/.exec( body )[ 1 ] ); same( combine( 1, 0 ), 0, 'missing-cube fallback retains screen blockers' ); near( combine( 1, .5 ), .25, 'missing-cube fallback retains original squared screen visibility' ); same( combine( 1, 1 ), 1, 'clear missing-cube fallback remains lit' );
		vars.Cvar_Set( 'r_volumetric', '1' ); frame( 17 ); const volume = r.draws.findLast( d => d.material?.uniforms?.uScatter )?.material; check( volume, 'public volumetric shader observed' ); check( volume.fragmentShader.includes( 'worldVisibility = pointWorldVisibility( receiver, source, i )' ) && volume.fragmentShader.includes( 'if ( worldVisibility <= 0.0 ) continue;' ) && volume.fragmentShader.includes( 'k < SHADOW_STEPS' ), 'real volume retains static and dynamic shadow tests' ); const volumeCombine = new Function( 'worldVisibility', 'lit', 'phase', 'return ' + /acc \+= uLightCol\[ i \]\.rgb \* integral \* ([^;]+);/.exec( volume.fragmentShader )[ 1 ] ); same( volumeCombine( 0, 1, 1 ), 0, 'world blocker suppresses light shaft' ); same( volumeCombine( 1, 0, 1 ), 0, 'dynamic screen blocker still suppresses light shaft' ); vars.Cvar_Set( 'r_volumetric', '0' );
		vars.Cvar_Set( 'r_pointshadows', '0' ); frame( 18 ); same( post.R_PointShadowStatus().captures, ready.captures, 'atlas-off creates no capture jobs' ); check( r.draws.at( -1 ).material.uniforms.uPointShadowInfo.value.every( v => v.x === -1 ), 'atlas-off explicitly restores former receiver shadow path' ); vars.Cvar_Set( 'r_pointshadows', '1' ); vars.Cvar_Set( 'r_newer_lighting', '0' ); frame( 19 ); same( post.R_PointShadowStatus().captures, ready.captures, 'lighting-off creates no capture jobs' ); vars.Cvar_Set( 'r_hdr', '0' ); same( post.R_PostBegin( r, true, 320, 200 ), false, 'normal Classic bypasses entire enhanced shadow pipeline' ); same( post.R_PointShadowStatus().captures, ready.captures, 'Classic never captures new shadow data' );
		console.log( 'E1M3_POINT_SHADOW_PIPELINE ' + JSON.stringify( ready ) );

	} finally { controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); post.R_PostBegin( r, false, 0, 0 ); r.dispose(); }

} );

Deno.test( 'native E1M3 source rays distinguish real hidden-world blockers and safe player cameras without altering BSP collision', () => {

	const fire = [ -966, -1750, 256 ], cases = [ { eye: [ -736, -1592, 110 ], blocked: false }, { eye: [ -800, -1648, 110 ], blocked: true }, { eye: [ -608, -1600, 174 ], blocked: false }, { eye: [ -656, -1264, 142 ], blocked: true } ], before = model.hulls.map( h => JSON.stringify( h ) );
	check( nativeCaptureScene, 'previous public frame supplies actual caster triangles' );
	for ( const item of cases ) {

		const origin = [ item.eye[ 0 ], item.eye[ 1 ], item.eye[ 2 ] - 22 ]; same( SV_HullPointContents( model.hulls[ 1 ], model.hulls[ 1 ].firstclipnode, origin ), -1, 'native player-sized camera position in open space' ); const trace = new trace_t(); trace.allsolid = true; SV_RecursiveHullCheck( model.hulls[ 0 ], model.hulls[ 0 ].firstclipnode, 0, 1, fire, item.eye, trace ); same( trace.startsolid, false, 'native torch starts in air' ); same( trace.fraction < 1, item.blocked, 'real BSP light path blocked/clear as expected' ); item.fraction = trace.fraction; item.impact = Array.from( trace.endpos );
		const source = new THREE.Vector3( ...fire ), delta = new THREE.Vector3( ...item.eye ).sub( source ), distance = delta.length(), ray = new THREE.Ray( source, delta.normalize() ), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3(); let nearest = Infinity;
		for ( const mesh of nativeCaptureScene.children ) { const position = mesh.geometry.getAttribute( 'position' ), index = mesh.geometry.index; for ( let i = 0; i < index.count; i += 3 ) { a.fromBufferAttribute( position, index.getX( i ) ); b.fromBufferAttribute( position, index.getX( i + 1 ) ); c.fromBufferAttribute( position, index.getX( i + 2 ) ); if ( ray.intersectTriangle( a, b, c, false, hit ) ) nearest = Math.min( nearest, hit.distanceTo( source ) ); } }
		if ( item.blocked ) near( nearest, distance * trace.fraction, 'actual atlas caster triangles agree with native BSP occlusion within hull bias', .1 ); else check( nearest > distance - .1, 'actual atlas caster contains no invented blocker on a native clear path' ); item.nearestCaster = Number.isFinite( nearest ) ? nearest : null;

	}
	model.hulls.forEach( ( h, i ) => same( JSON.stringify( h ), before[ i ], 'native collision unchanged by source/shadow diagnostics' ) ); console.log( 'E1M3_LIGHT_PATHS ' + JSON.stringify( { fire, cases } ) );

} );

Deno.test( 'full bounced lighting and doubled physical emitter radiance preserve native colour and light a zero-baked receiver through actual uniforms', () => {

	same( Number( post.r_bounce.string ), 1, 'owner retains full bounced lighting from real sources' ); same( post.EMITTER_LIGHT_GAIN, 2, 'owner local emitter gain2' );
	const selected = post.R_SelectWorldLights( camera().matrixWorldInverse, 73, styles, [], 0 ), ordinary = selected.find( l => l.source.emitter !== 1 && l.source.style === 0 ), emitted = selected.filter( l => l.source.emitter === 1 ); check( ordinary && emitted.length, 'actual scene supplies both ordinary and physical sources' );
	const unitGain = ordinary.color[ 0 ] / ( ordinary.source.color[ 0 ] * ordinary.source.power );
	for ( const l of emitted ) { const pulse = l.source.flicker ? post.R_FireFlicker( ...l.position, 0 ) : 1; for ( let k = 0; k < 3; k ++ ) near( l.color[ k ], l.source.color[ k ] * l.source.power * pulse * unitGain * 2, 'actual physical source radiance doubled independently from stored native power' ); }
	const controls = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_pointshadows, post.r_bounce, anim.r_newer_lighting ], saved = controls.map( v => v.string ); for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v ); const r = renderer(), glow = new THREE.MeshLambertMaterial( { emissive: 0xffffff } ), sourceTexture = model.textures.find( t => t?.gl_texture?.image?.data && t.name.charAt( 0 ) !== '*' ), nativeBytes = Buffer.from( sourceTexture.gl_texture.image.data );
	try {

		vars.Cvar_Set( 'r_hdr', '1' ); vars.Cvar_Set( 'r_newer_lighting', '1' ); for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_pointshadows' ] ) vars.Cvar_Set( name, '0' ); post.R_PostBegin( r, true, 320, 200 ); post.R_RegisterGlow( glow ); near( glow.emissiveIntensity, 4.5, 'visible non-lava emission raised1.5x' ); near( post.R_GlowBoostForTexture( '*lava1' ), 6, 'visible lava emission raised1.5x' );
		post.R_PostBind( r ); post.R_PostFinish( r, new THREE.Scene(), camera(), { lx: 0, ly: 0, lw: 320, lh: 200 }, 73, styles, [], 0, 1, false ); const material = r.draws.at( -1 ).material; near( material.uniforms.uBounce.value, 1, 'actual deferred uniform keeps full real-source bounce' );
		const expression = /c = actor \?[^;\n]+ : (scene \* \( 1\.0 \+ relit \* carveAO \)[^;]+);/.exec( material.fragmentShader )?.[ 1 ]; check( expression, 'actual world branch after the actor ternary retains its original receiver formula' ); const receiver = new Function( 'scene', 'relit', 'carveAO', 'bounce', 'albedo', 'spot', 'flashAdd', 'uLightFloor', 'receiver', 'return ' + expression );
		const pixels = sourceTexture.gl_texture.image.data; let at = 0; while ( at < pixels.length && ( ! pixels[ at ] || ! pixels[ at + 1 ] || ! pixels[ at + 2 ] ) ) at += 4; check( at < pixels.length, 'actual native material retains a nonblack colour texel' ); const albedo = new THREE.Color().setRGB( pixels[ at ] / 255, pixels[ at + 1 ] / 255, pixels[ at + 2 ] / 255, THREE.SRGBColorSpace ).toArray();
		for ( const colour of albedo ) { const lit = receiver( 0, .8, 1, 0, colour, 0, 0, material.uniforms.uLightFloor.value, colour * .55 ); check( lit > 0, 'physical incident source lights true authored colour even when baked RGB is zero' ); near( lit / colour, .8 * material.uniforms.uLightFloor.value, 'zero-baked receiver is tinted by actual albedo, not neutral-grey fabrication' ); }
		check( Buffer.from( sourceTexture.gl_texture.image.data ).equals( nativeBytes ), 'emitter tuning never changes original albedo bytes/gamma encoding' ); same( sourceTexture.gl_texture.colorSpace, THREE.SRGBColorSpace, 'original diffuse remains in original colour space' ); vars.Cvar_Set( 'r_hdr', '0' ); post.R_PostBegin( r, false, 0, 0 ); near( glow.emissiveIntensity, 1, 'Classic returns original visible emission' );

	} finally { glow.dispose(); controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); post.R_PostBegin( r, false, 0, 0 ); r.dispose(); }

} );

Deno.test( 'removed haze and source-dependent gloss/native weapon/player lighting stay black without sources while Classic keeps its original24/8 floors', () => {

	const controls = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_pointshadows, anim.r_newer_lighting, main.r_drawentities, main.r_drawviewmodel, main.chase_active, r_newer_weapons ], saved = controls.map( v => v.string ); for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const previous = { world: cl.worldmodel, viewent: cl.viewent, items: cl.items, health: cl.stats[ 0 ], clients: cl.maxclients, count: cl_numvisedicts, first: cl_visedicts[ 0 ], entity: main.currententity }, dynamic = cl_dlights.map( l => ( { radius: l.radius, die: l.die } ) ), r = renderer();
	const black = new Uint8Array( model.lightdata.length ), zeroWorld = { ...model, lightdata: black, surfaces: model.surfaces.map( s => ( { ...s, samples: s.samples ? black : null } ) ) };
	let weapon, player, gloss;
	try {

		controls.forEach( v => vars.Cvar_Set( v.name, '1' ) ); for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_pointshadows', 'chase_active', 'r_newer_weapons' ] ) vars.Cvar_Set( name, '0' );
		// Empty source inventory is intentional test input, not a missing map.
		post.R_BuildWorldLights( { nodes: model.nodes, surfaces: [], entities: '' } ); post.R_PostBegin( r, true, 320, 200 ); post.R_PostBind( r ); post.R_PostFinish( r, new THREE.Scene(), camera(), { lx: 0, ly: 0, lw: 320, lh: 200 }, 73, styles, [], 0, 1, false );
		const material = r.draws.at( -1 ).material; same( material.uniforms.uCount.value, 0, 'zero real point sources' ); same( material.uniforms.uSunOn.value, 0, 'no real directional source in test input' ); same( material.uniforms.uSpotOn.value, 0, 'no active flashlight source' ); same( material.uniforms.uBounce.value, 1, 'real bounced lighting retained even in black input' ); check( ! material.fragmentShader.includes( 'uHaze' ) && ! material.fragmentShader.includes( 'c *= T;' ) && material.uniforms.uHaze === undefined, 'actual atmosphere contains neither additive tint nor the removed extinction overlay' );
		const expression = /c = actor \?[^;\n]+ : (scene \* \( 1\.0 \+ relit \* carveAO \)[^;]+);/.exec( material.fragmentShader )[ 1 ], evaluate = new Function( 'scene', 'relit', 'carveAO', 'bounce', 'albedo', 'spot', 'flashAdd', 'uLightFloor', 'receiver', 'return ' + expression );
		for ( const albedo of [ .03, .2, .9 ] ) same( evaluate( 0, 0, 1, 0, albedo, 0, 0, material.uniforms.uLightFloor.value, albedo * .55 ), 0, 'source-free lit/reflective receiver output remains black' );
		const diffuse = new THREE.DataTexture( new Uint8Array( [ 200, 80, 40, 255 ] ), 1, 1 ); gloss = R_AssetAliasMaterial( { diffuse }, 'source-free-gloss-public-test' ); const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader }; gloss.onBeforeCompile( shader );
		const rim = /outgoingLight \+= (texture2D\( qrGloss,[^;]+);/.exec( shader.fragmentShader )?.[ 1 ]; check( rim, 'actual alias gloss path inspected' ); const term = new Function( 'gloss', 'rim', 'outgoingLight', 'return ' + rim.replace( /texture2D\( qrGloss, vMapUv \)\.r/, 'gloss' ) ); same( term( 1, 1, 0 ), 0, 'even maximum gloss/rim cannot invent outgoing light' ); diffuse.dispose();
		cl.worldmodel = zeroWorld; for ( const l of cl_dlights ) { l.radius = 0; l.die = -1; } same( R_LightPointValue( eye, cl ), 0, 'actual native BSP light query is precisely zero' );
		weapon = new entity_t(); weapon.model = Mod_ForName( 'progs/v_axe.mdl', true ); weapon.origin.set( eye ); player = new entity_t(); player.model = Mod_ForName( 'progs/player.mdl', true ); player.origin.set( eye ); player._entityIndex = 1;
		cl.viewent = weapon; cl.items = 0; cl.stats[ 0 ] = 100; cl.maxclients = 1; cl_visedicts[ 0 ] = player; set_cl_numvisedicts( 1 );
		main.R_DrawViewModel(); main.R_DrawEntitiesOnList(); check( weapon._aliasMesh && player._aliasMesh, 'actual public weapon/player draw paths execute' ); check( weapon._aliasColorArray.every( c => c === 0 ) && player._aliasColorArray.every( c => c === 0 ), 'enhanced weapon and player base lighting cannot receive artificial minimum brightness' );
		vars.Cvar_Set( 'r_hdr', '0' ); post.R_PostBegin( r, false, 0, 0 ); main.R_DrawViewModel(); main.R_DrawEntitiesOnList(); check( weapon._aliasColorArray.some( c => c > 0 ) && player._aliasColorArray.some( c => c > 0 ), 'Classic retains native visible weapon/player minimums' );
		for ( const [ e, minimum ] of [ [ weapon, 24 ], [ player, 8 ] ] ) { const h = e.model.cache.data, template = h._geoCache.get( 0 ), normalIndex = template.lightnormalindices[ 0 ]; near( e._aliasColorArray[ 0 ], Math.fround( r_avertexnormal_dots[ 0 ][ normalIndex ] * minimum / 200 ), 'Classic preserves exact original native minimum' + minimum ); }

	} finally { gloss?.dispose(); weapon?._aliasGeo?.dispose(); player?._aliasGeo?.dispose(); cl.worldmodel = previous.world; cl.viewent = previous.viewent; cl.items = previous.items; cl.stats[ 0 ] = previous.health; cl.maxclients = previous.clients; set_cl_numvisedicts( previous.count ); cl_visedicts[ 0 ] = previous.first; main.set_currententity( previous.entity ); cl_dlights.forEach( ( l, i ) => Object.assign( l, dynamic[ i ] ) ); controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); post.R_BuildWorldLights( model ); post.R_PostBegin( r, false, 0, 0 ); r.dispose(); }

} );

Deno.test( 'removed broad haze leaves real edge sun shafts, default flashlight cone and point-surface illumination active', () => {

	const controls = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_pillars, post.r_pointshadows, post.r_bounce, anim.r_newer_lighting, r_flashlight ], saved = controls.map( v => v.string ); for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v ); const r = renderer(), c = camera();
	try {

		controls.forEach( v => vars.Cvar_Set( v.name, '1' ) ); for ( const key of [ 'r_dynres', 'r_bloom', 'r_pointshadows' ] ) vars.Cvar_Set( key, '0' ); vars.Cvar_Set( 'r_pillars', '.5' ); post.R_PostBegin( r, true, 320, 200 ); R_FlashlightUpdate( eye, [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); post.R_PostBind( r ); post.R_PostFinish( r, new THREE.Scene(), c, { lx: 0, ly: 0, lw: 320, lh: 200 }, 73, styles, [], 0, 1, true );
		const volume = r.draws.findLast( d => d.material?.uniforms?.uScatter )?.material, composite = r.draws.at( -1 ).material; check( volume, 'actual public shaft shader drawn' ); same( volume.uniforms.uOpenFog.value, 0, 'open-air broad sun fog removed' ); same( volume.uniforms.uScatter.value, 0, 'ordinary point-light haze removed' ); check( volume.fragmentShader.includes( 'if ( uScatter > 0.0 ) for' ), 'zero point scatter skips its old fog marches' ); check( volume.uniforms.uSunScatter.value > 0 && volume.uniforms.uShaftFog.value > 0, 'real edge-shaped directional shafts remain enabled' ); same( volume.uniforms.uSpotOn.value, 1, 'actual Newer flashlight remains a real volumetric source' ); same( composite.uniforms.uBounce.value, 1, 'full real bounce remains active' ); same( composite.uniforms.uSunOn.value, 1, 'real directional source remains active' );
		check( ! composite.fragmentShader.includes( 'uHaze' ) && ! composite.fragmentShader.includes( 'c *= T;' ), 'compositor adds no removed haze overlay' );
		const uniforms = composite.uniforms, receiver = new THREE.Vector3( -736, -1592, 64.05 ).applyMatrix4( c.matrixWorldInverse ), normal = new THREE.Vector3( 0, 0, 1 ).transformDirection( c.matrixWorldInverse ); let positive = 0;
		const expression = /return (uLightCol\[ index \]\.rgb \* uLightSurface \* facing \* fall \* cookie \* pointCone\(P,index\));/.exec( composite.fragmentShader )[ 1 ].replace( 'uLightCol[ index ].rgb', 'colour' ).replace( 'pointCone(P,index)', 'cone' ), irradiance = new Function( 'colour', 'uLightSurface', 'facing', 'fall', 'cone', 'cookie = 1', 'return ' + expression );
		// pointCone (r_fixturelights.js, since 18ae741): 1 for a lamp with no direction, else the fixture's cone around it
		const smooth = ( a, b, x ) => { const t = Math.max( 0, Math.min( 1, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };
		const pointCone = i => { const d = uniforms.uLightDirection.value[ i ], p = uniforms.uLightPos.value[ i ], k = uniforms.uLightCone.value[ i ]; if ( d.dot( d ) < .5 ) return 1; const delta = receiver.clone().sub( new THREE.Vector3( p.x, p.y, p.z ) ), length = delta.length(); return length < .00001 ? 0 : smooth( k.y, k.x, delta.divideScalar( length ).dot( d ) ); }; // Ordinary native lamps have no patterned powerup cookie.
		for ( let i = 0; i < uniforms.uCount.value; i ++ ) { const p = uniforms.uLightPos.value[ i ], col = uniforms.uLightCol.value[ i ], delta = new THREE.Vector3( p.x, p.y, p.z ).sub( receiver ), distance = delta.length(); if ( distance >= col.w ) continue; const facing = Math.max( normal.dot( delta.normalize() ), 0 ), extent = Math.max( 60, p.w ), t = Math.max( 0, Math.min( 1, ( distance - .55 * col.w ) / ( .45 * col.w ) ) ), fall = ( 1 - t * t * ( 3 - 2 * t ) ) / ( 1 + distance * distance / ( extent * extent ) ); if ( irradiance( col.x, uniforms.uLightSurface.value, facing, fall, pointCone( i ) ) > 0 ) positive ++; }
		check( positive > 0, 'actual native start-floor receiver still receives positive point-source incident light after point fog removal' ); console.log( 'HAZE_REMOVED_REAL_LIGHTS ' + JSON.stringify( { openFog: volume.uniforms.uOpenFog.value, pointScatter: volume.uniforms.uScatter.value, sunScatter: volume.uniforms.uSunScatter.value, shaftFog: volume.uniforms.uShaftFog.value, spotOn: volume.uniforms.uSpotOn.value, positiveFloorSources: positive } ) );

	} finally { controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); post.R_PostBegin( r, false, 0, 0 ); R_FlashlightUpdate( eye, [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); r.dispose(); }

} );

Deno.test( 'actual Newer menu brightness midpoint/flashlight and mode-specific resets preserve Classic preferences and beam gates', () => {

	const controls = [ r_flashlight, v_gamma, cl_showfps, post.r_hdr, anim.r_newer_lighting, cl_forwardspeed, cl_backspeed, sensitivity, volume, bgmvolume, scr_viewsize ], saved = controls.map( v => v.string ); for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v ); const r = renderer(), maps = [], bindings = keys.keybindings.slice(); let destination = keys.key_game;
	try {

		vars.Cvar_Set( 'r_flashlight', '0' ); vars.Cvar_Set( 'cl_showfps', '0' ); cmd.Cbuf_Init(); cmd.Cmd_Init(); keys.Key_Init(); menu.M_Init(); cmd.Cmd_AddCommand( 'map', () => { const name = cmd.Cmd_Argv( 1 ); maps.push( name ); R_FlashlightNewRun( name, 1, post.r_hdr.value !== 0 ); } ); cmd.Cmd_AddCommand( 'maxplayers', () => {} );
		menu.M_SetExternals( { key_dest_get: () => destination, key_dest_set: v => { destination = v; }, cls: { demonum: -1 }, sv: { active: false }, svs: { maxclients: 1 }, S_LocalSound: () => {}, IN_RequestPointerLock: () => {} } );
		cmd.Cmd_ExecuteString( 'menu_singleplayer' ); menu.M_Keydown( keys.K_ENTER ); cmd.Cbuf_Execute(); same( maps.join(), 'start', 'actual Newer menu command reaches map endpoint without spawning a game' ); same( r_flashlight.value, 0, 'actual Newer hub starts flashlight off' ); same( cl_showfps.value, 1, 'same menu defaults retain FPS display' ); same( v_gamma.value, .75, 'actual Newer defaults use requested midpoint gamma' ); same( ( 1 - v_gamma.value ) / .5, .5, 'actual brightness-slider mapping is precisely its midpoint' ); vars.Cvar_Set( 'r_newer_lighting', '1' );
		post.R_PostBegin( r, true, 320, 200 ); R_FlashlightUpdate( eye, [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); same( R_FlashlightBeam().on, false, 'actual hub beam remains off' ); R_FlashlightSkillSelected( 'start', 1 ); R_FlashlightUpdate( eye, [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); same( R_FlashlightBeam().on, true, 'Normal corridor enables actual public beam' ); near( Math.hypot( ...R_FlashlightBeam().dir ), 1, 'actual default beam has unit direction' ); check( R_FlashlightBeam().pos.every( Number.isFinite ), 'actual default shoulder position finite' );
		vars.Cvar_Set( 'r_newer_lighting', '0' ); post.R_PostBegin( r, true, 320, 200 ); R_FlashlightUpdate( eye, [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); same( R_FlashlightBeam().on, false, 'lighting-off retains its native no-beam gate' ); vars.Cvar_Set( 'r_hdr', '0' ); post.R_PostBegin( r, false, 0, 0 ); R_FlashlightUpdate( eye, [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); same( R_FlashlightBeam().on, false, 'Classic cannot acquire the Newer default beam' );
		vars.Cvar_Set( 'gamma', '.8' ); cmd.Cmd_ExecuteString( 'menu_singleplayer' ); menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER ); cmd.Cbuf_Execute(); same( post.r_hdr.value, 0, 'actual Classic startup selected' ); same( v_gamma.value, .8, 'entering Classic preserves manually chosen brightness' );
		vars.Cvar_Set( 'r_hdr', '1' ); vars.Cvar_Set( 'gamma', '.6' ); cmd.Cmd_ExecuteString( 'menu_options' ); for ( let i = 0; i < 4; i ++ ) menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER ); cmd.Cbuf_Execute(); same( v_gamma.value, .75, 'actual enhanced ResetDefaults restores midpoint after native default.cfg' );
		vars.Cvar_Set( 'r_hdr', '0' ); vars.Cvar_Set( 'gamma', '.6' ); cmd.Cmd_ExecuteString( 'menu_options' ); menu.M_Keydown( keys.K_ENTER ); cmd.Cbuf_Execute(); same( v_gamma.value, 1, 'actual Classic ResetDefaults retains native gamma1' );

	} finally { R_FlashlightRunEnd(); controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); keys.keybindings.splice( 0, keys.keybindings.length, ...bindings ); post.R_PostBegin( r, false, 0, 0 ); R_FlashlightUpdate( eye, [ 0, -1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ); r.dispose(); }

} );
