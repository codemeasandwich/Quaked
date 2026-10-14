/**
 * @module newer/render/r_post_sky
 *
 * The post pipeline's sky (card [44h], split from gl_post.js): how much light comes through a map's sky, its colour
 * and pattern (the light cookie), the direction of the sun, and whether the map and the frame have sky.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `R_BuildWorldLights` (gl_post.js) sets `skyState`'s sun and sky flag and calls `buildSkyCookie`; the cookie holders
 * are given to the composite as uniforms, so they stay the same objects.
 */
import * as THREE from 'three';
import { solidskytexture, alphaskytexture } from '../../engine/render/gl_model.js';
import { SUN_COLOR, SUN_SURFACE_COLOR, SUN_SURFACE, SUN_SCATTER, PILLAR_MAX, PILLAR_DEFAULT, r_bounce, r_cloudspeed } from './r_post_config.js';

// direction towards the sun (worldspawn "_sun_mangle" "yaw pitch" overrides it)

/**
 * The direction towards a sun at the given angles (worldspawn "_sun_mangle" "yaw pitch"), for `R_BuildWorldLights`.
 *
 * @param {number} yaw degrees
 * @param {number} pitch degrees (-90 shines straight down)
 * @returns {Array<number>} a unit vector towards the sun
 */
export function sunFromAngles( yaw, pitch ) {

	const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
	// a sun at pitch -90 shines straight down, so the direction to it points up
	return [ Math.cos( y ) * Math.cos( p ) * - 1, Math.sin( y ) * Math.cos( p ) * - 1, - Math.sin( p ) ];

}

//============================================================================
// Sky analysis
//
// How much light comes through the sky, what colour it is and what pattern it
// has all come from the map's own sky textures, so a bright clear sky gives a
// bright sunlit outdoors and crisp shafts with little haze, while a dark or
// stormy sky gives dim light, faint shafts and more haze.  The pattern (clouds)
// becomes a "cookie" that is projected along the sun so shafts and sunlit
// patches break up the way the sky does.
//============================================================================

const SKY_DEFAULT = { luma: 0.5, color: [ 1, 0.85, 0.65 ], contrast: 0 };
/** What the stages read of the sky: the map's sky analysis (`R_AnalyseSky`), its light cookie and cloud cookie
 * textures (null without), the direction towards the sun (reassigned per map: read it through this object, never
 * keep the array), whether the map has sky and whether the world drew sky this frame (`R_PostNoteSky`). */
export const skyState = { info: SKY_DEFAULT, cookie: null, cookieCloud: null, sunDirection: [ - 0.28, - 0.18, 0.94 ], sunColor: null, hasSky: false, seen: false };

/**
 * The colour the sun takes this map, 0..1 each: the map's own sun colour (worldspawn `_sunlight_color`, which
 * skyState.sunColor holds; card T-3faa98e3 item 13) when it has one, otherwise the colour read from its sky, as before.
 *
 * @returns {ArrayLike<number>} red, green, blue
 */
export function R_SunTint() { return skyState.sunColor ?? skyState.info.color; }
export const cookieNorm = new THREE.Vector3( 1, 1, 1 );
export const cookieMean = new THREE.Vector3( 1, 1, 1 );
export const cookieDepth = { value: 1 };

// brightness is judged the way it looks (display values), not in linear light,
// so a sky that looks mid-dark is not rated as black
function srgbToLinear( v ) {

	return v / 255;

}

/**
 * Analyse RGBA sky layers: the clouds are blended over the solid layer by their alpha and judged in display values
 * (not linear light). Used by the sky cookie built at `R_BuildWorldLights` (and by tests).
 *
 * @param {?ArrayLike<number>} solid the solid sky layer, RGBA bytes, at least `size`² x 4
 * @param {?ArrayLike<number>} cloud the cloud layer, RGBA bytes (ignored when shorter than the solid layer)
 * @param {number} size side of the square layers, texels
 * @returns {?{ luma: number, color: Array<number>, contrast: number, cookie: Float32Array }} mean luma 0..1, the
 *   average colour normalised so its largest channel is 1, contrast 0..1, and a mean-1 cookie (brighter than
 *   average sky passes more light), one value per texel; null when `solid` is missing or too short
 */
export function R_AnalyseSky( solid, cloud, size ) {

	if ( solid == null || solid.length < size * size * 4 ) return null;

	const n = size * size;
	const luma = new Float32Array( n );
	let r = 0, g = 0, b = 0, sum = 0;

	for ( let i = 0; i < n; i ++ ) {

		let cr = srgbToLinear( solid[ i * 4 ] ), cg = srgbToLinear( solid[ i * 4 + 1 ] ), cb = srgbToLinear( solid[ i * 4 + 2 ] );

		if ( cloud != null && cloud.length >= n * 4 ) {

			const a = cloud[ i * 4 + 3 ] / 255;
			cr += ( srgbToLinear( cloud[ i * 4 ] ) - cr ) * a;
			cg += ( srgbToLinear( cloud[ i * 4 + 1 ] ) - cg ) * a;
			cb += ( srgbToLinear( cloud[ i * 4 + 2 ] ) - cb ) * a;

		}

		luma[ i ] = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
		r += cr; g += cg; b += cb; sum += luma[ i ];

	}

	const mean = sum / n;
	let variance = 0;
	for ( let i = 0; i < n; i ++ ) variance += ( luma[ i ] - mean ) * ( luma[ i ] - mean );
	const contrast = Math.min( 1, Math.sqrt( variance / n ) / ( mean + 0.02 ) );

	// the average colour, kept saturated but normalised so it tints and does not dim
	const peak = Math.max( r, g, b ) / n || 1;
	const color = [ r / n / peak, g / n / peak, b / n / peak ];

	// mean-1 cookie: brighter than average sky passes more light
	const cookie = new Float32Array( n );
	for ( let i = 0; i < n; i ++ ) cookie[ i ] = luma[ i ] / ( mean + 1e-4 );

	return { luma: mean, color, contrast, cookie };

}

/**
 * Shared strength derived from the sky: 0 = a dark sky, 1 = a bright clear one.
 *
 * @param {number} luma mean sky luma 0..1 (from `R_AnalyseSky`)
 * @returns {number} 0..1, a smoothstep from luma 0.05 to 0.45
 */
export function R_SkyBrightness( luma ) {

	const t = Math.max( 0, Math.min( 1, ( luma - 0.05 ) / 0.4 ) );
	return t * t * ( 3 - 2 * t );

}

/**
 * The current map's sky analysis, rebuilt at `R_BuildWorldLights`. Not called elsewhere in the current tree.
 *
 * @returns {{ luma: number, color: Array<number>, contrast: number }} the live module object (do not mutate); the
 *   default `{ luma: 0.5, color: [1, 0.85, 0.65], contrast: 0 }` when the map's sky could not be analysed
 */
export function R_GetSkyInfo() {

	return skyState.info;

}

/**
 * Builds the current map's sky light cookie and cloud cookie textures from its sky (`skyState.cookie`,
 * `skyState.cookieCloud`, null without a sky) and their uniform holders, once a map's lights are built
 * (`R_BuildWorldLights`).
 */
export function buildSkyCookie() {

	skyState.info = SKY_DEFAULT;
	if ( skyState.cookie !== null ) { skyState.cookie.dispose(); skyState.cookie = null; }
	if ( skyState.cookieCloud !== null ) { skyState.cookieCloud.dispose(); skyState.cookieCloud = null; }

	const sd = solidskytexture != null && solidskytexture.image != null ? solidskytexture.image.data : null;
	const ad = alphaskytexture != null && alphaskytexture.image != null ? alphaskytexture.image.data : null;
	const size = solidskytexture != null && solidskytexture.image != null ? solidskytexture.image.width : 0;
	const result = size > 0 ? R_AnalyseSky( sd, ad, size ) : null;
	if ( result == null ) return;

	skyState.info = { luma: result.luma, color: result.color, contrast: result.contrast };

	// how much of the pattern shows through: a clear sky barely varies, a cloudy or veined one (lightning,
	// storm) carries its pattern well into the shafts
	const depth = 0.75 + 1.1 * result.contrast;

	// the pattern in colour: how much brighter than the sky's average each part is (a steeper curve,
	// so the bright veins stand out from the dark clouds), and where the colour differs from the average
	const n = size * size;
	const mean = [ 0, 0, 0 ];
	const pix = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) {

		let cr = sd[ i * 4 ] / 255, cg = sd[ i * 4 + 1 ] / 255, cb = sd[ i * 4 + 2 ] / 255;
		if ( ad != null && ad.length >= n * 4 ) {

			const a = ad[ i * 4 + 3 ] / 255;
			cr += ( ad[ i * 4 ] / 255 - cr ) * a;
			cg += ( ad[ i * 4 + 1 ] / 255 - cg ) * a;
			cb += ( ad[ i * 4 + 2 ] / 255 - cb ) * a;

		}

		pix[ i * 3 ] = cr; pix[ i * 3 + 1 ] = cg; pix[ i * 3 + 2 ] = cb;
		mean[ 0 ] += cr; mean[ 1 ] += cg; mean[ 2 ] += cb;

	}

	for ( let k = 0; k < 3; k ++ ) mean[ k ] = mean[ k ] / n + 1e-4;

	let total = [ 0, 0, 0 ];
	const rgb = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) {

		const bright = Math.pow( Math.max( result.cookie[ i ], 0 ), 1 + 0.9 * depth );
		for ( let k = 0; k < 3; k ++ ) {

			const hue = Math.pow( pix[ i * 3 + k ] / mean[ k ] / Math.max( result.cookie[ i ], 1e-3 ), 0.6 );
			rgb[ i * 3 + k ] = Math.max( 0, bright * Math.min( hue, 2.5 ) );
			total[ k ] += rgb[ i * 3 + k ];

		}

	}

	// each channel averages 1 (so the pattern shapes the light and does not dim or tint the whole of it): the
	// shader works the same curve out for each point, and divides by these
	cookieNorm.set( total[ 0 ] / n + 1e-4, total[ 1 ] / n + 1e-4, total[ 2 ] / n + 1e-4 );
	cookieMean.set( mean[ 0 ], mean[ 1 ], mean[ 2 ] );
	cookieDepth.value = depth;

	// The sky is two layers that move at their own speeds (the solid one 8 units a second, the clouds over it
	// 16), so the pattern is kept as the two layers and put together in the shader, each scrolled at its own
	// speed: the light on the ground then moves as the clouds overhead do.
	const make = ( withAlpha ) => {

		const data = new Uint16Array( n * 4 );
		const src = withAlpha ? ad : sd;
		for ( let i = 0; i < n * 4; i ++ ) data[ i ] = THREE.DataUtils.toHalfFloat( ( withAlpha || ( i & 3 ) !== 3 ) && src != null ? src[ i ] / 255 : 1 );

		const t = new THREE.DataTexture( data, size, size, THREE.RGBAFormat, THREE.HalfFloatType );
		t.wrapS = THREE.RepeatWrapping;
		t.wrapT = THREE.RepeatWrapping;
		t.magFilter = THREE.LinearFilter;
		t.minFilter = THREE.LinearFilter;
		t.colorSpace = THREE.NoColorSpace;
		t.needsUpdate = true;
		return t;

	};

	skyState.cookie = make( false );
	if ( skyState.cookieCloud !== null ) skyState.cookieCloud.dispose();
	skyState.cookieCloud = ad != null && ad.length >= n * 4 ? make( true ) : null;

}


// the world renderer reports when it draws sky; sun shafts only make sense then

/**
 * The world renderer reports when it draws sky (gl_rsurf.js `R_DrawSkyChain`); sun shafts only make sense then.
 * Reset by every `R_PostBegin`.
 */
export function R_PostNoteSky() {

	skyState.seen = true;

}

/**
 * Whether the current map has any sky surface (found by `R_BuildWorldLights`); gl_rmain.js passes it to
 * `R_PostLightsFrame` and `R_PostFinish` as `hasSkyView`.
 *
 * @returns {boolean} true when the world model has a sky surface
 */
export function R_MapHasSky() {

	return skyState.hasSky;

}

/**
 * This frame's sun uniforms (from `R_PostFinish`): whether the sun shines into the view, its colour, strength and
 * pattern from the map's sky, the light shafts' sun density, the bounced light, the cloud cookie's drift and the sun's
 * direction. The sun's shadow map is drawn after, by the caller, when it shines.
 *
 * @param {object} p the pipeline (`postState.gpu`)
 * @param {THREE.Camera} camera the view camera
 * @param {number} time client time, seconds
 * @param {boolean} lighting whether advanced lighting is on
 * @param {boolean} hasSkyView whether the view can see sky
 * @returns {boolean} whether the sun shines this frame
 */
export function R_PostSkyUniforms( p, camera, time, lighting, hasSkyView ) {

	const sh = p.shared;
	// the sun, when the map has sky to light it; how strong, what colour and what
	// pattern all come from the map's sky
	const sunOn = lighting && hasSkyView === true;
	sh.uSunOn.value = sunOn ? 1 : 0;

	const bright = R_SkyBrightness( skyState.info.luma );
	const sunGain = 0.5 + 0.9 * bright; // a dark sky still gives a little
	const tint = R_SunTint();
	sh.uSunCol.value.set(
		SUN_COLOR[ 0 ] * sunGain * ( 0.55 + 0.45 * tint[ 0 ] ),
		SUN_COLOR[ 1 ] * sunGain * ( 0.55 + 0.45 * tint[ 1 ] ),
		SUN_COLOR[ 2 ] * sunGain * ( 0.55 + 0.45 * tint[ 2 ] ) );
	p.compositeMaterial.uniforms.uSunSurfaceCol.value.set(
		SUN_SURFACE_COLOR[ 0 ] * ( 0.6 + 0.4 * tint[ 0 ] ),
		SUN_SURFACE_COLOR[ 1 ] * ( 0.6 + 0.4 * tint[ 1 ] ),
		SUN_SURFACE_COLOR[ 2 ] * ( 0.6 + 0.4 * tint[ 2 ] ) );
	p.compositeMaterial.uniforms.uSunSurface.value = SUN_SURFACE * ( 0.5 + 0.8 * bright );
	// Hold the original nominal sun density. One common compositing gain below
	// makes sun, point lights and the flashlight respond to the same slider once.
	p.volumeMaterial.uniforms.uSunScatter.value = SUN_SCATTER * PILLAR_MAX * PILLAR_DEFAULT * ( 1.4 + 1.0 * bright );
	// a bright, clear sky leaves open air nearly free of haze; a dark one hazier
	p.volumeMaterial.uniforms.uOpenFog.value = 0; // no broad atmospheric veil
	// a bright, clear sky is crisp; a dark one a little hazier
	sh.uBounce.value = lighting ? Math.max( 0, r_bounce.value ) : 0;
	sh.tCookie.value = skyState.cookie;
	sh.tCookieCloud.value = skyState.cookieCloud;
	sh.uCookieCloud.value = skyState.cookieCloud !== null ? 1 : 0;
	sh.uCookie.value = skyState.cookie !== null ? 1 : 0;
	sh.uCookieTime.value = time * Math.max( 0, r_cloudspeed.value );
	if ( sunOn ) {

		const e = camera.matrixWorldInverse.elements;
		const sd = skyState.sunDirection;
		sh.uSunDirV.value.set(
			e[ 0 ] * sd[ 0 ] + e[ 4 ] * sd[ 1 ] + e[ 8 ] * sd[ 2 ],
			e[ 1 ] * sd[ 0 ] + e[ 5 ] * sd[ 1 ] + e[ 9 ] * sd[ 2 ],
			e[ 2 ] * sd[ 0 ] + e[ 6 ] * sd[ 1 ] + e[ 10 ] * sd[ 2 ] ).normalize();
		sh.uSunDirW.value.set( sd[ 0 ], sd[ 1 ], sd[ 2 ] ).normalize();

	}
	return sunOn;

}
