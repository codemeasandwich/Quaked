// The world renderer's world stage on its own (card [44i]): a surface whose light style changed has its lightmap
// rebuilt into the shared atlas, the atlas marked changed and the surface chained for the blend. Through the public
// interface of gl_rsurf_world.js (the map loaded by gl_rsurf.js's GL_BuildLightmaps), on the shareware pack's E1M1.
import { readFileSync } from 'node:fs';
import * as world from '../src/engine/render/gl_rsurf_world.js';
import { GL_BuildLightmaps } from '../src/engine/render/gl_rsurf.js';
import { lightmaps, lightmap_modified, lightmap_polys, BLOCK_WIDTH, BLOCK_HEIGHT } from '../src/engine/render/gl_rsurf_lightmaps.js';
import { d_lightstylevalue, c_brush_polys, SURF_DRAWSKY, SURF_DRAWTURB } from '../src/engine/render/gl_rmain.js';
import { cl } from '../src/engine/client/client.js';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();

Deno.test( 'a changed light style rebuilds the surface\'s lightmap in its atlas', () => {
	const saved = { world: cl.worldmodel, models: cl.model_precache.slice(), styles: Array.from( d_lightstylevalue ) };
	try {
		const map = Mod_ForName( 'maps/e1m1.bsp', true ); d_lightstylevalue.fill( 256 );
		cl.worldmodel = map; cl.model_precache.fill( null ); cl.model_precache[ 1 ] = map;
		GL_BuildLightmaps();
		const s = map.surfaces.find( f => ! ( f.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) && f.styles[ 0 ] === 0 && f.samples && f.samples[ f.sampleOffset || 0 ] > 20 );
		check( s, 'a lit surface on style 0' );
		const at = s.lightmaptexturenum * BLOCK_WIDTH * BLOCK_HEIGHT + s.light_t * BLOCK_WIDTH + s.light_s, before = lightmaps[ at ];
		const polys = c_brush_polys;
		lightmap_modified[ s.lightmaptexturenum ] = false; lightmap_polys[ s.lightmaptexturenum ] = null;
		world.R_RenderDynamicLightmaps( s );
		check( lightmaps[ at ] === before && ! lightmap_modified[ s.lightmaptexturenum ], 'the same style: nothing rebuilt' );
		check( lightmap_polys[ s.lightmaptexturenum ] === s.polys, 'the surface is chained for its atlas\'s blend' );
		d_lightstylevalue[ 0 ] = 64; // a quarter of the light
		world.R_RenderDynamicLightmaps( s );
		check( lightmap_modified[ s.lightmaptexturenum ] && lightmaps[ at ] > before, 'a dimmer style: the atlas is rebuilt darker (' + before + ' -> ' + lightmaps[ at ] + ')' );
		check( s.cached_light[ 0 ] === 64, 'and the surface remembers the style it was built for' );
		check( c_brush_polys === polys + 2, 'each call counts the surface' );
		world.set_skytexturenum( 7 ); check( world.skytexturenum === 7, 'the sky texture number is set through its setter' ); world.set_skytexturenum( - 1 );
	} finally { cl.worldmodel = saved.world; saved.models.forEach( ( m, i ) => { cl.model_precache[ i ] = m; } ); saved.styles.forEach( ( v, i ) => { d_lightstylevalue[ i ] = v; } ); }
} );
