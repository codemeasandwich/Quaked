/**
 * @module newer/render/r_weapons
 *
 * Weapon art: imported held and pickup models fitted to Quake's, drawn in Newer Game.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `indexPromise`, `index`, `preloadPromise`, `indexState`,
 * `preloadState`; 4 module-level collections (Map/Set).
 *
 * Errors: throws at 3 places; catches at 5 places.
 */
// Optional imported weapon art, fitted independently to the original held and
// pickup MDLs by tools/import_weapons.py. Gameplay identities stay native.
import * as THREE from 'three';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame, R_ClassicPassActive } from '../mode.js';
import { COM_NewerJSON, COM_NewerURL } from '../../engine/common/pak.js';
import { R_AssetAliasMaterial } from './r_newerskins.js';
import { r_avertexnormals } from '../../engine/common/anorm_dots.js';

export const r_newer_weapons = new cvar_t( 'r_newer_weapons', '1' );
const BASE = 'newer/weapons/';
let indexPromise = null, index = null;
let preloadPromise = null;
export const WEAPON_ASSET_TIMEOUT_MS = 30000;
let indexState = 'idle', preloadState = 'idle';
const requests = new Map();
const failures = new Map();
const sourceTextures = new Map();
const rotorStates = new WeakMap();
function bounded( promise, label ) {
	let timer;
	return Promise.race( [ promise, new Promise( ( _, reject ) => { timer = setTimeout( () => reject( new Error( label + ' timed out' ) ), WEAPON_ASSET_TIMEOUT_MS ); } ) ] ).finally( () => clearTimeout( timer ) );
}

export function R_WeaponsEnabled() { return R_NewerGame() && r_newer_weapons.value !== 0; }

function texture( path, color, flipY = false ) {

	return new Promise( ( resolve, reject ) => {

		let terminal = false;
		const fail = error => { if ( terminal ) return; terminal = true; clearTimeout( timer ); reject( error || new Error( 'Weapon texture unavailable: ' + path ) ); };
		const timer = setTimeout( () => fail( new Error( path + ' timed out' ) ), WEAPON_ASSET_TIMEOUT_MS );
		try { new THREE.TextureLoader().load( COM_NewerURL( BASE + path, BASE + path ), t => {

			if ( terminal ) { t.dispose(); return; } terminal = true; clearTimeout( timer );
			t.flipY = flipY; t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			t.anisotropy = 16; resolve( t );

		}, undefined, fail ); } catch ( error ) { fail( error ); }

	} );

}

export function R_WeaponsLoad() {

	if ( ! indexPromise ) { indexState = 'loading'; indexPromise = bounded( COM_NewerJSON( BASE + 'index.json', BASE + 'index.json' ), 'Weapon manifest' ).then( data => {

		if ( ! data.models || ! data.sources ) throw new Error( 'Missing weapon manifest' );
		index = data; indexState = 'ready'; return data;

	} ).catch( error => {

		indexState = 'fallback'; failures.set( 'manifest', String( error ) ); console.warn( 'Weapon manifest fallback:', error ); throw error;

	} ); }
	return indexPromise;

}

// The ordinary app waits for optional weapon art before its first demo/game
// frame. Reuse the same role loader as held models, pickups and level previews;
// loading while classic is selected never changes the rendering gate.
export function R_WeaponsPreload() {

	if ( ! preloadPromise ) { preloadState = 'loading'; preloadPromise = R_WeaponsLoad()
		.then( manifest => Promise.all( Object.keys( manifest.models ).concat( 'shell' ).map( R_WeaponLoad ) ) )
		.catch( () => [] ).then( assets => { preloadState = failures.size ? 'fallback' : 'ready'; return assets; } ); } // native fallback remains
	return preloadPromise;

}

// Also used by shells; all downloads must complete before any native art is
// replaced. A failed load remains a visible diagnostic and native fallback.
export function R_WeaponLoad( key ) {

	if ( ! requests.has( key ) ) {

		const request = R_WeaponsLoad().then( async manifest => {

			const source = key === 'shell' ? 'shell' : manifest.models[ key ]?.source;
			if ( ! source ) return null;
			if ( ! sourceTextures.has( source ) ) sourceTextures.set( source,
				Promise.all( Object.entries( manifest.sources[ source ].maps ).map( async ( [ kind, file ] ) => [ kind, await texture( source + '/' + file, kind !== 'normal', manifest.sources[ source ].textureFlipY === true ) ] ) ) );
			const [ data, loaded ] = await Promise.all( [
				bounded( COM_NewerJSON( BASE + key + '.json', BASE + key + '.json' ), 'Weapon geometry ' + key ),
				sourceTextures.get( source )
			] );
			if ( ! data.poses?.length || ! data.indices?.length || ! data.uv?.length ) throw new Error( 'Invalid weapon geometry: ' + key );
			const templates = data.poses.map( ( positions, pose ) => {

				const geo = new THREE.BufferGeometry();
				geo.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
				geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( data.uv, 2 ) );
				geo.setIndex( data.indices );
				if ( data.normals?.[ pose ] ) geo.setAttribute( 'normal', new THREE.Float32BufferAttribute( data.normals[ pose ], 3 ) );
				else geo.computeVertexNormals();
				const normals = geo.getAttribute( 'normal' ).array, count = positions.length / 3;
				const lighting = new Uint8Array( count );
				for ( let i = 0; i < count; i ++ ) {

					let best = - Infinity;
					for ( let n = 0; n < r_avertexnormals.length; n ++ ) {

						const normal = r_avertexnormals[ n ];
						const dot = normal[ 0 ] * normals[ i * 3 ] + normal[ 1 ] * normals[ i * 3 + 1 ] + normal[ 2 ] * normals[ i * 3 + 2 ];
						if ( dot > best ) { best = dot; lighting[ i ] = n; }

					}

				}
				return { posAttr: geo.getAttribute( 'position' ), normalAttr: geo.getAttribute( 'normal' ),
					uvAttr: geo.getAttribute( 'uv' ), indices: data.indices, lightnormalindices: lighting, vertexCount: count };

			} );
			const maps = Object.fromEntries( loaded ), material = R_AssetAliasMaterial( maps, key, manifest.sources[ source ].material );
			const cameraPullback=manifest.models[key]?.cameraPullback;
			const asset = { templates, material, source, key, textures: Object.values( maps ).filter( texture => texture?.isTexture ), rotor: data.rotor || null,
				cameraPullback:key.startsWith('v_') && Number.isFinite(cameraPullback) && cameraPullback>=0 ? cameraPullback : 0 };
			request.asset = asset; return asset;

		} ).catch( error => {

			failures.set( key, String( error ) ); console.warn( 'Weapon art fallback:', key, error ); return null;

		} ).finally( () => { request.settled = true; } );
		requests.set( key, request );

	}
	return requests.get( key );

}

// `skin`: a pickup MDL's skin can name a different role: skin 1 of g_shot.mdl is the basic shotgun's drop (role g_shot1,
// respawn_record.js), which has no MDL of its own
const SKIN_ROLES = Object.freeze( { g_shot: { 1: 'g_shot1' } } );
export function R_WeaponRole( modelName, skin = 0 ) {

	const key = /^progs\/([vg]_[a-z0-9]+)\.mdl$/.exec( modelName || '' )?.[ 1 ] ?? null;
	return key && skin && SKIN_ROLES[ key ]?.[ skin ] ? SKIN_ROLES[ key ][ skin ] : key;

}
export function R_WeaponAsset( modelName, skin = 0 ) {

	if ( ! R_WeaponsEnabled() ) return null;
	const key = R_WeaponRole( modelName, skin );
	if ( ! key ) return null;
	if ( ! index ) { R_WeaponsLoad().catch( () => {} ); return null; }
	if ( ! index.models[ key ] ) return null;
	R_WeaponLoad( key );
	const asset = requests.get( key )?.asset || null;
	return asset;

}

// Ready imported held art only. Baked fitting offsets remain part of the
// asset; this independent runtime adjustment follows the actual camera axis.
export function R_WeaponHeldPullback(modelName) {
	if(R_ClassicPassActive())return 0;
	return R_WeaponAsset(modelName)?.cameraPullback || 0;
}

// The super nailgun's barrels: a rotor with a continuous angle and angular velocity (owner request, card [45]).
// While the game says the weapon is firing (any pose but the idle pose 0) the speed eases up to the firing speed, the
// stored poses' own rate (the poses step 45 degrees each 0.1 s weapon frame: -pi/4 / 0.1 = about 7.85 rad/s, 1.25
// turns a second, a full turn in eight frames). When firing stops the barrels keep turning in the same direction and
// the speed decays smoothly to nothing (time constant `spinDown`): a coast of speed x constant, about 2 rad or a third
// of a turn, mostly over within three quarters of a second. Firing again eases from the current angle and speed with
// no snap. Both are exact exponential approaches integrated over the game-time step, so they do not depend on the
// frame rate; the same game time (a pause, a second render pass) integrates nothing, and the state is never thrown
// away by a teleport, a clock that jumps back or a long gap: the angle and speed simply carry on (a rollback only
// re-anchors the time). It is released only when the weapon is no longer a rotor asset, and restarted when the asset
// changes. The numbers are small, documented tuning values, not measured from the original game.
export const ROTOR = Object.freeze( { step: .1, spinUp: .06, spinDown: .25, stopBelow: .1 } );

// One existing alias mesh, with only the four barrel assemblies animated.
// Rotate an angle, never interpolate vertices: chord interpolation collapses the
// barrel spacing and radius between stored poses. Rest arrays remain shared
// and immutable; each drawn entity owns its rotating attributes. (The stored poses only fix the firing speed and
// direction and the angle a fresh state starts from; the rest of the model does not change between poses. Because the
// angle is integrated, `r_lerpmodels` no longer changes how the barrels turn: they are always smooth.)
export function R_WeaponRotorFrame( asset, entity, pose, poseBlend, time ) {

	if ( ! asset?.rotor || ! entity ) {

		if ( entity && ! R_ClassicPassActive() ) rotorStates.delete( entity );
		return null;

	}
	const rotor = asset.rotor, rest = asset.templates[ 0 ], turn = 2 * Math.PI;
	const firing = pose !== 0;
	// the stored poses' step, wrapped into (-pi, pi]: its sign is the firing direction
	let stored = rotor.angles.length > 2 ? ( rotor.angles[ 2 ] - rotor.angles[ 1 ] ) % turn : NaN;
	if ( stored > Math.PI ) stored -= turn; else if ( stored <= - Math.PI ) stored += turn;
	const fireSpeed = Number.isFinite( stored ) && stored !== 0 ? stored / ROTOR.step : - Math.PI / 4 / ROTOR.step;
	if ( ! Number.isFinite( time ) ) return rotorStates.get( entity )?.template ?? null;
	let state = rotorStates.get( entity );
	if ( ! state || state.asset !== asset ) {

		const template = { ...rest,
			posAttr: new THREE.BufferAttribute( rest.posAttr.array.slice(), 3 ),
			normalAttr: new THREE.BufferAttribute( rest.normalAttr.array.slice(), 3 ),
			lightnormalindices: rest.lightnormalindices.slice() };
		// a fresh entity or a new asset: start from the pose's own angle, at the speed the pose implies
		state = { asset, template, value: rotor.angles[ pose ] ?? 0, omega: firing ? fireSpeed : 0, applied: NaN, time };
		rotorStates.set( entity, state );

	}
	// (a clock that went back only re-anchors the time: the barrels carry on from where they are)
	const dt = Math.max( 0, time - state.time );
	if ( dt > 0 ) {

		// exact exponential approach of the speed to its goal, and the angle that travelled
		const goal = firing ? fireSpeed : 0, k = 1 / ( firing ? ROTOR.spinUp : ROTOR.spinDown ), decay = Math.exp( - k * dt );
		state.value += goal * dt + ( state.omega - goal ) * ( 1 - decay ) / k;
		state.omega = goal + ( state.omega - goal ) * decay;
		if ( ! firing && Math.abs( state.omega ) < ROTOR.stopBelow ) state.omega = 0;

	}
	state.time = time;
	const angle = state.value;
	if ( angle !== state.applied ) {

		state.applied = angle;
		const c = Math.cos( angle ), s = Math.sin( angle ), k = 1 - c;
		const [ ax, ay, az ] = rotor.axis, [ px, py, pz ] = rotor.pivot;
		const positions = state.template.posAttr.array, normals = state.template.normalAttr.array;
		for ( const id of rotor.vertices ) {

			const i = id * 3;
			let x = rest.posAttr.array[ i ] - px, y = rest.posAttr.array[ i + 1 ] - py, z = rest.posAttr.array[ i + 2 ] - pz;
			let dot = ax * x + ay * y + az * z;
			positions[ i ] = px + x * c + ( ay * z - az * y ) * s + ax * dot * k;
			positions[ i + 1 ] = py + y * c + ( az * x - ax * z ) * s + ay * dot * k;
			positions[ i + 2 ] = pz + z * c + ( ax * y - ay * x ) * s + az * dot * k;
			x = rest.normalAttr.array[ i ]; y = rest.normalAttr.array[ i + 1 ]; z = rest.normalAttr.array[ i + 2 ];
			dot = ax * x + ay * y + az * z;
			const nx = x * c + ( ay * z - az * y ) * s + ax * dot * k;
			const ny = y * c + ( az * x - ax * z ) * s + ay * dot * k;
			const nz = z * c + ( ax * y - ay * x ) * s + az * dot * k;
			normals[ i ] = nx; normals[ i + 1 ] = ny; normals[ i + 2 ] = nz;
			let best = - Infinity, lighting = 0;
			for ( let n = 0; n < r_avertexnormals.length; n ++ ) {

				const normal = r_avertexnormals[ n ], value = normal[ 0 ] * nx + normal[ 1 ] * ny + normal[ 2 ] * nz;
				if ( value > best ) { best = value; lighting = n; }

			}
			state.template.lightnormalindices[ id ] = lighting;

		}
		state.template.posAttr.needsUpdate = true;
		state.template.normalAttr.needsUpdate = true;

	}
	return state.template;

}

// Read-only view of an entity's rotor (angle and speed), for tests.
export function R_WeaponRotorState( entity ) {

	const state = rotorStates.get( entity );
	return state ? { angle: state.value, omega: state.omega, time: state.time } : null;

}

export function R_WeaponStatus() {

	return { ready: Array.from( requests ).filter( ( [ , p ] ) => p.asset ).map( ( [ key ] ) => key ),
		failures: Object.fromEntries( failures ), index: indexState, preload: preloadState,
		pending: Array.from( requests ).filter( ( [ , p ] ) => ! p.settled ).map( ( [ key ] ) => key ),
		settled: indexState !== 'loading' && preloadState !== 'loading' && Array.from( requests.values() ).every( p => p.settled ) };

}

// Actual ready held/pickup/shell materials; shader warming reuses these objects
// without requesting new roles, changing rendering gates or replacing assets.
export function R_WeaponMaterials() {
	return [ ...new Set( Array.from( requests.values() ).map( request => request.asset?.material ).filter( Boolean ) ) ];
}

export function R_WeaponTextures() {
	return [ ...new Set( Array.from( requests.values() ).flatMap( request => request.asset?.textures || [] ) ) ];
}
