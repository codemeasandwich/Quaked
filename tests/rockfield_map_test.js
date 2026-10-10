// Real shipped BSPs, original polygons and unchanged texture/lightmap UVs.
import { readFileSync } from 'node:fs';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';
import { GL_BuildLightmaps } from '../src/gl_rsurf.js';
import { SV_HullPointContents } from '../src/engine/server/world.js';
import { cl } from '../src/engine/client/client.js';
import { R_RockSurfaceCharts } from '../src/r_rocksurfaces.js';
import { R_RockfieldStatus } from '../src/r_rockfield.js';
Deno.test( 'shipped E1M1 assigns continuous natural rock and terrain charts without changing BSP polygons or texture scale', () => {
 const bytes = readFileSync( 'pak0.pak' ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) ) );
 VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
 const model = Mod_ForName( 'maps/e1m1.bsp', true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null;
 GL_BuildLightmaps();
 if ( SV_HullPointContents( model.hulls[ 1 ], model.hulls[ 1 ].firstclipnode, [ 128, 1008, -199.95 ] ) !== -1 ) throw new Error( 'Outdoor trial player hull must be in open air, not solid or water' );
 const snapshot = model.surfaces.map( s => { const polys = []; for ( let p = s.polys; p; p = p.next ) polys.push( Array.from( p.verts ).map( v => typeof v === 'number' ? v : Array.from( v ) ) ); return JSON.stringify( polys ); } );
 const fields = R_RockSurfaceCharts( model );
 if ( ! fields.charts.some( c => c.profile === 'wall' ) || ! fields.charts.some( c => c.profile === 'ground' ) ) throw new Error( 'E1M1 must contain eligible walls and ground: ' + JSON.stringify( fields.charts.map( c => ( { profile: c.profile, names: c.surfaces.map( s => s.surface.texinfo.texture.name ) } ) ) ) );
 if ( ! fields.charts.some( c => c.profile === 'wall' && c.surfaces.some( f => f.surface.texinfo.texture.name === 'uwall1_2' ) ) ) throw new Error( 'Main E1M1 uwall1_2 cliff faces must be enhanced' );
 const after = model.surfaces.map( s => { const polys = []; for ( let p = s.polys; p; p = p.next ) polys.push( Array.from( p.verts ).map( v => typeof v === 'number' ? v : Array.from( v ) ) ); return JSON.stringify( polys ); } );
 if ( snapshot.join() !== after.join() ) throw new Error( 'Chart construction changed BSP polygons/UVs' );
 if ( R_RockfieldStatus().resident || R_RockfieldStatus().pending ) throw new Error( 'Map build must not generate any height tiles' );
 console.log( 'REAL_MAP_CHARTS ' + JSON.stringify( fields.charts.map( c => ( { id: c.id, profile: c.profile, pieces: c.surfaces.length, bounds: c.bounds, names: [ ...new Set( c.surfaces.map( f => f.surface.texinfo.texture.name ) ) ] } ) ) ) );
} );
