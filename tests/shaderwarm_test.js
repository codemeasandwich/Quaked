// Independent disposal-lifetime regression through the public compiler helper.
// Real Three materials emit their real disposal event; the controlled compiler
// models Three's asynchronous polling of the material's currentProgram record.
import * as THREE from 'three';
import { R_CompileSceneAsync } from '../src/newer/render/r_shaderwarm.js';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} !== ${b}` );
function deferred() { let resolve, reject; const promise = new Promise( ( a, b ) => { resolve = a; reject = b; } ); return { promise, resolve, reject }; }
function fixture( ownDispose = false ) {

	const material = new THREE.MeshBasicMaterial(), geometry = new THREE.BoxGeometry(), mesh = new THREE.Mesh( geometry, material ), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); scene.add( mesh );
	const properties = { currentProgram: { id: 91 } }; let disposed = 0;
	material.addEventListener( 'dispose', () => { disposed ++; delete properties.currentProgram; } );
	if ( ownDispose ) Object.defineProperty( material, 'dispose', { configurable: true, writable: true, enumerable: true, value: function () { THREE.Material.prototype.dispose.call( this ); } } );
	return { material, geometry, mesh, scene, camera, properties, disposed: () => disposed };

}

Deno.test( 'detachment and repeated disposal requests keep actual material program alive until asynchronous compilation settles', async () => {

	const f = fixture(), pending = deferred(), inherited = f.material.dispose;
	const renderer = { compileAsync( scene, camera ) { same( scene, f.scene, 'real scene identity' ); same( camera, f.camera, 'real camera identity' ); return pending.promise.then( () => { same( f.properties.currentProgram.id, 91, 'asynchronous program poll remains valid' ); return 'compiled'; } ); } };
	const result = R_CompileSceneAsync( renderer, f.scene, f.camera ); f.mesh.removeFromParent(); f.material.dispose(); f.material.dispose();
	same( f.mesh.parent, null, 'scene removal is immediate' ); same( f.disposed(), 0, 'GPU disposal deferred while polled' ); same( f.properties.currentProgram.id, 91, 'program properties survive disposal requests' );
	pending.resolve(); same( await result, 'compiled', 'compiler result preserved' ); same( f.disposed(), 1, 'pending destruction emitted exactly once' ); same( f.properties.currentProgram, undefined, 'real disposal event cleans program after polling' );
	same( Object.hasOwn( f.material, 'dispose' ), false, 'prototype method restored without adding own property' ); same( f.material.dispose, inherited, 'original inherited method identity' ); f.geometry.dispose();

} );

Deno.test( 'overlapping compiler promises share one lease and restore exact own dispose descriptor after last settle', async () => {

	const f = fixture( true ), descriptor = Object.getOwnPropertyDescriptor( f.material, 'dispose' ), a = deferred(), b = deferred(); let calls = 0;
	const renderer = { compileAsync() { return calls ++ === 0 ? a.promise : b.promise; } };
	const first = R_CompileSceneAsync( renderer, f.scene, f.camera ), wrapper = f.material.dispose, second = R_CompileSceneAsync( renderer, f.scene, f.camera ); same( f.material.dispose, wrapper, 'overlap shares wrapper' );
	f.material.dispose(); a.resolve( 1 ); same( await first, 1, 'first result forwarded' ); same( f.disposed(), 0, 'first completion cannot release second compiler material' ); same( f.material.dispose, wrapper, 'last compiler still owns lease' );
	b.resolve( 2 ); same( await second, 2, 'second result forwarded' ); same( f.disposed(), 1, 'last completion emits one disposal' );
	const after = Object.getOwnPropertyDescriptor( f.material, 'dispose' ); for ( const key of [ 'value', 'configurable', 'writable', 'enumerable' ] ) same( after[ key ], descriptor[ key ], 'exact own descriptor restored ' + key ); f.geometry.dispose();

} );

Deno.test( 'compiler rejection releases pending destruction and propagates original rejection without stranding other material leases', async () => {

	const f = fixture(), extra = new THREE.MeshBasicMaterial(), a = deferred(), error = new Error( 'intentional shader compile rejection' ); f.mesh.material = [ f.material, extra, f.material ];
	let otherDisposals = 0; extra.addEventListener( 'dispose', () => otherDisposals ++ );
	const running = R_CompileSceneAsync( { compileAsync: () => a.promise }, f.scene, f.camera ); f.material.dispose(); extra.dispose(); a.reject( error );
	let caught; try { await running; } catch ( e ) { caught = e; }
	same( caught, error, 'original rejection identity' ); same( f.disposed(), 1, 'deduplicated material disposed once' ); same( otherDisposals, 1, 'second material released after failure' ); same( Object.hasOwn( f.material, 'dispose' ), false, 'rejection restores native prototype ownership' ); same( Object.hasOwn( extra, 'dispose' ), false, 'other lease restored' ); f.geometry.dispose();

} );

Deno.test( 'synchronous compiler throw releases wrappers and requested disposal, while successful no-dispose compilation preserves material', async () => {

	const f = fixture(), error = new Error( 'intentional synchronous compile failure' ); let caught;
	try { R_CompileSceneAsync( { compileAsync() { f.material.dispose(); throw error; } }, f.scene, f.camera ); } catch ( e ) { caught = e; }
	same( caught, error, 'synchronous throw identity preserved' ); same( f.disposed(), 1, 'sync failure flushes pending disposal once' ); same( Object.hasOwn( f.material, 'dispose' ), false, 'sync failure restores prototype method' );
	const second = fixture( true ), descriptor = Object.getOwnPropertyDescriptor( second.material, 'dispose' );
	same( await R_CompileSceneAsync( { compileAsync: () => Promise.resolve( 'ready' ) }, second.scene, second.camera ), 'ready', 'successful compiler return' ); same( second.disposed(), 0, 'unrequested disposal never happens' ); same( Object.getOwnPropertyDescriptor( second.material, 'dispose' ).value, descriptor.value, 'normal completion restores own method' ); f.geometry.dispose(); second.geometry.dispose(); second.material.dispose();

} );

Deno.test( 'synchronous fallback calls original compile directly without leases or return-value changes', () => {

	const f = fixture(), original = f.material.dispose, token = {};
	const result = R_CompileSceneAsync( { compile( scene, camera ) { same( scene, f.scene, 'fallback scene' ); same( camera, f.camera, 'fallback camera' ); same( f.material.dispose, original, 'fallback never wraps disposal' ); f.material.dispose(); return token; } }, f.scene, f.camera );
	same( result, token, 'fallback exact return identity' ); same( f.disposed(), 1, 'fallback disposal immediate' ); same( Object.hasOwn( f.material, 'dispose' ), false, 'fallback does not alter prototype ownership' ); f.geometry.dispose();

} );
