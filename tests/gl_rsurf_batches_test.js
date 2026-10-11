// The world renderer's batches stage on its own (card [44i]): E1M1's world built into batched meshes at a map load,
// the potentially visible set from a leaf showing only some of their instances, and a reflection probe's "show all"
// and back. Through the public interface of gl_rsurf_batches.js (the map loaded by gl_rsurf.js's GL_BuildLightmaps),
// on the shareware pack's real map.
import { readFileSync } from 'node:fs';
import * as batches from '../src/engine/render/gl_rsurf_batches.js';
import { GL_BuildLightmaps } from '../src/engine/render/gl_rsurf.js';
import { worldState } from '../src/engine/render/gl_rsurf_state.js';
import { set_r_viewleaf, set_r_oldviewleaf, d_lightstylevalue } from '../src/engine/render/gl_rmain.js';
import { cl } from '../src/engine/client/client.js';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, Mod_PointInLeaf } from '../src/engine/render/gl_model.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();

// every batch's instances, as [visible, total]
function shown() {
	let visible = 0, total = 0;
	for ( const b of worldState.group.children ) if ( b.isBatchedMesh ) for ( let i = 0; i < b.instanceCount; i ++ ) { total ++; if ( b.getVisibleAt( i ) ) visible ++; }
	return [ visible, total ];
}

Deno.test( 'E1M1\'s world is batched by texture and atlas, and the view\'s leaf shows only what it can see', () => {
	const saved = { world: cl.worldmodel, models: cl.model_precache.slice() }; d_lightstylevalue.fill( 256 );
	try {
		const world = Mod_ForName( 'maps/e1m1.bsp', true );
		cl.worldmodel = world; cl.model_precache.fill( null ); cl.model_precache[ 1 ] = world;
		GL_BuildLightmaps();
		const meshes = worldState.group.children.filter( o => o.isBatchedMesh );
		check( meshes.length > 20 && meshes.every( m => /^world_.+_lm\d+$/.test( m.name ) ), 'a batch per texture and atlas (' + meshes.length + ')' );
		const view = ( origin ) => { set_r_viewleaf( Mod_PointInLeaf( origin, world ) ); set_r_oldviewleaf( null ); batches.R_MarkLeaves(); batches.R_UpdateWorldVisibility(); return shown(); };
		const [ atStart, total ] = view( [ 480, - 352, 110 ] );
		check( total > 1000 && atStart > 0 && atStart < total, 'from the start, some of the world (' + atStart + ' of ' + total + ')' );
		const [ outside ] = view( [ 160, 3044, 0 ] );
		check( outside > 0 && outside !== atStart, 'elsewhere, another part (' + outside + ')' );
		batches.R_WorldShowAll( true );
		check( shown()[ 0 ] === total, 'a probe sees it all' );
		batches.R_WorldShowAll( false );
		check( shown()[ 0 ] === outside, 'and the view\'s own set comes back' );
		batches.R_WorldBatchesClear();
		check( worldState.group.children.filter( o => o.isBatchedMesh ).length === 0, 'a map load throws the batches away' );
	} finally { cl.worldmodel = saved.world; saved.models.forEach( ( m, i ) => { cl.model_precache[ i ] = m; } ); }
} );

// card [END1]: a teleporter window that follows a moving train sees from a new leaf though the viewer has not moved;
// R_MarkLeaves must mark again then, or the window's world goes missing
Deno.test( 'R_MarkLeaves marks again when a portal window comes to see from another leaf, the viewer standing still', async () => {
	const rmain = await import( '../src/engine/render/gl_rmain.js' );
	const portal = await import( '../src/newer/render/gl_portal.js' );
	const saved = { world: cl.worldmodel, models: cl.model_precache.slice() }; d_lightstylevalue.fill( 256 );
	try {
		const world = Mod_ForName( 'maps/e1m1.bsp', true );
		cl.worldmodel = world; cl.model_precache.fill( null ); cl.model_precache[ 1 ] = world;
		GL_BuildLightmaps();
		set_r_viewleaf( Mod_PointInLeaf( [ 480, - 352, 110 ], world ) ); set_r_oldviewleaf( null );
		batches.R_MarkLeaves();
		const marked = rmain.r_visframecount;
		batches.R_MarkLeaves();
		check( rmain.r_visframecount === marked, 'the viewer still and nothing else changed: no new marking' );
		// a window's receiver now sees from another leaf (any portal build or follow step does: R_PortalsVisRevision)
		const leaf = { contents: - 1, visframe: 0, firstmarksurface: null, nummarksurfaces: 0, compressed_vis: null };
		const surface = { flags: 0x10, plane: { normal: new Float32Array( [ 1, 0, 0 ] ), dist: 100 }, texinfo: { texture: { name: '*teleport' } },
			polys: { numverts: 4, verts: [ [ 100, - 32, 0, 0, 0 ], [ 100, 32, 0, 1, 0 ], [ 100, 32, 112, 1, 1 ], [ 100, - 32, 112, 0, 1 ] ], next: null } };
		const before = portal.R_PortalsVisRevision();
		portal.R_BuildPortals( { entities: '{\n"classname" "worldspawn"\n}\n{\n"classname" "trigger_teleport"\n"target" "t1"\n"model" "*1"\n}\n{\n"classname" "info_teleport_destination"\n"targetname" "t1"\n"origin" "0 0 0"\n}\n',
			surfaces: [ surface ], firstmodelsurface: 0, nummodelsurfaces: 1, submodels: [ { mins: [ - 4096, - 4096, - 4096 ], maxs: [ 4096, 4096, 4096 ] }, { mins: [ 90, - 40, - 8 ], maxs: [ 110, 40, 120 ] } ],
			nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ], numleafs: 1 } );
		check( portal.R_PortalsVisRevision() !== before, '(a window came to see from a leaf)' );
		batches.R_MarkLeaves();
		check( rmain.r_visframecount !== marked, 'R_MarkLeaves marked again, the viewer not having moved' );
		portal.R_ClearPortals();
	} finally { cl.worldmodel = saved.world; cl.model_precache.splice( 0, saved.models.length, ...saved.models ); }
} );
