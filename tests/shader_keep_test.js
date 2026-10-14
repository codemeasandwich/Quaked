// Shader programs compiled once stay compiled, and each level's warm-up reaches the effects, particles and brush
// models built on first use (docs/demo-performance-2026-10-14.md): r_shaderwarm.js R_KeepPrograms,
// R_DisposeKeepingShader, R_ShaderWarmRegister/Objects/Scenes; r_part.js R_ParticleWarmObject; gl_rsurf_brush.js
// R_BrushModelWarmGroup. The first test pins the three.js behaviour these rely on, so an upgrade that changes it fails
// here rather than silently bringing the stalls back.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { memberSearch, readMember, isolatedPack } from '../tools/pak_members.mjs';
import { COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { GL_BuildLightmaps, R_BrushModelWarmGroup, R_BrushModelWarmDispose } from '../src/engine/render/gl_rsurf.js';
import { cl } from '../src/engine/client/client.js';
import { R_InitParticles, R_ParticleWarmObject } from '../src/engine/render/r_part.js';
import { KEEP_PROGRAMS_MAX, R_DisposeKeepingShader, R_KeepPrograms, R_ShaderWarmObjects, R_ShaderWarmRegister, R_ShaderWarmRegisterScene, R_ShaderWarmScenes } from '../src/newer/render/r_shaderwarm.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} !== ${b}` );

Deno.test( 'three still frees a program at its last use and renumbers a shader text once no material holds it', () => {

	const source = readFileSync( new URL( '../node_modules/three/build/three.module.js', import.meta.url ), 'utf8' );
	check( /function releaseProgram\( program \) \{\s*if \( -- program\.usedTimes === 0 \)/.test( source ), 'releaseProgram frees at usedTimes 0 (R_KeepPrograms counts one more use)' );
	check( /shaderStage\.usedTimes --;\s*if \( shaderStage\.usedTimes === 0 \) this\.shaderCache\.delete\( shaderStage\.code \);/.test( source ), 'a shader text loses its number with its last material (R_DisposeKeepingShader keeps one)' );
	check( /array\.push\( parameters\.customVertexShaderID \);\s*array\.push\( parameters\.customFragmentShaderID \);/.test( source ), 'the shader text numbers are part of a ShaderMaterial program\'s key' );
	check( /const materials = new Set\(\);\s*scene\.traverse\( function \( object \) \{/.test( source ), 'compile prepares every mesh\'s material, in view or not (so the level\'s surfaces out of view are warmed with it)' );

} );

Deno.test( 'every compiled program is kept once, up to the cap, and survives three\'s release of its last material', () => {

	// three's own release rule, as above
	const programs = [], destroyed = [];
	const release = p => { if ( -- p.usedTimes === 0 ) { programs.splice( programs.indexOf( p ), 1 ); destroyed.push( p ); } };
	const renderer = { info: { programs } };
	const a = { usedTimes: 1, id: 'a' }, b = { usedTimes: 2, id: 'b' };
	programs.push( a, b );
	same( R_KeepPrograms( renderer ) >= 2, true, 'both kept' );
	same( a.usedTimes, 2, 'a counted once more' ); same( b.usedTimes, 3, 'b counted once more' );
	R_KeepPrograms( renderer ); R_KeepPrograms( renderer );
	same( a.usedTimes, 2, 'kept once only, however often asked' );
	release( a ); same( destroyed.length, 0, 'the last material going leaves the program compiled' );
	same( programs.includes( a ), true, 'still in three\'s list for the next material with that shader' );
	same( R_KeepPrograms( null ), R_KeepPrograms( { info: {} } ), 'no renderer, nothing done' );
	// the cap: past it three frees programs as before
	const many = Array.from( { length: KEEP_PROGRAMS_MAX + 10 }, ( _, i ) => ( { usedTimes: 1, id: i } ) );
	programs.push( ...many );
	same( R_KeepPrograms( renderer ), KEEP_PROGRAMS_MAX, 'at most KEEP_PROGRAMS_MAX kept' );
	const unkept = many.filter( p => p.usedTimes === 1 );
	check( unkept.length >= 10, 'the rest are not kept: ' + unkept.length );
	release( unkept[ 0 ] ); same( destroyed.includes( unkept[ 0 ] ), true, 'an unkept program is freed at its last use' );

} );

Deno.test( 'the first ShaderMaterial of each shader text is kept undisposed; others, and other materials, are disposed', () => {

	const disposed = new Set(), watch = m => { m.addEventListener( 'dispose', () => disposed.add( m ) ); return m; };
	const text = ( v, f ) => watch( new THREE.ShaderMaterial( { vertexShader: v, fragmentShader: f } ) );
	const first = text( 'void main(){gl_Position=vec4(0.);}', 'void main(){}/*keep-a*/' ), second = text( 'void main(){gl_Position=vec4(0.);}', 'void main(){}/*keep-a*/' );
	const other = text( 'void main(){gl_Position=vec4(0.);}', 'void main(){}/*keep-b*/' ), basic = watch( new THREE.MeshBasicMaterial() );
	same( R_DisposeKeepingShader( first ), true, 'first of its text kept' ); same( disposed.has( first ), false, 'and not disposed' );
	same( R_DisposeKeepingShader( second ), false, 'a second with the same text' ); same( disposed.has( second ), true, 'is disposed' );
	same( R_DisposeKeepingShader( other ), true, 'another text has its own keeper' );
	same( R_DisposeKeepingShader( basic ), false, 'not a ShaderMaterial' ); same( disposed.has( basic ), true, 'disposed as before' );
	same( R_DisposeKeepingShader( first ), true, 'the keeper asked again stays kept' ); same( disposed.has( first ), false, 'never disposed' );
	same( R_DisposeKeepingShader( null ), false, 'nothing to let go' );

} );

Deno.test( 'registered effects give stand-ins with their own geometry and material, and their own meshes stay where they were', () => {

	const scene = new THREE.Scene(), group = new THREE.Group(), material = new THREE.MeshBasicMaterial(), geometry = new THREE.BufferGeometry();
	const mesh = new THREE.Mesh( geometry, material ), points = new THREE.Points( geometry, new THREE.PointsMaterial() );
	mesh.visible = false; group.visible = false; group.add( mesh, points, new THREE.Object3D() ); scene.add( group );
	let built = 0;
	R_ShaderWarmRegister( 'test effect', () => { built ++; return group; } );
	R_ShaderWarmRegister( 'test broken', () => { throw new Error( 'cannot build' ); } );
	R_ShaderWarmRegister( 'test off', () => null );
	const warn = console.warn; let warned = ''; console.warn = m => { warned += m; };
	let out; try { out = R_ShaderWarmObjects().filter( o => o.name.startsWith( 'warm:' ) && ( o.geometry === geometry ) ); } finally { console.warn = warn; }
	same( built, 1, 'built once' ); check( warned.includes( 'test broken' ), 'a provider that throws is reported and skipped' );
	same( out.length, 2, 'a stand-in per Mesh and Points' );
	const m = out.find( o => o.isMesh && ! o.isPoints ), p = out.find( o => o.isPoints );
	same( m.material, material, 'the mesh stand-in has the effect\'s material' ); same( p.material, points.material, 'and the points\'' );
	check( m.visible && p.visible && m.parent === null && p.parent === null && m.frustumCulled === false, 'stand-ins visible, parentless, never culled' );
	same( mesh.parent, group, 'the effect\'s mesh keeps its parent' ); same( mesh.visible, false, 'and its visibility' ); same( group.parent, scene, 'the group stays in its scene' );
	const own = { scene: new THREE.Scene(), camera: new THREE.OrthographicCamera() };
	R_ShaderWarmRegisterScene( 'test pass', () => [ own ] );
	check( R_ShaderWarmScenes().includes( own ), 'a pass\'s own scene is offered for compiling' );

} );

Deno.test( 'the particles\' points mesh is made once for the warm-up, the same one their first draw uses', () => {

	same( R_ParticleWarmObject(), null, 'nothing before the particle texture exists' );
	R_InitParticles();
	const points = R_ParticleWarmObject();
	check( points?.isPoints && points.material?.isPointsMaterial, 'points with the particle material' );
	same( R_ParticleWarmObject(), points, 'made once' ); same( points.parent, null, 'not put in a scene' );

} );

Deno.test( 'a brush model\'s warm group is built from the shared materials and lets go of only its own geometry', async () => {

	const entries = await memberSearch( [ new URL( '../games/shareware/pak0.pak', import.meta.url ).pathname ] );
	COM_AddPack( isolatedPack( 'gfx/palette.lmp', await readMember( entries.get( 'gfx/palette.lmp' ) ) ) );
	COM_AddPack( isolatedPack( 'maps/b_shell0.bsp', await readMember( entries.get( 'maps/b_shell0.bsp' ) ) ) );
	VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); vid.fullbright = 224; Mod_Init();
	const box = Mod_ForName( 'maps/b_shell0.bsp', true );
	cl.worldmodel = box; cl.model_precache[ 1 ] = box; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();
	const a = R_BrushModelWarmGroup( box ), b = R_BrushModelWarmGroup( box );
	check( a && a.children.length > 0, 'the ammo box has meshes' );
	same( a.children.length, b.children.length, 'the same meshes each time' );
	for ( let i = 0; i < a.children.length; i ++ ) {

		same( a.children[ i ].material, b.children[ i ].material, 'shared material ' + i + ' (the cache its first draw uses)' );
		check( a.children[ i ].geometry !== b.children[ i ].geometry, 'its own geometry' );

	}
	same( box._brushGroup, undefined, 'nothing cached on the model' );
	const disposed = { geometry: 0, material: 0 };
	for ( const c of a.children ) { c.geometry.addEventListener( 'dispose', () => disposed.geometry ++ ); c.material.addEventListener( 'dispose', () => disposed.material ++ ); }
	R_BrushModelWarmDispose( a );
	same( disposed.geometry, a.children.length, 'its geometries let go' ); same( disposed.material, 0, 'its shared materials kept' );
	same( R_BrushModelWarmGroup( null ), null, 'no model, no group' );
	R_BrushModelWarmDispose( b ); R_BrushModelWarmDispose( null );

} );
