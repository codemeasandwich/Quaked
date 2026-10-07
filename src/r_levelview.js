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
import { R_IsNewer } from './r_anim.js';
import { R_RendVeilSeen, R_RendVeilRelease } from './r_rendveil.js';
import { R_AddLevelPortal, R_ClearLevelPortals, R_RemoveLevelPortal } from './gl_portal.js';
import { R_NormalMapFor } from './gl_normals.js';
import { R_LightPoint } from './gl_rlight.js';
import { R_DrawAliasModel } from './gl_mesh.js';
import { r_avertexnormal_dots } from './anorm_dots.js';
import { Cvar_VariableValue } from './cvar.js';
import { R_LevelEntities, R_FramePrefix } from './r_levelents.js';
import { R_NewerTexturesForModel } from './r_newertextures.js';
import { R_RockBakePrefetch } from './r_rockbakes.js';
import { R_AxeCorpsePreview } from './r_axecorpses.js';
import { Con_DPrintf } from './common.js';

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

function pushFan( bucket, verts, normal, uvFn, lmFn, off ) {

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
layout(location = 2) out highp vec4 gAlbedo;
layout(location = 3) out highp vec4 gHeightMask;
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
	gAlbedo = vec4( 0.0 );
	gHeightMask = vec4(1.0);
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


//============================================================================
// Entities
//============================================================================

const SHADEDOT_QUANT = 16;

// Is any of a brush entity's box (moved to origin) in what can be seen?  Doors and
// false walls stand inside solid, so the points are taken a little outside it.
function boundsSeen( mins, maxs, origin, seenLeaf ) {

	const pad = 24;
	for ( const x of [ mins[ 0 ] - pad, ( mins[ 0 ] + maxs[ 0 ] ) / 2, maxs[ 0 ] + pad ] )
		for ( const y of [ mins[ 1 ] - pad, ( mins[ 1 ] + maxs[ 1 ] ) / 2, maxs[ 1 ] + pad ] )
			for ( const z of [ mins[ 2 ] - pad, ( mins[ 2 ] + maxs[ 2 ] ) / 2, maxs[ 2 ] + pad ] )
				if ( seenLeaf( [ x + origin[ 0 ], y + origin[ 1 ], z + origin[ 2 ] ] ) ) return true;

	return false;

}

// A monster, item or torch of another level: a model like the ones the game draws,
// lit from that level's own lightmaps.
function createGhost( ent, world ) {

	const m = Mod_LoadForPreview( ent.model );
	const hdr = m != null && m.cache != null ? m.cache.data : null;
	if ( hdr == null || hdr.posedata == null ) return null;

	const e = { _rendVeil: ent.rendVeil ?? null, _rendVeilTime: ent.rendVeilTime ?? null,
		_rendVeilSnapshot: true,
		model: m, frame: ent.frame, skinnum: ent.skin, origin: ent.origin.slice(), angles: ent.angles.slice() };
	const frames = hdr.frames || [];

	// monsters from the level's own list start standing about
	if ( ent.fromSnapshot === false && ent.classname.indexOf( 'monster_' ) === 0 ) {

		for ( const prefix of [ 'stand', 'walk', 'swim', 'idle', 'fly' ] ) {

			const at = frames.findIndex( ( f ) => R_FramePrefix( f.name ) === prefix );
			if ( at >= 0 ) {

				e.frame = at;
				break;

			}

		}

	}

	// idle loops play on; anything else (a death, an attack) is left as it was
	let seq = null;
	const cur = frames[ e.frame ];
	if ( ! e._rendVeil && cur != null && [ 'stand', 'walk', 'swim', 'idle', 'fly', 'flame' ].indexOf( R_FramePrefix( cur.name ) ) >= 0 ) {

		const prefix = R_FramePrefix( cur.name );
		const list = [];
		frames.forEach( ( f, i ) => {

			if ( R_FramePrefix( f.name ) === prefix ) list.push( i );

		} );
		if ( list.length > 1 ) seq = list;

	}

	// what the game's own lighting of a model gives at that spot
	const flame = m.name === 'progs/flame2.mdl' || m.name === 'progs/flame.mdl';
	const light = flame ? 256 : R_LightPoint( e.origin, { worldmodel: world } );

	const g = {
		e, hdr, seq, light, flame,
		spin: ( m.flags & 8 ) !== 0,
		phase: ( Math.random() * 1000 ) | 0,
		last: - 1000,
		mesh: null
	};

	if ( ! ghostDraw( g, 0 ) ) return null;
	return g;

}

function releaseGhostRite( g ) {
	R_RendVeilRelease( g.e );
	g.rendScene?.removeFromParent();
	g.rendScene = null;
}

function drawGhostRite( g, mesh ) {
	if ( ! g.e._rendVeil || ! Number.isFinite( g.e._rendVeilTime ) || ! R_IsNewer() ) {
		releaseGhostRite( g );
		return;
	}
	// bindThreeSubject places its ghosts in render-world coordinates. Keep an
	// identity sibling of the translated view group, avoiding a doubled offset.
	let root = mesh.parent;
	while ( root?.parent ) root = root.parent;
	if ( ! root?.isScene ) return; // the view has not been attached yet
	if ( g.rendScene?.parent !== root ) {
		releaseGhostRite( g );
		g.rendScene = new THREE.Group();
		g.rendScene.name = 'Rend the Veil / frozen level snapshot';
		root.add( g.rendScene );
	}
	// A saved level does not own a running server clock. Reproduce exactly its
	// saved stage until the level is restored; rendering never releases its AI.
	R_RendVeilSeen( g.e, mesh, g.rendScene );
}

function ghostDraw( g, time ) {

	const e = g.e;
	if ( g.spin ) e.angles[ 1 ] = ( time * 100 ) % 360;
	if ( g.seq !== null ) e.frame = g.seq[ ( ( time * 10 ) + g.phase | 0 ) % g.seq.length ];

	// as the game clamps a model's light (flames are left to glow)
	const light = g.flame ? ( R_NewerLightingActive() ? 640 : 256 ) : g.light;
	let ambient = light;
	let shade = light;
	if ( g.flame === false ) {

		if ( ambient > 128 ) ambient = 128;
		if ( ambient + shade > 192 ) shade = 192 - ambient;

	}

	const row = ( ( e.angles[ 1 ] * ( SHADEDOT_QUANT / 360 ) ) | 0 ) & ( SHADEDOT_QUANT - 1 );
	const mesh = R_DrawAliasModel( e, g.hdr, r_avertexnormal_dots[ row ], shade / 200 );
	if ( mesh == null ) return false;

	g.mesh = mesh;
	drawGhostRite( g, mesh );
	g.last = time;
	return true;

}

// Called every frame: what plays in the other levels (idle animations, spinning
// items, and skins that have finished loading) while one of their windows is near.
export function R_UpdateLevelViewEntities( camera, time ) {

	for ( const v of views ) {

		if ( v.ghosts.length === 0 || v.anchor === undefined ) continue;
		const dx = camera[ 0 ] - v.anchor[ 0 ], dy = camera[ 1 ] - v.anchor[ 1 ], dz = camera[ 2 ] - v.anchor[ 2 ];
		if ( dx * dx + dy * dy + dz * dz > 2500 * 2500 ) continue;

		for ( const g of v.ghosts ) {

			if ( ! g.e._rendVeil && g.seq === null && ! g.spin && ! g.flame && time - g.last < 1 ) continue; // (a flame burns on every frame)
			ghostDraw( g, time );

		}

	}

}


//============================================================================
// Runners: monsters seen on the far side of a doorway, on their way to it
//============================================================================
//
// A monster that was hunting the player when they crossed is still in the level they left
// (as far as the picture through the doorway is concerned) and runs for the doorway in a
// straight line; the game makes it real when it gets there (see sv_seamless.js).

const RUN_PREFIXES = [ 'run', 'runb', 'runc', 'rund', 'walk', 'fly', 'swim', 'stand' ];
let runners = [];

function R_AttachRunner( r, view ) {

	const m = Mod_LoadForPreview( r.model );
	const hdr = m != null && m.cache != null ? m.cache.data : null;
	if ( hdr == null || hdr.posedata == null ) return;

	const frames = hdr.frames || [];
	let seq = null;
	for ( const prefix of RUN_PREFIXES ) {

		const list = [];
		frames.forEach( ( f, i ) => {

			if ( R_FramePrefix( f.name ) === prefix ) list.push( i );

		} );
		if ( list.length > 1 ) {

			seq = list;
			break;

		}

	}

	const g = createGhost( { model: r.model, frame: seq !== null ? seq[ 0 ] : 0, skin: r.skin, origin: r.pos.slice(), angles: [ 0, r.yaw, 0 ], classname: r.classname, fromSnapshot: true }, view.world );
	if ( g === null ) return;

	g.seq = seq;
	view.ghosts.push( g );
	view.group.add( g.mesh );
	r.g = g;
	r.view = view;

}

function R_AttachRunners( view ) {

	view.world = Mod_LoadForPreview( 'maps/' + view.map + '.bsp' );
	for ( const r of runners ) if ( r.g == null && r.map === view.map ) R_AttachRunner( r, view );

}

// map: the level the monster is in (as the view knows it), pos/yaw in that level's coordinates
export function R_AddLevelRunner( map, model, skin, classname, pos, yaw ) {

	const r = { map, model, skin, classname, pos: pos.slice(), yaw, g: null, view: null };
	runners.push( r );
	for ( const v of views ) if ( v.map === map && r.g == null && v.world !== undefined ) R_AttachRunner( r, v );
	return r;

}

export function R_MoveLevelRunner( r, pos, yaw ) {

	if ( r.g == null ) return;
	r.g.e.origin[ 0 ] = pos[ 0 ]; r.g.e.origin[ 1 ] = pos[ 1 ]; r.g.e.origin[ 2 ] = pos[ 2 ];
	r.g.e.angles[ 1 ] = yaw;

}

export function R_RemoveLevelRunner( r ) {

	runners = runners.filter( ( x ) => x !== r );
	if ( r.g == null || r.view == null ) return;

	r.view.ghosts = r.view.ghosts.filter( ( g ) => g !== r.g );
	releaseGhostRite( r.g );
	if ( r.g.mesh.parent != null ) r.g.mesh.parent.remove( r.g.mesh );
	if ( r.g.e._aliasGeo != null ) r.g.e._aliasGeo.dispose();
	r.g = null;

}

export function R_ClearLevelRunners() {

	for ( const r of runners.slice() ) R_RemoveLevelRunner( r );
	runners = [];

}

let snapshotSource = null;

// how the levels you have been in were left (set by the renderer, which knows the server)
export function R_LevelViewUseSnapshots( fn ) {

	snapshotSource = fn;

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
export function R_BuildLevelView( model, origin, entities = [] ) {
 if(R_NewerLightingActive())R_RockBakePrefetch(model?.name,undefined,undefined,model?.bspSourceBytes);

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

	const addSurface = ( model, surf, off ) => {

		if ( surf.texinfo == null || surf.texinfo.texture == null || surf.numedges < 3 ) return;

		const tex = surf.texinfo.texture;
		const verts = surfaceVertices( model, surf );

		const sign = ( surf.flags & SURF_PLANEBACK ) ? - 1 : 1;
		const normal = [ surf.plane.normal[ 0 ] * sign, surf.plane.normal[ 1 ] * sign, surf.plane.normal[ 2 ] * sign ];

		if ( surf.flags & SURF_DRAWSKY ) {

			pushFan( sky, verts, normal, ( v ) => [ v[ 0 ] / 400, v[ 1 ] / 400 ], null, off );
			return;

		}

		if ( surf.flags & SURF_DRAWTURB ) {

			if ( tex.gl_texture == null ) return;
			if ( ! liquids.has( tex ) ) liquids.set( tex, createBucket() );
			pushFan( liquids.get( tex ), verts, normal, ( v ) => texCoords( v, surf.texinfo, 64, 64 ), null, off );
			return;

		}

		if ( tex.gl_texture == null ) return;

		// the lightmap
		const smax = ( surf.extents[ 0 ] >> 4 ) + 1;
		const tmax = ( surf.extents[ 1 ] >> 4 ) + 1;
		const block = allocBlock( atlas, smax, tmax, slot );
		if ( block < 0 ) return; // out of room: leave this surface out

		surf.light_s = slot.x;
		surf.light_t = slot.y;
		R_BuildLightMap( surf, atlas.blocks[ block ], slot.y * BLOCK_WIDTH + slot.x, BLOCK_WIDTH, 1 );

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

	};

	for ( const surf of surfaces ) addSurface( model, surf, undefined );

	// the entities: doors and false walls (brush models, which are not in the
	// world's leaves), items, monsters and torches
	const ghosts = [];
	const cutGhosts = [];
	const cutFailures = [];
	const failedCuts = new Set();
	const seenLeaf = ( p ) => leaves.has( Mod_PointInLeaf( p, model ) );

	// Resolve optional replacements first, even though their owning edicts
	// follow the original monster/gibs in the native snapshot.
	for ( const ent of [...entities.filter(e=>e.kind==='axe'),...entities.filter(e=>e.kind!=='axe')] ) {

		const o = ent.origin;

		if ( ent.kind === 'axe' ) {
			try{if(!ent.record)throw Error('Invalid saved axe corpse');if(seenLeaf(ent.origin))cutGhosts.push(R_AxeCorpsePreview(ent.record,model,ent.time));}catch(error){failedCuts.add(ent.cutKey);cutFailures.push(String(error.message));Con_DPrintf('Cut corpse preview unavailable: %s\n',error.message);}
		} else if ( ent.kind === 'brush' ) {

			const sm = ent.submodel;
			if ( ! boundsSeen( sm.mins, sm.maxs, o, seenLeaf ) ) continue;
			for ( let i = 0; i < sm.numfaces; i ++ ) {

				const surf = model.surfaces[ sm.firstface + i ];
				if ( surf != null ) addSurface( model, surf, o );

			}

		} else if ( ent.kind === 'bsp' ) {

			if ( ! seenLeaf( [ o[ 0 ] + 16, o[ 1 ] + 16, o[ 2 ] + 16 ] ) ) continue;
			const m = Mod_LoadForPreview( ent.model );
			if ( m == null || m.surfaces == null ) continue;
			const first = m.firstmodelsurface || 0;
			for ( let i = 0; i < ( m.nummodelsurfaces || 0 ); i ++ ) {

				const surf = m.surfaces[ first + i ];
				if ( surf != null ) addSurface( m, surf, o );

			}

		} else if ( ent.kind === 'alias' || ent.kind === 'axeFallback' && failedCuts.has(ent.fallbackFor) ) {

			if ( ! seenLeaf( [ o[ 0 ], o[ 1 ], o[ 2 ] + 24 ] ) ) continue;
			const g = createGhost( ent, model );
			if ( g !== null ) ghosts.push( g );

		}

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

	for ( const g of ghosts ) group.add( g.mesh );
	for ( const g of cutGhosts ) group.add( g.mesh );

	return {
		group,
		leaves: leaves.size,
		surfaces: surfaces.size,
		ghosts,
		cutFailures,
		dispose: () => {

			if ( group.parent != null ) group.parent.remove( group );
			for ( const g of ghosts ) {
				releaseGhostRite( g );
				if ( g.e._aliasGeo != null ) g.e._aliasGeo.dispose();
			}
			for ( const g of cutGhosts ) g.dispose();
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
	viewCrossings = []; removedPortals.clear();
	for ( const r of runners ) { r.g = null; r.view = null; } // they are attached again when the views are built

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
	viewCrossings = crossings;

	// one view per timeslice, after the frame that starts the level: building them
	// is work that need not stall the arrival
	const generation = ++ setupGeneration;

	crossings.forEach( ( c, i ) => {

		setTimeout( () => {

			if ( generation === setupGeneration ) buildView( scene, c, i );

		}, 20 + i * 40 );

	} );

}

// the crossings the views were set up for; a crossing the server has shut (closed) loses its window and view
let viewCrossings = [];
const removedPortals = new Set(); // (crossings whose window has already been taken out)

function buildView( scene, c, i ) {

	const t = c.transform;
	const o = c.opening;
	if ( o === undefined || c.closed === true ) return;

	const model = Mod_LoadForPreview( 'maps/' + c.map + '.bsp' );
	let entities = [];
	if ( model != null ) {

		// how you left it if you have been there, else as it starts
		const snapshot = snapshotSource !== null ? snapshotSource( c.map ) : null;
		entities = R_LevelEntities( model.entities, snapshot, model.submodels, Cvar_VariableValue( 'skill' ) );

	}

	R_NewerTexturesForModel( model );
	const view = model != null ? R_BuildLevelView( model, t.dest, entities ) : null;
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

	view.anchor = corner( ( o.a0 + o.a1 ) / 2, ( o.b0 + o.b1 ) / 2 );
	view.map = c.map;
	view.crossing = i;
	// The oblique clipping plane must be the transformed visible plane, even
	// when the physical crossing threshold is nearer than the recessed window.
	const receiver = t.position( cc.map( ( value, axis ) => value + shift[ axis ] ) );

	const portal = R_AddLevelPortal( scene,
		[ corner( o.a0, o.b0 ), corner( o.a1, o.b0 ), corner( o.a1, o.b1 ), corner( o.a0, o.b1 ) ],
		matrix,
		[ off[ 0 ] + receiver[ 0 ], off[ 1 ] + receiver[ 1 ], off[ 2 ] + receiver[ 2 ] ],
		t.direction( t.through ),
		o.polygons ); // (a slipgate's window is its own surface's shape: R_AddLevelPortal draws these instead of the rectangle)
	portal.crossing = i;

	views.push( view );
	R_AttachRunners( view );

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

// Every frame: drop the window and the view of any crossing the server has shut (the way back, once a respawn has landed).
export function R_SyncLevelViews() {

	for ( let i = views.length - 1; i >= 0; i -- ) {

		const v = views[ i ];
		if ( viewCrossings[ v.crossing ]?.closed !== true ) continue;
		for ( const r of runners ) if ( r.view === v ) { r.g = null; r.view = null; }
		v.dispose();
		views.splice( i, 1 );

	}

	for ( let k = 0; k < viewCrossings.length; k ++ ) if ( viewCrossings[ k ]?.closed === true && ! removedPortals.has( k ) ) { removedPortals.add( k ); R_RemoveLevelPortal( k ); }

}

export function R_LevelViewCount() {

	return views.length;

}

// what the views hold (for tests)
export function R_LevelViewGhosts() {

	return views.map( ( v ) => v.ghosts.map( ( g ) => [ g.e.model.name, ...g.e.origin ] ) );

}
