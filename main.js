// Three-Quake entry point
// Equivalent to WinQuake/sys_win.c WinMain() + main()

import { Sys_Init, Sys_Printf, Sys_Error } from './src/engine/common/sys.js';
import { COM_InitArgv } from './src/engine/common/common.js';
import { Host_Init, Host_Frame, Host_Shutdown } from './src/engine/server/host.js';
import { COM_FetchPak, COM_FetchOptionalPak, COM_AddPack, COM_SetNewerPack, COM_SetNewerStartupPack, COM_SetNewerMapsPack, COM_NewerFile, COM_LoadPackFile } from './src/engine/common/pak.js';
import { Cbuf_AddText, Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from './src/engine/common/cmd.js';
import { Con_Printf } from './src/engine/common/common.js';
import { Cvar_VariableValue, Cvar_SetValue } from './src/engine/common/cvar.js';
import { key_dest, key_game } from './src/engine/client/keys.js';
import { R_PerfSetHost, R_PerfStart, R_PerfStop, R_PerfProfiling, R_PerfPump, R_PerfLastReport } from './src/r_perf.js';
import { cls, cl } from './src/engine/client/client.js';
import { sv } from './src/engine/server/server.js';
import { scene, camera } from './src/engine/render/gl_rmain.js';
import { renderer } from './src/engine/render/vid.js';
import { Draw_CachePicFromPNG, Draw_CacheSinglePlayerMenu, Draw_LoadConbackImage } from './src/engine/render/gl_draw.js';
import { XR_Init } from './src/platform/webxr.js';
import { STARTUP_PACK } from './src/startup_pack.js';
import { R_WeaponsPreload } from './src/newer/render/r_weapons.js';
import { M_SetExternals } from './src/engine/client/menu.js';
import { LoadingScreen_SetProgress, LoadingScreen_Remove, LoadingScreen_FadeOut } from './src/loading_screen.js';
import { R_DemoLoadingBoot, R_DemoLoadingAppReady, R_DemoLoadingCancel, R_DemoLoadingSplash, R_DemoLoadingStatus } from './src/r_demoloading.js';
import { R_NewerHudPreload } from './src/r_newerhud.js';
import { R_RockBakePrefetch } from './src/r_rockbakes.js';
import { R_NewerSkinsPrefetchBsp } from './src/newer/render/r_newerskins.js';
import { R_DemonBakePrefetch } from './src/r_demonbakes.js';
import {R_StartupNormalsPrefetch} from './src/r_normalprefetch.js';
import { R_NewerTexturesPrefetch, R_BspTextureNames } from './src/r_newertextures.js';

const parms = {
	basedir: '.',
	argc: 0,
	argv: []
};

async function main() {

	try {

		Sys_Init();

		COM_InitArgv( parms.argv );
		const urlParams = new URLSearchParams( window.location.search );
		let hubNormalBytes=null,hubNormalsStarted=false;

		// Load pak0.pak from the same directory; the loading logo fills as it downloads
		Sys_Printf( 'Loading pak0.pak...\\n' );
		// Overlap independent transports; native installation order stays intact.
		const nativePack = COM_FetchPak( 'pak0.pak', 'pak0.pak', value => LoadingScreen_SetProgress( value ) );
		const optionalPack = COM_FetchOptionalPak( 'newer.pak', 'newer.pak' ).catch( error => {
			Sys_Printf( 'newer.pak not loaded: ' + error.message );return null;
		} );
		const startupPack=COM_FetchOptionalPak(STARTUP_PACK.file,STARTUP_PACK.file).catch(error=>{Sys_Printf('Startup pack not loaded: '+error.message);return null;});
		// Local owned content supplies missing native files only. Never replace
		// this checkout's programs, palette or established startup worlds.
		const ownedPack = COM_FetchOptionalPak( 'resources/id1/pak0.pak', 'resources/id1/pak0.pak' );
		const [ pak0, newerPak, hudPak, fullGamePak ] = await Promise.all( [ nativePack, optionalPack, startupPack, ownedPack ] );
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
		if ( ! urlParams.has( 'room' ) ) {
			const demo=pak0?.files.find(file=>file.name==='maps/e1m3.bsp');
			if(demo){const bytes=new Uint8Array(pak0.data,demo.filepos,demo.filelen);R_RockBakePrefetch('maps/e1m3.bsp',undefined,undefined,bytes);R_StartupNormalsPrefetch('maps/e1m3.bsp',bytes);R_DemonBakePrefetch('maps/e1m3.bsp',bytes);R_NewerTexturesPrefetch(R_BspTextureNames(bytes));R_NewerSkinsPrefetchBsp(bytes);}
		}

		// Small enhanced-only map pack, independent of the optional art bundle.
		const packedMaps = COM_NewerFile( 'newer/maps.pak' );
		const newerMaps = packedMaps ? COM_LoadPackFile( 'newer/maps.pak', packedMaps.data.buffer.slice( packedMaps.data.byteOffset, packedMaps.data.byteOffset + packedMaps.size ) ) :
			await COM_FetchOptionalPak( 'newer/maps.pak', 'newer/maps.pak' );
		if ( newerMaps ) {
			COM_SetNewerMapsPack( newerMaps );
			if(!urlParams.has('room')){const hub=newerMaps.files.find(file=>file.name==='maps/start.bsp');
			 if(hub){const bytes=new Uint8Array(newerMaps.data,hub.filepos,hub.filelen);R_RockBakePrefetch('maps/start.bsp',undefined,undefined,bytes);hubNormalBytes=bytes;R_DemonBakePrefetch('maps/start.bsp',bytes);R_NewerTexturesPrefetch(R_BspTextureNames(bytes));R_NewerSkinsPrefetchBsp(bytes);}}
		}
		await Host_Init( parms );

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
			menuOpen: () => key_dest !== key_game
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
