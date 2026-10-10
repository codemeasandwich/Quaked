/**
 * @module engine/common/key_dest
 *
 * Where key presses go (WinQuake keys.h `keydest_t`): the game, the console, a chat message or the menu. Read by the
 * console, the screen, the server, the network driver and the platform's input; written by the keys, the menu and the
 * console through `set_key_dest`. `keys.js` re-exports it. A leaf so that modules below the client read it without
 * importing `keys.js` (card [44g], baseline debt D1a).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `key_dest`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */

export const key_game = 0;
export const key_console = 1;
export const key_message = 2;
export const key_menu = 3;

export let key_dest = key_game; // one of key_game, key_console, key_message, key_menu

/** @param {number} v the new destination: `key_game`, `key_console`, `key_message` or `key_menu` */
export function set_key_dest( v ) { key_dest = v; }
