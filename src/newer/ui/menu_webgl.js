/**
 * @module newer/ui/menu_webgl
 *
 * The supplied WebGL2 menu renderer (glyphs, bronze panels, selector) drawn over Quake's native menu, which keeps the
 * actions and input.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `renderer`, `loading`, `failed`, `visible`, `epoch`, `frameSkin`,
 * `presented`, `commands`, `blits`, `size`, `inGameSnapshot`; 1 module-level collection (Map/Set).
 *
 * Errors: catches at 3 places.
 */
// Reuses the supplied WebGL2 glyph, bronze panel and selector renderer across
// Quaked's native menu stack. menu.js remains the only action/input owner.
import { Draw_GetOverlayCanvas, Draw_FullResolutionCanvas, Draw_FullResolutionImage, Draw_GetUIScale } from '../../engine/render/gl_draw.js';

let renderer = null, loading = null, failed = null, visible = false, epoch = 0;
let frameSkin = false, presented = false, commands = [], blits = [], size = [ 0, 0 ];

export function MainMenu_SetVisible( value ) {

	value = !! value;
	if ( visible !== value && renderer ) renderer.lastFrameTime = 0;
	visible = value;
	if ( ! value ) {

		presented = false; frameSkin = false; commands = []; blits = [];
		// Gameplay can run for hours with the menu closed: release the screen-sized buffers.
		// frame() resizes the canvas (and its framebuffers) again on the next opening.
		if ( renderer?.canvas ) { renderer.canvas.width = 1; renderer.canvas.height = 1; }

	}

}

export function MainMenu_Destroy() {

	epoch ++; renderer?.destroy(); renderer = null; loading = null; failed = null;
	visible = false; frameSkin = false; presented = false; commands = []; blits = []; size = [ 0, 0 ];

}

function prepare() {

	if ( renderer || loading || failed || typeof document === 'undefined' ) return;
	const generation = epoch;
	loading = import( './menu_webgl_source.js' ).then( async ( { QuakeMenu } ) => {

		if ( generation !== epoch ) return;
		const canvas = document.createElement( 'canvas' );
		const next = new QuakeMenu( canvas, { externalFrame: true,
			config: { title: 'Quake', items: [ { id: 'native-menu-frame', label: '' } ], selected: 0, selectorRotate: true } } );
		renderer = next;
		canvas.addEventListener( 'quake:error', event => {

			if ( next.contextLost ) return;
			failed = String( event.detail ); next.destroy(); renderer = null;

		} );
		await next.ready;
		if ( generation !== epoch ) next.destroy();

	} ).catch( error => {

		if ( generation !== epoch ) return;
		failed = String( error.message || error ); renderer?.destroy(); renderer = null;
		console.warn( 'Menu artwork unavailable; native menu remains active:', failed );

	} );

}

export function MainMenu_Begin() {

	frameSkin = false; commands = []; blits = [];
	presented = false;
	if ( ! visible || failed ) return;
	prepare();
	frameSkin = !! renderer?.loaded && ! renderer.contextLost;

}

export function MainMenu_Skinned() { return frameSkin; }

function physical( x, y ) {

	const scale = Draw_GetUIScale();
	return [ x * scale, y * scale ];

}

// ---------------------------------------------------------------------------
// Everything below places the supplied typography on the *original* menu
// geometry. Positions come from the stock sprite sheets' own pixels (measured
// once per picture), never from hand-tuned offsets, so the replacement lands
// where the original artwork was and only gets sharper.
// ---------------------------------------------------------------------------

// A large soft black drop shadow behind everything the menu draws (text, plaques, boxes, sliders,
// the selector), so lettering reads over a bright scene without a panel: [ blur in virtual units, alpha ], widest
// first. Thin letters add little to a blur, so the wide pass is stacked twice to build a dark halo that
// fades out about half its blur size from the edge of the lettering.
const SHADOW = [ [ 34, 1 ], [ 34, 1 ], [ 16, 1 ], [ 8, .9 ] ];
export const MainMenu_Shadow = SHADOW; // read-only, for tests and tools
const MAIN_ROWS = [ 'Single Player', 'Multiplayer', 'Bestiarium', 'Options', 'Credits', 'Quit' ];
// Measured against the stock sheets: the donor's capitals carry more swash than the
// sprites' ink, so equal ink height reads ~10% heavier; this restores the original rhythm.
const SHEET_EM_FIT = 0.95;
// The donor's soft glyph edges overshoot the sprite's hard ink edge by ~2 units.
const SHEET_INSET = 1.5;
// The stock menudot sprites' ink is ~15 units tall in a 24-unit cell.
const SELECTOR_HEIGHT = 0.64;
const ROW_PITCH = 20, ROW_CORE_TOP = 3, ROW_CORE_BOTTOM = 17;           // stock sheets: one 20-unit row per menu item
const CELL = 8;                 // engine character cell, virtual units
const CELL_CAP = 4.8, CELL_CAP_TOP = 1.5, CELL_MAX_W = 7.2;
const pixelCache = new WeakMap(), rowCache = new WeakMap();

function pixelsOf( pic ) {

	let entry = pixelCache.get( pic );
	if ( entry !== undefined ) return entry;
	entry = null;
	try {

		const canvas = pic.canvas, ctx = canvas?.getContext?.( '2d', { willReadFrequently: true } );
		if ( ctx && canvas.width > 0 && canvas.height > 0 )
			entry = { w: canvas.width, h: canvas.height, ratio: canvas.width / pic.width,
				data: ctx.getImageData( 0, 0, canvas.width, canvas.height ).data };

	} catch ( error ) { entry = null; }
	pixelCache.set( pic, entry );
	return entry;

}

// Bounding box (in picture units) of pixels in rows [y0,y1) (picture units) for which test() holds.
function inkBox( pic, y0, y1, test, x0 = 0, x1 = Infinity ) {

	const px = pixelsOf( pic );
	if ( ! px ) return null;
	const r = px.ratio, ya = Math.max( 0, Math.floor( y0 * r ) ), yb = Math.min( px.h, Math.ceil( y1 * r ) );
	const xa = Math.max( 0, Math.floor( x0 * r ) ), xb = Math.min( px.w, Math.ceil( x1 * r ) );
	let minX = px.w, minY = px.h, maxX = - 1, maxY = - 1;
	for ( let y = ya; y < yb; y ++ ) for ( let x = xa; x < xb; x ++ ) {

		const i = ( y * px.w + x ) * 4;
		if ( ! test( px.data[ i ], px.data[ i + 1 ], px.data[ i + 2 ], px.data[ i + 3 ] ) ) continue;
		if ( x < minX ) minX = x; if ( x > maxX ) maxX = x; if ( y < minY ) minY = y; if ( y > maxY ) maxY = y;

	}
	if ( maxX < 0 ) return null;
	return { x: minX / r, y: minY / r, w: ( maxX - minX + 1 ) / r, h: ( maxY - minY + 1 ) / r };

}

const opaque = ( r, g, b, a ) => a > 24;

// Fit `text` into a physical-pixel box using the supplied font. `em` may be
// fixed so a family of labels shares one letter height.
function fitText( text, box, kind, em = null ) {

	const ref = renderer._shape( text, 100, 1, true );
	if ( ! ( ref.width > 0 && ref.height > 0 ) ) return;
	const size = em ?? 100 * box.h / ref.height, height = ref.height * size / 100;
	// `box` is the original ink rectangle this text was fitted to (diagnostic only).
	commands.push( { type: 'text', text, x: box.x, y: box.y + ( box.h - height ) / 2, size,
		stretch: box.w / ( ref.width * size / 100 ), kind, box: { ...box } } );

}

function emFor( text, h ) {

	const ref = renderer._shape( text, 100, 1, true );
	return ref.height > 0 ? 100 * h / ref.height : 0;

}

// Menu item sheets: row j of the sheet occupies [j*20, j*20+21) of the picture.
function labelRows( pic, x, y, labels, firstRow, srcY ) {

	const px = pixelsOf( pic );
	if ( ! px ) return false;
	const scale = Draw_GetUIScale(), key = firstRow + ':' + labels.length;
	let cache = rowCache.get( pic );
	if ( ! cache ) rowCache.set( pic, cache = new Map() );
	let boxes = cache.get( key );
	if ( ! boxes ) cache.set( key, boxes = labels.map( ( _, i ) => {

		// Rows touch: a swash from the row above can run into this row's window (the stock
		// sheet's G descender joins LOAD). Take the vertical extent from the full window but
		// the horizontal extent from the core band only.
		const j = firstRow + i, full = inkBox( pic, j * ROW_PITCH, j * ROW_PITCH + ROW_PITCH + 1, opaque ),
			core = inkBox( pic, j * ROW_PITCH + ROW_CORE_TOP, j * ROW_PITCH + ROW_CORE_BOTTOM, opaque );
		return full && core ? { x: core.x, w: core.w, y: full.y, h: full.h } : null;

	} ) );
	if ( boxes.some( box => ! box ) ) return false;
	const ems = labels.map( ( label, i ) => emFor( label, boxes[ i ].h * scale ) ).sort( ( a, b ) => a - b );
	// The donor's swashes are taller than the stock sprite's: size from the tightest
	// row so no label ever exceeds its original ink box or touches its neighbour.
	const em = ems[ 0 ] * SHEET_EM_FIT;
	labels.forEach( ( label, i ) => {

		const b = boxes[ i ], j = firstRow + i;
		fitText( label, { x: ( x + b.x + SHEET_INSET ) * scale, y: ( y - srcY + b.y ) * scale, w: ( b.w - SHEET_INSET * 1.6 ) * scale, h: b.h * scale }, 0, em );

	} );
	return true;

}

export function MainMenu_Text( x, y, text, kind = 0 ) {

	if ( ! frameSkin ) return false;
	// Engine text is a fixed 8-unit cell grid. Keep every character in its own
	// cell so right-aligned labels, columns and save-slot rows land exactly where
	// the original bitmap font put them.
	if ( kind === 2 ) kind = 3; // stock white engine text
	const scale = Draw_GetUIScale(), capH = CELL_CAP * scale, em = emFor( 'H', capH );
	String( text ).split( '\n' ).forEach( ( line, row ) => {

		[ ...line ].forEach( ( raw, i ) => {

			const ch = raw.toUpperCase();
			if ( ch === ' ' || ch.charCodeAt( 0 ) < 32 ) return;
			const shape = renderer._shape( ch, em, 1, true );
			if ( ! ( shape.width > 0 ) ) return;
			const stretch = Math.min( 1, CELL_MAX_W * scale / shape.width ), w = shape.width * stretch;
			const top = ( y + row * CELL + CELL_CAP_TOP ) * scale;
			const oy = '.,_'.includes( ch ) ? top + capH - shape.height :
				'-+=<>:;'.includes( ch ) ? top + ( capH - shape.height ) / 2 : top;
			commands.push( { type: 'text', text: ch, x: ( x + i * CELL ) * scale + ( CELL * scale - w ) / 2,
				y: oy, size: em, stretch, kind } );

		} );

	} );
	return true;

}

export function MainMenu_Glyph( x, y, code ) {

	if ( ! frameSkin ) return false;
	if ( code >= 12 && code <= 17 ) {

		const [ px, py ] = physical( x + 4, y + 4 );
		commands.push( { type: 'selector', x: px, y: py, size: 8.5 * Draw_GetUIScale() } );

	} else if ( code >= 128 && code <= 131 ) {

		// Legacy slider chars are consumed as a grouped slider by M_DrawSlider.
		return true;

	} else if ( code === 10 || code === 11 ) {

		// The engine alternates 10/11 to blink the text cursor: draw it on one phase only.
		if ( code === 11 ) MainMenu_Text( x, y, '|', 2 );

	} else if ( code >= 32 ) MainMenu_Text( x, y, String.fromCharCode( code & 127 ), code < 128 ? 2 : 0 );
	return true;

}

export function MainMenu_Panel( x, y, width, height, well = false ) {

	if ( ! frameSkin ) return false;
	const [ px, py ] = physical( x, y ), scale = Draw_GetUIScale();
	commands.push( { type: 'panel', x: px, y: py, w: width * scale, h: height * scale, well } );
	return true;

}

// Dialog/text box: the original border tiles leave a transparent margin inside the
// nominal cell area; the dark recessed panel is inset by exactly that margin.
export function MainMenu_TextBox( x, y, width, height, tl, br ) {

	if ( ! frameSkin ) return false;
	const a = tl && inkBox( tl, 0, tl.height, opaque ), b = br && inkBox( br, 0, br.height, opaque );
	const left = a ? a.x : 0, top = a ? a.y : 0;
	const right = b ? br.width - ( b.x + b.w ) : 0, bottom = b ? br.height - ( b.y + b.h ) : 0;
	return MainMenu_Panel( x + left, y + top, width - left - right, height - top - bottom, true );

}

// (x, y) is the left end of the 12-cell track and the top of its cell row.
export function MainMenu_Slider( x, y, width, value ) {

	if ( ! frameSkin ) return false;
	const scale = Draw_GetUIScale(), v = Math.max( 0, Math.min( 1, value ) );
	const trackH = 6.5 * scale, [ px, py ] = physical( x, y + ( CELL - 6.5 ) / 2 );
	commands.push( { type: 'panel', x: px, y: py, w: width * scale, h: trackH, well: true } );
	// The stock knob sits on cell (range-1)*v of the ten middle cells.
	const knobW = 6 * scale, knobH = 9 * scale;
	commands.push( { type: 'panel', x: px + ( CELL + ( width / CELL - 3 ) * CELL * v ) * scale + ( CELL * scale - knobW ) / 2,
		y: py + ( trackH - knobH ) / 2, w: knobW, h: knobH } );
	return true;

}

// Words printed on the stock plaque graphics. Unknown plaques keep their
// original raster rather than being guessed.
const TITLES = {
	'gfx/ttl_main.lmp': 'MAIN', 'gfx/ttl_sgl.lmp': 'SINGLE', 'gfx/p_multi.lmp': 'MULTIPLAYER',
	'gfx/p_option.lmp': 'OPTIONS', 'gfx/p_load.lmp': 'LOAD', 'gfx/p_save.lmp': 'SAVE',
	'gfx/p_enhanced.lmp': 'ENHANCED', 'gfx/ttl_cstm.lmp': 'CUSTOMIZE'
};

const SHEETS = {
	'gfx/mp_menu.lmp': [ 'Join a Game', 'New Game', 'Setup' ],
	'gfx/sp_menu_ext.lmp': [ 'Newer Game', 'New Game', 'Load', 'Save', 'Level Select' ]
};

// QUAKE lettering and id mark on gfx/qplaque.lmp, in plaque units (32 x 144).
const PLAQUE_LETTERS = [ [ 'Q', 4.7, 3, 21.1, 22.8 ], [ 'U', 5.8, 30.8, 19.2, 15 ], [ 'A', 5.4, 50.2, 19.8, 17 ],
	[ 'K', 5.8, 72.4, 19.4, 16.2 ], [ 'E', 5.8, 94, 19.2, 14.6 ] ];
const PLAQUE_ID = [ 0, 114, 32, 30 ];

// Pictures with no replacement (credits artwork) must still land *above* the
// WebGL panels, which are composited after native drawing: queue them as blits.
function deferPicture( pic, px, py, scale, srcY ) {

	const canvas = pic?.canvas;
	if ( srcY || ! canvas || ! ( canvas.width > 0 ) ) return false;
	blits.push( { pic, sx: 0, sy: 0, sw: canvas.width, sh: canvas.height, dx: px, dy: py,
		dw: pic.width * scale, dh: pic.height * scale, smooth: false } );
	return true;

}

export function MainMenu_Image( x, y, pic, srcY = 0 ) {

	if ( ! frameSkin || ! pic ) return false;
	const path = pic.path || '', [ px, py ] = physical( x, y ), scale = Draw_GetUIScale();
	if ( ! path ) return deferPicture( pic, px, py, scale, srcY );
	if ( path === 'gfx/qplaque.lmp' ) {

		commands.push( { type: 'panel', x: px, y: py, w: pic.width * scale, h: pic.height * scale } );
		const u = pic.width / 32;
		for ( const [ letter, lx, ly, lw, lh ] of PLAQUE_LETTERS )
			fitText( letter, { x: px + lx * u * scale, y: py + ly * u * scale, w: lw * u * scale, h: lh * u * scale }, 1 );
		const [ ix, iy, iw, ih ] = PLAQUE_ID, r = ( pixelsOf( pic )?.ratio || 1 );
		blits.push( { pic, sx: ix * u * r, sy: iy * u * r, sw: iw * u * r, sh: ih * u * r,
			dx: px + ix * u * scale, dy: py + iy * u * scale, dw: iw * u * scale, dh: ih * u * scale, smooth: false } );
		return true;

	}
	if ( path.startsWith( 'gfx/menudot' ) ) {

		// The six rotation frames' ink centres differ by about a unit; any per-frame
		// measurement would move the selector and rebuild the layout 10 times a second.
		// Use the sprite cell's own centre and a fixed fraction of its height instead.
		const qRef = renderer._shape( 'Q', 100, 1.05, false );
		commands.push( { type: 'selector', x: px + pic.width / 2 * scale, y: py + pic.height / 2 * scale,
			size: 100 * pic.height * SELECTOR_HEIGHT * scale / qRef.height } );
		return true;

	}
	if ( path.startsWith( 'gfx/box_' ) ) return true;
	// bigbox frames the natively drawn, colour-translated player portrait: leave it native.
	if ( path === 'gfx/bigbox.lmp' ) return false;
	const heading = TITLES[ path ];
	if ( heading ) {

		// Lettering is the darkest ink inside the plaque, clear of its rivets.
		const W = pic.width, H = pic.height, px0 = pixelsOf( pic );
		let box = null;
		if ( px0 ) {

			let sum = 0, n = 0;
			const lum = ( r, g, b ) => r * .3 + g * .59 + b * .11;
			inkBox( pic, H * .12, H * .88, ( r, g, b, a ) => { if ( a > 24 ) { sum += lum( r, g, b ); n ++; } return false; }, W * .12, W * .88 );
			const cut = n ? sum / n * .55 : 0;
			const raw = inkBox( pic, H * .12, H * .88, ( r, g, b, a ) => a > 24 && lum( r, g, b ) < cut, W * .12, W * .88 );
			if ( raw && raw.w > W * .2 ) box = raw;

		}
		commands.push( { type: 'panel', x: px, y: py, w: W * scale, h: H * scale } );
		if ( box ) fitText( heading, { x: px + box.x * scale, y: py + box.y * scale, w: box.w * scale, h: box.h * scale }, 1 );
		else fitText( heading, { x: px + W * .15 * scale, y: py + H * .2 * scale, w: W * .7 * scale, h: H * .6 * scale }, 1 );
		return true;

	}
	if ( path === 'gfx/mainmenu_ext.lmp' ) {

		const labels = inGameSnapshot ? [ 'Continue', ...MAIN_ROWS ] : MAIN_ROWS;
		return labelRows( pic, x, y, labels, inGameSnapshot ? 0 : 1, srcY );

	}
	if ( path === 'gfx/sp_menu.lmp' ) return labelRows( pic, x, y, [ 'New Game', 'Load', 'Save' ], 0, srcY );
	if ( SHEETS[ path ] ) return labelRows( pic, x, y, SHEETS[ path ], 0, srcY );
	return deferPicture( pic, px, py, scale, srcY );

}

let inGameSnapshot = false;
export function MainMenu_SetInGame( value ) { inGameSnapshot = !! value; }

export function MainMenu_End( timeSeconds ) {

	if ( ! frameSkin ) return false;
	frameSkin = false; // a frame is skinned only between Begin and End
	const canvas = Draw_GetOverlayCanvas();
	if ( ! canvas || ! renderer ) return false;
	try {

		size = [ canvas.width, canvas.height ];
		if ( renderer.frame( size[ 0 ], size[ 1 ], timeSeconds * 1000, commands, 0 ) === false ) return false;
		const scale = Draw_GetUIScale();
		Draw_FullResolutionCanvas( renderer.canvas, SHADOW.map( ( [ blur, alpha ] ) => [ blur * scale, alpha ] ) );
		// Logo artwork (the id mark) stays the original pixels, unsmoothed.
		for ( const b of blits ) Draw_FullResolutionImage( b.pic.canvas, b.sx, b.sy, b.sw, b.sh, b.dx, b.dy, b.dw, b.dh, !! b.smooth );
		presented = true; return true;

	} catch ( error ) {

		failed = String( error.message || error ); renderer.destroy(); renderer = null; presented = false;
		console.warn( 'Menu rendering failed; native drawing resumes next frame:', failed );
		return false;

	}

}

// Read-only diagnostic: the draw commands and deferred picture blits of the last frame.
export function MainMenu_Frame() {

	return { commands: commands.map( c => ( { ...c } ) ), blits: blits.map( b => ( { ...b } ) ) };

}

export function MainMenu_Snapshot() {

	return { visible, skinActive: presented, ready: !! renderer?.loaded && ! renderer.contextLost && ! failed,
		error: failed, contextLost: !! renderer?.contextLost, size: [ ...size ], commands: commands.length,
		pendingFrame: renderer?.pendingFrame || 0, layout: renderer?.layout ? {
			width: renderer.layout.width, height: renderer.layout.height,
			glyphInstances: renderer.layout.glyphs.length / 12,
			panels: renderer.layout.panels.length / 8
		} : null };

}

if ( typeof window !== 'undefined' ) window.addEventListener?.( 'pagehide', MainMenu_Destroy );
