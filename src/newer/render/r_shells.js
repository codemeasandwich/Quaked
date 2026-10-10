/**
 * @module newer/render/r_shells
 *
 * Spent shotgun shells: casings thrown by the player's shotgun, kept and saved.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `current`, `asset`, `loading`, `lastTime`; 3 module-level
 * collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Its engine dependencies are injected with `R_ShellsSetup`.
 */
// Confirmed local shotgun sound packets produce persistent cosmetic casings.
// No server entities, TTL, ring buffer or removal cap. Save metadata owns their
// persistence; per-map records survive seamless return during the session.
import * as THREE from 'three';
import { R_WeaponsEnabled, R_WeaponLoad } from './r_weapons.js';
import { R_ClassicPassActive } from '../mode.js';
import { R_CloneAliasMaterial } from './r_newerskins.js';
import { R_ShellBrushMatrix } from './r_shelltrace.js';

const CHUNK = 256, RADIUS = 0.55;
let deps = null, current = null, asset = null;
const levels = new Map();
const active = new Set();
const supported = new Set();
const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
const scale = new THREE.Vector3( 1, 1, 1 ), point = new THREE.Vector3(), normal = new THREE.Vector3();
const forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
const local = new THREE.Vector3(), color = new THREE.Color();
const unitZ = new THREE.Vector3( 0, 0, 1 );
let loading = false, lastTime = null;

/**
 * Gives the shells their engine dependencies; called from gl_rmain.js when the renderer sets up a map, just before
 * `R_ShellsNewMap`. Kept until the next call.
 *
 * @param {{scene: THREE.Scene, client: function(): ?client_state_t, refresh?: function(): void,
 *   trace: function(Array<number>, Array<number>, number): object, entity?: function(number): ?entity_t,
 *   light: function(Array<number>): number}} d `client()` the client state (`cl`); `refresh()` re-reads the brush
 *   entities the trace may hit; `trace(start, end, radius)` a sphere trace against the world and those brushes
 *   (`R_ShellTrace`; result has `fraction`, `endpos`, `plane`, `ent`, `startsolid`, `allsolid`); `entity(index)` a
 *   client entity by number; `light(point)` the light level at a point (`R_LightPoint`); a shell is tinted light / 128, clamped 0..1.5
 */
export function R_ShellsSetup( d ) { deps = d; }

function detach( state ) {

	for ( const chunk of state.chunks ) if ( chunk.parent ) chunk.parent.remove( chunk );

}

/**
 * Switches to a map's shells when the renderer sets up a map (gl_rmain.js): takes the old map's chunks out of the
 * scene and makes `name`'s record current, creating it when new. Per-map records survive seamless return during the
 * session, so coming back shows the casings left there; moving and supported shells resume.
 *
 * @param {string} name the world model's name (`cl.worldmodel.name`, '' with no world)
 */
export function R_ShellsNewMap( name ) {

	if ( current ) detach( current );
	current = levels.get( name );
	if ( ! current ) { current = { name, shells: [], chunks: [] }; levels.set( name, current ); }
	active.clear(); supported.clear();
	for ( const s of current.shells ) { if ( ! s.rest ) active.add( s ); else if ( s.support ) supported.add( s ); }
	lastTime = null;

}

/**
 * Forgets every map's shells and disposes their instanced meshes; called by `Host_Map_f` (explicit map / new game,
 * unlike seamless level travel) and at the start of `R_ShellsRestore`.
 */
export function R_ShellsReset() {

	for ( const state of levels.values() ) {

		detach( state ); for ( const chunk of state.chunks ) { chunk.dispose(); chunk.geometry.dispose(); chunk.material.dispose(); }

	}
	levels.clear(); active.clear(); supported.clear(); current = null; lastTime = null;

}

function ensureAsset() {

	if ( loading ) return;
	loading = true;
	R_WeaponLoad( 'shell' ).then( result => { asset = result; } );

}

/**
 * Throws casings for one confirmed local shotgun shot. Called by the client for every parsed sound packet outside
 * demo playback (cl_parse.js), independent of audio being enabled; these vanilla-progs sounds occur exactly once per
 * shot. Only the view entity's weapon channel (1) counts: 'weapons/guncock.wav' throws one shell, 'weapons/shotgn2.wav'
 * (super shotgun) two, from opposite chamber offsets of the ejection port on the receiver's right side. The held gun's
 * posed matrix is used when it is within 80 units of the packet origin (it contains bob/recoil/orientation); otherwise
 * the view angles at the packet origin plus 22 units, so a teleport can't emit at a stale eye. Shells are added to the
 * current map's record (persistent; no TTL, cap or server entity). Does nothing without a current map or when the
 * Newer weapons are off.
 *
 * @param {number} entity the sound's entity number
 * @param {number} channel the sound's channel
 * @param {string} sound the sound's name, e.g. 'weapons/guncock.wav'
 * @param {Array<number>} packetOrigin the sound's origin, the authoritative player location (world space, Quake units)
 * @returns {number} shells thrown: 0, 1 or 2
 */
export function R_ShellShot( entity, channel, sound, packetOrigin ) {

	const cl = deps?.client();
	if ( ! cl || entity !== cl.viewentity || channel !== 1 || ! current || ! R_WeaponsEnabled() ) return 0;
	const count = sound === 'weapons/guncock.wav' ? 1 : sound === 'weapons/shotgn2.wav' ? 2 : 0;
	if ( ! count ) return 0;
	deps.refresh?.();
	ensureAsset();
	// Native view entity contains bob/recoil/orientation. The sound's origin is
	// the authoritative player location, so a teleport can't emit at a stale eye.
	const held = cl.viewent, mesh = held?._aliasMesh;
	const hasPose = mesh && held.origin && Math.hypot( held.origin[ 0 ] - packetOrigin[ 0 ], held.origin[ 1 ] - packetOrigin[ 1 ], held.origin[ 2 ] - packetOrigin[ 2 ] ) < 80;
	if ( hasPose ) {

		mesh.updateMatrix(); matrix.copy( mesh.matrix );

	} else {

		const angles = cl.viewangles || [ 0, 0, 0 ];
		matrix.makeRotationZ( angles[ 1 ] * Math.PI / 180 );
		matrix.multiply( new THREE.Matrix4().makeRotationY( - angles[ 0 ] * Math.PI / 180 ) );
		matrix.setPosition( packetOrigin[ 0 ], packetOrigin[ 1 ], packetOrigin[ 2 ] + 22 );

	}
	forward.set( 1, 0, 0 ).transformDirection( matrix ); right.set( 0, - 1, 0 ).transformDirection( matrix ); up.set( 0, 0, 1 ).transformDirection( matrix );
	// Ejection port: receiver's right side, not the muzzle. For the double
	// barrel two separate casings leave opposite chamber offsets.
	for ( let i = 0; i < count; i ++ ) {

		const port = count === 2 ? [ 5, - 1.8 - i * 0.8, - 8 ] : [ 8, - 2, - 8 ];
		local.fromArray( port ); point.copy( local ).applyMatrix4( matrix );
		const origin = matrix.elements.slice( 12, 15 );
		const trace = deps.trace( origin, point.toArray(), RADIUS );
		if ( trace.startsolid || trace.allsolid ) point.fromArray( origin );
		else point.fromArray( trace.endpos );
		const side = 65 + Math.random() * 25 + i * 18;
		const velocity = right.clone().multiplyScalar( side ).addScaledVector( up, 75 + Math.random() * 30 ).addScaledVector( forward, - 20 );
		if ( cl.velocity ) velocity.add( new THREE.Vector3().fromArray( cl.velocity ).multiplyScalar( 0.4 ) );
		const s = { id: current.shells.length, p: point.toArray(), v: velocity.toArray(),
			q: [ 0, 0, 0, 1 ], spin: [ Math.random() * 12, Math.random() * 12, Math.random() * 12 ], rest: false, still: 0, yaw: Math.random() * Math.PI * 2 };
		current.shells.push( s ); active.add( s );

	}
	return count;

}

function chunkFor( id ) {

	const index = Math.floor( id / CHUNK );
	if ( ! current.chunks[ index ] ) {

		const t = asset.templates[ 0 ], geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', t.posAttr ); geometry.setAttribute( 'normal', t.normalAttr ); geometry.setAttribute( 'uv', t.uvAttr ); geometry.setIndex( t.indices );
		// Per-instance colour uses the same baked point lighting as native items.
		const material = R_CloneAliasMaterial( asset.material ); material.vertexColors = false;
		const chunk = new THREE.InstancedMesh( geometry, material, CHUNK );
		chunk.count = 0; chunk.frustumCulled = false; chunk.name = 'quake_shotgun_shells'; chunk.userData.newerOnly = true;
		chunk.instanceMatrix.setUsage( THREE.DynamicDrawUsage ); current.chunks[ index ] = chunk;

	}
	return current.chunks[ index ];

}

function draw( s ) {

	if ( ! asset ) return;
	const chunk = chunkFor( s.id ), slot = s.id % CHUNK;
	point.fromArray( s.p ); rotation.fromArray( s.q ); matrix.compose( point, rotation, scale );
	chunk.setMatrixAt( slot, matrix );
	const brightness = Math.min( 1.5, Math.max( 0, deps.light( s.p ) / 128 ) );
	color.setRGB( brightness, brightness, brightness ); chunk.setColorAt( slot, color );
	chunk.count = Math.max( chunk.count, slot + 1 ); chunk.instanceMatrix.needsUpdate = true; chunk.instanceColor.needsUpdate = true;

}

/**
 * Moves and draws the current map's shells every frame (`R_RenderView`, gl_rmain.js). Shells resting on a brush
 * entity follow it (and fall again when it is gone or changed model); moving ones fall at 800 units/s^2, bounce
 * (restitution .28, floor friction .72) and come to rest on a floor slower than 24 units/s. Fixed sweeps of at most
 * 1/120 s avoid tunnelling and make pauses (client time stands still) harmless; at most 0.25 s is simulated per call, so
 * long tab stalls resume without a giant physics jump. Starts the shell model's load on first use and, once loaded,
 * draws every record once after downloads or save restoration, then only what changed. Skipped during the Classic pass.
 *
 * @param {number} time client time, seconds (`cl.time`)
 */
export function R_ShellsFrame( time ) {

	if ( ! current || ! deps || R_ClassicPassActive() ) return;
	ensureAsset();
	deps.refresh?.();
	const changed = new Set( active );
	for ( const s of supported ) {

		const entity = deps.entity?.( s.support.id );
		if ( ! entity?.model || entity.model.name !== s.support.model ) {

			supported.delete( s ); delete s.support; s.rest = false; active.add( s ); changed.add( s ); continue;

		}
		const matrix = R_ShellBrushMatrix( entity );
		point.fromArray( s.support.local ).applyMatrix4( matrix );
		rotation.setFromRotationMatrix( matrix ).multiply( new THREE.Quaternion().fromArray( s.support.q ) );
		if ( point.distanceToSquared( new THREE.Vector3().fromArray( s.p ) ) > 1e-10 || Math.abs( rotation.dot( new THREE.Quaternion().fromArray( s.q ) ) ) < 1 - 1e-10 ) {

			s.p = point.toArray(); s.q = rotation.toArray(); changed.add( s );

		}

	}
	const elapsed = lastTime === null ? 0 : Math.max( 0, time - lastTime ); lastTime = time;
	// Fixed short sweeps avoid tunnelling and make pauses (client time stands
	// still) harmless. Long tab stalls resume without a giant physics jump.
	let remaining = Math.min( elapsed, 0.25 );
	while ( remaining > 0 ) {

		const dt = Math.min( remaining, 1 / 120 ); remaining -= dt;
		for ( const s of active ) {

			s.v[ 2 ] -= 800 * dt;
			const end = s.p.map( ( value, i ) => value + s.v[ i ] * dt );
			const hit = deps.trace( s.p, end, RADIUS ); s.p = Array.from( hit.endpos );
			if ( hit.fraction < 1 && hit.plane ) {

				const n = hit.plane.normal, dot = s.v.reduce( ( total, v, i ) => total + v * n[ i ], 0 );
				if ( dot < 0 ) for ( let i = 0; i < 3; i ++ ) s.v[ i ] -= 1.28 * dot * n[ i ];
				if ( n[ 2 ] > 0.5 ) {

					s.v[ 0 ] *= 0.72; s.v[ 1 ] *= 0.72;
					if ( Math.hypot( ...s.v ) < 24 ) {

						s.rest = true; s.v = [ 0, 0, 0 ]; normal.fromArray( n );
						rotation.setFromUnitVectors( unitZ, normal ).multiply( new THREE.Quaternion().setFromAxisAngle( unitZ, s.yaw ) );
						s.q = rotation.toArray(); active.delete( s );
						if ( hit.ent && Number.isInteger( hit.ent._entityIndex ) ) {

							const brush = R_ShellBrushMatrix( hit.ent );
							s.support = { id: hit.ent._entityIndex, model: hit.ent.model.name,
								local: new THREE.Vector3().fromArray( s.p ).applyMatrix4( brush.clone().invert() ).toArray(),
								q: new THREE.Quaternion().setFromRotationMatrix( brush ).invert().multiply( rotation ).toArray() };
							supported.add( s );

						}

					}

				}

			}
			if ( ! s.rest ) {

				rotation.fromArray( s.q ).multiply( new THREE.Quaternion().setFromEuler( new THREE.Euler( ...s.spin.map( v => v * dt ) ) ) ).normalize();
				s.q = rotation.toArray();

			}

		}

	}
	if ( asset ) {

		// Populate all existing records once after downloads or save restoration.
		if ( current.drawn !== current.shells.length ) {

			for ( const s of current.shells ) draw( s ); current.drawn = current.shells.length;

		} else for ( const s of changed ) draw( s );

	}
	for ( const chunk of current.chunks ) {

		if ( chunk.parent !== deps.scene ) deps.scene.add( chunk ); chunk.visible = R_WeaponsEnabled();

	}

}

/**
 * The save metadata for every map's shells; written by `Host_Savegame_f` as a base64 JSON line (save metadata owns
 * their persistence).
 *
 * @returns {{version: 1, levels: Array<{name: string, shells: Array<{p: Array<number>, v: Array<number>,
 *   q: Array<number>, spin: Array<number>, rest: boolean, yaw: number, support?: object}>}>}} plain arrays shared with
 *   the live records (serialise it at once); `p` position and `v` velocity in Quake units (/s), `q` quaternion, `spin`
 *   radians/s, `yaw` radians, `support` the resting brush `{id, model, local, q}`
 */
export function R_ShellsSnapshot() {

	return { version: 1, levels: Array.from( levels.values(), state => ( { name: state.name,
		shells: state.shells.map( ( { p, v, q, spin, rest, yaw, support } ) => ( { p, v, q, spin, rest, yaw, ...( support ? { support } : {} ) } ) ) } ) ) };

}

/**
 * Replaces all shells with a saved snapshot; called by `Host_Loadgame_f` (with null when the save has none or it
 * could not be parsed, which leaves no shells). Shells with malformed vectors are dropped; an invalid support is
 * dropped and the shell falls again. The current map is chosen by the next `R_ShellsNewMap`.
 *
 * @param {?object} data a `R_ShellsSnapshot` result (`version` must be 1); copied, not kept
 */
export function R_ShellsRestore( data ) {

	R_ShellsReset();
	if ( data?.version !== 1 || ! Array.isArray( data.levels ) ) return;
	for ( const state of data.levels ) {

		if ( typeof state.name !== 'string' || ! Array.isArray( state.shells ) ) continue;
		const shells = state.shells.filter( s => [ s.p, s.v, s.q, s.spin ].every( ( a, i ) => Array.isArray( a ) && a.length === ( i === 2 ? 4 : 3 ) && a.every( Number.isFinite ) ) && Number.isFinite( s.yaw ) );
		levels.set( state.name, { name: state.name, shells: shells.map( ( s, id ) => {

			const support = s.support;
			const valid = support && Number.isInteger( support.id ) && support.id >= 0 && typeof support.model === 'string'
				&& [ support.local, support.q ].every( ( a, i ) => Array.isArray( a ) && a.length === ( i ? 4 : 3 ) && a.every( Number.isFinite ) );
			return { id, p: s.p.slice(), v: s.v.slice(), q: s.q.slice(), spin: s.spin.slice(), rest: s.rest === true && ( ! support || valid ), yaw: s.yaw,
				...( valid ? { support: { id: support.id, model: support.model, local: support.local.slice(), q: support.q.slice() } } : {} ) };

		} ), chunks: [] } );

	}

}

/**
 * Diagnostics for tests and trials.
 *
 * @returns {{map: (string|undefined), count: number, moving: number, maps: Array<{name: string, count: number}>,
 *   ready: boolean}} the current map and its shell count, how many are moving, every map's count, and whether the
 *   shell model has loaded
 */
export function R_ShellsStatus() {

	return { map: current?.name, count: current?.shells.length || 0, moving: active.size,
		maps: Array.from( levels, ( [ name, state ] ) => ( { name, count: state.shells.length } ) ), ready: !! asset };

}
