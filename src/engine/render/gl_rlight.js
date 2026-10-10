/**
 * @module engine/render/gl_rlight
 *
 * Dynamic lights (WinQuake gl_rlight.c): marking lit surfaces, light styles and the light under a point.
 *
 * Types: exported classes `dlight_t`.
 *
 * State: mutable exports `r_dlightframecount`, `lightplane`, `lightspot`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/gl_rlight.c -- dynamic lighting

import { R_NewerLightingActive, R_ClassicPassActive } from '../common/hooks.js'; // installed by newer/mode.js
import { LIGHTNING } from '../common/hooks.js'; // installed by newer/render/r_lightning.js
import * as THREE from 'three';
import { DotProduct, VectorCopy, VectorSubtract, Length } from '../common/mathlib.js';
import { MAX_LIGHTSTYLES } from '../common/quakedef.js';
import { MAXLIGHTMAPS, d_lightstylevalue, r_framecount,
	gl_flashblend, v_blend, v_liquid_blend } from './glquake.js';
import { r_origin } from './render.js';
import { cl_dlights } from '../client/client.js';
import { isXRActive, XR_SCALE } from '../../platform/webxr.js';

export const MAX_DLIGHTS = 32;

// Surface flags
export const SURF_DRAWTILED = 0x20;

// Plane types for axial optimization
const PLANE_X = 0;
const PLANE_Y = 1;
const PLANE_Z = 2;

// Pre-allocated scratch vectors for RecursiveLightPoint (indexed by recursion depth)
// BSP trees are typically 20-30 levels deep max
const _lightMidPool = [];
for ( let i = 0; i < 32; i ++ ) _lightMidPool[ i ] = new Float32Array( 3 );

export let r_dlightframecount = 0;

/*
==================
R_AnimateLight
==================
*/
export function R_AnimateLight( cl, cl_lightstyle ) {

	//
	// light animations
	// 'm' is normal light, 'a' is no light, 'z' is double bright
	//
	const i = ( cl.time * 10 ) | 0;
	for ( let j = 0; j < MAX_LIGHTSTYLES; j ++ ) {

		if ( ! cl_lightstyle[ j ] || ! cl_lightstyle[ j ].length ) {

			d_lightstylevalue[ j ] = 256;
			continue;

		}

		const k_index = i % cl_lightstyle[ j ].length;
		let k = cl_lightstyle[ j ].map.charCodeAt( k_index ) - 97; // 'a' = 97
		k = k * 22;
		d_lightstylevalue[ j ] = k;

	}

}

/*
=============================================================================

DYNAMIC LIGHTS BLEND RENDERING

=============================================================================
*/

export function AddLightBlend( r, g, b, a2 ) {

	for ( let i = 0; i < 2; i ++ ) {

		const blend = i === 0 ? v_blend : v_liquid_blend;

		const a = blend[ 3 ] + a2 * ( 1 - blend[ 3 ] );
		blend[ 3 ] = a;
		const fraction = a2 / a;
		blend[ 0 ] = blend[ 0 ] * ( 1 - fraction ) + r * fraction;
		blend[ 1 ] = blend[ 1 ] * ( 1 - fraction ) + g * fraction;
		blend[ 2 ] = blend[ 2 ] * ( 1 - fraction ) + b * fraction;

	}

}

/*
=============
R_RenderDlight

Renders a dynamic light using Three.js PointLight.
=============
*/

// Reusable vector for distance check
const _dlightV = new Float32Array( 3 );

// Reusable vector for R_LightPoint
const _lightPointEnd = new Float32Array( 3 );

// Pool of PointLights for dynamic lights
const _dlightPool = [];

function _getDlight( index ) {

	if ( _dlightPool[ index ] != null ) return _dlightPool[ index ];

	const light = new THREE.PointLight( 0xffaa44, 1, 300, 1 ); // decay=1 for linear falloff
	_dlightPool[ index ] = light;
	return light;

}

export function R_RenderDlight( light, dlightIndex ) {

	const rad = light.radius * 0.35;

	VectorSubtract( light.origin, r_origin, _dlightV );
	if ( Length( _dlightV ) < rad ) {

		// view is inside the dlight - add screen blend
		AddLightBlend( 1, 0.5, 0, light.radius * 0.0003 );
		// Note: Still create the PointLight even when inside - it should
		// still illuminate surfaces (unlike the original corona which
		// would be invisible/behind the camera when inside)

	}

	const pointLight = _getDlight( dlightIndex );

	// Position the light in Quake coordinates (same as camera/geometry)
	pointLight.position.set( light.origin[ 0 ], light.origin[ 1 ], light.origin[ 2 ] );

	// Set intensity and distance based on Quake light radius
	// Original Quake uses linear falloff: contribution = (radius - distance)
	// Three.js default is inverse-square (decay=2), so use decay=1 for linear
	pointLight.intensity = light.radius * 4;
	pointLight.distance = light.radius * 2;
	pointLight.decay = 1; // Linear falloff like original Quake

	return pointLight;

}

/*
=============
R_RenderDlights

Updates PointLights for all dynamic lights. Lights stay in scene
and have their intensity updated each frame based on decaying radius.
=============
*/
// Newer lighting: the scene always has the same few lights, so its shaders are made once.
// A scene's lights are part of every surface's shader; a light more or less makes the game
// build them all again, and every explosion or muzzle flash would (a stall of a good part of
// a second).  The few nearest dynamic lights take the slots; an unused slot has no light.
const NEWER_LIGHT_SLOTS = 3;
const _slotLights = [];

function R_RenderDlightSlots( cl, scene ) {

	// (the classic lights are not used while these are)
	for ( const l of _dlightPool ) if ( l != null && l.parent != null ) l.parent.remove( l );

	const active = [];

	for ( let i = 0; i < MAX_DLIGHTS; i ++ ) {

		const l = cl_dlights[ i ];
		if ( l == null || l.die < cl.time || l.radius <= 0 ) continue;

		VectorSubtract( l.origin, r_origin, _dlightV );
		const dist = Length( _dlightV );
		if ( dist < l.radius * 0.35 ) AddLightBlend( 1, 0.5, 0, l.radius * 0.0003 ); // inside it: a tint on the screen
		active.push( { l, d: dist - l.radius * 0.5 } );

	}

	active.sort( ( a, b ) => a.d - b.d );

	for ( let k = 0; k < NEWER_LIGHT_SLOTS; k ++ ) {

		let light = _slotLights[ k ];
		if ( light == null ) light = _slotLights[ k ] = new THREE.PointLight( 0xffaa44, 0, 300, 1 );
		light.userData.newerOnly = true;
		if ( scene != null && light.parent == null ) scene.add( light );

		const a = active[ k ];
		if ( a === undefined ) {

			light.intensity = 0;
			continue;

		}

		const timeLeft = Math.min( a.l.die - cl.time, 0.5 );
		light.position.set( a.l.origin[ 0 ], a.l.origin[ 1 ], a.l.origin[ 2 ] );
		// (the Newer lighting relights from the same light itself: half of the classic amount here)
		light.intensity = 10000 * timeLeft * 0.5;
		light.distance = a.l.radius;
		light.decay = 1;

	}

}

export function R_RenderDlights( cl, scene ) {

	if ( gl_flashblend.value === 0 )
		return;

	if ( R_NewerLightingActive() && ! isXRActive() ) {

		R_RenderDlightSlots( cl, scene );
		return;

	}

	// (back to the classic lights)
	for ( const l of _slotLights ) if ( l != null && l.parent != null ) l.parent.remove( l );

	r_dlightframecount = r_framecount + 1;

	for ( let i = 0; i < MAX_DLIGHTS; i ++ ) {

		const l = cl_dlights[ i ];
		const pooledLight = _dlightPool[ i ];

		// Check if this dlight is active (the Newer lightning beam's light belongs to its pass alone: not the Classic
		// half of the title demo's split, card [30a])
		const isActive = l != null && l.die >= cl.time && l.radius > 0 && ! ( l.key === LIGHTNING.light.key && R_ClassicPassActive() );

		if ( isActive ) {

			// Active - update properties
			const pointLight = R_RenderDlight( l, i );

			// intensity = time remaining (fades to 0 as light dies)
			// distance = radius (shrinks via game's decay system)
			// Clamp timeLeft: client-side prediction can shift cl.time backwards,
			// inflating timeLeft well beyond the light's intended duration.
			// 0.5s is the longest dlight duration (explosions).
			const timeLeft = Math.min( l.die - cl.time, 0.5 );

			if ( isXRActive() ) {

				pointLight.intensity = 10000 * timeLeft / XR_SCALE;
				pointLight.distance = l.radius / XR_SCALE;

			} else {

				// (the Newer lighting relights from the same light itself: half of the classic amount here)
				pointLight.intensity = 10000 * timeLeft * ( R_NewerLightingActive() ? 0.5 : 1 );
				pointLight.distance = l.radius;

			}

			pointLight.decay = 1; // Linear falloff

			// Add to scene if not already there
			if ( scene != null && pointLight.parent == null ) {

				scene.add( pointLight );

			}

		} else {

			// Inactive - remove from scene if it was there
			if ( pooledLight != null && pooledLight.parent != null ) {

				pooledLight.parent.remove( pooledLight );

			}

		}

	}

}

/*
=============================================================================

DYNAMIC LIGHTS

=============================================================================
*/

/*
=============
R_MarkLights
=============
*/
export function R_MarkLights( light, bit, node, surfaces ) {

	if ( node.contents < 0 )
		return;

	const splitplane = node.plane;
	const dist = DotProduct( light.origin, splitplane.normal ) - splitplane.dist;

	if ( dist > light.radius ) {

		R_MarkLights( light, bit, node.children[ 0 ], surfaces );
		return;

	}

	if ( dist < - light.radius ) {

		R_MarkLights( light, bit, node.children[ 1 ], surfaces );
		return;

	}

	// mark the polygons
	const surfStart = node.firstsurface;
	for ( let i = 0; i < node.numsurfaces; i ++ ) {

		const surf = surfaces[ surfStart + i ];
		if ( ! surf ) continue;

		if ( surf.dlightframe !== r_dlightframecount ) {

			surf.dlightbits = 0;
			surf.dlightframe = r_dlightframecount;

		}

		surf.dlightbits |= bit;

	}

	R_MarkLights( light, bit, node.children[ 0 ], surfaces );
	R_MarkLights( light, bit, node.children[ 1 ], surfaces );

}

/*
=============
R_PushDlights
=============
*/
export function R_PushDlights( cl ) {

	if ( gl_flashblend.value )
		return;

	r_dlightframecount = r_framecount + 1; // because the count hasn't
	//  advanced yet for this frame

	if ( ! cl.worldmodel || ! cl.worldmodel.nodes )
		return;

	for ( let i = 0; i < MAX_DLIGHTS; i ++ ) {

		const l = cl_dlights[ i ];
		if ( ! l ) continue;
		if ( l.die < cl.time || ! l.radius )
			continue;
		R_MarkLights( l, 1 << i, cl.worldmodel.nodes[ 0 ], cl.worldmodel.surfaces );

	}

}

/*
=============================================================================

LIGHT SAMPLING

=============================================================================
*/

export let lightplane = null;
export let lightspot = new Float32Array( 3 );

/*
=============
RecursiveLightPoint
=============
*/
export function RecursiveLightPoint( node, start, end, surfaces, depth = 0 ) {

	if ( ! node || node.contents < 0 )
		return - 1; // didn't hit anything

	// calculate mid point
	const plane = node.plane;
	if ( ! plane ) return - 1;

	// Optimize for axial planes (very common in Quake maps)
	let front, back;
	switch ( plane.type ) {

		case PLANE_X:
			front = start[ 0 ] - plane.dist;
			back = end[ 0 ] - plane.dist;
			break;
		case PLANE_Y:
			front = start[ 1 ] - plane.dist;
			back = end[ 1 ] - plane.dist;
			break;
		case PLANE_Z:
			front = start[ 2 ] - plane.dist;
			back = end[ 2 ] - plane.dist;
			break;
		default:
			front = DotProduct( start, plane.normal ) - plane.dist;
			back = DotProduct( end, plane.normal ) - plane.dist;
			break;

	}

	const side = front < 0 ? 1 : 0;

	if ( ( back < 0 ) === ( front < 0 ) )
		return RecursiveLightPoint( node.children[ side ], start, end, surfaces, depth );

	const frac = front / ( front - back );
	// Use pre-allocated scratch vector from pool (indexed by recursion depth)
	const mid = _lightMidPool[ depth ];
	mid[ 0 ] = start[ 0 ] + ( end[ 0 ] - start[ 0 ] ) * frac;
	mid[ 1 ] = start[ 1 ] + ( end[ 1 ] - start[ 1 ] ) * frac;
	mid[ 2 ] = start[ 2 ] + ( end[ 2 ] - start[ 2 ] ) * frac;

	// go down front side
	let r = RecursiveLightPoint( node.children[ side ], start, mid, surfaces, depth + 1 );
	if ( r >= 0 )
		return r; // hit something

	if ( ( back < 0 ) === ( front < 0 ) )
		return - 1; // didn't hit anything

	// check for impact on this node
	VectorCopy( mid, lightspot );
	lightplane = plane;

	const surfStart = node.firstsurface;
	for ( let i = 0; i < node.numsurfaces; i ++ ) {

		const surf = surfaces[ surfStart + i ];
		if ( ! surf ) continue;

		if ( surf.flags & SURF_DRAWTILED )
			continue; // no lightmaps

		const tex = surf.texinfo;

		const s = DotProduct( mid, tex.vecs[ 0 ] ) + tex.vecs[ 0 ][ 3 ];
		const t = DotProduct( mid, tex.vecs[ 1 ] ) + tex.vecs[ 1 ][ 3 ];

		if ( s < surf.texturemins[ 0 ] || t < surf.texturemins[ 1 ] )
			continue;

		const ds = s - surf.texturemins[ 0 ];
		const dt = t - surf.texturemins[ 1 ];

		if ( ds > surf.extents[ 0 ] || dt > surf.extents[ 1 ] )
			continue;

		if ( ! surf.samples )
			return 0;

		const ds4 = ds >> 4;
		const dt4 = dt >> 4;

		const lightmap = surf.samples;
		r = 0;
		if ( lightmap ) {

			let lightmapOffset = ( surf.sampleOffset || 0 ) + dt4 * ( ( surf.extents[ 0 ] >> 4 ) + 1 ) + ds4;

			for ( let maps = 0; maps < MAXLIGHTMAPS && surf.styles[ maps ] !== 255; maps ++ ) {

				const scale = d_lightstylevalue[ surf.styles[ maps ] ];
				r += lightmap[ lightmapOffset ] * scale;
				lightmapOffset += ( ( surf.extents[ 0 ] >> 4 ) + 1 )
					* ( ( surf.extents[ 1 ] >> 4 ) + 1 );

			}

			r >>= 8;

		}

		return r;

	}

	// go down back side
	return RecursiveLightPoint( node.children[ side ? 0 : 1 ], mid, end, surfaces, depth + 1 );

}

/*
=============
R_LightPoint
=============
*/
export function R_LightPoint( p, cl ) {

	if ( ! cl.worldmodel || ! cl.worldmodel.lightdata )
		return 255;

	const end = _lightPointEnd;
	end[ 0 ] = p[ 0 ];
	end[ 1 ] = p[ 1 ];
	end[ 2 ] = p[ 2 ] - 2048;

	let r = RecursiveLightPoint( cl.worldmodel.nodes[ 0 ], p, end, cl.worldmodel.surfaces );

	if ( r === - 1 )
		r = 0;

	return r;

}

// Read-only brightness for cached water texture lighting. Alias shadows rely
// on the spot/plane left by their own query, so preserve that public state.
export function R_LightPointValue( p, client ) {

	const x = lightspot[ 0 ], y = lightspot[ 1 ], z = lightspot[ 2 ], plane = lightplane;
	try { return R_LightPoint( p, client ); }
	finally { lightspot[ 0 ] = x; lightspot[ 1 ] = y; lightspot[ 2 ] = z; lightplane = plane; }

}

/*
=============
R_AddDynamicLights

Add contribution of dynamic lights to a surface's lightmap.
In Three.js, this can be used to compute per-vertex lighting contributions
from dynamic lights for surfaces near them.
=============
*/
export function R_AddDynamicLights( surf, cl ) {

	if ( ! cl || ! cl.dlights )
		return;

	for ( let lnum = 0; lnum < MAX_DLIGHTS; lnum ++ ) {

		if ( ! ( surf.dlightbits & ( 1 << lnum ) ) )
			continue; // not lit by this light

		const dl = cl.dlights[ lnum ];
		if ( ! dl ) continue;

		const dist = DotProduct( dl.origin, surf.plane.normal ) - surf.plane.dist;
		const rad = dl.radius - Math.abs( dist );
		if ( rad < 0 )
			continue;

		// This light affects this surface
		// In a full Three.js implementation, you'd update the surface's
		// lightmap texture data here based on the light contribution

	}

}

/*
=============
dlight_t class
=============
*/
export class dlight_t {

	constructor() {

		this.origin = new Float32Array( 3 );
		this.radius = 0;
		this.die = 0; // stop lighting after this time
		this.decay = 0; // drop this each second
		this.minlight = 0; // don't add when contributing less
		this.key = 0;

	}

}
