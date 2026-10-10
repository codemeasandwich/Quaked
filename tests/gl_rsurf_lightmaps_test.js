// The world renderer's lightmaps stage on its own (card [44i]): a surface's samples built into one-byte and coloured
// (.lit) texels, and E1M1's atlases made by the map-load stages (clear, format, model, each surface, upload).
// Through the public interface of gl_rsurf_lightmaps.js, on the shareware pack's real map.
import { readFileSync } from 'node:fs';
import * as lm from '../src/engine/render/gl_rsurf_lightmaps.js';
import { d_lightstylevalue, VERTEXSIZE, SURF_DRAWSKY, SURF_DRAWTURB } from '../src/engine/render/gl_rmain.js';
import { cl } from '../src/engine/client/client.js';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();

// a 2 x 2 texel surface (extents 16 x 16) lit by style 0
function surface( samples, litsamples ) {
	return { flags: 0, extents: [ 16, 16 ], samples, sampleOffset: 0, litsamples, litOffset: 0, styles: new Uint8Array( [ 0, 255, 255, 255 ] ),
		cached_light: new Int32Array( 4 ), dlightframe: - 12345, cached_dlight: false };
}

Deno.test( 'R_BuildLightMap stores 255 - brightness, one byte or red, green and blue, from the style\'s scale', () => {
	const savedWorld = cl.worldmodel, savedStyle = d_lightstylevalue[ 0 ];
	try {
		cl.worldmodel = { lightdata: new Uint8Array( 1 ) }; d_lightstylevalue[ 0 ] = 256; // normal light: brightness = 2 * sample
		const grey = surface( new Uint8Array( [ 10, 20, 30, 200 ] ), null ), one = new Uint8Array( 4 );
		lm.R_BuildLightMap( grey, one, 0, 2, 1 );
		check( one.join() === [ 235, 215, 195, 0 ].join(), 'one byte a texel, inverted and capped at 255: ' + one.join() );
		check( grey.cached_light[ 0 ] === 256, 'the style\'s scale is cached on the surface' );
		const three = new Uint8Array( 12 ); lm.R_BuildLightMap( surface( new Uint8Array( [ 10, 20, 30, 40 ] ), null ), three, 0, 6, 3 );
		check( three.join() === [ 235, 235, 235, 215, 215, 215, 195, 195, 195, 175, 175, 175 ].join(), 'a grey map in three bytes repeats each texel: ' + three.join() );
		const lit = new Uint8Array( 12 ); lm.R_BuildLightMap( surface( new Uint8Array( 4 ), new Uint8Array( [ 10, 0, 5, 0, 20, 0, 1, 2, 3, 100, 50, 25 ] ) ), lit, 0, 6, 3 );
		check( lit.join() === [ 235, 255, 245, 255, 215, 255, 253, 251, 249, 55, 155, 205 ].join(), 'coloured samples give each channel its own light: ' + lit.join() );
		d_lightstylevalue[ 0 ] = 128; const dim = new Uint8Array( 4 ); lm.R_BuildLightMap( surface( new Uint8Array( [ 10, 20, 30, 40 ] ), null ), dim, 0, 2, 1 );
		check( dim.join() === [ 245, 235, 225, 215 ].join(), 'half the style, half the light: ' + dim.join() );
	} finally { cl.worldmodel = savedWorld; d_lightstylevalue[ 0 ] = savedStyle; }
} );

Deno.test( 'E1M1\'s surfaces are placed in atlases with polygons that point into them, and the atlases uploaded', () => {
	const savedWorld = cl.worldmodel, savedStyles = Array.from( d_lightstylevalue );
	try {
		const world = Mod_ForName( 'maps/e1m1.bsp', true ); cl.worldmodel = world; d_lightstylevalue.fill( 256 );
		lm.R_LightmapsClear(); lm.R_LightmapsSetFormat( 1 ); lm.R_LightmapsSetModel( world );
		let lit = 0;
		for ( let i = 0; i < world.numsurfaces; i ++ ) {
			const s = world.surfaces[ i ];
			lm.GL_CreateSurfaceLightmap( s );
			if ( s.flags & ( SURF_DRAWTURB | SURF_DRAWSKY ) ) continue;
			lm.BuildSurfaceDisplayList( s ); lit ++;
		}
		lm.R_LightmapsUpload();
		const atlases = lm.lightmapTextures;
		check( atlases.length > 0 && atlases.length <= lm.MAX_LIGHTMAPS, 'some atlases (' + atlases.length + ')' );
		check( atlases.every( t => t.image.width === lm.BLOCK_WIDTH && t.image.height === lm.BLOCK_HEIGHT && t.image.data.length === lm.BLOCK_WIDTH * lm.BLOCK_HEIGHT * 4 ), 'each 128 x 128 RGBA' );
		let checked = 0;
		for ( let i = 0; i < world.numsurfaces; i ++ ) {
			const s = world.surfaces[ i ];
			if ( s.flags & ( SURF_DRAWTURB | SURF_DRAWSKY ) ) continue;
			const smax = ( s.extents[ 0 ] >> 4 ) + 1, tmax = ( s.extents[ 1 ] >> 4 ) + 1;
			check( s.lightmaptexturenum >= 0 && s.lightmaptexturenum < atlases.length, 'surface ' + i + ' in a made atlas' );
			check( s.light_s + smax <= lm.BLOCK_WIDTH && s.light_t + tmax <= lm.BLOCK_HEIGHT, 'surface ' + i + ' inside its atlas' );
			const v = s.polys.verts;
			for ( let k = 0; k < s.polys.numverts; k ++ ) check( v[ k * VERTEXSIZE + 5 ] >= 0 && v[ k * VERTEXSIZE + 5 ] <= 1 && v[ k * VERTEXSIZE + 6 ] >= 0 && v[ k * VERTEXSIZE + 6 ] <= 1, 'lightmap coordinates within the atlas' );
			const texel = s.light_t * lm.BLOCK_WIDTH + s.light_s, stored = lm.lightmaps[ s.lightmaptexturenum * lm.BLOCK_WIDTH * lm.BLOCK_HEIGHT + texel ];
			check( atlases[ s.lightmaptexturenum ].image.data[ texel * 4 ] === 255 - stored, 'the upload turns the stored darkness into brightness' );
			checked ++;
		}
		check( checked === lit && lit > 1000, 'every lit surface (' + lit + ')' );
	} finally { cl.worldmodel = savedWorld; savedStyles.forEach( ( v, i ) => { d_lightstylevalue[ i ] = v; } ); }
} );
