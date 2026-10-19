// Effect sprites in the Three scene: a live client effect becomes a Sprite with the native frame texture, the effect
// origin and the frame extents; ending the effect removes it. Scene construction only (no WebGL draw).
import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { Hexen2_EffectLayer, Hexen2_UpdateEffectLayer } from '../src/engine/client/hexen2_effect_render.js';
import { CE } from '../src/engine/common/hexen2_effectwire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'live effects become Sprites in the scene and are removed when they end', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const scene = new THREE.Scene();
	const layer = Hexen2_EffectLayer( scene );
	const effects = new Map( [ [ 3, { type: CE.GREY_SMOKE, params: { origin: [ 10, 20, 30 ] }, startedAt: 0 } ] ] );
	const first = Hexen2_UpdateEffectLayer( layer, effects, { loadModel: ( n, l ) => Mod_ForName( n, l ), time: 0 } );
	same( first.active, 1, 'one sprite is active' );
	same( first.added, 1, 'one sprite was added' );
	same( scene.children.length, 1, 'the scene has the sprite' );
	const sprite = scene.children[ 0 ];
	check( sprite.isSprite === true, 'the object is a Sprite' );
	check( sprite.material.map !== null, 'the sprite has a frame texture' );
	same( sprite.position.x, 10, 'the sprite origin x' );
	same( sprite.position.y, 20, 'the sprite origin y' );
	check( sprite.scale.x > 0 && sprite.scale.y > 0, 'the sprite has frame extents' );

	// an effect without a supplied sprite is not drawn
	const unsupported = new Map( [ [ 4, { type: CE.CHUNK, params: { origin: [ 0, 0, 0 ] }, startedAt: 0 } ] ] );
	Hexen2_UpdateEffectLayer( layer, unsupported, { loadModel: ( n, l ) => Mod_ForName( n, l ), time: 0 } );
	same( layer.sprites.size, 0, 'a chunk has no sprite' );

	// ending the effect removes the sprite
	const cleared = Hexen2_UpdateEffectLayer( layer, new Map(), { loadModel: ( n, l ) => Mod_ForName( n, l ), time: 1 } );
	same( cleared.active, 0, 'no sprites remain' );
	same( cleared.removed, 0, 'the unsupported effect never added one' );
	same( scene.children.length, 0, 'the scene is empty' );

} );
