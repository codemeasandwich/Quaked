// The existing renderer accepts the supplied Hexen II world: the lightmap/mesh build path runs on demo1.bsp without
// WebGL drawing, producing lightmapped surfaces, lightmap atlases and world batches, and the PVS at the player start
// reaches visible leaves. plan section 5/7; G1 presentation prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_PointInLeaf, Mod_LeafPVS } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { GL_BuildLightmaps, lightmapTextures, R_DrawWorld } from '../src/engine/render/gl_rsurf.js';
import { R_MarkLeaves } from '../src/engine/render/gl_rsurf_batches.js';
import { r_visframecount, set_r_viewleaf, set_r_oldviewleaf, set_r_worldentity } from '../src/engine/render/gl_rmain.js';
import { r_refdef, entity_t } from '../src/engine/render/render.js';
import { worldState } from '../src/engine/render/gl_rsurf_state.js';
import { cl } from '../src/engine/client/client.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the renderer builds the Hexen II world: lightmaps, atlases, batches and PVS', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	Mod_SetHexenHullLayout( true );
	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );
	Mod_SetHexenHullLayout( false );

	cl.worldmodel = map;
	cl.model_precache = [ map, map ];
	cl.state = 2;
	let error = null;
	try { GL_BuildLightmaps(); } catch ( e ) { error = e; }
	check( error === null, 'the lightmap/mesh build ran: ' + ( error ? error.message : '' ) );
	same( map.numsubmodels, 100, 'the world has its 100 submodels' );
	check( map.surfaces.length > 4000, 'the world has surfaces: ' + map.surfaces.length );
	let lit = 0;
	for ( const surface of map.surfaces ) if ( surface.light_t >= 0 ) lit ++;
	same( lit, map.surfaces.length, 'every surface received a lightmap coordinate' );
	check( lightmapTextures.length > 0, 'lightmap atlases were built: ' + lightmapTextures.length );
	check( worldState.group.children.length > 0, 'world batches were built: ' + worldState.group.children.length );

	// the PVS at the map's player start reaches visible leaves (the renderer's visibility data is usable)
	const entityText = map.entities;
	let spawn = null;
	for ( const block of entityText.split( '}' ) ) {

		if ( ! block.includes( 'info_player_start' ) ) continue;
		const match = /"origin"\s+"([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)"/.exec( block );
		if ( match ) { spawn = [ Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ]; break; }

	}
	check( spawn !== null, 'the level has a player start' );
	const leaf = Mod_PointInLeaf( new Float32Array( spawn ), map );
	check( leaf !== null && leaf !== undefined, 'the player start is in a leaf' );
	const pvs = Mod_LeafPVS( leaf, map );
	let visible = 0;
	for ( const byte of pvs ) for ( let bit = 0; bit < 8; bit ++ ) if ( byte & ( 1 << bit ) ) visible ++;
	check( visible > 0, 'the PVS marks visible leaves: ' + visible );

	// prepare one world frame from the Paladin's eye: mark leaves, walk the BSP and update the batch visibility
	set_r_worldentity( new entity_t() );
	r_refdef.vieworg = new Float32Array( [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] + 50 ] );
	r_refdef.viewangles = new Float32Array( [ 0, 0, 0 ] );
	const viewLeaf = Mod_PointInLeaf( r_refdef.vieworg, map );
	check( viewLeaf !== null && viewLeaf !== undefined, 'the eye is in a leaf' );
	set_r_viewleaf( viewLeaf );
	set_r_oldviewleaf( null );
	R_MarkLeaves();
	error = null;
	try { R_DrawWorld(); } catch ( e ) { error = e; }
	check( error === null, 'the world frame was prepared: ' + ( error ? error.message : '' ) );
	let marked = 0;
	for ( const surface of map.surfaces ) if ( surface.visframe === r_visframecount ) marked ++;
	check( marked > 0, 'the frame marks its visible surfaces: ' + marked );
	const visibleChildren = worldState.group.children.filter( child => child.visible ).length;
	check( visibleChildren > 0, 'some world batches are visible: ' + visibleChildren );

} );
