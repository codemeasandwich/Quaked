/**
 * @module newer/render/gl_normals
 *
 * Normal maps: Quake's palette textures turned into tangent-space normal maps with height in alpha, so lit surfaces
 * have relief.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Normal maps for Quake's textures, as Three.js textures, generated once per texture content and cached. The maths
// (height from the picture, multi-scale shaping, normals) is in normal_math.js.

import * as THREE from 'three';
import {R_NormalPrepared} from '../assets/normal_prepare.js';
import { NORMAL_STRENGTH, R_HeightFromRGBA, R_BoxBlurWrapped, R_MultiScaleHeight, R_NormalsFromHeight, R_NormalsFromCraftedHeight, R_GenerateNormalData } from './normal_math.js';
// (the maths moved to normal_math.js in [44g]; this module's public names stay the same)
export { NORMAL_STRENGTH, R_HeightFromRGBA, R_BoxBlurWrapped, R_MultiScaleHeight, R_NormalsFromHeight, R_NormalsFromCraftedHeight, R_GenerateNormalData };

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
	const prepared=R_NormalPrepared(diffuse);if(prepared&&prepared.status!=='ready')return null;
	if(diffuse._normalMap!==undefined&&diffuse._normalPreparedData!==prepared?.data){diffuse._normalMap?.dispose();diffuse._normalMap=undefined;}
	if ( diffuse._normalMap !== undefined ) return diffuse._normalMap;
	const { width, height, data } = diffuse.image;
	const fb = diffuse._fullbright != null && diffuse._fullbright.image != null ? diffuse._fullbright.image.data : null;

	// the same picture on the next level (or the next visit) needs no new maps
	// a height map crafted for this texture, when it has one of the same size
	const crafted = diffuse.userData != null ? diffuse.userData.newerHeight : undefined;
	const useCrafted = crafted != null && crafted.width === width && crafted.height === height;

	const donor = useCrafted ? crafted.authoredNormal : null;
	const authored = donor && donor.width===width && donor.height===height && donor.data?.length===width*height*4;
	const key = useCrafted ? 'crafted:' + crafted.file + ':' + ( crafted.dataFile || '' ) + ':' + crafted.strength + ':' + crafted.cap + ':' + ( crafted.edgeSource?.file || '' ) + ':' + ( authored ? donor.file + ':' + hashTexels(donor.data) : '' )
		: width + 'x' + height + ':' + hashTexels( data ) + ( fb !== null ? ':' + hashTexels( fb ) : '' );
	let pixels = prepared?.data?.pixels || generated.get( key );
	if ( pixels === undefined ) {

		pixels = authored ? new Uint8Array(donor.data) : useCrafted ? R_NormalsFromCraftedHeight( crafted.data, width, height, crafted.strength, crafted.cap, crafted.edgeSource )
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
	const gloss=authored?crafted.authoredGloss:null;
 if(gloss && gloss.width===width && gloss.height===height && gloss.data?.length===width*height*4 && gloss.data.some((v,i)=>i%4===0&&v>20)){
  const map=new THREE.DataTexture(new Uint8Array(gloss.data),width,height,THREE.RGBAFormat);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.colorSpace=THREE.NoColorSpace;map.offset.copy(diffuse.offset);map.needsUpdate=true;
  texture.userData.glassGloss=map;texture.addEventListener('dispose',()=>map.dispose());
 }
 texture.userData.heightSource = true; // alpha was explicitly generated from the scalar height field
	texture.offset.copy( diffuse.offset ); // a picture moved on its faces (crates) moves its relief too
	texture.needsUpdate = true;
	if ( useCrafted && crafted.relief ) texture.userData.surfaceRelief = { ...crafted.relief };
	if ( useCrafted && crafted.edgeSource ) {

		// Keep the uncarved material's smoothed height as a lighting reference.
		// Only recess depth is shaded; its authored colour stays untouched.
		const e = crafted.edgeSource;
		const reference = new THREE.DataTexture( prepared?.data?.reference || R_NormalsFromCraftedHeight( e.data, e.width, e.height, 0 ), e.width, e.height, THREE.RGBAFormat );
		reference.wrapS = reference.wrapT = THREE.RepeatWrapping;
		reference.magFilter = THREE.LinearFilter;
		reference.minFilter = THREE.LinearMipmapLinearFilter;
		reference.generateMipmaps = true;
		reference.needsUpdate = true;
		texture.userData.referenceHeight = reference;
		texture.userData.referenceUV = new THREE.Vector4( width / e.width, height / e.height, e.offset[ 0 ] / e.width, e.offset[ 1 ] / e.height );
		texture.addEventListener( 'dispose', () => reference.dispose() );

	}

	// go away with the texture it belongs to
	diffuse.addEventListener( 'dispose', function () {

		texture.dispose();
		diffuse._normalMap = undefined;

	} );

	diffuse._normalPreparedData=prepared?.data;
	diffuse._normalMap = texture;
	return texture;

}
