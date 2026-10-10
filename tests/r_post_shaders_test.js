// The post pipeline's shaders on their own (card [44h]): each pass's GLSL is complete text with its stage's limits
// written in, as gl_post.js gives it to its materials. Through the public interface of r_post_shaders.js.
import * as shaders from '../src/newer/render/r_post_shaders.js';
import { MAX_LIQUID_REGIONS } from '../src/newer/render/r_post_liquids.js';
import { MAX_VOLUME_LIGHTS } from '../src/newer/render/r_post_config.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'every pass is a whole shader with its limits written in', () => {
	check( /gl_Position/.test( shaders.QUAD_VERTEX ), 'the quad vertex shader places the quad' );
	for ( const name of [ 'VOLUME_FRAGMENT', 'BLOOM_PREFILTER_FRAGMENT', 'BLOOM_DOWN_FRAGMENT', 'BLOOM_UP_FRAGMENT', 'COMPOSITE_FRAGMENT', 'DOF_FRAGMENT', 'PRESENT_FRAGMENT' ] ) {
		const glsl = shaders[ name ];
		check( typeof glsl === 'string' && /void main\s*\(\s*\)/.test( glsl ) && ! glsl.includes( '${' ), name + ' is whole GLSL, every value filled in' );
	}
	check( shaders.COMPOSITE_FRAGMENT.includes( 'const int BOUNCE_SAMPLES' ), 'the composite (as the lighting trial finds it)' );
	check( shaders.COMPOSITE_FRAGMENT.includes( `uniform vec4 uWaterMin[ ${ MAX_LIQUID_REGIONS } ]` ), 'with the liquids stage\'s pool count' );
	check( shaders.COMPOSITE_FRAGMENT.includes( 'vec3 liquidAbsorption( float look )' ), 'and its looks' );
	check( shaders.VOLUME_FRAGMENT.includes( String( MAX_VOLUME_LIGHTS ) ), 'the volume pass with the light count' );
} );
