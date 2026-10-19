/**
 * @module engine/render/r_part
 *
 * Particles (WinQuake r_part.c): explosions, trails, blood and the rest, drawn as points.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `activeList`, `freeList`, `_scene`, `_sv_gravity`,
 * `pointsGeometry`, `pointsMaterial`, `pointsMesh`, `particleTexture`, `classicGeometry`, `classicMesh`,
 * `tracercount`, `_avelocitiesInitialized`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Engine callbacks are injected with `R_SetParticleExternals`.
 */
// Ported from: WinQuake/r_part.c -- particle system

import * as THREE from 'three';
import { VectorCopy, VectorSubtract, VectorNormalize } from '../common/mathlib.js';
import { r_avertexnormals } from '../common/anorm_dots.js';
import { d_8to24table } from './vid.js';
import { cl as client_cl } from '../client/client.js';
import { GL_TextureLinear, GL_RegisterTexture } from './glquake.js';
import { isXRActive, XR_SCALE } from '../../platform/webxr.js';
import { GameProfile_IsHexen2 } from '../common/game_profile.js';
import { CONTENTS_EMPTY } from '../common/bspfile.js';
import { Mod_PointInLeaf } from './gl_model.js';
import { R_DecalBloodSpray, R_DecalBloodLanded } from '../common/hooks.js'; // installed by newer/render/r_decals.js
import { R_WeaponSurfaceBloodAt } from '../common/hooks.js'; // installed by newer/render/r_weapon_surface.js
import { R_ScreenDropsBloodAt } from '../common/hooks.js'; // installed by newer/render/r_screendrops.js

// uhexen2 r_part.c:35 raises the pool to 7000 for Hexen II; Quake keeps WinQuake's 2048. Picked at R_InitParticles,
// after the host has chosen the game profile (main.js Host_Init order).
const QUAKE_PARTICLE_LIMIT = 2048;
const HEXEN2_PARTICLE_LIMIT = 7000;
let maxParticles = QUAKE_PARTICLE_LIMIT;

// uhexen2 palette indices whose 16-colour spans form d_8to24TranslucentTable (gl_vidsdl.c:1051). A particle colour
// at or above 256 selects one of those spans; the engine has no translucent particle material, so the base colour is
// used and the alpha acts only through the same visible hue.
const COLOR_INDEX = [ 0, 31, 47, 63, 79, 95, 111, 127, 143, 159, 175, 191, 199, 207, 223, 231 ];

// Precomputed sRGB -> linear lookup table (256 entries)
// Quake palette values are sRGB; Three.js expects vertex colors in linear space.
const srgbToLinear = new Float32Array( 256 );
for ( let i = 0; i < 256; i ++ ) {

	const s = i / 255;
	srgbToLinear[ i ] = s <= 0.04045 ? s / 12.92 : Math.pow( ( s + 0.055 ) / 1.055, 2.4 );

}

const ramp1 = [ 0x6f, 0x6d, 0x6b, 0x69, 0x67, 0x65, 0x63, 0x61 ];
const ramp2 = [ 0x6f, 0x6e, 0x6d, 0x6c, 0x6b, 0x6a, 0x68, 0x66 ];
const ramp3 = [ 0x6d, 0x6b, 6, 5, 4, 3 ];
// uhexen2 r_part.c:41-54: the Hexen II ramps are palette-index bases (the 256+ ranges are the translucent table).
const ramp4 = [ 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431 ];
const ramp5 = [ 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415 ];
const ramp6 = [ 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271 ];
const ramp7 = [ 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399 ];
const ramp8 = [ 175, 174, 173, 172, 171, 170, 169, 168, 167, 166, 13, 14, 15, 16, 17, 18 ];
const ramp9 = [ 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431 ];
const ramp10 = [ 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447 ];
const ramp11 = [ 424, 425, 426, 427, 428, 429, 430, 431 ];
const ramp12 = [ 136, 137, 138, 139, 140, 141, 142, 143 ];

// uhexen2 particle.h: the native ptype_t numbering. Quake's internal renumbering is replaced by these values so a
// Hexen II svc_particle2/3/4 effect byte can be used directly.
const pt_static = 0;
const pt_grav = 1;
const pt_fastgrav = 2;
const pt_slowgrav = 3;
const pt_fire = 4;
const pt_explode = 5;
const pt_explode2 = 6;
const pt_blob = 7;
const pt_blob2 = 8;
const pt_rain = 9;
const pt_c_explode = 10;
const pt_c_explode2 = 11;
const pt_spit = 12;
const pt_fireball = 13;
const pt_ice = 14;
const pt_spell = 15;
const pt_test = 16;
const pt_quake = 17;
const pt_rd = 18;
const pt_vorpal = 19;
const pt_setstaff = 20;
const pt_magicmissile = 21;
const pt_boneshard = 22;
const pt_scarab = 23;
const pt_acidball = 24;
const pt_darken = 25;
const pt_snow = 26;
const pt_gravwell = 27;
const pt_redfire = 28;

/** The native Hexen II particle type numbers (uhexen2 particle.h), for svc_particle2/3/4 and R_RocketTrail callers. */
export const PT = Object.freeze( {
	STATIC: pt_static, GRAV: pt_grav, FASTGRAV: pt_fastgrav, SLOWGRAV: pt_slowgrav, FIRE: pt_fire,
	EXPLODE: pt_explode, EXPLODE2: pt_explode2, BLOB: pt_blob, BLOB2: pt_blob2, RAIN: pt_rain,
	C_EXPLODE: pt_c_explode, C_EXPLODE2: pt_c_explode2, SPIT: pt_spit, FIREBALL: pt_fireball, ICE: pt_ice,
	SPELL: pt_spell, TEST: pt_test, QUAKE: pt_quake, RD: pt_rd, VORPAL: pt_vorpal, SETSTAFF: pt_setstaff,
	MAGICMISSILE: pt_magicmissile, BONESHARD: pt_boneshard, SCARAB: pt_scarab, ACIDBALL: pt_acidball,
	DARKEN: pt_darken, SNOW: pt_snow, GRAVWELL: pt_gravwell, REDFIRE: pt_redfire
} );

/** The native Hexen II trail type numbers (uhexen2 particle.h rt_type_t). */
export const RT = Object.freeze( {
	ROCKET_TRAIL: 0, SMOKE: 1, BLOOD: 2, TRACER: 3, SLIGHT_BLOOD: 4, TRACER2: 5, VOOR_TRAIL: 6,
	FIREBALL: 7, ICE: 8, SPIT: 9, SPELL: 10, VORPAL: 11, SETSTAFF: 12, MAGICMISSILE: 13,
	BONESHARD: 14, SCARAB: 15, ACIDBALL: 16, BLOODSHOT: 17
} );

const SFL_FLUFFY = 1;
const SFL_MIXED = 2;
const SFL_HALF_BRIGHT = 4;
const SFL_NO_MELT = 8;
const SFL_IN_BOUNDS = 16;
const SFL_NO_TRANS = 32;

class particle_t {

	constructor() {

		this.org = new Float32Array( 3 );
		this.vel = new Float32Array( 3 );
		this.min_org = new Float32Array( 3 );
		this.max_org = new Float32Array( 3 );
		this.color = 0;
		this.ramp = 0;
		this.die = - 1;
		this.type = pt_static;
		this.flags = 0;
		this.count = 0;
		// drawn only in the title demo's Classic half (see R_ParticleExplosion)
		this.classicOnly = false;

	}

}

// Particle pool — use array index as linked list via nextIndex. The arrays are sized by R_InitParticles for the
// session's game (7000 Hexen II, 2048 Quake); `particles` is rebuilt there.
let particles = [];
let particleNext = new Int32Array( 0 );
let positionArray = new Float32Array( 0 );
let classicPositionArray = new Float32Array( 0 );
let classicColorArray = new Float32Array( 0 );
let colorArray = new Float32Array( 0 );

let activeList = - 1; // head index of active list
let freeList = - 1; // head index of free list

// External state
let _scene = null;
let _sv_gravity = { value: 800 }; // cvar-like default; canonical cvar injected by Host_Init

// THREE.js rendering objects
let pointsGeometry = null;
let pointsMaterial = null;
let pointsMesh = null;
let classicGeometry = null;
let classicMesh = null;
let particleTexture = null;

let tracercount = 0;
const _prevOrg = new Float32Array( 3 );
const riderOrigin = new Float32Array( 3 );

/*
===============
R_InitParticleTexture

Matches gl_rmisc.c R_InitParticleTexture — 8x8 white dot with alpha diamond
===============
*/
function R_InitParticleTexture() {

	const dottexture = [
		[ 0, 1, 1, 0, 0, 0, 0, 0 ],
		[ 1, 1, 1, 1, 0, 0, 0, 0 ],
		[ 1, 1, 1, 1, 0, 0, 0, 0 ],
		[ 0, 1, 1, 0, 0, 0, 0, 0 ],
		[ 0, 0, 0, 0, 0, 0, 0, 0 ],
		[ 0, 0, 0, 0, 0, 0, 0, 0 ],
		[ 0, 0, 0, 0, 0, 0, 0, 0 ],
		[ 0, 0, 0, 0, 0, 0, 0, 0 ]
	];

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

	particleTexture = new THREE.DataTexture( data, 8, 8, THREE.RGBAFormat );
	// Use cvar to determine filter mode: 0 = nearest (pixelated), 1 = linear (smooth)
	const filter = GL_TextureLinear() ? THREE.LinearFilter : THREE.NearestFilter;
	particleTexture.magFilter = filter;
	particleTexture.minFilter = filter;
	particleTexture.colorSpace = THREE.SRGBColorSpace;
	particleTexture.needsUpdate = true;

	// Register for filter updates when setting changes
	GL_RegisterTexture( particleTexture );

}

/*
===============
R_InitParticles
===============
*/
/**
 * Allocates the particle pool (WinQuake r_part.c 2048; uhexen2 r_part.c:35 7000 for Hexen II), empties the lists and
 * builds the 8x8 particle dot texture. Called once by `R_Init` (gl_rmain.js), after the host has selected the game
 * profile (main.js sets it before `Host_Init`). The pool lives for the whole session.
 */
export function R_InitParticles() {

	maxParticles = GameProfile_IsHexen2() ? HEXEN2_PARTICLE_LIMIT : QUAKE_PARTICLE_LIMIT;
	particles = new Array( maxParticles );
	for ( let i = 0; i < maxParticles; i ++ ) particles[ i ] = new particle_t();
	particleNext = new Int32Array( maxParticles );
	positionArray = new Float32Array( maxParticles * 3 );
	classicPositionArray = new Float32Array( maxParticles * 3 );
	classicColorArray = new Float32Array( maxParticles * 3 );
	colorArray = new Float32Array( maxParticles * 3 );

	// a re-init replaces the buffers behind the old meshes
	if ( pointsMesh && pointsMesh.parent ) pointsMesh.parent.remove( pointsMesh );
	if ( classicMesh && classicMesh.parent ) classicMesh.parent.remove( classicMesh );
	pointsGeometry = null;
	classicGeometry = null;
	pointsMaterial = null;

	R_ClearParticles();
	R_InitParticleTexture();

}

/** @returns {number} the pool size chosen by the last `R_InitParticles` (2048 Quake, 7000 Hexen II) */
export function R_ParticleLimit() { return maxParticles; }

/*
===============
R_SetParticleExternals
===============
*/
/**
 * Injects the engine objects this module uses instead of importing them (not in WinQuake): the Three.js scene from
 * `R_Init`, and the `sv_gravity` cvar from `Host_Init`. Keys left out or null keep their current value; until set,
 * there is no scene (so `R_DrawParticles` draws nothing) and gravity is 800.
 *
 * @param {{ scene?: THREE.Scene, sv_gravity?: cvar_t }} externals `scene` receives the particle points; `sv_gravity`
 *   (Quake units per second squared) scales particle gravity
 */
export function R_SetParticleExternals( externals ) {

	if ( externals.scene ) _scene = externals.scene;
	if ( externals.sv_gravity != null ) _sv_gravity = externals.sv_gravity;

}

/*
===============
R_ClearParticles
===============
*/
/**
 * Puts every particle back on the free list (WinQuake r_part.c). Called by `R_InitParticles` and by `R_NewMap` for
 * every map. The particle objects themselves are kept.
 */
export function R_ClearParticles() {

	activeList = - 1;

	if ( maxParticles === 0 ) {

		freeList = - 1;
		return;

	}

	freeList = 0;
	for ( let i = 0; i < maxParticles - 1; i ++ ) {

		particleNext[ i ] = i + 1;

	}

	particleNext[ maxParticles - 1 ] = - 1;

}

function allocParticle() {

	if ( freeList === - 1 ) return null;

	const idx = freeList;
	freeList = particleNext[ idx ];

	particleNext[ idx ] = activeList;
	activeList = idx;

	const p = particles[ idx ];
	p.org[ 0 ] = 0; p.org[ 1 ] = 0; p.org[ 2 ] = 0;
	p.vel[ 0 ] = 0; p.vel[ 1 ] = 0; p.vel[ 2 ] = 0;
	p.min_org[ 0 ] = 0; p.min_org[ 1 ] = 0; p.min_org[ 2 ] = 0;
	p.max_org[ 0 ] = 0; p.max_org[ 1 ] = 0; p.max_org[ 2 ] = 0;
	p.color = 0;
	p.ramp = 0;
	p.die = - 1;
	p.type = pt_static;
	p.flags = 0;
	p.count = 0;
	p.classicOnly = false;

	return p;

}

/*
===============
R_ParticleExplosion
===============
*/
/**
 * Spawns the native rocket/grenade explosion (WinQuake r_part.c): 1024 particles within 16 Quake units of `org`,
 * flying out at up to 256 units per second, alternately `pt_explode` and `pt_explode2`, for up to 5 seconds of
 * `cl.time`. Called through render.js `R_ParticleExplosion` when the Fireball does not take the event (TE_EXPLOSION).
 * Does nothing without a client state, and stops early when the pool runs out.
 *
 * @param {ArrayLike<number>} org centre, Quake units, world space
 * @param {boolean} [classicOnly=false] true to draw these particles only in the Classic half of the title demo's split
 *   view (render.js spawns that copy when the Newer replacement took the event)
 */
export function R_ParticleExplosion( org, classicOnly = false ) {

	if ( ! client_cl ) return;

	for ( let i = 0; i < 1024; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;
		p.classicOnly = classicOnly;

		p.die = client_cl.time + 5;
		p.color = ramp1[ 0 ];
		p.ramp = Math.random() * 4 | 0;

		if ( i & 1 ) {

			p.type = pt_explode;
			for ( let j = 0; j < 3; j ++ ) {

				p.org[ j ] = org[ j ] + ( ( Math.random() * 32 | 0 ) - 16 );
				p.vel[ j ] = ( Math.random() * 512 | 0 ) - 256;

			}

		} else {

			p.type = pt_explode2;
			for ( let j = 0; j < 3; j ++ ) {

				p.org[ j ] = org[ j ] + ( ( Math.random() * 32 | 0 ) - 16 );
				p.vel[ j ] = ( Math.random() * 512 | 0 ) - 256;

			}

		}

	}

}

/*
===============
R_ParticleExplosion2
===============
*/
/**
 * Spawns the native colour-mapped explosion (WinQuake r_part.c, TE_EXPLOSION2): 512 `pt_blob` particles within 16
 * Quake units of `org` that live 0.3 seconds, cycling through the given palette range. Called through render.js
 * `R_ParticleExplosion2`. Does nothing without a client state, and stops early when the pool runs out.
 *
 * @param {ArrayLike<number>} org centre, Quake units, world space
 * @param {number} colorStart first palette index of the colour range
 * @param {number} colorLength number of palette entries in the range (must be at least 1)
 * @param {boolean} [classicOnly=false] true to draw these particles only in the Classic half of the title demo's split
 *   view (render.js spawns that copy when the Newer replacement took the event)
 */
export function R_ParticleExplosion2( org, colorStart, colorLength, classicOnly = false ) {

	if ( ! client_cl ) return;
	let colorMod = 0;

	for ( let i = 0; i < 512; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;
		p.classicOnly = classicOnly;

		p.die = client_cl.time + 0.3;
		p.color = colorStart + ( colorMod % colorLength );
		colorMod ++;
		p.type = pt_blob;

		for ( let j = 0; j < 3; j ++ ) {

			p.org[ j ] = org[ j ] + ( ( Math.random() * 32 | 0 ) - 16 );
			p.vel[ j ] = ( Math.random() * 512 | 0 ) - 256;

		}

	}

}

/*
===============
R_BlobExplosion
===============
*/
/**
 * Spawns the native tar baby (blob) explosion (WinQuake r_part.c, TE_TAREXPLOSION): 1024 particles within 16 Quake
 * units of `org`, half `pt_blob` in palette 66..71 and half `pt_blob2` in 150..155, living 1 to 1.35 seconds. Called
 * through render.js `R_BlobExplosion`. Does nothing without a client state, and stops early when the pool runs out.
 *
 * @param {ArrayLike<number>} org centre, Quake units, world space
 * @param {boolean} [classicOnly=false] true to draw these particles only in the Classic half of the title demo's split
 *   view (render.js spawns that copy when the Newer replacement took the event)
 */
export function R_BlobExplosion( org, classicOnly = false ) {

	if ( ! client_cl ) return;

	for ( let i = 0; i < 1024; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;
		p.classicOnly = classicOnly;

		p.die = client_cl.time + 1 + ( Math.random() * 8 | 0 ) * 0.05;

		if ( i & 1 ) {

			p.type = pt_blob;
			p.color = 66 + ( Math.random() * 6 | 0 );

		} else {

			p.type = pt_blob2;
			p.color = 150 + ( Math.random() * 6 | 0 );

		}

		for ( let j = 0; j < 3; j ++ ) {

			p.org[ j ] = org[ j ] + ( ( Math.random() * 32 | 0 ) - 16 );
			p.vel[ j ] = ( Math.random() * 512 | 0 ) - 256;

		}

	}

}

/*
===============
R_RunParticleEffect
===============
*/
/**
 * Spawns a small burst of particles (WinQuake r_part.c): spikes and gunshots on walls (cl_tent.js, through render.js
 * `R_RunParticleEffect`) and the QuakeC `particle` builtin's blood and sparks (`svc_particle`, through render.js
 * `R_ParseParticleEffect`). A count of exactly 1024 makes a rocket-explosion burst instead. Otherwise each particle is
 * `pt_slowgrav`, within 8 Quake units of `org`, drifts at `dir * 15`, takes a random shade of `color`'s 8-colour row
 * and lives up to 0.4 seconds. Blood (colour 73) also marks walls and floors, the screen and the weapon, through the
 * Newer Game decal hooks. Does nothing without a client state, and stops early when the pool runs out.
 *
 * @param {ArrayLike<number>} org centre, Quake units, world space
 * @param {ArrayLike<number>} dir drift direction; velocity is `dir * 15` Quake units per second
 * @param {number} color palette index 0..255 (73 is blood)
 * @param {number} count number of particles
 * @param {boolean} [classicOnly=false] true to draw these particles only in the Classic half of the title demo's split
 *   view (render.js spawns that copy when the Newer replacement took the event)
 */
export function R_RunParticleEffect( org, dir, color, count, classicOnly = false ) {

	if ( ! client_cl ) return;

	for ( let i = 0; i < count; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;
		p.classicOnly = classicOnly;

		if ( count === 1024 ) {

			// rocket explosion
			p.die = client_cl.time + 5;
			p.color = ramp1[ 0 ];
			p.ramp = Math.random() * 4 | 0;

			if ( i & 1 ) {

				p.type = pt_explode;
				for ( let j = 0; j < 3; j ++ ) {

					p.org[ j ] = org[ j ] + ( ( Math.random() * 32 | 0 ) - 16 );
					p.vel[ j ] = ( Math.random() * 512 | 0 ) - 256;

				}

			} else {

				p.type = pt_explode2;
				for ( let j = 0; j < 3; j ++ ) {

					p.org[ j ] = org[ j ] + ( ( Math.random() * 32 | 0 ) - 16 );
					p.vel[ j ] = ( Math.random() * 512 | 0 ) - 256;

				}

			}

		} else {

			// blood thrown at a wall or the floor marks it (Newer Game)
			if ( i === 0 && color === 73 ) {

				R_DecalBloodSpray( org, dir, count );
				R_ScreenDropsBloodAt( org, count );
    R_WeaponSurfaceBloodAt(org,count); // and on the lens, if it was close

			}

			p.die = client_cl.time + 0.1 * ( Math.random() * 5 | 0 );
			p.color = ( color & ~ 7 ) + ( Math.random() * 8 | 0 );
			p.type = pt_slowgrav;

			for ( let j = 0; j < 3; j ++ ) {

				p.org[ j ] = org[ j ] + ( ( Math.random() * 16 | 0 ) - 8 );
				p.vel[ j ] = dir[ j ] * 15;

			}

		}

	}

}

/*
===============
R_LavaSplash
===============
*/
/**
 * Spawns the lava splash (WinQuake r_part.c, TE_LAVASPLASH, the Chthon and Shub effect): a 32x32 grid of
 * `pt_slowgrav` particles over a 256x256 Quake-unit square around `org`, rising at 50..113 units per second in
 * palette 224..231, for about 2 to 2.6 seconds. Called through render.js `R_LavaSplash`. Does nothing without a
 * client state, and stops early when the pool runs out.
 *
 * @param {ArrayLike<number>} org centre, Quake units, world space
 */
export function R_LavaSplash( org ) {

	if ( ! client_cl ) return;
	const dir = new Float32Array( 3 );

	for ( let i = - 16; i < 16; i ++ ) {

		for ( let j = - 16; j < 16; j ++ ) {

			const p = allocParticle();
			if ( ! p ) return;

			p.die = client_cl.time + 2 + ( Math.random() * 32 | 0 ) * 0.02;
			p.color = 224 + ( Math.random() * 8 | 0 );
			p.type = pt_slowgrav;

			dir[ 0 ] = j * 8 + ( Math.random() * 8 | 0 );
			dir[ 1 ] = i * 8 + ( Math.random() * 8 | 0 );
			dir[ 2 ] = 256;

			p.org[ 0 ] = org[ 0 ] + dir[ 0 ];
			p.org[ 1 ] = org[ 1 ] + dir[ 1 ];
			p.org[ 2 ] = org[ 2 ] + ( Math.random() * 64 | 0 );

			VectorNormalize( dir );
			const vel = 50 + ( Math.random() * 64 | 0 );
			p.vel[ 0 ] = dir[ 0 ] * vel;
			p.vel[ 1 ] = dir[ 1 ] * vel;
			p.vel[ 2 ] = dir[ 2 ] * vel;

		}

	}

}

/*
===============
Hexen II particle bursts

uhexen2 r_part.c:591-679: svc_particle2/3/4 spawn `count` particles of a caller-chosen ptype, all living two seconds,
with the origin jittered and the velocity drawn from the supplied box. They are additive: Quake's own R_RunParticleEffect
above keeps its WinQuake behaviour.
===============
*/
function spawnHexenParticles( org, velocityAt, color, effect, count ) {

	for ( let i = 0; i < count; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;

		p.die = client_cl.time + 2;
		p.color = color;
		p.type = effect & 0xff;
		p.ramp = 0;
		for ( let j = 0; j < 3; j ++ ) p.org[ j ] = org[ j ] + ( ( Math.random() * 8 | 0 ) - 4 );
		velocityAt( p );

	}

}

/**
 * `svc_particle2` (uhexen2 r_part.c:591): a direction box per axis, clamped nowhere, two-second life.
 *
 * @param {ArrayLike<number>} org centre, Quake units
 * @param {ArrayLike<number>} directionMin minimum velocity per axis, Quake units per second
 * @param {ArrayLike<number>} directionMax maximum velocity per axis
 * @param {number} color palette index (256+ is a translucent-table range)
 * @param {number} effect the native ptype_t number
 * @param {number} count particles to spawn
 */
export function R_RunParticleEffect2( org, directionMin, directionMax, color, effect, count ) {

	if ( ! client_cl ) return;
	spawnHexenParticles( org, p => {

		for ( let j = 0; j < 3; j ++ )
			p.vel[ j ] = directionMin[ j ] + ( directionMax[ j ] - directionMin[ j ] ) * Math.random();

	}, color, effect, count );

}

/**
 * `svc_particle3` (uhexen2 r_part.c:623): each velocity is uniform in -box..box, with a wider origin jitter.
 *
 * @param {ArrayLike<number>} org centre, Quake units
 * @param {ArrayLike<number>} box velocity half-extents per axis
 * @param {number} color palette index
 * @param {number} effect the native ptype_t number
 * @param {number} count particles to spawn
 */
export function R_RunParticleEffect3( org, box, color, effect, count ) {

	if ( ! client_cl ) return;
	spawnHexenParticles( org, p => {

		for ( let j = 0; j < 3; j ++ ) {

			p.org[ j ] = org[ j ] + ( ( Math.random() * 16 | 0 ) - 8 );
			p.vel[ j ] = box[ j ] * Math.random() * 2 - box[ j ];

		}

	}, color, effect, count );

}

/**
 * `svc_particle4` (uhexen2 r_part.c:655): a spherical velocity in -radius..radius.
 *
 * @param {ArrayLike<number>} org centre, Quake units
 * @param {number} radius velocity half-extent
 * @param {number} color palette index
 * @param {number} effect the native ptype_t number
 * @param {number} count particles to spawn
 */
export function R_RunParticleEffect4( org, radius, color, effect, count ) {

	if ( ! client_cl ) return;
	spawnHexenParticles( org, p => {

		for ( let j = 0; j < 3; j ++ ) {

			p.org[ j ] = org[ j ] + ( ( Math.random() * 16 | 0 ) - 8 );
			p.vel[ j ] = radius * Math.random() * 2 - radius;

		}

	}, color, effect, count );

}

/**
 * `svc_particle_explosion` (uhexen2 r_part.c:1331): half `pt_c_explode`, half `pt_c_explode2`, within `radius` of
 * `org`, living three seconds and stepping their colour down the translucent palette.
 *
 * @param {ArrayLike<number>} org centre, Quake units
 * @param {number} color starting palette index
 * @param {number} radius origin jitter
 * @param {number} counter particles to spawn
 */
export function R_ColoredParticleExplosion( org, color, radius, counter ) {

	if ( ! client_cl ) return;
	const span = Math.max( 1, radius * 2 );

	for ( let i = 0; i < counter; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;

		p.die = client_cl.time + 3;
		p.color = color;
		p.ramp = Math.random() * 4 | 0;
		p.type = i & 1 ? pt_c_explode : pt_c_explode2;
		for ( let j = 0; j < 3; j ++ ) {

			p.org[ j ] = org[ j ] + ( Math.random() * span | 0 ) - radius;
			p.vel[ j ] = ( Math.random() * 512 | 0 ) - 256;

		}

	}

}

/**
 * `R_RainEffect` (uhexen2 r_part.c:1209): a block of falling rain. Each drop's life is the time it takes to fall the
 * block's height at its own (downward) speed; the X/Y drift comes from the server.
 *
 * @param {ArrayLike<number>} org the block's minimum X/Y and top Z
 * @param {ArrayLike<number>} eSize the block's X/Y size and height
 * @param {number} xDir X drift, Quake units per second
 * @param {number} yDir Y drift
 * @param {number} color palette index
 * @param {number} count drops to spawn
 */
export function R_RainEffect( org, eSize, xDir, yDir, color, count ) {

	if ( ! client_cl ) return;

	for ( let i = 0; i < count; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;

		p.vel[ 0 ] = xDir;
		p.vel[ 1 ] = yDir;
		p.vel[ 2 ] = - ( Math.random() * 956 | 0 );
		if ( p.vel[ 2 ] > - 256 ) p.vel[ 2 ] -= 256;

		const zTime = - ( eSize[ 2 ] / p.vel[ 2 ] );
		p.die = client_cl.time + zTime;
		p.color = color;
		p.ramp = Math.random() * 4 | 0;
		p.type = pt_rain;

		const sizeX = Math.max( 1, eSize[ 0 ] | 0 ), sizeY = Math.max( 1, eSize[ 1 ] | 0 );
		p.org[ 0 ] = org[ 0 ] + ( Math.random() * sizeX | 0 );
		p.org[ 1 ] = org[ 1 ] + ( Math.random() * sizeY | 0 );
		p.org[ 2 ] = org[ 2 ];

	}

}

/**
 * `R_SnowEffect` (uhexen2 r_part.c:1252): snowflakes from `org1`..`org2`'s top plane. `count` and a halo `count`
 * follow the GLQUAKE path; flags select fluffiness, brightness, melting and bounds.
 *
 * @param {ArrayLike<number>} org1 the block's minimum corner
 * @param {ArrayLike<number>} org2 maximum X/Y and top Z
 * @param {number} flags SFL_* flags
 * @param {ArrayLike<number>} alldir wind velocity, Quake units per second
 * @param {number} count flakes to spawn
 */
export function R_SnowEffect( org1, org2, flags, alldir, count ) {

	if ( ! client_cl ) return;

	for ( let i = 0; i < count; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;

		p.vel[ 0 ] = alldir[ 0 ];
		p.vel[ 1 ] = alldir[ 1 ];
		p.vel[ 2 ] = alldir[ 2 ] * ( ( Math.random() * 16 | 0 ) + 7 ) / 10;
		p.flags = flags & 0xff;

		if ( ( Math.random() * 128 | 0 ) <= 1 ) p.count = 69;
		else if ( flags & SFL_FLUFFY || ( flags & SFL_MIXED && ( Math.random() * 4 | 0 ) ) ) p.count = ( Math.random() * 32 | 0 ) + 10;
		else p.count = 10;

		if ( flags & SFL_HALF_BRIGHT ) p.color = 26 + ( Math.random() * 5 | 0 );
		else p.color = 18 + ( Math.random() * 12 | 0 );
		if ( ! ( flags & SFL_NO_TRANS ) ) p.color += 256;

		p.die = client_cl.time + 7;
		p.ramp = Math.random() * 4 | 0;
		p.type = pt_snow;

		const sizeX = Math.max( 1, ( org2[ 0 ] - org1[ 0 ] ) | 0 );
		const sizeY = Math.max( 1, ( org2[ 1 ] - org1[ 1 ] ) | 0 );
		p.org[ 0 ] = org1[ 0 ] + ( Math.random() * sizeX | 0 );
		p.org[ 1 ] = org1[ 1 ] + ( Math.random() * sizeY | 0 );
		p.org[ 2 ] = org2[ 2 ];

		// uhexen2 keeps the start point out of solids; without a world model the server volume is used as sent.
		if ( client_cl.worldmodel ) {

			let leaf = Mod_PointInLeaf( p.org, client_cl.worldmodel );
			let guard = 50;
			while ( leaf && leaf.contents !== CONTENTS_EMPTY && guard -- ) {

				p.org[ 0 ] = org1[ 0 ] + ( Math.random() * sizeX | 0 );
				p.org[ 1 ] = org1[ 1 ] + ( Math.random() * sizeY | 0 );
				leaf = Mod_PointInLeaf( p.org, client_cl.worldmodel );

			}

		}

		VectorCopy( org1, p.min_org );
		VectorCopy( org2, p.max_org );

	}

}

/*
===============
R_RunQuakeEffect
===============
*/
/**
 * `R_RunQuakeEffect` (uhexen2 r_part.c:773): the CE_QUAKE effect's 100 `pt_quake` particles, launched upward in a ring
 * of the effect's radius around `org`.
 *
 * @param {ArrayLike<number>} org centre, Quake units
 * @param {number} distance ring radius
 */
export function R_RunQuakeEffect( org, distance ) {

	if ( ! client_cl ) return;

	for ( let i = 0; i < 100; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;

		p.die = client_cl.time + 0.3 * ( Math.random() * 5 | 0 );
		p.color = ( Math.random() * 4 | 0 ) + ( ( Math.random() * 3 | 0 ) * 16 ) + 13 * 16 + 256 + 11;
		p.type = pt_quake;
		p.ramp = 0;

		const radius = distance * Math.random();
		const angle = Math.random() * 2 * Math.PI;
		p.org[ 0 ] = org[ 0 ] + Math.cos( angle ) * radius;
		p.org[ 1 ] = org[ 1 ] + Math.sin( angle ) * radius;
		p.org[ 2 ] = org[ 2 ];
		p.vel[ 0 ] = Math.random() * 40 - 20;
		p.vel[ 1 ] = Math.random() * 40 - 20;
		p.vel[ 2 ] = 65 * Math.random() + 80;

	}

}

/**
 * `R_SunStaffTrail` (uhexen2 r_part.c:817): a `pt_spit` particle every 10 Quake units along the staff beam.
 *
 * @param {ArrayLike<number>} source beam start
 * @param {ArrayLike<number>} dest beam end
 */
export function R_SunStaffTrail( source, dest ) {

	if ( ! client_cl ) return;
	const vec = new Float32Array( 3 ), s = new Float32Array( 3 );
	VectorCopy( source, s );
	VectorSubtract( dest, s, vec );
	let length = VectorNormalize( vec );

	while ( length > 0 ) {

		length -= 10;
		const p = allocParticle();
		if ( ! p ) return;

		p.die = client_cl.time + 2;
		p.ramp = Math.random() * 4 | 0;
		p.color = ramp6[ p.ramp | 0 ];
		p.type = pt_spit;
		for ( let j = 0; j < 3; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 4 | 0 ) - 2 );
		p.vel[ 0 ] = ( Math.random() * 10 | 0 ) - 5;
		p.vel[ 1 ] = ( Math.random() * 10 | 0 ) - 5;
		p.vel[ 2 ] = Math.random() * 10 | 0;

		s[ 0 ] += vec[ 0 ];
		s[ 1 ] += vec[ 1 ];
		s[ 2 ] += vec[ 2 ];

	}

}

/**
 * `RiderParticle` (uhexen2 r_part.c:859): the ring of `pt_rd` particles that converges on the rider's death orb. The
 * destination is kept in the module's `riderOrigin`, which `pt_rd` updates home on.
 *
 * @param {number} count particles to spawn
 * @param {ArrayLike<number>} origin the orb's centre
 */
export function R_RiderParticle( count, origin ) {

	if ( ! client_cl ) return;
	VectorCopy( origin, riderOrigin );

	for ( let i = 0; i < count; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;

		p.die = client_cl.time + 4;
		p.color = 256 + 16 + 15;
		p.type = pt_rd;
		p.ramp = 0;

		const angle = ( Math.random() * 360 | 0 ) / ( 2 * Math.PI );
		const radius = 300 + ( Math.random() * 256 | 0 );
		p.org[ 0 ] = origin[ 0 ] + Math.cos( angle ) * radius;
		p.org[ 1 ] = origin[ 1 ] + Math.sin( angle ) * radius;
		p.org[ 2 ] = origin[ 2 ] + ( Math.random() * 256 | 0 ) - 30;
		p.vel[ 0 ] = ( Math.random() * 256 | 0 ) - 127;
		p.vel[ 1 ] = ( Math.random() * 256 | 0 ) - 127;
		p.vel[ 2 ] = ( Math.random() * 256 | 0 ) - 127;

	}

}

/**
 * `GravityWellParticle` (uhexen2 r_part.c:894): the `pt_gravwell` ring, aimed at `origin` with the supplied colour.
 *
 * @param {number} count particles to spawn
 * @param {ArrayLike<number>} origin the well's centre
 * @param {number} color base palette index
 */
export function R_GravityWellParticle( count, origin, color ) {

	if ( ! client_cl ) return;
	VectorCopy( origin, riderOrigin );

	for ( let i = 0; i < count; i ++ ) {

		const p = allocParticle();
		if ( ! p ) return;

		p.die = client_cl.time + 4;
		p.color = color + ( Math.random() * 16 | 0 );
		p.type = pt_gravwell;
		p.ramp = 0;

		const angle = ( Math.random() * 360 | 0 ) / ( 2 * Math.PI );
		const radius = 300 + ( Math.random() * 256 | 0 );
		p.org[ 0 ] = origin[ 0 ] + Math.cos( angle ) * radius;
		p.org[ 1 ] = origin[ 1 ] + Math.sin( angle ) * radius;
		p.org[ 2 ] = origin[ 2 ] + ( Math.random() * 256 | 0 ) - 30;
		p.vel[ 0 ] = ( Math.random() * 256 | 0 ) - 127;
		p.vel[ 1 ] = ( Math.random() * 256 | 0 ) - 127;
		p.vel[ 2 ] = ( Math.random() * 256 | 0 ) - 127;

	}

}

/*
===============
R_RocketTrail
===============
*/
/**
 * Spawns the native trail along one frame's movement of a missile or gib (WinQuake r_part.c), one particle every 3
 * Quake units (every unit when 128 is added to `type`). Called through render.js `R_RocketTrail` by `CL_RelinkEntities`
 * and `CL_LinkPacketEntities` per entity per frame from the model's trail flags. Particles last 2 seconds (tracers 0.5,
 * vore 0.3); tracers alternate sideways at 30 units per second, counted by the module's `tracercount`. Does nothing
 * without a client state, and stops early when the pool runs out.
 *
 * @param {ArrayLike<number>} start the entity's previous origin, Quake units, world space
 * @param {ArrayLike<number>} end its origin now
 * @param {number} type 0 rocket (EF_ROCKET), 1 smoke (EF_GRENADE), 2 blood (EF_GIB), 3 tracer (EF_TRACER), 4 slight
 *   blood (EF_ZOMGIB), 5 tracer (EF_TRACER2), 6 voor trail (EF_TRACER3); +128 for the dense spacing
 * @param {boolean} [classicOnly=false] true to draw these particles only in the Classic half of the title demo's split
 *   view
 */
export function R_RocketTrail( start, end, type, classicOnly = false ) {

	if ( ! client_cl ) return;

	const vec = new Float32Array( 3 );
	const s = new Float32Array( 3 );
	VectorCopy( start, s );
	VectorSubtract( end, s, vec );
	let len = VectorNormalize( vec );

	let dec;
	if ( type < 128 ) {

		dec = 3;

	} else {

		dec = 1;
		type -= 128;

	}

	// uhexen2 particle.h rt_type_t: 7..17 are Hexen II-only trails. Quake's EF_ values stop at 6, so no Quake entity
	// can reach this branch.
	if ( type >= RT.FIREBALL ) {

		hexenRocketTrail( s, end, type, classicOnly );
		return;

	}

	while ( len > 0 ) {

		len -= dec;

		const p = allocParticle();
		if ( ! p ) return;
		p.classicOnly = classicOnly;

		p.vel[ 0 ] = 0; p.vel[ 1 ] = 0; p.vel[ 2 ] = 0;
		p.die = client_cl.time + 2;

		switch ( type ) {

			case 0: // rocket trail
				p.ramp = Math.random() * 4 | 0;
				p.color = ramp3[ Math.min( p.ramp | 0, ramp3.length - 1 ) ];
				p.type = pt_fire;
				for ( let j = 0; j < 3; j ++ )
					p.org[ j ] = s[ j ] + ( ( Math.random() * 6 | 0 ) - 3 );
				break;

			case 1: // smoke
				p.ramp = ( Math.random() * 4 | 0 ) + 2;
				p.color = ramp3[ Math.min( p.ramp | 0, ramp3.length - 1 ) ];
				p.type = pt_fire;
				for ( let j = 0; j < 3; j ++ )
					p.org[ j ] = s[ j ] + ( ( Math.random() * 6 | 0 ) - 3 );
				break;

			case 2: // blood
				p.type = pt_grav;
				p.color = 67 + ( Math.random() * 4 | 0 );
				for ( let j = 0; j < 3; j ++ )
					p.org[ j ] = s[ j ] + ( ( Math.random() * 6 | 0 ) - 3 );
				break;

			case 3: // tracer
			case 5:
				p.die = client_cl.time + 0.5;
				p.type = pt_static;
				if ( type === 3 )
					p.color = 52 + ( ( tracercount & 4 ) << 1 );
				else
					p.color = 230 + ( ( tracercount & 4 ) << 1 );
				tracercount ++;
				VectorCopy( s, p.org );
				if ( tracercount & 1 ) {

					p.vel[ 0 ] = 30 * vec[ 1 ];
					p.vel[ 1 ] = 30 * - vec[ 0 ];

				} else {

					p.vel[ 0 ] = 30 * - vec[ 1 ];
					p.vel[ 1 ] = 30 * vec[ 0 ];

				}

				break;

			case 4: // slight blood
				p.type = pt_grav;
				p.color = 67 + ( Math.random() * 4 | 0 );
				for ( let j = 0; j < 3; j ++ )
					p.org[ j ] = s[ j ] + ( ( Math.random() * 6 | 0 ) - 3 );
				len -= 3;
				break;

			case 6: // voor trail
				p.color = 9 * 16 + 8 + ( Math.random() * 4 | 0 );
				p.type = pt_static;
				p.die = client_cl.time + 0.3;
				for ( let j = 0; j < 3; j ++ )
					p.org[ j ] = s[ j ] + ( ( Math.random() * 16 | 0 ) - 8 );
				break;

		}

		s[ 0 ] += vec[ 0 ];
		s[ 1 ] += vec[ 1 ];
		s[ 2 ] += vec[ 2 ];

	}

}

/*
===============
hexenRocketTrail

uhexen2 r_part.c:935-1201: the Hexen II-only trail types. Spacing and lifetime differ per type (ice lays a wide ribbon,
acid balls are dense and short-lived); everything else is the native 3-unit spacing.
===============
*/
function hexenRocketTrail( start, end, type, classicOnly ) {

	const vec = new Float32Array( 3 ), s = new Float32Array( 3 );
	VectorCopy( start, s );
	VectorSubtract( end, s, vec );
	let len = VectorNormalize( vec );
	const dist = new Float32Array( [ vec[ 0 ], vec[ 1 ], vec[ 2 ] ] );

	let size = 1, lifetime = 2;
	switch ( type ) {

		case RT.SPIT:
			break;

		case RT.ICE:
			size *= 5 * 3;
			dist[ 0 ] *= 5 * 3; dist[ 1 ] *= 5 * 3; dist[ 2 ] *= 5 * 3;
			break;

		case RT.ACIDBALL:
			size = 5;
			lifetime = 0.8;
			break;

		default:
			size = 3;
			dist[ 0 ] *= 3; dist[ 1 ] *= 3; dist[ 2 ] *= 3;
			break;

	}

	while ( len > 0 ) {

		len -= size;
		const p = allocParticle();
		if ( ! p ) return;
		p.classicOnly = classicOnly;
		p.vel[ 0 ] = 0; p.vel[ 1 ] = 0; p.vel[ 2 ] = 0;
		p.die = client_cl.time + lifetime;

		switch ( type ) {

			case RT.FIREBALL:
				p.ramp = Math.random() * 4 | 0;
				p.color = ramp4[ p.ramp | 0 ];
				p.type = pt_fireball;
				for ( let j = 0; j < 3; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 4 | 0 ) - 2 );
				p.org[ 2 ] += 2; // compensate for the model
				p.vel[ 0 ] = ( Math.random() * 200 | 0 ) - 100;
				p.vel[ 1 ] = ( Math.random() * 200 | 0 ) - 100;
				p.vel[ 2 ] = ( Math.random() * 200 | 0 ) - 100;
				break;

			case RT.ICE:
				p.ramp = Math.random() * 4 | 0;
				p.color = ramp5[ p.ramp | 0 ];
				p.type = pt_ice;
				for ( let j = 0; j < 3; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 4 | 0 ) - 2 );
				p.org[ 2 ] += 2;
				p.vel[ 0 ] = ( Math.random() * 16 | 0 ) - 8;
				p.vel[ 1 ] = ( Math.random() * 16 | 0 ) - 8;
				p.vel[ 2 ] = ( Math.random() * 20 | 0 ) - 40;
				break;

			case RT.SPIT:
				p.ramp = Math.random() * 4 | 0;
				p.color = ramp6[ p.ramp | 0 ];
				p.type = pt_spit;
				for ( let j = 0; j < 3; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 4 | 0 ) - 2 );
				p.org[ 2 ] += 2;
				p.vel[ 0 ] = ( Math.random() * 10 | 0 ) - 5;
				p.vel[ 1 ] = ( Math.random() * 10 | 0 ) - 5;
				p.vel[ 2 ] = Math.random() * 10 | 0;
				break;

			case RT.SPELL:
				p.ramp = Math.random() * 4 | 0;
				p.color = ramp6[ p.ramp | 0 ];
				p.type = pt_spell;
				for ( let j = 0; j < 3; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 4 | 0 ) - 2 );
				p.vel[ 0 ] = vec[ 0 ] * - 10;
				p.vel[ 1 ] = vec[ 1 ] * - 10;
				p.vel[ 2 ] = vec[ 2 ] * - 10;
				break;

			case RT.VORPAL:
				p.type = pt_vorpal;
				p.color = 44 + ( Math.random() * 4 | 0 ) + 256;
				for ( let j = 0; j < 2; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 48 | 0 ) - 24 );
				p.org[ 2 ] = s[ 2 ] + ( ( Math.random() * 16 | 0 ) - 8 );
				break;

			case RT.SETSTAFF:
				p.type = pt_setstaff;
				p.color = ramp9[ 0 ];
				p.ramp = Math.random() * 4 | 0;
				for ( let j = 0; j < 2; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 6 | 0 ) - 3 );
				p.org[ 2 ] = s[ 2 ] + ( ( Math.random() * 10 | 0 ) - 5 );
				p.vel[ 0 ] = ( Math.random() * 8 | 0 ) - 4;
				p.vel[ 1 ] = ( Math.random() * 8 | 0 ) - 4;
				break;

			case RT.MAGICMISSILE:
				p.type = pt_magicmissile;
				p.color = 148 + ( Math.random() * 12 | 0 );
				p.ramp = Math.random() * 4 | 0;
				for ( let j = 0; j < 2; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 48 | 0 ) - 24 );
				p.org[ 2 ] = s[ 2 ] + ( ( Math.random() * 48 | 0 ) - 24 );
				p.vel[ 2 ] = - ( ( Math.random() * 16 | 0 ) + 8 );
				break;

			case RT.BONESHARD:
				p.type = pt_boneshard;
				p.color = 368 + ( Math.random() * 16 | 0 );
				for ( let j = 0; j < 2; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 48 | 0 ) - 24 );
				p.org[ 2 ] = s[ 2 ] + ( ( Math.random() * 48 | 0 ) - 24 );
				p.vel[ 2 ] = - ( ( Math.random() * 16 | 0 ) + 8 );
				break;

			case RT.SCARAB:
				p.type = pt_scarab;
				p.color = 250 + ( Math.random() * 4 | 0 );
				for ( let j = 0; j < 3; j ++ ) p.org[ j ] = s[ j ] + ( Math.random() * 8 | 0 );
				p.vel[ 2 ] = - ( Math.random() * 8 | 0 );
				break;

			case RT.ACIDBALL:
				p.ramp = Math.random() * 4 | 0;
				p.color = ramp10[ p.ramp | 0 ];
				p.type = pt_acidball;
				p.die = client_cl.time + 0.5;
				for ( let j = 0; j < 3; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 4 | 0 ) - 2 );
				p.org[ 2 ] += 2;
				p.vel[ 0 ] = ( Math.random() * 40 | 0 ) - 20;
				p.vel[ 1 ] = ( Math.random() * 40 | 0 ) - 20;
				p.vel[ 2 ] = ( Math.random() * 40 | 0 ) - 20;
				break;

			case RT.BLOODSHOT:
				p.type = pt_darken;
				p.color = 136 + ( Math.random() * 6 | 0 );
				for ( let j = 0; j < 3; j ++ ) p.org[ j ] = s[ j ] + ( ( Math.random() * 4 | 0 ) - 2 );
				len -= size;
				break;

		}

		s[ 0 ] += dist[ 0 ];
		s[ 1 ] += dist[ 1 ];
		s[ 2 ] += dist[ 2 ];

	}

}


/*
===============
R_EntityParticles
===============
*/

const NUMVERTEXNORMALS = 162;
const avelocities = new Array( NUMVERTEXNORMALS );
let _avelocitiesInitialized = false;
const _epForward = new Float32Array( 3 );
const beamlength = 16;

/**
 * Glowing particle aura around entities with EF_BRIGHTFIELD (WinQuake r_part.c; the source comment's example is Quad
 * Damage): 162 particles, one per vertex normal, 64 Quake units from the origin and pushed 16 units along a direction
 * that turns with `cl.time`, each living only 0.01 seconds so the ring is respawned every frame. Called through
 * render.js `R_EntityParticles` by `CL_RelinkEntities` and `CL_LinkPacketEntities`. The per-normal angular speeds are
 * chosen at random on the first call and kept for the session.
 *
 * @param {entity_t} ent the glowing entity; its `origin` (Quake units, world space) is the centre
 */
export function R_EntityParticles( ent ) {

	if ( client_cl == null ) return;

	const dist = 64;

	if ( ! _avelocitiesInitialized ) {

		for ( let i = 0; i < NUMVERTEXNORMALS; i ++ ) {

			avelocities[ i ] = new Float32Array( 3 );
			avelocities[ i ][ 0 ] = ( Math.random() * 256 | 0 ) * 0.01;
			avelocities[ i ][ 1 ] = ( Math.random() * 256 | 0 ) * 0.01;
			avelocities[ i ][ 2 ] = ( Math.random() * 256 | 0 ) * 0.01;

		}

		_avelocitiesInitialized = true;

	}

	for ( let i = 0; i < NUMVERTEXNORMALS; i ++ ) {

		let angle = client_cl.time * avelocities[ i ][ 0 ];
		const sy = Math.sin( angle );
		const cy = Math.cos( angle );
		angle = client_cl.time * avelocities[ i ][ 1 ];
		const sp = Math.sin( angle );
		const cp = Math.cos( angle );
		angle = client_cl.time * avelocities[ i ][ 2 ];

		_epForward[ 0 ] = cp * cy;
		_epForward[ 1 ] = cp * sy;
		_epForward[ 2 ] = - sp;

		const p = allocParticle();
		if ( p == null ) return;

		p.die = client_cl.time + 0.01;
		p.color = 0x6f;
		p.type = pt_explode;

		p.org[ 0 ] = ent.origin[ 0 ] + r_avertexnormals[ i ][ 0 ] * dist + _epForward[ 0 ] * beamlength;
		p.org[ 1 ] = ent.origin[ 1 ] + r_avertexnormals[ i ][ 1 ] * dist + _epForward[ 1 ] * beamlength;
		p.org[ 2 ] = ent.origin[ 2 ] + r_avertexnormals[ i ][ 2 ] * dist + _epForward[ 2 ] * beamlength;

	}

}

/*
===============
R_DrawParticles
===============
*/
/**
 * Advances and draws every particle for this frame (WinQuake r_part.c). Called once per frame by `R_RenderScene`
 * (gl_rmain.js). Does nothing without a client state or a scene.
 *
 * Steps time by `cl.time - cl.oldtime` (an exact zero, while paused, freezes them; a negative step or one over 0.5
 * seconds is replaced by 0.016), frees particles whose `die` time has passed, writes positions (raw Quake
 * coordinates) and palette colours (converted to linear RGB) into two point batches, the normal one and the Classic-
 * only one, then applies each type's ramp, drag and gravity (`sv_gravity` * 0.05 per second). Blood that comes down on
 * the world is handed to the decal hook and removed. The batches are `THREE.Points` added to the scene when they have
 * particles and removed when empty; the Classic-only batch stays hidden except in the split view's Classic pass. In
 * WebXR the point size is divided by `XR_SCALE`.
 */
export function R_DrawParticles() {

	if ( ! client_cl || ! _scene ) return;

	// cl.time can be modified by CL_LerpPoint, but an exact zero delta means
	// the client is paused and particle physics must remain frozen.
	let frametime = client_cl.time - client_cl.oldtime;
	if ( frametime < 0 || frametime > 0.5 ) {

		// Fallback to a reasonable frametime for particle physics
		// but still process dead particle removal
		frametime = 0.016; // ~60fps default

	}

	const time3 = frametime * 15;
	const time2 = frametime * 10;
	const time1 = frametime * 5;
	const grav = frametime * _sv_gravity.value * 0.05;
	const dvel = 4 * frametime;

	// Remove dead particles from front of active list
	while ( activeList !== - 1 && particles[ activeList ].die < client_cl.time ) {

		const killIdx = activeList;
		activeList = particleNext[ killIdx ];
		particleNext[ killIdx ] = freeList;
		freeList = killIdx;

	}

	// Walk active list, remove dead and update physics
	let count = 0, classicCount = 0;
	let prevIdx = - 1;
	let idx = activeList;

	while ( idx !== - 1 ) {

		const nextIdx = particleNext[ idx ];

		// Remove dead particles in the middle of the list
		if ( particles[ idx ].die < client_cl.time ) {

			if ( prevIdx !== - 1 ) {

				particleNext[ prevIdx ] = nextIdx;

			} else {

				activeList = nextIdx;

			}

			particleNext[ idx ] = freeList;
			freeList = idx;
			idx = nextIdx;
			continue;

		}

		const p = particles[ idx ];

		// Store position for rendering (raw Quake coordinates — camera uses them too)
		const classic = p.classicOnly === true, positions = classic ? classicPositionArray : positionArray, colors = classic ? classicColorArray : colorArray;
		const slot = classic ? classicCount : count;
		positions[ slot * 3 ] = p.org[ 0 ];
		positions[ slot * 3 + 1 ] = p.org[ 1 ];
		positions[ slot * 3 + 2 ] = p.org[ 2 ];

		// Convert palette color to linear RGB (palette is sRGB, Three.js expects linear). Hexen II's 256+ indices select
		// d_8to24TranslucentTable, whose base colour is one of the sixteen ColorIndex palette columns.
		const paletteIndex = p.color >= 256 ? COLOR_INDEX[ ( ( p.color - 256 ) >> 4 ) & 15 ] : ( p.color & 0x1ff );
		const rgba = d_8to24table[ paletteIndex & 0xff ];
		colors[ slot * 3 ] = srgbToLinear[ rgba & 0xff ];
		colors[ slot * 3 + 1 ] = srgbToLinear[ ( rgba >> 8 ) & 0xff ];
		colors[ slot * 3 + 2 ] = srgbToLinear[ ( rgba >> 16 ) & 0xff ];

		if ( classic ) classicCount ++; else count ++;

		// Update physics
		const bloody = ( p.type === pt_grav || p.type === pt_slowgrav ) && p.color >= 64 && p.color <= 79;
		if ( bloody ) { _prevOrg[ 0 ] = p.org[ 0 ]; _prevOrg[ 1 ] = p.org[ 1 ]; _prevOrg[ 2 ] = p.org[ 2 ]; }

		if ( p.type === pt_rain ) {

			// uhexen2 r_part.c:1602: four 1 ms visual substeps then the rest of the frame
			const vel0 = p.vel[ 0 ] * 0.001, vel1 = p.vel[ 1 ] * 0.001, vel2 = p.vel[ 2 ] * 0.001;
			for ( let i = 0; i < 4; i ++ ) {

				p.org[ 0 ] += vel0; p.org[ 1 ] += vel1; p.org[ 2 ] += vel2;

			}
			p.org[ 0 ] += p.vel[ 0 ] * ( frametime - 0.004 );
			p.org[ 1 ] += p.vel[ 1 ] * ( frametime - 0.004 );
			p.org[ 2 ] += p.vel[ 2 ] * ( frametime - 0.004 );

		} else if ( p.type === pt_snow ) {

			updateSnowParticle( p, frametime );

		} else {

			p.org[ 0 ] += p.vel[ 0 ] * frametime;
			p.org[ 1 ] += p.vel[ 1 ] * frametime;
			p.org[ 2 ] += p.vel[ 2 ] * frametime;

		}

		// blood that comes down on the world stays there
		if ( bloody && R_DecalBloodLanded( _prevOrg, p.org ) ) {

			p.die = - 1;
			prevIdx = idx;
			idx = nextIdx;
			continue;

		}

		switch ( p.type ) {

			case pt_static:
				break;

			case pt_fire:
				p.ramp += time1;
				if ( p.ramp >= 6 )
					p.die = - 1;
				else
					p.color = ramp3[ Math.min( p.ramp | 0, ramp3.length - 1 ) ];
				p.vel[ 2 ] += grav;
				break;

			case pt_explode:
				p.ramp += time2;
				if ( p.ramp >= 8 )
					p.die = - 1;
				else
					p.color = ramp1[ Math.min( p.ramp | 0, ramp1.length - 1 ) ];
				for ( let i = 0; i < 3; i ++ )
					p.vel[ i ] += p.vel[ i ] * dvel;
				p.vel[ 2 ] -= grav;
				break;

			case pt_explode2:
				p.ramp += time3;
				if ( p.ramp >= 8 )
					p.die = - 1;
				else
					p.color = ramp2[ Math.min( p.ramp | 0, ramp2.length - 1 ) ];
				for ( let i = 0; i < 3; i ++ )
					p.vel[ i ] -= p.vel[ i ] * frametime;
				p.vel[ 2 ] -= grav;
				break;

			case pt_blob:
				for ( let i = 0; i < 3; i ++ )
					p.vel[ i ] += p.vel[ i ] * dvel;
				p.vel[ 2 ] -= grav;
				break;

			case pt_blob2:
				for ( let i = 0; i < 2; i ++ )
					p.vel[ i ] -= p.vel[ i ] * dvel;
				p.vel[ 2 ] -= grav;
				break;

			case pt_grav:
			case pt_slowgrav:
				p.vel[ 2 ] -= grav;
				break;

			case pt_fastgrav:
				p.vel[ 2 ] -= grav * 4;
				break;

			case pt_c_explode:
				p.ramp += time2;
				if ( p.ramp >= 8 ) p.die = - 1;
				else if ( time2 ) p.color -= 1;
				for ( let i = 0; i < 3; i ++ ) p.vel[ i ] += p.vel[ i ] * dvel;
				p.vel[ 2 ] -= grav;
				break;

			case pt_c_explode2:
				p.ramp += time3;
				if ( p.ramp >= 8 ) p.die = - 1;
				else if ( time3 ) p.color -= 2;
				for ( let i = 0; i < 3; i ++ ) p.vel[ i ] -= p.vel[ i ] * frametime;
				p.vel[ 2 ] -= grav;
				break;

			case pt_fireball:
				p.ramp += time3;
				if ( p.ramp >= 16 ) p.die = - 1;
				else p.color = ramp4[ Math.min( p.ramp | 0, 15 ) ];
				break;

			case pt_acidball:
				p.ramp += frametime * 20 * 1.4;
				if ( p.ramp >= 23 ) p.die = - 1;
				else if ( p.ramp >= 15 ) p.color = ramp11[ Math.min( ( p.ramp | 0 ) - 15, 7 ) ];
				else p.color = ramp10[ Math.min( p.ramp | 0, 15 ) ];
				p.vel[ 2 ] -= grav;
				break;

			case pt_spit:
				p.ramp += time3;
				if ( p.ramp >= 16 ) p.die = - 1;
				else p.color = ramp6[ Math.min( p.ramp | 0, 15 ) ];
				break;

			case pt_ice:
				p.ramp += frametime * 20;
				if ( p.ramp >= 16 ) p.die = - 1;
				else p.color = ramp5[ Math.min( p.ramp | 0, 15 ) ];
				p.vel[ 2 ] -= grav;
				break;

			case pt_spell:
				p.ramp += time2;
				if ( p.ramp >= 16 ) p.die = - 1;
				else p.color = ramp7[ Math.min( p.ramp | 0, 15 ) ];
				break;

			case pt_test:
				p.vel[ 2 ] += 1.3;
				p.ramp += time3;
				if ( p.ramp >= 13 || ( p.ramp > 10 && p.vel[ 2 ] < 20 ) ) p.die = - 1;
				else p.color = ramp8[ Math.min( p.ramp | 0, 15 ) ];
				break;

			case pt_quake:
				p.vel[ 0 ] *= 1.05;
				p.vel[ 1 ] *= 1.05;
				p.vel[ 2 ] -= grav * 4;
				break;

			case pt_rd: {

				if ( ! frametime ) break;
				p.ramp += frametime / 0.05;
				if ( p.ramp > 50 ) { p.ramp = 50; p.die = - 1; }
				p.color = 256 + 16 + 16 - ( p.ramp / ( 50 / 16 ) );
				const diffX = riderOrigin[ 0 ] - p.org[ 0 ], diffY = riderOrigin[ 1 ] - p.org[ 1 ], diffZ = riderOrigin[ 2 ] - p.org[ 2 ];
				const pull = 1 / ( 51 - p.ramp );
				p.org[ 0 ] += diffX * pull; p.org[ 1 ] += diffY * pull; p.org[ 2 ] += diffZ * pull;
				break;

			}

			case pt_gravwell:
				if ( ! frametime ) break;
				p.ramp += frametime / 0.05;
				if ( p.ramp > 35 ) { p.ramp = 35; p.die = - 1; }
				{

					const diffX = riderOrigin[ 0 ] - p.org[ 0 ], diffY = riderOrigin[ 1 ] - p.org[ 1 ], diffZ = riderOrigin[ 2 ] - p.org[ 2 ];
					const pull = 1 / ( 36 - p.ramp );
					p.org[ 0 ] += diffX * pull; p.org[ 1 ] += diffY * pull; p.org[ 2 ] += diffZ * pull;

				}
				break;

			case pt_vorpal:
				p.color -= 1;
				if ( p.color <= 37 + 256 ) p.die = - 1;
				break;

			case pt_setstaff:
				p.ramp += time1;
				if ( p.ramp >= 16 ) p.die = - 1;
				else p.color = ramp9[ Math.min( p.ramp | 0, 15 ) ];
				p.vel[ 0 ] *= 1.08 * ( frametime / 0.05 );
				p.vel[ 1 ] *= 1.08 * ( frametime / 0.05 );
				p.vel[ 2 ] -= grav * 0.5;
				break;

			case pt_redfire:
				p.ramp += frametime * 3;
				if ( p.ramp >= 8 ) p.die = - 1;
				else p.color = ramp12[ Math.min( p.ramp | 0, 7 ) ] + 256;
				p.vel[ 0 ] *= 0.9;
				p.vel[ 1 ] *= 0.9;
				p.vel[ 2 ] += grav * 0.5;
				break;

			case pt_magicmissile:
				p.color -= 1;
				if ( p.color < 149 ) p.color = 149;
				p.ramp += time1;
				if ( p.ramp > 16 ) p.die = - 1;
				break;

			case pt_boneshard:
				p.color -= 1;
				if ( p.color < 368 ) p.die = - 1;
				break;

			case pt_scarab:
				p.color -= 1;
				if ( p.color < 250 ) p.die = - 1;
				break;

			case pt_darken:
				p.vel[ 2 ] -= grav;
				p.color -= 1;
				for ( let colindex = 0; colindex < 224; ) {

					if ( colindex === 192 || colindex === 200 ) colindex += 8;
					else colindex += 16;
					if ( p.color === colindex ) { p.die = - 1; break; }

				}
				break;

		}

		prevIdx = idx;
		idx = nextIdx;

	}

	// Render particles as THREE.Points
	presentParticles( count, false );
	presentParticles( classicCount, true );

}

/*
===============
updateSnowParticle

uhexen2 r_part.c:1617-1754: wind flurry, bounds, and melting on contact. A flake that hits a solid backs out, loses
its velocity and fades one translucent step every seventh update until it disappears.
===============
*/
function updateSnowParticle( p, frametime ) {

	if ( p.vel[ 0 ] === 0 && p.vel[ 1 ] === 0 && p.vel[ 2 ] === 0 ) {

		if ( p.color === 256 + 31 ) p.die = - 1;
		else {

			p.ramp += 1;
			if ( p.ramp >= 7 ) { p.color += 1; p.ramp = 0; }

		}
		return;

	}

	// the archived snow_flurry default is 1
	if ( Math.random() * 32 | 0 ) {

		const speed = Math.sqrt( p.vel[ 0 ] * p.vel[ 0 ] + p.vel[ 1 ] * p.vel[ 1 ] + p.vel[ 2 ] * p.vel[ 2 ] );
		const vx = p.vel[ 0 ] + ( Math.random() * 2 - 1 ) * 30;
		const vy = p.vel[ 1 ] + ( Math.random() * 2 - 1 ) * 30;
		const vz = p.vel[ 2 ] + ( ( Math.random() * 8 | 0 ) || p.vel[ 2 ] > 10 ? ( Math.random() * 2 - 1 ) * 30 : 0 );
		const length = Math.sqrt( vx * vx + vy * vy + vz * vz ) || 1;
		p.vel[ 0 ] = vx / length * speed; p.vel[ 1 ] = vy / length * speed; p.vel[ 2 ] = vz / length * speed;

	}

	const dx = p.vel[ 0 ] * frametime, dy = p.vel[ 1 ] * frametime, dz = p.vel[ 2 ] * frametime;
	p.org[ 0 ] += dx; p.org[ 1 ] += dy; p.org[ 2 ] += dz;

	if ( p.flags & SFL_IN_BOUNDS ) {

		if ( p.org[ 0 ] < p.min_org[ 0 ] || p.org[ 0 ] > p.max_org[ 0 ] ||
			p.org[ 1 ] < p.min_org[ 1 ] || p.org[ 1 ] > p.max_org[ 1 ] ||
			p.org[ 2 ] < p.min_org[ 2 ] || p.org[ 2 ] > p.max_org[ 2 ] ) p.die = - 1;
		return;

	}

	if ( ! client_cl.worldmodel ) return;
	let leaf = Mod_PointInLeaf( p.org, client_cl.worldmodel );
	if ( ! leaf || leaf.contents === CONTENTS_EMPTY ) return;

	if ( p.flags & SFL_NO_MELT ) {

		p.die = - 1;
		return;

	}

	p.vel[ 0 ] = dx * 0.2; p.vel[ 1 ] = dy * 0.2; p.vel[ 2 ] = dz * 0.2;
	let guard = 6;
	while ( leaf && leaf.contents !== CONTENTS_EMPTY && guard -- ) {

		p.org[ 0 ] -= p.vel[ 0 ]; p.org[ 1 ] -= p.vel[ 1 ]; p.org[ 2 ] -= p.vel[ 2 ];
		leaf = Mod_PointInLeaf( p.org, client_cl.worldmodel );

	}
	if ( guard <= 0 && leaf && leaf.contents !== CONTENTS_EMPTY ) p.die = - 1;
	p.vel[ 0 ] = 0; p.vel[ 1 ] = 0; p.vel[ 2 ] = 0;
	p.ramp = 0;

}

/**
 * Counts the live particles, for the particle suites and the Hexen II effect tests.
 *
 * @returns {number} active particles in the pool
 */
export function R_ParticleCount() {

	let count = 0;
	for ( let idx = activeList; idx !== - 1; idx = particleNext[ idx ] ) count ++;
	return count;

}

// The particles' points mesh and material, made on first use (and by the shader warm-up: R_ParticleWarmObject)
function ensureParticleMesh( classic ) {

	if ( ! pointsMaterial ) {

		pointsMaterial = new THREE.PointsMaterial( {
			size: 3, // Original Quake uses 1.5 world unit triangle (spans 1.5 in up + right)
			sizeAttenuation: true,
			vertexColors: true,
			depthWrite: false,
			transparent: true,
			map: particleTexture
		} );

	}

	if ( classic ? ! classicGeometry : ! pointsGeometry ) {

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( classic ? classicPositionArray : positionArray, 3 ) );
		geometry.setAttribute( 'color', new THREE.BufferAttribute( classic ? classicColorArray : colorArray, 3 ) );
		const created = new THREE.Points( geometry, pointsMaterial );
		created.frustumCulled = false;
		if ( classic ) { classicGeometry = geometry; classicMesh = created; created.userData.classicOnly = true; } else { pointsGeometry = geometry; pointsMesh = created; }

	}

}

/**
 * The enhanced view's particle points (made now if they were not), for compiling their program with a level's other
 * shaders (gl_rmain.js `R_LevelShaderWarm`) before the first particle appears. Not added to the scene.
 *
 * @returns {?THREE.Points} the points mesh, or null before the particle texture exists
 */
export function R_ParticleWarmObject() {

	if ( particleTexture == null ) return null;
	ensureParticleMesh( false );
	return pointsMesh;

}

function presentParticles( count, classic ) {

	const mesh = classic ? classicMesh : pointsMesh;
	if ( count === 0 ) {

		if ( mesh && mesh.parent ) _scene.remove( mesh );
		return;

	}

	ensureParticleMesh( classic );
	const geometry = classic ? classicGeometry : pointsGeometry, points = classic ? classicMesh : pointsMesh;

	// In XR mode, scene.scale = 1/XR_SCALE but PointsMaterial.size is not
	// affected by parent scale. Divide size to match meter-space distances.
	pointsMaterial.size = isXRActive() ? 3 / XR_SCALE : 3;

	geometry.attributes.position.needsUpdate = true;
	geometry.attributes.color.needsUpdate = true;
	geometry.setDrawRange( 0, count );
	// the Classic-only batch is invisible to every pass except the Classic one, which switches it on
	if ( classic ) points.visible = false;

	if ( ! points.parent ) _scene.add( points );

}
