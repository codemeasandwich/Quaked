// Real decorative surface displacement. Only CPU vertex arrays are created;
// the original BSP polygons, lightmap coordinates and collision hulls stay intact.
// Native UVs anchor repeated plaques; the nonseamless donor is clamped within
// clipped tile regions, with closed edges rather than opposite-edge blending.
export const DEMON_TEXTURES = new Set( [ 'dem4_1', 'dem4_4', 'dem5_3' ] );
const cache = new WeakMap();
const filtered = new WeakMap();
const geometryFields = new WeakMap();
const mod = ( n, d ) => ( n % d + d ) % d;

export function R_DemonGeometryField( surface ) {

	const texture = surface?.texinfo?.texture, field = texture?.gl_texture?.userData.newerHeight;
	if ( ! DEMON_TEXTURES.has( texture?.name ) || ! field?.displacement ) return null;
	const amount = field.displacement.smoothing ?? 0;
	if ( ! Number.isFinite( amount ) || amount < 0 || amount > 2 ) return null;
	if ( ! Number.isInteger( field.width ) || ! Number.isInteger( field.height ) || field.width < 2 || field.height < 2 || field.width > 2048 || field.height > 2048 || field.data?.length !== field.width * field.height ) return null;
	if ( ! ( texture.width > 0 && texture.height > 0 ) ) return null;
	const sx = amount * field.width / texture.width * Math.hypot( ...surface.texinfo.vecs[ 0 ].slice( 0, 3 ) );
	const sy = amount * field.height / texture.height * Math.hypot( ...surface.texinfo.vecs[ 1 ].slice( 0, 3 ) );
	if ( ! Number.isFinite( sx ) || ! Number.isFinite( sy ) || sx > 128 || sy > 128 ) return null;
	const saved = geometryFields.get( surface );
	if ( saved?.source === field && saved.sx === sx && saved.sy === sy && saved.sampling === field.sampling ) return saved.field;
	const previous = filtered.get( field );
	if ( ! field.data.every( x => Number.isFinite( x ) && x >= 0 && x <= 1 ) ) return null;
	const index = ( n, size ) => field.sampling === 'clamp' ? Math.min( size - 1, Math.max( 0, n ) ) : mod( n, size );
	const blur = ( input, sigma, horizontal ) => {

		if ( sigma < .01 ) return input;
		const radius = Math.ceil( sigma * 3 ), weights = []; let sum = 0;
		for ( let k = - radius; k <= radius; k ++ ) { const w = Math.exp( - .5 * ( k / sigma ) ** 2 ); weights.push( w ); sum += w; }
		const output = new Float32Array( input.length );
		for ( let y = 0; y < field.height; y ++ ) for ( let x = 0; x < field.width; x ++ ) {

			let value = 0;
			for ( let k = - radius; k <= radius; k ++ ) value += weights[ k + radius ] * input[ horizontal ? y * field.width + index( x + k, field.width ) : index( y + k, field.height ) * field.width + x ];
			output[ y * field.width + x ] = value / sum;

		}
		return output;

	};
	const base = previous?.sx === sx && previous.sy === sy && previous.sampling === field.sampling ? previous.field : { ...field, data: blur( blur( field.data, sx, true ), sy, false ) };
	filtered.set( field, { sx, sy, sampling: field.sampling, field: base } );
	const result = { ...base };
	if ( field.sampling === 'clamp' ) {

		const min = [ Infinity, Infinity ], max = [ - Infinity, - Infinity ];
		for ( let p = surface.polys; p; p = p.next ) for ( let i = 0; i < p.numverts; i ++ ) for ( let k = 0; k < 2; k ++ ) {

			const uv = p.verts instanceof Float32Array ? p.verts[ i * 7 + 3 + k ] : p.verts[ i ][ 3 + k ];
			min[ k ] = Math.min( min[ k ], uv ); max[ k ] = Math.max( max[ k ], uv );

		}
		result.tileOrigin = min.map( ( x, k ) => Math.floor( ( x + max[ k ] ) / 2 ) );

	}
	geometryFields.set( surface, { source: field, sx, sy, sampling: field.sampling, field: result } );
	return result;

}

export function R_DemonHeight( field, u, v ) {

	const clamp = field.sampling === 'clamp';
	const local = ( value, k ) => clamp ? Math.min( 1, Math.max( 0, value - ( field.tileOrigin?.[ k ] || 0 ) ) ) : mod( value, 1 );
	const x = local( u, 0 ) * field.width - .5, y = local( v, 1 ) * field.height - .5;
	const ix = Math.floor( x ), iy = Math.floor( y ), fx = x - ix, fy = y - iy;
	const index = ( n, size ) => clamp ? Math.min( size - 1, Math.max( 0, n ) ) : mod( n, size );
	const at = ( a, b ) => field.data[ index( b, field.height ) * field.width + index( a, field.width ) ];
	return ( at( ix, iy ) * ( 1 - fx ) + at( ix + 1, iy ) * fx ) * ( 1 - fy ) +
		( at( ix, iy + 1 ) * ( 1 - fx ) + at( ix + 1, iy + 1 ) * fx ) * fy;

}

export function R_DemonSurfaceData( surface ) {

	const texture = surface?.texinfo?.texture;
	const field = R_DemonGeometryField( surface );
	if ( ! DEMON_TEXTURES.has( texture?.name ) || ! field?.displacement || ! surface.polys || ! surface.plane ) return null;
	if ( ! Number.isInteger( field.width ) || ! Number.isInteger( field.height ) || field.width < 2 || field.height < 2 || field.width > 2048 || field.height > 2048 ) return null;
	if ( field.data?.length !== field.width * field.height ) return null;
	const depth = field.displacement.depth, step = field.displacement.step;
	if ( ! Number.isFinite( depth ) || depth <= 0 || depth > 24 || ! Number.isFinite( step ) || step < .5 || step > 4 ) return null;
	const old = cache.get( surface );
	if ( old?.field === field && old.depth === depth && old.step === step ) return old.data;
	if ( ! field.data.every( x => Number.isFinite( x ) && x >= 0 && x <= 1 ) ) return null;
	const sign = surface.flags & 2 ? - 1 : 1;
	const n = Array.from( surface.plane.normal, x => x * sign );
	const vectors = surface.texinfo.vecs;
	const positions = [], normals = [], uvs = [], lmuvs = [];
	let triangles = 0, activeField = field;
	const polygonCounts = new Map(), polygons = [], tileRegions = [];
	const clip = ( polygon, axis, boundary, greater ) => {

		const output = [];
		for ( let i = 0; i < polygon.length; i ++ ) {

			const a = polygon[ i ], b = polygon[ ( i + 1 ) % polygon.length ];
			const insideA = greater ? a[ axis ] >= boundary : a[ axis ] <= boundary;
			const insideB = greater ? b[ axis ] >= boundary : b[ axis ] <= boundary;
			if ( insideA ) output.push( a );
			if ( insideA !== insideB ) {

				const t = ( boundary - a[ axis ] ) / ( b[ axis ] - a[ axis ] );
				const point = a.map( ( x, k ) => x + ( b[ k ] - x ) * t );
				point[ axis ] = boundary; output.push( point );

			}

		}
		return output;

	};
	for ( let p = surface.polys; p; p = p.next ) {

		const vertices = Array.from( { length: p.numverts }, ( _, i ) => Array.from( { length: 7 }, ( _, k ) => p.verts instanceof Float32Array ? p.verts[ i * 7 + k ] : p.verts[ i ][ k ] ) );
		if ( field.sampling !== 'clamp' ) { polygons.push( { vertices, field } ); continue; }
		const min = [ 3, 4 ].map( k => Math.min( ...vertices.map( v => v[ k ] ) ) );
		const max = [ 3, 4 ].map( k => Math.max( ...vertices.map( v => v[ k ] ) ) );
		const u0 = Math.floor( min[ 0 ] ), u1 = Math.ceil( max[ 0 ] ) - 1;
		const v0 = Math.floor( min[ 1 ] ), v1 = Math.ceil( max[ 1 ] ) - 1;
		if ( ( u1 - u0 + 1 ) * ( v1 - v0 + 1 ) > 16 ) return null;
		// Native BSP pieces can cross a texture boundary. Split there before
		// sampling this nonseamless donor, preserving all seven source coordinates.
		for ( let u = u0; u <= u1; u ++ ) for ( let v = v0; v <= v1; v ++ ) {

			let part = clip( vertices, 3, u, true ); part = clip( part, 3, u + 1, false );
			part = clip( part, 4, v, true ); part = clip( part, 4, v + 1, false );
			if ( part.length >= 3 ) polygons.push( { vertices: part, field: { ...field, tileOrigin: [ u, v ] } } );

		}

	}
	const emit = ( tri, a, b ) => {

		const vertex = new Array( 7 );
		for ( let k = 0; k < 7; k ++ ) vertex[ k ] = tri[ 0 ][ k ] * ( 1 - a - b ) + tri[ 1 ][ k ] * a + tri[ 2 ][ k ] * b;
		const u = vertex[ 3 ], v = vertex[ 4 ];
		const offset = .05 + depth * R_DemonHeight( activeField, u, v );
		for ( let k = 0; k < 3; k ++ ) positions.push( vertex[ k ] + n[ k ] * offset );
		// Differentiate the actual field in world units. The mesh's geometric
		// normals, rather than a second macro normal/POM layer, own its lighting.
		const eu = 1 / activeField.width, ev = 1 / activeField.height;
		const span = ( value, epsilon, k ) => activeField.sampling === 'clamp'
			? Math.max( epsilon, Math.min( 1, value - activeField.tileOrigin[ k ] + epsilon ) - Math.max( 0, value - activeField.tileOrigin[ k ] - epsilon ) ) : epsilon * 2;
		const du = depth * ( R_DemonHeight( activeField, u + eu, v ) - R_DemonHeight( activeField, u - eu, v ) ) / ( span( u, eu, 0 ) * texture.width );
		const dv = depth * ( R_DemonHeight( activeField, u, v + ev ) - R_DemonHeight( activeField, u, v - ev ) ) / ( span( v, ev, 1 ) * texture.height );
		const g = n.map( ( _, k ) => du * vectors[ 0 ][ k ] + dv * vectors[ 1 ][ k ] );
		const normalComponent = g.reduce( ( sum, x, k ) => sum + x * n[ k ], 0 );
		const normal = n.map( ( x, k ) => x - g[ k ] + normalComponent * x );
		const len = Math.hypot( ...normal );
		normals.push( ...normal.map( x => x / len ) );
		uvs.push( u, v ); lmuvs.push( vertex[ 5 ], vertex[ 6 ] );

	};
	for ( const p of polygons ) {

		activeField = p.field;
		const region = { origin: activeField.tileOrigin || null, startVertex: positions.length / 3 };
		const at = i => p.vertices[ i ];
		for ( let i = 1; i < p.vertices.length - 1; i ++ ) {

			const tri = [ at( 0 ), at( i + 1 ), at( i ) ];
			const distance = ( a, b ) => Math.hypot( ...a.slice( 0, 3 ).map( ( x, k ) => x - b[ k ] ) );
			const count = Math.min( 256, Math.max( 1, Math.ceil( Math.max( distance( tri[ 0 ], tri[ 1 ] ), distance( tri[ 1 ], tri[ 2 ] ), distance( tri[ 2 ], tri[ 0 ] ) ) / step ) ) );
			polygonCounts.set( p, Math.max( polygonCounts.get( p ) || 1, count ) );
			triangles += count * count;
			if ( triangles > 262144 ) return null; // unsupported giant/modded face keeps its original
			for ( let a = 0; a < count; a ++ ) for ( let b = 0; b < count - a; b ++ ) {

				emit( tri, a / count, b / count ); emit( tri, ( a + 1 ) / count, b / count ); emit( tri, a / count, ( b + 1 ) / count );
				if ( a + b < count - 1 ) {

					emit( tri, ( a + 1 ) / count, b / count ); emit( tri, ( a + 1 ) / count, ( b + 1 ) / count ); emit( tri, a / count, ( b + 1 ) / count );

				}

			}

		}

		region.endVertex = positions.length / 3; tileRegions.push( region );
	}
	const topVertexCount = positions.length / 3;
	let skirtTriangles = 0;
	// Close each plaque edge down to the retained wall backing.
	for ( const p of polygons ) for ( let i = 0; i < p.vertices.length; i ++ ) {

		activeField = p.field;
		const at = idx => p.vertices[ idx ];
		const a = at( i ), b = at( ( i + 1 ) % p.vertices.length );
		const edge = b.slice( 0, 3 ).map( ( x, k ) => x - a[ k ] );
		const side = [ n[ 1 ] * edge[ 2 ] - n[ 2 ] * edge[ 1 ], n[ 2 ] * edge[ 0 ] - n[ 0 ] * edge[ 2 ], n[ 0 ] * edge[ 1 ] - n[ 1 ] * edge[ 0 ] ];
		const length = Math.hypot( ...side );
		if ( length < 1e-6 ) continue;
		const normal = side.map( x => x / length ), count = polygonCounts.get( p ) || 1;
		const put = ( vertex, raised ) => {

			const offset = raised ? .05 + depth * R_DemonHeight( activeField, vertex[ 3 ], vertex[ 4 ] ) : 0;
			positions.push( ...vertex.slice( 0, 3 ).map( ( x, k ) => x + n[ k ] * offset ) );
			normals.push( ...normal ); uvs.push( vertex[ 3 ], vertex[ 4 ] ); lmuvs.push( vertex[ 5 ], vertex[ 6 ] );

		};
		for ( let j = 0; j < count; j ++ ) {

			const va = a.map( ( x, k ) => x + ( b[ k ] - x ) * j / count );
			const vb = a.map( ( x, k ) => x + ( b[ k ] - x ) * ( j + 1 ) / count );
			put( va, true ); put( vb, true ); put( vb, false );
			put( va, true ); put( vb, false ); put( va, false );
			skirtTriangles += 2;

		}

	}
	triangles += skirtTriangles;
	if ( triangles > 262144 ) return null; // include closed edges in the total budget
	const data = { positions: new Float32Array( positions ), normals: new Float32Array( normals ), uvs: new Float32Array( uvs ), lmuvs: new Float32Array( lmuvs ), triangles, topVertexCount, skirtTriangles, tileRegions };
	cache.set( surface, { field, data, depth, step } );
	return data;

}
