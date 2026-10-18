// The post pipeline's shadows stage on its own (card [44h]): E1M1's sun occluder (its world, on the sun shadow layer
// only, sky left out so skylights let light in), and the shadow atlas's answers before the pipeline exists. Through
// the public interface of r_post_shadows.js, on the shareware pack's real map.
import { readFileSync } from './helpers/resource_fs.mjs';
import * as THREE from 'three';
import * as shadows from '../src/newer/render/r_post_shadows.js';
import { SUN_SHADOW_LAYER } from '../src/newer/render/r_post_config.js';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { GL_BuildLightmaps } from '../src/engine/render/gl_rsurf.js';
import { cl } from '../src/engine/client/client.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
// the world's faces get their polygons with its lightmaps, as when a map loads
const world = Mod_ForName( 'maps/e1m1.bsp', true ); cl.worldmodel = world; cl.model_precache[ 1 ] = world; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();

Deno.test( 'E1M1\'s sun occluder is its world on the sun layer alone; without the pipeline the atlas is absent', () => {
	same( shadows.R_BuildSunOccluder( null ), 0, 'no model, nothing to cast' );
	const triangles = shadows.R_BuildSunOccluder( world );
	check( triangles > 1000, 'the world\'s triangles (' + triangles + ')' );
	const occluder = shadows.R_PostOccluder();
	check( occluder instanceof THREE.Mesh, 'one mesh' );
	const g = occluder.geometry; same( ( g.index ? g.index.count : g.attributes.position.count ) / 3, triangles, 'of those triangles' );
	const camera = new THREE.Camera(); camera.layers.set( 0 );
	check( ! camera.layers.test( occluder.layers ), 'ordinary cameras never see it' );
	const sunCamera = new THREE.Camera(); sunCamera.layers.set( SUN_SHADOW_LAYER );
	check( sunCamera.layers.test( occluder.layers ), 'the sun\'s camera does' );
	same( shadows.R_PointShadowAtlas(), null, 'no atlas before the pipeline' );
	same( shadows.R_PointShadowStatus().ready, 0, 'and nothing ready' );
	shadows.R_ReleaseShadowCaster( new THREE.Mesh() ); // nothing to release; does not throw
	same( shadows.R_BuildSunOccluder( world ), triangles, 'rebuilt the same for the same map' );
	check( shadows.R_PostOccluder() !== occluder, 'a new occluder replaces the old' );
} );
