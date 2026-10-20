/**
 * @module newer/ui/menu_webgl
 *
 * The supplied WebGL2 menu renderer (glyphs, panels, selector) drawn over the native menu, which keeps the actions and
 * input. One renderer serves both games through data-only skins (`newer/ui/menu_skins.js`): Quake keeps the supplied
 * DpQuake atlas, bronze material and rotating Q; Hexen II gets a runtime distance-field atlas from its installed
 * bigfont/conchars, grey stone, original pictures and the animated menudot. The skin is resolved from the active game
 * profile every frame, so no module-global mode toggle exists.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `renderer`, `loading`, `failed`, `visible`, `epoch`, `frameSkin`,
 * `presented`, `commands`, `blits`, `images`, `size`, `inGameSnapshot`; 1 module-level collection (Map/Set).
 *
 * Errors: catches at 3 places.
 */
// Reuses the supplied WebGL2 glyph, panel and selector renderer across Quaked's
// native menu stack. menu.js remains the only action/input owner.
import { Draw_GetOverlayCanvas, Draw_FullResolutionCanvas, Draw_FullResolutionImage, Draw_GetUIScale } from '../../engine/render/gl_draw.js';
import { COM_LoadFile } from '../../engine/common/pak.js';
import { GameProfile_Get } from '../../engine/common/game_profile.js';
import { NewerBindings } from '../content_bindings.js';
import { BuildHexen2FontAtlas, MENU_SKINS, MenuSkin_ApplyPrograms, MenuSkin_BigfontIndex, MenuSkin_For } from './menu_skins.js';

let renderer = null, loading = null, failed = null, visible = false, epoch = 0;
let frameSkin = false, presented = false, commands = [], blits = [], images = [], size = [ 0, 0 ];

/**
 * Tells the adapter whether Quaked's native menu is up. Called at the start of every `M_Draw` (`menu.js`): true while
 * a menu other than the Bestiary is open with key focus on the menu. Closing it drops the queued frame and shrinks the
 * renderer's canvas to 1 x 1, since gameplay can run for hours with the menu closed; `frame()` resizes it again on the
 * next opening. A change resets the selector's frame clock.
 *
 * @param {boolean} value whether the native menu is visible (coerced to boolean)
 */
export function MainMenu_SetVisible( value ) {

	value = !! value;
	if ( visible !== value && renderer ) renderer.lastFrameTime = 0;
	visible = value;
	if ( ! value ) {

		presented = false; frameSkin = false; commands = []; blits = []; images = [];
		// Gameplay can run for hours with the menu closed: release the screen-sized buffers.
		// frame() resizes the canvas (and its framebuffers) again on the next opening.
		if ( renderer?.canvas ) { renderer.canvas.width = 1; renderer.canvas.height = 1; }

	}

}

/**
 * Destroys the WebGL menu renderer and resets all adapter state, cancelling any load in flight (its generation is
 * bumped). Called by `Host_Shutdown` and on the page's `pagehide`. Safe to call repeatedly; the next visible frame
 * loads a new renderer.
 */
export function MainMenu_Destroy() {

	epoch ++; renderer?.destroy(); renderer = null; loading = null; failed = null;
	visible = false; frameSkin = false; presented = false; commands = []; blits = []; images = []; size = [ 0, 0 ];

}

// The active skin: Quake's until the host selects a Hexen II game.
function activeSkin() { return MenuSkin_For( GameProfile_Get() ); }

function skinReady( rend ) {

	if ( ! rend?.loaded || rend.contextLost ) return false;
	const skin = activeSkin();
	return rend.__menuSkin === skin.id && rend.__material === skin.material;

}

// The installed Hexen II fonts as raw palette-index sheets, so the atlas builder sees the native transparency (index 0)
// rather than a canvas conversion that treats 255 as transparent.
function loadQpic( paths ) {

	for ( const path of paths || [] ) {

		const file = COM_LoadFile( path );
		if ( ! file || file.byteLength < 8 ) continue;
		const width = new DataView( file ).getInt32( 0, true ), height = new DataView( file ).getInt32( 4, true );
		if ( ! ( width > 0 && height > 0 ) || file.byteLength < 8 + width * height ) continue;
		return { width, height, data: new Uint8Array( file, 8, width * height ) };

	}
	return null;

}

function loadConchars( path ) {

	if ( ! path ) return null;
	const file = COM_LoadFile( path );
	if ( ! file || file.byteLength < 128 * 128 ) return null;
	const width = file.byteLength >= 256 * 128 ? 256 : 128;
	return { width, height: 128, data: new Uint8Array( file ) };

}

function loadHexen2Atlas() {

	const menu = NewerBindings().menu;
	const widthsFile = menu.fontWidths ? COM_LoadFile( menu.fontWidths ) : null;
	const widths = widthsFile && widthsFile.byteLength === 27 * 27 ? new Uint8Array( widthsFile ) : null;
	return BuildHexen2FontAtlas( { bigfont: loadQpic( menu.bigfont ), conchars: loadConchars( menu.conchars ), widths } );

}

async function applySkin( rend, skin ) {

	if ( rend.destroyed || rend.contextLost ) return;
	if ( skin.id === 'hexen2' ) {

		const atlas = loadHexen2Atlas();
		if ( ! atlas ) throw new Error( 'the installed Hexen II menu fonts could not be read' );
		rend.font = atlas.metrics; rend.fontSource = atlas.data; rend.__hexenAtlas = atlas.info;
		if ( ! await rend._uploadFont( atlas.data, rend._generation ) ) throw new Error( 'Hexen II font upload was interrupted' );

	} else {

		rend.font = rend.__baseFont.metrics; rend.fontSource = rend.__baseFont.image; rend.__hexenAtlas = null;
		if ( ! await rend._uploadFont( rend.fontSource, rend._generation ) ) throw new Error( 'font upload was interrupted' );

	}
	if ( rend.destroyed || rend.contextLost ) return;
	MenuSkin_ApplyPrograms( rend, rend.__baseShaders, skin );
	rend.__menuSkin = skin.id; rend.__material = skin.material;
	rend.setConfig( skin.config );

}

function ensureSkin( rend ) {

	const skin = activeSkin();
	if ( rend.__menuSkin === skin.id && rend.__material === skin.material ) return;
	if ( rend.__skinPromise ) return;
	rend.__skinPromise = applySkin( rend, skin ).catch( error => {

		if ( rend.destroyed ) return;
		failed = String( error.message || error );
		rend.destroy(); if ( renderer === rend ) renderer = null;
		console.warn( 'Menu skin unavailable; native menu remains active:', failed );

	} ).finally( () => { rend.__skinPromise = null; } );

}

function prepare() {

	// A headless/native-menu context has no DOM canvas API; mark it unavailable at once so
	// the native menu is used rather than blocking the screen waiting for a renderer that
	// can never be created.
	if ( typeof document === 'undefined' || typeof document.createElement !== 'function' ) { failed = 'no DOM canvas'; return; }
	if ( renderer || loading || failed ) return;
	const generation = epoch;
	loading = import( './menu_webgl_source.js' ).then( async ( { QuakeMenu, QUAKE_FONT, QUAKE_SHADERS } ) => {

		if ( generation !== epoch ) return;
		const canvas = document.createElement( 'canvas' );
		const next = new QuakeMenu( canvas, { externalFrame: true,
			config: { title: 'Quake', items: [ { id: 'native-menu-frame', label: '' } ], selected: 0, selectorRotate: true } } );
		next.__baseFont = QUAKE_FONT; next.__baseShaders = QUAKE_SHADERS;
		next.__menuSkin = 'quake'; next.__material = 'bronze'; next.__hexenAtlas = null;
		renderer = next;
		canvas.addEventListener( 'quake:error', event => {

			if ( next.contextLost ) return;
			failed = String( event.detail ); next.destroy(); renderer = null;

		} );
		// The generated renderer restores its own base programs on context restoration; forget the applied skin so the
		// next visible frame uploads the atlas and material again.
		canvas.addEventListener( 'webglcontextlost', () => { next.__menuSkin = 'quake'; next.__material = 'bronze'; } );
		await next.ready;
		if ( generation !== epoch ) { next.destroy(); return; }
		ensureSkin( next );

	} ).catch( error => {

		if ( generation !== epoch ) return;
		failed = String( error.message || error ); renderer?.destroy(); renderer = null;
		console.warn( 'Menu artwork unavailable; native menu remains active:', failed );

	} );

}

/**
 * Starts loading the high-quality menu renderer at startup, before the menu is first opened. The
 * import and font/image preparation then overlap the intro/loading screen instead of happening
 * on the first menu frame. Safe to call repeatedly and in a headless/server context (it does
 * nothing without `document`).
 */
export function MainMenu_Preload() { prepare(); }

/**
 * Starts one menu frame: clears the queued commands and blits, starts loading the renderer on first use (a dynamic
 * import of `menu_webgl_source.js`), and decides whether this frame is skinned (the renderer is loaded, its context not
 * lost and the active game's skin applied). Called by `M_Draw` each frame the menu is up, before the native drawing
 * helpers. While the renderer or its skin is still loading `M_Draw` blocks the classic menu; only a permanent failure
 * falls back to it.
 */
export function MainMenu_Begin() {

	frameSkin = false; commands = []; blits = []; images = [];
	presented = false;
	if ( ! visible || failed ) return;
	prepare();
	if ( renderer ) ensureSkin( renderer );
	frameSkin = skinReady( renderer );

}

/**
 * Tells whether the current frame is drawn by the WebGL menu (between `MainMenu_Begin` and `MainMenu_End`).
 * `menu.js` uses it to skip the native dark backdrop fill.
 *
 * @returns {boolean} true while this frame is skinned
 */
export function MainMenu_Skinned() { return frameSkin; }

/**
 * Whether the high-quality menu is expected but not ready yet. `M_Draw` uses this to draw a
 * neutral backdrop instead of the classic menu while the renderer or its game skin loads. A permanent failure
 * returns false so the native menu remains usable.
 *
 * @returns {boolean} true while visible, not failed, and the renderer (and its skin) has not finished loading
 */
export function MainMenu_Blocking() { return visible && ! failed && ! skinReady( renderer ); }

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
const HEXEN_CELL_CAP = 7; // the conchars 'H' ink fills 7 of its 8 pixels, so the dynamic small font keeps native size
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

/**
 * Queues Hexen II's native bigfont lettering with the installed sheet's advances. Each glyph is emitted at its own cell
 * so the 27 x 27 `fontsize.lmp` pair advances (and the C/P kern) are exact; the atlas glyphs live in the private-use
 * block, so one runtime atlas carries both the bigfont and the small conchars. The command carries `display` (the
 * original character) for diagnostics because `text` is the private atlas key.
 *
 * @param {number} x left edge in virtual screen units, menu offset already applied
 * @param {number} y top of the glyph cell in virtual units
 * @param {string} text the text (A-Z, space and `/`)
 * @param {?qpic_t} pic the native bigfont sheet (used only to confirm the source exists)
 * @param {?Uint8Array} widths the native 27 x 27 advance table
 * @returns {boolean} true when queued; false when the frame is not Hexen-skinned or its atlas is not ready
 */
export function MainMenu_BigText( x, y, text, pic, widths ) {

	if ( ! frameSkin || activeSkin().id !== 'hexen2' || ! renderer?.__hexenAtlas?.bigfont ) return false;
	if ( ! pic ) return false;
	const scale = Draw_GetUIScale(), em = 19 * scale, string = String( text );
	const base = MENU_SKINS.hexen2.font.privateBase;
	const placed = [];
	for ( let i = 0; i < string.length; i ++ ) {

		const num = MenuSkin_BigfontIndex( string[ i ] );
		if ( num === 32 ) { placed.push( { space: true } ); continue; }
		if ( num < 0 || num >= 27 ) { placed.push( { invalid: true } ); continue; }
		const key = String.fromCharCode( base + num ), glyph = renderer.font.glyphs[ key ];
		if ( ! glyph?.atlas ) return false;
		placed.push( { key, display: string[ i ], ink: glyph.ink, num } );

	}
	let cellX = x;
	for ( let i = 0; i < placed.length; i ++ ) {

		const glyph = placed[ i ];
		if ( glyph.space ) { cellX += 32; continue; }
		if ( glyph.invalid ) continue;
		commands.push( { type: 'text', text: glyph.key, display: glyph.display, x: cellX * scale + glyph.ink[ 0 ] * em,
			y: y * scale + glyph.ink[ 1 ] * em, size: em, stretch: 1, kind: 1, bigfont: true, skin: 'hexen2' } );
		const next = MenuSkin_BigfontIndex( string[ i + 1 ] );
		if ( next < 0 || next >= 27 ) continue;
		const extra = glyph.num === 2 && next === 15 ? 3 : 0;
		cellX += ( widths && widths.length === 27 * 27 ? widths[ glyph.num * 27 + next ] : 14 ) + extra;

	}
	return true;

}

/**
 * Queues engine menu text in the supplied font. Engine text is a fixed 8-unit cell grid; every character stays in its
 * own cell (cap height 4.8 units) so right-aligned labels, columns and save-slot rows land exactly where the original
 * bitmap font put them. Under Hexen II the runtime conchars atlas is used and case is preserved for player names, save
 * names and key binds; Quake keeps its upper-cased fixed-grid behaviour. Called by `M_Print`/`M_PrintWhite` and for
 * printable characters by `MainMenu_Glyph`.
 *
 * @param {number} x left edge in virtual (320 x 200 based) screen units, menu offset already applied
 * @param {number} y top of the first line in virtual units; `\n` starts a new 8-unit row
 * @param {string} text the text (coerced to string); spaces and control characters leave their cell empty
 * @param {number} [kind=0] the glyph material: 0 the menu's own (`M_Print`, stock highlighted characters), 2 the stock
 *   white engine text (`M_PrintWhite`, drawn with material 3)
 * @param {boolean} [disabled=false] drawn as the donor menu draws an item that cannot be chosen (`M_PrintFaded`, card [MP1])
 * @returns {boolean} true when queued (the caller skips native drawing); false when the frame is not skinned
 */
export function MainMenu_Text( x, y, text, kind = 0, disabled = false ) {

	if ( ! frameSkin ) return false;
	// Engine text is a fixed 8-unit cell grid. Keep every character in its own
	// cell so right-aligned labels, columns and save-slot rows land exactly where
	// the original bitmap font put them.
	const hexen = activeSkin().id === 'hexen2';
	if ( hexen && ! renderer?.__hexenAtlas?.conchars ) return false;
	if ( kind === 2 ) kind = 3; // stock white engine text
	const scale = Draw_GetUIScale(), capH = ( hexen ? HEXEN_CELL_CAP : CELL_CAP ) * scale, em = emFor( 'H', capH );
	const cellTop = ( hexen ? 1 : CELL_CAP_TOP ) * scale, maxWidth = ( hexen ? CELL : CELL_MAX_W ) * scale;
	String( text ).split( '\n' ).forEach( ( line, row ) => {

		[ ...line ].forEach( ( raw, i ) => {

			const code = raw.charCodeAt( 0 );
			const ch = hexen ? raw : raw.toUpperCase();
			if ( ch === ' ' ) return;
			if ( code < 32 && ! ( hexen && code >= 10 && code <= 13 ) ) return;
			const shape = renderer._shape( ch, em, 1, ! hexen );
			if ( ! ( shape.width > 0 ) ) return;
			const glyph = hexen ? renderer.font.glyphs[ ch ] : null;
			const stretch = hexen ? 1 : Math.min( 1, maxWidth / shape.width ), w = shape.width * stretch;
			const top = ( y + row * CELL ) * scale + cellTop;
			const oy = '.,_'.includes( ch ) ? top + capH - shape.height :
				'-+=<>:;'.includes( ch ) ? top + ( capH - shape.height ) / 2 : top;
			// Hexen II's conchars are a fixed 8-pixel grid: place the glyph's own ink at the cell's native offset so case,
			// punctuation and right-aligned columns land where the bitmap font put them. Quake keeps the donor's centring.
			const commandX = hexen && glyph ? ( x + i * CELL ) * scale + glyph.ink[ 0 ] * em
				: ( x + i * CELL ) * scale + ( CELL * scale - w ) / 2;
			const commandY = hexen && glyph ? ( y + row * CELL ) * scale + glyph.ink[ 1 ] * em : oy;
			const command = { type: 'text', text: ch, x: commandX,
				y: commandY, size: em, stretch, kind, disabled: !! disabled };
			if ( hexen ) command.skin = 'hexen2';
			commands.push( command );

		} );

	} );
	return true;

}

/**
 * Replaces one native menu character (`M_DrawCharacter`): codes 12..17 become the rotating Q selector, 128..131 (the
 * legacy slider characters) are swallowed because `MainMenu_Slider` draws the slider whole, 10/11 (the blinking text
 * cursor) draw `|` on one phase only, and other printable codes become text (white below 128, menu text above).
 *
 * @param {number} x left edge in virtual screen units
 * @param {number} y top edge in virtual screen units
 * @param {number} code the Quake charset code, 0..255
 * @returns {boolean} true when handled (including swallowed codes and codes below 32 other than those above); false
 *   when the frame is not skinned
 */
export function MainMenu_Glyph( x, y, code ) {

	if ( ! frameSkin ) return false;
	if ( activeSkin().id === 'hexen2' ) {

		if ( ! renderer?.__hexenAtlas?.conchars ) return false;
		// Hexen II's own charset has 512 cells: a raw code (10/11/12/13 cursor, 128/129 scroll arrows) is drawn from the
		// plain bank; a +256 code is the highlighted menu bank. 128..131 are real glyphs here, not Quake slider pieces.
		if ( code >= 256 ) return MainMenu_Text( x, y, String.fromCharCode( code & 255 ), 0 );
		if ( code >= 32 || ( code >= 10 && code <= 13 ) || ( code >= 128 && code <= 131 ) )
			return MainMenu_Text( x, y, String.fromCharCode( code ), 2 );
		return true;

	}
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

/**
 * Queues a bronze panel (or a dark recessed well) in the supplied material.
 *
 * @param {number} x left edge in virtual screen units
 * @param {number} y top edge in virtual screen units
 * @param {number} width width in virtual units
 * @param {number} height height in virtual units
 * @param {boolean} [well=false] true for a recessed well (text boxes, slider tracks)
 * @returns {boolean} true when queued; false when the frame is not skinned
 */
export function MainMenu_Panel( x, y, width, height, well = false ) {

	if ( ! frameSkin ) return false;
	const [ px, py ] = physical( x, y ), scale = Draw_GetUIScale();
	const command = { type: 'panel', x: px, y: py, w: width * scale, h: height * scale, well };
	if ( activeSkin().id === 'hexen2' ) { command.skin = 'hexen2'; command.material = 'stone'; }
	commands.push( command );
	return true;

}

/**
 * Dialog/text box (`M_DrawTextBox`): the original border tiles leave a transparent margin inside the nominal cell area;
 * the dark recessed panel is inset by exactly that margin, measured from the corner pictures' opaque pixels.
 *
 * @param {number} x left edge of the box's cell area in virtual screen units
 * @param {number} y top edge in virtual units
 * @param {number} width width in virtual units (`( width + 2 ) * 8` from the caller)
 * @param {number} height height in virtual units (`( lines + 2 ) * 8`)
 * @param {?qpic_t} tl the `gfx/box_tl.lmp` picture, or null for no inset on the top/left
 * @param {?qpic_t} br the `gfx/box_br.lmp` picture, or null for no inset on the bottom/right
 * @returns {boolean} true when queued; false when the frame is not skinned
 */
export function MainMenu_TextBox( x, y, width, height, tl, br ) {

	if ( ! frameSkin ) return false;
	const a = tl && inkBox( tl, 0, tl.height, opaque ), b = br && inkBox( br, 0, br.height, opaque );
	const left = a ? a.x : 0, top = a ? a.y : 0;
	const right = b ? br.width - ( b.x + b.w ) : 0, bottom = b ? br.height - ( b.y + b.h ) : 0;
	return MainMenu_Panel( x + left, y + top, width - left - right, height - top - bottom, true );

}

/**
 * Queues an options slider (`M_DrawSlider`): a recessed track and a knob placed on cell `(range - 1) * value` of the
 * middle cells, as the stock knob sits. (x, y) is the left end of the 12-cell track and the top of its cell row.
 *
 * @param {number} x left end of the track in virtual screen units
 * @param {number} y top of its cell row in virtual units
 * @param {number} width the track's width in virtual units (`( SLIDER_RANGE + 2 ) * 8` = 96)
 * @param {number} value the slider position, 0..1 (clamped)
 * @returns {boolean} true when queued; false when the frame is not skinned
 */
export function MainMenu_Slider( x, y, width, value ) {

	if ( ! frameSkin ) return false;
	const scale = Draw_GetUIScale(), v = Math.max( 0, Math.min( 1, value ) );
	const trackH = 6.5 * scale, [ px, py ] = physical( x, y + ( CELL - 6.5 ) / 2 ), hexen = activeSkin().id === 'hexen2';
	const track = { type: 'panel', x: px, y: py, w: width * scale, h: trackH, well: true };
	if ( hexen ) { track.skin = 'hexen2'; track.material = 'stone'; }
	commands.push( track );
	// The stock knob sits on cell (range-1)*v of the ten middle cells.
	const knobW = 6 * scale, knobH = 9 * scale;
	const knob = { type: 'panel', x: px + ( CELL + ( width / CELL - 3 ) * CELL * v ) * scale + ( CELL * scale - knobW ) / 2,
		y: py + ( trackH - knobH ) / 2, w: knobW, h: knobH };
	if ( hexen ) { knob.skin = 'hexen2'; knob.material = 'stone'; }
	commands.push( knob );
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

// Hexen II's own pictures are presented as pictures: queued before the WebGL panels so the dynamic lettering and
// panels stay on top, copied with smoothing so a 117 x 60 plaque or a 320 x 200 help page reads as clean art rather
// than nearest-neighbour blocks. They are not replaced with guessed typography.
function queueHexenImage( pic, px, py, scale, srcY = 0, srcH = 0 ) {

	const height = srcH || pic.height || 0;
	if ( ! ( pic.width > 0 && height > 0 ) ) return false;
	commands.push( { type: 'image', pic, path: pic.path || '', x: px, y: py, w: pic.width * scale, h: height * scale,
		srcX: 0, srcY, srcW: pic.width, srcH: height, smooth: true, skin: 'hexen2' } );
	return true;

}

function queueHexenSelector( pic, px, py, scale ) {

	if ( ! ( pic.width > 0 && pic.height > 0 ) ) return false;
	commands.push( { type: 'selector', x: px, y: py, w: pic.width * scale, h: pic.height * scale,
		pic, path: pic.path || '', smooth: true, skin: 'hexen2' } );
	return true;

}

function hexenImage( x, y, pic, srcY, srcH ) {

	const [ px, py ] = physical( x, y ), scale = Draw_GetUIScale(), path = pic.path || '';
	if ( path.startsWith( 'gfx/menudot' ) ) return queueHexenSelector( pic, px, py, scale );
	// The bigfont and conchars sheets are consumed by MainMenu_BigText/MainMenu_Text, never drawn as pictures.
	if ( /gfx\/menu\/(?:bigfont2?|conchars)\.lmp$/.test( path ) ) return true;
	return queueHexenImage( pic, px, py, scale, srcY, srcH );

}

/**
 * Replaces a native menu picture (`M_DrawPic`, `M_DrawTransPic`, `M_DrawSubPic`) with the supplied typography placed
 * on the original artwork's measured ink: the QUAKE plaque's letters (its id mark blitted as original pixels), the
 * rotating `gfx/menudot*` selector, the title plaques in `TITLES`, and the menu item sheets (main menu, single player,
 * multiplayer). `gfx/box_*` tiles are dropped (the text box panel replaces them); `gfx/bigbox.lmp` stays native;
 * pictures with no replacement are queued as blits so they still land above the WebGL panels.
 *
 * Under Hexen II every game picture is queued as a smoothed high-resolution image or, for `gfx/menu/menudot*`, as the
 * animated selector; Quake's replacements below are unchanged.
 *
 * @param {number} x left edge in virtual screen units
 * @param {number} y top edge in virtual units
 * @param {?qpic_t} pic the picture (its `path` selects the replacement; `canvas` is read for measurement)
 * @param {number} [srcY=0] the top row of a sub-picture in picture units; a nonzero value cannot be blitted
 * @param {number} [srcH=0] the sub-picture height in picture units (the whole picture when omitted)
 * @returns {boolean} true when replaced or queued; false to draw natively (not skinned, no picture, the portrait
 *   frame, an unmeasurable sheet, or a sub-picture with no replacement)
 */
export function MainMenu_Image( x, y, pic, srcY = 0, srcH = 0 ) {

	if ( ! frameSkin || ! pic ) return false;
	if ( activeSkin().id === 'hexen2' ) return hexenImage( x, y, pic, srcY, srcH );
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

/**
 * Queues one animated menudot frame as Hexen II's selector. The native page has already chosen the frame from
 * `realtime`; the dynamic layer draws that original sprite cleanly upscaled instead of the rotating Q.
 *
 * @param {number} x left edge in virtual screen units
 * @param {number} y top edge in virtual units
 * @param {?qpic_t} pic the `gfx/menu/menudot1..8.lmp` frame
 * @returns {boolean} true when queued; false when the frame is not Hexen-skinned or the picture is missing
 */
export function MainMenu_MenuDot( x, y, pic ) {

	if ( ! frameSkin || activeSkin().id !== 'hexen2' || ! pic ) return false;
	const [ px, py ] = physical( x, y );
	return queueHexenSelector( pic, px, py, Draw_GetUIScale() );

}

/**
 * Queues a scrolling title or plaque picture at its animated destination. The native clipping is not baked in: the
 * picture keeps its whole source and the overlay clips the negative top, so the dynamic layer can animate the slide at
 * full resolution. Called by `M_DrawTransPicCropped`.
 *
 * @param {number} x left edge in physical overlay pixels, menu offset already applied
 * @param {number} y top edge in physical overlay pixels; may be negative
 * @param {?qpic_t} pic the title or plaque picture
 * @returns {boolean} true when queued; false when the frame is not Hexen-skinned or the picture is missing
 */
export function MainMenu_ScrollPic( x, y, pic ) {

	if ( ! frameSkin || activeSkin().id !== 'hexen2' || ! pic ) return false;
	return queueHexenImage( pic, x, y, Draw_GetUIScale() );

}

let inGameSnapshot = false;
/**
 * Tells the main menu sheet whether a game is in progress, so its rows are labelled with Continue first. Called by
 * `M_Main_Draw` every main menu frame.
 *
 * @param {boolean} value whether the Continue row is shown (coerced to boolean)
 */
export function MainMenu_SetInGame( value ) { inGameSnapshot = !! value; }

/**
 * Finishes a skinned frame: for Hexen II draws the queued original pictures at full resolution first, renders the
 * queued text/panel commands at the overlay canvas's size, composites the result over the native drawing with the
 * menu's soft drop shadow (`SHADOW`), then draws the menudot selectors and Quake's deferred blits. Quake's command list
 * and composite order are unchanged. Called at the end of `M_Draw`. A render error disables the WebGL menu for the
 * session (native drawing resumes next frame) and is logged, not thrown.
 *
 * @param {number} timeSeconds real time in seconds (`realtime`), passed to the renderer in milliseconds for the
 *   selector's rotation
 * @returns {boolean} true when the frame was presented
 */
export function MainMenu_End( timeSeconds ) {

	if ( ! frameSkin ) return false;
	frameSkin = false; // a frame is skinned only between Begin and End
	const canvas = Draw_GetOverlayCanvas();
	if ( ! canvas || ! renderer ) return false;
	const hexen = activeSkin().id === 'hexen2';
	try {

		size = [ canvas.width, canvas.height ];
		const renderCommands = hexen ? commands.filter( c => c.type === 'text' || c.type === 'panel' || c.type === 'slider' ) : commands;
		if ( renderer.frame( size[ 0 ], size[ 1 ], timeSeconds * 1000, renderCommands, 0 ) === false ) return false;
		// Hexen II's plaques, help pages and menu art are backgrounds: draw them before the renderer's canvas, then its
		// dynamic lettering and panels over them. Menudots are the selector and stay crisp on top. Quake's command list
		// is passed unchanged.
		if ( hexen ) for ( const command of commands ) if ( command.type === 'image' ) drawQueued( command );
		const scale = Draw_GetUIScale();
		Draw_FullResolutionCanvas( renderer.canvas, SHADOW.map( ( [ blur, alpha ] ) => [ blur * scale, alpha ] ) );
		if ( hexen ) for ( const command of commands ) if ( command.type === 'selector' ) drawQueued( command );
		// Logo artwork (the id mark) stays the original pixels, unsmoothed.
		for ( const b of blits ) Draw_FullResolutionImage( b.pic.canvas, b.sx, b.sy, b.sw, b.sh, b.dx, b.dy, b.dw, b.dh, !! b.smooth );
		presented = true; return true;

	} catch ( error ) {

		failed = String( error.message || error ); renderer.destroy(); renderer = null; presented = false;
		console.warn( 'Menu rendering failed; native drawing resumes next frame:', failed );
		return false;

	}

}

// Copies one queued Hexen image/selector at full resolution. The picture's canvas can be larger than its logical size
// (a high-DPI decode); source rectangles stay in picture units and are scaled here.
function drawQueued( command ) {

	const pic = command.pic, canvas = pic?.canvas;
	if ( ! canvas || ! ( canvas.width > 0 ) || ! ( canvas.height > 0 ) ) return false;
	const ratioX = canvas.width / ( pic.width || 1 ), ratioY = canvas.height / ( pic.height || 1 );
	const srcX = ( command.srcX || 0 ) * ratioX, srcY = ( command.srcY || 0 ) * ratioY;
	const srcW = ( command.srcW || pic.width ) * ratioX, srcH = ( command.srcH || pic.height ) * ratioY;
	Draw_FullResolutionImage( canvas, srcX, srcY, srcW, srcH, command.x, command.y, command.w, command.h, command.smooth !== false );
	return true;

}

/**
 * Read-only diagnostic: the draw commands and deferred picture blits of the last frame (used by tests).
 *
 * @returns {{ commands: Array<object>, blits: Array<object> }} shallow copies; command coordinates are physical pixels
 */
export function MainMenu_Frame() {

	return { commands: commands.map( c => ( { ...c } ) ), blits: blits.map( b => ( { ...b } ) ) };

}

/**
 * Diagnostic state of the WebGL menu, for tests and the in-browser trial.
 *
 * @returns {{ visible: boolean, skinActive: boolean, ready: boolean, error: ?string, contextLost: boolean,
 *   size: Array<number>, commands: number, pendingFrame: number, layout: ?{ width: number, height: number,
 *   glyphInstances: number, panels: number } }} `skinActive` is true once the last frame was presented; `size` the
 *   last frame's canvas size in pixels; `error` the reason the menu fell back to native drawing
 */
export function MainMenu_Snapshot() {

	const skin = activeSkin();
	return { visible, skinActive: presented, ready: skinReady( renderer ) && ! failed,
		error: failed, contextLost: !! renderer?.contextLost, size: [ ...size ], commands: commands.length,
		skin: skin.id, menuSkin: renderer?.__menuSkin || null, material: renderer?.__material || null,
		font: renderer?.__hexenAtlas ? { ...renderer.__hexenAtlas } : null,
		pendingFrame: renderer?.pendingFrame || 0, layout: renderer?.layout ? {
			width: renderer.layout.width, height: renderer.layout.height,
			glyphInstances: renderer.layout.glyphs.length / 12,
			panels: renderer.layout.panels.length / 8
		} : null };

}

if ( typeof window !== 'undefined' ) window.addEventListener?.( 'pagehide', MainMenu_Destroy );
