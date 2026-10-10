/**
 * @module engine/render/gl_rmisc
 *
 * Renderer odds and ends (WinQuake gl_rmisc.c): new-map set-up, the particle texture, `pointfile`, `timerefresh`.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `Cmd_AddCommand`, `Cvar_RegisterVariable`, `Cvar_SetValue`,
 * `R_InitParticles`, `R_RenderView`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Engine callbacks are injected with `R_Misc_SetCallbacks`.
 */
// Ported from: WinQuake/gl_rmisc.c -- GL misc rendering functions

import * as THREE from 'three';
import { Con_Printf } from '../common/common.js';
import { Cvar_RegisterVariable as Cvar_RegisterVariable_impl, Cvar_SetValue as Cvar_SetValue_impl } from '../common/cvar.js';
import { d_lightstylevalue, r_viewleaf, r_norefresh, r_lightmap,
	r_fullbright, r_drawentities, r_drawviewmodel, r_shadows,
	r_mirroralpha, r_wateralpha, r_dynamic, r_novis, r_speeds,
	gl_clear, gl_texsort, gl_cull, gl_smoothmodels, gl_affinemodels,
	gl_polyblend, gl_flashblend, gl_playermip, gl_nocolors,
	gl_keeptjunctions, gl_reporttjunctions, gl_doubleeyes, gl_texturemode,
	gl_mtexable, skytexturenum, mirrortexturenum, set_mirrortexturenum,
	getTextureExtensionNumber, particletexture, playertextures,
	envmap } from './glquake.js';
import { mod_alias, r_worldentity, R_Init as R_Init_rmain, R_NewMap as R_NewMap_rmain } from './gl_rmain.js';
import { set_skytexturenum as set_skytexturenum_rsurf } from './gl_rsurf.js';
import { cl, cl_entities } from '../client/client.js';
import { d_8to24table } from './vid.js';

// External function stubs (set by engine)
let Cmd_AddCommand = null;
let Cvar_RegisterVariable = null;
let Cvar_SetValue = null;
let R_InitParticles = null;
let R_RenderView = null;

/**
 * Injects engine functions this module would otherwise import (avoiding import cycles). Only the provided keys are
 * replaced; the rest keep their current values. Nothing calls it at present, so `R_Init` falls back to the imported
 * cvar functions and does not register the `envmap` command or call `R_InitParticles`.
 *
 * @param {{ Cmd_AddCommand?: Function, Cvar_RegisterVariable?: Function, Cvar_SetValue?: Function,
 *   R_InitParticles?: Function, R_RenderView?: Function }} callbacks functions to install; kept for the session
 */
export function R_Misc_SetCallbacks( callbacks ) {

	if ( callbacks.Cmd_AddCommand ) Cmd_AddCommand = callbacks.Cmd_AddCommand;
	if ( callbacks.Cvar_RegisterVariable ) Cvar_RegisterVariable = callbacks.Cvar_RegisterVariable;
	if ( callbacks.Cvar_SetValue ) Cvar_SetValue = callbacks.Cvar_SetValue;
	if ( callbacks.R_InitParticles ) R_InitParticles = callbacks.R_InitParticles;
	if ( callbacks.R_RenderView ) R_RenderView = callbacks.R_RenderView;

}

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
R_Envmap_f
===============
*/
/**
 * Grab six views for environment mapping tests (the `envmap` console command in WinQuake). In Three.js, we would use
 * CubeCamera for this: it renders the scene into a 256-pixel cube render target from the camera's position (near 1,
 * far 10000 Quake units). The command is registered only if `R_Misc_SetCallbacks` supplied `Cmd_AddCommand`, and a
 * console command is called without arguments, in which case it does nothing.
 *
 * @param {*} r_refdef view definition (unused)
 * @param {THREE.Scene} scene scene to capture
 * @param {THREE.WebGLRenderer} renderer renderer used for the six passes
 * @param {THREE.Camera} camera supplies the capture position
 * @returns {THREE.CubeTexture|undefined} the captured cube texture (its render target is never disposed; the caller
 *   owns it), or undefined when `renderer`, `scene` or `camera` is missing
 */
export function R_Envmap_f( r_refdef, scene, renderer, camera ) {

	if ( ! renderer || ! scene || ! camera )
		return;

	const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( 256 );
	const cubeCamera = new THREE.CubeCamera( 1, 10000, cubeRenderTarget );
	cubeCamera.position.copy( camera.position );

	cubeCamera.update( renderer, scene );

	Con_Printf( 'Environment map captured via CubeCamera\n' );

	return cubeRenderTarget.texture;

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
 * and camera.
 *
 * @returns {{ particleTexture: THREE.DataTexture }} the texture from `R_InitParticleTexture` (`Host_Init` ignores it)
 */
export function R_Init() {

	// Register commands
	if ( Cmd_AddCommand ) {

		Cmd_AddCommand( 'envmap', R_Envmap_f );

	}

	// Register cvars
	const _Cvar_RegisterVariable = Cvar_RegisterVariable || Cvar_RegisterVariable_impl;
	const _Cvar_SetValue = Cvar_SetValue || Cvar_SetValue_impl;
	if ( _Cvar_RegisterVariable ) {

		_Cvar_RegisterVariable( r_norefresh );
		_Cvar_RegisterVariable( r_lightmap );
		_Cvar_RegisterVariable( r_fullbright );
		_Cvar_RegisterVariable( r_drawentities );
		_Cvar_RegisterVariable( r_drawviewmodel );
		_Cvar_RegisterVariable( r_shadows );
		_Cvar_RegisterVariable( r_mirroralpha );
		_Cvar_RegisterVariable( r_wateralpha );
		_Cvar_RegisterVariable( r_dynamic );
		_Cvar_RegisterVariable( r_novis );
		_Cvar_RegisterVariable( r_speeds );

		_Cvar_RegisterVariable( gl_clear );
		_Cvar_RegisterVariable( gl_texsort );

		if ( gl_mtexable ) {

			_Cvar_SetValue( 'gl_texsort', 0.0 );

		}

		_Cvar_RegisterVariable( gl_cull );
		_Cvar_RegisterVariable( gl_smoothmodels );
		_Cvar_RegisterVariable( gl_affinemodels );
		_Cvar_RegisterVariable( gl_polyblend );
		_Cvar_RegisterVariable( gl_flashblend );
		_Cvar_RegisterVariable( gl_playermip );
		_Cvar_RegisterVariable( gl_nocolors );

		_Cvar_RegisterVariable( gl_keeptjunctions );
		_Cvar_RegisterVariable( gl_reporttjunctions );

		_Cvar_RegisterVariable( gl_doubleeyes );

		_Cvar_RegisterVariable( gl_texturemode );

	}

	if ( R_InitParticles )
		R_InitParticles();

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
 * The shirt (top, palette rows 16..31) and pants (bottom, rows 96..111) ranges are remapped to the player's
 * `scoreboard.colors` rows, reversing the ranges the artists made backwards (rows 128 and up). The current skin of
 * the player's alias model is converted to RGBA through `d_8to24table`, resampled to at most 512x256 texels, and
 * uploaded as an sRGB, linearly filtered texture; the slot's previous texture is disposed. Does nothing when the
 * player has no scoreboard entry, no model yet, a non-alias model or no loaded skin.
 *
 * @param {number} playernum player slot, 0..15 (entity number - 1)
 */
export function R_TranslatePlayerSkin( playernum ) {

	if ( cl.scores == null || cl.scores[ playernum ] == null )
		return;

	const top = cl.scores[ playernum ].colors & 0xf0;
	const bottom = ( cl.scores[ playernum ].colors & 15 ) << 4;

	const translate = new Uint8Array( 256 );
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

	const skinnum = ( entity.skinnum >= 0 && entity.skinnum < paliashdr.numskins )
		? entity.skinnum : 0;
	const original = paliashdr.texels[ skinnum ];
	if ( original == null )
		return;

	const inwidth = paliashdr.skinwidth;
	const inheight = paliashdr.skinheight;

	// Build translated 32-bit pixels
	const translate32 = new Uint32Array( 256 );
	for ( let i = 0; i < 256; i ++ )
		translate32[ i ] = d_8to24table[ translate[ i ] ];

	const scaled_width = Math.min( 512, inwidth );
	const scaled_height = Math.min( 256, inheight );

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
