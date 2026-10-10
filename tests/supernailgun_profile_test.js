// Independently decode the new source FBX and native MDLs. Qualify uniform
// source-shape transforms and barrel-only mild grading at the public draw.
import { readFileSync } from 'node:fs';
import { inflateRawSync, inflateSync } from 'node:zlib';
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const { GL_MakeAliasModelDisplayLists, R_DrawAliasModel } = await import( '../src/engine/render/gl_mesh.js' );
const { R_CloneAliasMaterial } = await import( '../src/newer/render/r_newerskins.js' );
const { R_WeaponStyleGLSL } = await import( '../src/newer/render/r_weaponstyle.js' );
const weapons = await import( '../src/newer/render/r_weapons.js' );
const { r_hdr } = await import( '../src/gl_post.js' );
const { r_lerpmodels } = await import( '../src/newer/render/r_anim.js' );
const { cl } = await import( '../src/engine/client/client.js' );
const { Cvar_RegisterVariable, Cvar_SetValue, Cvar_FindVar } = await import( '../src/engine/common/cvar.js' );

function check( value, label ) { if ( ! value ) throw new Error( label ); }
function near( a, b, label, epsilon = 0.00002 ) { check( Number.isFinite( a ) && Math.abs( a - b ) <= epsilon, `${label}: ${a} != ${b}` ); }
const read = file => readFileSync( new URL( '../' + file, import.meta.url ) );
const pak = read( 'pak0.pak' ), files = new Map();
for ( let offset = pak.readInt32LE( 4 ), end = offset + pak.readInt32LE( 8 ); offset < end; offset += 64 ) {

	const name = pak.subarray( offset, offset + 56 ).toString().split( '\0' )[ 0 ];
	const position = pak.readInt32LE( offset + 56 ); files.set( name, pak.subarray( position, position + pak.readInt32LE( offset + 60 ) ) );

}
function archive( filename ) {

	const bytes = typeof filename === 'string' ? read( filename ) : filename, entries = new Map();
	let end = bytes.length - 22;
	while ( end >= 0 && bytes.readUInt32LE( end ) !== 0x06054b50 ) end --;
	check( end >= 0, filename + ' ZIP directory' );
	let offset = bytes.readUInt32LE( end + 16 );
	for ( let i = 0; i < bytes.readUInt16LE( end + 10 ); i ++ ) {

		check( bytes.readUInt32LE( offset ) === 0x02014b50, 'ZIP entry header' );
		const method = bytes.readUInt16LE( offset + 10 ), size = bytes.readUInt32LE( offset + 20 );
		const nameSize = bytes.readUInt16LE( offset + 28 ), extra = bytes.readUInt16LE( offset + 30 ), comment = bytes.readUInt16LE( offset + 32 );
		const name = bytes.subarray( offset + 46, offset + 46 + nameSize ).toString(), local = bytes.readUInt32LE( offset + 42 );
		const start = local + 30 + bytes.readUInt16LE( local + 26 ) + bytes.readUInt16LE( local + 28 );
		const data = bytes.subarray( start, start + size );
		check( method === 0 || method === 8, 'supported donor ZIP compression' );
		entries.set( name, method === 8 ? inflateRawSync( data ) : data ); offset += 46 + nameSize + extra + comment;

	}
	return entries;

}
function donor( filename, axes ) {

	const entries = archive( filename ), doc = JSON.parse( entries.get( 'scene.gltf' ) );
	const buffers = doc.buffers.map( buffer => entries.get( buffer.uri ) );
	function accessor( index ) {

		const a = doc.accessors[ index ], v = doc.bufferViews[ a.bufferView ];
		const columns = { VEC3: 3, VEC2: 2, SCALAR: 1 }[ a.type ];
		const width = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[ a.componentType ];
		const method = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE', 5121: 'readUInt8' }[ a.componentType ];
		return Array.from( { length: a.count }, ( _, i ) => Array.from( { length: columns }, ( _, j ) =>
			buffers[ v.buffer ][ method ]( ( v.byteOffset || 0 ) + ( a.byteOffset || 0 ) + i * ( v.byteStride || columns * width ) + j * width ) ) );

	}
	let result;
	function visit( id, parent ) {

		const node = doc.nodes[ id ], matrix = parent.clone().multiply( node.matrix ? new THREE.Matrix4().fromArray( node.matrix ) : new THREE.Matrix4() );
		if ( node.mesh !== undefined ) {

			check( ! result, 'single donated primitive' );
			const primitive = doc.meshes[ node.mesh ].primitives[ 0 ];
			const positions = accessor( primitive.attributes.POSITION ).map( coordinates => {

				const point = new THREE.Vector3().fromArray( coordinates ).applyMatrix4( matrix ).toArray();
				return axes.map( axis => point[ Math.abs( axis ) - 1 ] * Math.sign( axis ) );

			} );
			result = { positions, rawPositions: accessor( primitive.attributes.POSITION ), rawNormals: accessor( primitive.attributes.NORMAL ), uv: accessor( primitive.attributes.TEXCOORD_0 ), indices: accessor( primitive.indices ).flat(), entries, doc, material: doc.materials[ primitive.material ] };

		}
		for ( const child of node.children || [] ) visit( child, matrix );

	}
	for ( const id of doc.scenes[ doc.scene || 0 ].nodes ) visit( id, new THREE.Matrix4() );
	return result;

}
function header( key ) {

	const bytes = files.get( 'progs/' + key + '.mdl' );
	const ns = bytes.readInt32LE( 48 ), w = bytes.readInt32LE( 52 ), h = bytes.readInt32LE( 56 );
	const nv = bytes.readInt32LE( 60 ), nt = bytes.readInt32LE( 64 ), nf = bytes.readInt32LE( 68 );
	let offset = 84;
	check( ns === 1 && bytes.readInt32LE( offset ) === 0, 'single native skin' );
	const skin = bytes.subarray( 88, 88 + w * h ), palette = files.get( 'gfx/palette.lmp' );
	const rgba = new Uint8Array( w * h * 4 );
	for ( let i = 0; i < skin.length; i ++ ) { rgba.set( palette.subarray( skin[ i ] * 3, skin[ i ] * 3 + 3 ), i * 4 ); rgba[ i * 4 + 3 ] = 255; }
	const texture = new THREE.DataTexture( rgba, w, h ); texture.colorSpace = THREE.SRGBColorSpace;
	offset += 4 + w * h;
	const stverts = Array.from( { length: nv }, ( _, i ) => ( { onseam: bytes.readInt32LE( offset + i * 12 ), s: bytes.readInt32LE( offset + i * 12 + 4 ), t: bytes.readInt32LE( offset + i * 12 + 8 ) } ) );
	offset += nv * 12;
	const triangles = Array.from( { length: nt }, ( _, i ) => ( { facesfront: bytes.readInt32LE( offset + i * 16 ), vertindex: [ 4, 8, 12 ].map( n => bytes.readInt32LE( offset + i * 16 + n ) ) } ) );
	offset += nt * 16;
	const poseverts = [];
	for ( let pose = 0; pose < nf; pose ++ ) {

		check( bytes.readInt32LE( offset ) === 0, 'single native pose' ); offset += 28;
		poseverts.push( Array.from( { length: nv }, ( _, i ) => ( { v: Array.from( bytes.subarray( offset + i * 4, offset + i * 4 + 3 ) ), lightnormalindex: bytes[ offset + i * 4 + 3 ] } ) ) ); offset += nv * 4;

	}
	const result = { poseverts, stverts, triangles, numposes: nf, numverts: nv, numtris: nt, skinwidth: w, skinheight: h,
		scale: [ 8, 12, 16 ].map( n => bytes.readFloatLE( n ) ), scale_origin: [ 20, 24, 28 ].map( n => bytes.readFloatLE( n ) ),
		gl_texturenum: [ texture ], numframes: nf, frames: poseverts.map( ( _, i ) => ( { firstpose: i, numposes: 1 } ) ), skin };
	GL_MakeAliasModelDisplayLists( { name: 'progs/' + key + '.mdl' }, result ); return result;

}
function drawn( key, h ) { return R_DrawAliasModel( { model: { name: 'progs/' + key + '.mdl' }, frame: 0, skinnum: 0, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] }, h, new Float32Array( 162 ).fill( 1 ), 1 ); }
function nativeBodyPoints( h, viewmodel ) {

	const points = h.poseverts[ 0 ].map( v => v.v.map( ( value, i ) => value * h.scale[ i ] + h.scale_origin[ i ] ) );
	if ( ! viewmodel ) return points;
	// Independently identify and exclude disconnected hidden muzzle flash
	// components, using native topology and their parked-behind-eye position.
	const neighbours = Array.from( { length: points.length }, () => new Set() );
	for ( const triangle of h.triangles ) for ( const a of triangle.vertindex ) for ( const b of triangle.vertindex ) neighbours[ a ].add( b );
	const seen = new Set(), selected = [];
	for ( let id = 0; id < points.length; id ++ ) {

		if ( seen.has( id ) ) continue;
		const pending = [ id ], component = [];
		while ( pending.length ) {

			const next = pending.pop(); if ( seen.has( next ) ) continue;
			seen.add( next ); component.push( next ); pending.push( ...neighbours[ next ] );

		}
		if ( Math.max( ...component.map( i => points[ i ][ 0 ] ) ) >= 0 ) selected.push( ...component.map( i => points[ i ] ) );

	}
	return selected;

}

// Independent FBX binary decoder. Read actual polygon-corner UVs and normals;
// do not import the production Python parser or generated geometry as an oracle.
const outer = archive( 'supernailgun2.zip' ), nested = archive( outer.get( 'source/supernailgun.zip' ) );
function fbxSource() {

	const bytes = nested.get( 'supernailgun.fbx' );
	check( bytes.subarray( 0, 23 ).toString() === 'Kaydara FBX Binary  \0\x1a\0' && bytes.readUInt32LE( 23 ) === 7400, 'new source FBX 7400 signature' );
	function property( offset ) {

		const type = String.fromCharCode( bytes[ offset ++ ] );
		const scalar = { Y: [ 'readInt16LE', 2 ], C: [ 'readUInt8', 1 ], I: [ 'readInt32LE', 4 ], F: [ 'readFloatLE', 4 ], D: [ 'readDoubleLE', 8 ], L: [ 'readBigInt64LE', 8 ] }[ type ];
		if ( scalar ) return [ Number( bytes[ scalar[ 0 ] ]( offset ) ), offset + scalar[ 1 ] ];
		if ( type === 'S' || type === 'R' ) {

			const length = bytes.readUInt32LE( offset ), value = bytes.subarray( offset + 4, offset + 4 + length );
			return [ type === 'S' ? value.toString() : value, offset + 4 + length ];

		}
		const count = bytes.readUInt32LE( offset ), encoding = bytes.readUInt32LE( offset + 4 ), length = bytes.readUInt32LE( offset + 8 );
		check( encoding === 0 || encoding === 1, 'FBX array encoding' );
		const raw = bytes.subarray( offset + 12, offset + 12 + length ), decoded = encoding ? inflateSync( raw ) : raw;
		const array = { f: [ 'readFloatLE', 4 ], d: [ 'readDoubleLE', 8 ], i: [ 'readInt32LE', 4 ], l: [ 'readBigInt64LE', 8 ], b: [ 'readUInt8', 1 ], c: [ 'readInt8', 1 ] }[ type ];
		check( array && decoded.length === count * array[ 1 ], 'FBX array byte count' );
		return [ Array.from( { length: count }, ( _, i ) => Number( decoded[ array[ 0 ] ]( i * array[ 1 ] ) ) ), offset + 12 + length ];

	}
	function node( offset ) {

		const end = bytes.readUInt32LE( offset ), count = bytes.readUInt32LE( offset + 4 ), nameLength = bytes[ offset + 12 ];
		if ( end === 0 ) return [ null, offset + 13 ];
		const name = bytes.subarray( offset + 13, offset + 13 + nameLength ).toString(), properties = [], children = [];
		offset += 13 + nameLength;
		for ( let i = 0; i < count; i ++ ) { const [ value, next ] = property( offset ); properties.push( value ); offset = next; }
		while ( offset < end - 13 ) { const [ child, next ] = node( offset ); if ( child ) children.push( child ); offset = next; }
		return [ { name, properties, children }, end ];

	}
	const roots = []; let offset = 27;
	while ( true ) { const [ item, next ] = node( offset ); if ( ! item ) break; roots.push( item ); offset = next; }
	const child = ( item, name ) => { const matches = item.children.filter( n => n.name === name ); check( matches.length === 1, 'single FBX ' + name ); return matches[ 0 ]; };
	const objects = child( { children: roots }, 'Objects' ), geometry = child( objects, 'Geometry' ), model = child( objects, 'Model' );
	const controls = child( geometry, 'Vertices' ).properties[ 0 ], polygonIndices = child( geometry, 'PolygonVertexIndex' ).properties[ 0 ];
	const uvLayer = child( geometry, 'LayerElementUV' ), normalLayer = child( geometry, 'LayerElementNormal' );
	check( child( uvLayer, 'MappingInformationType' ).properties[ 0 ] === 'ByPolygonVertex' && child( uvLayer, 'ReferenceInformationType' ).properties[ 0 ] === 'IndexToDirect', 'FBX corner UV mapping' );
	check( child( normalLayer, 'MappingInformationType' ).properties[ 0 ] === 'ByPolygonVertex' && child( normalLayer, 'ReferenceInformationType' ).properties[ 0 ] === 'Direct', 'FBX authored corner normal mapping' );
	const normals = child( normalLayer, 'Normals' ).properties[ 0 ], uvValues = child( uvLayer, 'UV' ).properties[ 0 ], uvIndices = child( uvLayer, 'UVIndex' ).properties[ 0 ];
	const settings = Object.fromEntries( child( model, 'Properties70' ).children.filter( n => n.name === 'P' ).map( n => [ n.properties[ 0 ], n.properties.slice( 4 ) ] ) );
	check( settings[ 'Lcl Scaling' ].every( s => s === settings[ 'Lcl Scaling' ][ 0 ] ), 'authored FBX scale is uniform' );
	const [ rx, ry, rz ] = settings[ 'Lcl Rotation' ].map( degrees => degrees * Math.PI / 180 );
	const rotation = new THREE.Matrix4().makeRotationZ( rz ).multiply( new THREE.Matrix4().makeRotationY( ry ) ).multiply( new THREE.Matrix4().makeRotationX( rx ) );
	const scale = settings[ 'Lcl Scaling' ][ 0 ] * .01, translation = new THREE.Vector3( ...( settings[ 'Lcl Translation' ] || [ 0, 0, 0 ] ) ).multiplyScalar( .01 );
	const positions = [], rawPositions = [], rawNormals = [], mappedNormals = [], uv = [], indices = [], polygons = [];
	let start = 0;
	for ( const [ i, encoded ] of polygonIndices.entries() ) {

		const id = encoded < 0 ? - encoded - 1 : encoded, raw = controls.slice( id * 3, id * 3 + 3 ), rawNormal = normals.slice( i * 3, i * 3 + 3 );
		rawPositions.push( raw ); rawNormals.push( rawNormal );
		const p = new THREE.Vector3( ...raw ).applyMatrix4( rotation ).multiplyScalar( scale ).add( translation ); positions.push( [ p.x, - p.z, p.y ] );
		const n = new THREE.Vector3( ...rawNormal ).transformDirection( rotation ); mappedNormals.push( [ n.x, - n.z, n.y ] );
		uv.push( uvValues.slice( uvIndices[ i ] * 2, uvIndices[ i ] * 2 + 2 ) );
		if ( encoded < 0 ) {

			check( i - start >= 2, 'FBX polygon has at least three corners' ); polygons.push( Array.from( { length: i - start + 1 }, ( _, j ) => start + j ) );
			for ( let j = start + 1; j < i; j ++ ) indices.push( start, j, j + 1 ); start = i + 1;

		}

	}
	check( start === polygonIndices.length, 'FBX polygons all terminated' );
	return { positions, rawPositions, rawNormals, normals: mappedNormals, uv, indices, polygons, controlPoints: controls.length / 3 };

}
const source = fbxSource(), oldSource = donor( 'supernailgun.zip', [ 1, - 3, 2 ] );
const joined = source.positions.map( ( _, i ) => i ), coordinateIds = new Map();
function componentRoot( id ) { while ( joined[ id ] !== id ) id = joined[ id ]; return id; }
for ( const [ id, p ] of source.positions.entries() ) {

	const key = p.map( value => value.toFixed( 5 ) ).join( ',' );
	if ( coordinateIds.has( key ) ) joined[ componentRoot( id ) ] = componentRoot( coordinateIds.get( key ) ); else coordinateIds.set( key, id );

}
for ( let i = 0; i < source.indices.length; i += 3 ) for ( const id of source.indices.slice( i + 1, i + 3 ) ) joined[ componentRoot( id ) ] = componentRoot( source.indices[ i ] );
const sourceParts = new Map();
for ( let id = 0; id < joined.length; id ++ ) { const key = componentRoot( id ); if ( ! sourceParts.has( key ) ) sourceParts.set( key, [] ); sourceParts.get( key ).push( id ); }
const partBox = ids => new THREE.Box3().setFromPoints( ids.map( id => new THREE.Vector3( ...source.positions[ id ] ) ) );
const barrelParts = Array.from( sourceParts.values() ).filter( ids => {

	const box = partBox( ids ), size = box.getSize( new THREE.Vector3() ); return box.min.x > .4 && box.max.x > 6 && size.y < 1 && size.z < 1;

} );
const rotorIds = new Set( barrelParts.flat() ), receiverRing = Array.from( sourceParts.values() ).find( ids => {

	const box = partBox( ids ), size = box.getSize( new THREE.Vector3() ); return box.min.x > - .6 && box.max.x < .1 && size.y > 2 && size.z > 2;

} );
function uniformFit( h, held ) {

	const target = nativeBodyPoints( h, held ), sourceBox = new THREE.Box3().setFromPoints( source.positions.map( p => new THREE.Vector3( ...p ) ) ), targetBox = new THREE.Box3().setFromPoints( target.map( p => new THREE.Vector3( ...p ) ) );
	const scale = ( targetBox.max.x - targetBox.min.x ) / ( sourceBox.max.x - sourceBox.min.x ), sourceCenter = sourceBox.getCenter( new THREE.Vector3() ), targetCenter = targetBox.getCenter( new THREE.Vector3() );
	const rotation = new THREE.Matrix4().makeRotationY( held ? - 8 * Math.PI / 180 : 0 );
	const pivot = sourceCenter.clone().negate().multiplyScalar( scale ).add( targetCenter ).applyMatrix4( rotation ); if ( held ) pivot.x -= 7;
	return { scale, rotation, pivot, axis: new THREE.Vector3( 1, 0, 0 ).transformDirection( rotation ), positions: source.positions.map( p => {

		const q = new THREE.Vector3( ...p ).sub( sourceCenter ).multiplyScalar( scale ).add( targetCenter ).applyMatrix4( rotation ); if ( held ) q.x -= 7; return q.toArray();

	} ), normals: source.normals.map( n => new THREE.Vector3( ...n ).transformDirection( rotation ).toArray() ) };

}
function rotorExpected( fit, id, angle, normal = false ) {

	const p = new THREE.Vector3( ...( normal ? fit.normals[ id ] : fit.positions[ id ] ) );
	if ( rotorIds.has( id ) ) {

		if ( ! normal ) p.sub( fit.pivot );
		p.applyQuaternion( new THREE.Quaternion().setFromAxisAngle( fit.axis, angle ) );
		if ( ! normal ) p.add( fit.pivot );

	}
	return p.toArray();

}
const oldFetch = globalThis.fetch, oldLoad = THREE.TextureLoader.prototype.load;
const old = { hdr: r_hdr.string, weapons: weapons.r_newer_weapons.value, lerp: r_lerpmodels.value };
globalThis.fetch = async path => { try { return { ok: true, json: async () => JSON.parse( read( String( path ) ).toString() ) }; } catch { return { ok: false }; } };
THREE.TextureLoader.prototype.load = function ( path, done ) { const texture = new THREE.Texture(); texture._testPath = String( path ); queueMicrotask( () => done( texture ) ); return texture; };
if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( r_hdr );
Cvar_SetValue( 'r_hdr', 1 ); weapons.r_newer_weapons.value = 1; r_lerpmodels.value = 0;
await weapons.R_WeaponsPreload();

Deno.test( 'super nailgun source: independently decoded new FBX preserves complete authored coordinates, UVs and normals', () => {

	check( source.controlPoints === 999 && source.positions.length === 3980 && source.polygons.length === 1031 && source.indices.length === 1918 * 3, 'actual new source FBX topology decoded' );
	const correspondence = new Map();
	for ( let i = 0; i < source.positions.length; i ++ ) {

		const key = source.rawPositions[ i ].concat( source.uv[ i ] ).join( ',' ); if ( ! correspondence.has( key ) ) correspondence.set( key, [] ); correspondence.get( key ).push( source.rawNormals[ i ] );

	}
	for ( let id = 0; id < oldSource.rawPositions.length; id ++ ) {

		const matches = correspondence.get( oldSource.rawPositions[ id ].concat( oldSource.uv[ id ] ).join( ',' ) );
		check( matches?.some( normal => Math.hypot( ...normal.map( ( value, axis ) => value - oldSource.rawNormals[ id ][ axis ] ) ) < .0000002 ), 'new source retains authored control point/UV/normal tuple ' + id );

	}

} );

Deno.test( 'super nailgun source: every polygon fan retains source boundary area and winding, including all six hexagons', () => {

	let hexagons = 0;
	for ( const polygon of source.polygons ) {

		const points = polygon.map( id => new THREE.Vector3( ...source.positions[ id ] ) ), normal = new THREE.Vector3();
		for ( let i = 0; i < points.length; i ++ ) normal.add( new THREE.Vector3().crossVectors( points[ i ], points[ ( i + 1 ) % points.length ] ) );
		check( normal.length() > 1e-10, 'source polygon has positive area' ); normal.normalize();
		const first = points[ 0 ], edge = points[ 1 ].clone().sub( first ).normalize(), up = new THREE.Vector3().crossVectors( normal, edge );
		const projected = points.map( p => { const q = p.clone().sub( first ); return [ q.dot( edge ), q.dot( up ) ]; } );
		const cross = ( a, b ) => a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ];
		const area = projected.reduce( ( sum, p, i ) => sum + cross( p, projected[ ( i + 1 ) % points.length ] ) / 2, 0 );
		let fanArea = 0;
		for ( let i = 1; i < points.length - 1; i ++ ) {

			const triangleArea = cross( projected[ i ], projected[ i + 1 ] ) / 2;
			check( triangleArea >= - 1e-9, 'source fan triangle preserves boundary winding' ); fanArea += Math.abs( triangleArea );

		}
		near( fanArea, Math.abs( area ), 'source polygon area preserved by fan', .0000001 );
		if ( polygon.length === 6 ) {

			hexagons ++;
			for ( let i = 0; i < projected.length; i ++ ) {

				const a = projected[ i ], b = projected[ ( i + 1 ) % 6 ], c = projected[ ( i + 2 ) % 6 ];
				check( cross( [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ], [ c[ 0 ] - b[ 0 ], c[ 1 ] - b[ 1 ] ] ) >= - 1e-8, 'source six-sided caps are convex under fan triangulation' );

			}

		}

	}
	check( hexagons === 6, 'all source hexagons checked' );

} );

Deno.test( 'super nailgun source: held and pickup fit preserve supplied shape and ridges by one uniform scale and rigid transform in every pose', () => {

	for ( const key of [ 'v_nail2', 'g_nail2' ] ) {

		const held = key === 'v_nail2', h = header( key ), fit = uniformFit( h, held ), e = { frame: 0, skinnum: 0, model: { name: 'progs/' + key + '.mdl' }, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] };
		const data = JSON.parse( read( 'newer/weapons/' + key + '.json' ) );
		if ( held ) {

			check( h.numframes === 9 && barrelParts.length === 4 && barrelParts.every( ids => ids.length === 544 ) && rotorIds.size === 2176, 'four full barrel assemblies including their own ridges recovered independently' );
			check( receiverRing?.length && receiverRing.every( id => ! rotorIds.has( id ) ), 'large visible rear ring independently excluded from rotor' );
			check( data.rotor.vertices.join( ',' ) === Array.from( rotorIds ).sort( ( a, b ) => a - b ).join( ',' ), 'rotor metadata selects exactly independent source barrels' );
			data.rotor.axis.forEach( ( value, axis ) => near( value, fit.axis.getComponent( axis ), 'source axis preserved', .00000001 ) );
			data.rotor.pivot.forEach( ( value, axis ) => near( value, fit.pivot.getComponent( axis ), 'original source centreline pivot', .00000001 ) );
			data.rotor.angles.forEach( ( angle, frame ) => near( angle, - frame * Math.PI / 4, 'native firing rotor phase', .00000001 ) );
			for ( let i = 0; i < source.indices.length; i += 3 ) { const membership = source.indices.slice( i, i + 3 ).filter( id => rotorIds.has( id ) ).length; check( membership === 0 || membership === 3, 'no rotor/body triangles cross the stationary rear ring' ); }

		} else check( ! data.rotor, 'pickup remains nonrotating source shape' );
		for ( let frame = 0; frame < h.numframes; frame ++ ) {

			e.frame = frame; const mesh = R_DrawAliasModel( e, h, null ), position = mesh.geometry.getAttribute( 'position' ), normal = mesh.geometry.getAttribute( 'normal' );
			check( position.count === source.positions.length && normal.count === source.normals.length, key + ' every original polygon corner rendered' );
			if ( held ) {

				// The ordinary stationary camera looks along local +X with its
				// four-unit near plane (R_SetupGL) and +1/32 view-origin epsilon.
				// This checks all firing poses; walking bob/XR poses are separate.
				const nearest = Math.min( ...Array.from( { length: position.count }, ( _, id ) => position.getX( id ) ) ) - 1 / 32;
				check( nearest > 4, 'stationary held pose clears ordinary camera near plane frame ' + frame );

			}
			for ( let id = 0; id < source.positions.length; id ++ ) {

				const expected = held ? rotorExpected( fit, id, - frame * Math.PI / 4 ) : fit.positions[ id ], rotatedNormal = held ? rotorExpected( fit, id, - frame * Math.PI / 4, true ) : fit.normals[ id ];
				for ( let axis = 0; axis < 3; axis ++ ) {

					near( position.array[ id * 3 + axis ], expected[ axis ], key + ' exact uniform source corner pose ' + frame + ' vertex ' + id, .000025 );
					near( normal.array[ id * 3 + axis ], rotatedNormal[ axis ], key + ' supplied authored normal pose ' + frame + ' corner ' + id, .000003 );
					near( data.poses[ frame ][ id * 3 + axis ], expected[ axis ], key + ' generated pose preserves only barrel rotation frame ' + frame, .000025 );
					near( data.normals[ frame ][ id * 3 + axis ], rotatedNormal[ axis ], key + ' generated authored normal frame ' + frame, .000003 );

				}

			}
			// Every source polygon edge, including each ridge/collar spacing,
			// scales identically. No body retraction or selective barrel stretch.
			for ( const polygon of source.polygons ) for ( let i = 0; i < polygon.length; i ++ ) {

				const a = polygon[ i ], b = polygon[ ( i + 1 ) % polygon.length ], distance = ( p, q ) => Math.hypot( ...p.map( ( value, axis ) => value - q[ axis ] ) );
				const actual = distance( Array.from( position.array.slice( a * 3, a * 3 + 3 ) ), Array.from( position.array.slice( b * 3, b * 3 + 3 ) ) );
				near( actual, distance( source.positions[ a ], source.positions[ b ] ) * fit.scale, key + ' unchanged ridge/source edge scale frame ' + frame, .000025 );

			}

		}
		const record = JSON.parse( read( 'newer/weapons/index.json' ) ).models[ key ];
		check( record.fitKind === 'uniform-source-shape' && ! record.barrelAdjustment && ! record.bodyTranslation, key + ' no sectional mesh edits remain' );
		near( record.uniformScale, fit.scale, key + ' independent uniform scale', .0000001 );

	}

} );

Deno.test( 'super nailgun source: new outer PNGs, original FBX UV orientation and authored normal detail bind in held/pickup materials and clones', () => {

	check( read( 'newer/weapons/supernailgun/diffuse.png' ).equals( outer.get( 'textures/albedo.png' ) ), 'new outer albedo bytes used unchanged' );
	check( read( 'newer/weapons/supernailgun/normal.png' ).equals( outer.get( 'textures/normal.png' ) ), 'new outer normal bytes used unchanged' );
	check( ! outer.get( 'textures/albedo.png' ).equals( nested.get( 'albedo.png' ) ) && ! outer.get( 'textures/normal.png' ).equals( nested.get( 'normal.png' ) ), 'fixture distinguishes the outer maps from obsolete nested bitmaps' );
	for ( const key of [ 'v_nail2', 'g_nail2' ] ) {

		const mesh = drawn( key, header( key ) ), uv = mesh.geometry.getAttribute( 'uv' );
		check( mesh.geometry.index.count === source.indices.length && Array.from( mesh.geometry.index.array ).every( ( value, i ) => value === source.indices[ i ] ), key + ' faithful FBX polygon fan topology' );
		for ( const [ id, p ] of source.uv.entries() ) { near( uv.getX( id ), p[ 0 ], key + ' original corner U', .0000001 ); near( uv.getY( id ), p[ 1 ], key + ' original corner V, no rebaking/flip', .0000001 ); }
		const shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>' };
		mesh.material.onBeforeCompile( shader );
		check( mesh.material.map.flipY === true && shader.uniforms.qrNormal.value.flipY === true && shader.uniforms.uFlipGreen.value === 1, key + ' FBX map Y/normal-green convention actually binds' );
		check( shader.uniforms.qrNormal.value._testPath.endsWith( '/supernailgun/normal.png' ), key + ' new supplied normal map bound' );
		const clone = R_CloneAliasMaterial( mesh.material );
		check( clone.onBeforeCompile === mesh.material.onBeforeCompile && clone.map === mesh.material.map, key + ' view clone keeps original texture/shader identity' ); clone.dispose();

	}

} );

Deno.test( 'super nailgun rotor: public draw turns rigid barrels about the real axis, spins up while firing, coasts down after firing and refires without a snap', () => {

	const oldTime = cl.time, oldLerp = r_lerpmodels.value, h = header( 'v_nail2' ), fit = uniformFit( h, true );
	const e = { frame: 0, skinnum: 0, model: { name: 'progs/v_nail2.mdl' }, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] };
	const marker = barrelParts[ 0 ][ 0 ], radius = p => new THREE.Vector3( ...p ).sub( fit.pivot ).cross( fit.axis ).length();
	// draw one frame through the public path and check the geometry against the rotor's own angle (rigid barrels about
	// the fitted axis and pivot, stationary receiver and ring, authored normals, radius kept)
	function draw( time, frame ) {

		cl.time = time; e.frame = frame; const mesh = R_DrawAliasModel( e, h, null ), positions = mesh.geometry.getAttribute( 'position' ), normals = mesh.geometry.getAttribute( 'normal' );
		const state = weapons.R_WeaponRotorState( e ); check( state, 'the held super nailgun has a rotor state' );
		for ( let id = 0; id < source.positions.length; id ++ ) {

			const expected = rotorExpected( fit, id, state.angle ), expectedNormal = rotorExpected( fit, id, state.angle, true );
			for ( let axis = 0; axis < 3; axis ++ ) {

				near( positions.array[ id * 3 + axis ], expected[ axis ], 'public angular draw; stationary receiver/ring and rigid rotating barrels', .000025 );
				near( normals.array[ id * 3 + axis ], expectedNormal[ axis ], 'public angular draw authored normals', .000003 );

			}

		}
		near( radius( Array.from( positions.array.slice( marker * 3, marker * 3 + 3 ) ) ), radius( fit.positions[ marker ] ), 'the barrel keeps its source radius at every angle; no vertex-lerp collapse', .00001 );
		return state;

	}
	try {

		r_lerpmodels.value = 2; const fire = - Math.PI / 4 / .1;
		const idle = draw( 40, 0 ); near( idle.angle, 0, 1e-12, 'a fresh idle weapon is at the rest angle' ); same( idle.omega, 0, 'at rest' );
		let state = idle, t = 40; for ( let i = 0; i < 24; i ++ ) { t += 1 / 24; state = draw( t, 1 + i % 8 ); } // a second of fire through the frame loop
		near( state.omega, fire, Math.abs( fire ) * .01, 'firing turns the barrels at the stored poses\' rate, in their direction' );
		const fired = state; let previous = fired;
		for ( let i = 0; i < 12; i ++ ) { t += 1 / 24; state = draw( t, 0 ); check( state.angle <= previous.angle && Math.abs( state.omega ) <= Math.abs( previous.omega ), 'coasting: the same direction, the speed only falling' ); previous = state; }
		check( fired.angle - state.angle > .2 * Math.PI && Math.abs( state.omega ) < Math.abs( fired.omega ) * .2, 'after half a second the barrels have coasted a fraction of a turn and nearly stopped' );
		const mid = state; t += 1 / 24; state = draw( t, 3 ); check( state.angle < mid.angle && Math.abs( state.omega ) > Math.abs( mid.omega ) && Math.abs( state.omega ) < Math.abs( fire ), 'firing again continues from the current angle and speed (no snap)' );
		for ( let i = 0; i < 40; i ++ ) { t += 1 / 24; state = draw( t, 0 ); } same( state.omega, 0, 'idle eventually settles with zero speed' );
		const settled = state.angle; t += 1; same( draw( t, 0 ).angle, settled, 'and stays at that angle' );

	} finally { cl.time = oldTime; r_lerpmodels.value = oldLerp; }

} );

Deno.test( 'super nailgun source: mild RGB hue balance covers only bare forward tubes and preserves bronze body, source channel variation and exposure', async () => {

	const bare = new Set();
	for ( let i = 0; i < source.indices.length; i += 3 ) {

		const triangle = source.indices.slice( i, i + 3 ), x = triangle.map( id => source.positions[ id ][ 0 ] );
		if ( Math.min( ...x ) > 2.79 && Math.min( ...x ) < 3 && Math.max( ...x ) > 6.09 && Math.max( ...x ) < 6.11 ) for ( const id of triangle ) bare.add( id );

	}
	check( bare.size === 192, 'bare forward tube polygon corners identified from physical geometry' );
	const bareBoundary = new Set( Array.from( bare, id => source.positions[ id ].concat( source.uv[ id ] ).join( ',' ) ) );
	const manifest = await weapons.R_WeaponsLoad(), style = manifest.sources.supernailgun.material.style;
	check( ! style.palette?.length && style.grading.length === 1, 'only mild RGB grading remains; no wholesale luminance recolour' );
	const rule = style.grading[ 0 ], inside = uv => uv[ 0 ] >= rule.rect[ 0 ] - 1e-7 && uv[ 0 ] <= rule.rect[ 2 ] + 1e-7 && uv[ 1 ] >= rule.rect[ 1 ] - 1e-7 && uv[ 1 ] <= rule.rect[ 3 ] + 1e-7;
	for ( const [ id, uv ] of source.uv.entries() ) {

		// FBX preserves separate corners on the adjacent polygon's shared tube
		// boundary. They sample the same authored point/UV as its bare face.
		const expected = bareBoundary.has( source.positions[ id ].concat( uv ).join( ',' ) );
		check( inside( uv ) === expected, 'barrel-only grading; source corner ' + id + ' unrelated body/bronze/ridges excluded' );

	}
	check( rule.balance.join( ',' ) === '0.96,0.99,1.08' && rule.gain === 1 && rule.contrast === 1 && rule.saturation === 1, 'small source-channel balance preserves exposure/saturation/contrast' );
	for ( const key of [ 'v_nail2', 'g_nail2' ] ) {

		const patch = R_WeaponStyleGLSL( style, key ), equation = /qrSourceColour \* vec3\( ([\d.,\s]+) \) \* ([\d.]+)/.exec( patch.map );
		check( equation && ! patch.map.includes( 'qrSourceLuma *' ), key + ' grades original RGB rather than replacing it with a tint' );
		const balance = equation[ 1 ].split( ',' ).map( Number ), gain = Number( equation[ 2 ] );
		balance.forEach( ( value, axis ) => near( value, [ .96, .99, 1.08 ][ axis ], key + ' mild barrel colour balance', .0000001 ) ); near( gain, 1, key + ' source exposure retained' );
		const grade = p => p.map( ( value, axis ) => value * balance[ axis ] * gain );
		const grey = grade( [ .07, .07, .07 ] ); near( grey[ 0 ], .0672, 'slight red reduction' ); near( grey[ 1 ], .0693, 'near-neutral green' ); near( grey[ 2 ], .0756, 'slight blue increase' );
		const bronze = grade( [ .2, .12, .08 ] ); check( bronze[ 0 ] > bronze[ 2 ] * 2 && Math.hypot( ...bronze.map( ( value, axis ) => value - grey[ axis ] ) ) > .1, 'source hue and texture variation preserved under small grade' );
		const mesh = drawn( key, header( key ) ), shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>' }; mesh.material.onBeforeCompile( shader );
		check( shader.fragmentShader.includes( patch.map ) && shader.fragmentShader.indexOf( patch.map ) < shader.fragmentShader.indexOf( 'vec3 qrAlbedo' ), key + ' barrel-only grade binds before lighting' );

	}

} );

Deno.test( 'super nailgun source: restore public test fixtures', () => {

	globalThis.fetch = oldFetch; THREE.TextureLoader.prototype.load = oldLoad; Cvar_SetValue( 'r_hdr', Number( old.hdr ) ); weapons.r_newer_weapons.value = old.weapons; r_lerpmodels.value = old.lerp;

} );
