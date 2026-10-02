// Data-defined UV-scoped palette and native-skin wrapping. The source bitmaps,
// donor topology, UVs and normal maps remain untouched. Styles run before baked
// lighting/albedo capture so room lighting still uses the corrected colours.
import * as THREE from 'three';

const number = value => Number( value ).toFixed( 9 );
const vec = values => `vec${values.length}( ${values.map( number ).join( ', ' )} )`;
function inside( rect ) {

	return `( step( ${number( rect[ 0 ] )}, vMapUv.x ) * step( vMapUv.x, ${number( rect[ 2 ] )} ) * step( ${number( rect[ 1 ] )}, vMapUv.y ) * step( vMapUv.y, ${number( rect[ 3 ] )} ) )`;

}

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
