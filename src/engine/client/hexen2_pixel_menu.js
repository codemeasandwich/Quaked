/**
 * @module engine/client/hexen2_pixel_menu
 *
 * Draws the pause menu on Quaked's existing 320×200 overlay canvas with the native Hexen II small font and palette
 * fills. The model stays in `hexen2_menu.js`; this module is presentation only, so the same keyboard model is shared by
 * the DOM test host and the in-game pixel screen.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none; a closed menu or absent overlay draws nothing.
 */

import { Draw_GetOverlayCanvas, Draw_SmallString } from '../render/gl_draw.js';
import { Hexen2_MenuItems, Hexen2_MenuLines } from './hexen2_menu.js';

const LEFT = 16, WIDTH = 288;

function clipped( text, max = 46 ) { return String( text ).length > max ? String( text ).slice( 0, max - 1 ) + '…' : String( text ); }

function fill( x, y, width, height, style, alpha ) {

	const ctx = Draw_GetOverlayCanvas()?.getContext( '2d' );
	if ( !ctx ) return;
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.fillStyle = style;
	ctx.fillRect( x, y, width, height );
	ctx.restore();

}

/**
 * Draws the open menu over the native status bar.
 *
 * @param {{ isOpen: function(): boolean, state: function(): object }} menu the menu host
 * @returns {boolean} whether anything was drawn
 */
export function Hexen2_DrawPixelMenu( menu ) {

	if ( !menu?.isOpen?.() ) return false;
	const model = menu.state?.();
	if ( !model ) return false;
	const items = Hexen2_MenuItems( model.panel, model.values );
	const lines = Hexen2_MenuLines( model.panel, model.hud, model.values );
	const listTop = model.panel === 'main' ? 56 : Math.min( 44 + lines.length * 10, 118 );
	const height = Math.max( 78, listTop + items.length * 13 + 18 );
	fill( 0, 0, 320, 200, '#050508', 0.86 );
	fill( 12, 8, 296, height, '#0d0b09', 0.9 );
	fill( 12, 8, 296, 1, '#8a744a', 0.9 );
	fill( 12, 8 + height, 296, 1, '#8a744a', 0.9 );
	Draw_SmallString( LEFT, 14, clipped( model.panel === 'main' ? 'HEXEN II - PAUSED' : model.panel.toUpperCase() ) );
	Draw_SmallString( LEFT, 26, model.panel === 'main' ? 'Esc resumes. Arrows move. Enter selects.' : 'Esc back. Arrows move.' );
	for ( let i = 0; i < lines.length; i ++ ) Draw_SmallString( LEFT, 40 + i * 10, clipped( lines[ i ], 47 ) );
	items.forEach( ( item, i ) => {

		const y = listTop + i * 13;
		if ( i === model.index ) fill( 14, y - 2, 286, 11, '#6d5a34', 0.55 );
		Draw_SmallString( LEFT, y, clipped( ( i === model.index ? '> ' : '  ' ) + item.label + ( item.value !== undefined ? ' : ' + item.value : '' ) ) );

	} );
	Draw_SmallString( LEFT, 186, 'HEXEN II' );
	return true;

}
