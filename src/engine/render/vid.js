/**
 * @module engine/render/vid
 *
 * Video (WinQuake vid.h) on Three.js: the renderer, the canvas, the palette and the screen size.
 *
 * Types: exported classes `vrect_t`, `viddef_t`.
 *
 * State: mutable exports `vid_menudrawfn`, `vid_menukeyfn`, `renderer`, `canvas`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/vid.h -- video driver defs (browser/Three.js)

import * as THREE from 'three';
import { Sys_Printf } from '../common/sys.js';
import { Con_Printf } from '../common/console.js';

//
// vid.h constants
//
export const VID_CBITS = 6;
export const VID_GRADES = ( 1 << VID_CBITS );

//============================================================================
// vrect_t
//============================================================================

export class vrect_t {

	/**
	 * Creates an empty screen rectangle (WinQuake vid.h): `x`, `y`, `width`, `height` in screen pixels, and `pnext`, the
	 * next rectangle in a chain (WinQuake's dirty-rectangle list; unused here). render.js's refdef holds two, `vrect`
	 * (the subwindow in video for refresh, sized by gl_screen.js's `SCR_CalcRefdef`) and `aliasvrect`.
	 */
	constructor() {

		this.x = 0;
		this.y = 0;
		this.width = 0;
		this.height = 0;
		this.pnext = null;

	}

}

//============================================================================
// viddef_t -- global video state
//============================================================================

export class viddef_t {

	/**
	 * Creates the zeroed global video description (WinQuake vid.h); the module's single instance is the exported `vid`,
	 * filled by `VID_Init` and kept current on window resize. `width`/`height` are the canvas size in pixels (also
	 * copied to `conwidth`/`conheight` and `rowbytes`), `aspect` is width / height, `fullbright` the first fullbright
	 * palette index (224), `recalc_refdef` is set to 1 when the view size must be recomputed, and `colormap` holds
	 * 256 * VID_GRADES bytes. The software-renderer fields (`buffer`, `conbuffer`, `colormap16`, `direct`, `numpages`,
	 * `maxwarpwidth`/`maxwarpheight`) are kept for the port's structure; nothing draws into the buffers.
	 */
	constructor() {

		this.buffer = null; // Uint8Array -- invisible buffer
		this.colormap = null; // Uint8Array -- 256 * VID_GRADES size
		this.colormap16 = null; // Uint16Array -- 256 * VID_GRADES size
		this.fullbright = 0; // index of first fullbright color
		this.rowbytes = 0; // may be > width if displayed in a window
		this.width = 0;
		this.height = 0;
		this.aspect = 0; // width / height -- < 0 is taller than wide
		this.numpages = 0;
		this.recalc_refdef = 0; // if true, recalc vid-based stuff
		this.conbuffer = null;
		this.conrowbytes = 0;
		this.conwidth = 0;
		this.conheight = 0;
		this.maxwarpwidth = 0;
		this.maxwarpheight = 0;
		this.direct = null; // direct drawing to framebuffer, if not NULL

	}

}

//============================================================================
// Globals
//============================================================================

export const vid = new viddef_t();

// palette lookup tables
export const d_8to16table = new Uint16Array( 256 );
export const d_8to24table = new Uint32Array( 256 );

// menu callback function pointers (stubs for browser)
export let vid_menudrawfn = null;
export let vid_menukeyfn = null;

//============================================================================
// Three.js renderer state (replaces raw GL context)
//============================================================================

export let renderer = null; // THREE.WebGLRenderer
export let canvas = null; // HTMLCanvasElement

//============================================================================
// VID_SetPalette
//============================================================================

/**
 * Builds the palette lookup tables `d_8to24table` (packed 0xAABBGGRR, opaque, with index 255 made fully transparent
 * black for sprites, etc.) and `d_8to16table` (RGB565) from a palette. In WinQuake it is called at startup and after
 * any gamma correction; here `VID_Init`, `VID_ShiftPalette` and `VID_SetMode` call it. The tables are overwritten in
 * place and stay until the next call. Does nothing when `palette` is missing.
 *
 * @param {Uint8Array} palette 256 entries of RGB byte triplets (768 bytes total, 0..255 per channel)
 */
export function VID_SetPalette( palette ) {

	// palette is a Uint8Array of 768 bytes (256 * 3 RGB)
	if ( ! palette ) return;

	for ( let i = 0; i < 256; i ++ ) {

		const r = palette[ i * 3 + 0 ];
		const g = palette[ i * 3 + 1 ];
		const b = palette[ i * 3 + 2 ];

		// d_8to24table: RGBA packed as 32-bit unsigned
		// Quake uses ABGR byte order on little-endian (0xAABBGGRR)
		d_8to24table[ i ] = ( 255 << 24 ) | ( b << 16 ) | ( g << 8 ) | r;

		// d_8to16table: RGB565 format
		d_8to16table[ i ] = ( ( r >> 3 ) << 11 ) | ( ( g >> 2 ) << 5 ) | ( b >> 3 );

	}

	// index 255 is transparent (used for sprites, etc.)
	d_8to24table[ 255 ] = 0; // fully transparent black

}

//============================================================================
// VID_ShiftPalette
//============================================================================

/**
 * In WinQuake, called for bonus and pain flashes, and for underwater color changes. In the browser, palette shifts are
 * handled by post-processing or by a screen-space color overlay (see R_PolyBlend in gl_rmain.js), so this only
 * rebuilds the lookup tables with `VID_SetPalette`. Nothing in the engine calls it.
 *
 * @param {Uint8Array} palette 256 RGB byte triplets (768 bytes)
 */
export function VID_ShiftPalette( palette ) {

	// In the browser, palette shifts are handled by post-processing
	// or by a screen-space color overlay (see R_PolyBlend in gl_rmain.js).
	// For now, just update the lookup tables.
	VID_SetPalette( palette );

}

//============================================================================
// VID_Init
//============================================================================

/**
 * Called at startup (once, from host.js's `Host_Init`) to set up translation tables. Takes 256 8-bit RGB values. In
 * WinQuake the palette data will go away after the call, so it must be copied off if the video driver will need it
 * again; here it is only read into the lookup tables. For browser: creates a full-window canvas appended to
 * `document.body` and initializes the Three.js WebGLRenderer (no antialiasing, sRGB output, manual clearing and
 * sorting, linear tone mapping at exposure 1), sets the exported `canvas` and `renderer`, fills `vid` with the canvas
 * size, and adds a window resize listener (never removed) that resizes the canvas and renderer and sets
 * `vid.recalc_refdef`. Prints the size to the console.
 *
 * @param {?Uint8Array} palette 768 bytes of RGB triplets (gfx/palette.lmp); when missing the tables are left as they are
 * @throws {Error} from `THREE.WebGLRenderer` when the browser cannot create a WebGL context
 */
export function VID_Init( palette ) {

	Sys_Printf( 'VID_Init' );

	// default video dimensions
	vid.width = 640; // was 320 in software Quake
	vid.height = 480; // was 200 in software Quake
	vid.aspect = vid.width / vid.height;
	vid.numpages = 1;
	vid.rowbytes = vid.width;
	vid.conwidth = vid.width;
	vid.conheight = vid.height;
	vid.maxwarpwidth = 320;
	vid.maxwarpheight = 200;
	vid.fullbright = 256 - 32; // last 32 colors are fullbright in Quake palette
	vid.recalc_refdef = 1;

	// allocate buffers
	vid.buffer = new Uint8Array( vid.width * vid.height );
	vid.conbuffer = vid.buffer;
	vid.conrowbytes = vid.rowbytes;
	vid.colormap = new Uint8Array( 256 * VID_GRADES );

	// build palette lookup
	if ( palette ) {

		VID_SetPalette( palette );

	}

	// create canvas element
	canvas = document.createElement( 'canvas' );
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	canvas.style.display = 'block';
	document.body.appendChild( canvas );

	// update vid dimensions to match actual canvas
	vid.width = canvas.width;
	vid.height = canvas.height;
	vid.aspect = vid.width / vid.height;
	vid.rowbytes = vid.width;
	vid.conwidth = vid.width;
	vid.conheight = vid.height;

	// create Three.js WebGLRenderer (replaces raw GL context)
	renderer = new THREE.WebGLRenderer( {
		canvas: canvas,
		antialias: false, // Quake didn't have AA
		alpha: false,
		depth: true,
		stencil: false
	} );

	renderer.setSize( canvas.width, canvas.height );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.autoClear = false; // we manage clearing ourselves, like Quake did
	renderer.sortObjects = false; // we sort manually via BSP front-to-back

	// Enable tone mapping for brightness control
	// LinearToneMapping applies exposure without additional curve
	renderer.toneMapping = THREE.LinearToneMapping;
	renderer.toneMappingExposure = 1.0;

	// listen for window resize
	window.addEventListener( 'resize', function () {

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		vid.width = canvas.width;
		vid.height = canvas.height;
		vid.aspect = vid.width / vid.height;
		vid.rowbytes = vid.width;
		vid.conwidth = vid.width;
		vid.conheight = vid.height;
		vid.recalc_refdef = 1;

		renderer.setSize( canvas.width, canvas.height );

	} );

	Con_Printf( 'WebGLRenderer initialized (' + vid.width + 'x' + vid.height + ')\n' );

}

//============================================================================
// VID_Shutdown
//============================================================================

/**
 * Called at shutdown (host.js's `Host_Shutdown`): disposes the renderer and removes the canvas from the page, setting
 * both exports to null. The resize listener added by `VID_Init` is not removed.
 */
export function VID_Shutdown() {

	Sys_Printf( 'VID_Shutdown' );

	if ( renderer ) {

		renderer.dispose();
		renderer = null;

	}

	if ( canvas && canvas.parentNode ) {

		canvas.parentNode.removeChild( canvas );
		canvas = null;

	}

}

//============================================================================
// VID_Update
//============================================================================

/**
 * In WinQuake, flushes the given rectangles from the view buffer to the screen. In Three.js, the actual rendering is
 * handled by renderer.render() in gl_rmain.js, so this is a no-op. Nothing in the engine calls it.
 *
 * @param {?vrect_t} rects the first rectangle of a `pnext` chain; ignored
 */
export function VID_Update( rects ) {

	// Three.js handles buffer swaps internally via renderer.render()

}

//============================================================================
// VID_SetMode
//============================================================================

/**
 * Sets the mode; in WinQuake only used by the Quake engine for resetting to mode 0 (the base mode) on memory
 * allocation failures. In browser, we only have one "mode" - the canvas size - so this rebuilds the palette tables
 * when given a palette and sets `vid.recalc_refdef`. Nothing in the engine calls it.
 *
 * @param {number} modenum the requested mode number; ignored
 * @param {?Uint8Array} palette 768 bytes of RGB triplets, or null to keep the current tables
 * @returns {number} always 1 (success)
 */
export function VID_SetMode( modenum, palette ) {

	// In browser, we only have one "mode" - the canvas size
	if ( palette ) {

		VID_SetPalette( palette );

	}

	vid.recalc_refdef = 1;

	return 1; // success

}

//============================================================================
// VID_HandlePause
//============================================================================

/**
 * In WinQuake, called only on Win32, when pause happens, so the mouse can be released. In browser, we use Pointer Lock
 * API instead, so this is a no-op. Nothing in the engine calls it.
 *
 * @param {boolean} pause true when the game pauses; ignored
 */
export function VID_HandlePause( pause ) {

	// Browser: Pointer Lock API handles this naturally
	// When paused, we can exit pointer lock if desired

}

//============================================================================
// VID_UpdateGamma
//============================================================================

/**
 * Updates the renderer's tone mapping exposure based on the gamma cvar. In original Quake, gamma ranges from 0.5
 * (brightest) to 1.0 (normal). We map this to toneMappingExposure where higher is brighter, as exposure = 1.5 / gamma
 * (gamma 1.0 gives 1.5, 0.5 gives 3.0). Called by view.js at `V_Init` and from `V_CheckGamma` whenever the `gamma`
 * cvar changes. Does nothing before `VID_Init` or after `VID_Shutdown` (no renderer).
 *
 * @param {number} gamma the `gamma` cvar value (default 1; must be non-zero)
 */
export function VID_UpdateGamma( gamma ) {

	if ( ! renderer ) return;

	// Quake gamma: 0.5 = bright, 1.0 = normal
	// Exposure: higher = brighter
	// Base exposure of 1.5 to brighten the overall scene
	// Map gamma 0.5->3.0, 1.0->1.5 using: exposure = 1.5 / gamma
	renderer.toneMappingExposure = 1.5 / gamma;

}
