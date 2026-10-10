/**
 * @module engine/common/sys
 *
 * The system interface for the browser (WinQuake sys.h/sys_win.c): printing, time, quitting and fatal errors.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: calls `Sys_Error` (fatal) at 1 place; throws at 1 place.
 *
 * `Sys_Error` logs, shows the message on the page and throws: the engine's fatal error.
 */
// Ported from: WinQuake/sys.h + sys_win.c -- system interface (browser)

/*
===============================================================================

SYSTEM IO

===============================================================================
*/

/**
 * Logs the start-up line `Three-Quake initializing...` to the console. The browser port's stand-in for WinQuake's
 * Sys_Init (sys_win.c); no current caller.
 */
export function Sys_Init() {

	console.log( 'Three-Quake initializing...' );

}

/**
 * The engine's fatal error (WinQuake sys_win.c Sys_Error): logs `Sys_Error: <error>` with `console.error`, replaces
 * the page body with the message in red when a `document` exists (browser only; not under Deno), then throws.
 * Never returns.
 *
 * @param {string} error the message, printf-style when `args` are given (`%s`, `%d`, `%i`, `%f`)
 * @param {...*} args the values for its codes (card [44m]: callers pass them, as in WinQuake)
 * @throws {Error} always, with the formatted message
 */
export function Sys_Error( error, ...args ) {

	error = _formatPrintf( error, args );

	console.error( 'Sys_Error: ' + error );

	// Display error on screen (browser only)
	if ( typeof document !== 'undefined' ) {

		document.body.innerHTML = '<pre style="color:red;padding:20px;font-size:16px;">Sys_Error: ' + error + '</pre>';

	}

	throw new Error( error );

}

const _quietLogAllowPatterns = [
	/^Connection from /,
	/^Connection closed:/,
	/^Client .*(connected|removed)\b/,
	/^Spawning server for map:/,
	/^SpawnServer:/,
	/^Server initialized!/,
	/^Room .* idle for /,
	/^Host_ServerFrame error:/,
	/^SV_ReadClientMessage:/,
	/^Unhandled promise rejection:/,
	/^WebTransport server listening /,
	/^WebTransport server driver initialized/,
	/^NET_Init complete/
];

function _isDenoRuntime() {

	return typeof Deno !== 'undefined' && Deno.version != null;

}

function _formatPrintf( fmt, args ) {

	if ( args.length === 0 ) return String( fmt );

	let result = String( fmt );
	let index = 0;
	result = result.replace( /%[sdif]/g, () => {

		if ( index >= args.length ) return '';
		return String( args[ index ++ ] );

	} );

	if ( index < args.length ) {

		result += ' ' + args.slice( index ).map( String ).join( ' ' );

	}

	return result;

}

function _shouldPrintLine( line ) {

	if ( _isDenoRuntime() !== true ) return true;

	const quietLogs = globalThis.__THREE_QUAKE_QUIET_LOGS === true;
	if ( quietLogs !== true ) return true;

	const trimmed = line.trim();
	if ( trimmed.length === 0 ) return false;

	for ( const pattern of _quietLogAllowPatterns ) {

		if ( pattern.test( trimmed ) ) return true;

	}

	return false;

}

/**
 * Prints one line to the console (WinQuake sys_win.c Sys_Printf). Each `%s`, `%d`, `%i` or `%f` in `fmt` is replaced
 * by the next argument via `String()` (no width, precision or number formatting; a placeholder with no argument left
 * becomes empty), and any arguments left over are appended separated by spaces.
 *
 * Under Deno, when `globalThis.__THREE_QUAKE_QUIET_LOGS === true`, only lines matching the module's allow-list
 * (connections, clients, server spawn, WebTransport and NET_Init messages, server-frame errors) are printed; blank
 * lines are dropped. In the browser every line is printed.
 *
 * @param {*} fmt the format string (converted with `String()`)
 * @param {...*} args the values for the placeholders
 */
export function Sys_Printf( fmt, ...args ) {

	const line = _formatPrintf( fmt, args );
	if ( _shouldPrintLine( line ) !== true ) return;
	console.log( line );

}

/**
 * Logs `Sys_Quit` to the console. A browser page cannot exit, so this does not stop the engine (WinQuake sys_win.c
 * Sys_Quit exits the process); no current caller.
 */
export function Sys_Quit() {

	console.log( 'Sys_Quit' );

}

/**
 * The engine clock (WinQuake sys_win.c Sys_FloatTime): `performance.now()` in seconds, with sub-millisecond
 * precision, counted from page (or process) start. Used by the host frame loop, networking, the
 * renderer's timing and portal animation.
 *
 * @returns {number} seconds since the time origin
 */
export function Sys_FloatTime() {

	return performance.now() / 1000.0;

}

/**
 * The same clock as `Sys_FloatTime` (JavaScript numbers are already doubles), kept for code ported from the
 * QuakeWorld-style `Sys_DoubleTime`; no current caller.
 *
 * @returns {number} seconds since the time origin (`performance.now() / 1000`)
 */
export function Sys_DoubleTime() {

	return performance.now() / 1000.0;

}
