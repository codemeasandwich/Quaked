// A local browser harness that mounts the supplied Hexen II level with the supplied Installed gamecode, binds the
// Paladin view, renders one WebGL frame with the port's renderer and draws the native status bar on the 2D overlay.
// It is a trial page, not the public product; the owner data is served explicitly by serve.mjs.
import { COM_AddPack, COM_LoadPackFile, COM_FindFile, COM_LoadFile } from '../../src/engine/common/pak.js';
import { W_LoadWadFile } from '../../src/engine/common/wad.js';
import { VID_Init } from '../../src/engine/render/vid.js';
import { Mod_Init } from '../../src/engine/render/gl_model.js';
import { model_t } from '../../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../../src/engine/render/gl_model_bsp.js';
import { sv as serverSv, SIGNON_SIZE } from '../../src/engine/server/server.js';
import { sv as progsSv, svs as progsSvs, PR_SetSV, PR_SetSVS } from '../../src/engine/progs/progs.js';
import { Hexen2_OpenLocalSession } from '../../src/engine/progs/hexen2_session.js';
import { Hexen2_BindClientState } from '../../src/engine/client/hexen2_bind.js';
import { cl, cl_entities } from '../../src/engine/client/client.js';
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

await import( '../../src/newer/install.js' ); // engine hooks (axe reset etc.) must install before the gamecode loads

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
	const session = Hexen2_OpenLocalSession( {
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
	const bound = Hexen2_BindClientState( session.state, { cl, clEntities: cl_entities,
		modelAt: name => COM_FindFile( name ) ? null : null, viewangles: [ 0, 90, 0 ] } );
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
	// keep presenting the frame while the trial takes its screenshot
	const drawFrame = () => { try {

		V_CalcRefdef();
		R_RenderView();
		const gl = renderer.getContext(), canvas = renderer.domElement, px = new Uint8Array( 4 );
		gl.readPixels( Math.floor( canvas.width / 2 ), Math.floor( canvas.height / 2 ), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px );
		result.pixel = Array.from( px );
		result.canvases = Array.from( document.querySelectorAll( 'canvas' ) ).map( c => ( { w: c.width, h: c.height, display: getComputedStyle( c ).display } ) );

	} catch ( error ) { result.errors.push( String( error ) ); } requestAnimationFrame( drawFrame ); };
	requestAnimationFrame( drawFrame );
	result.ok = true;

} catch ( error ) {

	result.errors.push( String( error && error.stack || error ) );

}

function r_refdefEye() {

	// the renderer's eye, for the receipt
	return [ 0, 0, 0 ];

}
