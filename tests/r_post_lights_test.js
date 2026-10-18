// The post pipeline's lights stage on its own (card [44h]): E1M1's light database, and the frame's selection, capped
// at MAX_VOLUME_LIGHTS and with the Bestiary's portrait light among the candidates. Through the
// public interface of r_post_lights.js, on the shareware pack's real map.
import { readFileSync } from './helpers/resource_fs.mjs';
import * as THREE from 'three';
import * as lights from '../src/newer/render/r_post_lights.js';
import { MAX_VOLUME_LIGHTS } from '../src/newer/render/r_post_config.js';
import { skyState } from '../src/newer/render/r_post_sky.js';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();

Deno.test( 'E1M1\'s lights are built once; the frame takes the best of them, at most MAX_VOLUME_LIGHTS', () => {
	const world = Mod_ForName( 'maps/e1m1.bsp', true );
	const built = lights.R_BuildWorldLights( world );
	check( built === lights.R_GetWorldLights() && built.length > 20, 'the map\'s light database (' + built.length + ')' );
	check( built.every( l => l.pos.length === 3 && l.color.length === 3 && l.power > 0 ), 'each with a position, a colour and power' );
	check( skyState.hasSky === true, 'and E1M1 has sky' );
	for ( const leaf of world.leafs ) leaf.visframe = 7; // every leaf seen this frame
	const camera = new THREE.PerspectiveCamera(); camera.position.set( 480, - 352, 110 ); camera.updateMatrixWorld();
	const chosen = lights.R_SelectWorldLights( camera.matrixWorldInverse, 7, new Array( 64 ).fill( 264 ), [], 10 );
	check( chosen.length > 0 && chosen.length <= MAX_VOLUME_LIGHTS, 'a bounded selection (' + chosen.length + ')' );
	check( lights.R_PostSelectedCount() === chosen.length, 'the shared count matches' );
	lights.R_PostSetPortraitLight( { pos: [ 480, - 352, 110 ], color: [ 1, 1, 1 ], power: 1e6, radius: 400, fade: 1 } );
	const withPortrait = lights.R_SelectWorldLights( camera.matrixWorldInverse, 7, new Array( 64 ).fill( 264 ), [], 10 );
	check( withPortrait.some( l => l.position.every( ( v, i ) => Math.abs( v - [ 480, - 352, 110 ][ i ] ) < 1 ) ), 'a strong portrait light right here is among those chosen' );
	check( withPortrait.length <= MAX_VOLUME_LIGHTS, 'still bounded' );
	lights.R_PostSetPortraitLight( null );
	const f = [ 0, 1, 2 ].map( t => lights.R_FireFlicker( 100, 200, 300, t ) );
	check( f.every( v => v >= 0.55 && v <= 1.25 ) && new Set( f ).size > 1, 'fires flicker within 0.55..1.25' );
	check( lights.R_FireFlicker( 100, 200, 300, 1 ) === f[ 1 ], 'the same flicker for the same place and time' );
} );
