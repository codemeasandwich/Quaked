// The world renderer's brush stage on its own (card [44i]): E1M1's first door drawn as a group of meshes kept on its
// entity, taken out of the scene at the next frame but kept, and thrown away at a map load. Through the public
// interface of gl_rsurf_brush.js (the map loaded by gl_rsurf.js's GL_BuildLightmaps), on the shareware pack's E1M1.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as brush from '../src/engine/render/gl_rsurf_brush.js';
import { GL_BuildLightmaps } from '../src/engine/render/gl_rsurf.js';
import { d_lightstylevalue } from '../src/engine/render/gl_rmain.js';
import { cl } from '../src/engine/client/client.js';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();

Deno.test( 'a door is a group kept on its entity: out of the scene each frame, gone at a map load', () => {
	const saved = { world: cl.worldmodel, models: cl.model_precache.slice() }; d_lightstylevalue.fill( 256 );
	try {
		const map = Mod_ForName( 'maps/e1m1.bsp', true ), door = Mod_ForName( '*1', false );
		cl.worldmodel = map; cl.model_precache.fill( null ); cl.model_precache[ 1 ] = map; cl.model_precache[ 2 ] = door;
		GL_BuildLightmaps();
		check( door && door.nummodelsurfaces > 0, 'E1M1\'s first inline model (' + door?.nummodelsurfaces + ' surfaces)' );
		const entity = { origin: new Float32Array( 3 ), angles: new Float32Array( 3 ), frame: 0, model: door };
		brush.R_DrawBrushModel( entity );
		const group = entity._brushGroup;
		check( group && group.children.length > 0 && group.children.every( m => m.isMesh ), 'a group of meshes (' + group?.children.length + ')' );
		const scene = new THREE.Scene(); scene.add( group );
		brush.R_BrushBeginFrame();
		check( group.parent === null && entity._brushGroup === group, 'the next frame takes it out of the scene and keeps it' );
		brush.R_DrawBrushModel( entity );
		check( entity._brushGroup === group, 'drawn again: the same group' );
		brush.R_BrushClear();
		check( entity._brushGroup === null && group.parent === null, 'a map load forgets it' );
		brush.R_DrawBrushModel( entity );
		check( entity._brushGroup && entity._brushGroup !== group, 'and the next draw makes a new one' );
	} finally { cl.worldmodel = saved.world; saved.models.forEach( ( m, i ) => { cl.model_precache[ i ] = m; } ); }
} );

// card [END2]: a brush entity's liquid and teleporter faces are drawn, as WinQuake draws them (they were left out, so
// end.bsp's secret teleporter face on a func_wall was missing; E1M3's *98 carries a teleporter face too)
Deno.test( 'a brush entity\'s teleporter face is drawn, warped, in its group, and survives the group\'s rebuild', () => {
	const saved = { world: cl.worldmodel, models: cl.model_precache.slice() }; d_lightstylevalue.fill( 256 );
	try {
		const map = Mod_ForName( 'maps/e1m3.bsp', true ), wall = Mod_ForName( '*98', false );
		cl.worldmodel = map; cl.model_precache.fill( null ); cl.model_precache[ 1 ] = map; cl.model_precache[ 2 ] = wall;
		GL_BuildLightmaps();
		const entity = { origin: new Float32Array( 3 ), angles: new Float32Array( 3 ), frame: 0, model: wall };
		brush.R_DrawBrushModel( entity );
		const liquids = () => entity._brushGroup.children.filter( m => m.userData.quakeLiquid );
		const first = liquids();
		check( first.length > 0 && first.every( m => m.userData.quakeLiquid.name.startsWith( '*teleport' ) ), 'the teleporter face is drawn (' + first.length + ')' );
		const geometry = first[ 0 ].geometry; let disposed = 0; geometry.addEventListener( 'dispose', () => disposed ++ );
		entity.frame = 1; brush.R_BrushBeginFrame(); brush.R_DrawBrushModel( entity ); // (a new frame number rebuilds the group)
		const again = liquids();
		check( again.length === first.length && again[ 0 ] === first[ 0 ], 'the same face mesh, in the rebuilt group' );
		check( disposed === 0, 'its geometry was not thrown away with the old group' );
		brush.R_BrushClear();
	} finally { cl.worldmodel = saved.world; saved.models.forEach( ( m, i ) => { cl.model_precache[ i ] = m; } ); }
} );
