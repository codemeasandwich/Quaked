// A view of another level: the part of it you would see from where you arrive,
// built as static meshes that live in the scene far away from the level you are
// in, so a doorway or pit can be a window onto it (see gl_portal.js).
//
// It is deliberately separate from the renderer's own world (gl_rsurf.js), which
// is built for one level and animates, culls and lights it every frame: this one
// is built once, from the leaves visible from the arrival point, with its own
// lightmap atlas, and only ever drawn.  No monsters, doors or lights move in it,
// and water and sky are flat.

import * as THREE from 'three';
import { Mod_PointInLeaf, Mod_LeafPVS, Mod_LoadForPreview } from './gl_model.js';
import { R_BuildLightMap, createQuakeLightmapMaterial } from './gl_rsurf.js';
import { R_RegisterGlow } from './gl_post.js';
import { R_NewerLightingActive } from './r_anim.js';
import { R_AddLevelPortal, R_ClearLevelPortals } from './gl_portal.js';
import { R_NormalMapFor } from './gl_normals.js';

// glquake.h
const SURF_PLANEBACK = 2;
const SURF_DRAWSKY = 4;
const SURF_DRAWTURB = 0x10;

const BLOCK_WIDTH = 128;
const BLOCK_HEIGHT = 128;
const MAX_BLOCKS = 32;

// scene-space offset where the other level's origin is placed
export const LEVEL_VIEW_OFFSET = [ 60000, 0, 0 ];

//============================================================================
// Lightmap atlas
//============================================================================

function createAtlas() {

	return { blocks: [], allocated: [] };

}

function newBlock( atlas ) {

	atlas.blocks.push( new Uint8Array( BLOCK_WIDTH * BLOCK_HEIGHT ) );
	atlas.allocated.push( new Int32Array( BLOCK_WIDTH ) );

}

// the classic Quake lightmap block packer
function allocBlock( atlas, w, h, out ) {

	for ( let texnum = 0; texnum < MAX_BLOCKS; texnum ++ ) {

		if ( texnum === atlas.blocks.length ) newBlock( atlas );

		const allocated = atlas.allocated[ texnum ];
		let best = BLOCK_HEIGHT;

		for ( let i = 0; i < BLOCK_WIDTH - w; i ++ ) {

			let best2 = 0;
			let j;

			for ( j = 0; j < w; j ++ ) {

				if ( allocated[ i + j ] >= best ) break;
				if ( allocated[ i + j ] > best2 ) best2 = allocated[ i + j ];

			}

			if ( j === w ) {

				out.x = i;
				out.y = best = best2;

			}

		}

		if ( best + h > BLOCK_HEIGHT ) continue;

		for ( let i = 0; i < w; i ++ ) allocated[ out.x + i ] = best + h;
		return texnum;

	}

	return - 1;

}

function atlasTexture( data ) {

	// the lightmap is stored as 255 - brightness; the material wants brightness
	const rgba = new Uint8Array( BLOCK_WIDTH * BLOCK_HEIGHT * 4 );
	for ( let i = 0; i < BLOCK_WIDTH * BLOCK_HEIGHT; i ++ ) {

		const v = 255 - data[ i ];
		rgba[ i * 4 ] = rgba[ i * 4 + 1 ] = rgba[ i * 4 + 2 ] = v;
		rgba[ i * 4 + 3 ] = 255;

	}

	const texture = new THREE.DataTexture( rgba, BLOCK_WIDTH, BLOCK_HEIGHT, THREE.RGBAFormat, THREE.UnsignedByteType );
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.flipY = false;
	texture.needsUpdate = true;
	return texture;

}

//============================================================================
// Surface geometry
//============================================================================

function surfaceVertices( model, surf ) {

	const verts = [];

	for ( let i = 0; i < surf.numedges; i ++ ) {

		const lindex = model.surfedges[ surf.firstedge + i ];
		const edge = lindex > 0 ? model.edges[ lindex ] : model.edges[ - lindex ];
		const vec = model.vertexes[ lindex > 0 ? edge.v[ 0 ] : edge.v[ 1 ] ].position;
		verts.push( vec );

	}

	return verts;

}

function texCoords( vec, texinfo, w, h ) {

	return [
		( vec[ 0 ] * texinfo.vecs[ 0 ][ 0 ] + vec[ 1 ] * texinfo.vecs[ 0 ][ 1 ] + vec[ 2 ] * texinfo.vecs[ 0 ][ 2 ] + texinfo.vecs[ 0 ][ 3 ] ),
		( vec[ 0 ] * texinfo.vecs[ 1 ][ 0 ] + vec[ 1 ] * texinfo.vecs[ 1 ][ 1 ] + vec[ 2 ] * texinfo.vecs[ 1 ][ 2 ] + texinfo.vecs[ 1 ][ 3 ] )
	].map( ( v, i ) => v / ( i === 0 ? w : h ) );

}

// growable geometry arrays
function createBucket() {

	return { position: [], normal: [], uv: [], uv1: [] };

}

function pushFan( bucket, verts, normal, uvFn, lmFn ) {

	for ( let i = 0; i < verts.length - 2; i ++ ) {

		// the same fan and winding as the renderer's own world (DrawGLPoly)
		for ( const k of [ 0, i + 2, i + 1 ] ) {

			const v = verts[ k ];
			bucket.position.push( v[ 0 ], v[ 1 ], v[ 2 ] );
			bucket.normal.push( normal[ 0 ], normal[ 1 ], normal[ 2 ] );
			const uv = uvFn( v );
			bucket.uv.push( uv[ 0 ], uv[ 1 ] );
			if ( lmFn !== null ) {

				const lm = lmFn( v );
				bucket.uv1.push( lm[ 0 ], lm[ 1 ] );

			}

		}

	}

}

function bucketGeometry( bucket, withLightmap ) {

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( bucket.position ), 3 ) );
	g.setAttribute( 'normal', new THREE.BufferAttribute( new Float32Array( bucket.normal ), 3 ) );
	g.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( bucket.uv ), 2 ) );
	if ( withLightmap ) g.setAttribute( 'uv1', new THREE.BufferAttribute( new Float32Array( bucket.uv1 ), 2 ) );
	return g;

}

// the leaves visible from a point (and a little around it)
function visibleLeaves( model, origin ) {

	const seen = new Set();
	const points = [ origin ];
	for ( const d of [ [ 64, 0, 0 ], [ - 64, 0, 0 ], [ 0, 64, 0 ], [ 0, - 64, 0 ], [ 0, 0, 48 ] ] )
		points.push( [ origin[ 0 ] + d[ 0 ], origin[ 1 ] + d[ 1 ], origin[ 2 ] + d[ 2 ] ] );

	for ( const p of points ) {

		const leaf = Mod_PointInLeaf( p, model );
		if ( leaf === model.leafs[ 0 ] ) continue;

		const vis = Mod_LeafPVS( leaf, model );
		const bytes = ( model.numleafs + 7 ) >> 3;

		for ( let i = 0; i < model.numleafs; i ++ ) {

			if ( ( vis[ i >> 3 ] & ( 1 << ( i & 7 ) ) ) === 0 || i >= bytes * 8 ) continue;
			const l = model.leafs[ i + 1 ];
			if ( l != null && l.contents !== - 2 ) seen.add( l );

		}

	}

	return seen;

}

// The sky as the level itself draws it: two layers of cloud (a solid one behind
// and a see-through one in front) scrolling at different speeds, projected onto a
// flattened dome from where the camera is, so it has depth and moves as you do.
const SKY_VERTEX = `
varying vec3 vWorld;
void main() {
	vec4 w = modelMatrix * vec4( position, 1.0 );
	vWorld = w.xyz;
	gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SKY_FRAGMENT = `
layout(location = 1) out highp vec4 gNormal;
uniform sampler2D tSolid;
uniform sampler2D tAlpha;
uniform float uSolid;
uniform float uCloud;
uniform float uUseAlpha;
uniform float uGlow;
varying vec3 vWorld;
void main() {
	vec3 d = vWorld - cameraPosition;
	d.z *= 3.0; // flatten the dome
	float k = 6.0 * 63.0 / max( length( d ), 1.0 );
	vec3 c = texture2D( tSolid, ( uSolid + d.xy * k ) / 128.0 ).rgb;
	if ( uUseAlpha > 0.5 ) {
		vec4 a = texture2D( tAlpha, ( uCloud + d.xy * k ) / 128.0 );
		c = mix( c, a.rgb, a.a );
	}
	gl_FragColor = vec4( c * uGlow, 1.0 );
	#include <colorspace_fragment>
	gNormal = vec4( 0.0 );
}`;

function skyMaterial( model ) {

	const solid = model._skySolid, alpha = model._skyAlpha;

	if ( solid == null ) {

		const flat = new THREE.MeshBasicMaterial( { color: 0x6080a0, side: THREE.DoubleSide } );
		R_RegisterGlow( flat, 1.9 );
		return flat;

	}

	for ( const t of [ solid, alpha ] ) {

		if ( t == null ) continue;
		t.wrapS = THREE.RepeatWrapping;
		t.wrapT = THREE.RepeatWrapping;

	}

	return new THREE.ShaderMaterial( {
		uniforms: {
			tSolid: { value: solid },
			tAlpha: { value: alpha != null ? alpha : solid },
			uSolid: { value: 0 },
			uCloud: { value: 0 },
			uUseAlpha: { value: alpha != null ? 1 : 0 },
			uGlow: { value: 1 }
		},
		vertexShader: SKY_VERTEX,
		fragmentShader: SKY_FRAGMENT,
		side: THREE.DoubleSide
	} );

}

// the clouds scroll: 8 and 16 texels a second, wrapping at the texture's size; and the
// sky is a light source, brighter than white, when the Newer lighting is what draws
function updateSky( material ) {

	if ( material.uniforms === undefined ) return;

	const t = performance.now() / 1000;
	material.uniforms.uSolid.value = ( t * 8 ) % 128;
	material.uniforms.uCloud.value = ( t * 16 ) % 128;
	material.uniforms.uGlow.value = R_NewerLightingActive() ? 1.9 : 1;

}

function averageColour( texture ) {

	const data = texture != null && texture.image != null ? texture.image.data : null;
	if ( data == null ) return 0x505878;

	let r = 0, g = 0, b = 0;
	const n = data.length / 4;
	for ( let i = 0; i < n; i ++ ) {

		r += data[ i * 4 ]; g += data[ i * 4 + 1 ]; b += data[ i * 4 + 2 ];

	}

	return ( Math.round( r / n ) << 16 ) | ( Math.round( g / n ) << 8 ) | Math.round( b / n );

}

/*
================
R_BuildLevelView

model   the level, already loaded (see R_LoadLevelView)
origin  where you would arrive: only what can be seen from around here is built

Returns { group, dispose } or null when there is nothing to draw.  The group is
in the level's own coordinates; the caller places it.
================
*/
export function R_BuildLevelView( model, origin ) {

	if ( model == null || model.surfaces == null || model.leafs == null ) return null;

	const leaves = visibleLeaves( model, origin );
	if ( leaves.size === 0 ) return null;

	const first = model.firstmodelsurface || 0;
	const last = first + ( model.nummodelsurfaces || model.surfaces.length );

	// the world surfaces in those leaves, once each
	const surfaces = new Set();
	for ( const leaf of leaves ) {

		if ( leaf.firstmarksurface == null ) continue;

		for ( let i = 0; i < leaf.nummarksurfaces; i ++ ) {

			const s = leaf.firstmarksurface[ i ];
			if ( s == null ) continue;
			surfaces.add( s );

		}

	}

	const atlas = createAtlas();
	const lit = new Map(); // "texture id/block" -> { texture, block, bucket }
	const sky = createBucket();
	const liquids = new Map(); // texture -> bucket
	const slot = { x: 0, y: 0 };

	for ( const surf of surfaces ) {

		if ( surf.texinfo == null || surf.texinfo.texture == null || surf.numedges < 3 ) continue;

		const tex = surf.texinfo.texture;
		const verts = surfaceVertices( model, surf );

		const sign = ( surf.flags & SURF_PLANEBACK ) ? - 1 : 1;
		const normal = [ surf.plane.normal[ 0 ] * sign, surf.plane.normal[ 1 ] * sign, surf.plane.normal[ 2 ] * sign ];

		if ( surf.flags & SURF_DRAWSKY ) {

			pushFan( sky, verts, normal, ( v ) => [ v[ 0 ] / 400, v[ 1 ] / 400 ], null );
			continue;

		}

		if ( surf.flags & SURF_DRAWTURB ) {

			if ( tex.gl_texture == null ) continue;
			if ( ! liquids.has( tex ) ) liquids.set( tex, createBucket() );
			pushFan( liquids.get( tex ), verts, normal, ( v ) => texCoords( v, surf.texinfo, 64, 64 ), null );
			continue;

		}

		if ( tex.gl_texture == null ) continue;

		// the lightmap
		const smax = ( surf.extents[ 0 ] >> 4 ) + 1;
		const tmax = ( surf.extents[ 1 ] >> 4 ) + 1;
		const block = allocBlock( atlas, smax, tmax, slot );
		if ( block < 0 ) continue; // out of room: leave this surface out

		surf.light_s = slot.x;
		surf.light_t = slot.y;
		R_BuildLightMap( surf, atlas.blocks[ block ], slot.y * BLOCK_WIDTH + slot.x, BLOCK_WIDTH );

		const key = tex.gl_texture.id + '/' + block;
		if ( ! lit.has( key ) ) lit.set( key, { texture: tex.gl_texture, block, bucket: createBucket() } );

		pushFan( lit.get( key ).bucket, verts, normal,
			( v ) => texCoords( v, surf.texinfo, tex.width, tex.height ),
			( v ) => {

				const t = texCoords( v, surf.texinfo, 1, 1 ); // in texels
				return [
					( t[ 0 ] - surf.texturemins[ 0 ] + slot_light( surf, 0 ) * 16 + 8 ) / ( BLOCK_WIDTH * 16 ),
					( t[ 1 ] - surf.texturemins[ 1 ] + slot_light( surf, 1 ) * 16 + 8 ) / ( BLOCK_HEIGHT * 16 )
				];

			} );

	}

	const group = new THREE.Group();
	group.name = 'quake_level_view';
	const disposables = [];

	const lightmapTextures = atlas.blocks.map( atlasTexture );
	disposables.push( ...lightmapTextures );

	for ( const entry of lit.values() ) {

		const material = createQuakeLightmapMaterial( entry.texture, lightmapTextures[ entry.block ] );
		const geometry = bucketGeometry( entry.bucket, true );
		group.add( new THREE.Mesh( geometry, material ) );
		disposables.push( geometry, material );

	}

	if ( sky.position.length > 0 ) {

		const material = skyMaterial( model );
		const geometry = bucketGeometry( sky, false );
		const mesh = new THREE.Mesh( geometry, material );
		mesh.onBeforeRender = () => updateSky( material );
		group.add( mesh );
		disposables.push( geometry, material );

	}

	for ( const [ tex, bucket ] of liquids ) {

		const lava = tex.name.toLowerCase().indexOf( 'lava' ) >= 0;
		const material = new THREE.MeshBasicMaterial( {
			map: tex.gl_texture,
			side: THREE.DoubleSide,
			transparent: ! lava,
			opacity: lava ? 1 : 0.6,
			depthWrite: lava
		} );
		const geometry = bucketGeometry( bucket, false );
		group.add( new THREE.Mesh( geometry, material ) );
		disposables.push( geometry, material );

	}

	// static: nothing here moves
	for ( const child of group.children ) child.matrixAutoUpdate = false;

	return {
		group,
		leaves: leaves.size,
		surfaces: surfaces.size,
		dispose: () => {

			if ( group.parent != null ) group.parent.remove( group );
			for ( const d of disposables ) d.dispose();

		}
	};

}

// (the lightmap position of a surface: s is 0, t is 1)
function slot_light( surf, axis ) {

	return axis === 0 ? surf.light_s : surf.light_t;

}

/*
================
R_LoadLevelView

Load a level by name and build the view of it from where you would arrive.
================
*/
export function R_LoadLevelView( mapName, origin ) {

	const model = Mod_LoadForPreview( 'maps/' + mapName + '.bsp' );
	if ( model == null ) return null;

	return R_BuildLevelView( model, origin );

}


//============================================================================
// The views of a level's exits
//============================================================================

let views = [];
let setupGeneration = 0;

export function R_ClearLevelViews() {

	setupGeneration ++;

	for ( const v of views ) v.dispose();
	views = [];
	R_ClearLevelPortals();

}

/*
================
R_SetupLevelViews

Called when a level starts.  For each seamless exit (see sv_seamless.js) the level
it leads to is built and placed far away in the scene, and the exit gets a window
onto it.
================
*/
export function R_SetupLevelViews( scene, crossings ) {

	R_ClearLevelViews();
	if ( scene == null ) return;

	// one view per timeslice, after the frame that starts the level: building them
	// is work that need not stall the arrival
	const generation = ++ setupGeneration;

	crossings.forEach( ( c, i ) => {

		setTimeout( () => {

			if ( generation === setupGeneration ) buildView( scene, c, i );

		}, 20 + i * 40 );

	} );

}

function buildView( scene, c, i ) {

	const t = c.transform;
	const o = c.opening;
	if ( o === undefined ) return;

	const model = Mod_LoadForPreview( 'maps/' + c.map + '.bsp' );
	const view = model != null ? R_BuildLevelView( model, t.dest ) : null;
	if ( view === null ) return;

	// each level gets a space of its own
	const off = [ LEVEL_VIEW_OFFSET[ 0 ] + i * 30000, LEVEL_VIEW_OFFSET[ 1 ], LEVEL_VIEW_OFFSET[ 2 ] ];
	view.group.position.set( off[ 0 ], off[ 1 ], off[ 2 ] );
	view.group.updateMatrix();
	scene.add( view.group );

	// this level's coordinates -> the scene: p' = off + dest + R( p - centre )
	const rad = t.yaw * Math.PI / 180;
	const cos = Math.cos( rad ), sin = Math.sin( rad );
	const cc = t.center;
	const matrix = [
		cos, sin, 0, 0,
		- sin, cos, 0, 0,
		0, 0, 1, 0,
		off[ 0 ] + t.dest[ 0 ] - ( cos * cc[ 0 ] - sin * cc[ 1 ] ),
		off[ 1 ] + t.dest[ 1 ] - ( sin * cc[ 0 ] + cos * cc[ 1 ] ),
		off[ 2 ] + t.dest[ 2 ] - cc[ 2 ],
		1
	];

	const shift = o.shift !== undefined ? o.shift : [ 0, 0, 0 ];
	const corner = ( a, b ) => [
		cc[ 0 ] + o.axisA[ 0 ] * a + o.axisB[ 0 ] * b + shift[ 0 ],
		cc[ 1 ] + o.axisA[ 1 ] * a + o.axisB[ 1 ] * b + shift[ 1 ],
		cc[ 2 ] + o.axisA[ 2 ] * a + o.axisB[ 2 ] * b + shift[ 2 ]
	];

	R_AddLevelPortal( scene,
		[ corner( o.a0, o.b0 ), corner( o.a1, o.b0 ), corner( o.a1, o.b1 ), corner( o.a0, o.b1 ) ],
		matrix,
		[ off[ 0 ] + t.dest[ 0 ], off[ 1 ] + t.dest[ 1 ], off[ 2 ] + t.dest[ 2 ] ],
		t.direction( t.through ) );

	views.push( view );

	R_PrewarmNormalMaps( model );

}

// The rest of the level's textures get their normal maps made now, a few at a
// time while the player walks about, so that starting the level does not have to.
function R_PrewarmNormalMaps( model ) {

	if ( model == null || model.textures == null ) return;

	const generation = setupGeneration;
	const queue = model.textures.filter( ( t ) => t != null && t.gl_texture != null && t.name.charAt( 0 ) !== '*' );

	const step = () => {

		if ( generation !== setupGeneration || queue.length === 0 ) return;
		R_NormalMapFor( queue.shift().gl_texture );
		setTimeout( step, 12 );

	};

	setTimeout( step, 60 );

}

export function R_LevelViewCount() {

	return views.length;

}
