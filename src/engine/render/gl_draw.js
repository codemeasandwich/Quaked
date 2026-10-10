/**
 * @module engine/render/gl_draw
 *
 * 2D drawing (WinQuake gl_draw.c): pictures, characters and fills for the HUD, menu and console, on a canvas 2D
 * overlay; textures from the WAD and the paks.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `numgltextures`, `texture_extension_number`, `minimumUIWidth`,
 * `minimumUIHeight`, `scopedUIScale`, `overlayCanvas`, `overlayCtx`, `char_canvas`, `conback`, `draw_disc`,
 * `draw_backtile`, `host_basepal` and 15 more.
 *
 * Errors: throws at 2 places; catches at 2 places.
 *
 * Engine callbacks are injected with `Draw_SetExternals`.
 */
// Ported from: WinQuake/gl_draw.c -- GL 2D drawing functions
// In browser port: uses a canvas 2D overlay context for HUD/menu/console drawing

import { Con_Printf } from '../common/console.js';
import { W_GetLumpName } from '../common/wad.js';
import { d_8to24table as vid_d_8to24table } from './vid.js';
import { COM_FindFile } from '../common/pak.js';
import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from '../common/cmd.js';
import { R_NewerHudCanvas } from '../common/hooks.js'; // installed by newer/ui/r_newerhud.js
import { BuildSinglePlayerMenuArt, BuildMenuTextArt } from '../common/hooks.js'; // installed by newer/ui/menu_art.js

/*
==============================================================================

			TEXTURE MANAGEMENT

==============================================================================
*/

const MAX_GLTEXTURES = 1024;

class gltexture_t {

	constructor() {

		this.identifier = '';
		this.texnum = 0;
		this.width = 0;
		this.height = 0;
		this.mipmap = false;

	}

}

const gltextures = [];
for ( let i = 0; i < MAX_GLTEXTURES; i ++ )
	gltextures[ i ] = new gltexture_t();

let numgltextures = 0;
let texture_extension_number = 1;

// Cached pics
const cachepics = {}; // name -> { width, height, data, canvas, texnum }
let minimumUIWidth = 320, minimumUIHeight = 200;
let scopedUIScale = 1;

// 2D overlay canvas
let overlayCanvas = null;
let overlayCtx = null;

/**
 * Copies a full-screen canvas onto the 2D overlay at physical pixel (0, 0), one to one. Used by the WebGL menu
 * (newer/ui/menu_webgl.js) each frame it draws: GPU menu output is already at backing-store resolution, so it is not
 * sent through the 320x200 HUD transform and gets no second colour or scale conversion. The overlay's transform,
 * alpha, composite mode and shadow are restored afterwards, even when a draw throws. Does nothing before `Draw_Init`.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} source the image, sized in physical overlay pixels; drawn opaque
 *   (alpha 1, source-over)
 * @param {?Array<[number, number]>} [shadow=null] optional passes of [ blur in physical pixels, alpha 0..1 ]: a soft
 *   black drop shadow of everything opaque in `source`, laid down first so it fades from behind the image into the
 *   scene. Each pass draws the image off-canvas with the shadow offset back onto it, so only the blurred shadow
 *   reaches the screen; the image itself is then drawn once, crisp
 */
export function Draw_FullResolutionCanvas( source, shadow = null ) {

	if ( ! overlayCtx ) return;
	overlayCtx.save();
	try {

		overlayCtx.setTransform( 1, 0, 0, 1, 0, 0 );
		overlayCtx.globalAlpha = 1;
		overlayCtx.globalCompositeOperation = 'source-over';
		if ( shadow ) {

			const away = ( source.width || 0 ) + 1024;
			overlayCtx.shadowOffsetX = away; overlayCtx.shadowOffsetY = 0;
			for ( const [ blur, alpha ] of shadow ) {

				overlayCtx.shadowBlur = blur; overlayCtx.shadowColor = 'rgba(0,0,0,' + alpha + ')';
				overlayCtx.drawImage( source, - away, 0 );

			}
			overlayCtx.shadowColor = 'rgba(0,0,0,0)'; overlayCtx.shadowBlur = 0; overlayCtx.shadowOffsetX = 0;

		}
		overlayCtx.drawImage( source, 0, 0 );

	} finally { overlayCtx.restore(); }

}

/**
 * Unsmoothed (unless asked) copy of a source rectangle to physical overlay pixels, bypassing the UI scale transform
 * (logo artwork; the WebGL menu's picture blits). The overlay's transform and smoothing are restored afterwards, even
 * when the draw throws. Does nothing before `Draw_Init` or without a source.
 *
 * @param {CanvasImageSource} source the image to copy from
 * @param {number} sx source rectangle left, in source pixels
 * @param {number} sy source rectangle top, in source pixels
 * @param {number} sw source rectangle width, in source pixels
 * @param {number} sh source rectangle height, in source pixels
 * @param {number} dx destination left, in physical overlay (backing-store) pixels
 * @param {number} dy destination top, in physical overlay pixels
 * @param {number} dw destination width, in physical overlay pixels
 * @param {number} dh destination height, in physical overlay pixels
 * @param {boolean} [smooth=false] true to scale with image smoothing, false for nearest-pixel
 */
export function Draw_FullResolutionImage( source, sx, sy, sw, sh, dx, dy, dw, dh, smooth = false ) {

	if ( ! overlayCtx || ! source ) return;
	overlayCtx.save();
	try {

		overlayCtx.setTransform( 1, 0, 0, 1, 0, 0 );
		overlayCtx.imageSmoothingEnabled = smooth;
		overlayCtx.drawImage( source, sx, sy, sw, sh, dx, dy, dw, dh );

	} finally { overlayCtx.restore(); }

}

/**
 * Runs `draw` with the overlay clipped to a rectangle, then restores the caller's clip and transform, including when
 * the drawing callback fails (the error still propagates). Used by the split-screen demo view (gl_screen.js) to draw
 * the status bar once into each half. Does nothing, and does not call `draw`, before `Draw_Init`.
 *
 * @param {number} x clip left, in virtual pixels (the same space as HUD drawing)
 * @param {number} y clip top, in virtual pixels
 * @param {number} width clip width, in virtual pixels
 * @param {number} height clip height, in virtual pixels
 * @param {() => void} draw the drawing to clip; called once, synchronously
 */
export function Draw_WithClipRect( x, y, width, height, draw ) {

	if ( ! overlayCtx ) return;
	overlayCtx.save();
	try {

		overlayCtx.beginPath(); overlayCtx.rect( x, y, width, height ); overlayCtx.clip();
		draw();

	} finally { overlayCtx.restore(); }

}

/**
 * Runs `draw` with a temporarily larger virtual screen, so larger menus can fit without changing the owner's UI-size
 * preference (`scr_conheight`). The minimum virtual size is raised to at least `width` x `height`, the integer UI
 * scale recomputed, multiplied by `scale`, and applied to the overlay; afterwards the previous minimum, scale and
 * transform are restored, even when `draw` throws. Used by the credits menu (menu.js) both to draw and to map touches:
 * drawing and pointer mapping must use the same temporary virtual dimensions. Calls nest (the scales multiply). Works
 * before `Draw_Init` too (no transform is set then).
 *
 * @param {number} width minimum virtual width in virtual pixels (the current minimum is kept if larger; normally 320)
 * @param {number} height minimum virtual height in virtual pixels (the current minimum is kept if larger; normally 200)
 * @param {() => T} draw the drawing or hit test to run under the temporary size; called once, synchronously
 * @param {number} [scale=1] further shrink factor applied after the integer fit, in (0, 1]
 * @returns {T} what `draw` returned
 * @throws {RangeError} when `scale` is not a finite number greater than zero and at most one (checked before anything
 *   changes)
 * @template T
 */
export function Draw_WithVirtualSize( width, height, draw, scale = 1 ) {

	if ( ! Number.isFinite( scale ) || scale <= 0 || scale > 1 ) throw new RangeError( 'UI scope scale must be greater than zero and at most one' );
	const oldWidth = minimumUIWidth, oldHeight = minimumUIHeight, oldScale = scopedUIScale;
	minimumUIWidth = Math.max( oldWidth, width ); minimumUIHeight = Math.max( oldHeight, height );
	scopedUIScale *= scale;
	if ( overlayCtx ) overlayCtx.save();
	try {

		_calculateUIScale();
		if ( overlayCtx ) overlayCtx.setTransform( _uiScale, 0, 0, _uiScale, 0, 0 );
		return draw();

	} finally {

		if ( overlayCtx ) overlayCtx.restore();
		minimumUIWidth = oldWidth; minimumUIHeight = oldHeight;
		scopedUIScale = oldScale;
		_calculateUIScale();

	}

}

// Charset
let char_canvas = null;
let conback = null;
let draw_disc = null;
let draw_backtile = null;

// Quake palette (256 colors, initialized externally)
let host_basepal = null;

// d_8to24table for palette conversion
let d_8to24table = null;

/*
==============================================================================

			UI SCALING

GLQuake used vid.conwidth/conheight to define a virtual resolution for 2D
content. We implement this via canvas transforms - all 2D drawing happens
in a virtual coordinate space that scales to fill the actual screen.

Default virtual height is 240 pixels (close to Quake's original 200).
This gives menus/HUD a classic look while scaling to any screen size.

==============================================================================
*/

// Target virtual height for 2D content (adjustable)
// 240 gives a classic Quake feel, 480 gives smaller/more modern UI
let scr_conheight = 240;

// Calculated scale factor (physical pixels per virtual pixel)
let _uiScale = 1;

// Cached virtual dimensions
let _virtualWidth = 640;
let _virtualHeight = 480;

/*
================
_calculateUIScale

Calculate the UI scale factor based on physical pixel count and target
virtual height. Uses physical pixels (CSS * devicePixelRatio) so that
screens with the same physical resolution get the same UI size regardless
of OS DPI settings. Also ensures the overlay canvas is crisp on HiDPI.
================
*/
function _calculateUIScale() {

	const dpr = window.devicePixelRatio || 1;
	const physicalWidth = Math.floor( _realVid.width * dpr );
	const physicalHeight = Math.floor( _realVid.height * dpr );

	// Calculate scale from physical pixels
	// Use floor to avoid fractional scaling (sharper pixels)
	_uiScale = Math.max( 1, Math.floor( physicalHeight / scr_conheight ) );

	// Ensure minimum 320px virtual width so Quake's menus fit
	while ( _uiScale > 1 && ( Math.floor( physicalWidth / _uiScale ) < minimumUIWidth || Math.floor( physicalHeight / _uiScale ) < minimumUIHeight ) ) {

		_uiScale --;

	}

	// Apply relative menu sizing AFTER the baseline integer fit. Increasing
	// the minimum virtual size instead would jump between integer scales.
	_uiScale *= scopedUIScale;
	_virtualWidth = Math.ceil( physicalWidth / _uiScale );
	_virtualHeight = Math.ceil( physicalHeight / _uiScale );

	return { width: _virtualWidth, height: _virtualHeight };

}

/*
================
SCR_SetConHeight
================
*/
/**
 * Sets the target virtual height for UI scaling: lower values = larger UI, higher values = smaller UI. Clamped to
 * minimum 200, maximum the physical screen height (CSS height x devicePixelRatio). Recomputes the UI scale at once and
 * sets `vid.recalc_refdef` so the screen recomputes its refresh window next frame. Called by the `scr_conheight`,
 * `uiscale+` and `uiscale-` console commands. The value lives in this module only (not a cvar, not saved), so it
 * returns to 240 on reload.
 *
 * @param {number} height wanted virtual height in virtual pixels (240 = classic Quake size, 480 = modern size)
 */
export function SCR_SetConHeight( height ) {

	const dpr = window.devicePixelRatio || 1;
	const physicalHeight = Math.floor( _realVid.height * dpr );

	// Clamp to reasonable range
	scr_conheight = Math.max( 200, Math.min( height, physicalHeight ) );
	_calculateUIScale();
	_realVid.recalc_refdef = 1;

}

/*
================
SCR_GetConHeight
================
*/
/**
 * Gets the current target virtual height set by `SCR_SetConHeight` (240 until changed).
 *
 * @returns {number} the target virtual height in virtual pixels, 200 or more
 */
export function SCR_GetConHeight() {

	return scr_conheight;

}

/*
================
Draw_GetUIScale
================
*/
/**
 * Gets the current UI scale factor, recomputed from the video size, devicePixelRatio and target height on every call.
 * Read by `SCR_CalcRefdef` (as `r_refdef.vrectScale`) and by the WebGL menu to size its output.
 *
 * @returns {number} physical pixels per virtual pixel: a whole number of at least 1 that fits the minimum virtual
 *   size (320x200), times any scale of an enclosing `Draw_WithVirtualSize`
 */
export function Draw_GetUIScale() {

	_calculateUIScale();
	return _uiScale;

}

/*
================
Draw_GetVirtualWidth / Draw_GetVirtualHeight
================
*/
/**
 * Gets the current virtual width for 2D drawing, recomputing the UI scale first. Used by other modules (the status
 * bar, screen, console and menu read it as their `vid.width`) instead of computing locally.
 *
 * @returns {number} the overlay's width in virtual pixels: physical width / UI scale, rounded up
 */
export function Draw_GetVirtualWidth() {

	_calculateUIScale();
	return _virtualWidth;

}

/**
 * Gets the current virtual height for 2D drawing, recomputing the UI scale first. Used by other modules (the status
 * bar, screen, console and menu read it as their `vid.height`) instead of computing locally.
 *
 * @returns {number} the overlay's height in virtual pixels: physical height / UI scale, rounded up
 */
export function Draw_GetVirtualHeight() {

	_calculateUIScale();
	return _virtualHeight;

}

/*
================
SCR_ConHeight_f

Console command to set the virtual UI height.
Usage: scr_conheight [height]
Lower values = larger UI (240 = classic Quake size)
Higher values = smaller UI (480 = modern size)
================
*/
function SCR_ConHeight_f() {

	if ( Cmd_Argc() === 1 ) {

		// No argument - print current value
		const dims = _calculateUIScale();
		Con_Printf( 'scr_conheight is %d (virtual: %dx%d, scale: %dx)\n',
			scr_conheight, dims.width, dims.height, _uiScale );
		return;

	}

	const val = parseInt( Cmd_Argv( 1 ), 10 );
	if ( isNaN( val ) || val < 200 ) {

		Con_Printf( 'scr_conheight must be at least 200\n' );
		return;

	}

	SCR_SetConHeight( val );
	const dims = _calculateUIScale();
	Con_Printf( 'UI scale: %dx (virtual: %dx%d)\n', _uiScale, dims.width, dims.height );

}

/*
================
SCR_UIScaleUp_f

Increase UI size (decrease scr_conheight).
================
*/
function SCR_UIScaleUp_f() {

	// Decrease conheight by ~40 (makes UI bigger)
	SCR_SetConHeight( scr_conheight - 40 );
	const dims = _calculateUIScale();
	Con_Printf( 'UI scale: %dx (virtual: %dx%d)\n', _uiScale, dims.width, dims.height );

}

/*
================
SCR_UIScaleDown_f

Decrease UI size (increase scr_conheight).
================
*/
function SCR_UIScaleDown_f() {

	// Increase conheight by ~40 (makes UI smaller)
	SCR_SetConHeight( scr_conheight + 40 );
	const dims = _calculateUIScale();
	Con_Printf( 'UI scale: %dx (virtual: %dx%d)\n', _uiScale, dims.width, dims.height );

}

/*
================
Draw_InitCommands

Register UI scale console commands.
Called from Draw_Init.
================
*/
function Draw_InitCommands() {

	Cmd_AddCommand( 'scr_conheight', SCR_ConHeight_f );
	Cmd_AddCommand( 'uiscale+', SCR_UIScaleUp_f );
	Cmd_AddCommand( 'uiscale-', SCR_UIScaleDown_f );

}

// the status bar's redraw flag (client/sbar.js), set by the host ([44g] D1a): the renderer does not import the client
let _Sbar_Changed = () => {};

/*
==============================================================================

			EXTERNAL REFERENCES

==============================================================================
*/

let _realVid = { width: 640, height: 480 };
const _vid = {
	get width() {

		return _virtualWidth;

	},
	get height() {

		return _virtualHeight;

	},
	get numpages() { return _realVid.numpages; }
};

/**
 * Wires 2D drawing to what it cannot import without a cycle. Called twice: by `Host_Init` (host.js) before `Draw_Init`
 * with the video, palette and colour table, so the overlay canvas gets the correct size; and as host.js loads, in its
 * [44g] D1a block, with `Sbar_Changed`. Each key that is present replaces the stored value, absent keys keep theirs.
 * Until wired, `vid` is a 640x480 stand-in, the palette is null (`Draw_Fill` then fills white), the colour table
 * falls back to vid.js's `d_8to24table`, and `Sbar_Changed` does nothing. The references are kept for the life of the
 * page.
 *
 * @param {{ vid?: viddef_t, host_basepal?: Uint8Array, d_8to24table?: Uint32Array,
 *   Sbar_Changed?: () => void }} externals the hooks: `vid` is the real (CSS-pixel) video size the UI scale is computed
 *   from, and receives `recalc_refdef`; `host_basepal` is gfx/palette.lmp, 256 RGB byte triples, used by `Draw_Fill`;
 *   `d_8to24table` maps palette index to 0xAABBGGRR for decoding pictures; `Sbar_Changed` (client/sbar.js) is called by
 *   `Draw_FadeScreen`
 */
export function Draw_SetExternals( externals ) {

	if ( externals.vid ) _realVid = externals.vid;
	if ( externals.host_basepal ) host_basepal = externals.host_basepal;
	if ( externals.d_8to24table ) d_8to24table = externals.d_8to24table;
	if ( externals.Sbar_Changed ) _Sbar_Changed = externals.Sbar_Changed;

}

/*
===============
_loadCharset

Loads the "conchars" lump from gfx.wad and creates a canvas with the charset.
conchars is 128x128 pixels, 8-bit indexed (16x16 grid of 8x8 characters).
===============
*/
function _loadCharset() {

	const pal = d_8to24table || vid_d_8to24table;
	if ( ! pal ) return;

	const lump = W_GetLumpName( 'conchars' );
	if ( ! lump ) return;

	let data;
	if ( lump.data instanceof Uint8Array ) {

		data = lump.data.subarray( lump.offset, lump.offset + lump.size );

	} else {

		data = new Uint8Array( lump.data, lump.offset, lump.size );

	}

	const charWidth = 128;
	const charHeight = 128;
	const cs = document.createElement( 'canvas' );
	cs.width = charWidth;
	cs.height = charHeight;
	const ctx = cs.getContext( '2d' );
	const imageData = ctx.createImageData( charWidth, charHeight );
	const pixels = imageData.data;

	for ( let i = 0; i < charWidth * charHeight; i ++ ) {

		const palIdx = data[ i ];
		if ( palIdx === 0 ) {

			// transparent
			pixels[ i * 4 ] = 0;
			pixels[ i * 4 + 1 ] = 0;
			pixels[ i * 4 + 2 ] = 0;
			pixels[ i * 4 + 3 ] = 0;

		} else {

			const rgba = pal[ palIdx ];
			pixels[ i * 4 ] = rgba & 0xff;
			pixels[ i * 4 + 1 ] = ( rgba >> 8 ) & 0xff;
			pixels[ i * 4 + 2 ] = ( rgba >> 16 ) & 0xff;
			pixels[ i * 4 + 3 ] = 255;

		}

	}

	ctx.putImageData( imageData, 0, 0 );
	char_canvas = cs;

}

/*
===============
_loadConback

Loads the console background image from gfx/conback.lmp in the PAK file.
conback.lmp is a qpic_t: int32 width (320), int32 height (200), then 320*200 palette indices.
===============
*/
function _loadConback() {

	const pal = d_8to24table || vid_d_8to24table;
	if ( ! pal ) return;

	const result = COM_FindFile( 'gfx/conback.lmp' );
	if ( ! result ) {

		Con_Printf( 'Couldn\'t load gfx/conback.lmp\n' );
		return;

	}

	const view = new DataView( result.data.buffer, result.data.byteOffset, result.size );
	const width = view.getInt32( 0, true );
	const height = view.getInt32( 4, true );

	const pixels = new Uint8Array( result.data.buffer, result.data.byteOffset + 8, width * height );

	const cs = _qpicToCanvas( width, height, pixels, false );
	if ( ! cs ) return;

	conback = {
		width: _vid.width,
		height: _vid.height,
		canvas: cs
	};

}

/*
===============
Draw_Init
===============
*/
/**
 * Sets up 2D drawing: takes the given canvas as the overlay or creates one (sized to physical pixels, CSS size x
 * devicePixelRatio, for crisp HiDPI; laid over the WebGL canvas, appended to the body, ignoring the pointer, and
 * resized with the window), computes the UI scale, registers `scr_conheight`, `uiscale+` and `uiscale-`, decodes the
 * `conchars` character set from gfx.wad and gfx/conback.lmp from the paks, and loads the `disc` and `backtile`
 * pictures. Called once by `Host_Init` (host.js) after `Draw_SetExternals` has supplied the video and palette; tests
 * pass their own canvas. Everything it loads is kept for the life of the page. A missing conback.lmp (the console
 * prints `Couldn't load gfx/conback.lmp`), `disc` or `backtile` only leaves that resource unloaded, and drawing falls
 * back (a black console, no disc, a grey tile).
 *
 * @param {HTMLCanvasElement} [canvas] an existing canvas to draw on; when omitted a new overlay canvas is created
 * @throws {Error} via `Sys_Error` (from `W_GetLumpName`) when the loaded gfx.wad has no `conchars` lump
 */
export function Draw_Init( canvas ) {

	if ( canvas ) {

		overlayCanvas = canvas;
		overlayCtx = canvas.getContext( '2d' );

	} else {

		// Create an overlay canvas positioned on top of the WebGL canvas
		// Size to physical pixels (CSS * dpr) for crisp HiDPI rendering
		const dpr = window.devicePixelRatio || 1;
		overlayCanvas = document.createElement( 'canvas' );
		overlayCanvas.width = Math.floor( ( _realVid.width || 640 ) * dpr );
		overlayCanvas.height = Math.floor( ( _realVid.height || 480 ) * dpr );
		overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
		overlayCtx = overlayCanvas.getContext( '2d' );
		document.body.appendChild( overlayCanvas );

		// Resize overlay when window resizes (use physical pixels)
		window.addEventListener( 'resize', function () {

			const dpr = window.devicePixelRatio || 1;
			overlayCanvas.width = Math.floor( _realVid.width * dpr );
			overlayCanvas.height = Math.floor( _realVid.height * dpr );
			// Scale is applied per-frame in Draw_BeginFrame

		} );

	}

	// Initial scale calculation
	_calculateUIScale();

	// Register console commands
	Draw_InitCommands();

	// Load charset from WAD for character drawing
	_loadCharset();

	// Load conback from PAK (gfx/conback.lmp)
	_loadConback();

	// Load disc and backtile from WAD
	draw_disc = Draw_PicFromWad( 'disc' );
	draw_backtile = Draw_PicFromWad( 'backtile' );

	Con_Printf( 'GL_Draw initialized (canvas 2D overlay, scale=' + _uiScale + 'x)\n' );

}

/*
===============
Draw_GetOverlayCanvas
===============
*/
/**
 * Returns the overlay canvas for compositing: the WebGL menu, bestiary book and studio logo draw on it, and the host
 * hands it to the teleport effect each frame.
 *
 * @returns {?HTMLCanvasElement} the 2D overlay (physical-pixel backing store), or null before `Draw_Init`
 */
export function Draw_GetOverlayCanvas() {

	return overlayCanvas;

}

/*
===============
Draw_BeginFrame
===============
*/
/**
 * Clears the overlay for a new frame of 2D drawing and applies the UI scaling transform (recomputed now), so all
 * drawing happens in virtual coordinates, with image smoothing off for crisp pixels. Called by `SCR_UpdateScreen`
 * (gl_screen.js) once per drawn frame, after `GL_BeginRendering`. Does nothing before `Draw_Init`.
 */
export function Draw_BeginFrame() {

	if ( overlayCtx ) {

		// Reset transform and clear
		overlayCtx.setTransform( 1, 0, 0, 1, 0, 0 );
		overlayCtx.clearRect( 0, 0, overlayCanvas.width, overlayCanvas.height );

		// Apply UI scale transform
		// This maps virtual coordinates to canvas pixels
		_calculateUIScale();
		overlayCtx.setTransform( _uiScale, 0, 0, _uiScale, 0, 0 );

		// Disable image smoothing for crisp pixels
		overlayCtx.imageSmoothingEnabled = false;

	}

}

/*
================
Draw_Character
================
*/
/**
 * Draws one 8*8 graphics character with 0 being transparent. It can be clipped to the top of the screen to allow the
 * console to be smoothly scrolled off. The glyph comes from the `conchars` sheet (16x16 grid of 8x8 characters;
 * 0-127 normal, 128-255 the alternate brown/gold set); with no sheet (`Draw_SetCharset( null )`), printable ASCII is
 * drawn as 8px monospace text, white or orange for the alternate set. Spaces (32) and characters wholly above the top are skipped.
 * Called by everything that prints on the overlay: console, status bar, menu, centre print, crosshair. Does nothing
 * before `Draw_Init`.
 *
 * @param {number} x left edge in virtual pixels
 * @param {number} y top edge in virtual pixels; -8 or less draws nothing
 * @param {number} num character code; only the low 8 bits are used (0..255)
 */
export function Draw_Character( x, y, num ) {

	if ( ! overlayCtx ) return;

	num &= 255;

	if ( num === 32 ) return; // space

	if ( y <= - 8 )
		return; // totally off screen

	// Draw character using the charset texture
	// The charset is a 16x16 grid of 8x8 characters (256 total)
	// Characters 0-127 are normal, 128-255 are the alternate (brown/gold) set
	if ( char_canvas ) {

		// Character sheet is 16x16 grid of 8x8 chars
		const row = Math.floor( num / 16 );
		const col = num % 16;

		overlayCtx.drawImage(
			char_canvas,
			col * 8, row * 8, 8, 8,
			x, y, 8, 8
		);

	} else {

		// Fallback: render as text
		const charCode = num & 127;
		const isAlt = num > 127;
		overlayCtx.fillStyle = isAlt ? '#ff8800' : '#ffffff';
		overlayCtx.font = '8px monospace';
		overlayCtx.textBaseline = 'top';

		if ( charCode >= 32 && charCode < 127 ) {

			overlayCtx.fillText( String.fromCharCode( charCode ), x, y );

		}

	}

}

/*
================
Draw_String
================
*/
/**
 * Draws a string left to right with `Draw_Character`, 8 virtual pixels per character, on one line (a newline is drawn
 * as its glyph, not a line break).
 *
 * @param {number} x left edge of the first character, in virtual pixels
 * @param {number} y top edge, in virtual pixels
 * @param {string} str the text; each UTF-16 code unit's low 8 bits pick the glyph
 */
export function Draw_String( x, y, str ) {

	for ( let i = 0; i < str.length; i ++ ) {

		Draw_Character( x, y, str.charCodeAt( i ) );
		x += 8;

	}

}

/*
================
Draw_Alt_String
================
*/
/**
 * Draws a string with alternate (gold) coloring: as `Draw_String`, with 128 added to each character code. Nothing
 * in the engine calls it at present.
 *
 * @param {number} x left edge of the first character, in virtual pixels
 * @param {number} y top edge, in virtual pixels
 * @param {string} str the text, in plain (0..127) characters
 */
export function Draw_Alt_String( x, y, str ) {

	for ( let i = 0; i < str.length; i ++ ) {

		Draw_Character( x, y, str.charCodeAt( i ) | 128 );
		x += 8;

	}

}

/*
=============
Draw_Pic
=============
*/
/**
 * Draws a picture at its own size on the overlay. Under Newer Game a WAD picture (one with `_name`) is replaced by its
 * higher resolution artwork (`R_NewerHudCanvas`), drawn smoothed at the sprite's size; the layered status bar face
 * is drawn unsmoothed at its stated size; a picture holding only `imageData` is put unscaled and untransformed.
 * Does nothing before `Draw_Init` or for a null picture.
 *
 * @param {number} x left edge in virtual pixels
 * @param {number} y top edge in virtual pixels
 * @param {?qpic_t} pic the picture from `Draw_PicFromWad`, `Draw_CachePic` or `Draw_CachePicFromPNG`
 *   (`{ width, height, canvas }`)
 * @throws {Error} for a WAD picture when the Newer hook `R_NewerHudCanvas` is not installed
 */
export function Draw_Pic( x, y, pic ) {

	if ( ! overlayCtx || ! pic ) return;

	if ( pic.canvas ) {
		if ( pic._layeredFace ) {
			overlayCtx.imageSmoothingEnabled = false;
			overlayCtx.drawImage( pic.canvas, x, y, pic.width, pic.height );
			return;
		}

		// Newer Game: a higher resolution picture, at the sprite's own size, smoothed
		const hi = pic._name !== undefined ? R_NewerHudCanvas( pic ) : null;
		if ( hi != null ) {

			overlayCtx.imageSmoothingEnabled = true;
			overlayCtx.imageSmoothingQuality = 'high';
			overlayCtx.drawImage( hi, x, y, pic.width, pic.height );
			overlayCtx.imageSmoothingEnabled = false;

		} else {

			overlayCtx.drawImage( pic.canvas, x, y );

		}

	} else if ( pic.imageData ) {

		overlayCtx.putImageData( pic.imageData, x, y );

	}

}

/*
=============
Draw_TransPic
=============
*/
/**
 * Same as `Draw_Pic` but with transparency (index 255 = transparent). In GL mode this is the same as `Draw_Pic` since
 * alpha is handled by texture: the decoded canvas already has index 255 clear. As in the original, a picture whose
 * corner would be off the top or left edge is not drawn at all.
 *
 * @param {number} x left edge in virtual pixels; below 0 draws nothing
 * @param {number} y top edge in virtual pixels; below 0 draws nothing
 * @param {?qpic_t} pic the picture
 */
export function Draw_TransPic( x, y, pic ) {

	if ( x < 0 || y < 0 ) return;

	Draw_Pic( x, y, pic );

}

/*
=============
Draw_SubPic
=============
*/
/**
 * Draws a vertical sub-region of a pic at full width. Used for the extended main menu image where we sometimes need
 * to skip the "Continue" row at the top (menu.js, through `M_SetExternals`). Unlike the other drawing calls it does
 * not check for the overlay, so it must not run before `Draw_Init`.
 *
 * @param {number} x left edge in virtual pixels; below 0 draws nothing
 * @param {number} y top edge in virtual pixels; below 0 draws nothing
 * @param {?qpic_t} pic the picture; one without a canvas draws nothing
 * @param {number} srcY first row of the picture to draw, in picture pixels
 * @param {number} srcH number of rows to draw, in picture pixels (drawn one to one)
 * @throws {TypeError} if called with a canvas picture before `Draw_Init` (no overlay context)
 */
export function Draw_SubPic( x, y, pic, srcY, srcH ) {

	if ( x < 0 || y < 0 || pic == null ) return;

	if ( pic.canvas ) {

		overlayCtx.drawImage( pic.canvas, 0, srcY, pic.width, srcH, x, y, pic.width, srcH );

	}

}

/*
=============
Draw_TransPicTranslate
=============
*/

// Cached menuplyr raw pixel data (8-bit palette indices)
let menuplyr_pixels = null;
let menuplyr_width = 0;
let menuplyr_height = 0;

// Cached canvas/context/imagedata for Draw_TransPicTranslate (Golden Rule #4)
let _transCanvas = null;
let _transCtx = null;
let _transImageData = null;

/**
 * Only used for the player color selection menu (the setup menu's player figure, menu.js). Remaps the pic's palette
 * indices through the translation table, then draws the result. Ported from WinQuake/gl_draw.c:658-699. The source
 * pixels are those of gfx/menuplyr.lmp, kept when `Draw_CachePic` first loads it (whatever `pic` is, only its size is
 * used); like the original it resamples them to 64x64 (index 255 transparent) and stretches that over `pic`'s width
 * and height. Reuses one 64x64 canvas across calls. Does nothing until menuplyr.lmp has been cached, or before
 * `Draw_Init`.
 *
 * @param {number} x left edge in virtual pixels
 * @param {number} y top edge in virtual pixels
 * @param {?qpic_t} pic the menuplyr picture; gives the drawn size
 * @param {Uint8Array|Array<number>} translation 256 entries: palette index to palette index (the shirt and pants
 *   colour rows are moved to the chosen colours)
 */
export function Draw_TransPicTranslate( x, y, pic, translation ) {

	if ( menuplyr_pixels == null || pic == null ) return;
	if ( overlayCtx == null ) return;

	const pal = d_8to24table || vid_d_8to24table;
	if ( pal == null ) return;

	// Create or reuse cached canvas
	if ( _transCanvas == null ) {

		_transCanvas = document.createElement( 'canvas' );
		_transCanvas.width = 64;
		_transCanvas.height = 64;
		_transCtx = _transCanvas.getContext( '2d' );
		_transImageData = _transCtx.createImageData( 64, 64 );

	}

	// The original C code resamples the menuplyr pic to 64x64.
	// menuplyr.lmp is typically larger, so we scale down.
	const srcW = menuplyr_width;
	const srcH = menuplyr_height;
	const dest = _transImageData.data;

	for ( let v = 0; v < 64; v ++ ) {

		const srcRow = ( ( v * srcH ) >> 6 ) * srcW;

		for ( let u = 0; u < 64; u ++ ) {

			const srcCol = ( u * srcW ) >> 6;
			let p = menuplyr_pixels[ srcRow + srcCol ];

			// Apply translation table
			p = translation[ p ];

			if ( p === 255 ) {

				dest[ ( v * 64 + u ) * 4 ] = 0;
				dest[ ( v * 64 + u ) * 4 + 1 ] = 0;
				dest[ ( v * 64 + u ) * 4 + 2 ] = 0;
				dest[ ( v * 64 + u ) * 4 + 3 ] = 0;

			} else {

				const rgba = pal[ p ];
				dest[ ( v * 64 + u ) * 4 ] = rgba & 0xff;
				dest[ ( v * 64 + u ) * 4 + 1 ] = ( rgba >> 8 ) & 0xff;
				dest[ ( v * 64 + u ) * 4 + 2 ] = ( rgba >> 16 ) & 0xff;
				dest[ ( v * 64 + u ) * 4 + 3 ] = 255;

			}

		}

	}

	_transCtx.putImageData( _transImageData, 0, 0 );

	// Draw at (x, y) stretched to pic dimensions, matching original GL quad
	overlayCtx.drawImage( _transCanvas, x, y, pic.width, pic.height );

}

/*
================
Draw_ConsoleBackground
================
*/
/**
 * Draws the console background, always fully opaque, matching DOS/WinQuake (draw.c) rather than GLQuake (gl_draw.c)
 * which used semi-transparent alpha blending. The full-screen image is slid down so its bottom edge sits at `lines`:
 * the wallpaper from `Draw_LoadConbackImage` fills the screen without stretching (cropping the overflow), the native
 * conback.lmp is stretched to the screen, and with neither the top `lines` rows are filled black. Called by
 * `Con_DrawConsole` (console.js) while the console is down and by the menu as its backdrop (full height) while the
 * console is down behind it. Does nothing before `Draw_Init`.
 *
 * @param {number} lines visible console height in virtual pixels, 0..screen height
 */
export function Draw_ConsoleBackground( lines ) {

	if ( ! overlayCtx ) return;

	if ( conback && conback.canvas && conback.cover === true ) {

		// custom wallpaper: fill the screen without stretching, cropping the overflow
		const src = conback.canvas;
		const destAspect = _vid.width / _vid.height;
		let sw = src.width, sh = src.height;
		if ( sw / sh > destAspect ) sw = sh * destAspect;
		else sh = sw / destAspect;
		overlayCtx.drawImage( src, ( src.width - sw ) / 2, ( src.height - sh ) / 2, sw, sh,
			0, lines - _vid.height, _vid.width, _vid.height );

	} else if ( conback && conback.canvas ) {

		overlayCtx.drawImage( conback.canvas, 0, lines - _vid.height, _vid.width, _vid.height );

	} else {

		// Fallback: solid black background
		overlayCtx.fillStyle = 'rgb(0, 0, 0)';
		overlayCtx.fillRect( 0, 0, _vid.width, lines );

	}

}

/*
=============
Draw_TileClear
=============
*/
/**
 * This repeats a 64*64 tile graphic (the WAD's `backtile`) to fill the screen around a sized down refresh window;
 * without it the rectangle is filled dark grey (#202020). Called by `SCR_TileClear` (gl_screen.js) each frame when
 * `viewsize` leaves a border. Does nothing before `Draw_Init`.
 *
 * @param {number} x left edge in virtual pixels
 * @param {number} y top edge in virtual pixels
 * @param {number} w width in virtual pixels
 * @param {number} h height in virtual pixels
 */
export function Draw_TileClear( x, y, w, h ) {

	if ( ! overlayCtx ) return;

	if ( draw_backtile && draw_backtile.canvas ) {

		const pattern = overlayCtx.createPattern( draw_backtile.canvas, 'repeat' );
		overlayCtx.fillStyle = pattern;
		overlayCtx.fillRect( x, y, w, h );

	} else {

		overlayCtx.fillStyle = '#202020';
		overlayCtx.fillRect( x, y, w, h );

	}

}

/*
=============
Draw_Fill
=============
*/
/**
 * Fills a box of pixels with a single color from the Quake palette (`host_basepal`), optionally translucent. Used for
 * the scoreboard's player colours, menu backdrops and dimming, and the screen's loading backdrop. White when the palette
 * is not wired or `c` is out of range. Does nothing before `Draw_Init`.
 *
 * @param {number} x left edge in virtual pixels
 * @param {number} y top edge in virtual pixels
 * @param {number} w width in virtual pixels
 * @param {number} h height in virtual pixels
 * @param {number} c palette index, 0..255
 * @param {number} [alpha=1] opacity 0..1 for this fill only (reset to 1 afterwards)
 */
export function Draw_Fill( x, y, w, h, c, alpha = 1 ) {

	if ( ! overlayCtx ) return;

	if ( host_basepal && c >= 0 && c < 256 ) {

		const r = host_basepal[ c * 3 ];
		const g = host_basepal[ c * 3 + 1 ];
		const b = host_basepal[ c * 3 + 2 ];
		overlayCtx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';

	} else {

		overlayCtx.fillStyle = '#ffffff';

	}

	overlayCtx.globalAlpha = alpha;
	overlayCtx.fillRect( x, y, w, h );
	overlayCtx.globalAlpha = 1;

}

/*
================
Draw_FadeScreen
================
*/
/**
 * Darkens the whole screen with black at 80% opacity, behind a menu or a modal dialog, and marks the status bar for
 * redraw (`Sbar_Changed`, wired by host.js). Called by the menu (when the console is not down behind it) and by
 * `SCR_UpdateScreen` under a dialog. Does nothing before `Draw_Init`.
 */
export function Draw_FadeScreen() {

	if ( ! overlayCtx ) return;

	overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
	overlayCtx.fillRect( 0, 0, _vid.width, _vid.height );

	_Sbar_Changed();

}

/*
================
Draw_BeginDisc
================
*/
/**
 * Draws the little blue disc in the corner of the screen (top right, the WAD's `disc` picture). Call before beginning
 * any disc IO. Nothing in this port calls it at present. Does nothing until the disc picture is loaded.
 */
export function Draw_BeginDisc() {

	if ( ! draw_disc ) return;
	Draw_Pic( _vid.width - 24, 0, draw_disc );

}

/*
================
Draw_EndDisc
================
*/
/**
 * Erases the disc icon. Call after completing any disc IO. Nothing to do in GL mode: the overlay is cleared every frame
 * by `Draw_BeginFrame`. Kept for the original's interface; nothing calls it.
 */
export function Draw_EndDisc() {

	// Nothing to do in GL mode

}

/*
================
GL_Set2D
================
*/
/**
 * Setup as if the screen was 320*200. In canvas 2D overlay mode, this is implicit: the UI scale transform applied by
 * `Draw_BeginFrame` already maps virtual coordinates. Kept as a no-op so `SCR_UpdateScreen` follows the original
 * order (it calls this after the 3D view, before 2D drawing).
 */
export function GL_Set2D() {

	// Canvas 2D context is always in 2D mode

}

/*
================
_qpicToCanvas

Convert palette-indexed qpic_t pixel data to a canvas.
If alpha is true, palette index 255 is treated as transparent.
================
*/
function _qpicToCanvas( width, height, data, alpha ) {

	const pal = d_8to24table || vid_d_8to24table;
	if ( ! pal ) return null;

	const cs = document.createElement( 'canvas' );
	cs.width = width;
	cs.height = height;
	const ctx = cs.getContext( '2d' );
	const imageData = ctx.createImageData( width, height );
	const pixels = imageData.data;

	for ( let i = 0; i < width * height; i ++ ) {

		const palIdx = data[ i ];
		if ( alpha && palIdx === 255 ) {

			pixels[ i * 4 ] = 0;
			pixels[ i * 4 + 1 ] = 0;
			pixels[ i * 4 + 2 ] = 0;
			pixels[ i * 4 + 3 ] = 0;

		} else {

			const rgba = pal[ palIdx ];
			pixels[ i * 4 ] = rgba & 0xff;
			pixels[ i * 4 + 1 ] = ( rgba >> 8 ) & 0xff;
			pixels[ i * 4 + 2 ] = ( rgba >> 16 ) & 0xff;
			pixels[ i * 4 + 3 ] = 255;

		}

	}

	ctx.putImageData( imageData, 0, 0 );
	return cs;

}

/*
================
Draw_LoadConbackImage
================
*/
/**
 * Replaces the console background (gfx/conback.lmp) with an image from a URL. On failure the original background
 * stays and the console prints `Draw_LoadConbackImage: failed to load <url>`. The wallpaper is drawn to cover the
 * screen (`Draw_ConsoleBackground`) and also backs the menu. Called once from main.js at start-up with
 * `conback.webp`; kept for the life of the page (until `Draw_SetConback` or another call replaces it).
 *
 * @param {string} url image URL, relative to the page
 * @returns {Promise<boolean>} resolves true on success, false when the image fails to load; never rejects
 */
export function Draw_LoadConbackImage( url ) {

	return new Promise( ( resolve ) => {

		const img = new Image();
		img.onload = function () {

			const cs = document.createElement( 'canvas' );
			cs.width = img.width;
			cs.height = img.height;
			cs.getContext( '2d' ).drawImage( img, 0, 0 );

			conback = {
				width: _vid.width,
				height: _vid.height,
				canvas: cs,
				cover: true
			};

			resolve( true );

		};

		img.onerror = function () {

			Con_Printf( 'Draw_LoadConbackImage: failed to load ' + url + '\n' );
			resolve( false );

		};

		img.src = url;

	} );

}

/*
================
Draw_CacheSinglePlayerMenu
================
*/
/**
 * Build the extended menu once from native PAK lettering: `BuildSinglePlayerMenuArt` (newer/ui/menu_art.js) composes
 * it from gfx/sp_menu.lmp with letters from mainmenu.lmp, mp_menu.lmp and netmen4.lmp. Missing sources leave the
 * existing menu's text fallback available; source canvases are never changed. Called from main.js at start-up. A
 * built picture is cached as `gfx/sp_menu_ext.lmp` for the life of the page, so `Draw_CachePic` returns it; a failure
 * is not cached, so a later call tries again.
 *
 * @returns {?qpic_t} the composed picture (cached), or null when a source is missing
 * @throws {Error} when the Newer hook `BuildSinglePlayerMenuArt` is not installed (only while nothing is cached)
 */
export function Draw_CacheSinglePlayerMenu() {

	const path = 'gfx/sp_menu_ext.lmp';
	if ( cachepics[ path ] ) return cachepics[ path ];
	const pic = BuildSinglePlayerMenuArt(
		Draw_CachePic( 'gfx/sp_menu.lmp' ), Draw_CachePic( 'gfx/mainmenu.lmp' ),
		Draw_CachePic( 'gfx/mp_menu.lmp' ), Draw_CachePic( 'gfx/netmen4.lmp' ),
		() => document.createElement( 'canvas' ) );
	if ( pic !== null ) { pic.path = path; cachepics[ path ] = pic; }
	return pic;

}

let bookNavigationCharset = null, bookNavigationPics = null;
/**
 * The bestiary book's four navigation labels (`< PREVIOUS`, `OPEN >`, `NEXT >`, `ESC - MAIN MENU`), drawn from the
 * conchars sheet by `BuildMenuTextArt` (newer/ui/menu_art.js). Called by the bestiary book (newer/ui/r_bestiary_book.js)
 * each frame it draws. Before `Draw_Init` there is no decoded source; that absence is not cached, so the first ready
 * draw recovers. The four are built together and kept until the character sheet is replaced (`Draw_SetCharset`),
 * which rebuilds all four.
 *
 * @returns {?{ previous: ?qpic_t, open: ?qpic_t, next: ?qpic_t, exit: ?qpic_t }} the labels (shared; do not modify),
 *   each 8 pixels per character wide and 8 high, or null before the character sheet is loaded
 * @throws {Error} when the Newer hook `BuildMenuTextArt` is not installed (only when the labels are rebuilt)
 */
export function Draw_CacheBookNavigation() {

	// Before Draw_Init there is no decoded source. Do not cache that absence:
	// the first ready draw must recover, and a replaced atlas invalidates all four.
	if ( ! char_canvas ) return null;
	if ( bookNavigationCharset !== char_canvas ) {

		bookNavigationPics = Object.fromEntries( Object.entries( {
			previous: '< PREVIOUS', open: 'OPEN >', next: 'NEXT >', exit: 'ESC - MAIN MENU'
		} ).map( ( [ key, text ] ) => [ key, BuildMenuTextArt( char_canvas, text, () => document.createElement( 'canvas' ) ) ] ) );
		bookNavigationCharset = char_canvas;

	}
	return bookNavigationPics;

}

/*
================
Draw_CachePicFromPNG
================
*/
/**
 * Preloads a PNG image from a URL and caches it as a pic under a game path. Call this during initialization to make
 * custom images available via `Draw_CachePic` (main.js loads the extended main menu, the weapon models credit and the
 * enhanced menu banner this way). The picture replaces anything cached under `path` and is kept for the life of the
 * page. With any option set the image is post-processed: `blackKey` clears near-black pixels, `trim` crops to the
 * opaque bounds, and `displayHeight` rescales (nearest pixel, aspect kept) to that height.
 *
 * @param {string} path the game path to cache it under, such as 'gfx/mainmenu_ext.lmp'
 * @param {string} url image URL, relative to the page
 * @param {{ blackKey?: number, trim?: boolean, displayHeight?: number }} [options={}] `blackKey`: pixels whose
 *   brightest channel is at or below this (0..255) become transparent; `trim`: crop to the opaque pixels; `displayHeight`:
 *   output height in picture pixels (default: the source or trimmed height)
 * @returns {Promise<qpic_t>} resolves with the cached picture (`{ width, height, canvas, path }`) once the image has
 *   loaded; rejects with an Error when the image fails to load (the console prints `Draw_CachePicFromPNG: failed to
 *   load <url>`), or, when processing, if no pixel is opaque (`Empty PNG picture: <url>`)
 */
export function Draw_CachePicFromPNG( path, url, options = {} ) {

	return new Promise( ( resolve, reject ) => {

		const img = new Image();
		img.onload = function () {
			try {

				const cs = document.createElement( 'canvas' );
				cs.width = img.width;
				cs.height = img.height;
				const ctx = cs.getContext( '2d' );
				ctx.drawImage( img, 0, 0 );
				let canvas = cs;
				if ( options.blackKey !== undefined || options.trim || options.displayHeight ) {

					const pixels = ctx.getImageData( 0, 0, cs.width, cs.height );
					let left = cs.width, top = cs.height, right = 0, bottom = 0;
					for ( let y = 0; y < cs.height; y ++ ) for ( let x = 0; x < cs.width; x ++ ) {

						const i = ( y * cs.width + x ) * 4, rgba = pixels.data;
						if ( options.blackKey !== undefined && Math.max( rgba[ i ], rgba[ i + 1 ], rgba[ i + 2 ] ) <= options.blackKey ) rgba[ i + 3 ] = 0;
						if ( rgba[ i + 3 ] ) { left = Math.min( left, x ); top = Math.min( top, y ); right = Math.max( right, x + 1 ); bottom = Math.max( bottom, y + 1 ); }

					}
					ctx.putImageData( pixels, 0, 0 );
					if ( right <= left || bottom <= top ) throw new Error( 'Empty PNG picture: ' + url );
					if ( ! options.trim ) { left = top = 0; right = cs.width; bottom = cs.height; }
					canvas = document.createElement( 'canvas' );
					canvas.height = options.displayHeight || bottom - top;
					canvas.width = Math.max( 1, Math.round( ( right - left ) * canvas.height / ( bottom - top ) ) );
					const display = canvas.getContext( '2d' );
					display.imageSmoothingEnabled = false;
					display.drawImage( cs, left, top, right - left, bottom - top, 0, 0, canvas.width, canvas.height );

				}

				const pic = {
					width: canvas.width,
					height: canvas.height,
					canvas,
					path
				};

				cachepics[ path ] = pic;
				resolve( pic );
			} catch ( error ) { reject( error ); }

		};

		img.onerror = function () {

			Con_Printf( 'Draw_CachePicFromPNG: failed to load ' + url + '\n' );
			reject( new Error( 'Failed to load ' + url ) );

		};

		img.src = url;

	} );

}

/*
================
Draw_CachePic
================
*/
/**
 * Loads and caches a pic from the game data (PAK files). qpic_t format: int32 width, int32 height, then width*height
 * palette indices; index 255 is transparent. A picture cached by `Draw_CachePicFromPNG` or
 * `Draw_CacheSinglePlayerMenu` under the same path is returned instead of the PAK's. The first load of
 * gfx/menuplyr.lmp also keeps its raw indices for `Draw_TransPicTranslate`. Called by the menu, the status bar and the
 * screen every frame they draw such pictures; each path is decoded once and cached for the life of the page.
 *
 * @param {string} path game path such as 'gfx/pause.lmp'
 * @returns {?qpic_t} the picture (`{ width, height, canvas, path }`, shared: do not modify), or null when no PAK has
 *   the file (the console prints `Draw_CachePic: failed to load <path>`; a miss is not cached, so it is looked up and
 *   printed again on each call)
 */
export function Draw_CachePic( path ) {

	if ( cachepics[ path ] )
		return cachepics[ path ];

	const result = COM_FindFile( path );
	if ( ! result ) {

		Con_Printf( 'Draw_CachePic: failed to load ' + path + '\n' );
		return null;

	}

	// COM_FindFile returns { data: Uint8Array view into pak buffer, size }
	// qpic_t: first 8 bytes are width + height (int32 LE), then pixel data
	const view = new DataView( result.data.buffer, result.data.byteOffset, result.size );
	const width = view.getInt32( 0, true );
	const height = view.getInt32( 4, true );
	const pixels = new Uint8Array( result.data.buffer, result.data.byteOffset + 8, width * height );

	// Save raw pixel data for menuplyr.lmp (used by Draw_TransPicTranslate)
	if ( path === 'gfx/menuplyr.lmp' ) {

		menuplyr_pixels = new Uint8Array( width * height );
		menuplyr_pixels.set( pixels );
		menuplyr_width = width;
		menuplyr_height = height;

	}

	const cs = _qpicToCanvas( width, height, pixels, true );

	const pic = {
		width: width,
		height: height,
		canvas: cs,
		path
	};

	cachepics[ path ] = pic;
	return pic;

}

/*
================
Draw_PicFromWad
================
*/
/**
 * Loads a pic from the gfx.wad file. WAD lumps for qpic_t: int32 width, int32 height, then width*height palette
 * indices; index 255 is transparent. Called at initialization (`Sbar_Init`, `SCR_Init`, `Draw_Init`) for the status
 * bar, screen icons, disc and backtile. Not cached here: each call decodes a new canvas, so callers keep the result.
 * The lower-cased lump name is kept as `_name`, which lets `Draw_Pic` substitute Newer Game's higher resolution
 * artwork.
 *
 * @param {string} name lump name, such as 'num_0' or 'sbar' (case-insensitive)
 * @returns {?qpic_t} a new picture (`{ width, height, canvas, _name }`), or null when the WAD has no such lump (the console prints `Draw_PicFromWad: <name> not found`). The miss
 *   is caught here, but `W_GetLumpName` reports it through `Sys_Error`, which in a browser has already replaced the
 *   page body with its error text before throwing
 */
export function Draw_PicFromWad( name ) {

	let lump;
	try {

		lump = W_GetLumpName( name );

	} catch ( e ) {

		Con_Printf( 'Draw_PicFromWad: ' + name + ' not found\n' );
		return null;

	}

	if ( ! lump ) return null;

	// Parse qpic_t header from WAD lump data
	const view = new DataView( lump.data.buffer, lump.data.byteOffset + lump.offset );
	const width = view.getInt32( 0, true );
	const height = view.getInt32( 4, true );

	const pixels = new Uint8Array( lump.data.buffer, lump.data.byteOffset + lump.offset + 8, width * height );

	const cs = _qpicToCanvas( width, height, pixels, true );

	return {
		width: width,
		height: height,
		canvas: cs,
		_name: name.toLowerCase()
	};

}

/*
================
GL_LoadTexture
================
*/
/**
 * Registers a palettized texture in this module's table (up to MAX_GLTEXTURES, 1024) and, when there is data and a
 * colour table is wired, decodes it to a canvas kept on the entry. An identifier already in the table returns its
 * existing number (printing `GL_LoadTexture: cache mismatch for <identifier>` when the size differs). The canvas
 * overlay port of gl_draw.c's loader: the world and model textures use gl_model.js's own `GL_LoadTexture`, and
 * nothing imports this one at present. Entries are kept for the life of the page.
 *
 * @param {string} identifier cache name; empty to always add a new entry
 * @param {number} width texture width in texels
 * @param {number} height texture height in texels
 * @param {?Uint8Array} data width*height palette indices, row by row
 * @param {boolean} mipmap recorded on the entry only (no mipmaps are made)
 * @param {boolean} alpha true to make palette index 255 transparent
 * @returns {number} the texture number (1, 2, 3...; never reused)
 * @throws {TypeError} when a new texture would exceed MAX_GLTEXTURES: there is no explicit check (WinQuake calls
 *   `Sys_Error`), so the missing table entry is dereferenced
 */
export function GL_LoadTexture( identifier, width, height, data, mipmap, alpha ) {

	// See if the texture is already present
	if ( identifier && identifier.length > 0 ) {

		for ( let i = 0; i < numgltextures; i ++ ) {

			if ( gltextures[ i ].identifier === identifier ) {

				if ( width !== gltextures[ i ].width || height !== gltextures[ i ].height )
					Con_Printf( 'GL_LoadTexture: cache mismatch for ' + identifier + '\n' );
				return gltextures[ i ].texnum;

			}

		}

	}

	const glt = gltextures[ numgltextures ];
	numgltextures ++;

	glt.identifier = identifier;
	glt.texnum = texture_extension_number;
	glt.width = width;
	glt.height = height;
	glt.mipmap = mipmap;

	// In canvas 2D mode, create an ImageData or canvas for the texture
	if ( data && d_8to24table ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext( '2d' );
		const imageData = ctx.createImageData( width, height );

		for ( let i = 0; i < width * height; i ++ ) {

			const palIdx = data[ i ];
			if ( alpha && palIdx === 255 ) {

				// transparent pixel
				imageData.data[ i * 4 ] = 0;
				imageData.data[ i * 4 + 1 ] = 0;
				imageData.data[ i * 4 + 2 ] = 0;
				imageData.data[ i * 4 + 3 ] = 0;

			} else {

				const rgba = d_8to24table[ palIdx ];
				imageData.data[ i * 4 ] = rgba & 0xff;
				imageData.data[ i * 4 + 1 ] = ( rgba >> 8 ) & 0xff;
				imageData.data[ i * 4 + 2 ] = ( rgba >> 16 ) & 0xff;
				imageData.data[ i * 4 + 3 ] = 255;

			}

		}

		ctx.putImageData( imageData, 0, 0 );

		// Store canvas reference on the texture
		glt.canvas = canvas;

	}

	texture_extension_number ++;

	return texture_extension_number - 1;

}

/*
================
GL_Upload8
================
*/
/**
 * Convert 8-bit palettized data to RGBA and upload: builds the 32-bit texels through the colour table (dropping
 * `alpha` when no index 255 is present, as WinQuake does) and passes them to `GL_Upload32`, which is a stub here, so
 * nothing is uploaded or kept. Nothing calls it at present. Does nothing without a colour table.
 *
 * @param {Uint8Array} data width*height palette indices
 * @param {number} width width in texels
 * @param {number} height height in texels
 * @param {boolean} mipmap passed on to `GL_Upload32`
 * @param {boolean} alpha true when palette index 255 is transparent
 */
export function GL_Upload8( data, width, height, mipmap, alpha ) {

	if ( ! d_8to24table ) return;

	const s = width * height;
	const trans = new Uint32Array( s );
	let noalpha = true;

	if ( alpha ) {

		for ( let i = 0; i < s; i ++ ) {

			const p = data[ i ];
			if ( p === 255 ) noalpha = false;
			trans[ i ] = d_8to24table[ p ];

		}

		if ( noalpha ) alpha = false;

	} else {

		for ( let i = 0; i < s; i ++ ) {

			trans[ i ] = d_8to24table[ data[ i ] ];

		}

	}

	GL_Upload32( trans, width, height, mipmap, alpha );

}

/*
================
GL_Upload32
================
*/
/**
 * Stub for compatibility: in canvas 2D mode texture upload is handled differently (Three.js textures are made in the
 * renderer and model loader), so this does nothing. Called only by `GL_Upload8`.
 *
 * @param {Uint32Array} data width*height texels, 0xAABBGGRR (ignored)
 * @param {number} width width in texels (ignored)
 * @param {number} height height in texels (ignored)
 * @param {boolean} mipmap whether mipmaps were wanted (ignored)
 * @param {boolean} alpha whether the texture has transparency (ignored)
 */
export function GL_Upload32( data, width, height, mipmap, alpha ) {

	// In canvas 2D mode, texture upload is handled differently
	// This is a stub for compatibility

}

/*
================
GL_FindTexture
================
*/
/**
 * Looks a texture up by identifier in the table filled by this module's `GL_LoadTexture`. Nothing calls it at
 * present.
 *
 * @param {string} identifier the cache name given to `GL_LoadTexture`
 * @returns {number} the texture number, or -1 when no texture has that identifier
 */
export function GL_FindTexture( identifier ) {

	for ( let i = 0; i < numgltextures; i ++ ) {

		if ( gltextures[ i ].identifier === identifier )
			return gltextures[ i ].texnum;

	}

	return - 1;

}

/*
================
Draw_SetCharset
================
*/
/**
 * Set the character set bitmap for console/HUD text rendering, replacing the conchars sheet decoded by `Draw_Init`
 * (it also makes `Draw_CacheBookNavigation` rebuild its labels). Kept until the next call; nothing calls it at present.
 *
 * @param {?HTMLCanvasElement} charsetCanvas a 128x128 sheet of 16x16 characters of 8x8 pixels; null makes
 *   `Draw_Character` fall back to text
 */
export function Draw_SetCharset( charsetCanvas ) {

	char_canvas = charsetCanvas;

}

/*
================
Draw_SetConback
================
*/
/**
 * Set the console background image, replacing the one from `Draw_Init` or `Draw_LoadConbackImage`. Kept until the
 * next call; nothing calls it at present.
 *
 * @param {?{ width: number, height: number, canvas: HTMLCanvasElement, cover?: boolean }} conbackPic the background;
 *   `cover: true` fills the screen without stretching, otherwise it is stretched to the screen; null draws a black
 *   console
 */
export function Draw_SetConback( conbackPic ) {

	conback = conbackPic;

}

/*
================
Draw_SetDisc
================
*/
/**
 * Set the disc (loading) icon drawn by `Draw_BeginDisc`, replacing the WAD's `disc` loaded by `Draw_Init`. Kept until
 * the next call; nothing calls it at present.
 *
 * @param {?qpic_t} discPic the icon; null hides it
 */
export function Draw_SetDisc( discPic ) {

	draw_disc = discPic;

}
