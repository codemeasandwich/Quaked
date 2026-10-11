/**
 * @module engine/render/gl_model_sprite
 *
 * The sprite loader (card [44k], split from gl_model.js; WinQuake gl_model.c): an .spr's header and its frames,
 * single or grouped with their intervals, each frame's picture uploaded.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: calls `Sys_Error` (fatal) at 3 places.
 *
 * `Mod_LoadSpriteModel` is called by `Mod_LoadModel` (gl_model.js) for an .spr's bytes.
 */
import { Sys_Error } from '../common/sys.js';
import { SPRITE_VERSION, SPR_SINGLE, mod_sprite, mspriteframe_t, mspritegroup_t, mspriteframedesc_t, msprite_t } from './gl_model_types.js';
import { loadmodel, GL_LoadTexture } from './gl_model_common.js';

// ============================================================================
//
//                        SPRITE MODELS
//
// ============================================================================

// ============================================================================
// Mod_LoadSpriteFrame
// ============================================================================

function Mod_LoadSpriteFrame( buf, offset, framenum ) {

	const view = new DataView( buf, offset );

	// dspriteframe_t: int origin[2], int width, int height = 16 bytes
	const width = view.getInt32( 8, true );
	const height = view.getInt32( 12, true );
	const size = width * height;

	const pspriteframe = new mspriteframe_t();

	pspriteframe.width = width;
	pspriteframe.height = height;

	const origin0 = view.getInt32( 0, true );
	const origin1 = view.getInt32( 4, true );

	pspriteframe.up = origin1;
	pspriteframe.down = origin1 - height;
	pspriteframe.left = origin0;
	pspriteframe.right = width + origin0;

	const SIZEOF_DSPRITEFRAME = 16;
	const name = loadmodel.name + '_' + framenum;
	const pixelData = new Uint8Array( buf, offset + SIZEOF_DSPRITEFRAME, size );
	pspriteframe.gl_texturenum = GL_LoadTexture( name, width, height, pixelData, true, true );

	return {
		frame: pspriteframe,
		nextOffset: offset + SIZEOF_DSPRITEFRAME + size
	};

}

// ============================================================================
// Mod_LoadSpriteGroup
// ============================================================================

function Mod_LoadSpriteGroup( buf, offset, framenum ) {

	const view = new DataView( buf, offset );

	// dspritegroup_t: int numframes = 4 bytes
	const numframes = view.getInt32( 0, true );

	const pspritegroup = new mspritegroup_t();
	pspritegroup.numframes = numframes;

	const SIZEOF_DSPRITEGROUP = 4;
	const SIZEOF_DSPRITEINTERVAL = 4;

	// Read intervals
	pspritegroup.intervals = new Float32Array( numframes );
	let intervalOfs = offset + SIZEOF_DSPRITEGROUP;

	for ( let i = 0; i < numframes; i ++ ) {

		const iv = new DataView( buf, intervalOfs );
		pspritegroup.intervals[ i ] = iv.getFloat32( 0, true );
		if ( pspritegroup.intervals[ i ] <= 0.0 )
			Sys_Error( 'Mod_LoadSpriteGroup: interval<=0' );
		intervalOfs += SIZEOF_DSPRITEINTERVAL;

	}

	// Load frames
	pspritegroup.frames = new Array( numframes );
	let ptemp = intervalOfs;

	for ( let i = 0; i < numframes; i ++ ) {

		const result = Mod_LoadSpriteFrame( buf, ptemp, framenum * 100 + i );
		pspritegroup.frames[ i ] = result.frame;
		ptemp = result.nextOffset;

	}

	return {
		frame: pspritegroup,
		nextOffset: ptemp
	};

}

// ============================================================================
// Mod_LoadSpriteModel
// ============================================================================

/**
 * Loads a sprite (.spr) into `mod` (WinQuake gl_model.c; called by `Mod_LoadModel` for its bytes): the header (type,
 * size, sync) and each frame, single or a timed group, its picture uploaded.
 *
 * @param {model_t} mod the model to fill (`loadmodel`)
 * @param {ArrayBuffer} buffer the whole .spr file
 * @throws {Error} via `Sys_Error` for a wrong version, a bad frame count or a group interval of 0 or less
 */
export function Mod_LoadSpriteModel( mod, buffer ) {

	const view = new DataView( buffer );

	// dsprite_t: int ident, int version, int type, float boundingradius,
	//            int width, int height, int numframes, float beamlength, synctype_t synctype
	//            = 36 bytes
	const version = view.getInt32( 4, true );
	if ( version !== SPRITE_VERSION )
		Sys_Error( mod.name + ' has wrong version number (' + version + ' should be ' + SPRITE_VERSION + ')' );

	const numframes = view.getInt32( 24, true );

	const psprite = new msprite_t();
	mod.cache.data = psprite;

	psprite.type = view.getInt32( 8, true );
	psprite.maxwidth = view.getInt32( 16, true );
	psprite.maxheight = view.getInt32( 20, true );
	psprite.beamlength = view.getFloat32( 28, true );
	mod.synctype = view.getInt32( 32, true );
	psprite.numframes = numframes;

	mod.mins[ 0 ] = mod.mins[ 1 ] = - psprite.maxwidth / 2;
	mod.maxs[ 0 ] = mod.maxs[ 1 ] = psprite.maxwidth / 2;
	mod.mins[ 2 ] = - psprite.maxheight / 2;
	mod.maxs[ 2 ] = psprite.maxheight / 2;

	//
	// load the frames
	//
	if ( numframes < 1 )
		Sys_Error( 'Mod_LoadSpriteModel: Invalid # of frames: ' + numframes );

	mod.numframes = numframes;

	psprite.frames = new Array( numframes );

	const SIZEOF_DSPRITE = 36;
	const SIZEOF_DSPRITEFRAMETYPE = 4;
	let pos = SIZEOF_DSPRITE;

	for ( let i = 0; i < numframes; i ++ ) {

		const ftView = new DataView( buffer, pos );
		const frametype = ftView.getInt32( 0, true );

		const fdesc = new mspriteframedesc_t();
		fdesc.type = frametype;

		if ( frametype === SPR_SINGLE ) {

			const result = Mod_LoadSpriteFrame( buffer, pos + SIZEOF_DSPRITEFRAMETYPE, i );
			fdesc.frameptr = result.frame;
			pos = result.nextOffset;

		} else {

			const result = Mod_LoadSpriteGroup( buffer, pos + SIZEOF_DSPRITEFRAMETYPE, i );
			fdesc.frameptr = result.frame;
			pos = result.nextOffset;

		}

		psprite.frames[ i ] = fdesc;

	}

	mod.type = mod_sprite;

}
