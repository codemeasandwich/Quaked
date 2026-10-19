/**
 * @module engine/render/gl_rsurf_liquids
 *
 * The liquids and sky (card [44i], split from gl_rsurf.js): water, slime, lava and teleporter surfaces of the world
 * and of brush entities (gl_rsurf_brush.js, card [END2]; their materials, the warped polygons, their light from the
 * world's lightmaps) and the scrolling sky, each surface a mesh kept for the session and shown on the frames that
 * draw it.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `_waterMeshesInScene`, `_waterMeshesThisFrame`,
 * `waterLightWorld`, `waterLightFrame`, `waterLightStyle`, `waterLightRevision`, `solidSkyMaterial`,
 * `alphaSkyMaterial`; 4 module-level collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `R_LiquidsBeginFrame` starts a frame's set of drawn liquid and sky meshes and `R_CleanupWaterMeshes` removes the
 * ones not drawn; `R_LiquidsClear` and `R_SkyClear` throw everything away at a map load.
 */
import * as THREE from 'three';
import { R_FogSkyMaterial } from './r_fog.js';
import { R_MilkyWaySkyLayers, R_MilkyWaySkyClear } from '../common/hooks.js';
import { R_SkyBoxMaterial } from './r_skybox.js';
import { R_NewerLightingActive } from '../common/hooks.js'; // installed by newer/mode.js
import { cl } from '../client/client.js';
import { R_RegisterGlow, R_GlowBoostForTexture, R_PostActive, R_WaterActive, R_PostNoteSky, R_LiquidOpacity, R_IsWaterTextureName, r_newdark } from '../common/hooks.js'; // installed by newer/render/gl_post.js
import { R_PortalsActive, R_PortalNoteVisible, R_PortalMaterial } from '../common/hooks.js'; // installed by newer/render/gl_portal.js
import { R_NewerGame, R_MapLiquidAlpha, R_MapLiquidAlphaAny } from '../common/hooks.js'; // installed by newer/mode.js and newer/render/r_mapliquids.js
import { R_LightPointValue } from './gl_rlight.js';
import { r_origin } from './render.js';
import { VERTEXSIZE, r_framecount, d_lightstylevalue, r_wateralpha, r_viewleaf } from './gl_rmain.js';
import { solidskytexture, alphaskytexture } from './gl_model.js';
import { realtime } from '../common/host_state.js';
import { worldState } from './gl_rsurf_state.js';
import { GameProfile_IsHexen2 } from '../common/game_profile.js';

// Turbulent surface sin table for water/sky warping
const TURBSCALE = ( 256.0 / ( 2 * Math.PI ) );
const turbsin = new Float32Array( [
	0, 0.19633, 0.392541, 0.588517, 0.784137, 0.979285, 1.17384, 1.3677,
	1.56072, 1.75281, 1.94384, 2.1337, 2.32228, 2.50945, 2.69512, 2.87916,
	3.06147, 3.24193, 3.42044, 3.59689, 3.77117, 3.94319, 4.11282, 4.27998,
	4.44456, 4.60647, 4.76559, 4.92185, 5.07515, 5.22538, 5.37247, 5.51632,
	5.65685, 5.79398, 5.92761, 6.05767, 6.18408, 6.30677, 6.42566, 6.54068,
	6.65176, 6.75883, 6.86183, 6.9607, 7.05537, 7.14579, 7.23191, 7.31368,
	7.39104, 7.46394, 7.53235, 7.59623, 7.65552, 7.71021, 7.76025, 7.80562,
	7.84628, 7.88222, 7.91341, 7.93984, 7.96148, 7.97832, 7.99036, 7.99759,
	8, 7.99759, 7.99036, 7.97832, 7.96148, 7.93984, 7.91341, 7.88222,
	7.84628, 7.80562, 7.76025, 7.71021, 7.65552, 7.59623, 7.53235, 7.46394,
	7.39104, 7.31368, 7.23191, 7.14579, 7.05537, 6.9607, 6.86183, 6.75883,
	6.65176, 6.54068, 6.42566, 6.30677, 6.18408, 6.05767, 5.92761, 5.79398,
	5.65685, 5.51632, 5.37247, 5.22538, 5.07515, 4.92185, 4.76559, 4.60647,
	4.44456, 4.27998, 4.11282, 3.94319, 3.77117, 3.59689, 3.42044, 3.24193,
	3.06147, 2.87916, 2.69512, 2.50945, 2.32228, 2.1337, 1.94384, 1.75281,
	1.56072, 1.3677, 1.17384, 0.979285, 0.784137, 0.588517, 0.392541, 0.19633,
	0, -0.19633, -0.392541, -0.588517, -0.784137, -0.979285, -1.17384, -1.3677,
	-1.56072, -1.75281, -1.94384, -2.1337, -2.32228, -2.50945, -2.69512, -2.87916,
	-3.06147, -3.24193, -3.42044, -3.59689, -3.77117, -3.94319, -4.11282, -4.27998,
	-4.44456, -4.60647, -4.76559, -4.92185, -5.07515, -5.22538, -5.37247, -5.51632,
	-5.65685, -5.79398, -5.92761, -6.05767, -6.18408, -6.30677, -6.42566, -6.54068,
	-6.65176, -6.75883, -6.86183, -6.9607, -7.05537, -7.14579, -7.23191, -7.31368,
	-7.39104, -7.46394, -7.53235, -7.59623, -7.65552, -7.71021, -7.76025, -7.80562,
	-7.84628, -7.88222, -7.91341, -7.93984, -7.96148, -7.97832, -7.99036, -7.99759,
	-8, -7.99759, -7.99036, -7.97832, -7.96148, -7.93984, -7.91341, -7.88222,
	-7.84628, -7.80562, -7.76025, -7.71021, -7.65552, -7.59623, -7.53235, -7.46394,
	-7.39104, -7.31368, -7.23191, -7.14579, -7.05537, -6.9607, -6.86183, -6.75883,
	-6.65176, -6.54068, -6.42566, -6.30677, -6.18408, -6.05767, -5.92761, -5.79398,
	-5.65685, -5.51632, -5.37247, -5.22538, -5.07515, -4.92185, -4.76559, -4.60647,
	-4.44456, -4.27998, -4.11282, -3.94319, -3.77117, -3.59689, -3.42044, -3.24193,
	-3.06147, -2.87916, -2.69512, -2.50945, -2.32228, -2.1337, -1.94384, -1.75281,
	-1.56072, -1.3677, -1.17384, -0.979285, -0.784137, -0.588517, -0.392541, -0.19633,
] );

// Water/sky mesh tracking: Set-based approach to add/remove from scene
// without creating/disposing meshes every frame
let _waterMeshesInScene = new Set();
let _waterMeshesThisFrame = new Set();

// Water/sky material caches: texture -> material (avoid per-frame material creation)
const _waterMaterialCache = new Map();

/*
================
_getWaterMaterial

Returns a cached material for water/turb surfaces. Keyed by texture object.
================
*/
/**
 * The material for a liquid surface (water, slime, lava, teleporter), cached by texture, by whether it is see-through
 * and by whether the HDR pipeline draws liquids. Under that pipeline the liquid's own opacity applies (lower still,
 * by a fifth, seen from inside water or slime), a see-through liquid leaves the depth buffer to what is behind it,
 * clear water takes per-vertex brightness from the world's light, and a glowing liquid registers its glow. Exported
 * also as `R_LiquidSurfaceMaterial`.
 *
 * @param {?texture_t} t the surface's texture (null: a plain blue material)
 * @param {number} opacity 0..1, `r_wateralpha` for water or 1
 * @returns {THREE.MeshBasicMaterial} the cached material, its opacity and depth writing set for this call
 */
export function _getWaterMaterial( t, opacity ) {

	// HDR pipeline: liquids are see-through and leave the depth buffer to what is
	// behind them, so the post pass can tint and light the floor correctly.
	const hdr = R_WaterActive();
	if ( hdr && t != null && t.name != null ) {

		opacity = R_LiquidOpacity( t.name, opacity );

		// Retain a subtle underside texture cue; the compositor supplies the
		// Snell window and internal reflections rather than making it disappear.
		if ( opacity < 1 && r_viewleaf != null && ( r_viewleaf.contents === - 3 || r_viewleaf.contents === - 4 ) )
			opacity *= 0.8;

	}

	// Use texture + opacity bucket as key
	const opKey = opacity < 1.0 ? 0 : 1;
	const key = ( t && t.gl_texture ) ? t.gl_texture : null;
	const cacheKey = `${key ? key.id : 0}:${opKey}:${hdr ? 1 : 0}`;

	let material = _waterMaterialCache.get( cacheKey );
	if ( ! material ) {

		// Keep the original texture and its turbulent UVs. Only clear Newer water
		// takes contextual baked brightness from its geometry instead of glowing
		// fullbright; reflections and refraction remain in the compositor.
		const clearWater = hdr && t != null && R_IsWaterTextureName( t.name );

		material = new THREE.MeshBasicMaterial( {
			map: ( t && t.gl_texture ) ? t.gl_texture : null,
			color: ( t && t.gl_texture ) || clearWater ? 0xffffff : 0x406080,
			transparent: true,
			opacity: opacity,
			vertexColors: clearWater,
			side: THREE.DoubleSide
		} );
		_waterMaterialCache.set( cacheKey, material );

		const glow = t != null && t.name != null ? R_GlowBoostForTexture( t.name ) : 1;
		if ( glow !== 1 ) R_RegisterGlow( material, glow );

	}
	if ( material.opacity !== opacity ) material.opacity = opacity;

	const depthWrite = ! ( hdr && opacity < 1 );
	if ( material.depthWrite !== depthWrite ) material.depthWrite = depthWrite;

	return material;

}

export { _getWaterMaterial as R_LiquidSurfaceMaterial };


let waterLightWorld = null, waterLightFrame = - 1, waterLightStyle = '', waterLightRevision = 0;
const waterPointValues = new Map();

/**
 * Forgets the clear-water light cache (the world, frame and light styles it was made for, and its sampled points) so
 * the next `R_UpdateWaterTextureLight` samples again. Called at each map load (`GL_BuildLightmaps`).
 */
export function clearWaterTextureLight() {

	waterLightWorld = null; waterLightFrame = - 1; waterLightStyle = ''; waterPointValues.clear(); waterLightRevision ++;

}

/**
 * Gives a clear-water liquid geometry per-vertex brightness from the world's light, so Newer Game's clear water takes
 * contextual baked brightness instead of glowing fullbright. Called for every liquid mesh drawn with a
 * vertex-coloured material (`_getWaterMesh`), so once per surface per frame.
 *
 * Reuses raw vertex samples (`R_LightPointValue`) at shared positions, refreshed when light styles change; static
 * lighting does not need repeated BSP traces. Derived colours refresh independently for the lighting switch/light
 * curve (`r_newdark` while the Newer lighting is on). Native materials ignore this attribute, so their
 * texture/brightness path is unaffected. The sample cache is per world and is cleared by `GL_BuildLightmaps`.
 *
 * @param {THREE.BufferGeometry} geometry the liquid geometry (Quake units, world space); mutated: gains a `color`
 * attribute (brightness 0..2 per channel) and a `userData.waterTextureLight` cache
 * @param {model_t} [world=cl.worldmodel] the world model to sample light from
 */
export function R_UpdateWaterTextureLight( geometry, world = cl.worldmodel ) {

	if ( world !== waterLightWorld ) {

		clearWaterTextureLight(); waterLightWorld = world;

	}
	if ( waterLightFrame !== r_framecount ) {

		waterLightFrame = r_framecount;
		const style = Array.from( d_lightstylevalue ).join( ',' );
		if ( style !== waterLightStyle ) {

			waterLightStyle = style; waterPointValues.clear(); waterLightRevision ++;

		}

	}
	let cache = geometry.userData.waterTextureLight;
	if ( ! cache ) {

		const positions = geometry.getAttribute( 'position' ), keys = [];
		for ( let i = 0; i < positions.count; i ++ ) keys.push( `${positions.getX( i )},${positions.getY( i )},${positions.getZ( i )}` );
		const raw = new Float32Array( positions.count ), colours = new Float32Array( positions.count * 3 );
		geometry.setAttribute( 'color', new THREE.BufferAttribute( colours, 3 ) );
		cache = geometry.userData.waterTextureLight = { keys, raw, revision: - 1, gamma: - 1 };

	}
	const refresh = cache.revision !== waterLightRevision;
	if ( refresh ) {

		const positions = geometry.getAttribute( 'position' ), sample = [ 0, 0, 0 ];
		for ( let i = 0; i < positions.count; i ++ ) {

			const key = cache.keys[ i ];
			if ( ! waterPointValues.has( key ) ) {

				sample[ 0 ] = positions.getX( i ); sample[ 1 ] = positions.getY( i ); sample[ 2 ] = positions.getZ( i );
				waterPointValues.set( key, R_LightPointValue( sample, { worldmodel: world } ) );

			}
			cache.raw[ i ] = waterPointValues.get( key );

		}
		cache.revision = waterLightRevision;

	}
	const gamma = R_NewerLightingActive() ? Math.max( 1, r_newdark.value ) : 1;
	if ( refresh || cache.gamma !== gamma ) {

		const colours = geometry.getAttribute( 'color' );
		for ( let i = 0; i < cache.raw.length; i ++ ) {

			// R_LightPoint returns sample*style/256; the world atlas stores
			// sample*style/128, then applies its curve and lightMapIntensity2.
			const brightness = Math.pow( Math.min( 1, Math.max( 0, cache.raw[ i ] / 128 ) ), gamma ) * 2;
			colours.setXYZ( i, brightness, brightness, brightness );

		}
		colours.needsUpdate = true; cache.gamma = gamma;

	}

}

/*
================
_getWaterMesh

Returns a cached Mesh for a water/turb surface. Cached on the surface object.
================
*/
/**
 * The mesh of a liquid surface for this frame: kept on the surface (`_waterMesh`), given this frame's geometry and
 * material (a teleporter that links to a receiver shows the receiver's view instead while portals are on), put in
 * `renderGroup` and counted as drawn this frame. A clear-water material first takes the world's light.
 *
 * @param {msurface_t} s the liquid surface
 * @param {THREE.BufferGeometry} geometry its warped polygons (`EmitWaterPolysQuake`)
 * @param {THREE.Material} material its material (`_getWaterMaterial`)
 * @param {THREE.Group} renderGroup the group to draw it in (the world's, or a brush entity's)
 * @param {boolean} [wakePortal=true] whether a window face makes its window live this frame (false for a brush entity
 *   drawn only because a window's far side shows it)
 * @returns {THREE.Mesh} the surface's mesh
 */
export function _getWaterMesh( s, geometry, material, renderGroup, wakePortal = true ) {

	if ( material.vertexColors ) R_UpdateWaterTextureLight( geometry );

	// teleporter surfaces become live windows onto their receiver
	if ( s._portal != null && R_PortalsActive() ) {

		material = R_PortalMaterial( s._portal, material.map );
		if ( wakePortal ) R_PortalNoteVisible( s._portal );

	}

	let mesh = s._waterMesh;
	if ( ! mesh ) {

		mesh = new THREE.Mesh( geometry, material );
		mesh.userData.quakeLiquid = s.texinfo.texture;
		s._waterMesh = mesh;

	} else {

		if ( mesh.geometry !== geometry ) mesh.geometry = geometry;
		if ( mesh.material !== material ) mesh.material = material;

	}

	// Ensure mesh is in the correct parent group
	if ( mesh.parent !== renderGroup ) {

		if ( mesh.parent ) mesh.parent.remove( mesh );
		renderGroup.add( mesh );

	}

	_waterMeshesThisFrame.add( mesh );
	_waterMeshesInScene.add( mesh );

	return mesh;

}

/**
 * How see-through a liquid surface is drawn: `r_wateralpha`, as WinQuake; in Newer Game a map's own value for that
 * liquid where its Newer treatment is switched off (newer/render/r_mapliquids.js, card T-3faa98e3 item 13).
 *
 * Hexen II marks only its own `*rtex078` and `*lowlight` warp textures `SURF_TRANSLUCENT`; its other liquids and the
 * `*BLACK` visibility breaker are drawn opaque however `r_wateralpha` is set (uhexen2 engine/h2shared/model.c
 * Mod_SetDrawingFlags and engine/hexen2/gl_rsurf.c R_DrawWaterSurfaces: the sheet is only blended for those two).
 *
 * @param {?texture_t} t the liquid's texture
 * @returns {number} 0..1
 */
export function R_LiquidAlpha( t ) {

	if ( GameProfile_IsHexen2() ) {

		const name = ( t?.name ?? '' ).toLowerCase();
		// always see-through: the two textures Raven flagged SURF_TRANSLUCENT
		if ( name.startsWith( '*rtex078' ) || name.startsWith( '*lowlight' ) ) return r_wateralpha.value;
		// *BLACK is an opaque black vis-breaker
		if ( name.startsWith( '*black' ) ) return 1;
		// the rest of Hexen II's liquids are opaque in the native GL renderer; the enhanced water still draws them
		if ( R_NewerGame() ) return R_MapLiquidAlpha( t?.name ) ?? r_wateralpha.value;
		return 1;

	}

	if ( ! R_NewerGame() ) return r_wateralpha.value;
	return R_MapLiquidAlpha( t?.name ) ?? r_wateralpha.value;

}

/**
 * Whether the translucent liquid pass has anything to draw: `r_wateralpha` below 1, or (Newer Game) a map's own
 * see-through value in use.
 *
 * @returns {boolean}
 */
export function R_LiquidAlphaAny() {

	return r_wateralpha.value !== 1.0 || ( R_NewerGame() && R_MapLiquidAlphaAny() );

}

/**
 * The material the Classic comparison pass (gl_rmain.js) starts from for a scene object. Chains were consumed by the
 * enhanced draw, so the pass prepares the already visible surfaces directly instead of trying to draw those empty
 * chains a second time: a liquid mesh gets its liquid material again at `r_wateralpha`, anything else keeps its own.
 *
 * @param {THREE.Object3D} mesh a scene object; a liquid carries its texture_t in `userData.quakeLiquid`
 * @returns {THREE.Material|Array<THREE.Material>|undefined} the source material (cached for liquids), or the
 * object's own `material`, which is undefined for objects without one
 */
export function R_ClassicSurfaceMaterial( mesh ) {

	if ( mesh.userData.quakeLiquid )
		return _getWaterMaterial( mesh.userData.quakeLiquid, r_wateralpha.value );
	return mesh.material;

}

//============================================================================
// DrawGLWaterPoly
//============================================================================

/**
 * Warp the vertex coordinates for water surfaces (WinQuake gl_rsurf.c): x and y move by up to 8 Quake units along
 * sine waves of the position and `cl.time`; z is kept. The renderer's own liquids use the turbulent UVs of
 * `EmitWaterPolysQuake` instead, so nothing in the engine calls this.
 *
 * @param {?glpoly_t} p the polygon (VERTEXSIZE floats per vertex: x, y, z, then s, t)
 * @returns {?THREE.BufferGeometry} a new non-indexed geometry with warped `position`, the poly's `uv` and computed
 * normals, or null when `p` is null or has fewer than 3 vertices
 */
export function DrawGLWaterPoly( p ) {

	if ( ! p || p.numverts < 3 ) return null;

	const numverts = p.numverts;
	const verts = p.verts;
	const numTriangles = numverts - 2;
	const realtime = cl ? cl.time : 0;

	const positions = new Float32Array( numTriangles * 3 * 3 );
	const uvs = new Float32Array( numTriangles * 3 * 2 );

	// precompute warped positions
	const warped = new Float32Array( numverts * 3 );
	for ( let i = 0; i < numverts; i ++ ) {

		const vi = i * VERTEXSIZE;
		const x = verts[ vi + 0 ];
		const y = verts[ vi + 1 ];
		const z = verts[ vi + 2 ];

		warped[ i * 3 + 0 ] = x + 8 * Math.sin( y * 0.05 + realtime ) * Math.sin( z * 0.05 + realtime );
		warped[ i * 3 + 1 ] = y + 8 * Math.sin( x * 0.05 + realtime ) * Math.sin( z * 0.05 + realtime );
		warped[ i * 3 + 2 ] = z;

	}

	for ( let i = 0; i < numTriangles; i ++ ) {

		const i0 = 0;
		const i1 = i + 1;
		const i2 = i + 2;

		positions[ i * 9 + 0 ] = warped[ i0 * 3 + 0 ];
		positions[ i * 9 + 1 ] = warped[ i0 * 3 + 1 ];
		positions[ i * 9 + 2 ] = warped[ i0 * 3 + 2 ];

		positions[ i * 9 + 3 ] = warped[ i1 * 3 + 0 ];
		positions[ i * 9 + 4 ] = warped[ i1 * 3 + 1 ];
		positions[ i * 9 + 5 ] = warped[ i1 * 3 + 2 ];

		positions[ i * 9 + 6 ] = warped[ i2 * 3 + 0 ];
		positions[ i * 9 + 7 ] = warped[ i2 * 3 + 1 ];
		positions[ i * 9 + 8 ] = warped[ i2 * 3 + 2 ];

		uvs[ i * 6 + 0 ] = verts[ i0 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 1 ] = verts[ i0 * VERTEXSIZE + 4 ];

		uvs[ i * 6 + 2 ] = verts[ i1 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 3 ] = verts[ i1 * VERTEXSIZE + 4 ];

		uvs[ i * 6 + 4 ] = verts[ i2 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 5 ] = verts[ i2 * VERTEXSIZE + 4 ];

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
	geometry.computeVertexNormals();

	return geometry;

}

//============================================================================
// EmitWaterPolysQuake
//
// Builds water geometry with warped UVs in Quake coordinate space.
// Unlike gl_warp.js version, keeps coordinates in Quake space to match
// the world geometry and camera setup.
//============================================================================

/**
 * A liquid surface's warped geometry in Quake coordinates. The positions, indices and original texture coordinates
 * are built once and kept on the surface (`_waterGeoCache`); each call only recomputes the turbulent texture
 * coordinates (WinQuake's turbsin warp, 1/64 of the texture per unit).
 *
 * @param {msurface_t} fa the liquid surface, its polygons in `polys` (linked through `next`)
 * @param {number} realtime the warp's time in seconds
 * @returns {?THREE.BufferGeometry} the surface's geometry (the same object every call), or null when it has no vertices
 */
export function EmitWaterPolysQuake( fa, realtime ) {

	// Use cached geometry on the surface to avoid per-frame allocation.
	// Positions are static; only UVs change each frame due to turbulence.
	let cached = fa._waterGeoCache;

	if ( ! cached ) {

		// First time: build positions, UVs, indices and cache them
		const posArr = [];
		const uvArr = [];
		const idxArr = [];
		let vertexCount = 0;

		for ( let p = fa.polys; p; p = p.next ) {

			const startVert = vertexCount;
			const numverts = p.numverts;

			for ( let i = 0; i < numverts; i ++ ) {

				let vx, vy, vz, os, ot;

				if ( p.verts instanceof Float32Array ) {

					const vi = i * VERTEXSIZE;
					vx = p.verts[ vi + 0 ];
					vy = p.verts[ vi + 1 ];
					vz = p.verts[ vi + 2 ];
					os = p.verts[ vi + 3 ];
					ot = p.verts[ vi + 4 ];

				} else {

					const v = p.verts[ i ];
					vx = v[ 0 ];
					vy = v[ 1 ];
					vz = v[ 2 ];
					os = v[ 3 ];
					ot = v[ 4 ];

				}

				posArr.push( vx, vy, vz );
				uvArr.push( os, ot ); // store original s/t for turbulence calc
				vertexCount ++;

			}

			for ( let i = 2; i < numverts; i ++ ) {

				idxArr.push( startVert, startVert + i - 1, startVert + i );

			}

		}

		if ( posArr.length === 0 )
			return null;

		const positions = new Float32Array( posArr );
		const uvs = new Float32Array( uvArr );
		const turbUvs = new Float32Array( uvArr.length );

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
		geometry.setAttribute( 'uv', new THREE.BufferAttribute( turbUvs, 2 ) );
		geometry.setIndex( idxArr );
		geometry.computeVertexNormals();

		cached = { geometry, origUvs: uvs, turbUvs, vertexCount };
		fa._waterGeoCache = cached;

	}

	// Update turbulent UVs each frame
	const origUvs = cached.origUvs;
	const turbUvs = cached.turbUvs;
	const count = cached.vertexCount;

	for ( let i = 0; i < count; i ++ ) {

		const os = origUvs[ i * 2 ];
		const ot = origUvs[ i * 2 + 1 ];

		let s = os + turbsin[ ( ( ot * 0.125 + realtime ) * TURBSCALE | 0 ) & 255 ];
		s *= ( 1.0 / 64 );

		let t = ot + turbsin[ ( ( os * 0.125 + realtime ) * TURBSCALE | 0 ) & 255 ];
		t *= ( 1.0 / 64 );

		turbUvs[ i * 2 ] = s;
		turbUvs[ i * 2 + 1 ] = t;

	}

	cached.geometry.attributes.uv.needsUpdate = true;

	return cached.geometry;

}

//============================================================================
// EmitSkyPolysQuake
//
// Builds sky geometry in Quake coordinate space.
// layer: 0 = solid layer, 1 = alpha layer
//============================================================================

function EmitSkyPolysQuake( fa, speedscale, layer ) {

	// Sky positions are static per surface; UVs depend on camera origin and speedscale.
	// Cache the geometry and positions; update UVs in place each frame.

	// We use two caches per surface: _skyGeoCache (solid layer) and _skyGeoCache2 (alpha layer)
	const cacheKey = layer === 1 ? '_skyGeoCache2' : '_skyGeoCache';
	let cached = fa[ cacheKey ];

	if ( ! cached ) {

		// First time: build positions and indices
		const posArr = [];
		const idxArr = [];
		let vertexCount = 0;

		for ( let p = fa.polys; p; p = p.next ) {

			const startVert = vertexCount;
			const numverts = p.numverts;

			for ( let i = 0; i < numverts; i ++ ) {

				let vx, vy, vz;

				if ( p.verts instanceof Float32Array ) {

					const vi = i * VERTEXSIZE;
					vx = p.verts[ vi + 0 ];
					vy = p.verts[ vi + 1 ];
					vz = p.verts[ vi + 2 ];

				} else {

					const v = p.verts[ i ];
					vx = v[ 0 ];
					vy = v[ 1 ];
					vz = v[ 2 ];

				}

				posArr.push( vx, vy, vz );
				vertexCount ++;

			}

			for ( let i = 2; i < numverts; i ++ ) {

				idxArr.push( startVert, startVert + i - 1, startVert + i );

			}

		}

		if ( posArr.length === 0 )
			return null;

		const positions = new Float32Array( posArr );
		const uvs = new Float32Array( vertexCount * 2 );

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
		geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
		geometry.setIndex( idxArr );

		cached = { geometry, positions, uvs, vertexCount };
		fa[ cacheKey ] = cached;

	}

	// Update UVs based on current camera origin and speedscale
	const pos = cached.positions;
	const uvs = cached.uvs;
	const count = cached.vertexCount;

	for ( let i = 0; i < count; i ++ ) {

		const vx = pos[ i * 3 ];
		const vy = pos[ i * 3 + 1 ];
		const vz = pos[ i * 3 + 2 ];

		let dx = vx - r_origin[ 0 ];
		let dy = vy - r_origin[ 1 ];
		let dz = ( vz - r_origin[ 2 ] ) * 3; // flatten the sphere

		let length = Math.sqrt( dx * dx + dy * dy + dz * dz );
		length = 6 * 63 / length;

		uvs[ i * 2 ] = ( speedscale + dx * length ) * ( 1.0 / 128 );
		uvs[ i * 2 + 1 ] = ( speedscale + dy * length ) * ( 1.0 / 128 );

	}

	cached.geometry.attributes.uv.needsUpdate = true;

	return cached.geometry;

}

/*
================
R_CleanupWaterMeshes
================
*/
/**
 * Remove water/sky meshes that were in the scene last frame but not rendered this frame. Called from R_RenderView
 * (gl_rmain.js) after all water rendering is done. The meshes stay cached on their surfaces for reuse.
 */
export function R_CleanupWaterMeshes() {

	for ( const mesh of _waterMeshesInScene ) {

		if ( ! _waterMeshesThisFrame.has( mesh ) ) {

			if ( mesh.parent ) mesh.parent.remove( mesh );
			_waterMeshesInScene.delete( mesh );

		}

	}

}

/**
 * Throws away the previous map's liquid and sky meshes (part of `GL_BuildLightmaps`): takes each out of its group,
 * starts new in-scene and this-frame sets and empties the liquid material cache.
 */
export function R_LiquidsClear() {

	// Clear water/sky mesh caches
	for ( const mesh of _waterMeshesInScene ) {

		if ( mesh.parent ) mesh.parent.remove( mesh );

	}

	_waterMeshesInScene = new Set();
	_waterMeshesThisFrame = new Set();
	_waterMaterialCache.clear();

}

/**
 * Starts a frame's set of drawn liquid and sky meshes (`R_DrawWorld`); `R_CleanupWaterMeshes` later removes those in the
 * scene but not drawn this frame.
 */
export function R_LiquidsBeginFrame() {

	_waterMeshesThisFrame = new Set();

}

//============================================================================
// R_DrawSkyChain
//============================================================================

let solidSkyMaterial = null;
let alphaSkyMaterial = null;

/**
 * Draws a frame's sky surfaces (from `DrawTextureChains`, gl_rsurf.js): two scrolling layers, the solid sky at
 * `realtime` * 8 and the alpha sky over it at `realtime` * 16, each surface's mesh kept on the surface and put in the
 * world's group. The sky materials are made on first use (a plain blue one when the map has no sky texture); under
 * the HDR pipeline they do not write depth, so the volumetric pass finds the openings, and they glow at 1.9. With a
 * skybox (r_skybox.js) the surfaces draw it instead, with the same rules, and the alpha layer is left out. Does nothing
 * before the world's group exists.
 *
 * @param {?msurface_t} s the first sky surface of the frame's chain (linked through `texturechain`)
 */
export function R_DrawSkyChain( s ) {

	if ( ! worldState.group ) return;

	R_PostNoteSky();

	// Create or update sky materials from the sky textures
	if ( solidskytexture && ! solidSkyMaterial ) {

		solidSkyMaterial = R_FogSkyMaterial( new THREE.MeshBasicMaterial( {
			map: solidskytexture,
			side: THREE.DoubleSide
		} ) ); // fog: the sky's share, not its distance (r_fog.js)

	}

	if ( alphaskytexture && ! alphaSkyMaterial ) {

		alphaSkyMaterial = R_FogSkyMaterial( new THREE.MeshBasicMaterial( {
			map: alphaskytexture,
			side: THREE.DoubleSide,
			transparent: true,
			alphaTest: 0.05
		} ) );

	}

	// Fallback if sky textures not loaded
	if ( ! solidSkyMaterial ) {

		solidSkyMaterial = R_FogSkyMaterial( new THREE.MeshBasicMaterial( {
			color: 0x3366aa,
			side: THREE.DoubleSide
		} ) );

	}

	// With the HDR pipeline the sky must not write depth: pixels that show sky
	// keep the far-plane depth, which is how the volumetric pass finds openings.
	const skyDepthWrite = ! R_PostActive();
	if ( solidSkyMaterial && solidSkyMaterial.depthWrite !== skyDepthWrite ) solidSkyMaterial.depthWrite = skyDepthWrite;
	if ( alphaSkyMaterial && alphaSkyMaterial.depthWrite !== skyDepthWrite ) alphaSkyMaterial.depthWrite = skyDepthWrite;

	// the sky is a light source too: brighter than white lets it bloom around openings
	if ( solidSkyMaterial && solidSkyMaterial.userData.glowBoost === undefined ) R_RegisterGlow( solidSkyMaterial, 1.9 );
	if ( alphaSkyMaterial && alphaSkyMaterial.userData.glowBoost === undefined ) R_RegisterGlow( alphaSkyMaterial, 1.9 );

	// a skybox (r_skybox.js) shows instead: the sky surfaces draw it, looked up by direction from whichever camera draws
	// them, with the same depth, glow and fog rules as the scrolling sky; no cloud layer over it
	const skyBoxMaterial = R_SkyBoxMaterial(), skyBox = skyBoxMaterial !== null;
	if ( skyBox && skyBoxMaterial.depthWrite !== skyDepthWrite ) skyBoxMaterial.depthWrite = skyDepthWrite;
	if ( skyBox && skyBoxMaterial.userData.glowBoost === undefined ) R_RegisterGlow( skyBoxMaterial, 1.9 );
	const night = skyBox ? null : R_MilkyWaySkyLayers( solidskytexture, alphaskytexture );
 if ( night ) {
  if ( night.solid.depthWrite !== skyDepthWrite ) { night.solid.depthWrite = skyDepthWrite; night.solid.needsUpdate = true; }
  if ( night.solid.userData.glowBoost === undefined ) R_RegisterGlow( night.solid, 1.9 );
  if ( night.alpha.userData.glowBoost === undefined ) R_RegisterGlow( night.alpha, 1.9 );
 }
 const solidLayerMaterial = skyBox ? skyBoxMaterial : night ? night.solid : solidSkyMaterial;
 const cloudLayerMaterial = night ? night.alpha : alphaSkyMaterial;

	// Solid sky layer (background, speed = realtime*8)
	let solidSpeed = realtime * 8;
	solidSpeed -= ( solidSpeed | 0 ) & ~127;

	for ( let fa = s; fa; fa = fa.texturechain ) {

		if ( ! fa.polys ) continue;

		const geometry = EmitSkyPolysQuake( fa, solidSpeed, 0 );
		if ( geometry ) {

			// Cache sky mesh on surface, keyed by layer
			let mesh = fa._skyMesh;
			if ( ! mesh ) {

				mesh = new THREE.Mesh( geometry, solidLayerMaterial );
				mesh.userData.quakeSky = true;
				fa._skyMesh = mesh;

			} else {

				if ( mesh.geometry !== geometry ) mesh.geometry = geometry;
				mesh.material = solidLayerMaterial;

			}

			if ( mesh.parent !== worldState.group ) {

				if ( mesh.parent ) mesh.parent.remove( mesh );
				worldState.group.add( mesh );

			}

			_waterMeshesThisFrame.add( mesh );
			_waterMeshesInScene.add( mesh );

		}

	}

	// Alpha sky layer (overlay, speed = realtime*16); none over a skybox
	if ( cloudLayerMaterial && ! skyBox ) {

		let alphaSpeed = realtime * 16;
		alphaSpeed -= ( alphaSpeed | 0 ) & ~127;

		for ( let fa = s; fa; fa = fa.texturechain ) {

			if ( ! fa.polys ) continue;

			const geometry = EmitSkyPolysQuake( fa, alphaSpeed, 1 );
			if ( geometry ) {

				let mesh = fa._skyMesh2;
				if ( ! mesh ) {

					mesh = new THREE.Mesh( geometry, cloudLayerMaterial );
					mesh.userData.quakeSky = true;
					fa._skyMesh2 = mesh;

				} else {

					if ( mesh.geometry !== geometry ) mesh.geometry = geometry;
					mesh.material = cloudLayerMaterial;

				}

				if ( mesh.parent !== worldState.group ) {

					if ( mesh.parent ) mesh.parent.remove( mesh );
					worldState.group.add( mesh );

				}

				_waterMeshesThisFrame.add( mesh );
				_waterMeshesInScene.add( mesh );

			}

		}

	}

}

/**
 * Disposes the two sky materials so the next map's sky textures are picked up (part of `GL_BuildLightmaps`).
 */
export function R_SkyClear() {

 R_MilkyWaySkyClear();

	// Reset sky materials so they pick up new sky textures
	if ( solidSkyMaterial ) { solidSkyMaterial.dispose(); solidSkyMaterial = null; }
	if ( alphaSkyMaterial ) { alphaSkyMaterial.dispose(); alphaSkyMaterial = null; }

}
