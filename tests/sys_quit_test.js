// Quit (owner ruling, 13 October 2026): the Mac app returns to the game shelf; the HTML (and a source checkout) goes to
// the project's GitHub page, in the same tab. Through the public interface of sys.js and menu_main.js.
import { Sys_Quit, SYS_QUIT_PAGE } from '../src/engine/common/sys.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const place = () => { const visits = []; return { visits, pathname: '/index.html', assign: url => visits.push( url ) }; };

Deno.test( 'quit leaves for the game shelf in the app and the GitHub page in the HTML', () => {

	const old = globalThis.__QUAKED_DISTRIBUTION__;
	try {

		globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'desktop' };
		let where = place(); Sys_Quit( where );
		same( where.visits.join(), '/index.html', 'the app reloads its page without ?game: the shelf' );
		globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'web' };
		where = place(); Sys_Quit( where );
		same( where.visits.join(), SYS_QUIT_PAGE, 'the HTML goes to the GitHub page' );
		same( SYS_QUIT_PAGE, 'https://github.com/codemeasandwich/Quaked', 'the project page' );
		delete globalThis.__QUAKED_DISTRIBUTION__;
		where = place(); Sys_Quit( where );
		same( where.visits.join(), SYS_QUIT_PAGE, 'a source checkout behaves as the HTML' );

	} finally {

		if ( old === undefined ) delete globalThis.__QUAKED_DISTRIBUTION__; else globalThis.__QUAKED_DISTRIBUTION__ = old;

	}

} );

Deno.test( 'Y on the quit prompt runs the quit command instead of opening a window', async () => {

	const main = await import( '../src/engine/client/menu_main.js' ), cmd = await import( '../src/engine/common/cmd.js' );
	const opened = [], oldOpen = globalThis.window?.open;
	if ( globalThis.window ) globalThis.window.open = url => opened.push( url );
	try {

		let quits = 0;
		cmd.Cbuf_Init(); cmd.Cmd_AddCommand( 'quit', () => quits ++ );
		const keys = await import( '../src/engine/client/keys.js' ), common = await import( '../src/engine/client/menu_common.js' );
		common.M_SetExternals( { key_dest_set: keys.set_key_dest, key_dest_get: () => keys.key_dest } ); // as menu.js wires it
		main.M_Menu_Quit_f(); main.M_Quit_Key( 121 );
		same( keys.key_dest, keys.key_console, 'Y runs quit from the console, so it is not asked again' );
		cmd.Cbuf_Execute();
		same( quits, 1, 'the quit command ran' );
		same( opened.length, 0, 'no new window' );

	} finally {

		if ( globalThis.window ) globalThis.window.open = oldOpen;

	}

} );

Deno.test( 'the quit command asks first outside the console, and leaves from it', async () => {

	const { Host_Quit_f } = await import( '../src/engine/server/host_cmd.js' ), cmd = await import( '../src/engine/common/cmd.js' ), keys = await import( '../src/engine/client/keys.js' );
	const visits = [], oldLocation = Object.getOwnPropertyDescriptor( globalThis, 'location' ), old = globalThis.__QUAKED_DISTRIBUTION__;
	Object.defineProperty( globalThis, 'location', { value: { pathname: '/index.html', assign: url => visits.push( url ) }, configurable: true, writable: true } );
	globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'desktop' };
	try {

		let prompts = 0;
		cmd.Cbuf_Init(); cmd.Cmd_AddCommand( 'menu_quit', () => prompts ++ );
		keys.set_key_dest( keys.key_game ); Host_Quit_f(); cmd.Cbuf_Execute();
		same( prompts, 1, 'F10 or stuffed text in a game opens the prompt' ); same( visits.length, 0, 'and does not leave' );
		keys.set_key_dest( keys.key_console ); Host_Quit_f();
		same( visits.join(), '/index.html', 'from the console (and the prompt\'s Y) it leaves for the shelf' );

	} finally {

		if ( oldLocation ) Object.defineProperty( globalThis, 'location', oldLocation ); else delete globalThis.location;
		if ( old === undefined ) delete globalThis.__QUAKED_DISTRIBUTION__; else globalThis.__QUAKED_DISTRIBUTION__ = old;

	}

} );
