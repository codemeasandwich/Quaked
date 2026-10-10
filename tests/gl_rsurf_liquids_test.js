// The world renderer's liquids stage on its own (card [44i]): a liquid's warped geometry (built once, its texture
// coordinates moving with time) and its mesh's life (kept on the surface, shown while drawn, taken out the frame it
// is not, thrown away at a map load). Through the public interface of gl_rsurf_liquids.js.
import * as THREE from 'three';
import * as liquids from '../src/engine/render/gl_rsurf_liquids.js';
import { R_EnsureWorldGroup } from '../src/engine/render/gl_rsurf_state.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const square = () => ( { texinfo: { texture: { name: '*water1' } }, polys: { numverts: 4, next: null, verts: new Float32Array( [ 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 64, 0, 0, 0, 64, 64, 0, 64, 64, 0, 0, 0, 64, 0, 0, 64, 0, 0 ] ) } } );

Deno.test( 'a liquid\'s geometry is built once; only its texture coordinates move with time', () => {
	const s = square();
	const at0 = liquids.EmitWaterPolysQuake( s, 0 ), uv0 = Array.from( at0.attributes.uv.array ), pos0 = Array.from( at0.attributes.position.array );
	const at1 = liquids.EmitWaterPolysQuake( s, 0.5 ), uv1 = Array.from( at1.attributes.uv.array );
	check( at1 === at0, 'the same geometry object' );
	check( at0.index.count === 6 && pos0.length === 12, 'two triangles over four vertices' );
	check( Array.from( at1.attributes.position.array ).join() === pos0.join(), 'the positions stay' );
	check( uv1.join() !== uv0.join(), 'the warp moves the texture coordinates' );
	check( uv0.every( ( v, i ) => Math.abs( v - [ 0, 0, 1, 0, 1, 1, 0, 1 ][ i ] ) <= 8 / 64 + 1e-6 ), 'within the warp\'s 8 units of the texture\'s own (1/64 a unit)' );
	check( liquids.EmitWaterPolysQuake( { polys: null }, 0 ) === null, 'null for a surface without vertices' );
} );

Deno.test( 'a liquid\'s mesh is kept on its surface, shown while drawn, taken out when not, dropped at a map load', () => {
	const group = R_EnsureWorldGroup(), s = square(), material = new THREE.MeshBasicMaterial();
	const geometry = liquids.EmitWaterPolysQuake( s, 0 );
	liquids.R_LiquidsBeginFrame();
	const mesh = liquids._getWaterMesh( s, geometry, material, group );
	check( mesh.parent === group && s._waterMesh === mesh && mesh.userData.quakeLiquid === s.texinfo.texture, 'in the group, kept on the surface' );
	check( liquids._getWaterMesh( s, geometry, material, group ) === mesh, 'the same mesh when drawn again' );
	liquids.R_CleanupWaterMeshes();
	check( mesh.parent === group, 'drawn this frame: stays' );
	liquids.R_LiquidsBeginFrame(); liquids.R_CleanupWaterMeshes();
	check( mesh.parent === null && s._waterMesh === mesh, 'not drawn: out of the group, still cached' );
	liquids.R_LiquidsBeginFrame(); liquids._getWaterMesh( s, geometry, material, group );
	check( mesh.parent === group, 'back when drawn again' );
	liquids.R_LiquidsClear();
	check( mesh.parent === null, 'a map load takes it out' );
} );
