// Public capture endpoints with real Three geometry/cameras and a recording
// renderer. These checks establish ownership/freshness/state, not GPU pixels.
import * as THREE from 'three';
import { PointShadowAtlas, POINT_SHADOW_SLOTS, NEAR_SUN_SHADOW_SIZE, NEAR_SUN_SHADOW_Y, NEAR_SUN_SHADOW_GLSL } from '../src/r_pointshadows.js';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( actual, expected, label ) => check( actual === expected, `${label}: ${actual} !== ${expected}` );
function geometry() { const g = new THREE.BufferGeometry(); g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ -16, -16, -32, 16, -16, -32, 0, 16, -32 ], 3 ) ); return g; }
function renderer() {
 const previous = new THREE.WebGLRenderTarget( 640, 400 );
 const r = { target: previous, face: 2, mip: 1, viewport: new THREE.Vector4( 7, 11, 280, 160 ), scissor: new THREE.Vector4( 3, 5, 240, 120 ), scissorTest: false, color: new THREE.Color( .1, .2, .3 ), alpha: .35, autoClear: true, xr: { enabled: true }, draws: [], clears: [], throwAt: Infinity };
 r.getRenderTarget = () => r.target; r.getActiveCubeFace = () => r.face; r.getActiveMipmapLevel = () => r.mip;
 r.getViewport = v => v.copy( r.viewport ); r.getScissor = v => v.copy( r.scissor ); r.getScissorTest = () => r.scissorTest;
 r.getClearColor = c => c.copy( r.color ); r.getClearAlpha = () => r.alpha;
 r.setViewport = v => { r.viewport.copy( v ); r.physicalViewport.copy( v ).multiplyScalar( 2 ); };
 r.setScissor = v => { r.scissor.copy( v ); r.physicalScissor.copy( v ).multiplyScalar( 2 ); };
 r.setScissorTest = v => { r.scissorTest = r.physicalScissorTest = v; };
 r.setClearColor = ( c, a = r.alpha ) => { r.color.set( c ); r.alpha = a; }; r.clear = () => r.clears.push( { target: r.target, scissor: r.physicalScissor.toArray(), scissorTest: r.physicalScissorTest } );
 r.setRenderTarget = ( t, face = 0, mip = 0 ) => { r.target = t; r.face = face; r.mip = mip; r.physicalViewport.copy( t ? t.viewport : r.viewport.clone().multiplyScalar( 2 ) ); r.physicalScissor.copy( t ? t.scissor : r.scissor.clone().multiplyScalar( 2 ) ); r.physicalScissorTest = t ? t.scissorTest : r.scissorTest; };
 r.render = ( scene, camera ) => {
  const children = scene.children.map( mesh => {
   mesh.onBeforeRender( r, scene, camera, mesh.geometry, mesh.material );
   return { mesh, geometry: mesh.geometry, matrix: mesh.matrixWorld.elements.slice(), instanceMatrix: mesh.instanceMatrix, vertex: mesh.geometry.getAttribute( 'position' ).getX( 0 ) };
  } );
  r.draws.push( { camera: camera.position.toArray(), cameraObject: camera.clone(), override: scene.overrideMaterial, children, viewport: r.physicalViewport.toArray() } );
  if ( r.draws.length === r.throwAt ) throw new Error( 'controlled point capture failure' );
 };
 r.physicalViewport = previous.viewport.clone(); r.physicalScissor = previous.scissor.clone(); r.physicalScissorTest = previous.scissorTest;
 r.dispose = () => previous.dispose(); return r;
}
function state( r ) { return { target: r.target, face: r.face, mip: r.mip, viewport: r.viewport.toArray().join(), scissor: r.scissor.toArray().join(), physicalViewport: r.physicalViewport.toArray().join(), physicalScissor: r.physicalScissor.toArray().join(), physicalScissorTest: r.physicalScissorTest, scissorTest: r.scissorTest, color: r.color.toArray().join(), alpha: r.alpha, autoClear: r.autoClear, xr: r.xr.enabled }; }
function restored( r, before ) { for ( const [ key, value ] of Object.entries( before ) ) same( state( r )[ key ], value, 'renderer restore ' + key ); }
const lights = count => Array.from( { length: count }, ( _, i ) => ( { source: {}, position: [ i * 12, 4, 8 ], far: 300 } ) );

Deno.test( 'static point captures keep one-cube budget while live transient sources refresh every selected slot within eight cubes', () => {
 const g = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), sources = lights( 8 ), before = state( r );
 try {
  atlas.update( r, sources ); same( atlas.status().ready, 1, 'static first update captures one cube' ); same( r.draws.length, 6, 'six static faces' );
  atlas.update( r, sources ); same( atlas.status().ready, 2, 'static next update captures another cube' );
  sources[ 7 ].live = true;
  let n = r.draws.length; atlas.update( r, sources ); same( r.draws.length - n, 48, 'short transient bypasses static queue' ); check( sources.every( s => atlas.lookup( s.source ).ready ), 'all current sources ready immediately' );
  sources[ 7 ].live = false; sources[ 7 ].source.live = true;
  sources[ 7 ].position = [ 6, 7, 9 ]; n = r.draws.length; atlas.update( r, sources ); same( r.draws.length - n, 48, 'same-identity live source recaptured next frame' );
  n = r.draws.length; atlas.update( r, [ ...sources, ...lights( 5 ) ] ); same( r.draws.length - n, POINT_SHADOW_SLOTS * 6, 'oversized caller remains eight cubes' ); same( atlas.status().resident, 8, 'bounded residency' ); restored( r, before );
 } finally { atlas.dispose(); g.dispose(); r.dispose(); }
} );

Deno.test( 'rejected nonphysical effects do not spend the live-caster refresh budget', () => {
 const g = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), sources = lights( 2 ), effect = new THREE.Mesh( g, new THREE.MeshBasicMaterial( { transparent: true } ) );
 try {
  atlas.update( r, sources, [ effect ] ); same( atlas.status().pointDynamicMeshes, 0, 'transparent effect rejected' ); same( r.draws.length, 6, 'static-only one cube budget retained' );
  atlas.update( r, sources, [ effect ] ); same( r.draws.length, 12, 'second static cube populated' );
  atlas.update( r, sources, [ effect ] ); same( r.draws.length, 12, 'no live caster means cached static captures retained' );
 } finally { atlas.dispose(); g.dispose(); effect.material.dispose(); r.dispose(); }
} );

Deno.test( 'explicit physical alias tag admits transparent sorting but never decorative, hidden or non-depth-writing effects', () => {
 const g = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), sources = lights( 1 );
 const glass = new THREE.MeshBasicMaterial( { transparent: true } ), noDepthMaterial = new THREE.MeshBasicMaterial( { transparent: true, depthWrite: false } );
 const pickup = new THREE.Mesh( g, glass ), decoration = new THREE.Mesh( g, glass ), hidden = new THREE.Mesh( g, glass ), noDepth = new THREE.Mesh( g, noDepthMaterial );
 for ( const mesh of [ pickup, hidden, noDepth ] ) mesh.userData.quakePhysicalAlias = true;
 hidden.visible = false; pickup.position.set( 9, 10, 11 ); pickup.updateMatrixWorld();
 try {
  atlas.update( r, sources, [ pickup, decoration, hidden, noDepth ] ); same( atlas.status().pointDynamicMeshes, 1, 'only physical depth-writing visible alias admitted' );
  const clones = r.draws[ 0 ].children.filter( entry => entry.mesh.name === 'quake_flashlight_borrowed_caster' ); same( clones.length, 1, 'one actual alias caster' ); same( clones[ 0 ].matrix.join(), pickup.matrixWorld.elements.join(), 'physical pickup transform captured' ); same( pickup.material, glass, 'authored glass material unchanged' ); same( glass.transparent, true, 'source transparency preserved' );
  atlas.updateSpot( r, { on: true, pos: [ 0, 0, 8 ], dir: [ 0, 0, -1 ], range: 300, outerCos: .92 }, [ pickup, decoration, hidden, noDepth ] ); same( atlas.status().spotDynamicMeshes, 1, 'same eligibility policy in flashlight capture' );
 } finally { atlas.dispose(); g.dispose(); glass.dispose(); noDepthMaterial.dispose(); r.dispose(); }
} );

Deno.test( 'current actor, brush and held geometry is borrowed without source callbacks, filtered and refreshed after movement or pose mutation', () => {
 const world = geometry(), actorGeometry = geometry(), material = new THREE.MeshBasicMaterial(), heldMaterial = new THREE.MeshBasicMaterial( { transparent: true } ); heldMaterial.userData.quakeViewmodel = true;
 const actor = new THREE.Mesh( actorGeometry, material ), held = new THREE.Mesh( actorGeometry, heldMaterial ), group = new THREE.Group(); group.add( actor, held ); group.position.set( 11, 12, 13 ); group.updateMatrixWorld( true );
 const effect = new THREE.Mesh( actorGeometry, new THREE.MeshBasicMaterial( { transparent: true } ) ), noDepth = new THREE.Mesh( actorGeometry, new THREE.MeshBasicMaterial( { depthWrite: false } ) ), hiddenGroup = new THREE.Group(), hidden = new THREE.Mesh( actorGeometry, material ); hiddenGroup.visible = false; hiddenGroup.add( hidden );
 actor.onBeforeRender = held.onBeforeRender = () => { throw new Error( 'must not call source depthRange hooks' ); };
 const atlas = new PointShadowAtlas( world ), r = renderer(), sources = lights( 2 ), before = state( r ); let disposed = 0; actorGeometry.addEventListener( 'dispose', () => disposed ++ );
 try {
  atlas.update( r, sources, [ actor, actor, held, effect, noDepth, hidden ] ); same( atlas.status().pointDynamicMeshes, 2, 'only two eligible unique solids' ); same( r.draws.length, 12, 'every selected cube current' );
  const borrowed = r.draws[ 0 ].children.filter( x => x.geometry === actorGeometry ); same( borrowed.length, 2, 'actor and held mesh both captured' ); same( borrowed[ 0 ].matrix.join(), actor.matrixWorld.elements.join(), 'actual world pose' ); same( atlas.scene.children.length, atlas.chunks.length, 'clones leave private scene after capture' ); same( actor.parent, group, 'source ownership retained' ); same( held.material, heldMaterial, 'held material unchanged' );
  actor.position.x = 25; group.updateMatrixWorld( true ); actorGeometry.attributes.position.setX( 0, -27 );
  const n = r.draws.length, revision = atlas.status().pointGeometryRevision; atlas.update( r, sources, [ actor, held ] ); same( r.draws.length - n, 12, 'moving models force fresh cubes' ); check( atlas.status().pointGeometryRevision > revision, 'geometry revision advanced' );
  const latest = r.draws[ n ].children.find( x => x.geometry === actorGeometry ); same( latest.vertex, -27, 'mutated current alias pose used' ); same( latest.matrix.join(), actor.matrixWorld.elements.join(), 'current actor transform used' ); restored( r, before );
  atlas.invalidate(); same( disposed, 0, 'borrowed geometry never disposed by atlas' );
 } finally { atlas.dispose(); same( disposed, 0, 'dispose preserves borrowed geometry' ); world.dispose(); actorGeometry.dispose(); material.dispose(); heldMaterial.dispose(); effect.material.dispose(); noDepth.material.dispose(); r.dispose(); }
} );

Deno.test( 'caster disappearance invalidates unselected cubes and failed captures cannot expose old poses; every exit restores render state', () => {
 const g = geometry(), actor = new THREE.Mesh( g, new THREE.MeshBasicMaterial() ), atlas = new PointShadowAtlas( g ), r = renderer(), sources = lights( 2 ), before = state( r ); actor.updateMatrixWorld();
 try {
  atlas.update( r, sources, [ actor ] ); check( sources.every( s => atlas.lookup( s.source ).ready ), 'initial model cubes ready' );
  const n = r.draws.length; atlas.update( r, [ sources[ 0 ] ], [] ); same( r.draws.length - n, 6, 'disappearance refreshes selected cube' ); same( atlas.lookup( sources[ 1 ].source ).ready, false, 'unselected old-model capture invalidated' ); same( r.draws.at( -1 ).children.length, atlas.chunks.length, 'no disappeared actor retained' );
  atlas.update( r, sources, [] ); same( atlas.lookup( sources[ 1 ].source ).ready, true, 'returning light captures current static geometry' );
  r.throwAt = r.draws.length + 2; atlas.update( r, sources, [ actor ] ); same( atlas.lookup( sources[ 0 ].source ).ready, false, 'partially failed cube unavailable' ); same( atlas.lookup( sources[ 1 ].source ).ready, true, 'other current cube may still succeed' ); check( atlas.status().error.includes( 'controlled point capture failure' ), 'failure remains visible despite later success' ); same( atlas.scene.children.length, atlas.chunks.length, 'failed capture removes borrowed actors' ); restored( r, before );
  atlas.update( null, sources, [ actor ] ); check( sources.every( s => ! atlas.lookup( s.source ).ready ), 'no renderer cannot advertise old dynamic captures' );
  r.throwAt = Infinity; atlas.update( r, sources, [ actor ] ); check( sources.every( s => atlas.lookup( s.source ).ready ), 'next complete frame recovers' ); same( atlas.status().error, null, 'successful recovery clears error' );
  atlas.update( r, [ { ...sources[ 0 ], position: [ NaN, 0, 0 ] } ], [ actor ] ); same( atlas.lookup( sources[ 0 ].source ).ready, false, 'invalid source pose unavailable' ); restored( r, before );
 } finally { atlas.dispose(); g.dispose(); actor.material.dispose(); r.dispose(); }
} );

Deno.test( 'point and spot captures share current instance data without owning its geometry or instance buffers', () => {
 const g = geometry(), material = new THREE.MeshBasicMaterial(), instances = new THREE.InstancedMesh( g, material, 2 ), atlas = new PointShadowAtlas(), r = renderer(), source = lights( 1 );
 instances.setMatrixAt( 0, new THREE.Matrix4().makeTranslation( 3, 4, 5 ) ); instances.updateMatrixWorld(); const instanceMatrix = instances.instanceMatrix;
 let disposed = 0; g.addEventListener( 'dispose', () => disposed ++ );
 try {
  atlas.update( r, source, [ instances ] ); same( atlas.lookup( source[ 0 ].source ).ready, true, 'dynamic-only cube works without world chunks' ); same( r.draws[ 0 ].children[ 0 ].instanceMatrix, instanceMatrix, 'instance transform attribute borrowed' );
  atlas.updateSpot( r, { on: true, pos: [ 0, 0, 8 ], dir: [ 0, 0, -1 ], range: 300, outerCos: .92 }, [ instances ] ); same( atlas.spotReady, true, 'same helper retains spot capture' ); same( atlas.scene.children.length, 0, 'both endpoints detach clones' );
  atlas.invalidate(); same( instances.instanceMatrix, instanceMatrix, 'source instance buffer unchanged' ); same( disposed, 0, 'invalidation never disposes source geometry' );
 } finally { atlas.dispose(); same( disposed, 0, 'disposal never disposes source geometry' ); g.dispose(); material.dispose(); r.dispose(); }
} );

Deno.test( 'near sun captures one focused orthographic view with current physical models, exact projection and ordinary callback-free depth', () => {
 const g = geometry(), actorGeometry = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), before = state( r );
 const heldMaterial = new THREE.MeshBasicMaterial( { transparent: true } ); heldMaterial.userData.quakeViewmodel = true;
 const held = new THREE.Mesh( actorGeometry, heldMaterial ), parent = new THREE.Group(); parent.add( held ); parent.position.set( 13, -21, 8 ); held.position.set( 3, 4, 5 ); parent.updateMatrixWorld( true );
 held.onBeforeRender = () => { throw new Error( 'held raster depth callback must not run in sun capture' ); };
 const focus = [ 100, -80, 40 ];
 try {
  for ( const direction of [ [ .3, -.4, .8 ], [ 0, 0, 1 ], [ 0, 0, -1 ] ] ) {
   const n = r.draws.length; atlas.updateSun( r, { on: true, direction, focus }, [ held ] ); same( r.draws.length - n, 1, 'one bounded sun draw' ); same( atlas.sunReady, true, 'current sun capture ready' ); same( atlas.status().sunDynamicMeshes, 1, 'held model admitted' );
   const draw = r.draws.at( -1 ); same( draw.viewport.join(), [ 0, NEAR_SUN_SHADOW_Y, NEAR_SUN_SHADOW_SIZE, NEAR_SUN_SHADOW_SIZE ].join(), 'reserved physical512 viewport unaffected by DPR2' );
   check( draw.cameraObject.isOrthographicCamera, 'directional projection is orthographic' ); check( draw.override.fragmentShader.includes( 'packDepthToRGBA(gl_FragCoord.z)' ), 'directional depth uses projected depth, not radial distance' );
   const expected = new THREE.OrthographicCamera( -96, 96, 96, -96, .1, 512 ), axis = new THREE.Vector3( ...direction ).normalize(); expected.position.set( ...focus ).addScaledVector( axis, 256 ); expected.up.set( 0, 0, 1 ); if ( Math.abs( axis.z ) > .99 ) expected.up.set( 0, 1, 0 ); expected.lookAt( ...focus ); expected.updateMatrixWorld();
   for ( const delta of [ [ 0, 0, 0 ], [ 13, 7, -2 ], [ -31, 6, 24 ] ] ) {
    const world = new THREE.Vector3( ...focus ).add( new THREE.Vector3( ...delta ) ), projected = world.clone().project( expected ), actual = new THREE.Vector4( world.x, world.y, world.z, 1 ).applyMatrix4( atlas.sunVP );
    for ( const k of [ 'x', 'y', 'z' ] ) check( Math.abs( actual[ k ] / actual.w - projected[ k ] ) < 1e-9, 'independent focus projection ' + k );
   }
   const borrowed = draw.children.find( child => child.geometry === actorGeometry ); check( borrowed, 'held geometry drawn' ); same( borrowed.matrix.join(), held.matrixWorld.elements.join(), 'native held world transform retained' ); same( held.parent, parent, 'source ownership retained' ); same( atlas.scene.overrideMaterial, null, 'capture override removed' ); same( atlas.scene.children.length, atlas.chunks.length, 'borrowed casters detached' ); restored( r, before );
  }
  same( atlas.sunTexture, atlas.texture, 'sun and point data share one sampler texture' ); same( atlas.target.width, 768, 'point faces retain original horizontal arrangement' ); same( atlas.target.height, 1536, 'eight point rows plus reserved sun region' );
  same( atlas.sunTexture.colorSpace, THREE.NoColorSpace, 'depth texture has no colour transform' ); same( atlas.sunTexture.type, THREE.UnsignedByteType, 'packed directional depth format' ); check( !NEAR_SUN_SHADOW_GLSL.includes( 'uniform sampler2D' ), 'focused sun adds no fragment sampler' );
 } finally { atlas.dispose(); g.dispose(); actorGeometry.dispose(); heldMaterial.dispose(); r.dispose(); }
} );

Deno.test( 'near sun rejects invalid scopes and hidden/effect casters, clears stale captures on failure and disposes only its own resources', () => {
 const g = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), before = state( r ), material = new THREE.MeshBasicMaterial(), actor = new THREE.Mesh( g, material ); actor.updateMatrixWorld();
 const hidden = new THREE.Mesh( g, material ), decoration = new THREE.Mesh( g, new THREE.MeshBasicMaterial( { transparent: true } ) ); hidden.visible = false;
 const sun = { on: true, direction: [ .3, -.4, .8 ], focus: [ 1, 2, 3 ] }; let sourceDisposals = 0, targetDisposals = 0, materialDisposals = 0;
 g.addEventListener( 'dispose', () => sourceDisposals ++ ); atlas.sunTarget.addEventListener( 'dispose', () => targetDisposals ++ ); atlas.sunMaterial.addEventListener( 'dispose', () => materialDisposals ++ );
 try {
  atlas.updateSun( r, sun, [ actor, actor, hidden, decoration ] ); same( atlas.status().sunDynamicMeshes, 1, 'only unique eligible actor' );
  r.throwAt = r.draws.length + 1; atlas.updateSun( r, sun, [ actor ] ); same( atlas.sunReady, false, 'failed new capture never exposes previous sun pose' ); same( atlas.status().sunFailedCaptures, 1, 'failure accounted' ); check( atlas.status().sunError.includes( 'controlled point capture failure' ), 'failure diagnostic retained' ); same( atlas.scene.overrideMaterial, null, 'failed capture clears material override' ); same( atlas.scene.children.length, atlas.chunks.length, 'failed capture removes borrowed casters' ); restored( r, before );
  r.throwAt = Infinity; atlas.updateSun( r, sun, [ actor ] ); same( atlas.sunReady, true, 'successful retry ready' ); same( atlas.status().sunError, null, 'successful retry clears error' );
  for ( const invalid of [ { ...sun, on: false }, { ...sun, direction: [ 0, 0, 0 ] }, { ...sun, direction: [ NaN, 0, 1 ] }, { ...sun, focus: [ 0, Infinity, 0 ] }, null ] ) {
   const n = r.draws.length; atlas.updateSun( r, invalid, [ actor ] ); same( atlas.sunReady, false, 'invalid/off clears readiness' ); same( r.draws.length, n, 'invalid/off never renders' );
  }
  atlas.updateSun( null, sun, [ actor ] ); same( atlas.sunReady, false, 'missing renderer is unavailable' );
  const empty = new PointShadowAtlas(); empty.updateSun( r, sun, [] ); same( empty.sunReady, false, 'no geometry remains safe unavailable' ); empty.dispose();
  atlas.updateSun( r, sun, [ actor ] ); atlas.invalidate(); same( atlas.sunReady, false, 'map epoch invalidates focused sun' );
  atlas.dispose(); atlas.dispose(); same( targetDisposals, 1, 'near target disposed once' ); same( materialDisposals, 1, 'near shader disposed once' ); same( sourceDisposals, 0, 'native geometry never disposed' );
  const n = r.draws.length; atlas.updateSun( r, sun, [ actor ] ); same( r.draws.length, n, 'disposed atlas does not render' ); restored( r, before );
 } finally { atlas.dispose(); g.dispose(); material.dispose(); decoration.material.dispose(); r.dispose(); }
} );

Deno.test( 'shared shadow atlas point and focused sun captures clear only their nonoverlapping reserved rectangles', () => {
 const g = geometry(), atlas = new PointShadowAtlas( g ), r = renderer(), sources = lights( 8 ), before = state( r ); sources[ 0 ].live = true;
 try {
  atlas.update( r, sources ); const pointClears = r.clears.slice(); same( pointClears.length, 48, 'all point faces captured' );
  for ( const clear of pointClears ) { same( clear.target, atlas.target, 'point target shared' ); same( clear.scissorTest, true, 'point clears scissored' ); const [x,y,w,h] = clear.scissor; check( x >= 0 && x+w <= 768 && y >= 0 && y+h <= 1024 && w === 128 && h === 128, 'point face clear cannot enter focused sun region' ); }
  atlas.updateSun( r, { on: true, direction: [ 0, 0, 1 ], focus: [ 0, 0, 0 ] } ); const clear = r.clears.at( -1 ); same( clear.target, atlas.target, 'sun uses same target' ); same( clear.scissorTest, true, 'sun clear scissored' ); same( clear.scissor.join(), '0,1024,512,512', 'sun clear cannot touch any point face' );
  check( sources.every( source => atlas.lookup( source.source ).ready ), 'sun capture preserves point readiness' ); same( atlas.sunReady, true, 'sun ready' );
  atlas.update( r, sources ); same( atlas.sunReady, true, 'subsequent point captures preserve focused sun readiness' ); restored( r, before );
 } finally { atlas.dispose(); g.dispose(); r.dispose(); }
} );
