// The vertical QUAKE plaque (gfx/qplaque.lmp) belongs to the top-level menu alone (owner, 21 October 2026): every
// Quake page below it is drawn without it. The HD menu redraws the same picture calls, so this covers both looks.
await import( '../src/engine/render/gl_rsurf.js' );
const keys = await import( '../src/engine/client/keys.js' );
const common = await import( '../src/engine/client/menu_common.js' );
await import( '../src/engine/client/menu.js' );
const main = await import( '../src/engine/client/menu_main.js' );
const options = await import( '../src/engine/client/menu_options.js' );
const multiplayer = await import( '../src/engine/client/menu_multiplayer.js' );
const levelselect = await import( '../src/engine/client/menu_levelselect.js' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'only the top-level Quake menu draws the vertical QUAKE plaque', () => {

	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' ); Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } } );
	try {

		let drawn = [];
		const pic = path => ( { path, width: 16, height: 16 } );
		const record = ( x, y, p ) => { if ( p ) drawn.push( p.path ); };
		common.M_SetExternals( { key_dest_set: keys.set_key_dest, key_dest_get: () => keys.key_dest, cls: { state: 0, demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 },
			Draw_CachePic: pic, Draw_Pic: record, Draw_TransPic: record, Draw_Character: () => {}, S_LocalSound: () => {}, realtime_get: () => 0, host_time_get: () => 0 } );
		const pages = { main: main.M_Main_Draw, singleplayer: main.M_SinglePlayer_Draw, levelselect: levelselect.M_LevelSelect_Draw,
			options: options.M_Options_Draw, cheats: options.M_Cheats_Draw, multiplayer: multiplayer.M_MultiPlayer_Draw,
			mpchoice: multiplayer.M_MultiplayerChoice_Draw, setup: multiplayer.M_Setup_Draw };
		for ( const [ name, draw ] of Object.entries( pages ) ) {

			drawn = [];
			draw();
			check( drawn.length > 0, name + ' drew its pictures' );
			check( drawn.includes( 'gfx/qplaque.lmp' ) === ( name === 'main' ), name + ( name === 'main' ? ' keeps' : ' has no' ) + ' plaque: ' + drawn.join( ' ' ) );

		}

	} finally { if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow ); else delete globalThis.window; }

} );
