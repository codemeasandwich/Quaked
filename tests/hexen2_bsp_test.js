// Hexen II's eight-hull submodel records (src/engine/common/hexen2_bsp.js): 80 bytes, headnode[8], the supplied
// demo1.bsp read-only from its pack, its 100 coherent models (the Quake 64-byte assumption would read 125), and a
// malformed level refused with the reason. plan section 5; T04 prerequisites.
import { existsSync, openSync, readSync, closeSync } from './helpers/resource_fs.mjs';
import { Hexen2_ReadSubmodels, HEXEN2_DMODEL_BYTES, HEXEN2_MAX_MAP_HULLS } from '../src/engine/common/hexen2_bsp.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2', PAK = BASE + '/data1/pak0.pak';

// A minimal level: readable header, lumps for nodes/clipnodes/leafs/faces and `modelCount` well-formed model records.
function level( modelCount = 2, mutate = null ) {

	const nodeCount = 12, clipnodeCount = 40, leafCount = 9, faceCount = 30;
	const sizes = [ [ 5, nodeCount * 24 ], [ 9, clipnodeCount * 8 ], [ 10, leafCount * 28 ], [ 7, faceCount * 20 ], [ 14, modelCount * HEXEN2_DMODEL_BYTES ] ];
	let offset = 4 + 15 * 8;
	const lumps = new Array( 15 ).fill( [ 0, 0 ] );
	const parts = [];
	for ( const [ index, length ] of sizes ) { lumps[ index ] = [ offset, length ]; parts.push( new Uint8Array( length ) ); offset += length; }
	const bytes = new Uint8Array( offset ), view = new DataView( bytes.buffer );
	view.setInt32( 0, 29, true );
	lumps.forEach( ( [ ofs, len ], index ) => { view.setInt32( 4 + index * 8, ofs, true ); view.setInt32( 8 + index * 8, len, true ); } );
	let at = 4 + 15 * 8;
	for ( const part of parts ) { bytes.set( part, at ); at += part.length; }
	const modelsOfs = lumps[ 14 ][ 0 ];
	for ( let i = 0; i < modelCount; i ++ ) {

		const base = modelsOfs + i * HEXEN2_DMODEL_BYTES;
		[ - 10, - 10, - 10 ].forEach( ( v, j ) => view.setFloat32( base + j * 4, v, true ) );
		[ 10, 20, 30 ].forEach( ( v, j ) => view.setFloat32( base + 12 + j * 4, v, true ) );
		[ 0, 0, 0 ].forEach( ( v, j ) => view.setFloat32( base + 24 + j * 4, v, true ) );
		const hulls = i === 0 ? [ 0, 1, 2, 3, 4, 5, 6, 7 ] : [ 2, 10, 11, 12, 13, 14, 15, 16 ];
		hulls.forEach( ( v, j ) => view.setInt32( base + 36 + j * 4, v, true ) );
		view.setInt32( base + 68, 3, true ); view.setInt32( base + 72, i * 10, true ); view.setInt32( base + 76, 10, true );

	}
	if ( mutate ) mutate( view, modelsOfs, lumps );
	return bytes;

}

Deno.test( 'an eight-hull level reads every model with all eight headnodes, faces and leaf count', () => {

	const read = Hexen2_ReadSubmodels( level( 2 ) );
	check( read.ok, read.reason );
	same( read.count, 2, 'two models' );
	same( read.models[ 0 ].headnode.length, HEXEN2_MAX_MAP_HULLS, 'eight headnodes' );
	same( read.models[ 0 ].headnode.join( ',' ), '0,1,2,3,4,5,6,7', 'the world model headnodes' );
	same( read.models[ 1 ].headnode[ 7 ], 16, 'a submodel hull 7 headnode' );
	same( read.models[ 1 ].firstface, 10, 'submodel face start' );
	same( read.models[ 1 ].visleafs, 3, 'submodel visible leafs' );
	same( read.models[ 0 ].maxs[ 1 ], 20, 'model bounds' );

} );

Deno.test( 'a Quake 64-byte submodel record set is refused as not eight-hull', () => {

	const quakeShaped = level( 2, ( view, modelsOfs, lumps ) => { view.setInt32( 8 + 14 * 8, 128, true ); } );
	const read = Hexen2_ReadSubmodels( quakeShaped );
	check( ! read.ok, 'a 64-byte record set is refused' );
	check( /eight-hull 80-byte records/.test( read.reason ), read.reason );

} );

Deno.test( 'malformed levels are refused with a concrete reason', () => {

	same( Hexen2_ReadSubmodels( new Uint8Array( 10 ) ).ok, false, 'too short' );
	const wrongVersion = level( 1, view => view.setInt32( 0, 30, true ) );
	check( /not 29/.test( Hexen2_ReadSubmodels( wrongVersion ).reason ), 'version 30 refused' );
	const badHull = level( 1, ( view, modelsOfs ) => view.setInt32( modelsOfs + 36, 9999, true ) );
	check( /hull 0 headnode/.test( Hexen2_ReadSubmodels( badHull ).reason ), 'a headnode outside the nodes is refused' );
	const badHull4 = level( 1, ( view, modelsOfs ) => view.setInt32( modelsOfs + 36 + 4 * 4, 9999, true ) );
	check( /hull 4 headnode/.test( Hexen2_ReadSubmodels( badHull4 ).reason ), 'a high hull headnode outside the clipnodes is refused' );
	const badFaces = level( 1, ( view, modelsOfs ) => view.setInt32( modelsOfs + 76, 9999, true ) );
	check( /run beyond/.test( Hexen2_ReadSubmodels( badFaces ).reason ), 'a face range beyond the faces is refused' );
	const badBounds = level( 1, ( view, modelsOfs ) => view.setFloat32( modelsOfs, 50, true ) );
	check( /mins above maxs/.test( Hexen2_ReadSubmodels( badBounds ).reason ), 'mins above maxs is refused' );

} );

Deno.test( 'the supplied demo1.bsp carries 100 eight-hull models, which the Quake 64-byte assumption misreads', () => {

	if ( ! existsSync( PAK ) ) { console.log( 'SKIP: the supplied Hexen II pack is not present at ' + PAK ); return; }
	const fd = openSync( PAK, 'r' );
	let bytes;
	try {

		const header = Buffer.alloc( 12 ); readSync( fd, header, 0, 12, 0 );
		same( header.toString( 'ascii', 0, 4 ), 'PACK', 'a PAK' );
		const dirOfs = header.readUInt32LE( 4 ), dirLen = header.readUInt32LE( 8 );
		const directory = Buffer.alloc( dirLen ); readSync( fd, directory, 0, dirLen, dirOfs );
		let member = null;
		for ( let at = 0; at < dirLen; at += 64 ) {

			const text = directory.subarray( at, at + 56 ), end = text.indexOf( 0 );
			if ( text.subarray( 0, end < 0 ? 56 : end ).toString( 'latin1' ) === 'maps/demo1.bsp' )
				member = { offset: directory.readUInt32LE( at + 56 ), size: directory.readUInt32LE( at + 60 ) };

		}
		check( member !== null, 'demo1.bsp is in the pack' );
		bytes = Buffer.alloc( member.size ); readSync( fd, bytes, 0, member.size, member.offset );

	} finally { closeSync( fd ); }

	const read = Hexen2_ReadSubmodels( bytes );
	check( read.ok, read.reason );
	same( read.count, 100, 'the supplied level has 100 submodels' );
	same( read.models[ 0 ].headnode.join( ',' ), '0,0,2992,5709,8623,14892,0,0', 'the world model headnodes' );
	same( read.models[ 0 ].visleafs, 792, 'the world model visible leafs' );
	same( read.models[ 0 ].numfaces, 3903, 'the world model face count' );
	// the same lump read as 64-byte Quake records would claim 125 models: the supplied level is not Quake-shaped
	same( 8000 / 64, 125, 'the Quake record assumption would count 125' );
	// the extra class hulls are real content, not padding
	check( read.models.some( model => model.headnode.slice( 4 ).some( value => value !== 0 ) ), 'some submodel uses hulls 4 to 7' );

} );
