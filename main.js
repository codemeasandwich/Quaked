// Three-Quake entry point
// Equivalent to WinQuake/sys_win.c WinMain() + main()

import { Sys_Init, Sys_Printf, Sys_Error } from './src/sys.js';
import { COM_InitArgv } from './src/common.js';
import { Host_Init, Host_Frame, Host_Shutdown } from './src/host.js';
import { COM_FetchPak, COM_FetchOptionalPak, COM_AddPack, COM_SetNewerPack } from './src/pak.js';
import { Cbuf_AddText, Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from './src/cmd.js';
import { Con_Printf } from './src/common.js';
import { Cvar_VariableValue, Cvar_SetValue } from './src/cvar.js';
import { key_dest, key_game } from './src/keys.js';
import { R_PerfSetHost, R_PerfStart, R_PerfStop, R_PerfProfiling, R_PerfPump, R_PerfLastReport } from './src/r_perf.js';
import { cls, cl } from './src/client.js';
import { sv } from './src/server.js';
import { scene, camera } from './src/gl_rmain.js';
import { renderer } from './src/vid.js';
import { Draw_CachePicFromPNG, Draw_CacheSinglePlayerMenu, Draw_LoadConbackImage } from './src/gl_draw.js';
import { XR_Init } from './src/webxr.js';
import { R_WeaponsPreload } from './src/r_weapons.js';
import { M_SetExternals } from './src/menu.js';

const parms = {
	basedir: '.',
	argc: 0,
	argv: []
};

async function main() {

	try {

		Sys_Init();

		COM_InitArgv( parms.argv );

		// Loading bar
		const loadingProgress = document.getElementById( 'loading-progress' );
		const loadingOverlay = document.getElementById( 'loading' );

		function setProgress( value ) {

			if ( loadingProgress ) {

				loadingProgress.style.width = ( value * 100 ) + '%';

			}

		}

		// Load pak0.pak from the same directory
		Sys_Printf( 'Loading pak0.pak...\\n' );
		const pak0 = await COM_FetchPak( 'pak0.pak', 'pak0.pak', setProgress );
		if ( pak0 ) {

			COM_AddPack( pak0 );
			Sys_Printf( 'pak0.pak loaded successfully\\n' );

		} else {

			Sys_Printf( 'Warning: pak0.pak not found - game data will be missing\\n' );

		}

		// Newer Game's own art and data, when it is there (a checkout without it uses the loose files in newer/)
		try {

			const newerPak = await COM_FetchOptionalPak( 'newer.pak', 'newer.pak' );
			if ( newerPak ) {

				COM_SetNewerPack( newerPak );
				Sys_Printf( 'newer.pak loaded\\n' );

			}

		} catch ( e ) {

			Sys_Printf( 'newer.pak not loaded: ' + e.message + '\\n' );

		}

		await Host_Init( parms );

		// Ready the supplied held/pickup art before the attract demo begins.
		// Optional failures retain native art; New Game/classic stay native even
		// though the enhanced assets are resident. No trial-page setup is needed.
		await R_WeaponsPreload();

		// Remove loading overlay
		if ( loadingOverlay ) {

			loadingOverlay.remove();

		}

		// Preload custom menu images
		try {

			await Draw_CachePicFromPNG( 'gfx/mainmenu_ext.lmp', 'mainmenu.png' );
			Sys_Printf( 'Loaded custom menu images\\n' );

		} catch ( e ) {

			Sys_Printf( 'Warning: Could not load custom menu images\\n' );

		}

		// Supplied native-script name: display-only black key and proportional sizing.
		try {

			M_SetExternals( { weaponModelsCredit: await Draw_CachePicFromPNG(
				'gfx/weapon_models_name.lmp', 'assets/credits/dannaki-name.png',
				{ blackKey: 3, trim: true, displayHeight: 8 } ) } );

		} catch ( e ) {

			Sys_Printf( 'Warning: Could not load the weapon model credit artwork\n' );

		}

		// Compose added labels from native glyphs; preserve the original rows.
		// This avoids the miscropped letters in older cached spmenu.png artwork.
		if ( Draw_CacheSinglePlayerMenu() === null )
			Sys_Printf( 'Warning: Could not build the single player menu image\n' );

		// The banner of the Newer Game features menu
		try {

			await Draw_CachePicFromPNG( 'gfx/p_enhanced.lmp', 'enhancedmenu.png?v=1' );

		} catch ( e ) {

			Sys_Printf( 'Warning: Could not load the enhanced menu banner\n' );

		}

		// Console (and menu backdrop) wallpaper; the original conback stays if it fails
		if ( await Draw_LoadConbackImage( 'conback.webp' ) )
			Sys_Printf( 'Loaded console wallpaper\n' );

		// Check URL parameters for auto-join
		const urlParams = new URLSearchParams( window.location.search );
		const roomId = urlParams.get( 'room' );

		if ( roomId ) {

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

		} );

	} catch ( e ) {

		console.error( 'Three-Quake Fatal Error:', e );
		Sys_Error( e.message );

	}

}

main();
