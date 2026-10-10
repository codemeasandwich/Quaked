// Three-Quake entry point
// Equivalent to WinQuake/sys_win.c WinMain() + main()

import { Sys_Init, Sys_Printf, Sys_Error } from './src/engine/common/sys.js';
import { COM_InitArgv } from './src/engine/common/common.js';
import { Host_Init, Host_Frame, Host_Shutdown } from './src/engine/server/host.js';
import { COM_FetchPak, COM_FetchOptionalPak, COM_AddPack, COM_SetNewerPack, COM_SetNewerStartupPack, COM_SetNewerMapsPack, COM_NewerFile, COM_LoadPackFile } from './src/engine/common/pak.js';
import { Cbuf_AddText, Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from './src/engine/common/cmd.js';
import { Con_Printf } from './src/engine/common/common.js';
import { Cvar_VariableValue, Cvar_SetValue, Cvar_SetStorageWritable } from './src/engine/common/cvar.js';
import { key_dest, key_game } from './src/engine/client/keys.js';
import { R_PerfSetHost, R_PerfStart, R_PerfStop, R_PerfProfiling, R_PerfPump, R_PerfLastReport } from './src/newer/render/r_perf.js';
import { R_DemoSplitEnd } from './src/newer/render/r_demosplit.js';
import { cls, cl } from './src/engine/client/client.js';
import { sv } from './src/engine/server/server.js';
import { scene, camera } from './src/engine/render/gl_rmain.js';
import { renderer } from './src/engine/render/vid.js';
import { Draw_CachePicFromPNG, Draw_CacheSinglePlayerMenu, Draw_LoadConbackImage } from './src/engine/render/gl_draw.js';
import { XR_Init } from './src/platform/webxr.js';
import { STARTUP_PACK } from './src/newer/assets/startup_pack.js';
import { R_WeaponsPreload } from './src/newer/render/r_weapons.js';
import { M_SetExternals, M_LocalPlayerJoin } from './src/engine/client/menu.js';
import { LocalPlay_PlayerWindow } from './src/engine/client/local_play.js';
import { Window_SetHostGoneListener } from './src/engine/net/net_window.js';
import { LoadingScreen_SetProgress, LoadingScreen_Remove, LoadingScreen_FadeOut } from './src/newer/ui/loading_screen.js';
import { R_DemoLoadingBoot, R_DemoLoadingAppReady, R_DemoLoadingCancel, R_DemoLoadingSplash, R_DemoLoadingStatus } from './src/newer/ui/r_demoloading.js';
import { R_NewerHudPreload } from './src/newer/ui/r_newerhud.js';
import { R_RockBakePrefetch } from './src/newer/assets/r_rockbakes.js';
import { R_NewerSkinsPrefetchBsp } from './src/newer/render/r_newerskins.js';
import { R_DemonBakePrefetch } from './src/newer/assets/r_demonbakes.js';
import {R_StartupNormalsPrefetch} from './src/newer/assets/r_normalprefetch.js';
import { R_NewerTexturesPrefetch, R_BspTextureNames } from './src/newer/render/r_newertextures.js';
import './src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)

const parms = {
	basedir: '.',
	argc: 0,
	argv: []
};
import { GameCatalogue_Refresh, GameCatalogue_Get } from './src/engine/common/game_catalogue.js';
import { GameSelection_OwnedPacks, GameSelection_ReportStart, GameSelection_Kept, GameSelection_Remember, GameSelection_MissionPack } from './src/engine/common/game_selection.js';
import { GameShelf_Show } from './src/newer/ui/game_shelf.js';

async function main() {

	try {

		Sys_Init();

		COM_InitArgv( parms.argv );
		const urlParams = new URLSearchParams( window.location.search );
		// A player's window in local play (card [37a]): it joins player 1's page, and saves no settings of its own
		const playerWindow = LocalPlay_PlayerWindow( window.location.search );
		if ( playerWindow ) { Cvar_SetStorageWritable( false ); document.title = 'Quaked: Player ' + playerWindow.player; }
		const joining = urlParams.has( 'room' ) || playerWindow !== null; // no attract demo: straight into a game
		// The game shelf (card [M1]; the owner's direction): with more than one game installed, the index page opens on a
		// shelf of their boxes before any game starts; a box opens its game's own URL (?game=<id>), which starts here.
		// One game only (a site with the shareware alone), a game's URL, a room, a player's window, or another page that
		// boots this (the trial pages under tests/): straight in.
		const indexPage = /(^|\/)(index\.html)?$/.test( window.location.pathname ?? '/' ); // not a trial page that boots main.js
		if ( indexPage && ! joining && ! urlParams.has( 'game' ) ) {

			const catalogue = await GameCatalogue_Refresh().catch( error => { Sys_Printf( 'Game catalogue: ' + error.message + '\n' ); return null; } );
			const installed = ( catalogue?.games ?? [] ).filter( game => game.present );
			if ( installed.length > 1 ) {

				await GameShelf_Show( installed, { current: GameSelection_Kept(), remember: GameSelection_Remember } );
				return; // the chosen game's URL is loading

			}

		}
		let hubNormalBytes=null,hubNormalsStarted=false;

		// Load the shareware pak0.pak from games/shareware/ (card [34a]; a deployment that still serves it at the root is
		// tried next); the loading logo fills as it downloads
		Sys_Printf( 'Loading pak0.pak...\\n' );
		// Overlap independent transports; native installation order stays intact.
		const nativePack = COM_FetchPak( 'games/shareware/pak0.pak', 'pak0.pak', value => LoadingScreen_SetProgress( value ) );
		const optionalPack = COM_FetchOptionalPak( 'newer.pak', 'newer.pak' ).catch( error => {
			Sys_Printf( 'newer.pak not loaded: ' + error.message );return null;
		} );
		const startupPack=COM_FetchOptionalPak(STARTUP_PACK.file,STARTUP_PACK.file).catch(error=>{Sys_Printf('Startup pack not loaded: '+error.message);return null;});
		// Local owned content supplies missing native files only. Never replace
		// this checkout's programs, palette or established startup worlds.
		// Which owned pack, if any, comes from the game chosen (card [34c]): none for the shareware, so nothing more is
		// downloaded; the full Quake's from games/Quake/ or resources/id1/ (the first found) otherwise, as before.
		const ownedPack = ( async () => { for ( const url of GameSelection_OwnedPacks() ) { const pack = await COM_FetchOptionalPak( url, url ); if ( pack ) return pack; } return null; } )();
		// A mission pack (card [34c]) also fetches its own pack, from games/<name>/ or resources/<dir>/ (the first found)
		const mission = GameSelection_MissionPack();
		const missionLoad = mission ? ( async () => { for ( const url of mission.packs ) { const pack = await COM_FetchOptionalPak( url, url ); if ( pack ) return pack; } return null; } )() : Promise.resolve( null );
		const [ sharewarePak, newerPak, hudPak, fullGamePak, missionPak ] = await Promise.all( [ nativePack, optionalPack, startupPack, ownedPack, missionLoad ] );
		// it runs only over Quake: without Quake's pack, the shareware alone starts (and says so)
		const missionMounted = missionPak !== null && fullGamePak !== null;
		const pak0 = sharewarePak ?? await COM_FetchPak( 'pak0.pak', 'pak0.pak', value => LoadingScreen_SetProgress( value ) );
		if(hudPak){
		 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',hudPak.data)),n=>n.toString(16).padStart(2,'0')).join('');
		 if(digest===STARTUP_PACK.sha256)COM_SetNewerStartupPack(hudPak);else Sys_Printf('Startup pack checksum mismatch; loose HUD fallback');
		}
		if ( pak0 ) {

			// COM_AddPack gives the last mounted pack priority. Mount the
			// optional archive first so bundled identities always win.
			if ( fullGamePak ) COM_AddPack( fullGamePak );
			COM_AddPack( pak0 );
			Sys_Printf( 'pak0.pak loaded successfully\\n' );
			// a mission pack's own QuakeC, status bar pictures and maps replace the base game's: it is mounted last,
			// and its switch (-hipnotic or -rogue) sets the engine's mission-pack behaviour before Host_Init
			if ( missionMounted ) { COM_AddPack( missionPak ); COM_InitArgv( [ parms.argv[ 0 ] ?? 'quaked', ...parms.argv.slice( 1 ), mission.switch ] ); /* argv[0] is the program name */ Sys_Printf( mission.name + ' loaded\n' ); }

		} else {

			Sys_Printf( 'Warning: pak0.pak not found - game data will be missing\\n' );

		}

		if ( newerPak ) COM_SetNewerPack( newerPak );
		// These existing loaders need known asset routing, not a renderer or
		// native palette. Overlap their transport with map-pack and host setup.
		R_WeaponsPreload();
		R_NewerHudPreload();
		// Start validated current-attract and hub bakes before hidden GPU work
		// competes with transport/decompression. Prefetch never releases a gate.
		if ( ! joining ) {
			const demo=pak0?.files.find(file=>file.name==='maps/e1m3.bsp');
			if(demo){const bytes=new Uint8Array(pak0.data,demo.filepos,demo.filelen);R_RockBakePrefetch('maps/e1m3.bsp',undefined,undefined,bytes);R_StartupNormalsPrefetch('maps/e1m3.bsp',bytes);R_DemonBakePrefetch('maps/e1m3.bsp',bytes);R_NewerTexturesPrefetch(R_BspTextureNames(bytes));R_NewerSkinsPrefetchBsp(bytes);}
		}

		// Small enhanced-only map pack, independent of the optional art bundle.
		const packedMaps = COM_NewerFile( 'newer/maps.pak' );
		const newerMaps = packedMaps ? COM_LoadPackFile( 'newer/maps.pak', packedMaps.data.buffer.slice( packedMaps.data.byteOffset, packedMaps.data.byteOffset + packedMaps.size ) ) :
			await COM_FetchOptionalPak( 'newer/maps.pak', 'newer/maps.pak' );
		// Newer Game's own start map replaces id1's; a mission pack keeps its own (card [34c])
		if ( newerMaps && ! missionMounted ) {
			COM_SetNewerMapsPack( newerMaps );
			if(!joining){const hub=newerMaps.files.find(file=>file.name==='maps/start.bsp');
			 if(hub){const bytes=new Uint8Array(newerMaps.data,hub.filepos,hub.filelen);R_RockBakePrefetch('maps/start.bsp',undefined,undefined,bytes);hubNormalBytes=bytes;R_DemonBakePrefetch('maps/start.bsp',bytes);R_NewerTexturesPrefetch(R_BspTextureNames(bytes));R_NewerSkinsPrefetchBsp(bytes);}}
		}
		await Host_Init( parms );
		GameSelection_ReportStart( fullGamePak !== null, mission === null || missionMounted ); // a chosen game whose pack has gone is said so (card [34c])
		// Which games are installed (card [34b]): probed once the game is running, a few bounded reads per folder
		if ( GameCatalogue_Get() === null ) setTimeout( () => GameCatalogue_Refresh().catch( error => Sys_Printf( 'Game catalogue: ' + error.message + '\n' ) ), 4000 );

		// Ready the supplied held/pickup art before the attract demo begins.
		// Optional failures retain native art; New Game/classic stay native even
		// though the enhanced assets are resident. No trial-page setup is needed.
		// Optional art initializes behind the real console rather than keeping
		// the black logo on screen until its downloads have finished.
		// Independent UI loads all settle before AppReady, concurrently.
		const uiArtwork = [
		( async () => {
		// Preload custom menu images
		try {

			await Draw_CachePicFromPNG( 'gfx/mainmenu_ext.lmp', 'newer/ui/mainmenu-bestiarium.png', { displayHeight:140 } );
			Sys_Printf( 'Loaded custom menu images\\n' );

		} catch ( e ) {

			Sys_Printf( 'Warning: Could not load custom menu images\\n' );

		}

		} )(),
		( async () => {
		// Supplied native-script name: display-only black key and proportional sizing.
		try {

			M_SetExternals( { weaponModelsCredit: await Draw_CachePicFromPNG(
				'gfx/weapon_models_name.lmp', 'assets/credits/dannaki-name.png',
				{ blackKey: 3, trim: true, displayHeight: 8 } ) } );

		} catch ( e ) {

			Sys_Printf( 'Warning: Could not load the weapon model credit artwork\n' );

		}

		} )(),
		( async () => {
		// The banner of the Newer Game features menu
		try {

			await Draw_CachePicFromPNG( 'gfx/p_enhanced.lmp', 'enhancedmenu.png?v=1' );

		} catch ( e ) {

			Sys_Printf( 'Warning: Could not load the enhanced menu banner\n' );

		}

		} )(),
		( async () => {
		// Console (and menu backdrop) wallpaper; the original conback stays if it fails
		if ( await Draw_LoadConbackImage( 'conback.webp' ) )
			Sys_Printf( 'Loaded console wallpaper\n' );

		} )()
		];
		// Compose added labels from native glyphs; preserve the original rows.
		// This avoids the miscropped letters in older cached spmenu.png artwork.
		if ( Draw_CacheSinglePlayerMenu() === null )
			Sys_Printf( 'Warning: Could not build the single player menu image\n' );


		// Check URL parameters for auto-join
		const roomId = urlParams.get( 'room' );

		if ( roomId ) {
			await Promise.all(uiArtwork); // preserve the established network join barrier
			R_DemoLoadingCancel(); // network/gameplay keeps its established transition

			const serverUrl = urlParams.get( 'server' ) || 'https://wts.mrdoob.com:4433';
			const connectUrl = serverUrl + '?room=' + encodeURIComponent( roomId );
			Sys_Printf( 'Auto-joining room: %s\\n', roomId );
			Cbuf_AddText( 'connect "' + connectUrl + '"\n' );

		}

		if ( playerWindow ) {

			await Promise.all( uiArtwork ); // the same barrier as a room join
			R_DemoLoadingCancel();
			Sys_Printf( 'Local play: joining as Player %s\n', playerWindow.player );
			M_LocalPlayerJoin( playerWindow );
			// when player 1 ends local play (or closes their page), this window closes; a browser that keeps it open (one
			// the player opened by hand) shows the menu instead of a frozen last frame
			Window_SetHostGoneListener( () => { window.close(); Cbuf_AddText( 'menu_main\n' ); } );

		}

		// Initialize WebXR (creates rig, offers VR session — must be after Host_Init)
		XR_Init( scene );

		// Expose for debugging
		window.Cbuf_AddText = Cbuf_AddText;
		window.cls = cls;
		window.cl = cl;
		window.sv = sv;
		window.scene = scene;
		Object.defineProperty( window, 'camera', { get: () => camera } );
		Object.defineProperty( window, 'renderer', { get: () => renderer } );

		// the performance profiler (perfprofile, perfstop, perfreport; Options > Performance profiler)
		R_PerfSetHost( {
			Cbuf_AddText, cls, log: Con_Printf, getCvar: Cvar_VariableValue, setCvar: Cvar_SetValue,
			size: () => renderer.domElement.width + 'x' + renderer.domElement.height,
			menuOpen: () => key_dest !== key_game,
			endDemoSplit: R_DemoSplitEnd // (ends a title demo's split before profiling)
		} );
		Cmd_AddCommand( 'perfprofile', () => R_PerfStart( Cmd_Argc() > 1 ? parseInt( Cmd_Argv( 1 ), 10 ) : 0 ) ); // perfprofile [frames per demo]
		Cmd_AddCommand( 'perfstop', () => R_PerfStop( 'stopped' ) );
		Cmd_AddCommand( 'perfreport', () => {

			const r = R_PerfLastReport();
			Con_Printf( r !== null ? r.text + '\n' : 'No profile yet: perfprofile runs one\n' );

		} );

		let oldtime = performance.now() / 1000;

		// Use renderer.setAnimationLoop instead of requestAnimationFrame.
		// This is required for WebXR — Three.js automatically switches to
		// xrSession.requestAnimationFrame when a VR session is active.
		// In non-XR mode, behavior is identical to regular rAF.
		renderer.setAnimationLoop( function ( timestamp ) {

			const newtime = timestamp / 1000;
			const time = newtime - oldtime;
			oldtime = newtime;

			if ( R_PerfProfiling() ) R_PerfPump( Host_Frame );
			else Host_Frame( time );
			const startup=R_DemoLoadingStatus();
			// Current demo samples fit the bounded cache. Warming both worlds at
			// once evicted them before their images could admit those inputs.
			if(hubNormalBytes&&!hubNormalsStarted&&(startup.mode==='welcome'&&cl.worldmodel?.name==='maps/start.bsp'||startup.mode==='demo'&&startup.phase==='done')){hubNormalsStarted=true;R_StartupNormalsPrefetch('maps/start.bsp',hubNormalBytes);}
			if(startup.mode==='welcome'||startup.phase==='done'&&!startup.fadeStarted)LoadingScreen_Remove();
			else R_DemoLoadingSplash(()=>LoadingScreen_FadeOut());

		} );

		// Build/sign on and warm the real world while independent UI images
		// arrive. Their existing barrier still owns presentation release.
		await Promise.all(uiArtwork);
		R_DemoLoadingAppReady();

	} catch ( e ) {

		console.error( 'Three-Quake Fatal Error:', e );
		Sys_Error( e.message );

	}

}

R_DemoLoadingBoot();
main();
