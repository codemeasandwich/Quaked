// Execute the actual ordinary entry-point body against its host/UI boundaries,
// using the real optional weapon loader. Hold image decoding to prove that the
// demo loop cannot start before art is ready. No browser or game is launched.
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
await import( '../src/gl_rsurf.js' );
const THREE = await import( 'three' );
const weapons = await import( '../src/r_weapons.js' );
const vars = await import( '../src/cvar.js' );
const { r_hdr } = await import( '../src/gl_post.js' );

const read = path => readFileSync( new URL( '../' + path, import.meta.url ), 'utf8' );
function check( value, label ) { if ( ! value ) throw new Error( label ); }

Deno.test( 'weapon startup: ordinary app waits for all optional held/pickup art before removing loading UI and starting demo frames', async () => {

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
		const renderer = { domElement: { width: 800, height: 600 }, setAnimationLoop() { events.push( 'demo loop' ); } };
		const context = {
			window, renderer, document: { getElementById: id => id === 'loading' ? { remove: () => events.push( 'loading removed' ) } : { style: {} } },
			console, URLSearchParams, performance,
			Sys_Init: noop, Sys_Printf: noop, Sys_Error: message => { throw new Error( message ); }, COM_InitArgv: noop,
			Host_Init: async () => { events.push( 'host initialized' ); }, Host_Frame: noop, Host_Shutdown: noop,
			COM_FetchPak: async () => ( {} ), COM_FetchOptionalPak: async () => null, COM_AddPack: noop, COM_SetNewerPack: noop,
			Cbuf_AddText: noop, Cmd_AddCommand: noop, Cmd_Argc: () => 0, Cmd_Argv: () => '', Con_Printf: noop,
			Cvar_VariableValue: vars.Cvar_VariableValue, Cvar_SetValue: vars.Cvar_SetValue, key_dest: 0, key_game: 0,
			R_PerfSetHost: noop, R_PerfStart: noop, R_PerfStop: noop, R_PerfProfiling: () => false, R_PerfPump: noop, R_PerfLastReport: () => null,
			cls: {}, cl: {}, sv: {}, scene: {}, camera: {}, Draw_CachePicFromPNG: async () => {}, Draw_CacheSinglePlayerMenu: () => ( {} ),
			Draw_LoadConbackImage: async () => true, XR_Init: noop, R_WeaponsPreload: weapons.R_WeaponsPreload
		};
		// Imports supply the boundaries above; execute unchanged main() control
		// flow, including its real preload await and animation-loop scheduling.
		const entry = read( 'main.js' ).replace( /^import[\s\S]*?;\s*/gm, '' );
		const boot = new Script( entry, { filename: 'main.js' } ).runInNewContext( context );
		for ( let i = 0; i < 40; i ++ ) await Promise.resolve();
		check( images.length > 0 && events.includes( 'host initialized' ), 'ordinary boot starts real weapon downloads' );
		check( ! events.includes( 'loading removed' ) && ! events.includes( 'demo loop' ), 'loading/demo cannot bypass pending image decoding' );
		check( weapons.R_WeaponsEnabled() === false, 'preload does not enable enhanced art in classic mode' );
		const one = weapons.R_WeaponsPreload(); check( weapons.R_WeaponsPreload() === one, 'preload promise reused' );
		for ( const image of images ) image.release();
		await boot;
		check( events.indexOf( 'loading removed' ) > events.indexOf( 'host initialized' ) && events.includes( 'demo loop' ), 'ordinary boot finishes and starts rendering after art settles' );
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

	} finally { globalThis.fetch = oldFetch; THREE.TextureLoader.prototype.load = oldLoad; vars.Cvar_Set( 'r_hdr', oldHdr ); }

} );

Deno.test( 'weapon startup: missing optional manifest resolves without blocking the app and preserves diagnostics', async () => {

	const oldFetch = globalThis.fetch;
	globalThis.fetch = async () => ( { ok: false } );
	try {

		const isolated = await import( '../src/r_weapons.js?missing-preload-manifest' );
		await isolated.R_WeaponsPreload();
		check( isolated.R_WeaponStatus().failures.manifest && isolated.R_WeaponStatus().ready.length === 0, 'manifest failure visible; native app can proceed' );

	} finally { globalThis.fetch = oldFetch; }

} );
