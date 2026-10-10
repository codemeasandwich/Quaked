/**
 * @module newer/render/r_decals
 *
 * Marks on the world: bullet holes, scorching and blood that sticks.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `mesh`, `geometry`, `positions`, `uvs`, `colors`, `born`,
 * `life`, `base`, `next`, `used`, `dirty` and 1 more.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Marks that stay on the world in Newer Game: bullet holes where shots hit a wall,
// scorching where a rocket goes off, and blood that lands and sticks where gibs
// and blood spray come down or strike a wall.
//
// A mark is a small quad lying on the surface it hit.  Everything is one mesh (one
// draw call) with a ring of the most recent MAX_DECALS marks, so a long fight
// wears old marks away instead of slowing the game.  The surface is found from
// the level's own polygons (the leaf the point is in has the surfaces that touch
// it), so a mark takes the surface's angle and is kept inside that surface.  It
// multiplies the surface's colour (darkens or tints it) rather than drawing its
// own, so it is lit exactly as the surface is.

import * as THREE from 'three';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame } from '../mode.js';

export const r_decals = new cvar_t( 'r_decals', '1' );

const MAX_DECALS = 384;
const SURF_PLANEBACK = 2;
const SURF_DRAWSKY = 4;
const SURF_DRAWTURB = 0x10;
const CONTENTS_SOLID = - 2;

// atlas cells (a 4 x 2 sheet)
const CELL_HOLE = [ 0, 1 ];
const CELL_SCORCH = [ 2 ];
const CELL_BLOOD = [ 3, 4, 5, 6 ];
const CELL_DROP = [ 7 ];

// kind: the cells it uses, the colour it multiplies the surface by (1 = no change),
// and how many seconds it lasts.  A mark darkens or tints what is under it, so it is
// lit by exactly what lights the surface: dark walls give dark marks.
const KINDS = {
	hole: { cells: CELL_HOLE, color: [ 0.09, 0.08, 0.07 ], life: 90 },
	scorch: { cells: CELL_SCORCH, color: [ 0.2, 0.18, 0.16 ], life: 120 },
	blood: { cells: CELL_BLOOD, color: [ 0.42, 0.03, 0.03 ], life: 180 },
	drop: { cells: CELL_DROP, color: [ 0.36, 0.025, 0.025 ], life: 180 }
};

const FADE = 8; // seconds over which a mark fades away at the end of its life

let deps = null; // { scene, cl, pointInLeaf, lightPoint }
let mesh = null;
let geometry = null;
let positions = null, uvs = null, colors = null;
let born = null, life = null, base = null;
let next = 0;
let used = 0;
let dirty = false;
let lastFade = 0;

const now = () => ( typeof performance !== 'undefined' ? performance.now() : Date.now() ) / 1000;

/*
================
R_DecalsSetup

The renderer hands over what the marks need from it (importing the level model
code here would tie this module into the renderer's import cycle).
================
*/
/**
 * Stores the renderer's handles for the marks; called by `R_NewMap` (gl_rmain.js) at each level start, and kept until
 * the next call. Until it has been called no mark is made.
 *
 * @param {{ scene: THREE.Scene, cl: function(): ?client_state_t, pointInLeaf: function(Array<number>, model_t):
 *   ?mleaf_t, lightPoint: function(Array<number>): number }} d the scene the mark mesh is added to, the current client
 *   state, `Mod_PointInLeaf` and `R_LightPoint`
 */
export function R_DecalsSetup( d ) {

	deps = d;

}

/**
 * Whether marks are made and shown: after `R_DecalsSetup`, with `r_decals` non-zero, in Newer Game. Checked by every
 * mark maker and each frame by `R_DecalsFrame`.
 *
 * @returns {boolean} true when marks are on
 */
export function R_DecalsEnabled() {

	return deps !== null && r_decals.value !== 0 && R_NewerGame();

}

//============================================================================
// Finding the surface
//============================================================================

const _r = { surf: null, dist: 0, nx: 0, ny: 0, nz: 1, px: 0, py: 0, pz: 0, room: 0 };

/*
================
R_DecalSurface

The surface a point is just in front of: within maxDist of a surface's plane and
over the surface itself.  Fills and returns a shared record ( surf, dist, normal,
the point on the surface, and how far it is to the surface's nearest edge ) or
null.  accept( surf, normal ), if given, limits it to the surfaces it allows (the
wall burn's: only the plane its beam struck).
================
*/
/**
 * Finds the world surface a point lies just in front of; used by the marks here, the fireball's scorch
 * (r_fireball.js) and the wall burn (r_wallburn.js, whose `accept` keeps only the struck plane). Only surfaces
 * that touch the point's leaf are considered (sky and liquid surfaces never), and the nearest plane in front of the
 * point (no more than 0.5 units behind it) wins.
 *
 * @param {model_t} model the world model (`cl.worldmodel`); null or one without leaves gives null
 * @param {Array<number>} p the point (world space, Quake units)
 * @param {number} maxDist how far in front of a surface's plane the point may be (Quake units)
 * @param {function(Array<number>, model_t): ?mleaf_t} pointInLeaf `Mod_PointInLeaf`
 * @param {?function(msurface_t, number): boolean} [accept=null] gets the surface and the side sign (1, or -1 for a
 *   `SURF_PLANEBACK` surface); return false to skip it
 * @returns {?{ surf: msurface_t, dist: number, nx: number, ny: number, nz: number, px: number, py: number, pz: number,
 *   room: number }} the surface, the point's distance in front of it, its outward unit normal, the point projected onto
 *   the plane, and the distance to the surface's nearest texture-extent edge (all Quake units). One shared record,
 *   overwritten by the next call: copy what you keep. Null when no surface qualifies or the point is in solid.
 */
export function R_DecalSurface( model, p, maxDist, pointInLeaf, accept = null ) {

	if ( model == null || model.leafs == null ) return null;

	const leaf = pointInLeaf( p, model );
	if ( leaf == null || leaf.contents === CONTENTS_SOLID || leaf.firstmarksurface == null ) return null;

	let best = null;
	let bestDist = maxDist;

	for ( let i = 0; i < leaf.nummarksurfaces; i ++ ) {

		const s = leaf.firstmarksurface[ i ];
		if ( s == null || s.plane == null || s.texinfo == null ) continue;
		if ( s.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) continue;

		const sign = ( s.flags & SURF_PLANEBACK ) ? - 1 : 1;
		const n = s.plane.normal;
		const dist = sign * ( n[ 0 ] * p[ 0 ] + n[ 1 ] * p[ 1 ] + n[ 2 ] * p[ 2 ] - s.plane.dist );
		if ( dist < - 0.5 || dist >= bestDist ) continue;
		if ( accept !== null && ! accept( s, sign ) ) continue;

		// the point on the plane, and whether it is over the surface
		const qx = p[ 0 ] - n[ 0 ] * sign * dist, qy = p[ 1 ] - n[ 1 ] * sign * dist, qz = p[ 2 ] - n[ 2 ] * sign * dist;
		const v0 = s.texinfo.vecs[ 0 ], v1 = s.texinfo.vecs[ 1 ];
		const ts = qx * v0[ 0 ] + qy * v0[ 1 ] + qz * v0[ 2 ] + v0[ 3 ];
		const tt = qx * v1[ 0 ] + qy * v1[ 1 ] + qz * v1[ 2 ] + v1[ 3 ];
		const ext = s.extents, mins = s.texturemins;
		if ( ext == null || mins == null ) continue;
		if ( ts < mins[ 0 ] || ts > mins[ 0 ] + ext[ 0 ] || tt < mins[ 1 ] || tt > mins[ 1 ] + ext[ 1 ] ) continue;

		const l0 = Math.hypot( v0[ 0 ], v0[ 1 ], v0[ 2 ] ) || 1, l1 = Math.hypot( v1[ 0 ], v1[ 1 ], v1[ 2 ] ) || 1;
		const room = Math.min( ( ts - mins[ 0 ] ) / l0, ( mins[ 0 ] + ext[ 0 ] - ts ) / l0, ( tt - mins[ 1 ] ) / l1, ( mins[ 1 ] + ext[ 1 ] - tt ) / l1 );

		best = s;
		bestDist = dist;
		_r.surf = s; _r.dist = dist; _r.room = room;
		_r.nx = n[ 0 ] * sign; _r.ny = n[ 1 ] * sign; _r.nz = n[ 2 ] * sign;
		_r.px = qx; _r.py = qy; _r.pz = qz;

	}

	return best === null ? null : _r;

}

//============================================================================
// The marks
//============================================================================

function atlasTexture() {

	const cell = 64;
	const canvas = document.createElement( 'canvas' );
	canvas.width = cell * 4;
	canvas.height = cell * 2;
	const g = canvas.getContext( '2d' );

	const at = ( i ) => [ ( i % 4 ) * cell + cell / 2, Math.floor( i / 4 ) * cell + cell / 2 ];
	const blob = ( cx, cy, r, colour, alpha ) => {

		const grad = g.createRadialGradient( cx, cy, 0, cx, cy, r );
		grad.addColorStop( 0, `rgba(${colour},${alpha})` );
		grad.addColorStop( 0.7, `rgba(${colour},${alpha * 0.85})` );
		grad.addColorStop( 1, `rgba(${colour},0)` );
		g.fillStyle = grad;
		g.beginPath();
		g.arc( cx, cy, r, 0, Math.PI * 2 );
		g.fill();

	};

	// a tiny seeded generator so the sheet is the same every run
	let seed = 12345;
	const rand = () => ( seed = ( seed * 1103515245 + 12345 ) & 0x7fffffff ) / 0x7fffffff;

	// bullet holes: a small ragged pit, darkest in the middle, with a few hairline
	// cracks and a faint bruise around it (no pale rim: it only ever darkens)
	for ( const i of CELL_HOLE ) {

		const [ cx, cy ] = at( i );
		blob( cx, cy, 22, '255,255,255', 0.22 );
		g.strokeStyle = 'rgba(255,255,255,0.55)';
		g.lineCap = 'round';
		for ( let k = 0; k < 6; k ++ ) {

			const a = rand() * Math.PI * 2, len = 9 + rand() * 12;
			g.lineWidth = 0.8 + rand() * 0.8;
			g.beginPath();
			g.moveTo( cx, cy );
			g.lineTo( cx + Math.cos( a ) * len * 0.5 + ( rand() - 0.5 ) * 3, cy + Math.sin( a ) * len * 0.5 + ( rand() - 0.5 ) * 3 );
			g.lineTo( cx + Math.cos( a ) * len, cy + Math.sin( a ) * len );
			g.stroke();

		}

		// the pit: a few overlapping dark blobs so its edge is irregular
		for ( let k = 0; k < 5; k ++ ) {

			const a = rand() * Math.PI * 2, d = rand() * 3;
			blob( cx + Math.cos( a ) * d, cy + Math.sin( a ) * d, 5 + rand() * 3, '255,255,255', 1 );

		}

	}

	// scorch: soot, darkest at the middle, ragged
	for ( const i of CELL_SCORCH ) {

		const [ cx, cy ] = at( i );
		blob( cx, cy, 30, '20,16,12', 0.75 );
		for ( let k = 0; k < 14; k ++ ) {

			const a = rand() * Math.PI * 2, d = 10 + rand() * 16;
			blob( cx + Math.cos( a ) * d, cy + Math.sin( a ) * d, 4 + rand() * 7, '18,14,10', 0.5 );

		}

	}

	// blood: a heavy middle, drops thrown out from it, a few streaks
	for ( const i of CELL_BLOOD ) {

		const [ cx, cy ] = at( i );
		blob( cx, cy, 11 + rand() * 6, '255,255,255', 1 );
		for ( let k = 0; k < 11; k ++ ) {

			const a = rand() * Math.PI * 2, d = 12 + rand() * 16;
			blob( cx + Math.cos( a ) * d, cy + Math.sin( a ) * d, 1.5 + rand() * 4.5, '255,255,255', 0.95 );

		}

		const a = rand() * Math.PI * 2;
		g.strokeStyle = 'rgba(255,255,255,0.9)';
		g.lineWidth = 2 + rand() * 2;
		g.lineCap = 'round';
		g.beginPath();
		g.moveTo( cx, cy );
		g.lineTo( cx + Math.cos( a ) * ( 20 + rand() * 10 ), cy + Math.sin( a ) * ( 20 + rand() * 10 ) );
		g.stroke();

	}

	// a single drop
	for ( const i of CELL_DROP ) {

		const [ cx, cy ] = at( i );
		blob( cx, cy, 9, '255,255,255', 1 );
		blob( cx + 8, cy + 4, 3, '255,255,255', 0.9 );

	}

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.generateMipmaps = true;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.anisotropy = 4;
	return texture;

}

function ensureMesh() {

	if ( mesh !== null || deps === null || typeof document === 'undefined' ) return mesh !== null;

	positions = new Float32Array( MAX_DECALS * 4 * 3 );
	uvs = new Float32Array( MAX_DECALS * 4 * 2 );
	colors = new Float32Array( MAX_DECALS * 4 * 4 );
	born = new Float64Array( MAX_DECALS );
	life = new Float32Array( MAX_DECALS );
	base = new Float32Array( MAX_DECALS * 4 ); // r, g, b, a of each mark before fading

	const index = new Uint16Array( MAX_DECALS * 6 );
	for ( let i = 0; i < MAX_DECALS; i ++ ) {

		const v = i * 4;
		index.set( [ v, v + 1, v + 2, v, v + 2, v + 3 ], i * 6 );

	}

	geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ).setUsage( THREE.DynamicDrawUsage ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ).setUsage( THREE.DynamicDrawUsage ) );
	geometry.setAttribute( 'color', new THREE.BufferAttribute( colors, 4 ).setUsage( THREE.DynamicDrawUsage ) );
	geometry.setIndex( new THREE.BufferAttribute( index, 1 ) );
	geometry.setDrawRange( 0, 0 );
	geometry.boundingSphere = new THREE.Sphere( new THREE.Vector3( 0, 0, 0 ), 1e6 );

	const material = new THREE.MeshBasicMaterial( {
		map: atlasTexture(),
		vertexColors: true,
		transparent: true,
		depthWrite: false,
		toneMapped: false,
		polygonOffset: true,
		polygonOffsetFactor: - 4,
		polygonOffsetUnits: - 4,
		side: THREE.DoubleSide,
		// destination * source: the mark's colour multiplies what is already drawn
		blending: THREE.CustomBlending,
		blendEquation: THREE.AddEquation,
		blendSrc: THREE.DstColorFactor,
		blendDst: THREE.ZeroFactor
	} );

	// what is drawn is the multiplier: 1 where the mark is not, its colour where it is
	material.onBeforeCompile = ( shader ) => {

		shader.fragmentShader = 'layout(location = 1) out highp vec4 gNormal;\nlayout(location = 2) out highp vec4 gAlbedo;\nlayout(location = 3) out highp vec4 gHeightMask;\n' + shader.fragmentShader
			.replace( '#include <opaque_fragment>', 'gl_FragColor = vec4( mix( vec3( 1.0 ), outgoingLight, diffuseColor.a ), 1.0 );' )
			// Multiplicative blending: one preserves the solid receiver's data.
			.replace( '#include <colorspace_fragment>', 'gNormal = vec4( 1.0 );\n\tgAlbedo = gl_FragColor;\n gHeightMask = vec4(1.);' );

	};

	material.customProgramCacheKey = () => 'quake-decals';

	mesh = new THREE.Mesh( geometry, material );
	mesh.frustumCulled = false;
	mesh.renderOrder = 5;
	mesh.name = 'quake_decals';
	mesh.matrixAutoUpdate = false;
	return true;

}

/*
================
R_DecalPlace

Puts a mark of the given kind and size where the point is close to a surface.
Returns true if there was a surface and room for it.
================
*/
/**
 * Places one mark. The mark is a quad turned at random, lying 0.3 units off the surface, shrunk to stay on the surface (refused when
 * under 1.2 units), with a random cell of its kind's atlas; it multiplies the surface's colour and lasts its kind's life
 * (holes 90 s, scorch 120 s, blood and drops 180 s), fading over the last 8 s. It takes the next slot of the ring of 384
 * marks (overwriting the oldest) and adds the mesh to the scene on first use. Needs a browser `document` for the atlas.
 *
 * @param {string} kind 'hole', 'scorch', 'blood' or 'drop'
 * @param {Array<number>} p where the mark goes, near a surface (world space, Quake units)
 * @param {number} radius half the quad's side (Quake units)
 * @param {number} maxDist how far in front of the surface `p` may be (Quake units)
 * @returns {boolean} true when a mark was placed; false when marks are off, there is no world or surface, or no room
 */
export function R_DecalPlace( kind, p, radius, maxDist ) {

	if ( R_DecalsEnabled() === false || ensureMesh() === false ) return false;

	const cl = deps.cl();
	if ( cl == null || cl.worldmodel == null ) return false;

	const hit = R_DecalSurface( cl.worldmodel, p, maxDist, deps.pointInLeaf );
	if ( hit === null ) return false;

	// stay on the surface
	let r = Math.min( radius, hit.room + 1 );
	if ( r < 1.2 ) return false;

	const k = KINDS[ kind ];
	const cell = k.cells[ Math.floor( Math.random() * k.cells.length ) ];

	// in-plane axes, turned at random
	const nx = hit.nx, ny = hit.ny, nz = hit.nz;
	let ax = 0, ay = 0, az = 1;
	if ( Math.abs( nz ) > 0.9 ) { ax = 1; az = 0; }
	let rx = ay * nz - az * ny, ry = az * nx - ax * nz, rz = ax * ny - ay * nx;
	let len = Math.hypot( rx, ry, rz ) || 1;
	rx /= len; ry /= len; rz /= len;
	let ux = ny * rz - nz * ry, uy = nz * rx - nx * rz, uz = nx * ry - ny * rx;
	const a = Math.random() * Math.PI * 2, ca = Math.cos( a ), sa = Math.sin( a );
	const r2x = rx * ca + ux * sa, r2y = ry * ca + uy * sa, r2z = rz * ca + uz * sa;
	const u2x = - rx * sa + ux * ca, u2y = - ry * sa + uy * ca, u2z = - rz * sa + uz * ca;

	// just off the surface, so it does not sink into it
	const cx = hit.px + nx * 0.3, cy = hit.py + ny * 0.3, cz = hit.pz + nz * 0.3;

	const slot = next;
	next = ( next + 1 ) % MAX_DECALS;
	if ( used < MAX_DECALS ) used ++;

	const corners = [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ];
	const u0 = ( cell % 4 ) / 4, v0 = 1 - ( Math.floor( cell / 4 ) + 1 ) / 2;

	const cr = k.color[ 0 ], cg = k.color[ 1 ], cb = k.color[ 2 ];

	for ( let c = 0; c < 4; c ++ ) {

		const [ sx, sy ] = corners[ c ];
		const o = ( slot * 4 + c ) * 3;
		positions[ o ] = cx + r2x * sx * r + u2x * sy * r;
		positions[ o + 1 ] = cy + r2y * sx * r + u2y * sy * r;
		positions[ o + 2 ] = cz + r2z * sx * r + u2z * sy * r;

		const t = ( slot * 4 + c ) * 2;
		uvs[ t ] = u0 + ( sx > 0 ? 0.25 : 0 );
		uvs[ t + 1 ] = v0 + ( sy > 0 ? 0.5 : 0 );

		const q = ( slot * 4 + c ) * 4;
		colors[ q ] = cr; colors[ q + 1 ] = cg; colors[ q + 2 ] = cb; colors[ q + 3 ] = 1;

	}

	base[ slot * 4 ] = cr; base[ slot * 4 + 1 ] = cg; base[ slot * 4 + 2 ] = cb; base[ slot * 4 + 3 ] = 1;
	born[ slot ] = now();
	life[ slot ] = k.life;

	geometry.setDrawRange( 0, used * 6 );
	dirty = true;

	if ( mesh.parent !== deps.scene ) deps.scene.add( mesh );
	return true;

}

//============================================================================
// What makes them
//============================================================================

/**
 * A bullet hole (radius 3.6..5.2 units) where a shot struck the world, called by `CL_ParseTEnt` (cl_tent.js) for
 * `TE_SPIKE`, `TE_SUPERSPIKE` and `TE_GUNSHOT` (unless the pellet's wall burn took it, card [30c]).
 *
 * @param {Array<number>} p where the shot struck, a little in front of the surface (world space, Quake units)
 */
export function R_DecalShot( p ) {

	R_DecalPlace( 'hole', p, 3.6 + Math.random() * 1.6, 10 );

}

/**
 * A scorch mark (radius 24..34 units) on the surface within 44 units of an explosion, called by `CL_ParseTEnt`
 * (cl_tent.js) for `TE_EXPLOSION`.
 *
 * @param {Array<number>} p the explosion's centre (world space, Quake units)
 */
export function R_DecalScorch( p ) {

	R_DecalPlace( 'scorch', p, 24 + Math.random() * 10, 44 );

}

/**
 * A burst of blood at p going the way of dir: some of it reaches the wall or floor beyond. Called by
 * `R_RunParticleEffect` (r_part.js) for a blood effect (colour 73). Up to six rays (1 + count/8), each spread about
 * `dir` and a little down, are stepped out 6 units at a time for up to 90 units; each that meets solid leaves a blood
 * mark (radius 5..14) at the last open point.
 *
 * @param {Array<number>} p the wound (world space, Quake units)
 * @param {Array<number>} dir the spray's direction from the particle effect (each ray adds up to ±0.8 per axis before
 *   normalising, so it need not be unit length)
 * @param {number} count the particle effect's particle count
 */
export function R_DecalBloodSpray( p, dir, count ) {

	if ( R_DecalsEnabled() === false || deps === null ) return;

	const cl = deps.cl();
	if ( cl == null || cl.worldmodel == null ) return;

	const splats = Math.min( 6, 1 + ( count >> 3 ) );
	for ( let i = 0; i < splats; i ++ ) {

		// a ray out from the wound, spread about the way it was thrown and down a little
		const dx = dir[ 0 ] + ( Math.random() - 0.5 ) * 1.6;
		const dy = dir[ 1 ] + ( Math.random() - 0.5 ) * 1.6;
		const dz = dir[ 2 ] + ( Math.random() - 0.5 ) * 1.6 - 0.25;
		const dl = Math.hypot( dx, dy, dz ) || 1;

		let hit = false;
		let px = p[ 0 ], py = p[ 1 ], pz = p[ 2 ];
		const q = [ 0, 0, 0 ];

		for ( let d = 6; d <= 90 && hit === false; d += 6 ) {

			q[ 0 ] = p[ 0 ] + dx / dl * d; q[ 1 ] = p[ 1 ] + dy / dl * d; q[ 2 ] = p[ 2 ] + dz / dl * d;
			const leaf = deps.pointInLeaf( q, cl.worldmodel );
			if ( leaf != null && leaf.contents === CONTENTS_SOLID ) hit = true;
			else { px = q[ 0 ]; py = q[ 1 ]; pz = q[ 2 ]; }

		}

		if ( hit ) R_DecalPlace( 'blood', [ px, py, pz ], 5 + Math.random() * 9, 8 );

	}

}

const _free = [ 0, 0, 0 ];

/**
 * A blood particle moved from a to b. If b is inside the world it has landed: puts a mark where it came down (a drop
 * 55% of the time, a larger splash 25%, nothing otherwise) at the last open point on the way. Called by
 * `R_DrawParticles` (r_part.js) for each blood particle as it moves.
 *
 * @param {Array<number>} a the particle's position last frame (world space, Quake units)
 * @param {Array<number>} b its position now
 * @returns {boolean} true when b is in solid and the particle is done (remove it); false otherwise or when marks are
 *   off
 */
export function R_DecalBloodLanded( a, b ) {

	if ( R_DecalsEnabled() === false || deps === null ) return false;

	const cl = deps.cl();
	if ( cl == null || cl.worldmodel == null ) return false;

	const leaf = deps.pointInLeaf( b, cl.worldmodel );
	if ( leaf == null || leaf.contents !== CONTENTS_SOLID ) return false;

	// the last free spot on the way
	_free[ 0 ] = a[ 0 ]; _free[ 1 ] = a[ 1 ]; _free[ 2 ] = a[ 2 ];
	for ( let t = 0.75; t > 0; t -= 0.25 ) {

		const m = [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];
		const ml = deps.pointInLeaf( m, cl.worldmodel );
		if ( ml != null && ml.contents !== CONTENTS_SOLID ) {

			_free[ 0 ] = m[ 0 ]; _free[ 1 ] = m[ 1 ]; _free[ 2 ] = m[ 2 ];
			break;

		}

	}

	// most drops leave a mark; a splash is bigger than a drop
	const r = Math.random();
	if ( r < 0.55 ) R_DecalPlace( 'drop', _free, 1.6 + Math.random() * 2.4, 12 );
	else if ( r < 0.8 ) R_DecalPlace( 'blood', _free, 4 + Math.random() * 6, 12 );

	return true;

}

/**
 * A body has burst at p: a pool of blood on the floor under it, wider and in more pieces the bigger it was, and a few
 * splashes on whatever is near. Called by `CL_ParseTEnt` (cl_tent.js) for Newer Game's `TE_GORE` when its size is over
 * 1. Each piece is dropped to the floor (up to 80 units down); pieces that find none are skipped.
 *
 * @param {Array<number>} p the body's centre (world space, Quake units)
 * @param {number} size the monster's size byte, 1 (a zombie) to 6 (a shambler): 2 + 2.2*size pieces within 14 + 7*size
 *   units
 */
export function R_DecalBloodPool( p, size ) {

	if ( R_DecalsEnabled() === false || deps === null ) return;

	const cl = deps.cl();
	if ( cl == null || cl.worldmodel == null ) return;

	const pieces = Math.round( 2 + size * 2.2 );
	const reach = 14 + size * 7;
	const q = [ 0, 0, 0 ];

	for ( let i = 0; i < pieces; i ++ ) {

		// somewhere round the body, the first in the middle
		const a = Math.random() * Math.PI * 2;
		const r = i === 0 ? 0 : Math.sqrt( Math.random() ) * reach;
		const x = p[ 0 ] + Math.cos( a ) * r, y = p[ 1 ] + Math.sin( a ) * r;

		// down to the floor
		let z = p[ 2 ], found = false;
		for ( let d = 0; d <= 80 && found === false; d += 4 ) {

			q[ 0 ] = x; q[ 1 ] = y; q[ 2 ] = p[ 2 ] - d;
			const leaf = deps.pointInLeaf( q, cl.worldmodel );
			if ( leaf != null && leaf.contents === CONTENTS_SOLID ) found = true;
			else z = q[ 2 ];

		}

		if ( found ) R_DecalPlace( 'blood', [ x, y, z ], ( i === 0 ? 16 : 7 ) + size * 2.2 + Math.random() * 9, 30 + size * 4 );

	}

}

/**
 * A gib has come to rest at p: a pool of blood (radius 12..22) on the floor 8 units under it. Called by
 * `R_DecalGibTrack`.
 *
 * @param {Array<number>} p the gib's origin (world space, Quake units)
 */
export function R_DecalGibLanded( p ) {

	R_DecalPlace( 'blood', [ p[ 0 ], p[ 1 ], p[ 2 ] - 8 ], 12 + Math.random() * 10, 26 );

}

/**
 * Gibs are thrown and bounce; when one has stopped (moved under 0.6 units for 0.3 s, checked at most every 0.1 s) it
 * leaves its pool, once. Called by `R_DrawAliasModel` (gl_rmain.js) as each gib (model flag 4, `EF_GIB`) is drawn.
 * Keeps its state on the entity as `e._gibState`; a time earlier than the stored one (a new level or demo rewind)
 * starts it afresh.
 *
 * @param {entity_t} e the gib's client entity; mutated (`_gibState`)
 * @param {number} time `cl.time`, seconds
 */
export function R_DecalGibTrack( e, time ) {

	if ( R_DecalsEnabled() === false || e.origin == null ) return;

	let g = e._gibState;
	if ( g === undefined || time < g.t ) {

		g = e._gibState = { x: e.origin[ 0 ], y: e.origin[ 1 ], z: e.origin[ 2 ], t: time, still: 0, done: false };
		return;

	}

	if ( g.done || time - g.t < 0.1 ) return;

	const moved = Math.hypot( e.origin[ 0 ] - g.x, e.origin[ 1 ] - g.y, e.origin[ 2 ] - g.z );
	g.still = moved < 0.6 ? g.still + ( time - g.t ) : 0;
	g.x = e.origin[ 0 ]; g.y = e.origin[ 1 ]; g.z = e.origin[ 2 ]; g.t = time;

	if ( g.still > 0.3 ) {

		g.done = true;
		R_DecalGibLanded( e.origin );

	}

}

//============================================================================
// Per frame
//============================================================================

/**
 * Called every frame by `R_RenderView` (gl_rmain.js): hides the marks while they are switched off, fades those in
 * their last 8 seconds (checked twice a second, by `performance.now` time) and uploads the changed vertex data.
 */
export function R_DecalsFrame() {

	if ( mesh === null ) return;

	// switched off: hide them
	const on = R_DecalsEnabled();
	if ( mesh.visible !== on ) mesh.visible = on;
	if ( on === false ) return;

	const t = now();

	// fade the ones nearing the end of their lives, twice a second
	if ( t - lastFade > 0.5 ) {

		lastFade = t;
		for ( let s = 0; s < used; s ++ ) {

			const remaining = life[ s ] - ( t - born[ s ] );
			if ( remaining > FADE || base[ s * 4 + 3 ] <= 0 ) continue;

			const alpha = Math.max( 0, remaining / FADE );
			for ( let c = 0; c < 4; c ++ ) colors[ ( s * 4 + c ) * 4 + 3 ] = alpha;
			base[ s * 4 + 3 ] = alpha > 0 ? 1 : 0;
			dirty = true;

		}

	}

	if ( dirty ) {

		geometry.attributes.position.needsUpdate = true;
		geometry.attributes.uv.needsUpdate = true;
		geometry.attributes.color.needsUpdate = true;
		dirty = false;

	}

}

/**
 * A new level: everything goes. Called by `R_NewMap` (gl_rmain.js); empties the ring and takes the mesh out of the
 * scene (it is kept for reuse).
 */
export function R_DecalsClear() {

	next = 0;
	used = 0;
	if ( geometry !== null ) geometry.setDrawRange( 0, 0 );
	if ( mesh !== null && mesh.parent != null ) mesh.parent.remove( mesh );

}

/**
 * How many marks there are, for tests.
 *
 * @returns {number} the marks in the ring, 0..384 (faded ones included until overwritten)
 */
export function R_DecalCount() {

	return used;

}
