// A model at the raised triangle limit (MAXALIASTRIS 4096, Quakespasm's, for Arcane Dimensions) meshes whole: the
// command and order buffers are sized from the limit, so its worst case (a strip per triangle) is not cut off past
// WinQuake's fixed 8192 ints, end marker included, and the prepared-mesh cache accepts it (review of card c5dc18e1).
import { GL_MakeAliasModelDisplayLists } from '../src/engine/render/gl_mesh.js';
import { MAXALIASTRIS } from '../src/engine/render/gl_model_types.js';
import { AliasMeshValidate, ALIAS_MESH_MAX_COMMANDS } from '../src/newer/assets/alias_mesh_format.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'a model of MAXALIASTRIS separate triangles keeps every strip and the end marker', () => {

	const n = MAXALIASTRIS, verts = 3 * n;
	const h = { numverts: verts, numtris: n, skinwidth: 64, skinheight: 64, numposes: 1,
		triangles: Array.from( { length: n }, ( _, i ) => ( { facesfront: 1, vertindex: [ 3 * i, 3 * i + 1, 3 * i + 2 ] } ) ),
		stverts: Array.from( { length: verts }, ( _, v ) => ( { onseam: 0, s: v % 64, t: ( v >> 6 ) % 64 } ) ),
		poseverts: [ Array.from( { length: verts }, ( _, v ) => ( { v: [ v & 255, 0, 0 ], lightnormalindex: 0 } ) ) ] };
	GL_MakeAliasModelDisplayLists( { name: 'limit-test' }, h );
	same( h.commands.length, 7 * n + 1, 'a count and three s/t pairs per triangle, then the end marker' );
	same( h.commands.length, ALIAS_MESH_MAX_COMMANDS, 'the worst case is exactly the buffer' );
	same( h.commands[ h.commands.length - 1 ], 0, 'the end marker is there' );
	same( h.meshVertexOrder.length, 3 * n, 'three order entries per triangle' );
	const strips = []; for ( let i = 0; h.commands[ i ] !== 0; i += 1 + 2 * Math.abs( h.commands[ i ] ) ) strips.push( h.commands[ i ] );
	same( strips.length, n, 'every triangle is drawn' );
	AliasMeshValidate( { commands: Array.from( h.commands ), order: Array.from( h.meshVertexOrder ) }, h ); // throws if refused

} );
