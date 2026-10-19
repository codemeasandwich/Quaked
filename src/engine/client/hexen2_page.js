/**
 * @module engine/client/hexen2_page
 *
 * The page host for a native Hexen II session: mounts the packs the desktop adapter selected, places the requested class
 * through the engine boot path, binds the client view and runs the frame loop — server physics from the real input stack,
 * the player's native messages into the client state, the renderer's world frame and the native status bar. It is the
 * Hexen counterpart of the Quake host path in main.js (which cannot mount Hexen's eight-hull BSP or its protocols).
 *
 * Types: plain values and functions; no exported classes.
 * State: writes the engine server/client state; module-level `_running` guards a second start.
 * Errors: a failed mount returns `{ ok: false, reason }`; a WebGL failure propagates from `VID_Init`.
 */

import { COM_AddPack, COM_FindFile, COM_LoadFile } from '../common/pak.js';
import { W_LoadWadFile } from '../common/wad.js';
import { Cmd_Init, Cmd_ExecuteString, Cbuf_Execute, Cbuf_Init } from '../common/cmd.js';
import { Cvar_SetValue, Cvar_VariableValue } from '../common/cvar.js';
import { renderer } from '../render/vid.js';
import { set_host_frametime } from '../common/host_state.js';
import { Sys_Printf } from '../common/sys.js';
import { VID_Init, vid, d_8to24table } from '../render/vid.js';
import { Mod_Init, Mod_ForName } from '../render/gl_model.js';
import { model_t } from '../render/gl_model_types.js';
import { set_loadmodel } from '../render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../render/gl_model_bsp.js';
import { R_Init, R_RenderView, set_r_worldentity, r_drawviewmodel, r_drawentities } from '../render/gl_rmain.js';
import { R_NewMap as R_NewMap_Client } from '../render/gl_rmisc.js';
import { entity_t, r_refdef, R_ParticleExplosion, R_BlobExplosion } from '../render/render.js';
import { Draw_Init, Draw_BeginFrame, Draw_CachePic, Draw_Pic, Draw_PicFromWad, Draw_String, Draw_SmallString, Draw_SmallCharsetReady, Draw_SetExternals, Draw_GetOverlayCanvas } from '../render/gl_draw.js';
import { sv, SIGNON_SIZE } from '../server/server.js';
import { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents } from '../server/world.js';
import { SV_SetCallbacks as SV_SetPhysCallbacks, SV_Physics, SV_SetFrametime, SV_SetPlayer } from '../server/sv_phys.js';
import { SV_Move_SetCallbacks } from '../server/sv_move.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../server/sv_user.js';
import { SV_StartSound as SV_StartSoundWire, SV_StartParticle } from '../server/sv_main.js';
import { PR_SetSV, PR_SetSVS, EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, G_FLOAT, G_FLOAT_SET, PR_GetString, pr_global_struct } from '../progs/progs.js';
import { PR_ExecuteProgram, PR_SetHostError, PR_LastRunError } from '../progs/pr_exec.js';
import { GetEdictFieldValue } from '../progs/pr_edict.js';
import { Hexen2_OpenLocalSession } from '../progs/hexen2_session.js';
import { Hexen2_BindClientState } from './hexen2_bind.js';
import { Hexen2_HudFromClientState } from './hexen2_clienthud.js';
import { Hexen2_StatusBarOps } from './hexen2_statusbar.js';
import { Hexen2_DrawStatusBar } from './hexen2_sbar_draw.js';
import { Hexen2_HudTransform, Hexen2_NumberLayout } from './hexen2_hud_layout.js';
import { Hexen2_StartChoice, Hexen2_SoundOrigin, Hexen2_IsUseKey, Hexen2_ItemRotation, Hexen2_TakeSounds, HEXEN2_VIEWMODEL_LIFT } from './hexen2_native_ui.js';
import { Hexen2_CreateMenu } from './hexen2_menu.js';
import { Hexen2_DrawPixelMenu } from './hexen2_pixel_menu.js';
import { Hexen2_EffectTracker } from './hexen2_effects_bridge.js';
import { Hexen2_IntermissionStatus } from './hexen2_intermission.js';
import { R_FireballSpawn, R_SmokeTrail } from '../common/hooks.js';
import { Hexen2_BuildSaveBundle, Hexen2_ValidateSaveBundle, Hexen2_ApplySaveBundle, Hexen2_SaveStore, Hexen2_HubStore, Hexen2_NormalizeMapName, Hexen2_TransitionUrl } from '../common/hexen2_save.js';
import { Hexen2_CaptureWorld, Hexen2_RestoreWorld } from '../common/hexen2_hub.js';
import { Hexen2_EncodeClientdata, Hexen2_EncodeUpdateInv, Hexen2_AllStatMask } from '../common/hexen2_clientdata.js';
import { Hexen2_WriteEntityUpdate } from '../common/hexen2_entitywire.js';
import { HEXEN2_SERVER_MESSAGES } from '../common/hexen2_protocol.js';
import { Hexen2_ApplyClientMessage } from './hexen2_clientstate.js';
import { cl, cls, cl_entities, cl_visedicts, cl_numvisedicts, set_cl_numvisedicts, MAX_VISEDICTS, SIGNONS } from './client.js';
import { CL_BaseMove, CL_InitInput, in_attack, in_forward } from './cl_input.js';
import { Key_SetBinding, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, set_key_dest, key_game, key_menu, key_dest } from './keys.js';
import { V_CalcRefdef } from './view.js';
import { S_Init, S_UnlockAudio, S_PrecacheSound, S_StartSound, S_StopSound, S_Update, S_GetAudioContext } from '../sound/snd_dma.js';
import { IN_Init, IN_Move } from '../../platform/in_web.js';

let _running = false;

/**
 * Starts a local Hexen II session in the page.
 *
 * @param {{ packs: ReadonlyArray<object>, id?: string, classId?: string, element?: HTMLElement }} options the COM packs
 *   the desktop adapter mounted, the catalogue id, the class and the input element
 * @returns {Promise<{ ok: true, session: object } | { ok: false, reason: string }>} the started session
 */
export async function Hexen2_PageStart( options ) {

	const log = text => options.log?.( text );
	globalThis.__HEXEN2_LOG__ = log;
	// Keep a gamecode Host_Error as a catchable tick failure with its real reason, rather than a fake Sys_Error.
	PR_SetHostError( error => { throw new Error( 'Host_Error: ' + error + ' (' + PR_LastRunError() + ')' ); } );
	globalThis.__HEXEN2_VM_STATE__ = state => { if ( ! globalThis.__HEXEN2_VM_SEEN__ ) { globalThis.__HEXEN2_VM_SEEN__ = true; log( 'viewmodel state ' + JSON.stringify( state ) ); } };
	const choice = Hexen2_StartChoice( { classId: options.classId, skill: options.skill } );
	if ( _running ) return { ok: false, reason: 'a Hexen II session is already running' };
	_running = true;
	try {

		log( 'host start, packs ' + options.packs.length );
		for ( const pack of options.packs ) COM_AddPack( pack );
		const progs = COM_FindFile( 'progs.dat' );
		const palette = COM_FindFile( 'gfx/palette.lmp' );
		if ( !progs || !palette ) throw new Error( 'the selected Hexen II installation has no progs.dat or palette' );
		const progsBytes = new Uint8Array( progs.data.buffer, progs.data.byteOffset, progs.size );
		log( 'progs ' + progs.size + ' bytes, palette ' + palette.size );
		const paletteBytes = new Uint8Array( palette.data.buffer, palette.data.byteOffset, palette.size );
		VID_Init( paletteBytes );
		Mod_Init();
		Cbuf_Init();
		Cmd_Init();
		set_key_dest( key_game );

		const client = { name: 'player', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ),
			cmd: { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 } };
		sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; client.message = sv.signon;
		const svs = { maxclients: 1, clients: [ client ], active: true };
		PR_SetSV( sv ); PR_SetSVS( svs );
		sv.max_edicts = 600;
		sv.time = 0.1;

		const id = options.id ?? 'hexen2';
		const entry = { id, kind: id, name: 'Hexen II', folder: options.folder ?? 'library/' + id, playable: true };
		const readNamed = name => {

			const file = COM_FindFile( name );
			return file ? new Uint8Array( file.data.buffer, file.data.byteOffset, file.size ) : null;

		};
		const session = Hexen2_OpenLocalSession( {
			entry, classId: choice.classId, skill: choice.skill, level: options.level, spot: options.spot, client, sv, svs, readFile: readNamed,
			loadMap: name => {

				const file = COM_FindFile( name );
				if ( !file ) throw new Error( 'no map ' + name );
				const map = new model_t(); map.name = name; set_loadmodel( map );
				Mod_LoadBrushModel( map, file.data.buffer.slice( file.data.byteOffset, file.data.byteOffset + file.size ) );
				return map;

			},
			installCallbacks: () => {

				SV_SetPhysCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram,
					EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, GetEdictFieldValue, SV_StartSound: playLocalSound, SV_StartParticle,
					SV_StopSound: ( entity, channel ) => S_StopSound( entity?.index ?? 0, channel ) } );
				SV_Move_SetCallbacks( { PF_changeyaw: () => {}, G_FLOAT, G_FLOAT_SET } );
				for ( const [ buffer, bytes ] of [ [ 'datagram', 'datagram_buf' ], [ 'reliable_datagram', 'reliable_datagram_buf' ] ] )
					if ( sv[ buffer ] && sv[ bytes ] && ! sv[ buffer ].data ) {

						sv[ buffer ].data = sv[ bytes ]; sv[ buffer ].maxsize = sv[ bytes ].length;
						sv[ buffer ].cursize = 0; sv[ buffer ].allowoverflow = true;

					}

			}
		} );
		if ( !session.ok ) throw new Error( session.reason );
		globalThis.__HEXEN2_SESSION__ = session; // browser trial hooks (the HUD/level are still the live session's)
		log( 'session ok, class ' + session.plan.classNumber + ', skill ' + ( pr_global_struct.skill | 0 ) + ', map entities ' + sv.num_edicts );
		let precachedSounds = 0;
		for ( const name of session.state.sounds ?? [] ) if ( name ) { try { if ( S_PrecacheSound( name ) ) precachedSounds ++; } catch ( error ) { } }
		log( 'sounds precached=' + precachedSounds + '/' + ( session.state.sounds?.length ?? 0 ) );
		Sys_Printf( 'Hexen II: class %i\n', session.plan.classNumber );
		cl.worldmodel = session.map; cl.model_precache = [ null, session.map ]; cl.state = 2; cl.time = 0; cl.velocity = [ 0, 0, 0 ];
		cl.paused = false; cl.intermission = false;
		R_Init();
		r_drawviewmodel.value = 1; r_drawviewmodel.string = '1';
		r_drawentities.value = 1; r_drawentities.string = '1';
		const worldEntity = new entity_t(); worldEntity.model = session.map; worldEntity.frame = 0; set_r_worldentity( worldEntity );
		R_NewMap_Client( cl ); // the client wrapper also selects the Hexen sky texture and clears the texture chains
		Draw_SetExternals( { vid, d_8to24table } );
		const wad = COM_LoadFile( 'gfx.wad' );
		if ( wad ) W_LoadWadFile( wad );
		const sbNums = [];
		for ( let i = 0; i < 10; i ++ ) sbNums.push( Draw_PicFromWad( 'num_' + i ) );
		const sbMinus = Draw_PicFromWad( 'num_minus' );
		const drawNum = ( value, digits, x, y ) => {

			const layout = Hexen2_NumberLayout( value, digits );
			const text = layout.text;
			x += layout.xOffset;
			for ( let at = 0; at < text.length; at ++ ) {

				const ch = text[ at ];
				const pic = ch === '-' ? sbMinus : sbNums[ ch.charCodeAt( 0 ) - 48 ];
				if ( pic ) Draw_Pic( x, y, pic );
				x += 13;

			}

		};
		const charset = COM_FindFile( 'gfx/menu/conchars.lmp' );
		Draw_Init( null, charset ? new Uint8Array( charset.data.buffer, charset.data.byteOffset, charset.size ) : null );
		const overlay = Draw_GetOverlayCanvas();
		if ( overlay ) { overlay.style.position = 'fixed'; overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.width = '100vw'; overlay.style.height = '100vh'; }
		const bound = Hexen2_BindClientState( session.state, { cl, clEntities: cl_entities,
			modelAt: name => name.endsWith( '.mdl' ) ? Mod_ForName( name, true ) : null, viewangles: [ 0, 0, 0 ] } );
		if ( !bound.ok ) throw new Error( bound.reason );
		log( 'renderer and client bound' );
		cls.signon = SIGNONS;
		cl.stats[ 0 ] = session.hud.health; cl.stats[ 4 ] = session.hud.health;

		// sound
		if ( ! S_GetAudioContext() ) S_Init();
		S_UnlockAudio(); S_PrecacheSound( 'ambience/water1.wav' );

		// input: real keys and pointer lock through the platform adapter; movement through the engine's button commands
		IN_Init( options.element ?? document.body );
		CL_InitInput();
		Key_SetBinding( K_UPARROW, '+forward' ); Key_SetBinding( K_DOWNARROW, '+back' );

		sv.active = true;
		SV_SetPlayer( session.player );
		SV_User_SetCallbacks( { host_client: client, get_key_dest: () => key_game, V_CalcRoll: () => 0 } );

		const resize = () => {

			const width = Math.max( 320, window.innerWidth || 1280 ), height = Math.max( 240, window.innerHeight || 800 );
			vid.width = width; vid.height = height; vid.conwidth = width; vid.conheight = height; vid.rowbytes = width;
			renderer.setPixelRatio( 1 );
			renderer.setSize( width, height, false );
			const canvas = renderer.domElement;
			canvas.style.position = 'fixed'; canvas.style.left = '0'; canvas.style.top = '0';
			canvas.style.width = '100vw'; canvas.style.height = '100vh';
			r_refdef.vrect.x = 0; r_refdef.vrect.y = 0; r_refdef.vrect.width = width; r_refdef.vrect.height = height;
			r_refdef.vrectScale = 1; r_refdef.fov_x = 90;
			r_refdef.fov_y = 2 * Math.atan( Math.tan( Math.PI / 4 ) * height / width ) * 180 / Math.PI;

		};
		const gesture = () => { S_UnlockAudio(); Promise.resolve( renderer.domElement.requestPointerLock?.() ).catch( () => {} ); removeEventListener( 'pointerdown', gesture ); removeEventListener( 'keydown', gesture ); };
		addEventListener( 'pointerdown', gesture, { once: true } ); addEventListener( 'keydown', gesture, { once: true } );
		renderer.domElement.addEventListener( 'click', () => { S_UnlockAudio(); Promise.resolve( renderer.domElement.requestPointerLock?.() ).catch( () => {} ); } );
		document.addEventListener( 'mousedown', event => { if ( event.button === 0 ) Cmd_ExecuteString( '+attack' ); } );
		document.addEventListener( 'mouseup', event => { if ( event.button === 0 ) Cmd_ExecuteString( '-attack' ); } );
		let turnLeft = false, turnRight = false;
		addEventListener( 'keydown', event => { if ( event.code === 'ArrowLeft' ) turnLeft = true; if ( event.code === 'ArrowRight' ) turnRight = true; } );
		addEventListener( 'keyup', event => { if ( event.code === 'ArrowLeft' ) turnLeft = false; if ( event.code === 'ArrowRight' ) turnRight = false; } );
		// WKWebView may not grant pointer lock: fall back to raw pointer deltas for mouse look
		let lastMouse = null;
		document.addEventListener( 'mousemove', event => {

			if ( document.pointerLockElement ) return;
			if ( lastMouse === null ) { lastMouse = { x: event.clientX, y: event.clientY }; return; }
			const dx = event.clientX - lastMouse.x, dy = event.clientY - lastMouse.y;
			lastMouse = { x: event.clientX, y: event.clientY };
			if ( dx === 0 && dy === 0 ) return;
			cl.viewangles[ 1 ] = ( cl.viewangles[ 1 ] - dx * 0.25 + 360 ) % 360;
			cl.viewangles[ 0 ] = Math.max( - 70, Math.min( 80, cl.viewangles[ 0 ] - dy * 0.25 ) );

		} );
		document.addEventListener( 'pointerlockchange', () => log( 'pointerlock ' + ( document.pointerLockElement ? 'acquired' : 'released' ) ) );
		window.addEventListener( 'resize', resize );
		resize();
		window.dispatchEvent( new Event( 'resize' ) ); // let Draw_Init's listener size the overlay to this window
		let last = performance.now();
		let attacking = false;
		let frameCount = 0;
		let weaponSelectFrames = 0;
		let jumpHeld = false, useHeld = false;
		cl.viewent = cl.viewent ?? new entity_t();
		addEventListener( 'keydown', event => { if ( event.code === 'Space' ) jumpHeld = true; if ( Hexen2_IsUseKey( event.code ) ) useHeld = true; } );
		addEventListener( 'keyup', event => { if ( event.code === 'Space' ) jumpHeld = false; if ( event.code === 'Tab' ) showInfo = false; if ( Hexen2_IsUseKey( event.code ) ) useHeld = false; } );
		// In-game pause menu: Escape pauses the simulation and opens Resume / Inventory / Character / Options / Quit.
		// The game code keeps running nowhere while it is open; the last rendered frame stays under the overlay.
		const hudNow = () => Hexen2_HudFromClientState( session.state );
		const saveStore = Hexen2_SaveStore();
		// Hexen's effect slots are drawn by Quaked's existing Fireball/blob renderers (the adapter only maps the slot).
		const effectTracker = Hexen2_EffectTracker();
		const bridgeEffects = () => {

			const list = sv.hexenEffects;
			if ( !Array.isArray( list ) ) return;
			for ( let i = 0; i < list.length; i ++ ) {

				const effect = list[ i ];
				if ( !effect ) { effectTracker.forget( i ); continue; }
				const bridged = effectTracker.take( i, effect );
				if ( !bridged ) continue;
				const org = new Float32Array( bridged.origin );
				if ( bridged.kind === 'acid' ) R_BlobExplosion( org );
				else if ( bridged.kind === 'flame' ) { if ( typeof R_FireballSpawn === 'function' ) R_FireballSpawn( org, {} ); }
				else if ( bridged.kind === 'smoke' ) { if ( typeof R_SmokeTrail === 'function' ) R_SmokeTrail( org, new Float32Array( bridged.end ), false, 'hexen-effect-' + i + ':' + effect.time ); }
				else R_ParticleExplosion( org );

			}

		};
		const hubStore = Hexen2_HubStore();
		const levelName = () => Hexen2_NormalizeMapName( session.state.levelName ?? session.state.level ?? options.level ?? 'demo1' );
		const viewNow = () => ( { angles: [ cl.viewangles[ 0 ], cl.viewangles[ 1 ], cl.viewangles[ 2 ] ], time: cl.time } );
		let transitioning = false;
		const restoreSnapshot = () => {

			const level = levelName();
			const world = hubStore.getWorld( level );
			if ( world ) { const restored = Hexen2_RestoreWorld( sv, world ); globalThis.__HEXEN2_LOG__?.( restored.ok ? 'restored world ' + level + ' (' + restored.count + ' edicts)' : 'world restore failed: ' + restored.reason ); }
			let bundle = hubStore.get( level ), vectors = true;
			if ( bundle === null ) {

				try {

					const pending = JSON.parse( localStorage.getItem( 'quaked.hexen2.transition' ) ?? 'null' );
					if ( pending && pending.identity?.level === level ) { bundle = pending; vectors = false; }

				} catch { bundle = null; }

			}
			if ( !bundle ) return;
			const valid = Hexen2_ValidateSaveBundle( bundle );
			if ( !valid.ok ) { globalThis.__HEXEN2_LOG__?.( 'transition refused: ' + valid.reason ); return; }
			const applied = Hexen2_ApplySaveBundle( bundle, session.player, { vectors } );
			if ( applied.ok ) {

				SV_LinkEdict( session.player, true );
				cl_entities[ session.player.index ].origin = [ session.player.v.origin[ 0 ], session.player.v.origin[ 1 ], session.player.v.origin[ 2 ] ];
				if ( bundle.view ) cl.viewangles = [ bundle.view.angles[ 0 ], bundle.view.angles[ 1 ], bundle.view.angles[ 2 ] ];
				try { localStorage.removeItem( 'quaked.hexen2.transition' ); } catch { /* private mode */ }
				globalThis.__HEXEN2_LOG__?.( 'restored ' + level + ( vectors ? ' (hub snapshot)' : ' (transition fields)' ) );

			}

		};
		restoreSnapshot();
		const changeLevel = nextMap => {

			if ( transitioning ) return;
			transitioning = true;
			const current = levelName(), target = Hexen2_NormalizeMapName( nextMap.level );
			const classId = options.classId ?? session.plan.classId ?? 'paladin', skill = pr_global_struct.skill | 0;
			hubStore.putWorld( current, Hexen2_CaptureWorld( sv ) );
			hubStore.put( current, Hexen2_BuildSaveBundle( { gameId: options.id ?? 'hexen2', classId, skill, level: current, player: session.player, time: sv.time, view: viewNow() } ) );
			const pending = Hexen2_BuildSaveBundle( { gameId: options.id ?? 'hexen2', classId, skill, level: target, player: session.player, time: sv.time, view: viewNow() } );
			try { localStorage.setItem( 'quaked.hexen2.transition', JSON.stringify( pending ) ); } catch { /* private mode */ }
			sv.nextmap = null;
			globalThis.__HEXEN2_LOG__?.( 'changelevel ' + current + ' -> ' + target + ' spot=' + ( nextMap.spot ?? '' ) );
			location.assign( Hexen2_TransitionUrl( { pathname: location.pathname, gameId: options.id ?? 'hexen2', classId, skill, map: target, spot: nextMap.spot } ) );

		};
		const saveGame = async () => {

			try {

				const level = levelName(), classId = options.classId ?? session.plan.classId ?? 'paladin', skill = pr_global_struct.skill | 0;
				hubStore.putWorld( level, Hexen2_CaptureWorld( sv ) );
				hubStore.put( level, Hexen2_BuildSaveBundle( { gameId: options.id ?? 'hexen2', classId, skill, level, player: session.player, time: sv.time, view: viewNow() } ) );
				const bundle = Hexen2_BuildSaveBundle( { gameId: options.id ?? 'hexen2', classId, skill, level,
					player: session.player, time: sv.time, view: viewNow(), hub: { levels: hubStore.all(), worlds: hubStore.allWorlds() } } );
				await saveStore.put( 'quicksave', bundle );
				globalThis.__HEXEN2_LOG__?.( 'save quicksave (' + saveStore.kind + ', ' + Object.keys( bundle.hub?.worlds ?? {} ).length + ' levels)' );

			} catch ( error ) { globalThis.__HEXEN2_LOG__?.( 'save failed: ' + String( error?.message ?? error ) ); }

		};
		const loadGame = async () => {

			try {

				const bundle = await saveStore.get( 'quicksave' );
				const valid = Hexen2_ValidateSaveBundle( bundle );
				if ( !valid.ok ) { globalThis.__HEXEN2_LOG__?.( 'load refused: ' + valid.reason ); return; }
				for ( const [ level, record ] of Object.entries( bundle.hub?.levels ?? {} ) ) hubStore.put( level, record );
				for ( const [ level, world ] of Object.entries( bundle.hub?.worlds ?? {} ) ) hubStore.putWorld( level, world );
				if ( bundle.identity.level !== levelName() ) {

					try { localStorage.setItem( 'quaked.hexen2.transition', JSON.stringify( bundle ) ); } catch { /* private mode */ }
					globalThis.__HEXEN2_LOG__?.( 'load quicksave -> changelevel ' + bundle.identity.level );
					location.assign( Hexen2_TransitionUrl( { pathname: location.pathname, gameId: bundle.identity.gameId,
						classId: bundle.identity.classId, skill: bundle.identity.skill, map: bundle.identity.level } ) );
					return;

				}
				const savedWorld = bundle.hub?.worlds?.[ Hexen2_NormalizeMapName( bundle.identity.level ) ];
				if ( savedWorld ) { const restored = Hexen2_RestoreWorld( sv, savedWorld ); if ( !restored.ok ) { globalThis.__HEXEN2_LOG__?.( 'load refused: ' + restored.reason ); return; } }
				const applied = Hexen2_ApplySaveBundle( bundle, session.player );
				if ( !applied.ok ) { globalThis.__HEXEN2_LOG__?.( 'load refused: ' + applied.reason ); return; }
				SV_LinkEdict( session.player, true );
				cl_entities[ session.player.index ].origin = [ session.player.v.origin[ 0 ], session.player.v.origin[ 1 ], session.player.v.origin[ 2 ] ];
				if ( bundle.view ) cl.viewangles = [ bundle.view.angles[ 0 ], bundle.view.angles[ 1 ], bundle.view.angles[ 2 ] ];
				menu.update( { hud: hudNow() } );
				globalThis.__HEXEN2_LOG__?.( 'load quicksave (' + saveStore.kind + ', ' + Object.keys( bundle.hub?.worlds ?? {} ).length + ' levels)' );

			} catch ( error ) { globalThis.__HEXEN2_LOG__?.( 'load failed: ' + String( error?.message ?? error ) ); }

		};
		const menu = Hexen2_CreateMenu( {
			pixel: true,
			onActivate: id => {

				if ( id === 'inventory' || id === 'character' || id === 'options' ) { menu.update( { panel: id, hud: hudNow() } ); return true; }
				if ( id === 'resume' ) { closeMenu(); return true; }
				if ( id === 'save' ) { void saveGame(); return true; }
				if ( id === 'load' ) { void loadGame(); return true; }
				if ( id.startsWith( 'adjust:' ) ) { const [ , cvar, amount ] = id.split( ':' ); Cvar_SetValue( cvar, Number( amount ) ); menu.update( { hud: hudNow(), values: { [ cvar ]: Number( amount ) } } ); return true; }
				return false;

			},
			onResume: () => closeMenu(),
			onNewGame: () => location.assign( location.pathname + '?game=' + encodeURIComponent( options.id ?? 'hexen2' ) ),
			onQuit: options.onQuit ?? ( () => location.assign( location.pathname ) )
		} );
		const openMenu = () => {

			jumpHeld = false; useHeld = false; turnLeft = false; turnRight = false;
			set_key_dest( key_menu );
			menu.update( { panel: 'main', hud: hudNow(), values: { volume: Cvar_VariableValue( 'volume' ), sensitivity: Cvar_VariableValue( 'sensitivity' ) } } );
			menu.open( true );
			document.exitPointerLock?.();

		};
		const closeMenu = () => {

			menu.open( false );
			set_key_dest( key_game );
			Promise.resolve( renderer.domElement.requestPointerLock?.() ).catch( () => {} );

		};
		addEventListener( 'keydown', event => {

			if ( intermission && ( event.code === 'Enter' || event.code === 'Space' ) ) { event.preventDefault(); event.stopImmediatePropagation(); advanceIntermission = true; return; }
			if ( event.code === 'Tab' && !menu.isOpen() ) { showInfo = true; event.preventDefault(); return; }
			if ( event.code === 'Escape' ) {

				event.preventDefault();
				if ( menu.isOpen() ) { if ( ! menu.key( event ) ) closeMenu(); } else openMenu();
				return;

			}
			if ( menu.isOpen() && menu.key( event ) ) { event.preventDefault(); event.stopImmediatePropagation(); }

		}, true );
		globalThis.__HEXEN2_MENU__ = menu;
		let intermission = false, advanceIntermission = false, intermissionNext = '', showInfo = false, barHeight = 46;
		const drawIntermission = () => {

			const ctx = Draw_GetOverlayCanvas()?.getContext( '2d' );
			if ( !ctx ) return;
			ctx.save(); ctx.globalAlpha = 0.86; ctx.fillStyle = '#050508'; ctx.fillRect( 0, 0, 320, 200 ); ctx.restore();
			Draw_SmallString( 22, 34, 'INTERMISSION' );
			Draw_SmallString( 22, 56, 'LEVEL COMPLETE' );
			if ( intermissionNext ) {

				Draw_SmallString( 22, 68, 'NEXT: ' + intermissionNext.toUpperCase() );
				Draw_SmallString( 22, 92, 'ENTER TO CONTINUE' );

			} else {

				Draw_SmallString( 22, 68, 'THE END' );
				Draw_SmallString( 22, 88, 'HEXEN II' );
				Draw_SmallString( 22, 100, 'RAVEN SOFTWARE' );
				Draw_SmallString( 22, 112, 'ID SOFTWARE' );
				Draw_SmallString( 22, 124, 'THANK YOU FOR PLAYING' );
				Draw_SmallString( 22, 156, 'ENTER TO RETURN' );

			}
			Draw_SmallString( 22, 180, 'HEXEN II' );

		};
		let lastWidth = 0, lastHeight = 0;
		const tick = dt => {

			if ( menu.isOpen() ) {

				// the 2D overlay is cleared every frame, so a paused menu must redraw it while the world stays frozen
				try { Draw_BeginFrame( 'height' ); Hexen2_DrawPixelMenu( menu ); } catch ( error ) { log( 'menu draw: ' + error ); }
				return;

			}
			try {

				if ( window.innerWidth !== lastWidth || window.innerHeight !== lastHeight ) { lastWidth = window.innerWidth; lastHeight = window.innerHeight; resize(); }
				if ( turnLeft ) cl.viewangles[ 1 ] = ( cl.viewangles[ 1 ] + 120 * dt + 360 ) % 360;
				if ( turnRight ) cl.viewangles[ 1 ] = ( cl.viewangles[ 1 ] - 120 * dt + 720 ) % 360;
				set_host_frametime( dt );
				SV_SetFrametime( dt );
				Cbuf_Execute();
				// a forced view angle (spawn/teleport) is applied once; otherwise SV_ClientThink only updates angles when fixangle is 0
				if ( session.player.v.fixangle ) { cl.viewangles = [ session.player.v.v_angle[ 0 ], session.player.v.v_angle[ 1 ], session.player.v.v_angle[ 2 ] ]; session.player.v.fixangle = 0; }
				const command = { forwardmove: 0, sidemove: 0, upmove: 0, viewangles: [ 0, 0, 0 ] };
				CL_BaseMove( command );
				IN_Move( command );
				command.viewangles = [ cl.viewangles[ 0 ], cl.viewangles[ 1 ], cl.viewangles[ 2 ] ];
				SV_User_SetCommand( { forwardmove: command.forwardmove, sidemove: command.sidemove,
					upmove: command.upmove, viewangles: command.viewangles } );
				session.player.v.v_angle = [ cl.viewangles[ 0 ], cl.viewangles[ 1 ], cl.viewangles[ 2 ] ];
				SV_ClientThink();
				// the selection impulse must be set after the usercmd copy and before PlayerPreThink (SV_Physics)
				if ( weaponSelectFrames < 3 ) { session.player.v.impulse = 1; weaponSelectFrames ++; }
				attacking = ( in_attack.state & 1 ) !== 0;
				session.player.v.button0 = attacking ? 1 : 0;
				session.player.v.button2 = jumpHeld ? 1 : 0;
				session.player.v.button1 = useHeld ? 1 : 0;
				SV_Physics();
				flushLocalSounds();
				bridgeEffects();
				if ( sv.nextmap && !transitioning ) { const next = sv.nextmap; changeLevel( next ); return; }
				const intermissionState = Hexen2_IntermissionStatus( pr_global_struct, PR_GetString );
				if ( intermissionState.active ) { intermission = true; intermissionNext = intermissionState.nextMap; }
				if ( advanceIntermission ) {

					advanceIntermission = false;
					if ( intermissionState.nextMap ) { changeLevel( { level: intermissionState.nextMap, spot: intermissionState.nextSpot } ); return; }
					intermission = false;

				}
				const previousClientTime = cl.time;
				cl.time = sv.time;
				cl.oldtime = previousClientTime;
				applyPlayerMessages( session );
				cl_entities[ session.player.index ].origin = [ session.player.v.origin[ 0 ], session.player.v.origin[ 1 ], session.player.v.origin[ 2 ] ];
				updateNearbyEntities( session );
				V_CalcRefdef();
				const weaponName = PR_GetString( session.player.v.weaponmodel );
				if ( weaponName ) {

					const weapon = Mod_ForName( weaponName, true );
					if ( weapon ) {

						const vm = cl.viewent;
						vm.model = weapon; vm.frame = session.player.v.weaponframe | 0; vm.skin = session.player.v.skin | 0;
						vm.effects = 0; vm.colormap = vid.colormap; vm.scale = 1;
						// V_CalcRefdef already placed the gun with the shared Quake bob, punch, roll and step smoothing;
						// keep that reuse and only lift it clear of the native bar.
						vm.origin[ 2 ] += HEXEN2_VIEWMODEL_LIFT;

					}

				}
				R_RenderView();
				Draw_BeginFrame( 'height' );
				const targetBar = showInfo ? 144 : 46;
				barHeight += ( targetBar - barHeight ) * Math.min( 1, dt * 12 );
				if ( Math.abs( targetBar - barHeight ) < 0.5 ) barHeight = targetBar;
				const hud = Hexen2_HudFromClientState( session.state );
				const hudOps = Hexen2_StatusBarOps( hud, { width: 320, height: 200, barHeight } );
				if ( frameCount === 1 ) log( 'hud ops=' + hudOps.length + ' small=' + hudOps.filter( op => op.kind === 'small' ).length + ' nums=' + hudOps.filter( op => op.kind === 'num' ).length + ' tinyfont=' + Draw_SmallCharsetReady() );
				Hexen2_DrawStatusBar( hudOps, {
					pic: ( name, x, y ) => { const pic = Draw_CachePic( name ); if ( !pic ) return false; Draw_Pic( x, y, pic ); return true; },
					num: drawNum,
					small: ( text, x, y ) => Draw_SmallString( x, y, text )
				} );
				if ( intermission ) drawIntermission(); else Hexen2_DrawPixelMenu( menu ); // native overlay, not DOM chrome
				const context = S_GetAudioContext();
				if ( context && context.state === 'running' ) S_Update( session.player.v.origin, [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] );
				frameCount ++;
				if ( frameCount % 120 === 0 ) log( 'state frames=' + frameCount + ' vis=' + cl_numvisedicts + ' pos=' + session.player.v.origin.map( v => Math.round( v ) ).join( ',' ) + ' yaw=' + Math.round( cl.viewangles[ 1 ] ) + ' audio=' + ( S_GetAudioContext()?.state ?? 'none' ) + ' lock=' + ( document.pointerLockElement ? 1 : 0 ) );
				if ( frameCount === 1 ) log( 'weapon model=' + PR_GetString( session.player.v.weaponmodel ) + ' frame=' + ( session.player.v.weaponframe | 0 ) + ' viewent=' + ( cl.viewent.model ? ( cl.viewent.model.type + ':' + cl.viewent.model.numframes + ':' + cl.viewent.frame + ':' + cl.viewent.origin.map( v => Math.round( v ) ).join( ',' ) ) : 'no' ) + ' cvar=' + Cvar_VariableValue( 'r_drawviewmodel' ) + ' stats0=' + ( cl.stats[ 0 ] | 0 ) + ' vieworg=' + r_refdef.vieworg.map( v => Math.round( v ) ).join( ',' ) );
				if ( frameCount === 1 ) log( 'first frame rendered calls=' + ( renderer.info.render.calls | 0 ) + ' tris=' + ( renderer.info.render.triangles | 0 ) + ' canvas=' + renderer.domElement.width + 'x' + renderer.domElement.height + ' css=' + renderer.domElement.clientWidth + 'x' + renderer.domElement.clientHeight + ' style=' + renderer.domElement.style.width + 'x' + renderer.domElement.style.height + ' vrect=' + r_refdef.vrect.width + 'x' + r_refdef.vrect.height + ' vid=' + vid.width + 'x' + vid.height + ' overlay=' + ( Draw_GetOverlayCanvas()?.width ?? 0 ) + 'x' + ( Draw_GetOverlayCanvas()?.height ?? 0 ) + ' audio=' + ( S_GetAudioContext()?.state ?? 'none' ) );
				options.onFrame?.( session, { frames: frameCount, position: [ session.player.v.origin[ 0 ], session.player.v.origin[ 1 ], session.player.v.origin[ 2 ] ], health: session.player.v.health, canvas: [ renderer.domElement.width, renderer.domElement.height ], css: [ renderer.domElement.clientWidth, renderer.domElement.clientHeight ], video: [ vid.width, vid.height ], yaw: cl.viewangles[ 1 ], weapon: PR_GetString( session.player.v.weaponmodel ), viewent: cl.viewent.model ? 1 : 0, currentWeapon: session.player.v.current_weapon | 0, drawViewmodel: r_drawviewmodel.value | 0, drawEntities: r_drawentities.value | 0,
					hud: { ops: hudOps.length, small: hudOps.filter( op => op.kind === 'small' ).length, nums: hudOps.filter( op => op.kind === 'num' ).length, tinyfont: Draw_SmallCharsetReady() }, viewentFrame: cl.viewent?.frame ?? null, visibleFrames: cl_visedicts.slice( 0, Math.min( cl_numvisedicts, 64 ) ).map( entity => entity.frame | 0 ),
					audio: { state: context?.state ?? 'none', sources: globalThis.__SOURCES_STARTED__ ?? 0 } } );

			} catch ( error ) {

				log( 'frame error: ' + ( error?.name ? error.name + ': ' : '' ) + String( error?.message ?? error ) + '\n' + String( error?.stack ?? '' ) );

			}

		};
		const frame = now => {

			const dt = Math.min( 0.1, Math.max( 0.01, ( now - last ) / 1000 ) );
			last = now;
			tick( dt );
			requestAnimationFrame( frame );

		};
		requestAnimationFrame( frame );
		frame( performance.now() ); // draw now: a backgrounded WebView may not deliver rAF
		if ( options.autoplay ) {

			// Trial-only scripted input lives outside the product host; load it only when the packaged trial asks.
			const { Hexen2_RunAutoplay } = await import( './hexen2_autoplay.js' );
			Hexen2_RunAutoplay( { session, renderer, log, tick, frames: () => frameCount, saveTrial: options.saveTrial === true, audioState: () => S_GetAudioContext()?.state ?? 'none' } );

		}
		window.addEventListener( 'focus', () => frame( performance.now() ) );
		log( 'loop scheduled' );
		setTimeout( () => log( 'rAF watchdog frames=' + frameCount + ' visibility=' + document.visibilityState ), 1500 );
		return { ok: true, session };

	} catch ( error ) {

		_running = false;
		const detail = ( error?.name ? error.name + ': ' : '' ) + String( error?.message ?? error );
		log( 'host error: ' + detail + '\n' + String( error?.stack ?? '' ) );
		return { ok: false, reason: detail + '\n' + String( error?.stack ?? '' ) };

	}

}

function applyPlayerMessages( session ) {

	const player = session.player;
	const clientdata = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.clientdata, ...Hexen2_EncodeClientdata( player ) ] );
	Hexen2_ApplyClientMessage( session.state, clientdata );
	const stats = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.update_inv,
		...Hexen2_EncodeUpdateInv( player, Hexen2_AllStatMask(), offset => PR_GetString( offset ) ) ] );
	Hexen2_ApplyClientMessage( session.state, stats );
	const update = Hexen2_WriteEntityUpdate( { entity: player.index, origin: player.v.origin, angles: player.v.angles } );
	if ( update.ok ) Hexen2_ApplyClientMessage( session.state, update.bytes );

}

function updateNearbyEntities( session ) {

	const player = session.player;
	const indexOf = new Map();
	for ( let i = 0; i < session.state.models.length; i ++ ) indexOf.set( session.state.models[ i ], i + 1 );
	const candidates = [];
	for ( const ent of sv.edicts ) {

		if ( !ent || ent.free || ent.index === player.index || !ent.v.model ) continue;
		const modelName = PR_GetString( ent.v.model );
		const modelIndex = indexOf.get( modelName );
		if ( modelIndex === undefined ) continue;
		const distance = Math.hypot( ent.v.origin[ 0 ] - player.v.origin[ 0 ], ent.v.origin[ 1 ] - player.v.origin[ 1 ] );
		candidates.push( { ent, modelIndex, distance } );

	}
	// Keep every model entity that exists in the level, not a 24-nearest bubble: statues and pickups must not pop out of
	// view when the player backs away (the owner saw a corridor statue vanish with distance). MAX_VISEDICTS is the only cap.
	candidates.sort( ( a, b ) => a.distance - b.distance );
	const chosen = candidates.slice( 0, MAX_VISEDICTS );
	for ( const { ent, modelIndex } of chosen ) {

		const update = Hexen2_WriteEntityUpdate( { entity: ent.index, modelIndex, frame: ent.v.frame | 0,
			origin: ent.v.origin, angles: ent.v.angles } );
		if ( update.ok ) Hexen2_ApplyClientMessage( session.state, update.bytes );

	}
	let count = 0;
	for ( const { ent, modelIndex } of chosen ) {

		const clientEnt = cl_entities[ ent.index ];
		if ( !clientEnt || count >= MAX_VISEDICTS ) continue;
		const modelName = PR_GetString( ent.v.model );
		if ( !clientEnt.model ) clientEnt.model = cl.model_precache[ modelIndex ] ?? Mod_ForName( modelName, true );
		if ( !clientEnt.model ) continue;
		// local session: take the visible entity's transform straight from the authoritative edict
		clientEnt.origin = [ ent.v.origin[ 0 ], ent.v.origin[ 1 ], ent.v.origin[ 2 ] ];
		clientEnt.angles = [ ent.v.angles[ 0 ], ent.v.angles[ 1 ], ent.v.angles[ 2 ] ];
		clientEnt.colormap = vid.colormap; clientEnt.scale = 1;
		clientEnt.frame = ent.v.frame | 0; clientEnt.skin = ent.v.skin | 0; clientEnt.effects = ent.v.effects | 0;
		// native client: EF_ROTATE bonus items spin locally at 100 deg/s
		const spun = Hexen2_ItemRotation( clientEnt.model.flags | 0, clientEnt.origin, cl.time );
		if ( spun !== null ) clientEnt.angles = spun;
		clientEnt.alpha = 1; clientEnt.model = clientEnt.model;
		cl_visedicts[ count ++ ] = clientEnt;

	}
	set_cl_numvisedicts( count );

}


const _pendingSounds = [];
let _soundLogs = 0;
// The gamecode's sounds are written as network messages by SV_StartSound; a local session has no client parser for them,
// so the same call also feeds the mixer directly at the entity's origin.
function playLocalSound( entity, channel, sample, volume, attenuation ) {

	try { SV_StartSoundWire( entity, channel, sample, volume, attenuation ); } catch ( error ) { globalThis.__HEXEN2_LOG__?.( 'server sound failed: ' + String( error?.message ?? error ) ); }
	const sfx = S_PrecacheSound( sample );
	if ( !sfx ) return { ok: false, reason: 'the sound is not available' };
	// native clients resolve the sound entity's origin when the packet is processed, after that frame's entity movement;
	// a brush door still reports origin 0 at request time, so defer to the end of the tick and use the moved origin.
	_pendingSounds.push( { entnum: entity?.v ? entity.index : 0, channel, sfx, sample, volume, attenuation } );
	if ( _soundLogs < 8 ) { _soundLogs ++; globalThis.__HEXEN2_LOG__?.( 'sound ' + sample ); }
	return { ok: true, sfx };

}

function flushLocalSounds() {

	for ( const { sound, origin } of Hexen2_TakeSounds( _pendingSounds, pending => {

		const ent = pending.entnum > 0 ? sv.edicts[ pending.entnum ] : null;
		let model = null;
		try { model = ent?.v?.model ? Mod_ForName( PR_GetString( ent.v.model ), true ) : null; } catch { model = null; }
		return Hexen2_SoundOrigin( ent?.v?.origin, { mins: ent?.v?.absmin ?? ent?.v?.mins ?? model?.mins, maxs: ent?.v?.absmax ?? ent?.v?.maxs ?? model?.maxs } );

	} ) ) {

		const fvol = Math.max( 0, Math.min( 1, ( sound.volume | 0 ) / 255 ) );
		S_StartSound( sound.entnum, sound.channel, sound.sfx, origin, fvol, sound.attenuation );

	}

}
