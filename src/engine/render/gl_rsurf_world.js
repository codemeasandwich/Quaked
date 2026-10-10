/**
 * @module engine/render/gl_rsurf_world
 *
 * The world's walk and its surfaces (card [44i], split from gl_rsurf.js): the BSP walk that chains each frame's
 * visible surfaces by texture, the chains' drawing (sky, liquids, the rest), a surface's own drawing for brush
 * entities and `gl_texsort 0`, and the lightmaps that change under light styles and dynamic lights.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `skytexturenum`; module-level variables `skychain`, `waterchain`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `R_DrawWorld` (gl_rsurf.js) walks the tree (`R_RecursiveWorldNode`) and draws the chains (`DrawTextureChains`);
 * `R_DrawWaterSurfaces` draws the see-through liquids afterwards (gl_rmain.js).
 */
import { R_NewerGame } from '../common/hooks.js'; // installed by newer/mode.js
import { R_ArchSurfaceHidden } from '../common/hooks.js'; // installed by newer/render/r_archframe.js
import { cl, MAX_VISEDICTS, cl_visedicts, cl_numvisedicts, set_cl_numvisedicts } from '../client/client.js';
import { R_StoreEfrags } from './gl_refrag.js';
import { R_GetPortals, R_PortalsActive } from '../common/hooks.js'; // installed by newer/render/gl_portal.js
import { PLANE_X, PLANE_Y, PLANE_Z, SURF_PLANEBACK, SURF_DRAWSKY, SURF_DRAWTURB, SURF_UNDERWATER, MAXLIGHTMAPS, modelorg, r_visframecount, r_framecount, mirror, mirrortexturenum, d_lightstylevalue, r_dynamic, r_wateralpha, r_mirroralpha, gl_texsort, R_CullBox, inc_c_brush_polys, set_mirror, set_mirror_plane } from './gl_rmain.js';
import { DotProduct } from '../common/mathlib.js';
import { realtime } from '../common/host_state.js';
import { worldState } from './gl_rsurf_state.js';
import { BLOCK_WIDTH, BLOCK_HEIGHT, lightmap_bytes, lightmap_polys, lightmap_modified, lightmap_rectchange, lightmaps, R_BuildLightMap } from './gl_rsurf_lightmaps.js';
import { R_TextureAnimation } from './gl_rsurf_materials.js';
import { _getWaterMaterial, _getWaterMesh, EmitWaterPolysQuake, R_DrawSkyChain } from './gl_rsurf_liquids.js';

//============================================================================
// Module-level state
//============================================================================

export let skytexturenum = - 1; // index in cl.loadmodel, not gl texture object
/**
 * Sets `skytexturenum`, the world texture whose chain `DrawTextureChains` draws as sky. Set at map load by
 * `R_NewMap` (gl_rmisc.js) to the last texture whose name starts with `sky`.
 *
 * @param {number} v index into `cl.worldmodel.textures`, or -1 for none (not a GL texture object)
 */
export function set_skytexturenum( v ) { skytexturenum = v; }

// For gl_texsort 0
let skychain = null; // msurface_t
let waterchain = null; // msurface_t

// Pre-allocated scratch arrays to avoid per-frame allocations
const _cullBoxMaxs = new Float32Array( 3 ); // for R_CullBox in R_RecursiveWorldNode

//============================================================================
// R_DrawSequentialPoly
//============================================================================

/**
 * Systems that have fast state and texture changes can just do everything as it passes with no need to sort
 * (WinQuake gl_rsurf.c, the `gl_texsort 0` path). A lightmapped surface (including an underwater one) is queued on
 * its lightmap chain and its lightmap rebuilt if needed (`R_RenderDynamicLightmaps`); a turbulent surface gets its
 * liquid mesh for this frame in the current render group; sky is skipped here. Called from the world walk for each
 * visible surface while `gl_texsort` is 0.
 *
 * @param {msurface_t} s the surface
 */
export function R_DrawSequentialPoly( s ) {

	//
	// normal lightmaped poly
	//
	if ( ! ( s.flags & ( SURF_DRAWSKY | SURF_DRAWTURB | SURF_UNDERWATER ) ) ) {

		R_RenderDynamicLightmaps( s );
		return;

	}

	//
	// subdivided water surface warp
	//
	if ( s.flags & SURF_DRAWTURB ) {

		const renderGroup = worldState.renderGroup || worldState.group;
		if ( s.polys && renderGroup ) {

			const realtime = cl ? cl.time : 0;
			const geometry = EmitWaterPolysQuake( s, realtime );
			if ( geometry ) {

				const t = R_TextureAnimation( s.texinfo.texture );
				const material = _getWaterMaterial( t, r_wateralpha.value );
				_getWaterMesh( s, geometry, material, renderGroup );

			}

		}

		return;

	}

	//
	// subdivided sky warp
	//
	if ( s.flags & SURF_DRAWSKY ) {

		// Sky rendering -- skip for now (needs sky texture setup)
		return;

	}

	//
	// underwater warped with lightmap
	//
	R_RenderDynamicLightmaps( s );

}

//============================================================================
// R_RenderBrushPoly
//============================================================================

/**
 * Draws one surface of a texture chain (WinQuake gl_rsurf.c): counts it in `c_brush_polys`, skips sky (drawn from
 * the sky chain), gives a turbulent surface its liquid mesh for this frame, and otherwise links the surface's polys
 * onto its lightmap's chain and, while `r_dynamic` is on, rebuilds its lightmap into the atlas when a light style
 * changed or a dynamic light touches it (now or last frame), widening the atlas's changed rectangle. Called by
 * `DrawTextureChains` for each chained surface. `R_BlendLightmaps` uploads the changes.
 *
 * @param {msurface_t} fa the surface; mutated (`polys.chain`, `cached_light`, `cached_dlight`)
 */
export function R_RenderBrushPoly( fa ) {

	let t;
	let maps;

	inc_c_brush_polys();

	if ( fa.flags & SURF_DRAWSKY ) {

		// Sky surfaces are rendered via skychain in R_DrawSkyChain, not here
		return;

	}

	t = R_TextureAnimation( fa.texinfo.texture );

	if ( fa.flags & SURF_DRAWTURB ) {

		const renderGroup = worldState.renderGroup || worldState.group;
		if ( fa.polys && renderGroup ) {

			const realtime = cl ? cl.time : 0;
			const geometry = EmitWaterPolysQuake( fa, realtime );
			if ( geometry ) {

				const material = _getWaterMaterial( t, r_wateralpha.value );
				_getWaterMesh( fa, geometry, material, renderGroup );

			}

		}

		return;

	}

	// add the poly to the proper lightmap chain
	if ( fa.polys ) {

		fa.polys.chain = lightmap_polys[ fa.lightmaptexturenum ];
		lightmap_polys[ fa.lightmaptexturenum ] = fa.polys;

	}

	// check for lightmap modification
	for ( maps = 0; maps < MAXLIGHTMAPS && fa.styles[ maps ] !== 255; maps ++ ) {

		if ( d_lightstylevalue[ fa.styles[ maps ] ] !== fa.cached_light[ maps ] ) {

			// dynamic -- need to rebuild lightmap
			if ( r_dynamic.value ) {

				lightmap_modified[ fa.lightmaptexturenum ] = true;
				const theRect = lightmap_rectchange[ fa.lightmaptexturenum ];
				if ( fa.light_t < theRect.t ) {

					if ( theRect.h )
						theRect.h += theRect.t - fa.light_t;
					theRect.t = fa.light_t;

				}

				if ( fa.light_s < theRect.l ) {

					if ( theRect.w )
						theRect.w += theRect.l - fa.light_s;
					theRect.l = fa.light_s;

				}

				const smax = ( fa.extents[ 0 ] >> 4 ) + 1;
				const tmax = ( fa.extents[ 1 ] >> 4 ) + 1;
				if ( ( theRect.w + theRect.l ) < ( fa.light_s + smax ) )
					theRect.w = ( fa.light_s - theRect.l ) + smax;
				if ( ( theRect.h + theRect.t ) < ( fa.light_t + tmax ) )
					theRect.h = ( fa.light_t - theRect.t ) + tmax;

				const baseOffset = fa.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
				const offset = baseOffset + fa.light_t * BLOCK_WIDTH * lightmap_bytes + fa.light_s * lightmap_bytes;
				R_BuildLightMap( fa, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

			}

			break;

		}

	}

	// Also check if dynamic this frame or dynamic previously
	if ( fa.dlightframe === r_framecount || fa.cached_dlight ) {

		if ( r_dynamic.value ) {

			lightmap_modified[ fa.lightmaptexturenum ] = true;
			const theRect = lightmap_rectchange[ fa.lightmaptexturenum ];
			if ( fa.light_t < theRect.t ) {

				if ( theRect.h )
					theRect.h += theRect.t - fa.light_t;
				theRect.t = fa.light_t;

			}

			if ( fa.light_s < theRect.l ) {

				if ( theRect.w )
					theRect.w += theRect.l - fa.light_s;
				theRect.l = fa.light_s;

			}

			const smax = ( fa.extents[ 0 ] >> 4 ) + 1;
			const tmax = ( fa.extents[ 1 ] >> 4 ) + 1;
			if ( ( theRect.w + theRect.l ) < ( fa.light_s + smax ) )
				theRect.w = ( fa.light_s - theRect.l ) + smax;
			if ( ( theRect.h + theRect.t ) < ( fa.light_t + tmax ) )
				theRect.h = ( fa.light_t - theRect.t ) + tmax;

			const baseOffset = fa.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
			const offset = baseOffset + fa.light_t * BLOCK_WIDTH * lightmap_bytes + fa.light_s * lightmap_bytes;
			R_BuildLightMap( fa, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

		}

	}

}

//============================================================================
// R_RenderDynamicLightmaps (multitexture path)
//============================================================================

/**
 * The lightmap half of `R_RenderBrushPoly` (WinQuake gl_rsurf.c, multitexture path): counts the surface, skips sky
 * and turbulent surfaces, links its polys onto its lightmap's chain and, while `r_dynamic` is on, rebuilds its
 * lightmap into the atlas when a light style changed or a dynamic light touches it (now or last frame). Called by
 * `R_DrawSequentialPoly` and, every frame for each of a brush entity's surfaces, by `R_DrawBrushModel`, since the
 * atlases are shared with the world.
 *
 * @param {msurface_t} fa the surface; mutated (`polys.chain`, `cached_light`, `cached_dlight`)
 */
export function R_RenderDynamicLightmaps( fa ) {

	let maps;

	inc_c_brush_polys();

	if ( fa.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) )
		return;

	if ( fa.polys ) {

		fa.polys.chain = lightmap_polys[ fa.lightmaptexturenum ];
		lightmap_polys[ fa.lightmaptexturenum ] = fa.polys;

	}

	// check for lightmap modification
	for ( maps = 0; maps < MAXLIGHTMAPS && fa.styles[ maps ] !== 255; maps ++ ) {

		if ( d_lightstylevalue[ fa.styles[ maps ] ] !== fa.cached_light[ maps ] ) {

			if ( r_dynamic.value ) {

				lightmap_modified[ fa.lightmaptexturenum ] = true;
				const theRect = lightmap_rectchange[ fa.lightmaptexturenum ];
				if ( fa.light_t < theRect.t ) {

					if ( theRect.h )
						theRect.h += theRect.t - fa.light_t;
					theRect.t = fa.light_t;

				}

				if ( fa.light_s < theRect.l ) {

					if ( theRect.w )
						theRect.w += theRect.l - fa.light_s;
					theRect.l = fa.light_s;

				}

				const smax = ( fa.extents[ 0 ] >> 4 ) + 1;
				const tmax = ( fa.extents[ 1 ] >> 4 ) + 1;
				if ( ( theRect.w + theRect.l ) < ( fa.light_s + smax ) )
					theRect.w = ( fa.light_s - theRect.l ) + smax;
				if ( ( theRect.h + theRect.t ) < ( fa.light_t + tmax ) )
					theRect.h = ( fa.light_t - theRect.t ) + tmax;

				const baseOffset = fa.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
				const offset = baseOffset + fa.light_t * BLOCK_WIDTH * lightmap_bytes + fa.light_s * lightmap_bytes;
				R_BuildLightMap( fa, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

			}

			break;

		}

	}

	if ( fa.dlightframe === r_framecount || fa.cached_dlight ) {

		if ( r_dynamic.value ) {

			lightmap_modified[ fa.lightmaptexturenum ] = true;
			const theRect = lightmap_rectchange[ fa.lightmaptexturenum ];
			if ( fa.light_t < theRect.t ) {

				if ( theRect.h )
					theRect.h += theRect.t - fa.light_t;
				theRect.t = fa.light_t;

			}

			if ( fa.light_s < theRect.l ) {

				if ( theRect.w )
					theRect.w += theRect.l - fa.light_s;
				theRect.l = fa.light_s;

			}

			const smax = ( fa.extents[ 0 ] >> 4 ) + 1;
			const tmax = ( fa.extents[ 1 ] >> 4 ) + 1;
			if ( ( theRect.w + theRect.l ) < ( fa.light_s + smax ) )
				theRect.w = ( fa.light_s - theRect.l ) + smax;
			if ( ( theRect.h + theRect.t ) < ( fa.light_t + tmax ) )
				theRect.h = ( fa.light_t - theRect.t ) + tmax;

			const baseOffset = fa.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
			const offset = baseOffset + fa.light_t * BLOCK_WIDTH * lightmap_bytes + fa.light_s * lightmap_bytes;
			R_BuildLightMap( fa, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

		}

	}

}

//============================================================================
// R_RecursiveWorldNode
//============================================================================

// Queue a visible world surface for drawing (by texture chain, or right away)
function _chainSurface( surf, worldmodel ) {
	if ( R_NewerGame() && R_ArchSurfaceHidden( surf ) ) return;

	// if sorting by texture, just store it out
	if ( gl_texsort.value ) {

		if ( ! mirror ||
			surf.texinfo.texture !== worldmodel.textures[ mirrortexturenum ] ) {

			surf.texturechain = surf.texinfo.texture.texturechain;
			surf.texinfo.texture.texturechain = surf;

		}

	} else if ( surf.flags & SURF_DRAWSKY ) {

		surf.texturechain = skychain;
		skychain = surf;

	} else if ( surf.flags & SURF_DRAWTURB ) {

		surf.texturechain = waterchain;
		waterchain = surf;

	} else {

		R_DrawSequentialPoly( surf );

	}

}

// Portal views are rendered from the receiver, which the main view's frustum
// walk never reaches.  Hand over what that walk would have produced there:
// static entities, and the sky / water surfaces (world geometry is drawn from
// the PVS, which already includes the receiver's leaves).
/**
 * For each teleporter portal whose source leaf is visible this frame (`R_DrawWorld`, after the BSP walk, while portals
 * are on): stores the receiver leaves' static entity fragments in `cl_visedicts` and chains the receiver's extra sky
 * and liquid surfaces not already chained this frame.
 *
 * @param {model_t} worldmodel the world model
 */
export function R_AddPortalReceiverSurfaces( worldmodel ) {

	if ( ! R_PortalsActive() ) return;

	const portals = R_GetPortals();
	for ( let i = 0; i < portals.length; i ++ ) {

		const portal = portals[ i ];
		if ( portal.srcLeaf.visframe !== r_visframecount ) continue;

		for ( let j = 0; j < portal.destLeafs.length; j ++ ) {

			const leaf = portal.destLeafs[ j ];
			if ( leaf.efrags )
				set_cl_numvisedicts( R_StoreEfrags( leaf.efrags, cl_visedicts, cl_numvisedicts, MAX_VISEDICTS, r_framecount ) );

		}

		for ( let j = 0; j < portal.extraSurfaces.length; j ++ ) {

			const surf = portal.extraSurfaces[ j ];
			if ( surf.visframe === r_framecount ) continue; // already queued
			surf.visframe = r_framecount;
			_chainSurface( surf, worldmodel );

		}

	}

}

/**
 * Walks the world BSP tree front to back from `modelorg` (WinQuake gl_rsurf.c). Skips solid nodes, nodes not in the
 * current PVS (`visframe !== r_visframecount`) and nodes outside the view frustum. At a leaf it marks the leaf's
 * surfaces as visible this frame and stores the leaf's static entity fragments in `cl_visedicts`; at a node it
 * queues the node's world surfaces that face the viewer (underwater ones are not backface-culled, because they warp)
 * by texture chain or, with `gl_texsort` 0, draws them right away. Hidden arch surfaces are skipped in Newer Game.
 * Called by `R_DrawWorld` with the root node each frame.
 *
 * @param {?mnode_t} node the node or leaf (mleaf_t) to walk; null is ignored
 */
export function R_RecursiveWorldNode( node ) {

	if ( ! node ) return;

	if ( node.contents === - 2 ) // CONTENTS_SOLID
		return;

	if ( node.visframe !== r_visframecount )
		return;

	// Use pre-allocated scratch array for maxs to avoid per-call allocation
	_cullBoxMaxs[ 0 ] = node.minmaxs[ 3 ];
	_cullBoxMaxs[ 1 ] = node.minmaxs[ 4 ];
	_cullBoxMaxs[ 2 ] = node.minmaxs[ 5 ];
	if ( R_CullBox( node.minmaxs, _cullBoxMaxs ) )
		return;

	// if a leaf node, draw stuff
	if ( node.contents < 0 ) {

		const pleaf = node; // mleaf_t is a subtype of mnode_t

		if ( pleaf.firstmarksurface && pleaf.nummarksurfaces ) {

			for ( let c = 0; c < pleaf.nummarksurfaces; c ++ ) {

				pleaf.firstmarksurface[ c ].visframe = r_framecount;

			}

		}

		// deal with model fragments in this leaf
		if ( pleaf.efrags ) {

			set_cl_numvisedicts( R_StoreEfrags( pleaf.efrags, cl_visedicts, cl_numvisedicts, MAX_VISEDICTS, r_framecount ) );

		}

		return;

	}

	// node is just a decision point, so go down the appropriate sides

	// find which side of the node we are on
	const plane = node.plane;
	let dot;

	switch ( plane.type ) {

		case PLANE_X:
			dot = modelorg[ 0 ] - plane.dist;
			break;
		case PLANE_Y:
			dot = modelorg[ 1 ] - plane.dist;
			break;
		case PLANE_Z:
			dot = modelorg[ 2 ] - plane.dist;
			break;
		default:
			dot = DotProduct( modelorg, plane.normal ) - plane.dist;
			break;

	}

	const side = dot >= 0 ? 0 : 1;

	// recurse down the children, front side first
	R_RecursiveWorldNode( node.children[ side ] );

	// draw stuff
	const c = node.numsurfaces;

	if ( c ) {

		const cl_ref = cl;
		const worldmodel = cl_ref ? cl_ref.worldmodel : null;

		if ( worldmodel && worldmodel.surfaces ) {

			// Only render surfaces within the world model's surface range.
			// Submodel surfaces (triggers, doors, etc.) share the global
			// surfaces array but must not be drawn during world traversal.
			const worldSurfEnd = worldmodel.firstmodelsurface + worldmodel.nummodelsurfaces;

			for ( let ci = 0; ci < c; ci ++ ) {

				const surfIdx = node.firstsurface + ci;
				if ( surfIdx < worldmodel.firstmodelsurface || surfIdx >= worldSurfEnd )
					continue;

				const surf = worldmodel.surfaces[ surfIdx ];
				if ( ! surf ) continue;

				if ( surf.visframe !== r_framecount )
					continue;

				// don't backface underwater surfaces, because they warp
				if ( ! ( surf.flags & SURF_UNDERWATER ) &&
					( ( dot < 0 ) ^ ! ! ( surf.flags & SURF_PLANEBACK ) ) )
					continue; // wrong side

				_chainSurface( surf, worldmodel );

			}

		}

	}

	// recurse down the back side
	R_RecursiveWorldNode( node.children[ side ? 0 : 1 ] );

}

//============================================================================
// DrawTextureChains
//============================================================================

/**
 * Draws the world's texture chains built by the BSP walk (WinQuake gl_rsurf.c): the sky texture's chain as sky, the
 * mirror texture's chain marks the mirror when `r_mirroralpha` is below 1, translucent water is left for
 * `R_DrawWaterSurfaces` while `r_wateralpha` is below 1, and every other surface goes through `R_RenderBrushPoly`.
 * Empties each chain it draws (the mirror chain and deferred water chains stay). With `gl_texsort` 0 only the sky
 * chain is drawn. Called by `R_DrawWorld` each frame.
 */
export function DrawTextureChains() {

	const cl_ref = cl;
	if ( ! cl_ref || ! cl_ref.worldmodel ) return;

	if ( ! gl_texsort.value ) {

		if ( skychain ) {

			R_DrawSkyChain( skychain );
			skychain = null;

		}

		return;

	}

	const worldmodel = cl_ref.worldmodel;
	for ( let i = 0; i < worldmodel.numtextures; i ++ ) {

		const t = worldmodel.textures[ i ];
		if ( ! t ) continue;

		let s = t.texturechain;
		if ( ! s ) continue;

		if ( i === skytexturenum ) {

			R_DrawSkyChain( s );

		} else if ( i === mirrortexturenum && r_mirroralpha.value !== 1.0 ) {

			R_MirrorChain( s );
			continue;

		} else {

			if ( ( s.flags & SURF_DRAWTURB ) && r_wateralpha.value !== 1.0 )
				continue; // draw translucent water later

			for ( ; s; s = s.texturechain )
				R_RenderBrushPoly( s );

		}

		t.texturechain = null;

	}

}

//============================================================================
// R_DrawWaterSurfaces
//============================================================================

/**
 * Draws the translucent water left out of the texture chains (WinQuake gl_rsurf.c): each turbulent surface on the
 * water chain (`gl_texsort` 0) or on a turbulent texture's chain gets its liquid mesh in the world group at
 * `r_wateralpha` for this frame, and the chains are emptied. Does nothing when `r_wateralpha` is 1 and `gl_texsort`
 * is on (the water was drawn with the world). Called per frame by `R_RenderView` (gl_rmain.js) after the scene.
 */
export function R_DrawWaterSurfaces() {

	const cl_ref = cl;

	if ( r_wateralpha.value === 1.0 && gl_texsort.value )
		return;

	if ( ! gl_texsort.value ) {

		if ( ! waterchain )
			return;

		for ( let s = waterchain; s; s = s.texturechain ) {

			if ( s.polys && worldState.group ) {

				const realtime = cl ? cl.time : 0;
				const geometry = EmitWaterPolysQuake( s, realtime );
				if ( geometry ) {

					const material = _getWaterMaterial( s.texinfo.texture, r_wateralpha.value );
					_getWaterMesh( s, geometry, material, worldState.group );

				}

			}

		}

		waterchain = null;

	} else {

		if ( ! cl_ref || ! cl_ref.worldmodel ) return;

		for ( let i = 0; i < cl_ref.worldmodel.numtextures; i ++ ) {

			const t = cl_ref.worldmodel.textures[ i ];
			if ( ! t ) continue;

			let s = t.texturechain;
			if ( ! s ) continue;

			if ( ! ( s.flags & SURF_DRAWTURB ) )
				continue;

			for ( ; s; s = s.texturechain ) {

				if ( s.polys && worldState.group ) {

					const realtime = cl ? cl.time : 0;
					const geometry = EmitWaterPolysQuake( s, realtime );
					if ( geometry ) {

						const material = _getWaterMaterial( t, r_wateralpha.value );
						_getWaterMesh( s, geometry, material, worldState.group );

					}

				}

			}

			t.texturechain = null;

		}

	}

}

//============================================================================
// R_MirrorChain
//============================================================================

function R_MirrorChain( s ) {

	if ( mirror )
		return;

	set_mirror( true );
	set_mirror_plane( s.plane );

}
