// Portal rendering: every "*teleport" surface that leads somewhere is drawn as a
// live window onto its receiver (the info_teleport_destination that its
// trigger_teleport sends you to).
//
// The world is rendered a second time from a virtual camera placed at the
// receiver, into a render target, and the portal surface samples that target in
// screen space.  That is what makes the surface look "cut out" of the wall:
// what you see through it is exactly the space you would be standing in if you
// stepped through.

import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { WATER as WAVE_WATER, METAL as WAVE_METAL, WAVE_GLSL, metalWave, R_WaveTexture } from './r_waves.js';
import { R_NewerGame, r_newer_portals } from './r_anim.js';
import { COM_Parse, com_token } from './common.js';
import { Mod_PointInLeaf, Mod_LeafPVS } from './gl_model.js';

export const r_portals = new cvar_t( 'r_portals', '1' );

// Same constants as glquake.h / gl_rmain.js (not imported to keep this module
// out of the renderer's circular import graph)
const SURF_PLANEBACK = 2;
const SURF_DRAWTURB = 0x10;
const SURF_DRAWSKY = 4;

const PLAYER_ORIGIN_HEIGHT = 24; // hull origin above the floor
const TELEPORT_DEST_HEIGHT = 27; // trigger_teleport places the player at dest + '0 0 27'
const TRIGGER_SLOP = 24; // how far a trigger may be from the surface it belongs to
const GATE_GAP = 8; // the faces of one level-exit gate lie this close together

const MAX_PORTAL_VIEWS = 3; // portal views rendered per frame
const PORTAL_RT_SCALE = 0.75; // render target size relative to the 3D viewport
const PORTAL_RT_MAX = 1600;

let portals = [];
let levelPortals = [];
let portalFrame = 0;
let portalsEnabled = true;

//============================================================================
// Entity lump parsing
//============================================================================

export function R_ParseEntityLump( text ) {

	const ents = [];
	let data = text;

	while ( true ) {

		data = COM_Parse( data );
		if ( data === null || com_token !== '{' ) break;

		const ent = {};

		while ( true ) {

			data = COM_Parse( data );
			if ( data === null ) return ents;
			if ( com_token === '}' ) break;

			const key = com_token;
			data = COM_Parse( data );
			if ( data === null ) return ents;
			ent[ key ] = com_token;

		}

		ents.push( ent );

	}

	return ents;

}

function parseVector( s ) {

	const v = [ 0, 0, 0 ];
	if ( s == null ) return v;

	const parts = s.trim().split( /\s+/ );
	for ( let i = 0; i < 3 && i < parts.length; i ++ )
		v[ i ] = parseFloat( parts[ i ] ) || 0;

	return v;

}

// Same key handling as ED_ParseEdict: a bare "angle" is a yaw
function destinationYaw( ent ) {

	if ( ent.angles != null ) return parseVector( ent.angles )[ 1 ];
	if ( ent.angle != null ) return parseFloat( ent.angle ) || 0;
	return 0;

}

//============================================================================
// Portal construction
//============================================================================

function surfaceBounds( surf, mins, maxs ) {

	let any = false;

	for ( let p = surf.polys; p; p = p.next ) {

		for ( let i = 0; i < p.numverts; i ++ ) {

			let x, y, z;
			if ( p.verts instanceof Float32Array ) {

				x = p.verts[ i * 7 ];
				y = p.verts[ i * 7 + 1 ];
				z = p.verts[ i * 7 + 2 ];

			} else {

				x = p.verts[ i ][ 0 ];
				y = p.verts[ i ][ 1 ];
				z = p.verts[ i ][ 2 ];

			}

			if ( x < mins[ 0 ] ) mins[ 0 ] = x;
			if ( y < mins[ 1 ] ) mins[ 1 ] = y;
			if ( z < mins[ 2 ] ) mins[ 2 ] = z;
			if ( x > maxs[ 0 ] ) maxs[ 0 ] = x;
			if ( y > maxs[ 1 ] ) maxs[ 1 ] = y;
			if ( z > maxs[ 2 ] ) maxs[ 2 ] = z;
			any = true;

		}

	}

	return any;

}

function boxGap( amins, amaxs, bmins, bmaxs ) {

	let d2 = 0;
	for ( let i = 0; i < 3; i ++ ) {

		const gap = Math.max( amins[ i ] - bmaxs[ i ], bmins[ i ] - amaxs[ i ], 0 );
		d2 += gap * gap;

	}

	return Math.sqrt( d2 );

}

function cross( a, b ) {

	return [
		a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ],
		a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ],
		a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ]
	];

}

// Rigid transform taking the source portal frame onto the receiver frame.
//
// Source frame: origin C, axes ( right, up, n ) with n the surface normal
// pointing at the viewer.  Receiver frame: origin D, axes ( right, up, -F )
// with F the direction the player faces after teleporting.  A viewer in front
// of the surface (+n) therefore lands behind the receiver plane (-F) looking
// along F, and crossing the surface (n = 0) lands exactly on the receiver.
// Returned as a column-major 4x4.
function portalMatrix( C, n, D, yaw ) {

	const rad = yaw * Math.PI / 180;
	const F = [ Math.cos( rad ), Math.sin( rad ), 0 ];
	const nd = [ - F[ 0 ], - F[ 1 ], 0 ];
	const ud = [ 0, 0, 1 ];
	const rd = cross( ud, nd );

	let us = [ 0, 0, 1 ];
	if ( Math.abs( n[ 2 ] ) > 0.9 ) us = [ 1, 0, 0 ]; // floor / ceiling portal
	const rs = cross( us, n );
	const len = Math.hypot( rs[ 0 ], rs[ 1 ], rs[ 2 ] ) || 1;
	rs[ 0 ] /= len; rs[ 1 ] /= len; rs[ 2 ] /= len;
	us = cross( n, rs );

	const bs = [ rs, us, n ];
	const bd = [ rd, ud, nd ];

	// R = Rd * Rs^T
	const R = new Array( 9 );
	for ( let i = 0; i < 3; i ++ ) {

		for ( let j = 0; j < 3; j ++ ) {

			let sum = 0;
			for ( let k = 0; k < 3; k ++ ) sum += bd[ k ][ i ] * bs[ k ][ j ];
			R[ i * 3 + j ] = sum;

		}

	}

	const t = [ 0, 0, 0 ];
	for ( let i = 0; i < 3; i ++ )
		t[ i ] = D[ i ] - ( R[ i * 3 ] * C[ 0 ] + R[ i * 3 + 1 ] * C[ 1 ] + R[ i * 3 + 2 ] * C[ 2 ] );

	return {
		elements: [
			R[ 0 ], R[ 3 ], R[ 6 ], 0,
			R[ 1 ], R[ 4 ], R[ 7 ], 0,
			R[ 2 ], R[ 5 ], R[ 8 ], 0,
			t[ 0 ], t[ 1 ], t[ 2 ], 1
		],
		forward: F
	};

}

export function R_TransformPortalPoint( portal, p ) {

	const e = portal.matrix;
	return [
		e[ 0 ] * p[ 0 ] + e[ 4 ] * p[ 1 ] + e[ 8 ] * p[ 2 ] + e[ 12 ],
		e[ 1 ] * p[ 0 ] + e[ 5 ] * p[ 1 ] + e[ 9 ] * p[ 2 ] + e[ 13 ],
		e[ 2 ] * p[ 0 ] + e[ 6 ] * p[ 1 ] + e[ 10 ] * p[ 2 ] + e[ 14 ]
	];

}

export function R_ClearPortals() {

	for ( const p of portals ) {

		for ( const s of p.surfaces ) s._portal = null;
		if ( p.material != null ) p.material.dispose();

	}

	portals = [];

}

// The planes of the teleporters' windows that can be hit, for impact ripples: { normal, center, min, max } in this level's
// coordinates, from each window's visible surface (its trigger box can lie beside it). A teleporter brush has a face on each
// side and sometimes two planes a few units apart: parallel planes close together over the same box are one window. Built when the
// portals change. (Doorways onto the next level are seamless: no ring shows their seam. A slipgate's window onto the next level is
// a portal you walk through like a teleporter's, and is hit like one: its plane carries the window's outline.)
let _planes = [], _planesFor = null, _planesCount = - 1, _gatesFor = null, _gatesCount = - 1;
export function R_ImpactPortalPlanes() {

	const cameras = portalsEnabled ? portals : NO_PLANES;
	if ( _planesFor !== cameras || _planesCount !== cameras.length || _gatesFor !== levelPortals || _gatesCount !== levelPortals.length ) {

		_planes = []; _planesFor = cameras; _planesCount = cameras.length; _gatesFor = levelPortals; _gatesCount = levelPortals.length;
		if ( portalsEnabled ) for ( const p of levelPortals ) if ( p.slipgate === true && p.plane ) _planes.push( p.plane );
		for ( const p of cameras ) {

			// (one object per portal for its life: a ripple field is keyed to it, r_waves.js)
			const plane = p._impactPlane ??= { normal: p.normal, center: p.center, min: p.surfMins ?? p.triggerMins, max: p.surfMaxs ?? p.triggerMaxs };
			const same = _planes.some( q => {

				const along = Math.abs( ( plane.center[ 0 ] - q.center[ 0 ] ) * q.normal[ 0 ] + ( plane.center[ 1 ] - q.center[ 1 ] ) * q.normal[ 1 ] + ( plane.center[ 2 ] - q.center[ 2 ] ) * q.normal[ 2 ] );
				const parallel = Math.abs( plane.normal[ 0 ] * q.normal[ 0 ] + plane.normal[ 1 ] * q.normal[ 1 ] + plane.normal[ 2 ] * q.normal[ 2 ] ) > .999;
				return parallel && along <= 12 && [ 0, 1, 2 ].every( a => plane.min[ a ] <= q.max[ a ] + 12 && plane.max[ a ] >= q.min[ a ] - 12 );

			} );
			if ( ! same ) _planes.push( plane );

		}

	}
	return _planes;

}
const NO_PLANES = [];

// Does the box lie in what a visible camera portal shows (a leaf the receiver can see)? A brush entity (a door, a false wall or floor,
// a lift) is only drawn when the main view's frustum reaches it; one in the receiver's view and outside the main view's would be
// missing from the picture through the portal, and whatever stands behind it would show through (card [15]). `pointInLeaf( point )`
// gives the leaf of a point and `visframe` the frame stamp of the portals' source leaves that are in the main view. The centre and
// the eight corners are looked at (a thin door's centre can lie in a wall's leaf).
const _corner = [ 0, 0, 0 ];
export function R_BoxInPortalReceiver( mins, maxs, pointInLeaf, visframe ) {

	if ( ! portalsEnabled || portals.length === 0 ) return false;
	for ( const portal of portals ) {

		if ( portal.srcLeaf == null || portal.srcLeaf.visframe !== visframe ) continue;
		let set = portal._destLeafSet;
		if ( set === undefined ) set = portal._destLeafSet = new Set( portal.destLeafs );
		for ( let k = 0; k < 9; k ++ ) {

			if ( k === 8 ) { _corner[ 0 ] = ( mins[ 0 ] + maxs[ 0 ] ) / 2; _corner[ 1 ] = ( mins[ 1 ] + maxs[ 1 ] ) / 2; _corner[ 2 ] = ( mins[ 2 ] + maxs[ 2 ] ) / 2; }
			else { _corner[ 0 ] = k & 1 ? maxs[ 0 ] : mins[ 0 ]; _corner[ 1 ] = k & 2 ? maxs[ 1 ] : mins[ 1 ]; _corner[ 2 ] = k & 4 ? maxs[ 2 ] : mins[ 2 ]; }
			if ( set.has( pointInLeaf( _corner ) ) ) return true;

		}

	}
	return false;

}

export function R_GetPortals() {

	return portals;

}

export function R_BuildPortals( model ) {

	R_ClearPortals();

	if ( model == null || model.entities == null || model.surfaces == null ||
		model.submodels == null || model.nodes == null )
		return portals;

	const ents = R_ParseEntityLump( model.entities );

	const dests = new Map();
	for ( const ent of ents ) {

		if ( ent.classname === 'info_teleport_destination' && ent.targetname != null &&
			dests.has( ent.targetname ) === false )
			dests.set( ent.targetname, ent );

	}

	const triggers = [];
	for ( const ent of ents ) {

		if ( ent.classname !== 'trigger_teleport' || ent.target == null || ent.model == null ) continue;
		if ( ent.model.charAt( 0 ) !== '*' ) continue;

		const dest = dests.get( ent.target );
		const sub = model.submodels[ parseInt( ent.model.substring( 1 ), 10 ) ];
		if ( dest == null || sub == null ) continue;

		triggers.push( { dest, model: ent.model, target: ent.target, mins: sub.mins, maxs: sub.maxs } );

	}

	// a level exit's gate (a trigger_changelevel at it) shows the next level (r_levelview.js), not a view within this one, even when
	// a trigger_teleport lies near it too (E1M4's secret exit gate): its surfaces are left out here, the whole gate (E3M6's has two
	// planes 4 units apart, a teleport trigger behind one and the exit's in front of the other). When no window is built for it
	// (seamless travel off, a game with other players, the next level unreadable) the gate keeps the plain teleporter look.
	const exits = [];
	for ( const ent of ents ) {

		if ( ent.classname !== 'trigger_changelevel' || ent.model == null || ent.model.charAt( 0 ) !== '*' ) continue;
		const sub = model.submodels[ parseInt( ent.model.substring( 1 ), 10 ) ];
		if ( sub != null ) exits.push( sub );

	}

	if ( triggers.length === 0 ) return portals;

	// Link every "*teleport" surface of the world to the trigger it belongs to
	const groups = new Map();
	const first = model.firstmodelsurface || 0;
	const last = first + ( model.nummodelsurfaces || model.surfaces.length );
	const smins = [ 0, 0, 0 ], smaxs = [ 0, 0, 0 ];

	for ( let i = first; i < last; i ++ ) {

		const surf = model.surfaces[ i ];
		if ( surf == null || surf.texinfo == null || surf.texinfo.texture == null ) continue;
		if ( ( surf.flags & SURF_DRAWTURB ) === 0 ) continue;
		if ( surf.texinfo.texture.name.toLowerCase().indexOf( '*teleport' ) !== 0 ) continue;

		smins[ 0 ] = smins[ 1 ] = smins[ 2 ] = 99999;
		smaxs[ 0 ] = smaxs[ 1 ] = smaxs[ 2 ] = - 99999;
		if ( surfaceBounds( surf, smins, smaxs ) === false ) continue;

		let best = - 1, bestGap = TRIGGER_SLOP;
		for ( let t = 0; t < triggers.length; t ++ ) {

			const gap = boxGap( smins, smaxs, triggers[ t ].mins, triggers[ t ].maxs );
			if ( gap <= bestGap ) {

				bestGap = gap;
				best = t;

			}

		}

		if ( best < 0 ) continue;
		const atExit = exits.some( x => boxGap( smins, smaxs, x.mins, x.maxs ) <= Math.min( bestGap, TRIGGER_SLOP ) );

		const sign = ( surf.flags & SURF_PLANEBACK ) ? - 1 : 1;
		const n = [
			surf.plane.normal[ 0 ] * sign,
			surf.plane.normal[ 1 ] * sign,
			surf.plane.normal[ 2 ] * sign
		];
		const dist = surf.plane.dist * sign;

		// coplanar faces of one doorway/pad share a portal so they share one view
		const key = best + '|' + n.map( v => v.toFixed( 2 ) ).join( ',' ) + '|' + Math.round( dist );
		let g = groups.get( key );
		if ( g === undefined ) {

			g = {
				trigger: triggers[ best ], n, dist, surfaces: [],
				mins: [ 99999, 99999, 99999 ], maxs: [ - 99999, - 99999, - 99999 ], gate: false
			};
			groups.set( key, g );

		}

		if ( atExit ) g.gate = true;
		g.surfaces.push( surf );
		for ( let a = 0; a < 3; a ++ ) {

			g.mins[ a ] = Math.min( g.mins[ a ], smins[ a ] );
			g.maxs[ a ] = Math.max( g.maxs[ a ], smaxs[ a ] );

		}

	}

	// the rest of a gate: a parallel face within GATE_GAP units of one at the exit
	for ( let grew = true; grew; ) {

		grew = false;
		for ( const g of groups.values() ) {

			if ( g.gate ) continue;
			for ( const h of groups.values() ) {

				if ( ! h.gate || Math.abs( g.n[ 0 ] * h.n[ 0 ] + g.n[ 1 ] * h.n[ 1 ] + g.n[ 2 ] * h.n[ 2 ] ) < 0.99 || boxGap( g.mins, g.maxs, h.mins, h.maxs ) > GATE_GAP ) continue;
				g.gate = grew = true;
				break;

			}

		}

	}
	for ( const [ key, g ] of groups ) if ( g.gate ) groups.delete( key );

	for ( const g of groups.values() ) {

		const n = g.n;
		const C = [
			( g.mins[ 0 ] + g.maxs[ 0 ] ) * 0.5,
			( g.mins[ 1 ] + g.maxs[ 1 ] ) * 0.5,
			( g.mins[ 2 ] + g.maxs[ 2 ] ) * 0.5
		];

		// doorway: match a standing player's origin so the eye lines up with the
		// receiver's eye once you step through
		if ( Math.abs( n[ 2 ] ) < 0.7 )
			C[ 2 ] = Math.min( g.mins[ 2 ] + PLAYER_ORIGIN_HEIGHT, C[ 2 ] );

		// slide onto the surface plane
		const off = n[ 0 ] * C[ 0 ] + n[ 1 ] * C[ 1 ] + n[ 2 ] * C[ 2 ] - g.dist;
		C[ 0 ] -= n[ 0 ] * off;
		C[ 1 ] -= n[ 1 ] * off;
		C[ 2 ] -= n[ 2 ] * off;

		const origin = parseVector( g.trigger.dest.origin );
		const D = [ origin[ 0 ], origin[ 1 ], origin[ 2 ] + TELEPORT_DEST_HEIGHT ];
		const yaw = destinationYaw( g.trigger.dest );

		const m = portalMatrix( C, n, D, yaw );

		const srcLeaf = Mod_PointInLeaf( [ C[ 0 ] + n[ 0 ] * 16, C[ 1 ] + n[ 1 ] * 16, C[ 2 ] + n[ 2 ] * 16 ], model );
		const destLeaf = Mod_PointInLeaf( D, model );
		const destVis = Mod_LeafPVS( destLeaf, model ).slice( 0, ( model.numleafs + 7 ) >> 3 );

		const portal = {
			triggerModel: g.trigger.model,
			triggerTarget: g.trigger.target,
			triggerMins: g.trigger.mins,
			triggerMaxs: g.trigger.maxs,
			surfaces: g.surfaces,
			surfMins: g.mins, surfMaxs: g.maxs, // the visible surface's own box (the trigger's can lie beside it)
			center: C,
			normal: n,
			dest: D,
			yaw,
			forward: m.forward,
			matrix: m.elements,
			srcLeaf,
			destVis,
			destLeafs: [],
			extraSurfaces: [],
			material: null,
			activeFrame: - 1
		};

		// Leaves the receiver can see: their static entities and their sky / water
		// surfaces have to be handed to the renderer even when the main view's
		// frustum never reaches them.
		const seen = new Set();
		for ( let l = 0; l < model.numleafs; l ++ ) {

			if ( ( destVis[ l >> 3 ] & ( 1 << ( l & 7 ) ) ) === 0 ) continue;

			const leaf = model.leafs[ l + 1 ];
			if ( leaf == null ) continue;
			portal.destLeafs.push( leaf );

			if ( leaf.firstmarksurface == null ) continue;
			for ( let c = 0; c < leaf.nummarksurfaces; c ++ ) {

				const s = leaf.firstmarksurface[ c ];
				if ( s == null || seen.has( s ) ) continue;
				seen.add( s );

				if ( ( s.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) === 0 ) continue;
				if ( s.texinfo != null && s.texinfo.texture != null &&
					s.texinfo.texture.name.charAt( 0 ) === '*' &&
					s.texinfo.texture.name.toLowerCase().indexOf( '*teleport' ) === 0 ) continue;
				portal.extraSurfaces.push( s );

			}

		}

		for ( const s of portal.surfaces ) s._portal = portal;
		portals.push( portal );

	}

	return portals;

}

//============================================================================
// Per-frame hooks used by the world renderer
//============================================================================

export function R_PortalsBeginFrame( enabled ) {

	// camera portals belong to Newer Game (and can be switched off there); the
	// original game keeps its teleporters as they were
	portalsEnabled = enabled && r_portals.value !== 0 && R_NewerGame() && r_newer_portals.value !== 0;

}

export function R_PortalsActive() {

	return R_NewerGame() && portalsEnabled && portals.length > 0;

}

// Called for every portal surface the world renderer draws this frame
export function R_PortalNoteVisible( portal ) {

	portal.activeFrame = portalFrame;

}

let dummyTexture = null;

function getDummyTexture() {

	if ( dummyTexture === null ) {

		dummyTexture = new THREE.DataTexture( new Uint8Array( [ 64, 96, 160, 255 ] ), 1, 1, THREE.RGBAFormat );
		dummyTexture.needsUpdate = true;

	}

	return dummyTexture;

}

const VERTEX_SHADER = `
varying vec2 vUv;
varying vec4 vClip;
varying vec3 vLocal;
varying vec3 vView;
varying mat3 vToView;
void main() {
	vUv = uv;
	vLocal = position;
	vView = ( modelViewMatrix * vec4( position, 1.0 ) ).xyz;
	vToView = mat3( modelViewMatrix );
	vClip = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	gl_Position = vClip;
}`;

const FRAGMENT_SHADER = `
layout(location = 1) out highp vec4 gNormal;
layout(location = 2) out highp vec4 gAlbedo;
layout(location = 3) out highp vec4 gHeightMask;
uniform sampler2D map;
uniform sampler2D portalMap;
uniform float portalMix;
uniform float seamless;
uniform float time;
uniform vec4 uMetalO[ ${WAVE_METAL.fields} ]; // ripple fields on windows (r_waves.js): xyz = corner, w = cell size (0: unused)
uniform vec4 uMetalU[ ${WAVE_METAL.fields} ]; // the field's axis across the window, w = its cells along it
uniform vec4 uMetalV[ ${WAVE_METAL.fields} ]; // and up it
${WAVE_GLSL}
varying vec2 vUv;
varying vec4 vClip;
varying vec3 vLocal;
varying vec3 vView;
varying mat3 vToView;
void main() {
	vec3 base = texture2D( map, vUv ).rgb;
	vec3 col = base;
	// Metallic ripples (card [W1]): the window is a sheet of liquid metal held in its frame. Where something hit it, r_waves.js runs
	// a wave field over it; here its slope tilts the surface, which bends the view through the window (as a refracting surface
	// would) and catches the light on the crests (as polished metal would). The waves add up and come back off the frame.
	vec3 tilt = vec3( 0.0 ), N = vec3( 0.0 );
	for ( int i = 0; i < ${WAVE_METAL.fields}; i ++ ) {
		vec4 o = uMetalO[ i ];
		if ( o.w <= 0.0 ) continue;
		vec3 d = vLocal - o.xyz, U = uMetalU[ i ].xyz, V = uMetalV[ i ].xyz;
		if ( abs( dot( d, cross( U, V ) ) ) > 13.0 ) continue; // another window (a window's faces lie up to 12 units apart: one field)
		vec2 st = vec2( dot( d, U ), dot( d, V ) ) / o.w;
		if ( st.x < 1.0 || st.y < 1.0 || st.x > uMetalU[ i ].w - 1.0 || st.y > uMetalV[ i ].w - 1.0 ) continue;
		vec3 w = waveSample( float( i + ${WAVE_WATER.fields} ), st, o.w );
		tilt += U * w.y + V * w.z;
		N = cross( U, V );
	}
	vec3 tiltV = vToView * tilt;
	float strength = smoothstep( 0.01, 0.25, length( tilt ) );
	vec2 metalBend = tiltV.xy;
	if ( portalMix > 0.0 ) {
		// The receiver's view was rendered with this camera's projection, so the
		// same screen position shows the same ray: the surface is a cut-out.
		vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
		vec2 rip = vec2(
			sin( suv.y * 90.0 + time * 3.1 ) + sin( suv.y * 37.0 - time * 2.3 ),
			cos( suv.x * 80.0 + time * 2.7 ) + cos( suv.x * 41.0 + time * 1.9 ) ) * 0.0012;
		rip *= 1.0 - seamless;
		vec2 uv = clamp( suv + rip + ( base.rg - 0.5 ) * 0.004 + metalBend * 0.16, 0.002, 0.998 );
		vec3 view = vec3(
			texture2D( portalMap, uv + rip * 0.6 ).r,
			texture2D( portalMap, uv ).g,
			texture2D( portalMap, uv - rip * 0.6 ).b );
		float pulse = 0.5 + 0.5 * sin( time * 2.0 + vUv.x * 5.0 + vUv.y * 3.0 );
		// a doorway between levels is just a doorway: no shimmer, no tint
		if ( seamless < 0.5 ) view = view * ( 0.95 + 0.05 * pulse ) + base * vec3( 0.55, 0.8, 1.0 ) * ( 0.05 + 0.07 * pulse );
		col = mix( base, view, portalMix );
	}
	if ( strength > 0.0 ) {
		// polished metal: the tilted surface reflects a bright overhead and a dark floor, and the light glints off the crests
		// (the height runs along the window's normal: the surface's normal is that less the slope, turned to face the eye)
		vec3 nV = normalize( vToView * ( N - tilt ) );
		if ( dot( nV, vView ) > 0.0 ) nV = normalize( vToView * ( tilt - N ) );
		vec3 r = reflect( normalize( vView ), nV );
		// (relative to the flat window: a flat sheet shows the view as it is; only the tilt mirrors the bright overhead or the dark)
		vec3 r0 = reflect( normalize( vView ), normalize( vToView * N ) * sign( - dot( vToView * N, vView ) ) );
		float lift = clamp( ( r.y - r0.y ) * 2.5, - 1.0, 1.0 );
		vec3 chrome = lift > 0.0 ? vec3( 0.80, 0.86, 0.95 ) * lift : col * lift * 0.8;
		float glint = pow( max( dot( r, normalize( vec3( 0.25, 0.75, 0.6 ) ) ), 0.0 ), 64.0 ) - pow( max( dot( r0, normalize( vec3( 0.25, 0.75, 0.6 ) ) ), 0.0 ), 64.0 );
		col += ( chrome * 0.9 + vec3( 1.0, 0.97, 0.92 ) * max( glint, 0.0 ) * 2.2 ) * strength;
	}
	gl_FragColor = vec4( col, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	// a window, not a wall: the lighting pass must not light it (alpha < 0 says so)
	gNormal = vec4( 0.5, 0.5, 1.0, - 1.0 );
	gAlbedo = vec4( 0.0 );
	gHeightMask = vec4(1.0);
}`;

export function R_PortalMaterial( portal, texture ) {

	if ( portal.material === null ) {

		portal.material = new THREE.ShaderMaterial( {
			uniforms: {
				map: { value: null },
				portalMap: { value: null },
				portalMix: { value: 0 },
				seamless: { value: portal.level === true ? 1 : 0 },
				time: { value: 0 },
				uMetalO: { value: metalWave.origin },
				uMetalU: { value: metalWave.u },
				uMetalV: { value: metalWave.v },
				tWaves: { value: R_WaveTexture() }
			},
			vertexShader: VERTEX_SHADER,
			fragmentShader: FRAGMENT_SHADER,
			side: THREE.DoubleSide
		} );
		portal.material.uniforms.portalMap.value = getDummyTexture();

	}

	const uniforms = portal.material.uniforms;
	const map = texture != null ? texture : getDummyTexture();
	if ( uniforms.map.value !== map ) uniforms.map.value = map;

	return portal.material;

}

//============================================================================
// Rendering the receivers
//============================================================================

const renderTargets = [];
let viewCamera = null;
let viewMatrix = null;
let clipPlane = null;
let clipVector = null;
let clipPoint = null;
let clipQ = null;
let savedClearColor = null;

function getRenderTarget( index, width, height ) {

	let rt = renderTargets[ index ];
	if ( rt === undefined ) {

		rt = new THREE.WebGLRenderTarget( width, height, {
			type: THREE.HalfFloatType,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			generateMipmaps: false,
			depthBuffer: true
		} );
		renderTargets[ index ] = rt;

	} else if ( rt.width !== width || rt.height !== height ) {

		rt.setSize( width, height );

	}

	return rt;

}

// Clip everything on the near side of the receiver plane (Lengyel's oblique
// near plane), otherwise the walls behind the receiver would hide the view.
function applyObliqueClip( cam, point, normal ) {

	clipPlane.setFromNormalAndCoplanarPoint(
		clipVector.set( normal[ 0 ], normal[ 1 ], normal[ 2 ] ),
		clipPoint.set( point[ 0 ], point[ 1 ], point[ 2 ] ) );
	clipPlane.applyMatrix4( cam.matrixWorldInverse );

	const e = cam.projectionMatrix.elements;
	const v = clipQ;
	const plane = { x: clipPlane.normal.x, y: clipPlane.normal.y, z: clipPlane.normal.z, w: clipPlane.constant };

	v.set(
		( Math.sign( plane.x ) + e[ 8 ] ) / e[ 0 ],
		( Math.sign( plane.y ) + e[ 9 ] ) / e[ 5 ],
		- 1,
		( 1 + e[ 10 ] ) / e[ 14 ]
	);

	const k = 2 / ( plane.x * v.x + plane.y * v.y + plane.z * v.z + plane.w * v.w );
	e[ 2 ] = plane.x * k;
	e[ 6 ] = plane.y * k;
	e[ 10 ] = plane.z * k + 1;
	e[ 14 ] = plane.w * k;

	cam.projectionMatrixInverse.copy( cam.projectionMatrix ).invert();

}

function setPortalUniforms( portal, map, mix, time ) {

	const material = portal.material;
	if ( material === null ) return;

	material.uniforms.portalMap.value = map;
	material.uniforms.portalMix.value = mix;
	material.uniforms.time.value = time;
	material.uniformsNeedUpdate = true;

}

/*
================
R_RenderPortals

Render the receiver's view of every portal that was drawn this frame.  Call
after the scene has been built and before the main renderer.render().
================
*/
export function R_RenderPortals( renderer, scene, camera, width, height, time, hidden ) {

	const active = [];
	for ( const p of portals.concat( levelPortals ) ) {

		if ( p.activeFrame === portalFrame ) active.push( p );
		setPortalUniforms( p, getDummyTexture(), 0, time );

	}

	portalFrame ++;

	if ( portalsEnabled === false || active.length === 0 || renderer == null )
		return 0;

	if ( viewCamera === null ) {

		viewCamera = new THREE.PerspectiveCamera();
		viewCamera.matrixAutoUpdate = false;
		viewCamera.matrixWorldAutoUpdate = false;
		viewMatrix = new THREE.Matrix4();
		clipPlane = new THREE.Plane();
		clipVector = new THREE.Vector3();
		clipPoint = new THREE.Vector3();
		clipQ = new THREE.Vector4();
		savedClearColor = new THREE.Color();

	}

	const cpos = camera.matrixWorld.elements;
	active.sort( ( a, b ) => {

		const da = ( a.center[ 0 ] - cpos[ 12 ] ) ** 2 + ( a.center[ 1 ] - cpos[ 13 ] ) ** 2 + ( a.center[ 2 ] - cpos[ 14 ] ) ** 2;
		const db = ( b.center[ 0 ] - cpos[ 12 ] ) ** 2 + ( b.center[ 1 ] - cpos[ 13 ] ) ** 2 + ( b.center[ 2 ] - cpos[ 14 ] ) ** 2;
		return da - db;

	} );

	const w = Math.max( 16, Math.min( PORTAL_RT_MAX, Math.round( width * PORTAL_RT_SCALE ) ) );
	const h = Math.max( 16, Math.min( PORTAL_RT_MAX, Math.round( height * PORTAL_RT_SCALE ) ) );

	const hiddenState = [];
	for ( let i = 0; i < hidden.length; i ++ ) {

		hiddenState.push( hidden[ i ].visible );
		hidden[ i ].visible = false;

	}

	const oldTarget = renderer.getRenderTarget();
	renderer.getClearColor( savedClearColor );
	const oldAlpha = renderer.getClearAlpha();

	let rendered = 0;

	try {

		for ( let i = 0; i < active.length && rendered < MAX_PORTAL_VIEWS; i ++ ) {

			const p = active[ i ];

			viewMatrix.fromArray( p.matrix );
			viewCamera.matrixWorld.multiplyMatrices( viewMatrix, camera.matrixWorld );
			viewCamera.matrixWorldInverse.copy( viewCamera.matrixWorld ).invert();
			viewCamera.projectionMatrix.copy( camera.projectionMatrix );
			viewCamera.near = camera.near;
			viewCamera.far = camera.far;
			viewCamera.fov = camera.fov;
			viewCamera.aspect = camera.aspect;

			// the virtual eye must sit behind the receiver plane
			const ve = viewCamera.matrixWorld.elements;
			const side = ( ve[ 12 ] - p.dest[ 0 ] ) * p.forward[ 0 ] + ( ve[ 13 ] - p.dest[ 1 ] ) * p.forward[ 1 ] +
				( ve[ 14 ] - p.dest[ 2 ] ) * ( p.forward[ 2 ] || 0 );
			if ( side > - 0.5 ) continue;

			applyObliqueClip( viewCamera, p.dest, p.forward );

			const rt = getRenderTarget( rendered, w, h );

			renderer.setRenderTarget( rt );
			renderer.setClearColor( 0x000000, 1 );
			renderer.clear( true, true, true );
			renderer.render( scene, viewCamera );

			setPortalUniforms( p, rt.texture, 1, time );
			rendered ++;

		}

	} finally {

		renderer.setRenderTarget( oldTarget );
		renderer.setClearColor( savedClearColor, oldAlpha );

		for ( let i = 0; i < hidden.length; i ++ )
			hidden[ i ].visible = hiddenState[ i ];

	}

	return rendered;

}

export function R_PortalsShutdown() {

	R_ClearPortals();
	for ( const rt of renderTargets ) rt.dispose();
	renderTargets.length = 0;

}


//============================================================================
// Level portals: a window in an exit onto the next level
//============================================================================

// where the level views live, so each one has its own space in the scene
export function R_LevelPortalCount() {

	return levelPortals.length;

}

// the matrix (this level's coordinates -> the scene) of the window onto the level
// that crossing number `index` leads to, or null while that view is not built
export function R_LevelPortalMatrix( index ) {

	for ( const p of levelPortals )
		if ( p.crossing === index && p.mesh != null ) return p.matrix;

	return null;

}

// the window of crossing number `index` goes (its crossing was shut)
export function R_RemoveLevelPortal( index ) {

	for ( const p of levelPortals.filter( ( p ) => p.crossing === index ) ) {

		if ( p.mesh != null ) {

			if ( p.mesh.parent != null ) p.mesh.parent.remove( p.mesh );
			p.mesh.geometry.dispose();

		}

		if ( p.material !== null ) p.material.dispose();

	}

	levelPortals = levelPortals.filter( ( p ) => p.crossing !== index );

}

export function R_ClearLevelPortals() {

	for ( const p of levelPortals ) {

		if ( p.mesh != null ) {

			if ( p.mesh.parent != null ) p.mesh.parent.remove( p.mesh );
			p.mesh.geometry.dispose();

		}

		if ( p.material !== null ) p.material.dispose();

	}

	levelPortals = [];

}

/*
================
R_AddLevelPortal

corners   the four corners of the opening, in this level's coordinates
matrix    column-major: this level's coordinates -> the scene, where the other
          level's view has been placed
dest      where the exit plane lands in the scene
forward   the direction of travel across it, in the scene
================
*/
export function R_AddLevelPortal( scene, corners, matrix, dest, forward, polygons = null ) {

	// the rectangle, or the given polygons (each a convex fan, as a BSP face is)
	const positions = polygons?.length ? new Float32Array( polygons.flatMap( poly => poly.slice( 1, - 1 ).flatMap( ( v, k ) => [ ...poly[ 0 ], ...v, ...poly[ k + 2 ] ] ) ) ) : new Float32Array( [
		...corners[ 0 ], ...corners[ 1 ], ...corners[ 2 ],
		...corners[ 0 ], ...corners[ 2 ], ...corners[ 3 ]
	] );

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( positions.length / 3 * 2 ), 2 ) );
	geometry.computeBoundingSphere();

	const portal = {
		level: true,
		surfaces: [],
		center: [
			( corners[ 0 ][ 0 ] + corners[ 2 ][ 0 ] ) * 0.5,
			( corners[ 0 ][ 1 ] + corners[ 2 ][ 1 ] ) * 0.5,
			( corners[ 0 ][ 2 ] + corners[ 2 ][ 2 ] ) * 0.5
		],
		dest, forward, matrix,
		material: null,
		activeFrame: - 1,
		mesh: null
	};
	// the opening's plane and box (this level's coordinates), for impact ripples
	{
		const u = [ 0, 1, 2 ].map( a => corners[ 1 ][ a ] - corners[ 0 ][ a ] ), v = [ 0, 1, 2 ].map( a => corners[ 3 ][ a ] - corners[ 0 ][ a ] );
		const n = [ u[ 1 ] * v[ 2 ] - u[ 2 ] * v[ 1 ], u[ 2 ] * v[ 0 ] - u[ 0 ] * v[ 2 ], u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ] ], len = Math.hypot( ...n ) || 1;
		portal.plane = { normal: n.map( x => x / len ), center: portal.center, min: [ 0, 1, 2 ].map( a => Math.min( ...corners.map( c => c[ a ] ) ) ), max: [ 0, 1, 2 ].map( a => Math.max( ...corners.map( c => c[ a ] ) ) ) };
		// a slipgate's window (its own polygons): hit like a teleporter's, its ripples held by its outline (r_waves.js)
		if ( polygons?.length ) { portal.slipgate = true; portal.plane.polygons = polygons; }
	}

	// no swirl to fall back on: a dark window until the view has been rendered
	const material = R_PortalMaterial( portal, null );
	const mesh = new THREE.Mesh( geometry, material );
	mesh.frustumCulled = true;
	mesh.matrixAutoUpdate = false;
	mesh.name = 'quake_level_portal';

	// drawn = in view: that is when the other level has to be rendered
	mesh.onBeforeRender = () => R_PortalNoteVisible( portal );

	portal.mesh = mesh;
	scene.add( mesh );
	levelPortals.push( portal );

	return portal;

}
