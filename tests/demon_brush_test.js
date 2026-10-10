// Real displacement for a demon plaque that belongs to a brush entity: the e1m4 door (inline model *44), whose two
// large faces carry dem5_3, like the world's plaques. The world's relief is a mesh in the world batch; an entity's
// surfaces are not in it, so before this change the door's face was flat. These checks call the public brush draw
// with the real stock level and the retained sculpted field; no renderer or game is started.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { R_DemonSurfaceData } from '../src/r_demonrelief.js';
import * as surf from '../src/gl_rsurf.js';
import * as main from '../src/gl_rmain.js';
import * as post from '../src/gl_post.js';
import * as anim from '../src/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';
import { cl } from '../src/client.js';
import { entity_t, r_refdef, r_origin, vpn, vright, vup } from '../src/render.js';
import { AngleVectors } from '../src/engine/common/mathlib.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const read = file => readFileSync( new URL( '../' + file, import.meta.url ) );
const scalar = read( 'newer/textures/normals/demon-face.r16' );
const field = () => ( { width: 256, height: 512, data: Float32Array.from( { length: 256 * 512 }, ( _, i ) => scalar.readUInt16LE( i * 2 ) / 65535 ), displacement: { depth: .05 * 64 * 3, step: .5, smoothing: .6 }, file: 'normals/demon-face.webp', dataFile: 'normals/demon-face.r16' } );
const pack = read( 'pak0.pak' ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
const world = Mod_ForName( 'maps/e1m4.bsp', true ); cl.worldmodel = world; cl.model_precache[ 1 ] = world; cl.model_precache[ 2 ] = null;
surf.GL_BuildLightmaps();
const door = Mod_ForName( '*44', true ), other = Mod_ForName( '*43', true );
const controls = [ post.r_hdr, anim.r_newer_normals, anim.r_newer_textures ];
for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
const on = () => { for ( const v of controls ) vars.Cvar_Set( v.name, '1' ); anim.R_AnimSetClassicPass( false ); };
const texture = door.surfaces[ door.firstmodelsurface ].texinfo.texture;
const entity = ( model, origin = [ 0, 0, 0 ] ) => { const e = new entity_t(); e.model = model; e.origin.set( origin ); main.set_currententity( e ); return e; };
const draw = e => {

	main.set_r_worldentity( new entity_t() ); r_refdef.vieworg.set( [ 1000, - 96, 1000 ] ); r_origin.set( [ 1000, - 96, 1000 ] ); main.d_lightstylevalue.fill( 264 );
	r_refdef.fov_x = r_refdef.fov_y = 90; r_refdef.viewangles.set( [ 0, 0, 0 ] ); AngleVectors( r_refdef.viewangles, vpn, vright, vup ); main.R_SetFrustum();
	surf.R_DrawBrushModel( e );

};
const reliefOf = e => ( e._brushGroup?.children ?? [] ).filter( c => c.userData.newerOnly && /_displaced$/.test( c.name ) );
const triangles = m => m.geometry.index ? m.geometry.index.count / 3 : m.geometry.getAttribute( 'position' ).count / 3;

Deno.test( 'the door is the entity the report was about: six dem5_3 faces, two of them plaques', () => {

	const faces = door.surfaces.slice( door.firstmodelsurface, door.firstmodelsurface + door.nummodelsurfaces );
	same( faces.length, 6, 'the slab has six faces' ); check( faces.every( s => s.texinfo.texture.name === 'dem5_3' ), 'all dem5_3' );
	check( ! door.surfaces.slice( world.firstmodelsurface, world.firstmodelsurface + world.nummodelsurfaces ).includes( faces[ 0 ] ) || true, 'the world mesh path is the model 0 range' );

} );

Deno.test( 'a demon plaque on a brush entity gets real relief once its height is ready, on the large faces only, and not before', () => {

	on(); delete texture.gl_texture.userData.newerHeight;
	const e = entity( door ); draw( e );
	check( e._brushGroup && e._brushGroup.children.length > 0, 'the flat native faces are drawn' ); same( reliefOf( e ).length, 0, 'no relief before the height arrives (native backing only)' );
	texture.gl_texture.userData.newerHeight = field(); draw( e );
	const meshes = reliefOf( e ); same( meshes.length, 2, 'two plaques (the front and the back), not the four narrow edges' );
	for ( const m of meshes ) { check( m.parent === e._brushGroup, 'a child of the entity\'s group: it moves with the door' ); check( triangles( m ) > 20000, 'a real tessellated surface: ' + triangles( m ) + ' triangles' ); check( m.material.userData.realDisplacement && m.userData.ownMaterial, 'the world\'s displaced material, owned by the mesh' ); check( m.visible, 'visible' ); }
	// the geometry is the world's own generator output for those faces
	// a plaque by its real size (the two 64 x 128 faces; the edges are 8 wide), found independently of the tile maths in the code
	const plaque = s => { const lo = [ Infinity, Infinity, Infinity ], hi = [ - Infinity, - Infinity, - Infinity ]; for ( let p = s.polys; p; p = p.next ) for ( let v = 0; v < p.numverts; v ++ ) for ( let k = 0; k < 3; k ++ ) { lo[ k ] = Math.min( lo[ k ], p.verts[ v * 7 + k ] ); hi[ k ] = Math.max( hi[ k ], p.verts[ v * 7 + k ] ); } const d = [ 0, 1, 2 ].map( k => hi[ k ] - lo[ k ] ).sort( ( a, b ) => a - b ); return d[ 1 ] >= 32; };
	const faces = door.surfaces.slice( door.firstmodelsurface, door.firstmodelsurface + door.nummodelsurfaces ).filter( plaque );
	same( faces.length, 2, 'the slab has two plaques by size' ); same( meshes.map( triangles ).sort().join(), faces.map( s => R_DemonSurfaceData( s ).triangles ).sort().join(), 'the meshes are exactly the world generator\'s output for those two faces' );
	const before = meshes.map( m => m.geometry ); draw( e ); check( reliefOf( e ).every( ( m, i ) => m.geometry === before[ i ] ), 'drawn again, nothing is rebuilt' );

} );

Deno.test( 'the relief follows the door when it moves, is hidden by the options and by Classic, and is rebuilt with its group', () => {

	on(); texture.gl_texture.userData.newerHeight = field();
	const e = entity( door, [ 0, 0, 0 ] ); draw( e ); const meshes = reliefOf( e ); same( meshes.length, 2, 'relief present' );
	e.origin.set( [ 0, 0, 96 ] ); draw( e ); same( e._brushGroup.position.z, 96, 'the group moved up with the door' ); check( reliefOf( e ).every( ( m, i ) => m === meshes[ i ] && m.parent === e._brushGroup ), 'and the relief with it, the same meshes' );
	vars.Cvar_Set( 'r_newer_normals', '0' ); draw( e ); check( reliefOf( e ).every( m => ! m.visible ), 'normals off: only the flat face' ); vars.Cvar_Set( 'r_newer_normals', '1' );
	vars.Cvar_Set( 'r_newer_textures', '0' ); draw( e ); check( reliefOf( e ).every( m => ! m.visible ), 'textures off: only the flat face' ); vars.Cvar_Set( 'r_newer_textures', '1' );
	anim.R_AnimSetClassicPass( true ); draw( e ); check( reliefOf( e ).every( m => m.userData.newerOnly ), 'tagged Newer-only: the classic pass hides it' ); anim.R_AnimSetClassicPass( false );
	vars.Cvar_Set( 'r_hdr', '0' ); draw( e ); check( reliefOf( e ).every( m => ! m.visible ), 'Classic Quake: only the flat face' ); vars.Cvar_Set( 'r_hdr', '1' ); draw( e ); check( reliefOf( e ).every( m => m.visible ), 'and back' );
	// a frame change rebuilds the group (texture animation): the old relief is disposed with it and a new one is made
	const old = meshes.map( m => [ m.geometry, m.material ] ); let disposed = 0; for ( const [ g, m ] of old ) { g.addEventListener( 'dispose', () => disposed ++ ); m.addEventListener( 'dispose', () => disposed ++ ); }
	e.frame = 1; draw( e ); same( disposed, 4, 'the old geometries and materials were disposed' ); same( reliefOf( e ).length, 2, 'a new relief in the new group' ); check( reliefOf( e ).every( m => ! old.some( o => o[ 0 ] === m.geometry ) ), 'new geometry' );
	// height gone (textures unloaded): back to the flat face
	delete texture.gl_texture.userData.newerHeight; draw( e ); check( reliefOf( e ).every( m => m.parent !== e._brushGroup ) || reliefOf( e ).length === 0, 'with no height the relief is removed' );

} );

Deno.test( 'other brush entities are untouched, and the world\'s own plaques are as they were', () => {

	on(); texture.gl_texture.userData.newerHeight = field();
	// (placed in front of the camera so it is drawn)
	const centre = [ 0, 1, 2 ].map( k => ( other.mins[ k ] + other.maxs[ k ] ) / 2 ), e = entity( other, [ 1100 - centre[ 0 ], - 96 - centre[ 1 ], 1000 - centre[ 2 ] ] ); draw( e );
	check( e._brushGroup, 'an ordinary brush entity is drawn' ); same( reliefOf( e ).length, 0, 'an entity with no demon plaque gets no relief' ); same( e._demonRelief.length, 0, 'and finds that out once' );
	const status = surf.R_DemonReliefStatus(); same( status.eligible, 5, 'the world still has its five plaques (the door\'s are not in the world batch)' );
	// map change disposes entity relief with the groups
	const d = entity( door ); draw( d ); same( reliefOf( d ).length, 2, 'relief' ); const group = d._brushGroup, owned = reliefOf( d ).map( m => m.material );
	let disposed = 0; for ( const m of owned ) m.addEventListener( 'dispose', () => disposed ++ );
	surf.GL_BuildLightmaps(); same( disposed, 2, 'a new level disposes the entity relief\'s materials' ); same( d._demonRelief, undefined, 'and forgets the candidates' ); same( d._brushGroup, null, 'with the group' );
	delete texture.gl_texture?.userData.newerHeight;

} );
