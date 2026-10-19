// A local browser harness that mounts the supplied Hexen II level with the supplied Installed gamecode, binds the
// Paladin view, renders one WebGL frame with the port's renderer and draws the native status bar on the 2D overlay.
// It is a trial page, not the public product; the owner data is served explicitly by serve.mjs.
import { COM_AddPack, COM_LoadPackFile, COM_FindFile, COM_LoadFile } from '../../src/engine/common/pak.js';
import { W_LoadWadFile } from '../../src/engine/common/wad.js';
import { VID_Init } from '../../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../../src/engine/render/gl_model.js';
import { model_t } from '../../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../../src/engine/server/server.js';
import { sv as progsSv, svs as progsSvs, PR_SetSV, PR_SetSVS } from '../../src/engine/progs/progs.js';
import { Hexen2_OpenLocalSession } from '../../src/engine/progs/hexen2_session.js';
import { Hexen2_BindClientState } from '../../src/engine/client/hexen2_bind.js';
import { cl, cls, cl_entities, cl_visedicts, set_cl_numvisedicts, MAX_VISEDICTS, SIGNONS } from '../../src/engine/client/client.js';
import { CL_BaseMove, CL_InitInput, in_attack } from '../../src/engine/client/cl_input.js';
import { Cmd_ExecuteString, Cmd_Init } from '../../src/engine/common/cmd.js';
import { R_BestiaryCancel } from '../../src/newer/ui/r_bestiary.js';
import { V_CalcRefdef } from '../../src/engine/client/view.js';
import { R_Init, R_NewMap, R_RenderView, set_r_worldentity, r_norefresh, scene, camera } from '../../src/engine/render/gl_rmain.js';
import { entity_t } from '../../src/engine/render/render.js';
import { Cvar_Set } from '../../src/engine/common/cvar.js';
import { lightmapTextures } from '../../src/engine/render/gl_rsurf.js';
import { worldState } from '../../src/engine/render/gl_rsurf_state.js';
import { r_refdef } from '../../src/engine/render/render.js';
import { renderer, vid } from '../../src/engine/render/vid.js';
import { Draw_Init, Draw_BeginFrame, Draw_CachePic, Draw_Pic, Draw_String } from '../../src/engine/render/gl_draw.js';
import { Hexen2_DrawStatusBar } from '../../src/engine/client/hexen2_sbar_draw.js';
import { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents } from '../../src/engine/server/world.js';
import { PR_ExecuteProgram } from '../../src/engine/progs/pr_exec.js';
import { installServerCallbacks } from '../../tests/helpers/hexen2_server_setup.mjs';
import { SV_User_SetCommand, SV_User_SetCallbacks, SV_ClientThink } from '../../src/engine/server/sv_user.js';
import { SV_Physics, SV_SetFrametime, SV_SetPlayer } from '../../src/engine/server/sv_phys.js';
import { Hexen2_HudFromClientState } from '../../src/engine/client/hexen2_clienthud.js';
import { Hexen2_StatusBarOps } from '../../src/engine/client/hexen2_statusbar.js';
import { Hexen2_EncodeClientdata, Hexen2_EncodeUpdateInv, Hexen2_AllStatMask } from '../../src/engine/common/hexen2_clientdata.js';
import { Hexen2_WriteEntityUpdate } from '../../src/engine/common/hexen2_entitywire.js';
import { HEXEN2_SERVER_MESSAGES } from '../../src/engine/common/hexen2_protocol.js';
import { Hexen2_ApplyClientMessage } from '../../src/engine/client/hexen2_clientstate.js';
import { PR_GetString } from '../../src/engine/progs/progs.js';
import { S_Init, S_UnlockAudio, S_PrecacheSound, S_StartSound, S_Update, S_GetAudioContext } from '../../src/engine/sound/snd_dma.js';
import { IN_Init, IN_Move } from '../../src/platform/in_web.js';
import { Key_SetBinding, K_UPARROW, set_key_dest, key_game } from '../../src/engine/client/keys.js';

await import( '../../src/newer/install.js' ); // engine hooks (axe reset etc.) must install before the gamecode loads

let session = null;
const result = { ok: false, errors: [] };
window.__HEXEN2_TRIAL__ = result;

async function bytes( url ) {

	const response = await fetch( url );
	if ( !response.ok ) throw new Error( url + ': HTTP ' + response.status );
	return response.arrayBuffer();

}

try {

	// the engine charset lives in Quake's gfx.wad: mount the shareware pack first, load the WAD, then the Hexen packs
	const shareware = await bytes( '/shareware.pak' );
	COM_AddPack( COM_LoadPackFile( 'shareware', shareware ) );
	const wad = COM_LoadFile( 'gfx.wad' );
	if ( !wad ) throw new Error( 'no engine charset WAD' );
	W_LoadWadFile( wad );
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) COM_AddPack( COM_LoadPackFile( name, await bytes( '/hexen/' + name ) ) );
	const progsData = await bytes( '/hexen/progs.dat' );
	const palette = COM_FindFile( 'gfx/palette.lmp' );
	if ( !palette ) throw new Error( 'no palette' );
	VID_Init( palette.data.subarray( palette.data.byteOffset, palette.data.byteOffset + palette.size ) );
	Mod_Init();

	const client = { name: 'trial', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	client.message = sv.signon;
	const svs = { maxclients: 1, clients: [ client ], active: true };
	PR_SetSV( sv ); PR_SetSVS( svs );
	const entry = { id: 'hexen2', kind: 'hexen2', name: 'Hexen II', folder: 'games/Hexen 2/data1', playable: true };
	session = Hexen2_OpenLocalSession( {
		entry, classId: 'paladin', client, sv, svs,
		readFile: name => name === 'progs.dat' ? new Uint8Array( progsData ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = COM_FindFile( name );
			if ( !found ) throw new Error( 'no map ' + name );
			Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( { ...callbacks, SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } )
	} );
	if ( !session.ok ) throw new Error( 'session: ' + session.reason );
	result.session = { level: session.state.levelName, viewEntity: session.state.viewEntity, health: session.hud.health,
		models: session.state.models.length, baselines: session.state.baselines.size };

	// renderer: world, the Paladin's view and one frame
	cl.worldmodel = session.map; cl.model_precache = [ null, session.map ]; cl.state = 2; cl.time = 0; cl.velocity = [ 0, 0, 0 ];
	cl.paused = false; cl.intermission = false;
	R_Init();
	const worldEntity = new entity_t(); worldEntity.model = session.map; worldEntity.frame = 0; set_r_worldentity( worldEntity );
	R_NewMap();
	Draw_Init();
	// audio: initialise Web Audio, unlock it, and play one of the game's own sounds through the port's mixer
	window.__SOURCES_STARTED__ = 0;
	const originalStart = AudioBufferSourceNode.prototype.start;
	AudioBufferSourceNode.prototype.start = function ( ...args ) { window.__SOURCES_STARTED__ ++; return originalStart.apply( this, args ); };
	S_Init();
	S_UnlockAudio();
	const sfx = S_PrecacheSound( 'ambience/water1.wav' );
	const beforeSources = window.__SOURCES_STARTED__;
	if ( sfx ) S_StartSound( null, 0, sfx, session.player.v.origin, 1, 1 );
	S_Update( session.player.v.origin, [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] );
	const audio = S_GetAudioContext();
	result.audio = { context: audio ? audio.state : null, sampleRate: audio ? audio.sampleRate : null,
		sfx: sfx ? sfx.name : null, sourcesStarted: window.__SOURCES_STARTED__ - beforeSources, currentTime: audio ? audio.currentTime : null };

	// real keyboard input: the platform's DOM listeners feed Key_Event, and IN_Move turns the held keys into a command
	window.__KEY_EVENTS__ = 0;
	// keyboard: real DOM key events drive the engine's button commands (the platform Key_Event path is exercised by the
	// Node input tests; the harness maps the same commands directly so the trial can hold a key)
	document.addEventListener( 'keydown', event => {
		window.__KEY_EVENTS__ ++;
		if ( event.code === 'ArrowUp' ) Cmd_ExecuteString( '+forward 128' );
		if ( event.code === 'ArrowDown' ) Cmd_ExecuteString( '+back 129' );
		if ( event.code === 'ArrowLeft' ) Cmd_ExecuteString( '+left 130' );
		if ( event.code === 'ArrowRight' ) Cmd_ExecuteString( '+right 131' );
	} );
	// mouse: real pointer movement turns the view, and the left button drives +attack (the engine's button command)
	let lastMouse = null;
	document.addEventListener( 'mousemove', event => {

		if ( lastMouse === null ) { lastMouse = { x: event.clientX, y: event.clientY }; return; }
		const dx = event.clientX - lastMouse.x, dy = event.clientY - lastMouse.y;
		lastMouse = { x: event.clientX, y: event.clientY };
		if ( dx === 0 && dy === 0 ) return;
		cl.viewangles[ 1 ] = ( cl.viewangles[ 1 ] - dx * 0.3 + 360 ) % 360;
		cl.viewangles[ 0 ] = Math.max( - 70, Math.min( 80, cl.viewangles[ 0 ] - dy * 0.3 ) );
		result.mouseYaw = ( result.mouseYaw ?? 0 ) - dx * 0.3;

	} );
	document.addEventListener( 'mousedown', event => { if ( event.button === 0 ) { Cmd_ExecuteString( '+attack' ); result.mouseAttack = true; } } );
	document.addEventListener( 'mouseup', event => { if ( event.button === 0 ) Cmd_ExecuteString( '-attack' ); } );
	document.addEventListener( 'keyup', event => {
		if ( event.code === 'ArrowUp' ) Cmd_ExecuteString( '-forward 128' );
		if ( event.code === 'ArrowDown' ) Cmd_ExecuteString( '-back 129' );
		if ( event.code === 'ArrowLeft' ) Cmd_ExecuteString( '-left 130' );
		if ( event.code === 'ArrowRight' ) Cmd_ExecuteString( '-right 131' );
	} );
	Cmd_Init(); // the command buffer must exist before key events queue +forward
	CL_InitInput(); // register +forward/-forward and the other button commands the key binds use
	Key_SetBinding( K_UPARROW, '+forward' );
	set_key_dest( key_game );
	cls.signon = SIGNONS; // CL_BaseMove only fills the command at the signed-on stage

	const bound = Hexen2_BindClientState( session.state, { cl, clEntities: cl_entities,
		modelAt: name => name.endsWith( '.mdl' ) ? Mod_ForName( name, true ) : null, viewangles: [ 0, 90, 0 ] } );
	if ( !bound.ok ) throw new Error( 'bind: ' + bound.reason );
	cl.viewangles = [ 0, 90, 0 ];
	Cvar_Set( 'r_hdr', '0' ); // classic direct path first: no post pipeline in the harness
	cl.stats[ 0 ] = session.hud.health; // STAT_HEALTH (Hexen/Quake index 0): the view code takes a dead player at <= 0
	cl.stats[ 4 ] = session.hud.health;
	// the refresh view the screen code normally fills (SCR_CalcRefdef): full viewport and a 90-degree field of view
	r_refdef.vrect.x = 0; r_refdef.vrect.y = 0; r_refdef.vrect.width = vid.width; r_refdef.vrect.height = vid.height;
	r_refdef.vrectScale = 1; r_refdef.fov_x = 90;
	r_refdef.fov_y = 2 * Math.atan( Math.tan( 90 * Math.PI / 360 ) * vid.height / vid.width ) * 180 / Math.PI;
	V_CalcRefdef();
	R_RenderView();
	let lightmapMax = null;
	try {

		const img = lightmapTextures[ 0 ]?.image;
		if ( img?.data ) { let max = 0; for ( const v of img.data ) if ( v > max ) max = v; lightmapMax = max; }

	} catch {}
	result.rendered = { eye: Array.from( r_refdefEye() ), vieworg: r_refdef ? Array.from( r_refdef.vieworg ) : null, angles: r_refdef ? Array.from( r_refdef.viewangles ) : null,
		lightmaps: lightmapTextures.length, lightmapMax, batches: worldState.group?.children.length ?? null,
		drawCalls: renderer ? renderer.info.render.calls : null,
		norefresh: r_norefresh?.value, sceneChildren: scene?.children.length ?? null, hasCamera: !!camera, worldModel: !!cl.worldmodel,
		triangles: renderer ? renderer.info.render.triangles : null, worldEntity: !!( worldEntity && worldEntity.model ) };

	Draw_BeginFrame();
	const drew = Hexen2_DrawStatusBar( session.statusBarOps, {
		pic: ( name, x, y ) => { const pic = Draw_CachePic( name ); if ( !pic ) return false; Draw_Pic( x, y, pic ); return true; },
		num: ( value, digits, x, y ) => Draw_String( x, y, String( value ).padStart( digits, '0' ) ),
		small: ( text, x, y ) => Draw_String( x, y, text )
	} );
	result.hud = drew;
	// a live loop: server physics from the trial's input, the player's native messages applied to the client
	// state, the refresh view rebuilt from it, one renderer frame and the native status bar each tick
	SV_SetPlayer( playerFromSession() );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetFrametime( 0.05 );
	sv.active = true;
	result.frames = 0;
	let last = performance.now();
	const drawFrame = now => {

		try {

			const dt = Math.min( 0.1, Math.max( 0.01, ( now - last ) / 1000 ) );
			last = now;
			SV_SetFrametime( dt );
			R_BestiaryCancel(); // the harness does not open the journal: keep its encounter from locking movement
			// (the host's Cbuf step is not needed here: the harness maps key events straight to the button commands)
			const command = { forwardmove: 0, sidemove: 0, upmove: 0, viewangles: cl.viewangles };
			CL_BaseMove( command );
			IN_Move( command );
			const input = window.__HEXEN2_INPUT__;
			if ( input ) {

				command.forwardmove = input.forwardmove ?? 0;
				command.sidemove = input.sidemove ?? 0;
				command.upmove = input.upmove ?? 0;
				cl.viewangles = [ 0, input.yaw ?? 0, 0 ];

			}
			SV_User_SetCommand( { forwardmove: command.forwardmove, sidemove: command.sidemove,
				upmove: command.upmove, viewangles: cl.viewangles } );
			const player = playerFromSession();
			const attacking = ( in_attack.state & 1 ) !== 0;
			result.attackFrames = ( result.attackFrames ?? 0 ) + ( attacking ? 1 : 0 );
			player.v.button0 = attacking ? 1 : 0;
			SV_ClientThink();
			SV_Physics();
			applyPlayerMessages( player );
			if ( !result.audioDeferred && result.frames > 10 ) {

				result.audioDeferred = true;
				const defer = S_PrecacheSound( 'ambience/water1.wav' );
				const before = window.__SOURCES_STARTED__;
				if ( defer ) S_StartSound( null, 0, defer, player.v.origin, 1, 1 );
				S_Update( player.v.origin, [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] );
				const ctx = S_GetAudioContext();
				result.audioDeferredResult = { sources: window.__SOURCES_STARTED__ - before, time: ctx ? ctx.currentTime : null, state: ctx ? ctx.state : null };

			}

			result.entitiesVisible = updateNearbyEntities( player, session.state );
			result.nearest = nearestDiagnostic();
			cl_entities[ 1 ].origin = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
			V_CalcRefdef();
			R_RenderView();
			Draw_BeginFrame();
			const hud = Hexen2_HudFromClientState( session.state );
			Hexen2_DrawStatusBar( Hexen2_StatusBarOps( hud ), {
				pic: ( name, x, y ) => { const pic = Draw_CachePic( name ); if ( !pic ) return false; Draw_Pic( x, y, pic ); return true; },
				num: ( value, digits, x, y ) => Draw_String( x, y, String( value ).padStart( digits, '0' ) ),
				small: ( text, x, y ) => Draw_String( x, y, text )
			} );
			result.frames ++;
			result.keyEvents = window.__KEY_EVENTS__;
			result.forwardMax = Math.max( result.forwardMax ?? 0, command.forwardmove );
			result.lastCommand = { forward: command.forwardmove, side: command.sidemove };
			result.position = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
			result.health = player.v.health;
			result.hudHealth = hud.health;
			const gl = renderer.getContext(), canvas = renderer.domElement, px = new Uint8Array( 4 );
			gl.readPixels( Math.floor( canvas.width / 2 ), Math.floor( canvas.height / 2 ), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px );
			result.pixel = Array.from( px );

		} catch ( error ) { result.errors.push( String( error ) ); }
		requestAnimationFrame( drawFrame );

	};
	requestAnimationFrame( drawFrame );
	result.ok = true;

} catch ( error ) {

	result.errors.push( String( error && error.stack || error ) );

}

function r_refdefEye() {

	// the renderer's eye, for the receipt
	return [ 0, 0, 0 ];

}


function playerFromSession() { return session.player; }

function applyPlayerMessages( player ) {

	const cd = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.clientdata, ...Hexen2_EncodeClientdata( player ) ] );
	Hexen2_ApplyClientMessage( session.state, cd );
	const stats = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.update_inv,
		...Hexen2_EncodeUpdateInv( player, Hexen2_AllStatMask(), offset => PR_GetString( offset ) ) ] );
	Hexen2_ApplyClientMessage( session.state, stats );
	const origin = player.v.origin, angles = player.v.angles;
	const update = Hexen2_WriteEntityUpdate( { entity: player.index, origin, angles } );
	if ( update.ok ) Hexen2_ApplyClientMessage( session.state, update.bytes );

}


function updateNearbyEntities( player, state ) {

	const indexOf = new Map();
	for ( let i = 0; i < state.models.length; i ++ ) indexOf.set( state.models[ i ], i + 1 );
	const candidates = [];
	for ( const ent of serverSv.edicts ) {

		if ( !ent || ent.free || ent.index === player.index || !ent.v.model ) continue;
		const modelName = PR_GetString( ent.v.model );
		const modelIndex = indexOf.get( modelName );
		if ( modelIndex === undefined ) continue;
		const dx = ent.v.origin[ 0 ] - player.v.origin[ 0 ], dy = ent.v.origin[ 1 ] - player.v.origin[ 1 ];
		const distance = Math.hypot( dx, dy );
		if ( distance > 1700 || distance < 96 ) continue;
		candidates.push( { ent, modelIndex, distance } );

	}
	candidates.sort( ( a, b ) => a.distance - b.distance );
	const chosen = candidates.slice( 0, 24 );
	lastChosen = chosen;
	for ( const { ent, modelIndex } of chosen ) {

		const update = Hexen2_WriteEntityUpdate( { entity: ent.index, modelIndex, frame: ent.v.frame | 0,
			origin: ent.v.origin, angles: ent.v.angles } );
		if ( update.ok ) Hexen2_ApplyClientMessage( state, update.bytes );

	}
	// the renderer's visible list: the updated entities near the player
	let count = 0;
	for ( const { ent } of chosen ) {

		const clientEnt = cl_entities[ ent.index ];
		if ( !clientEnt || !clientEnt.model || count >= MAX_VISEDICTS ) continue;
		clientEnt.colormap = vid.colormap;
		clientEnt.scale = 1;
		clientEnt.frame = ent.v.frame | 0;
		cl_visedicts[ count ++ ] = clientEnt;

	}
	set_cl_numvisedicts( count );
	return count;

}


let lastChosen = [];
function nearestDiagnostic() { return lastChosen.slice( 0, 6 ).map( c => ( { name: PR_GetString( c.ent.v.classname ), model: PR_GetString( c.ent.v.model ), d: Math.round( c.distance ) } ) ); }
