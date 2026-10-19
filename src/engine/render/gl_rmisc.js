/**
 * @module engine/render/gl_rmisc
 *
 * Renderer odds and ends (WinQuake gl_rmisc.c): new-map set-up, the particle texture, `pointfile`, `timerefresh`.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: module-level variables `_playerSkinTextures` and `_playerTranslation` (the latter set by
 * `Hexen2_SetPlayerTranslation`).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/gl_rmisc.c -- GL misc rendering functions

import * as THREE from 'three';
import { Con_Printf } from '../common/common.js';
import { Cvar_RegisterVariable, Cvar_SetValue } from '../common/cvar.js';
import { d_lightstylevalue, r_viewleaf, r_norefresh, r_lightmap,
	r_fullbright, r_drawentities, r_drawviewmodel, r_shadows,
	r_mirroralpha, r_wateralpha, r_dynamic, r_novis, r_speeds,
	gl_clear, gl_texsort, gl_cull, gl_smoothmodels, gl_affinemodels,
	gl_polyblend, gl_flashblend, gl_playermip, gl_nocolors,
	gl_keeptjunctions, gl_reporttjunctions, gl_doubleeyes, gl_texturemode,
	gl_mtexable, skytexturenum, mirrortexturenum, set_mirrortexturenum,
	getTextureExtensionNumber, particletexture, playertextures, gl_max_size,
	envmap } from './glquake.js';
import { mod_alias, r_worldentity, R_Init as R_Init_rmain, R_NewMap as R_NewMap_rmain } from './gl_rmain.js';
import { set_skytexturenum as set_skytexturenum_rsurf } from './gl_rsurf.js';
import { cl, cl_entities } from '../client/client.js';
import { COM_FindFile } from '../common/pak.js';
import { d_8to24table } from './vid.js';
import { GameProfile_IsHexen2 } from '../common/game_profile.js';
import { Hexen2_PlayerClassTexels } from './gl_model_alias.js';

/*
===============
R_InitParticleTexture
===============
*/

const dottexture = [
	[ 0, 1, 1, 0, 0, 0, 0, 0 ],
	[ 1, 1, 1, 1, 0, 0, 0, 0 ],
	[ 1, 1, 1, 1, 0, 0, 0, 0 ],
	[ 0, 1, 1, 0, 0, 0, 0, 0 ],
	[ 0, 0, 0, 0, 0, 0, 0, 0 ],
	[ 0, 0, 0, 0, 0, 0, 0, 0 ],
	[ 0, 0, 0, 0, 0, 0, 0, 0 ],
	[ 0, 0, 0, 0, 0, 0, 0, 0 ],
];

/**
 * Creates the particle dot texture used for particle effects. The original is an 8x8 texture with a circular dot
 * pattern: white texels whose alpha is 255 inside the 4x4 dot in one corner and 0 elsewhere, linearly filtered.
 * Called by `R_Init`; the particles actually drawn use `r_part.js`'s own copy of this texture.
 *
 * @returns {THREE.DataTexture} a new 8x8 RGBA texture owned by the caller (not registered for filter updates)
 */
export function R_InitParticleTexture() {

	//
	// particle texture
	//
	const data = new Uint8Array( 8 * 8 * 4 );

	for ( let x = 0; x < 8; x ++ ) {

		for ( let y = 0; y < 8; y ++ ) {

			const idx = ( y * 8 + x ) * 4;
			data[ idx ] = 255;
			data[ idx + 1 ] = 255;
			data[ idx + 2 ] = 255;
			data[ idx + 3 ] = dottexture[ x ][ y ] * 255;

		}

	}

	const texture = new THREE.DataTexture( data, 8, 8, THREE.RGBAFormat );
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearFilter;
	texture.needsUpdate = true;

	return texture;

}

/*
===============
R_Init
===============
*/
/**
 * Renderer start-up, called once from `Host_Init`: registers the renderer's `r_*` and `gl_*` cvars (the cvar-shaped
 * objects exported by `glquake.js`), forces `gl_texsort` to 0 when multitexture is available (`gl_mtexable`, false in
 * this port), creates the particle texture and then runs `gl_rmain.js`'s `R_Init`, which creates the Three.js scene
 * and camera and initialises the particles (`R_InitParticles`). WinQuake's `envmap` command is not registered.
 *
 * @returns {{ particleTexture: THREE.DataTexture }} the texture from `R_InitParticleTexture` (`Host_Init` ignores it)
 */
export function R_Init() {

	// Register cvars (WinQuake's envmap command, a developer tool that writes six views to files, is not ported)
	Cvar_RegisterVariable( r_norefresh );
	Cvar_RegisterVariable( r_lightmap );
	Cvar_RegisterVariable( r_fullbright );
	Cvar_RegisterVariable( r_drawentities );
	Cvar_RegisterVariable( r_drawviewmodel );
	Cvar_RegisterVariable( r_shadows );
	Cvar_RegisterVariable( r_mirroralpha );
	// uhexen2 engine/hexen2/gl_rmain.c:83: Hexen II's translucent pass defaults to 0.33; Quake keeps its opaque 1
	if ( GameProfile_IsHexen2() && r_wateralpha.string === '1' ) { r_wateralpha.string = '0.33'; r_wateralpha.value = 0.33; }
	Cvar_RegisterVariable( r_wateralpha );
	Cvar_RegisterVariable( r_dynamic );
	Cvar_RegisterVariable( r_novis );
	Cvar_RegisterVariable( r_speeds );

	Cvar_RegisterVariable( gl_clear );
	Cvar_RegisterVariable( gl_texsort );

	if ( gl_mtexable ) {

		Cvar_SetValue( 'gl_texsort', 0.0 );

	}

	Cvar_RegisterVariable( gl_cull );
	Cvar_RegisterVariable( gl_smoothmodels );
	Cvar_RegisterVariable( gl_affinemodels );
	Cvar_RegisterVariable( gl_polyblend );
	Cvar_RegisterVariable( gl_flashblend );
	Cvar_RegisterVariable( gl_playermip );
	Cvar_RegisterVariable( gl_nocolors );

	Cvar_RegisterVariable( gl_keeptjunctions );
	Cvar_RegisterVariable( gl_reporttjunctions );

	Cvar_RegisterVariable( gl_doubleeyes );

	Cvar_RegisterVariable( gl_texturemode );

	const particleTex = R_InitParticleTexture();

	// Initialize gl_rmain scene/camera
	R_Init_rmain();

	return { particleTexture: particleTex };

}

/*
===============
R_TranslatePlayerSkin
===============
*/

const MAX_SCOREBOARD = 16;
const _playerSkinTextures = new Array( MAX_SCOREBOARD ).fill( null );

/**
 * Returns the colour-translated skin last built by `R_TranslatePlayerSkin` for a player; `gl_mesh.js` calls it when
 * drawing a player entity (unless `gl_nocolors` is set).
 *
 * @param {number} playernum player slot, 0..15 (entity number - 1)
 * @returns {?THREE.DataTexture} the translated skin (owned here; replaced and disposed on the next translation for
 *   that slot), or null when none has been built
 */
export function R_GetPlayerSkinTexture( playernum ) {

	return _playerSkinTextures[ playernum ];

}

/**
 * Translates a skin texture by the per-player color lookup. For Three.js, builds a new texture with translated
 * colors and stores the result in `_playerSkinTextures[playernum]` for gl_mesh.js to use (see
 * `R_GetPlayerSkinTexture`). Called by `CL_NewTranslation` when a player's colours change and by `cl_parse.js`
 * when a player entity's model or skin changes.
 *
 * In Quake the shirt (top, palette rows 16..31) and pants (bottom, rows 96..111) ranges are remapped to the
 * player's `scoreboard.colors` rows, reversing the ranges the artists made backwards (rows 128 and up), and the
 * current skin of the player's alias model is the source. In Hexen II the masks and colour rows come from
 * `gfx/player.lmp` for the player's class and the source is that class model's own raw skin
 * (`Hexen2_TranslatePlayerSkinIndices`, uhexen2 engine/hexen2/gl_rmisc.c:278-345). Either way the texels are
 * converted to RGBA through `d_8to24table`, resampled to at most 512x256 (the Hexen II cap is always 512x256), and
 * uploaded as an sRGB, linearly filtered texture; the slot's previous texture is disposed. Does nothing when the
 * player has no scoreboard entry, no model yet, a non-alias model or no loaded skin.
 *
 * @param {number} playernum player slot, 0..15 (entity number - 1)
 */
export function R_TranslatePlayerSkin( playernum ) {

	if ( cl.scores == null || cl.scores[ playernum ] == null )
		return;

	let translate;

	if ( GameProfile_IsHexen2() ) {

		translate = Hexen2_TranslatePlayerSkinIndices( cl.scores[ playernum ] );

	} else {

		const top = cl.scores[ playernum ].colors & 0xf0;
		const bottom = ( cl.scores[ playernum ].colors & 15 ) << 4;

		translate = new Uint8Array( 256 );
		for ( let i = 0; i < 256; i ++ )
			translate[ i ] = i;

		const TOP_RANGE = 16;
		const BOTTOM_RANGE = 96;

		for ( let i = 0; i < 16; i ++ ) {

			if ( top < 128 ) // the artists made some backwards ranges. sigh.
				translate[ TOP_RANGE + i ] = top + i;
			else
				translate[ TOP_RANGE + i ] = top + 15 - i;

			if ( bottom < 128 )
				translate[ BOTTOM_RANGE + i ] = bottom + i;
			else
				translate[ BOTTOM_RANGE + i ] = bottom + 15 - i;

		}

	}

	//
	// locate the original skin pixels
	//
	const entity = cl_entities[ 1 + playernum ];
	if ( entity == null || entity.model == null )
		return; // player doesn't have a model yet

	const model = entity.model;
	if ( model.type !== mod_alias )
		return; // only translate skins on alias models

	const paliashdr = model.cache != null ? model.cache.data : null;
	if ( paliashdr == null )
		return;

	// The Hexen II player is recoloured from the class's own art set (native player_8bit_texels), not from the
	// entity's current skin; Quake translates the entity's current skin.
	const classSkin = GameProfile_IsHexen2() ? Hexen2_PlayerClassTexels( cl.scores[ playernum ].playerclass | 0 ) : null;
	let original, inwidth, inheight;
	if ( classSkin != null ) {

		original = classSkin.data;
		inwidth = classSkin.width;
		inheight = classSkin.height;

	} else {

		const skinnum = ( entity.skinnum >= 0 && entity.skinnum < paliashdr.numskins )
			? entity.skinnum : 0;
		original = paliashdr.texels[ skinnum ];
		if ( original == null )
			return;

		inwidth = paliashdr.skinwidth;
		inheight = paliashdr.skinheight;

	}

	// Build translated 32-bit pixels
	const translate32 = new Uint32Array( 256 );
	for ( let i = 0; i < 256; i ++ )
		translate32[ i ] = d_8to24table[ translate[ i ] ];

	// Hexen II caps the player texture at 512x256 (and crunches by gl_playermip); Quake caps it at the skin's size
	const scaled_width = classSkin != null
		? Math.max( 1, ( Math.min( gl_max_size.value, 512 ) >> gl_playermip.value ) )
		: Math.min( 512, inwidth );
	const scaled_height = classSkin != null
		? Math.max( 1, ( Math.min( gl_max_size.value, 256 ) >> gl_playermip.value ) )
		: Math.min( 256, inheight );

	const pixels = new Uint8Array( scaled_width * scaled_height * 4 );
	const fracstep = ( inwidth * 0x10000 / scaled_width ) | 0;

	for ( let i = 0; i < scaled_height; i ++ ) {

		const inrow_offset = inwidth * ( ( i * inheight / scaled_height ) | 0 );
		let frac = fracstep >> 1;
		for ( let j = 0; j < scaled_width; j ++ ) {

			const rgba = translate32[ original[ inrow_offset + ( frac >> 16 ) ] ];
			const pixIdx = ( i * scaled_width + j ) * 4;
			pixels[ pixIdx ] = rgba & 0xff;
			pixels[ pixIdx + 1 ] = ( rgba >> 8 ) & 0xff;
			pixels[ pixIdx + 2 ] = ( rgba >> 16 ) & 0xff;
			pixels[ pixIdx + 3 ] = 255;
			frac += fracstep;

		}

	}

	// Dispose previous translated texture for this player
	if ( _playerSkinTextures[ playernum ] != null ) {

		_playerSkinTextures[ playernum ].dispose();

	}

	const texture = new THREE.DataTexture( pixels, scaled_width, scaled_height, THREE.RGBAFormat );
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearFilter;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;

	_playerSkinTextures[ playernum ] = texture;

}

/**
 * Hexen II's per-class player colour translation (uhexen2 engine/hexen2/gl_rmisc.c:278-320): gfx/player.lmp holds,
 * per player class, the shirt and pants masks (`colorA`, `colorB`, a 255 entry meaning "leave this index") and 14
 * shirt/pants colour rows; the class's `color_offsets` entry picks its block. A scoreboard colour of 0 (or one past
 * 10) means no translation, exactly as the native `top -= 1` arithmetic does. The Quake ranges are not used.
 *
 * @param {{ colors?: number, playerclass?: number }} score one player's scoreboard slot
 * @param {?Uint8Array} [playerTranslation] gfx/player.lmp; defaults to the loaded copy (`Hexen2_PlayerTranslation`)
 * @returns {Uint8Array} 256 palette-index substitutions (the identity when the player chose no colour)
 */
export function Hexen2_TranslatePlayerSkinIndices( score, playerTranslation = Hexen2_PlayerTranslation() ) {

	const translate = new Uint8Array( 256 );
	for ( let i = 0; i < 256; i ++ )
		translate[ i ] = i;

	if ( playerTranslation == null || playerTranslation.length < 256 + 7680 + 10 * 256 )
		return translate;

	let top = ( ( score?.colors ?? 0 ) & 0xf0 ) >> 4;
	let bottom = ( score?.colors ?? 0 ) & 15;

	if ( top > 10 ) top = 0;
	if ( bottom > 10 ) bottom = 0;
	top -= 1;
	bottom -= 1;

	const playerclass = Number.isInteger( score?.playerclass ) && score.playerclass >= 1 && score.playerclass <= 5 ? score.playerclass : 1;
	const colorA = 256 + COLOR_OFFSETS[ playerclass - 1 ];
	const colorB = colorA + 256;
	const sourceA = colorB + 256 + ( top >= 0 ? top * 256 : 0 );
	const sourceB = colorB + 256 + ( bottom >= 0 ? bottom * 256 : 0 );

	for ( let i = 0; i < 256; i ++ ) {

		if ( top >= 0 && playerTranslation[ colorA + i ] !== 255 )
			translate[ i ] = playerTranslation[ sourceA + i ];
		if ( bottom >= 0 && playerTranslation[ colorB + i ] !== 255 )
			translate[ i ] = playerTranslation[ sourceB + i ];

	}

	return translate;

}

// uhexen2 engine/hexen2/gl_rmisc.c:26-37, in bytes from the start of gfx/player.lmp
const COLOR_OFFSETS = Object.freeze( [ 2 * 14 * 256, 0, 1 * 14 * 256, 2 * 14 * 256, 2 * 14 * 256 ] );
let _playerTranslation = null;

/**
 * The loaded gfx/player.lmp (uhexen2's `playerTranslation`, loaded in R_Init): player class masks and colour rows.
 *
 * @returns {?Uint8Array} the file's bytes, or null when the pack does not have it
 */
export function Hexen2_PlayerTranslation() {

	if ( _playerTranslation !== null ) return _playerTranslation;
	const file = COM_FindFile( 'gfx/player.lmp' );
	_playerTranslation = file == null ? null : file.data;
	return _playerTranslation;

}

/**
 * Installs a gfx/player.lmp copy (tests, or a late pack mount). Passing null forgets the loaded one.
 *
 * @param {?Uint8Array} bytes the file's bytes
 */
export function Hexen2_SetPlayerTranslation( bytes ) {

	_playerTranslation = bytes ?? null;

}

/*
===============
R_NewMap
===============
*/
/**
 * Prepares the renderer for a newly loaded world; called by `CL_ParseServerInfo` once the world model is in
 * `cl.worldmodel`. Resets every light style to the normal value 264, clears leaf efrags in case the level hasn't been
 * reloaded, runs `gl_rmain.js`'s `R_NewMap` (resets the world entity and view leaves), clears every texture chain,
 * and records which world texture is the sky (name starting 'sky') and which is the mirror ('window02_1'), for
 * gl_rsurf.js and gl_rmain.js. The last match of each wins.
 *
 * @param {client_state_t} cl client state whose `worldmodel` (model_t) was just loaded; its leafs and textures are
 *   mutated
 * @returns {{ worldEntity: entity_t, skytexturenum: number, mirrortexturenum: number }} the world entity and the
 *   sky/mirror texture indices into `cl.worldmodel.textures` (-1 when absent); the caller does not use it
 */
export function R_NewMap( cl ) {

	// Initialize light style values
	for ( let i = 0; i < 256; i ++ )
		d_lightstylevalue[ i ] = 264; // normal light value

	// clear out efrags in case the level hasn't been reloaded
	if ( cl.worldmodel && cl.worldmodel.leafs ) {

		for ( let i = 0; i < cl.worldmodel.numleafs; i ++ )
			cl.worldmodel.leafs[ i ].efrags = null;

	}

	R_NewMap_rmain();

	// identify sky texture
	let skyTexNum = - 1;
	let mirrorTexNum = - 1;
	if ( cl.worldmodel && cl.worldmodel.textures ) {

		for ( let i = 0; i < cl.worldmodel.numtextures; i ++ ) {

			if ( ! cl.worldmodel.textures[ i ] )
				continue;
			if ( cl.worldmodel.textures[ i ].name.substring( 0, 3 ) === 'sky' )
				skyTexNum = i;
			if ( cl.worldmodel.textures[ i ].name.substring( 0, 10 ) === 'window02_1' )
				mirrorTexNum = i;
			cl.worldmodel.textures[ i ].texturechain = null;

		}

	}

	// Set sky texture number in gl_rsurf.js for DrawTextureChains
	set_skytexturenum_rsurf( skyTexNum );
	set_mirrortexturenum( mirrorTexNum );

	return {
		worldEntity: r_worldentity,
		skytexturenum: skyTexNum,
		mirrortexturenum: mirrorTexNum
	};

}

/*
====================
D_FlushCaches
====================
*/
/**
 * No-op in GL renderer (the software renderer flushes its surface cache here). Called by `Host_ClearMemory` before
 * models are cleared for a new map.
 */
export function D_FlushCaches() {

	// no-op

}
