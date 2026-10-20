/**
 * @module tests/helpers/desktop_tauri_loader
 *
 * Redirects only the native desktop boundary. The engine and LAN modules stay real; the fixture lives in the
 * test worker, since Node's resolution hooks run on a separate thread.
 */
const core = `export const invoke = (...args) => globalThis.__QUAKED_DESKTOP_TEST__.invoke(...args);
export const convertFileSrc = (...args) => globalThis.__QUAKED_DESKTOP_TEST__.convertFileSrc(...args);`;
const event = `export const listen = (...args) => globalThis.__QUAKED_DESKTOP_TEST__.listen(...args);`;

/** Resolves the two Tauri APIs before desktop.js (and its dynamic LAN import) is evaluated. */
export function resolve( specifier, context, nextResolve ) {

	const source = specifier === '@tauri-apps/api/core' ? core : specifier === '@tauri-apps/api/event' ? event : null;
	if ( source !== null ) return { url: 'data:text/javascript,' + encodeURIComponent( source ), shortCircuit: true };
	return nextResolve( specifier, context );

}
