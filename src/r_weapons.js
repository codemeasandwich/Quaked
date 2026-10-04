// Optional imported weapon art, fitted independently to the original held and
// pickup MDLs by tools/import_weapons.py. Gameplay identities stay native.
import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { R_NewerGame, R_ClassicPassActive } from './r_anim.js';
import { COM_NewerJSON, COM_NewerURL } from './pak.js';
import { R_AssetAliasMaterial } from './r_newerskins.js';
import { r_avertexnormals } from './anorm_dots.js';

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
			const asset = { templates, material, source, key, textures: Object.values( maps ).filter( texture => texture?.isTexture ), rotor: data.rotor || null };
			request.asset = asset; return asset;

		} ).catch( error => {

			failures.set( key, String( error ) ); console.warn( 'Weapon art fallback:', key, error ); return null;

		} ).finally( () => { request.settled = true; } );
		requests.set( key, request );

	}
	return requests.get( key );

}

export function R_WeaponAsset( modelName ) {

	if ( ! R_WeaponsEnabled() ) return null;
	const key = /^progs\/([vg]_[a-z0-9]+)\.mdl$/.exec( modelName || '' )?.[ 1 ];
	if ( ! key ) return null;
	if ( ! index ) { R_WeaponsLoad().catch( () => {} ); return null; }
	if ( ! index.models[ key ] ) return null;
	R_WeaponLoad( key );
	const asset = requests.get( key )?.asset || null;
	return asset;

}

// One existing alias mesh, with only the four barrel assemblies animated.
// Interpolate an angle, never vertices: chord interpolation collapses the
// barrel spacing and radius between stored poses. Rest arrays remain shared
// and immutable; each drawn entity owns its rotating attributes.
export function R_WeaponRotorFrame( asset, entity, pose, poseBlend, time ) {

	if ( ! asset?.rotor || ! entity ) {

		if ( entity && ! R_ClassicPassActive() ) rotorStates.delete( entity );
		return null;

	}
	const rotor = asset.rotor, rest = asset.templates[ 0 ], origin = entity.origin;
	let state = rotorStates.get( entity );
	if ( ! state || state.asset !== asset || time < state.time || time - state.time > .25 ||
		( origin && state.origin && Math.hypot( ...origin.map( ( value, i ) => value - state.origin[ i ] ) ) > 96 ) ||
		( poseBlend && state.poseBlend !== poseBlend ) ) {

		const template = { ...rest,
			posAttr: new THREE.BufferAttribute( rest.posAttr.array.slice(), 3 ),
			normalAttr: new THREE.BufferAttribute( rest.normalAttr.array.slice(), 3 ),
			lightnormalindices: rest.lightnormalindices.slice() };
		const angle = rotor.angles[ pose ] ?? 0;
		state = { asset, template, pose, from: angle, target: angle, angle: NaN, time,
			poseBlend, origin: origin ? origin.slice() : null };
		rotorStates.set( entity, state );

	}
	if ( pose !== state.pose ) {

		state.from = state.target;
		// Idle stops at the settled orientation. Resuming firing advances in
		// the original direction, including the last-pose -> idle -> shot loop.
		let delta = 0;
		if ( pose !== 0 ) {

			const turn = 2 * Math.PI;
			delta = ( ( rotor.angles[ pose ] - rotor.angles[ state.pose ] ) % turn + turn ) % turn;
			if ( delta > 0 ) delta -= turn;

		}
		state.target += delta;
		state.pose = pose;

	}
	state.time = time;
	if ( origin ) {

		if ( ! state.origin ) state.origin = origin.slice();
		else for ( let i = 0; i < 3; i ++ ) state.origin[ i ] = origin[ i ];

	}
	const blend = poseBlend && poseBlend.from !== poseBlend.to ? poseBlend.blend : 1;
	const angle = state.from + ( state.target - state.from ) * blend;
	if ( angle !== state.angle ) {

		state.angle = angle;
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
