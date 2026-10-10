// The post pipeline's targets stage on its own (card [44h]): its render targets' kind, whether a renderer can run the
// pipeline, and dynamic resolution, which steps down while frames are slow and holds full size with r_dynres 0.
// Through the public interface of r_post_targets.js, with real Three.js targets.
import * as THREE from 'three';
import * as targets from '../src/newer/render/r_post_targets.js';
import { r_dynres, r_fps_target } from '../src/newer/render/r_post_config.js';
import * as vars from '../src/engine/common/cvar.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
for ( const v of [ r_dynres, r_fps_target ] ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );

Deno.test( 'a target is half-float, linear, without depth unless asked; WebGL2 with float colour can run the pipeline', () => {
	const rt = targets.makeRT( 0, 64 );
	same( rt.width, 1, 'never zero wide' ); same( rt.texture.type, THREE.HalfFloatType, 'half float' );
	same( rt.texture.minFilter, THREE.LinearFilter, 'linear' ); same( rt.depthBuffer, false, 'no depth' );
	same( targets.makeRT( 8, 8, { depthBuffer: true } ).depthBuffer, true, 'unless asked' );
	const renderer = ( webgl2, ext ) => ( { capabilities: { isWebGL2: webgl2 }, extensions: { has: e => ext.includes( e ) } } );
	same( targets.R_PostSupported( renderer( true, [ 'EXT_color_buffer_half_float' ] ) ), true, 'WebGL2 with half-float colour' );
	same( targets.R_PostSupported( renderer( false, [ 'EXT_color_buffer_float' ] ) ), false, 'not WebGL1' );
	same( targets.R_PostSupported( renderer( true, [] ) ), false, 'nor without float colour' );
	same( targets.R_PostSupported( null ), false, 'nor without a renderer' );
} );

Deno.test( 'dynamic resolution steps down while frames are slow, and is full size with r_dynres 0', () => {
	vars.Cvar_SetValue( 'r_fps_target', 60 );
	vars.Cvar_SetValue( 'r_dynres', 0 ); targets.dynResUpdate( 100 ); same( targets.R_DynResScale(), 1, 'off: full size' );
	vars.Cvar_SetValue( 'r_dynres', 1 );
	let now = 100; for ( let i = 0; i < 200; i ++ ) targets.dynResUpdate( now += 0.1 ); // 10 frames a second
	same( targets.R_DynResScale(), 0.5, 'slow frames: down to half' );
	same( targets.dyn.scale, targets.R_DynResScale(), 'the shared state' );
	vars.Cvar_SetValue( 'r_dynres', 0 ); targets.dynResUpdate( now += 0.1 ); same( targets.R_DynResScale(), 1, 'off again: full size' );
} );
