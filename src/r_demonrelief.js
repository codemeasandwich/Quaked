// Real decorative surface displacement. Only CPU vertex arrays are created;
// the original BSP polygons, lightmap coordinates and collision hulls stay intact.
// Native UVs anchor repeated plaques; the nonseamless donor is clamped within
// clipped tile regions, with closed edges rather than opposite-edge blending.
// Bump with any semantic sampling/tessellation change; durable keys bind it.
export const DEMON_GENERATOR_VERSION='quaked-sculpt-generator-1';
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

	const clamp = field.sampling === 'clamp', width = field.width, height = field.height;
 const lu = clamp ? Math.min(1,Math.max(0,u-(field.tileOrigin?.[0]||0))) : mod(u,1);
 const lv = clamp ? Math.min(1,Math.max(0,v-(field.tileOrigin?.[1]||0))) : mod(v,1);
 const x=lu*width-.5,y=lv*height-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const x0=clamp?Math.min(width-1,Math.max(0,ix)):mod(ix,width),x1=clamp?Math.min(width-1,Math.max(0,ix+1)):mod(ix+1,width);
 const y0=(clamp?Math.min(height-1,Math.max(0,iy)):mod(iy,height))*width,y1=(clamp?Math.min(height-1,Math.max(0,iy+1)):mod(iy+1,height))*width;
 const data=field.data;
 return (data[y0+x0]*(1-fx)+data[y0+x1]*fx)*(1-fy)+(data[y1+x0]*(1-fx)+data[y1+x1]*fx)*fy;
}

export function R_DemonSurfaceData( surface, diagnostic = null ) {
 if(diagnostic)for(const key of Object.keys(diagnostic))delete diagnostic[key];

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
	let positions, normals, uvs, lmuvs, vertexCount = 0;
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
		if ( ( u1 - u0 + 1 ) * ( v1 - v0 + 1 ) > 16 ) { if(diagnostic)Object.assign(diagnostic,{reason:'tile-budget',required:(u1-u0+1)*(v1-v0+1),limit:16}); return null; }
		// Native BSP pieces can cross a texture boundary. Split there before
		// sampling this nonseamless donor, preserving all seven source coordinates.
		for ( let u = u0; u <= u1; u ++ ) for ( let v = v0; v <= v1; v ++ ) {

			let part = clip( vertices, 3, u, true ); part = clip( part, 3, u + 1, false );
			part = clip( part, 4, v, true ); part = clip( part, 4, v + 1, false );
			if ( part.length >= 3 ) polygons.push( { vertices: part, field: { ...field, tileOrigin: [ u, v ] } } );

		}

	}
 // Size the original triangulation once, then write final GPU arrays directly.
 // No per-vertex JS arrays, spreading or growable multi-million-value buffers.
 let totalTriangles=0;
 for(const p of polygons){
  p.tris=[];
  for(let i=1;i<p.vertices.length-1;i++){
   const tri=[p.vertices[0],p.vertices[i+1],p.vertices[i]];
   const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
   const count=Math.min(256,Math.max(1,Math.ceil(Math.max(distance(tri[0],tri[1]),distance(tri[1],tri[2]),distance(tri[2],tri[0]))/step)));
   polygonCounts.set(p,Math.max(polygonCounts.get(p)||1,count));
   p.tris.push({tri,count});totalTriangles+=count*count;
  }
  for(let i=0;i<p.vertices.length;i++){
   const a=p.vertices[i],b=p.vertices[(i+1)%p.vertices.length],ex=b[0]-a[0],ey=b[1]-a[1],ez=b[2]-a[2];
   if(Math.hypot(n[1]*ez-n[2]*ey,n[2]*ex-n[0]*ez,n[0]*ey-n[1]*ex)>=1e-6)totalTriangles+=2*(polygonCounts.get(p)||1);
  }
  if(totalTriangles>262144){if(diagnostic)Object.assign(diagnostic,{reason:'triangle-budget',required:totalTriangles,limit:262144});return null;}
 }
 positions=new Float32Array(totalTriangles*9);normals=new Float32Array(totalTriangles*9);
 uvs=new Float32Array(totalTriangles*6);lmuvs=new Float32Array(totalTriangles*6);
 const emit = (tri,a,b) => {
  const c=1-a-b,t0=tri[0],t1=tri[1],t2=tri[2];
  const u=t0[3]*c+t1[3]*a+t2[3]*b,v=t0[4]*c+t1[4]*a+t2[4]*b;
  const offset=.05+depth*R_DemonHeight(activeField,u,v),i=vertexCount*3,j=vertexCount*2;
  positions[i]=t0[0]*c+t1[0]*a+t2[0]*b+n[0]*offset;
  positions[i+1]=t0[1]*c+t1[1]*a+t2[1]*b+n[1]*offset;
  positions[i+2]=t0[2]*c+t1[2]*a+t2[2]*b+n[2]*offset;
  const eu=1/activeField.width,ev=1/activeField.height;
  const su=activeField.sampling==='clamp'?Math.max(eu,Math.min(1,u-activeField.tileOrigin[0]+eu)-Math.max(0,u-activeField.tileOrigin[0]-eu)):eu*2;
  const sv=activeField.sampling==='clamp'?Math.max(ev,Math.min(1,v-activeField.tileOrigin[1]+ev)-Math.max(0,v-activeField.tileOrigin[1]-ev)):ev*2;
  const du=depth*(R_DemonHeight(activeField,u+eu,v)-R_DemonHeight(activeField,u-eu,v))/(su*texture.width);
  const dv=depth*(R_DemonHeight(activeField,u,v+ev)-R_DemonHeight(activeField,u,v-ev))/(sv*texture.height);
  const g0=du*vectors[0][0]+dv*vectors[1][0],g1=du*vectors[0][1]+dv*vectors[1][1],g2=du*vectors[0][2]+dv*vectors[1][2];
  const component=((0+g0*n[0])+g1*n[1])+g2*n[2];
  const nx=n[0]-g0+component*n[0],ny=n[1]-g1+component*n[1],nz=n[2]-g2+component*n[2],length=Math.hypot(nx,ny,nz);
  normals[i]=nx/length;normals[i+1]=ny/length;normals[i+2]=nz/length;
  uvs[j]=u;uvs[j+1]=v;lmuvs[j]=t0[5]*c+t1[5]*a+t2[5]*b;lmuvs[j+1]=t0[6]*c+t1[6]*a+t2[6]*b;
  vertexCount++;
 };
	for ( const p of polygons ) {

		activeField = p.field;
		const region = { origin: activeField.tileOrigin || null, startVertex: vertexCount };
		for ( const {tri,count} of p.tris ) {
   triangles += count * count;
   // Six adjacent triangle vertices share one lattice sample. Evaluate its
   // height/normal once at identical barycentric coordinates, then copy those
   // final Float32 bytes into the original non-indexed triangle ordering.
   const output={positions,normals,uvs,lmuvs,vertexCount};
   const samples=(count+1)*(count+2)/2;
   positions=new Float32Array(samples*3);normals=new Float32Array(samples*3);
   uvs=new Float32Array(samples*2);lmuvs=new Float32Array(samples*2);vertexCount=0;
   for(let a=0;a<=count;a++)for(let b=0;b<=count-a;b++)emit(tri,a/count,b/count);
   const grid={positions,normals,uvs,lmuvs};
   ({positions,normals,uvs,lmuvs,vertexCount}=output);
   const copy=(a,b)=>{
    const source=a*(count+1)-a*(a-1)/2+b,si=source*3,sj=source*2,i=vertexCount*3,j=vertexCount*2;
    for(let k=0;k<3;k++){positions[i+k]=grid.positions[si+k];normals[i+k]=grid.normals[si+k];}
    uvs[j]=grid.uvs[sj];uvs[j+1]=grid.uvs[sj+1];lmuvs[j]=grid.lmuvs[sj];lmuvs[j+1]=grid.lmuvs[sj+1];vertexCount++;
   };
   for(let a=0;a<count;a++)for(let b=0;b<count-a;b++){
    copy(a,b);copy(a+1,b);copy(a,b+1);
    if(a+b<count-1){copy(a+1,b);copy(a+1,b+1);copy(a,b+1);}
   }
  }

		region.endVertex = vertexCount; tileRegions.push( region );
	}
	const topVertexCount = vertexCount;
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
			const i=vertexCount*3,j=vertexCount*2;
   for(let k=0;k<3;k++){positions[i+k]=vertex[k]+n[k]*offset;normals[i+k]=normal[k];}
   uvs[j]=vertex[3];uvs[j+1]=vertex[4];lmuvs[j]=vertex[5];lmuvs[j+1]=vertex[6];vertexCount++;

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
	if ( triangles > 262144 ) { if(diagnostic)Object.assign(diagnostic,{reason:'triangle-budget',required:triangles,limit:262144}); return null; } // include closed edges in the total budget
	const data = { positions, normals, uvs, lmuvs, triangles, topVertexCount, skirtTriangles, tileRegions };
	cache.set( surface, { field, data, depth, step } );
	return data;

}
