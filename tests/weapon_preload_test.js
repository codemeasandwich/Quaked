// Execute the actual ordinary entry-point body against its host/UI boundaries,
// using the real optional weapon loader. Hold image decoding to prove that the
// asset-gated intro draws cannot become visible before art is ready. The host
// loop now warms assets behind the native console. No browser/game is launched.
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const weapons = await import( '../src/newer/render/r_weapons.js' );
const vars = await import( '../src/engine/common/cvar.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const startup = await import( '../src/newer/ui/r_demoloading.js' );

const { STARTUP_PACK } = await import( '../src/newer/assets/startup_pack.js' );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ), 'utf8' );
function check( value, label ) { if ( ! value ) throw new Error( label ); }

Deno.test( 'weapon startup: ordinary app warms held/pickup art behind its first real console, retaining the readiness gate until downloads settle', async () => {

	const oldFetch = globalThis.fetch, oldLoad = THREE.TextureLoader.prototype.load, oldHdr = r_hdr.string;
	const images = [], fetched = [], events = [];
	if ( ! vars.Cvar_FindVar( r_hdr.name ) ) vars.Cvar_RegisterVariable( r_hdr );
	vars.Cvar_SetValue( 'r_hdr', 0 );
	globalThis.fetch = async path => {

		fetched.push( String( path ) );
		if ( String( path ).endsWith( '/g_rock2.json' ) ) return { ok: false };
		try { return { ok: true, json: async () => JSON.parse( read( String( path ) ) ) }; } catch { return { ok: false }; }

	};
	THREE.TextureLoader.prototype.load = function ( path, done ) {

		const texture = new THREE.DataTexture( new Uint8Array( [ 180, 140, 100, 255 ] ), 1, 1 );
		images.push( { path: String( path ), release: () => done( texture ) } ); return texture;

	};
	try {

		const noop = () => {}, window = { location: { search: '' } };
		let frame; const renderer = { domElement: { width: 800, height: 600 }, setAnimationLoop( callback ) { frame = callback; events.push( 'demo loop' ); } };
		const context = {
			window, renderer, document: { getElementById: id => id === 'loading' ? { remove: () => events.push( 'loading removed' ) } : { style: {} } },
			console, URLSearchParams, performance, STARTUP_PACK, crypto: globalThis.crypto,
			Sys_Init: noop, Sys_Printf: noop, Sys_Error: message => { throw new Error( message ); }, COM_InitArgv: noop,
			Host_Init: async () => { events.push( 'host initialized' ); startup.R_DemoLoadingAttract( true ); }, Host_Frame: () => { events.push( 'native console frame' ); startup.R_DemoLoadingConsoleDrawn(); }, Host_Shutdown: noop,
			COM_FetchPak: async () => ( { files: [] } ), COM_FetchOptionalPak: async () => null, COM_AddPack: noop, COM_SetNewerPack: noop, COM_SetNewerStartupPack: noop,
			COM_NewerFile: () => null, COM_SetNewerMapsPack: noop, COM_LoadPackFile: () => { throw new Error( 'No embedded map pack was supplied by this startup fixture' ); },
			Cbuf_AddText: noop, Cmd_AddCommand: noop, Cmd_Argc: () => 0, Cmd_Argv: () => '', Con_Printf: noop,
			Cvar_VariableValue: vars.Cvar_VariableValue, Cvar_SetValue: vars.Cvar_SetValue, key_dest: 0, key_game: 0,
			R_PerfSetHost: noop, R_PerfStart: noop, R_DemoSplitEnd: noop, LocalPlay_PlayerWindow: () => null, M_LocalPlayerJoin: noop, Cvar_SetStorageWritable: noop, Window_SetHostGoneListener: noop, GameCatalogue_Refresh: () => Promise.resolve( null ), setTimeout: () => 0, GameSelection_OwnedPacks: () => [ 'resources/id1/pak0.pak' ], GameSelection_ReportStart: () => true, R_PerfStop: noop, R_PerfProfiling: () => false, R_PerfPump: noop, R_PerfLastReport: () => null,
			cls: {}, cl: {}, sv: {}, scene: {}, camera: {}, Draw_CachePicFromPNG: async () => {}, Draw_CacheSinglePlayerMenu: () => ( {} ),
			Draw_LoadConbackImage: async () => true, XR_Init: noop, R_WeaponsPreload: weapons.R_WeaponsPreload, R_NewerHudPreload: noop, R_RockBakePrefetch: name => events.push( 'bake prefetch ' + name ), R_NewerSkinsPrefetchBsp: noop, R_DemonBakePrefetch: noop, R_BspTextureNames: () => [], R_NewerTexturesPrefetch: noop, M_SetExternals: noop,
			R_DemoLoadingBoot: startup.R_DemoLoadingBoot, R_DemoLoadingAppReady: startup.R_DemoLoadingAppReady, R_DemoLoadingCancel: startup.R_DemoLoadingCancel, R_DemoLoadingStatus: startup.R_DemoLoadingStatus, R_DemoLoadingSplash: startup.R_DemoLoadingSplash, LoadingScreen_SetProgress: noop, LoadingScreen_Remove: () => events.push( 'loading removed' ), LoadingScreen_FadeOut: () => { events.push( 'logo fade' ); return Promise.resolve(); }
		};
		// Imports supply the boundaries above; execute unchanged main() control
		// flow, including its real preload await and animation-loop scheduling.
		const entry = read( 'main.js' ).replace( /^import[\s\S]*?;\s*/gm, '' );
		const boot = new Script( entry, { filename: 'main.js' } ).runInNewContext( context );
		for ( let i = 0; i < 40; i ++ ) await Promise.resolve();
		check( images.length > 0 && events.includes( 'host initialized' ), 'ordinary boot starts real weapon downloads' );
		await boot; check( ! events.includes( 'loading removed' ) && events.includes( 'demo loop' ), 'host loop can warm pending image art but logo is not removed before a real console' ); check( startup.R_DemoLoadingHolding(), 'actual startup scope retains readiness gate while weapon images pending' ); frame( 16 ); await new Promise( resolve => setTimeout( resolve, 0 ) ); check( events.indexOf( 'logo fade' ) > events.indexOf( 'native console frame' ), 'logo fades only after its first real console frame even while optional images download' );
		check( weapons.R_WeaponsEnabled() === false, 'preload does not enable enhanced art in classic mode' );
		const one = weapons.R_WeaponsPreload(); check( weapons.R_WeaponsPreload() === one, 'preload promise reused' );
		for ( const image of images ) image.release();
		await one;
		check( ! events.includes( 'loading removed' ) && events.includes( 'demo loop' ), 'settled weapon art alone cannot release the full intro readiness gate' );
		const manifest = JSON.parse( read( 'newer/weapons/index.json' ) ), status = weapons.R_WeaponStatus();
		for ( const key of Object.keys( manifest.models ) ) {

			check( fetched.includes( 'newer/weapons/' + key + '.json' ), key + ' preloaded before first visible draw' );
			if ( key !== 'g_rock2' ) check( status.ready.includes( key ), key + ' ready' );
			check( weapons.R_WeaponAsset( 'progs/' + key + '.mdl' ) === null, key + ' stays original in classic mode despite preload' );

		}
		check( status.ready.includes( 'shell' ) && status.failures.g_rock2, 'shell ready and missing pickup diagnostic retained without blocking game' );
		vars.Cvar_SetValue( 'r_hdr', 1 );
		check( weapons.R_WeaponAsset( 'progs/g_shot.mdl' ) !== null, 'preloaded pickup immediately available in enhanced mode' );
		check( weapons.R_WeaponAsset( 'progs/g_rock2.mdl' ) === null, 'missing pickup remains native fallback' );
		const count = fetched.length; await weapons.R_WeaponsPreload(); check( fetched.length === count, 'completed preload never downloads again' );

	} finally { globalThis.fetch = oldFetch; THREE.TextureLoader.prototype.load = oldLoad; vars.Cvar_Set( 'r_hdr', oldHdr ); startup.R_DemoLoadingCancel(); }

} );

Deno.test( 'weapon startup: missing optional manifest resolves without blocking the app and preserves diagnostics', async () => {

	const oldFetch = globalThis.fetch;
	globalThis.fetch = async () => ( { ok: false } );
	try {

		const isolated = await import( '../src/newer/render/r_weapons.js?missing-preload-manifest' );
		await isolated.R_WeaponsPreload();
		check( isolated.R_WeaponStatus().failures.manifest && isolated.R_WeaponStatus().ready.length === 0, 'manifest failure visible; native app can proceed' );

	} finally { globalThis.fetch = oldFetch; }

} );
