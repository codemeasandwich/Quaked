/**
 * @module engine/render/lit
 *
 * LIT files: coloured lightmaps for a map, loaded when the map's own lighting matches.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// LIT files: coloured lightmaps for a map ("maps/e1m1.lit", made by ericw-tools' light -lit).
//
// The file is "QLIT", a version (1) and the light as RGB, three bytes for each byte of the BSP's
// own (monochrome) lighting lump, in the same order: a surface's colour samples are at three
// times its lightofs.

export const LIT_MAGIC = 0x54494c51; // "QLIT"

/**
 * Reads the RGB light of a LIT file for a BSP whose lighting lump is `monoLength` bytes. Called by `Mod_LoadLighting`
 * (gl_model.js) at map load, with the same-named `.lit` found in the game data; the result is kept as the brush
 * model's `litdata` for as long as the model is loaded.
 *
 * @param {?Uint8Array} bytes the whole LIT file; null or undefined when there is none
 * @param {number} monoLength byte length of the BSP's lighting lump (one byte per monochrome sample)
 * @returns {?Uint8Array} a new array of `monoLength * 3` bytes (R, G, B for each mono sample, in lump order), or null
 *   when it is not a LIT file of that map: missing, shorter than the 8-byte header, `monoLength` not positive, wrong
 *   magic or version, or a payload that is not exactly `monoLength * 3` bytes
 */
export function Lit_Parse( bytes, monoLength ) {

	if ( bytes == null || bytes.length < 8 || monoLength <= 0 ) return null;

	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	if ( view.getUint32( 0, true ) !== LIT_MAGIC || view.getInt32( 4, true ) !== 1 ) return null;
	// A larger lighting lump belongs to a different BSP layout too. Pack
	// fallback can find a same-named .lit from another edition of the map;
	// truncating it assigns unrelated samples to faces and creates black panels.
	// Reject either mismatch so Mod_LoadLighting retains the BSP's own light.
	if ( bytes.length - 8 !== monoLength * 3 ) return null;

	return bytes.slice( 8, 8 + monoLength * 3 );

}

/**
 * Reads the entity list of a ".ent" file: the same text as the BSP's entity lump. Called at map load by
 * `Mod_LoadEntities` (gl_model.js), which uses it in place of the BSP's lump, and by the seamless-level code
 * (sv_seamless.js) when it reads a map's links.
 *
 * @param {?Uint8Array} bytes the whole `.ent` file; null or undefined when there is none
 * @returns {?string} the text up to the first NUL byte, one character per byte; null when `bytes` is missing or empty
 *   or the text has no `{` (so it holds no entity)
 */
export function Ent_Parse( bytes ) {

	if ( bytes == null || bytes.length === 0 ) return null;

	let s = '';
	for ( let i = 0; i < bytes.length; i ++ ) {

		if ( bytes[ i ] === 0 ) break;
		s += String.fromCharCode( bytes[ i ] );

	}

	return s.indexOf( '{' ) >= 0 ? s : null;

}
