// Backspace in the menus (owner, 21 October 2026): it goes back a page, as Escape does, and never leaves the game. The
// Mac app's web view (WebKit) treats an unhandled Backspace as "go back a page" in its history, which returned to the
// game shelf; the input layer keeps it for the game. Pages that edit text or clear a binding keep their own Backspace.
await import( '../src/engine/render/gl_rsurf.js' );
const keys = await import( '../src/engine/client/keys.js' );
const input = await import( '../src/platform/in_web.js' );
const common = await import( '../src/engine/client/menu_common.js' );
const menu = await import( '../src/engine/client/menu.js' );
const gyroMenu = await import( '../src/engine/client/menu_gyro.js' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

function target() {

	const listeners = new Map();
	return { listeners, addEventListener( type, fn ) { listeners.set( type, fn ); }, removeEventListener( type, fn ) { if ( listeners.get( type ) === fn ) listeners.delete( type ); } };

}

Deno.test( 'Backspace goes back a menu page like Escape, except where it edits', () => {

	common.M_SetExternals( { key_dest_set: keys.set_key_dest, key_dest_get: () => keys.key_dest, cls: { state: 0, demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 },
		Draw_CachePic: () => ( { width: 16, height: 16 } ), Draw_Pic: () => {}, Draw_TransPic: () => {}, Draw_Character: () => {}, S_LocalSound: () => {}, realtime_get: () => 0, host_time_get: () => 0 } );
	gyroMenu.M_Menu_Gyro_f( common.m_options );
	menu.M_Keydown( keys.K_BACKSPACE );
	check( common.m_state === common.m_options, 'Backspace on Controller returns to Options, got ' + common.m_state );
	gyroMenu.M_Menu_Gyro_f( common.m_options );
	menu.M_Keydown( keys.K_ENTER ); // Customise controller
	check( common.m_state === common.m_controller_customise, 'Customise opened' );
	menu.M_Keydown( keys.K_BACKSPACE );
	check( common.m_state === common.m_gyro, 'Backspace on Customise returns to Controller' );
	// the key bindings page keeps Backspace for clearing a binding
	common.set_m_state( common.m_keys );
	menu.M_Keydown( keys.K_BACKSPACE );
	check( common.m_state === common.m_keys, 'Customize controls keeps Backspace' );
	common.set_m_state( common.m_none );

} );

Deno.test( 'the input layer keeps Backspace from the web view (no history back to the shelf)', () => {

	const old = Object.getOwnPropertyDescriptor( globalThis, 'document' ), doc = target(), element = target();
	doc.body = element; doc.pointerLockElement = null;
	Object.defineProperty( globalThis, 'document', { configurable: true, value: doc } );
	try {

		input.IN_Init( element );
		let prevented = 0;
		doc.listeners.get( 'keydown' )( { code: 'Backspace', key: 'Backspace', target: element, preventDefault: () => prevented ++ } );
		doc.listeners.get( 'keyup' )?.( { code: 'Backspace', key: 'Backspace', target: element, preventDefault: () => {} } );
		check( prevented === 1, 'Backspace default prevented' );

	} finally {

		input.IN_Shutdown();
		if ( old === undefined ) delete globalThis.document; else Object.defineProperty( globalThis, 'document', old );

	}

} );
