// Independent public moving-spot capture, DPR and borrowed-caster contracts.
// Fake renderer records real Three capture cameras; no GPU/game claim.
import * as THREE from 'three';
import { PointShadowAtlas, SPOT_SHADOW_SIZE, SPOT_WORLD_SHADOW_GLSL } from '../src/newer/render/r_pointshadows.js';
const check = ( x, label ) => { if ( ! x ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const near = ( a, b, label ) => check( Math.abs( a - b ) < 1e-8, `${label}: ${a} != ${b}` );
function geometry() { const g = new THREE.BufferGeometry(); g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ -16, -16, -32, 16, -16, -32, 16, 16, -32, -16, -16, -32, 16, 16, -32, -16, 16, -32 ], 3 ) ); return g; }
function renderer() {

	const previous = new THREE.WebGLRenderTarget( 640, 400 ), r = { target: previous, face: 3, mip: 2, viewport: new THREE.Vector4( 7, 11, 280, 160 ), scissor: new THREE.Vector4( 3, 5, 240, 120 ), scissorTest: false, color: new THREE.Color( .1, .2, .3 ), alpha: .35, autoClear: true, xr: { enabled: true }, draws: [], throwAt: Infinity };
	r.getRenderTarget = () => r.target; r.getActiveCubeFace = () => r.face; r.getActiveMipmapLevel = () => r.mip; r.getViewport = v => v.copy( r.viewport ); r.getScissor = v => v.copy( r.scissor ); r.getScissorTest = () => r.scissorTest; r.getClearColor = c => c.copy( r.color ); r.getClearAlpha = () => r.alpha;
	r.setViewport = ( ...args ) => { args[ 0 ]?.isVector4 ? r.viewport.copy( args[ 0 ] ) : r.viewport.set( ...args ); r.physicalViewport.copy( r.viewport ).multiplyScalar( 2 ).floor(); };
	r.setScissor = ( ...args ) => { args[ 0 ]?.isVector4 ? r.scissor.copy( args[ 0 ] ) : r.scissor.set( ...args ); r.physicalScissor.copy( r.scissor ).multiplyScalar( 2 ).floor(); };
	r.setScissorTest = v => { r.scissorTest = r.physicalScissorTest = v; }; r.setClearColor = ( c, a = r.alpha ) => { r.color.set( c ); r.alpha = a; }; r.clear = () => {};
	r.setRenderTarget = ( t, face = 0, mip = 0 ) => { r.target = t; r.face = face; r.mip = mip; r.physicalViewport.copy( t ? t.viewport : r.viewport.clone().multiplyScalar( 2 ).floor() ); r.physicalScissor.copy( t ? t.scissor : r.scissor.clone().multiplyScalar( 2 ).floor() ); r.physicalScissorTest = t ? t.scissorTest : r.scissorTest; };
	r.render = ( scene, camera ) => { r.draws.push( { camera: camera.clone(), target: r.target, viewport: r.physicalViewport.toArray(), scissor: r.physicalScissor.toArray(), scissorTest: r.physicalScissorTest, children: scene.children.map( child => ( { mesh: child, geometry: child.geometry, matrix: child.matrixWorld.clone(), instanceMatrix: child.instanceMatrix } ) ) } ); if ( r.draws.length === r.throwAt ) throw new Error( 'spot fixture failure' ); };
	r.physicalViewport = previous.viewport.clone(); r.physicalScissor = previous.scissor.clone(); r.physicalScissorTest = previous.scissorTest; r.previous = previous; r.dispose = () => previous.dispose(); return r;

}
function state( r ) { return { target: r.target, face: r.face, mip: r.mip, viewport: r.viewport.toArray().join(), scissor: r.scissor.toArray().join(), physicalViewport: r.physicalViewport.toArray().join(), physicalScissor: r.physicalScissor.toArray().join(), physicalScissorTest: r.physicalScissorTest, scissorTest: r.scissorTest, color: r.color.toArray().join(), alpha: r.alpha, autoClear: r.autoClear, xr: r.xr.enabled }; }
function restored( r, before ) { for ( const [ name, expected ] of Object.entries( before ) ) same( state( r )[ name ], expected, 'exact renderer restore ' + name ); }
const beam = { on: true, pos: [ 3, -4, 8 ], dir: [ 0, 0, -1 ], range: 1500, outerCos: .92 };

Deno.test( 'public flashlight capture uses actual offset every frame, one physical512 view at DPR2, perspective projection and exact renderer restoration', () => {

	const g = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), before = state( r );
	try {

		for ( const position of [ [ 3, -4, 8 ], [ 4.5, -4.25, 7.75 ] ] ) {

			const captures = atlas.status().spotCaptures, draws = r.draws.length; atlas.updateSpot( r, { ...beam, pos: position } ); same( atlas.status().spotCaptures, captures + 1, 'offset beam freshly captured' ); same( r.draws.length, draws + 1, 'one view per update' ); same( atlas.spotReady, true, 'current offset capture ready' ); const draw = r.draws.at( -1 );
			same( draw.viewport.join(), [ 0, 0, 512, 512 ].join(), 'physical spot viewport not doubled by DPR2' ); same( draw.scissor.join(), draw.viewport.join(), 'bounded physical spot clear' ); same( draw.scissorTest, true, 'capture scissor enabled' ); same( draw.camera.position.toArray().join(), position.join(), 'capture origin equals offset beam, never player eye' );
			const reference = new THREE.PerspectiveCamera( THREE.MathUtils.radToDeg( 2 * Math.acos( .92 ) ) + 2, 1, 1, 1500 ); reference.position.fromArray( position ); reference.up.set( 0, 1, 0 ); reference.lookAt( position[ 0 ], position[ 1 ], position[ 2 ] - 1 ); reference.updateMatrixWorld();
			for ( const delta of [ [ 0, 0, -20 ], [ 2, 1, -20 ], [ -4, 3, -20 ] ] ) { const point = new THREE.Vector3( ...position ).add( new THREE.Vector3( ...delta ) ), actual = new THREE.Vector4( point.x, point.y, point.z, 1 ).applyMatrix4( atlas.spotVP ), expected = point.project( reference ); near( actual.x / actual.w, expected.x, 'independent light camera clip X' ); near( actual.y / actual.w, expected.y, 'independent light camera clip Y' ); near( actual.z / actual.w, expected.z, 'independent light camera depth' ); }
			restored( r, before );

		}
		same( atlas.spotTexture.colorSpace, THREE.NoColorSpace, 'radial depth not colour' ); same( atlas.spotTexture.type, THREE.UnsignedByteType, 'fixed RGBA packed format' ); same( SPOT_SHADOW_SIZE, 512, 'bounded requested resolution' );
		check( SPOT_WORLD_SHADOW_GLSL.includes( 'clamp(uv+offset/side' ) && SPOT_WORLD_SHADOW_GLSL.includes( 'distanceWorld-' ), 'compiled sampling clamps PCF taps and compares radial world-distance' );

	} finally { atlas.dispose(); g.dispose(); r.dispose(); }

} );

Deno.test( 'live mesh and instanced casters are borrowed unchanged, ineligible effects skipped, capture failure cleans temporary clones and preserves renderer', () => {

	const g = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), original = new THREE.Group(), material = new THREE.MeshBasicMaterial(), actor = new THREE.Mesh( g, material ), instances = new THREE.InstancedMesh( g, material, 2 ); original.add( actor, instances ); actor.position.set( 7, 8, 9 ); actor.rotation.set( .1, .2, .3 ); instances.position.set( -3, 4, 5 ); original.updateMatrixWorld( true );
	const transparent = new THREE.Mesh( g, new THREE.MeshBasicMaterial( { transparent: true } ) ), hiddenParent = new THREE.Group(), hidden = new THREE.Mesh( g, material ); hiddenParent.visible = false; hiddenParent.add( hidden ); const noDepth = new THREE.Mesh( g, new THREE.MeshBasicMaterial( { depthWrite: false } ) );
	const matrix = actor.matrixWorld.elements.slice(), instanceMatrix = instances.instanceMatrix, before = state( r ), children = atlas.scene.children.length; let disposed = 0; g.addEventListener( 'dispose', () => disposed ++ );
	try {

		atlas.updateSpot( r, beam, [ actor, actor, instances, transparent, hidden, noDepth ] ); same( atlas.status().spotDynamicMeshes, 2, 'deduped opaque actors only' ); const draw = r.draws.at( -1 ), clones = draw.children.filter( e => e.mesh.name === 'quake_flashlight_borrowed_caster' ); same( clones.length, 2, 'two actual borrowed casters' ); same( clones[ 0 ].geometry, g, 'original actor geometry shared' ); same( clones[ 0 ].matrix.elements.join(), matrix.join(), 'actor original world transform used' ); same( clones[ 1 ].instanceMatrix, instanceMatrix, 'instance transforms shared without copying native state' ); same( atlas.scene.children.length, children, 'temporary casters removed immediately after capture' ); same( actor.parent, original, 'original actor ownership unchanged' ); same( actor.material, material, 'original shader unchanged' ); restored( r, before );
		r.throwAt = r.draws.length + 1; atlas.updateSpot( r, beam, [ actor, instances ] ); same( atlas.status().spotReady, false, 'failed fresh view never exposes old shadow' ); same( atlas.status().spotFailedCaptures, 1, 'failure accounted' ); check( atlas.status().spotError.includes( 'spot fixture failure' ), 'failure observable' ); same( atlas.scene.children.length, children, 'failed capture removes temporary actors' ); restored( r, before );
		atlas.invalidate(); same( instances.instanceMatrix, instanceMatrix, 'epoch reset cannot replace source instance buffer' ); same( disposed, 0, 'borrowed geometry not disposed on cache retirement' );

	} finally { atlas.dispose(); same( disposed, 0, 'atlas teardown retains source geometry' ); g.dispose(); material.dispose(); transparent.material.dispose(); noDepth.material.dispose(); r.dispose(); }

} );

Deno.test( 'off/invalid/unavailable/epoch/disposal flashlight captures clear readiness without rendering or modifying the existing point cube cache', () => {

	const g = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), source = {}, point = { source, position: [ 0, 0, 10 ], far: 200 };
	try {

		atlas.update( r, [ point ] ); same( atlas.lookup( source ).ready, true, 'independent static cube ready' ); const pointStatus = atlas.lookup( source ); atlas.updateSpot( r, beam );
		for ( const invalid of [ { ...beam, on: false }, { ...beam, pos: [ NaN, 0, 0 ] }, { ...beam, dir: [ 0, 0, 0 ] }, { ...beam, range: 1 }, { ...beam, outerCos: 0 }, { ...beam, outerCos: 1 }, { ...beam, outerCos: NaN } ] ) { const n = r.draws.length; atlas.updateSpot( r, invalid ); same( r.draws.length, n, 'invalid/off no draw' ); same( atlas.spotReady, false, 'invalid/off clears previous beam readiness' ); same( JSON.stringify( atlas.lookup( source ) ), JSON.stringify( pointStatus ), 'moving spot never damages static cube entry' ); }
		const empty = new PointShadowAtlas(); empty.updateSpot( r, beam ); same( empty.spotReady, false, 'no caster geometry keeps safe unavailable fallback' ); empty.dispose(); atlas.invalidate(); same( atlas.spotReady, false, 'epoch clears beam' ); atlas.dispose(); const n = r.draws.length; atlas.updateSpot( r, beam ); same( r.draws.length, n, 'disposed atlas never renders' );

	} finally { atlas.dispose(); g.dispose(); r.dispose(); }

} );
