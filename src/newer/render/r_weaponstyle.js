/**
 * @module newer/render/r_weaponstyle
 *
 * Weapon styles: palette changes and skin wrapping for the imported weapons, defined as data.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Data-defined UV-scoped palette and native-skin wrapping. The source bitmaps,
// donor topology, UVs and normal maps remain untouched. Styles run before baked
// lighting/albedo capture so room lighting still uses the corrected colours.
import * as THREE from 'three';

const number = value => Number( value ).toFixed( 9 );
const vec = values => `vec${values.length}( ${values.map( number ).join( ', ' )} )`;
function inside( rect ) {

	return `( step( ${number( rect[ 0 ] )}, vMapUv.x ) * step( vMapUv.x, ${number( rect[ 2 ] )} ) * step( ${number( rect[ 1 ] )}, vMapUv.y ) * step( vMapUv.y, ${number( rect[ 3 ] )} ) )`;

}

/**
 * Compiles an imported weapon's data-defined style (from the weapon manifest's `material.style`) into GLSL snippets
 * for the alias shader, once per material from `R_AssetAliasMaterial` (r_newerskins.js). The source bitmaps, donor
 * topology, UVs and normal maps remain untouched; the snippets run after `#include <map_fragment>`, before baked
 * lighting/albedo capture, so room lighting still uses the corrected colours. UV rectangles are `[u0, v0, u1, v1]` in
 * the skin's 0..1 UV space.
 *
 * @param {?{ palette?: Array<{ rect: Array<number>, tint: Array<number>, gain?: number, chroma?: 'blue' }>,
 *   grading?: Array<{ rect: Array<number>, balance?: Array<number>, gain?: number, saturation?: number,
 *   contrast?: number }>, originalWrap?: { donorRect: Array<number>, nativeRects: Object<string, Array<number>>,
 *   swapAxes?: boolean, opacity?: number, suppressEmission?: boolean } }} style the style; null/undefined means none.
 *   `palette` recolours a rectangle to `tint` (sRGB 0..255) keeping the source luminance (`chroma: 'blue'` limits it to
 *   blue-dominant texels); `grading` adjusts balance, gain, saturation and contrast (around 0.18) in a rectangle;
 *   `originalWrap` maps the donor rectangle onto the native Quake skin's rectangle for this role
 * @param {string} role the weapon model key (e.g. `v_light`, `g_light`) that selects `originalWrap.nativeRects`
 * @returns {{ head: string, map: string, emission: string, wrap: boolean, opacity?: number }} `head` uniform
 *   declarations (`qrNativeSkin`, `uHasNativeSkin` when wrapping), `map` the colour code, `emission` code that removes
 *   luma glow over the wrapped core, `wrap` whether the native skin is wrapped (the caller must then bind
 *   `qrNativeSkin`/`uHasNativeSkin`), and `opacity` the wrapped core's alpha factor (absent when `style` is empty)
 */
export function R_WeaponStyleGLSL( style, role ) {

	if ( ! style ) return { head: '', map: '', emission: '', wrap: false };
	const rules = style.palette || [], wrap = style.originalWrap;
	const nativeRect = wrap?.nativeRects?.[ role ];
	let map = '\nvec3 qrSourceColour = diffuseColor.rgb;\nfloat qrSourceLuma = dot( qrSourceColour, vec3( 0.2126, 0.7152, 0.0722 ) );\n';
	for ( const rule of rules ) {

		const tint = new THREE.Color().setRGB( ...rule.tint.map( v => v / 255 ), THREE.SRGBColorSpace );
		const rgb = tint.toArray(), light = rgb[ 0 ] * .2126 + rgb[ 1 ] * .7152 + rgb[ 2 ] * .0722;
		const ratio = rgb.map( v => v / Math.max( light, 1e-6 ) );
		const mask = inside( rule.rect ) + ( rule.chroma === 'blue' ? ' * smoothstep( 0.01, 0.04, qrSourceColour.b - max( qrSourceColour.r, qrSourceColour.g ) )' : '' );
		map += `diffuseColor.rgb = mix( diffuseColor.rgb, qrSourceLuma * ${vec( ratio )} * ${number( rule.gain ?? 1 )}, ${mask} );\n`;

	}
	for ( const [ i, rule ] of ( style.grading || [] ).entries() ) {

		map += `vec3 qrGrade${i} = max( qrSourceColour * ${vec( rule.balance || [ 1, 1, 1 ] )} * ${number( rule.gain ?? 1 )}, vec3( 0.0 ) );
qrGrade${i} = mix( vec3( dot( qrGrade${i}, vec3( 0.2126, 0.7152, 0.0722 ) ) ), qrGrade${i}, ${number( rule.saturation ?? 1 )} );
qrGrade${i} = 0.18 * pow( qrGrade${i} / 0.18, vec3( ${number( rule.contrast ?? 1 )} ) );
diffuseColor.rgb = mix( diffuseColor.rgb, qrGrade${i}, ${inside( rule.rect )} );\n`;

	}
	let emission = '';
	if ( nativeRect ) {

		const [ u0, v0, u1, v1 ] = wrap.donorRect;
		map += `float qrCoreMask = ${inside( wrap.donorRect )};
vec2 qrCoreUv = clamp( ( vMapUv - ${vec( [ u0, v0 ] )} ) / ${vec( [ u1 - u0, v1 - v0 ] )}, 0.0, 1.0 );
vec2 qrNativeUv = ${vec( nativeRect.slice( 0, 2 ) )} + qrCoreUv.${wrap.swapAxes ? 'yx' : 'xy'} * ${vec( [ nativeRect[ 2 ] - nativeRect[ 0 ], nativeRect[ 3 ] - nativeRect[ 1 ] ] )};
if ( uHasNativeSkin > 0.5 ) diffuseColor.rgb = mix( diffuseColor.rgb, texture2D( qrNativeSkin, qrNativeUv ).rgb, qrCoreMask );
diffuseColor.a *= mix( 1.0, ${number( wrap.opacity ?? 1 )}, qrCoreMask );\n`;
		if ( wrap.suppressEmission ) emission = 'qrEmission *= 1.0 - qrCoreMask;\n';

	}
	return { head: nativeRect ? 'uniform sampler2D qrNativeSkin;\nuniform float uHasNativeSkin;\n' : '', map, emission, wrap: !! nativeRect,
		opacity: nativeRect ? wrap.opacity ?? 1 : 1 };

}
