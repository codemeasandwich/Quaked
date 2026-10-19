/**
 * @module engine/common/hexen2_bsp
 *
 * Hexen II's eight-hull submodel layout (plan section 5): a level's `dmodel_t` records are 80 bytes each (nine floats,
 * eight headnodes, visleafs and a face range) and carry all eight native hulls, unlike Quake's 64-byte four-hull record.
 * This reads and validates that layout without touching the live renderer, so the existing brush loader's Quake
 * assumption is not silently applied to a Hexen map, and so the model work can be tested against a supplied level.
 *
 * The record order is the shared nine floats (mins, maxs, origin), headnode[0..7], visleafs, firstface, numfaces;
 * hull 0 indexes the node lump, hulls 1..7 index the clipnode lump (the world model's box hulls do too). lumps use the
 * shared BSP29 order: 5 nodes, 9 clipnodes, 10 leafs, 7 faces, 14 models.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: returns `{ ok: false, reason }` for a malformed or unsupported level; never throws for file content.
 */

export const HEXEN2_BSP_VERSION = 29;
export const HEXEN2_DMODEL_BYTES = 80;
export const HEXEN2_MAX_MAP_HULLS = 8;
export const HEXEN2_MAX_SUBMODELS = 256;

const LUMP_MODELS = 14, LUMP_NODES = 5, LUMP_CLIPNODES = 9, LUMP_LEAFS = 10, LUMP_FACES = 7;
const NODE_BYTES = 24, CLIPNODE_BYTES = 8, LEAF_BYTES = 28, FACE_BYTES = 20;
const HEADER_BYTES = 4 + 15 * 8;

function bytesOf( data ) {

	if ( data instanceof ArrayBuffer ) return new Uint8Array( data );
	if ( ArrayBuffer.isView( data ) ) return new Uint8Array( data.buffer, data.byteOffset, data.byteLength );
	return null;

}

function lump( view, index, size ) {

	const ofs = view.getInt32( 4 + index * 8, true ), len = view.getInt32( 8 + index * 8, true );
	if ( ofs < 0 || len < 0 || ofs + len > size ) return null;
	return { ofs, len };

}

function finite( value ) { return Number.isFinite( value ); }

/**
 * Reads and validates a Hexen II level's submodels.
 *
 * @param {ArrayBuffer|Uint8Array} data the whole BSP file
 * @returns {{ ok: true, version: number, count: number, models: ReadonlyArray<object> } |
 *   { ok: false, reason: string }} the eight-hull models, or why the level is not a supported Hexen map
 */
export function Hexen2_ReadSubmodels( data ) {

	const bytes = bytesOf( data );
	if ( bytes === null ) return { ok: false, reason: 'BSP bytes are required' };
	if ( bytes.byteLength < HEADER_BYTES ) return { ok: false, reason: 'the BSP is shorter than its header' };
	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	const version = view.getInt32( 0, true );
	if ( version !== HEXEN2_BSP_VERSION ) return { ok: false, reason: `BSP version ${version}, not ${HEXEN2_BSP_VERSION}` };

	const modelsLump = lump( view, LUMP_MODELS, bytes.byteLength );
	if ( modelsLump === null ) return { ok: false, reason: 'the models lump runs past the file' };
	if ( modelsLump.len % HEXEN2_DMODEL_BYTES !== 0 )
		return { ok: false, reason: `the submodel lump is ${modelsLump.len} bytes, not eight-hull ${HEXEN2_DMODEL_BYTES}-byte records` };
	const count = modelsLump.len / HEXEN2_DMODEL_BYTES;
	if ( count < 1 ) return { ok: false, reason: 'the level has no world model' };
	if ( count > HEXEN2_MAX_SUBMODELS ) return { ok: false, reason: `the level has ${count} submodels, beyond ${HEXEN2_MAX_SUBMODELS}` };

	const nodes = lump( view, LUMP_NODES, bytes.byteLength ), clipnodes = lump( view, LUMP_CLIPNODES, bytes.byteLength );
	const leafs = lump( view, LUMP_LEAFS, bytes.byteLength ), faces = lump( view, LUMP_FACES, bytes.byteLength );
	if ( nodes === null || clipnodes === null || leafs === null || faces === null )
		return { ok: false, reason: 'a BSP lump runs past the file' };
	const nodeCount = Math.floor( nodes.len / NODE_BYTES ), clipnodeCount = Math.floor( clipnodes.len / CLIPNODE_BYTES );
	const leafCount = Math.floor( leafs.len / LEAF_BYTES ), faceCount = Math.floor( faces.len / FACE_BYTES );

	const models = [];
	for ( let i = 0; i < count; i ++ ) {

		const base = modelsLump.ofs + i * HEXEN2_DMODEL_BYTES;
		const mins = [ 0, 1, 2 ].map( j => view.getFloat32( base + j * 4, true ) );
		const maxs = [ 0, 1, 2 ].map( j => view.getFloat32( base + 12 + j * 4, true ) );
		const origin = [ 0, 1, 2 ].map( j => view.getFloat32( base + 24 + j * 4, true ) );
		for ( const value of [ ...mins, ...maxs, ...origin ] )
			if ( ! finite( value ) ) return { ok: false, reason: `submodel ${i} has a non-finite bound` };
		for ( let j = 0; j < 3; j ++ )
			if ( mins[ j ] > maxs[ j ] ) return { ok: false, reason: `submodel ${i} has mins above maxs on axis ${j}` };

		const headnode = Array.from( { length: HEXEN2_MAX_MAP_HULLS }, ( _, j ) => view.getInt32( base + 36 + j * 4, true ) );
		if ( headnode[ 0 ] < 0 || headnode[ 0 ] >= nodeCount )
			return { ok: false, reason: `submodel ${i} hull 0 headnode ${headnode[ 0 ]} is outside the ${nodeCount} nodes` };
		for ( let j = 1; j < HEXEN2_MAX_MAP_HULLS; j ++ )
			if ( headnode[ j ] < 0 || headnode[ j ] >= clipnodeCount )
				return { ok: false, reason: `submodel ${i} hull ${j} headnode ${headnode[ j ]} is outside the ${clipnodeCount} clipnodes` };

		const visleafs = view.getInt32( base + 68, true );
		const firstface = view.getInt32( base + 72, true );
		const numfaces = view.getInt32( base + 76, true );
		if ( visleafs < 0 || visleafs > leafCount ) return { ok: false, reason: `submodel ${i} has ${visleafs} visible leafs beyond the ${leafCount} leafs` };
		if ( firstface < 0 || numfaces < 0 || firstface + numfaces > faceCount )
			return { ok: false, reason: `submodel ${i} faces ${firstface}+${numfaces} run beyond the ${faceCount} faces` };

		models.push( Object.freeze( { mins: Object.freeze( mins ), maxs: Object.freeze( maxs ), origin: Object.freeze( origin ),
			headnode: Object.freeze( headnode ), visleafs, firstface, numfaces } ) );

	}

	return { ok: true, version, count, models: Object.freeze( models ) };

}
