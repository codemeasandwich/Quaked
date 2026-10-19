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

import { COM_AddPack, COM_FindFile } from '../common/pak.js';
import { Cmd_Init, Cbuf_Execute, Cbuf_Init } from '../common/cmd.js';
import { renderer } from '../render/vid.js';
import { set_host_frametime } from '../common/host_state.js';
import { Sys_Printf } from '../common/sys.js';
import { VID_Init, vid } from '../render/vid.js';
import { Mod_Init, Mod_ForName } from '../render/gl_model.js';
import { model_t } from '../render/gl_model_types.js';
import { set_loadmodel } from '../render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../render/gl_model_bsp.js';
import { R_Init, R_NewMap, R_RenderView, set_r_worldentity } from '../render/gl_rmain.js';
import { entity_t, r_refdef } from '../render/render.js';
import { Draw_Init, Draw_BeginFrame, Draw_CachePic, Draw_Pic, Draw_String } from '../render/gl_draw.js';
import { sv, SIGNON_SIZE } from '../server/server.js';
import { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents } from '../server/world.js';
import { SV_SetCallbacks as SV_SetPhysCallbacks, SV_Physics, SV_SetFrametime, SV_SetPlayer } from '../server/sv_phys.js';
import { SV_Move_SetCallbacks } from '../server/sv_move.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../server/sv_user.js';
import { SV_StartSound, SV_StartParticle } from '../server/sv_main.js';
import { PR_SetSV, PR_SetSVS, EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, G_FLOAT, G_FLOAT_SET, PR_GetString } from '../progs/progs.js';
import { PR_ExecuteProgram } from '../progs/pr_exec.js';
import { GetEdictFieldValue } from '../progs/pr_edict.js';
import { Hexen2_OpenLocalSession } from '../progs/hexen2_session.js';
import { Hexen2_BindClientState } from './hexen2_bind.js';
import { Hexen2_HudFromClientState } from './hexen2_clienthud.js';
import { Hexen2_StatusBarOps } from './hexen2_statusbar.js';
import { Hexen2_DrawStatusBar } from './hexen2_sbar_draw.js';
import { Hexen2_EncodeClientdata, Hexen2_EncodeUpdateInv, Hexen2_AllStatMask } from '../common/hexen2_clientdata.js';
import { Hexen2_WriteEntityUpdate } from '../common/hexen2_entitywire.js';
import { HEXEN2_SERVER_MESSAGES } from '../common/hexen2_protocol.js';
import { Hexen2_ApplyClientMessage } from './hexen2_clientstate.js';
import { cl, cls, cl_entities, cl_visedicts, set_cl_numvisedicts, MAX_VISEDICTS, SIGNONS } from './client.js';
import { CL_BaseMove, CL_InitInput, in_attack, in_forward } from './cl_input.js';
import { Key_SetBinding, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, set_key_dest, key_game, key_dest } from './keys.js';
import { V_CalcRefdef } from './view.js';
import { S_Init, S_UnlockAudio, S_PrecacheSound, S_Update, S_GetAudioContext } from '../sound/snd_dma.js';
import { IN_Init, IN_Move } from '../../platform/in_web.js';
import { R_BestiaryInputLocked } from '../../newer/ui/r_bestiary.js';

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
			entry, classId: options.classId ?? 'paladin', client, sv, svs, readFile: readNamed,
			loadMap: name => {

				const file = COM_FindFile( name );
				if ( !file ) throw new Error( 'no map ' + name );
				const map = new model_t(); map.name = name; set_loadmodel( map );
				Mod_LoadBrushModel( map, file.data.buffer.slice( file.data.byteOffset, file.data.byteOffset + file.size ) );
				return map;

			},
			installCallbacks: () => {

				SV_SetPhysCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram,
					EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, GetEdictFieldValue, SV_StartSound, SV_StartParticle } );
				SV_Move_SetCallbacks( { PF_changeyaw: () => {}, G_FLOAT, G_FLOAT_SET } );
				for ( const [ buffer, bytes ] of [ [ 'datagram', 'datagram_buf' ], [ 'reliable_datagram', 'reliable_datagram_buf' ] ] )
					if ( sv[ buffer ] && sv[ bytes ] && ! sv[ buffer ].data ) {

						sv[ buffer ].data = sv[ bytes ]; sv[ buffer ].maxsize = sv[ bytes ].length;
						sv[ buffer ].cursize = 0; sv[ buffer ].allowoverflow = true;

					}

			}
		} );
		if ( !session.ok ) throw new Error( session.reason );
		log( 'session ok, class ' + session.plan.classNumber + ', map entities ' + sv.num_edicts );
		Sys_Printf( 'Hexen II: class %i\n', session.plan.classNumber );
		cl.worldmodel = session.map; cl.model_precache = [ null, session.map ]; cl.state = 2; cl.time = 0; cl.velocity = [ 0, 0, 0 ];
		cl.paused = false; cl.intermission = false;
		R_Init();
		const worldEntity = new entity_t(); worldEntity.model = session.map; worldEntity.frame = 0; set_r_worldentity( worldEntity );
		R_NewMap();
		const charset = COM_FindFile( 'gfx/menu/conchars.lmp' );
		Draw_Init( null, charset ? new Uint8Array( charset.data.buffer, charset.data.byteOffset, charset.size ) : null );
		const bound = Hexen2_BindClientState( session.state, { cl, clEntities: cl_entities,
			modelAt: name => name.endsWith( '.mdl' ) ? Mod_ForName( name, true ) : null, viewangles: [ 0, 0, 0 ] } );
		if ( !bound.ok ) throw new Error( bound.reason );
		log( 'renderer and client bound' );
		cls.signon = SIGNONS;
		cl.stats[ 0 ] = session.hud.health; cl.stats[ 4 ] = session.hud.health;

		// sound
		S_Init(); S_UnlockAudio(); S_PrecacheSound( 'ambience/water1.wav' );

		// input: real keys and pointer lock through the platform adapter; movement through the engine's button commands
		IN_Init( options.element ?? document.body );
		CL_InitInput();
		Key_SetBinding( K_UPARROW, '+forward' ); Key_SetBinding( K_DOWNARROW, '+back' );
		Key_SetBinding( K_LEFTARROW, '+left' ); Key_SetBinding( K_RIGHTARROW, '+right' );
		sv.active = true;
		SV_SetPlayer( session.player );
		SV_User_SetCallbacks( { host_client: client, get_key_dest: () => key_game, V_CalcRoll: () => 0 } );

		const resize = () => {

			const width = Math.max( 320, window.innerWidth || 1280 ), height = Math.max( 240, window.innerHeight || 800 );
			vid.width = width; vid.height = height; vid.conwidth = width; vid.conheight = height; vid.rowbytes = width;
			renderer.setSize( width, height, false );
			const canvas = renderer.domElement;
			canvas.style.position = 'fixed'; canvas.style.left = '0'; canvas.style.top = '0';
			canvas.style.width = '100vw'; canvas.style.height = '100vh';
			r_refdef.vrect.x = 0; r_refdef.vrect.y = 0; r_refdef.vrect.width = width; r_refdef.vrect.height = height;
			r_refdef.vrectScale = 1; r_refdef.fov_x = 90;
			r_refdef.fov_y = 2 * Math.atan( Math.tan( Math.PI / 4 ) * height / width ) * 180 / Math.PI;

		};
		renderer.domElement.addEventListener( 'click', () => { S_UnlockAudio(); renderer.domElement.requestPointerLock?.(); } );
		window.addEventListener( 'resize', resize );
		resize();
		let last = performance.now();
		let attacking = false;
		let frameCount = 0;
		const frame = now => {

			try {

				const dt = Math.min( 0.1, Math.max( 0.01, ( now - last ) / 1000 ) );
				last = now;
				set_host_frametime( dt );
				SV_SetFrametime( dt );
				Cbuf_Execute();
				const command = { forwardmove: 0, sidemove: 0, upmove: 0, viewangles: cl.viewangles };
				CL_BaseMove( command );
				IN_Move( command );
				SV_User_SetCommand( { forwardmove: command.forwardmove, sidemove: command.sidemove,
					upmove: command.upmove, viewangles: command.viewangles } );
				SV_ClientThink();
				attacking = ( in_attack.state & 1 ) !== 0;
				session.player.v.button0 = attacking ? 1 : 0;
				SV_Physics();
				applyPlayerMessages( session );
				cl_entities[ session.player.index ].origin = [ session.player.v.origin[ 0 ], session.player.v.origin[ 1 ], session.player.v.origin[ 2 ] ];
				updateNearbyEntities( session );
				V_CalcRefdef();
				R_RenderView();
				Draw_BeginFrame();
				const hud = Hexen2_HudFromClientState( session.state );
				Hexen2_DrawStatusBar( Hexen2_StatusBarOps( hud ), {
					pic: ( name, x, y ) => { const pic = Draw_CachePic( name ); if ( !pic ) return false; Draw_Pic( x, y, pic ); return true; },
					num: ( value, digits, x, y ) => Draw_String( x, y, String( value ).padStart( digits, '0' ) ),
					small: ( text, x, y ) => Draw_String( x, y, text )
				} );
				const context = S_GetAudioContext();
				if ( context && context.state === 'running' ) S_Update( session.player.v.origin, [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] );
				frameCount ++;
				if ( frameCount === 1 ) log( 'first frame rendered calls=' + ( renderer.info.render.calls | 0 ) + ' tris=' + ( renderer.info.render.triangles | 0 ) );
				options.onFrame?.( session, { frames: frameCount, position: [ session.player.v.origin[ 0 ], session.player.v.origin[ 1 ], session.player.v.origin[ 2 ] ], health: session.player.v.health } );

			} catch ( error ) {

				log( 'frame error: ' + String( error?.stack ?? error ) );

			}
			requestAnimationFrame( frame );

		};
		requestAnimationFrame( frame );
		frame( performance.now() ); // draw now: a backgrounded WebView may not deliver rAF
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
		if ( distance > 1700 || distance < 96 ) continue;
		candidates.push( { ent, modelIndex, distance } );

	}
	candidates.sort( ( a, b ) => a.distance - b.distance );
	const chosen = candidates.slice( 0, 24 );
	for ( const { ent, modelIndex } of chosen ) {

		const update = Hexen2_WriteEntityUpdate( { entity: ent.index, modelIndex, frame: ent.v.frame | 0,
			origin: ent.v.origin, angles: ent.v.angles } );
		if ( update.ok ) Hexen2_ApplyClientMessage( session.state, update.bytes );

	}
	let count = 0;
	for ( const { ent } of chosen ) {

		const clientEnt = cl_entities[ ent.index ];
		if ( !clientEnt || !clientEnt.model || count >= MAX_VISEDICTS ) continue;
		clientEnt.colormap = vid.colormap; clientEnt.scale = 1; clientEnt.frame = ent.v.frame | 0;
		cl_visedicts[ count ++ ] = clientEnt;

	}
	set_cl_numvisedicts( count );

}
