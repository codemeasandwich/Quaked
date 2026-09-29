// Marks that stay on the world in Newer Game: bullet holes where shots hit a wall,
// scorching where a rocket goes off, and blood that lands and sticks where gibs
// and blood spray come down or strike a wall.
//
// A mark is a small quad lying on the surface it hit.  Everything is one mesh (one
// draw call) with a ring of the most recent MAX_DECALS marks, so a long fight
// wears old marks away instead of slowing the game.  The surface is found from
// the level's own polygons (the leaf the point is in has the surfaces that touch
// it), so a mark takes the surface's angle, is kept inside that surface, and is
// lit by the surface's baked light where it lands.

import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { R_NewerGame, R_NewerLightingActive } from './r_anim.js';

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

// kind: [ cells, colour, seconds it lasts ]
const KINDS = {
	hole: { cells: CELL_HOLE, color: [ 1.0, 1.0, 1.0 ], life: 90 },
	scorch: { cells: CELL_SCORCH, color: [ 1.0, 1.0, 1.0 ], life: 120 },
	blood: { cells: CELL_BLOOD, color: [ 0.5, 0.025, 0.025 ], life: 180 },
	drop: { cells: CELL_DROP, color: [ 0.55, 0.03, 0.03 ], life: 180 }
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
export function R_DecalsSetup( d ) {

	deps = d;

}

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
null.
================
*/
export function R_DecalSurface( model, p, maxDist, pointInLeaf ) {

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

	// bullet holes: a dark pit with a chipped, paler rim
	for ( const i of CELL_HOLE ) {

		const [ cx, cy ] = at( i );
		blob( cx, cy, 28, '150,140,125', 0.4 );
		for ( let k = 0; k < 9; k ++ ) {

			const a = rand() * Math.PI * 2, d = 8 + rand() * 12;
			blob( cx + Math.cos( a ) * d, cy + Math.sin( a ) * d, 3 + rand() * 4, '60,55,48', 0.55 );

		}

		blob( cx, cy, 13 + rand() * 2, '8,7,5', 1 );
		blob( cx - 2, cy - 2, 7, '0,0,0', 1 );

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
		polygonOffset: true,
		polygonOffsetFactor: - 4,
		polygonOffsetUnits: - 4,
		side: THREE.DoubleSide
	} );

	mesh = new THREE.Mesh( geometry, material );
	mesh.frustumCulled = false;
	mesh.renderOrder = 5;
	mesh.name = 'quake_decals';
	mesh.matrixAutoUpdate = false;
	return true;

}

// how bright the surface is where a mark lands, in the terms the Newer lighting
// draws the baked light (it is curved, so a mark has to be too)
function surfaceLight( x, y, z ) {

	const cl = deps.cl();
	const l = deps.lightPoint( [ x, y, z ], cl );
	let f = Math.min( 1.2, Math.max( 0.02, l / 170 ) );
	if ( R_NewerLightingActive() ) f = Math.pow( f, 2.4 ) * 1.6;
	return Math.min( 1.3, f + 0.03 );

}

/*
================
R_DecalPlace

Puts a mark of the given kind and size where the point is close to a surface.
Returns true if there was a surface and room for it.
================
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

	const lit = surfaceLight( hit.px, hit.py, hit.pz );
	const cr = k.color[ 0 ] * lit, cg = k.color[ 1 ] * lit, cb = k.color[ 2 ] * lit;

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

// a shot that struck the world at p (a little in front of the surface)
export function R_DecalShot( p ) {

	R_DecalPlace( 'hole', p, 3.6 + Math.random() * 1.6, 10 );

}

// an explosion at p
export function R_DecalScorch( p ) {

	R_DecalPlace( 'scorch', p, 24 + Math.random() * 10, 44 );

}

// a burst of blood at p going the way of dir: some of it reaches the wall or floor beyond
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

// A blood particle moved from a to b.  If b is inside the world it has landed: put
// a mark where it came down and return true (the particle is done).
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

// A gib has come to rest at p: a pool of blood under it.
export function R_DecalGibLanded( p ) {

	R_DecalPlace( 'blood', [ p[ 0 ], p[ 1 ], p[ 2 ] - 8 ], 12 + Math.random() * 10, 26 );

}

// Gibs are thrown and bounce; when one has stopped it leaves its pool.  Called as
// a gib is drawn.
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

// a new level: everything goes
export function R_DecalsClear() {

	next = 0;
	used = 0;
	if ( geometry !== null ) geometry.setDrawRange( 0, 0 );
	if ( mesh !== null && mesh.parent != null ) mesh.parent.remove( mesh );

}

// how many marks there are (for tests)
export function R_DecalCount() {

	return used;

}
