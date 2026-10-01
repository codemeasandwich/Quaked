await import( '../src/gl_rsurf.js' );
const menu = await import( '../src/menu.js' ), cmd = await import( '../src/cmd.js' ), keys = await import( '../src/keys.js' );
const draw = await import( '../src/gl_draw.js' );
function equal( a, b, label ) { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); }
Deno.test( 'public credits screen includes musician within the original menu bounds and preserves source link hit target', () => {

	const rows = new Map(), opened = [], descriptor = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400, open: url => opened.push( url ) } } );
	try {

		let dest = keys.key_game; cmd.Cbuf_Init(); cmd.Cmd_Init(); menu.M_Init();
		menu.M_SetExternals( { key_dest_set: v => { dest = v; }, key_dest_get: () => dest, vid: { width: 320, height: 200 }, cls: { demonum: - 1 },
			Draw_CachePic: path => ( { width: 8, height: 8, path } ), Draw_TransPic() {}, Draw_Pic() {}, Draw_FadeScreen() {}, S_LocalSound() {},
			Draw_Character: ( x, y, num ) => { if ( ( num & 127 ) === 10 ) return; if ( ! rows.has( y ) ) rows.set( y, [] ); rows.get( y ).push( { x, char: String.fromCharCode( num & 127 ) } ); } } );
		cmd.Cmd_ExecuteString( 'menu_credits' ); menu.M_Draw();
		const dx = ( draw.Draw_GetVirtualWidth() - 320 ) >> 1, dy = ( draw.Draw_GetVirtualHeight() - 200 ) >> 1;
		const text = y => rows.get( y )?.sort( ( a, b ) => a.x - b.x ).map( c => c.char ).join( '' );
		equal( text( 152 + dy ), 'Ambient music', 'credit heading' ); equal( text( 160 + dy ), ' Iron Cthulhu Apocalypse', 'artist credit' );
		equal( text( 180 + dy ), ' github.com/codemeasandwich/Quaked', 'original source row' );
		for ( const [ y, chars ] of rows ) for ( const { x } of chars ) if ( x - dx < 0 || x - dx + 8 > 320 || y - dy < 0 || y - dy + 8 > 200 ) throw new Error( 'credit character outside menu' );
		menu.M_Keydown( keys.K_ENTER ); equal( opened[ 0 ], 'https://github.com/codemeasandwich/Quaked', 'source link still opens' );
		menu.M_Keydown( keys.K_ESCAPE ); equal( menu.m_state, menu.m_main, 'back to main' );

	} finally { if ( descriptor ) Object.defineProperty( globalThis, 'window', descriptor ); else delete globalThis.window; }

} );
