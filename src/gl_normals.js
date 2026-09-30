// Normal map generation: turns Quake's flat palette textures into tangent-space
// normal maps (with a height map in alpha) so lit surfaces have relief.
//
// Quake's textures are painted with their shading baked in (mortar is dark,
// stones are lighter, cracks are black), so brightness is a good proxy for
// height.  The pipeline for one texture:
//
//   1. Height: luminance, plus any fullbright texels (they are stored in a
//      separate texture because the base has them blacked out).
//   2. Normalise: subtract the mean and divide by the standard deviation, so a
//      murky texture and a contrasty one both end up using the full range.
//   3. Multi-scale: blend the height field with box-blurred copies (fine grain,
//      medium cracks, coarse blocks), so a brick reads as a brick and not just
//      as noise.  Blurs and gradients wrap, because the textures tile.
//   4. Gradient: Sobel filter, scaled by the texture's size so the apparent
//      slope is the same whatever the resolution.
//   5. Normal: n = normalize( -dh/du, -dh/dv, 1 ); alpha keeps the height for
//      parallax.
//
// It is generated once per texture on demand, from the texels already in memory.

import * as THREE from 'three';

// how strongly each blur scale contributes to the height field
const SCALES = [
	{ radius: 0, weight: 0.3 },
	{ radius: 1, weight: 0.5 },
	{ radius: 3, weight: 1.0 },
	{ radius: 6, weight: 0.6 }
];

// How steep the relief is.  Busy textures (wiring, panels) have detail at every scale:
// too much relief turns each speck into a bump and the picture is lost under the
// lighting, so the slope is limited (below) as well as scaled.
export const NORMAL_STRENGTH = 1.3;
const MAX_TILT = 0.5; // the steepest a facet may lean, as a slope (about 27 degrees)

function luminance( r, g, b ) {

	return ( r * 0.299 + g * 0.587 + b * 0.114 ) / 255;

}

// height in 0..1 from RGBA texels (and optional fullbright RGBA texels)
export function R_HeightFromRGBA( rgba, width, height, fullbright ) {

	const n = width * height;
	const h = new Float32Array( n );

	let sum = 0;
	for ( let i = 0; i < n; i ++ ) {

		let l = luminance( rgba[ i * 4 ], rgba[ i * 4 + 1 ], rgba[ i * 4 + 2 ] );
		if ( fullbright != null && fullbright[ i * 4 + 3 ] !== 0 )
			l = Math.max( l, luminance( fullbright[ i * 4 ], fullbright[ i * 4 + 1 ], fullbright[ i * 4 + 2 ] ) );

		h[ i ] = l;
		sum += l;

	}

	// contrast normalisation
	const mean = sum / n;
	let variance = 0;
	for ( let i = 0; i < n; i ++ ) variance += ( h[ i ] - mean ) * ( h[ i ] - mean );
	const sd = Math.sqrt( variance / n ) || 1;

	for ( let i = 0; i < n; i ++ )
		h[ i ] = Math.max( 0, Math.min( 1, 0.5 + ( h[ i ] - mean ) / ( sd * 6 ) ) );

	return h;

}

// separable box blur that wraps at the edges
export function R_BoxBlurWrapped( src, width, height, radius ) {

	if ( radius <= 0 ) return src;

	const tmp = new Float32Array( src.length );
	const out = new Float32Array( src.length );
	const span = radius * 2 + 1;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			let acc = 0;
			for ( let k = - radius; k <= radius; k ++ )
				acc += src[ y * width + ( ( x + k + width * 4 ) % width ) ];
			tmp[ y * width + x ] = acc / span;

		}

	}

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			let acc = 0;
			for ( let k = - radius; k <= radius; k ++ )
				acc += tmp[ ( ( y + k + height * 4 ) % height ) * width + x ];
			out[ y * width + x ] = acc / span;

		}

	}

	return out;

}

// blend of the height field at several scales, in 0..1
export function R_MultiScaleHeight( base, width, height ) {

	const out = new Float32Array( base.length );
	let total = 0;

	for ( const s of SCALES ) {

		// no point blurring wider than a quarter of the texture
		const radius = Math.min( s.radius, ( Math.min( width, height ) >> 2 ) );
		const blurred = R_BoxBlurWrapped( base, width, height, radius );
		for ( let i = 0; i < out.length; i ++ ) out[ i ] += blurred[ i ] * s.weight;
		total += s.weight;

	}

	for ( let i = 0; i < out.length; i ++ ) out[ i ] /= total;
	return out;

}

// tangent-space normals (RGBA8, height in alpha) from a height field
export function R_NormalsFromHeight( h, width, height, strength = NORMAL_STRENGTH ) {

	const out = new Uint8Array( width * height * 4 );

	// gradients are in height per texel; a 64 wide texture spans 64 texels
	// across one tile, so scale by the size to keep the same visible slope
	const scale = strength * Math.sqrt( width * height ) / 8;

	const at = ( x, y ) => h[ ( ( y + height ) % height ) * width + ( ( x + width ) % width ) ];

	let lo = 1, hi = 0;
	for ( let i = 0; i < h.length; i ++ ) {

		if ( h[ i ] < lo ) lo = h[ i ];
		if ( h[ i ] > hi ) hi = h[ i ];

	}

	const range = hi - lo || 1;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			// Sobel
			const gx = ( at( x + 1, y - 1 ) + 2 * at( x + 1, y ) + at( x + 1, y + 1 ) )
				- ( at( x - 1, y - 1 ) + 2 * at( x - 1, y ) + at( x - 1, y + 1 ) );
			const gy = ( at( x - 1, y + 1 ) + 2 * at( x, y + 1 ) + at( x + 1, y + 1 ) )
				- ( at( x - 1, y - 1 ) + 2 * at( x, y - 1 ) + at( x + 1, y - 1 ) );

			// u grows with x and v with the row index, the same as the texture coordinates
			let nx = - gx * 0.125 * scale;
			let ny = - gy * 0.125 * scale;
			let nz = 1;
			const len = Math.sqrt( nx * nx + ny * ny + nz * nz );
			nx /= len; ny /= len; nz /= len;

			const o = ( y * width + x ) * 4;
			out[ o ] = Math.round( ( nx * 0.5 + 0.5 ) * 255 );
			out[ o + 1 ] = Math.round( ( ny * 0.5 + 0.5 ) * 255 );
			out[ o + 2 ] = Math.round( ( nz * 0.5 + 0.5 ) * 255 );
			out[ o + 3 ] = Math.round( ( ( h[ y * width + x ] - lo ) / range ) * 255 );

		}

	}

	return out;

}

// Tangent-space normals (RGBA8, height in alpha) from a crafted height field: a height map made offline
// for one texture (tools/craft_normals.py, which has the same maths), in 0..1, and how steep to make it.
export function R_NormalsFromCraftedHeight( h, width, height, strength ) {

	const out = new Uint8Array( width * height * 4 );
	const sc = strength * Math.sqrt( width * height ) / 8;
	const at = ( x, y ) => h[ ( ( y + height ) % height ) * width + ( ( x + width ) % width ) ];

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			// a weighted difference across the texel: 3 for its own row (or column), 1 for each neighbour's
			const gx = ( 3 * ( at( x + 1, y ) - at( x - 1, y ) )
				+ ( at( x + 1, y - 1 ) - at( x - 1, y - 1 ) ) + ( at( x + 1, y + 1 ) - at( x - 1, y + 1 ) ) ) / 10 * 0.5;
			const gy = ( 3 * ( at( x, y + 1 ) - at( x, y - 1 ) )
				+ ( at( x - 1, y + 1 ) - at( x - 1, y - 1 ) ) + ( at( x + 1, y + 1 ) - at( x + 1, y - 1 ) ) ) / 10 * 0.5;

			let nx = - gx * sc;
			let ny = - gy * sc;

			// a soft cap on how steeply a facet may lean
			const m = Math.sqrt( nx * nx + ny * ny );
			const cap = 1 / Math.sqrt( 1 + ( m / 1.1 ) * ( m / 1.1 ) );
			nx *= cap;
			ny *= cap;

			const len = Math.sqrt( nx * nx + ny * ny + 1 );
			const o = ( y * width + x ) * 4;
			out[ o ] = Math.round( ( nx / len * 0.5 + 0.5 ) * 255 );
			out[ o + 1 ] = Math.round( ( ny / len * 0.5 + 0.5 ) * 255 );
			out[ o + 2 ] = Math.round( ( 1 / len * 0.5 + 0.5 ) * 255 );
			out[ o + 3 ] = Math.round( h[ y * width + x ] * 255 );

		}

	}

	return out;

}

// the complete pipeline on raw texels
export function R_GenerateNormalData( rgba, width, height, fullbright ) {

	const base = R_HeightFromRGBA( rgba, width, height, fullbright );
	const shaped = R_MultiScaleHeight( base, width, height );
	return R_NormalsFromHeight( shaped, width, height );

}

//============================================================================
// Three.js textures
//============================================================================

// generated maps by texel content, kept across levels
const generated = new Map();
const MAX_GENERATED = 600;

// a cheap hash of a texture's texels (FNV-1a over every 5th byte)
function hashTexels( data ) {

	let h = 2166136261;
	for ( let i = 0; i < data.length; i += 5 ) h = Math.imul( h ^ data[ i ], 16777619 );
	return ( h >>> 0 ).toString( 36 ) + data.length;

}

// Normal map for a diffuse DataTexture (built once and cached on it).  Returns
// null for textures we cannot read.
export function R_NormalMapFor( diffuse ) {

	if ( diffuse == null || diffuse.image == null || diffuse.image.data == null ) return null;
	if ( diffuse._normalMap !== undefined ) return diffuse._normalMap;

	const { width, height, data } = diffuse.image;
	const fb = diffuse._fullbright != null && diffuse._fullbright.image != null ? diffuse._fullbright.image.data : null;

	// the same picture on the next level (or the next visit) needs no new maps
	// a height map crafted for this texture, when it has one of the same size
	const crafted = diffuse.userData != null ? diffuse.userData.newerHeight : undefined;
	const useCrafted = crafted != null && crafted.width === width && crafted.height === height;

	const key = useCrafted ? 'crafted:' + crafted.file + ':' + crafted.strength
		: width + 'x' + height + ':' + hashTexels( data ) + ( fb !== null ? ':' + hashTexels( fb ) : '' );
	let pixels = generated.get( key );
	if ( pixels === undefined ) {

		pixels = useCrafted ? R_NormalsFromCraftedHeight( crafted.data, width, height, crafted.strength )
			: R_GenerateNormalData( data, width, height, fb );
		if ( generated.size >= MAX_GENERATED ) generated.delete( generated.keys().next().value );
		generated.set( key, pixels );

	}

	const texture = new THREE.DataTexture( pixels, width, height, THREE.RGBAFormat );
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 16;
	texture.colorSpace = THREE.NoColorSpace; // data, not colour
	texture.needsUpdate = true;

	// go away with the texture it belongs to
	diffuse.addEventListener( 'dispose', function () {

		texture.dispose();
		diffuse._normalMap = undefined;

	} );

	diffuse._normalMap = texture;
	return texture;

}
