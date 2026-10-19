// Client effect sprites from the supplied base game: every mapped CE_* type loads through the port's sprite loader
// with real frames, and unmapped/absent types are reported instead of borrowing Quake art. Drawing remains separate.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { mod_sprite } from '../src/engine/render/gl_model_types.js';
import { Hexen2_EffectFrame } from '../src/engine/client/hexen2_effect_anim.js';
import { EFFECT_SPRITES, Hexen2_EffectSpriteName, Hexen2_LoadEffectSprites } from '../src/engine/client/hexen2_effects_assets.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'every mapped native effect sprite loads with frames', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const assets = Hexen2_LoadEffectSprites( ( name, load ) => Mod_ForName( name, load ) );
	same( assets.missing.length, 0, 'no mapped sprite is missing: ' + assets.missing.join( ',' ) );
	same( assets.loaded.length, Object.keys( EFFECT_SPRITES ).length, 'every mapped type loaded' );
	for ( const entry of assets.loaded ) {

		same( entry.model.type, mod_sprite, `type ${entry.type} is a sprite` );
		check( entry.model.numframes > 0, `type ${entry.type} has frames` );

	}
	same( Hexen2_EffectSpriteName( 4 ), 'models/whtsmk1.spr', 'the white smoke sprite' );
	same( Hexen2_EffectSpriteName( 10 ), 'models/gryspt.spr', 'the grey flash sprite' );
	same( Hexen2_EffectSpriteName( 18 ), null, 'rider death has no borrowed sprite' );
	same( Hexen2_EffectSpriteName( 55 ), null, 'chunks have no borrowed sprite' );

	// frame timing: every sprite yields a real image at t=0 and a later time; a multi-frame sprite advances
	let multi = null;
	for ( const entry of assets.loaded ) {

		const sprite = entry.model.cache.data;
		const first = Hexen2_EffectFrame( sprite, 0 );
		check( first !== null && first.image.width > 0, `type ${entry.type} has a first image` );
		const later = Hexen2_EffectFrame( sprite, 0.25 );
		check( later !== null && later.image.width > 0, `type ${entry.type} has a later image` );
		if ( sprite.numframes > 1 && multi === null ) multi = entry;

	}
	check( multi !== null, 'a multi-frame effect sprite is present' );
	const atZero = Hexen2_EffectFrame( multi.model.cache.data, 0 );
	const atOne = Hexen2_EffectFrame( multi.model.cache.data, 0.15 );
	check( atZero.frameIndex !== atOne.frameIndex, 'the sprite advances to its second frame: ' + atZero.frameIndex + ' vs ' + atOne.frameIndex );
	const wrapped = Hexen2_EffectFrame( multi.model.cache.data, 1000, { loop: true } );
	check( wrapped !== null && wrapped.image.width > 0, 'a looping sprite wraps to an image' );
	const held = Hexen2_EffectFrame( multi.model.cache.data, 1000, { loop: false } );
	check( held !== null && held.image.width > 0, 'a one-shot sprite holds its last image' );

} );
