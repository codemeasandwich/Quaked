// Four bounded actual GPU spotlight captures. No Quake entry/server or RAF.
const THREE = await import( 'three' );
const { PointShadowAtlas, SPOT_WORLD_SHADOW_GLSL, SPOT_SHADOW_SIZE } = await import( '../src/r_pointshadows.js' );
const W = 512, report = document.querySelector( '#report' ), button = document.querySelector( '#run' );
const renderer = new THREE.WebGLRenderer( { antialias: false, preserveDrawingBuffer: true } );
renderer.setPixelRatio( 2 ); renderer.setSize( W / 2, W / 2 ); renderer.setClearColor( 0, 0 );
const gl = renderer.getContext(), errors = [];
renderer.debug.onShaderError = ( context, program, vertex, fragment ) => errors.push( { program: context.getProgramInfoLog( program ), vertex: context.getShaderInfoLog( vertex ), fragment: context.getShaderInfoLog( fragment ) } );
window.addEventListener( 'error', event => errors.push( { message: event.message } ) );
window.addEventListener( 'unhandledrejection', event => errors.push( { rejection: String( event.reason ) } ) );
const camera = new THREE.OrthographicCamera( -12, 12, 12, -12, .1, 128 ); camera.position.set( 0, 0, 40 ); camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld();
const worldGeometry = new THREE.BoxGeometry( 2, 2, 2 ); worldGeometry.translate( 0, 0, 10 );
const actorGeometry = new THREE.BoxGeometry( 1.5, 1.5, 2 ), instanceGeometry = new THREE.BoxGeometry( 1, 1, 2 ), sourceMaterial = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } );
const worldReference = new THREE.Mesh( worldGeometry, sourceMaterial ), actor = new THREE.Mesh( actorGeometry, sourceMaterial ), instances = new THREE.InstancedMesh( instanceGeometry, sourceMaterial, 2 );
actor.position.set( 5, 2, 12 ); instances.setMatrixAt( 0, new THREE.Matrix4().makeTranslation( -2, -4, 14 ) ); instances.setMatrixAt( 1, new THREE.Matrix4().makeTranslation( 4, -3, 14 ) );
instances.instanceMatrix.needsUpdate = true;
const originals = new THREE.Group(); originals.add( worldReference, actor, instances ); originals.updateMatrixWorld( true );
const snapshots = { world: Array.from( worldGeometry.attributes.position.array ), actor: Array.from( actorGeometry.attributes.position.array ), instance: Array.from( instanceGeometry.attributes.position.array ), matrices: Array.from( instances.instanceMatrix.array ), actorMatrix: actor.matrixWorld.elements.slice() };
const atlas = new PointShadowAtlas( worldGeometry ), target = new THREE.WebGLRenderTarget( W, W, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
target.texture.colorSpace = THREE.NoColorSpace;
const uniforms = { tSpotShadow: { value: atlas.spotTexture }, uSpotShadowVP: { value: new THREE.Matrix4() }, uSpotShadowLightWorld: { value: new THREE.Vector4() }, uSpotWorldShadowOn: { value: 1 } };
const floorMaterial = new THREE.ShaderMaterial( { uniforms, toneMapped: false, depthTest: false, depthWrite: false,
	vertexShader: 'varying vec3 vWorld;void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}',
	fragmentShader: 'varying vec3 vWorld;\n#include <packing>\n' + SPOT_WORLD_SHADOW_GLSL + '\nvoid main(){gl_FragColor=vec4(vec3(spotWorldVisibility(vWorld)),1.);}' } );
const scene = new THREE.Scene(), floorGeometry = new THREE.PlaneGeometry( 24, 24 ); scene.add( new THREE.Mesh( floorGeometry, floorMaterial ) );
const phases = [ { name: 'offset A / world only', pos: [ 6, -4, 30 ], dynamic: false }, { name: 'offset A / world + actors', pos: [ 6, -4, 30 ], dynamic: true }, { name: 'offset B / world only', pos: [ 8, -4, 30 ], dynamic: false }, { name: 'offset B / world + actors', pos: [ 8, -4, 30 ], dynamic: true } ];
const raycaster = new THREE.Raycaster(), receivers = [ { name: 'world', center: [ 0, 0, 10 ] }, { name: 'actor', center: [ 5, 2, 12 ] }, { name: 'instance0', center: [ -2, -4, 14 ] }, { name: 'instance1', center: [ 4, -3, 14 ] } ];
function projectedReceiver( light, center ) { const t = light[ 2 ] / ( light[ 2 ] - center[ 2 ] ); return [ light[ 0 ] + t * ( center[ 0 ] - light[ 0 ] ), light[ 1 ] + t * ( center[ 1 ] - light[ 1 ] ), 0 ]; }
function pixelPosition( x, y ) { return new THREE.Vector3( ( x + .5 ) * 24 / W - 12, ( y + .5 ) * 24 / W - 12, 0 ); }
function atWorld( bytes, point ) { const x = Math.floor( ( point[ 0 ] + 12 ) * W / 24 ), y = Math.floor( ( point[ 1 ] + 12 ) * W / 24 ); if ( x < 0 || x >= W || y < 0 || y >= W ) throw new Error( 'receiver outside visible fixture' ); return bytes[ ( y * W + x ) * 4 ]; }
function oracle( point, phase, lightCamera ) {
	const clip = point.clone().project( lightCamera ); if ( Math.max( Math.abs( clip.x ), Math.abs( clip.y ), Math.abs( clip.z ) ) > 1 ) return false;
	const light = new THREE.Vector3( ...phase.pos ), delta = point.clone().sub( light ); raycaster.set( light, delta.clone().normalize() ); raycaster.near = 1; raycaster.far = delta.length() - 1;
	return raycaster.intersectObjects( phase.dynamic ? [ worldReference, actor, instances ] : [ worldReference ], false ).length > 0;
}
function exactState() { return { target: renderer.getRenderTarget(), viewport: renderer.getViewport( new THREE.Vector4() ).toArray().join(), scissor: renderer.getScissor( new THREE.Vector4() ).toArray().join(), scissorTest: renderer.getScissorTest(), physicalViewport: Array.from( gl.getParameter( gl.VIEWPORT ) ).join(), physicalScissor: Array.from( gl.getParameter( gl.SCISSOR_BOX ) ).join(), physicalScissorTest: gl.isEnabled( gl.SCISSOR_TEST ), color: renderer.getClearColor( new THREE.Color() ).toArray().join(), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, xr: renderer.xr.enabled }; }
async function run() {
	button.disabled = true; document.querySelector( '#views' ).replaceChildren(); report.textContent = 'Rendering four captures…'; const failures = [], results = [], images = []; let checks = 0;
	const check = ( condition, label ) => { checks ++; if ( ! condition ) failures.push( label ); };
	try {
		for ( const phase of phases ) {
			const dir = phase.pos.map( v => -v ), beam = { on: true, pos: phase.pos, dir, range: 96, outerCos: .9 };
			renderer.setRenderTarget( target ); const before = exactState(), captureBefore = atlas.status().spotCaptures;
			atlas.updateSpot( renderer, beam, phase.dynamic ? [ actor, instances ] : [] );
			check( atlas.spotReady && atlas.status().spotCaptures === captureBefore + 1, phase.name + ' exactly one actual capture ready' ); check( atlas.status().spotDynamicMeshes === ( phase.dynamic ? 2 : 0 ), phase.name + ' exact borrowed actor/instance count' );
			const after = exactState(); for ( const key of Object.keys( before ) ) check( after[ key ] === before[ key ], phase.name + ' actual DPR2 restore ' + key );
			check( Math.hypot( ...phase.pos.map( ( v, i ) => v - camera.position.toArray()[ i ] ) ) > 10, 'light source is offset from viewing camera' );
			uniforms.uSpotShadowVP.value.copy( atlas.spotVP ); uniforms.uSpotShadowLightWorld.value.set( ...phase.pos, 96 ); uniforms.uSpotWorldShadowOn.value = atlas.spotReady ? 1 : 0;
			renderer.clear(); renderer.render( scene, camera ); if ( errors.length ) throw new Error( 'Shader compilation failed: ' + JSON.stringify( errors[ 0 ] ) );
			const bytes = new Uint8Array( W * W * 4 ); renderer.readRenderTargetPixels( target, 0, 0, W, W, bytes ); images.push( bytes );
			const reference = new THREE.PerspectiveCamera( THREE.MathUtils.radToDeg( 2 * Math.acos( .9 ) ) + 2, 1, 1, 96 ); reference.position.fromArray( phase.pos ); reference.up.set( 0, 0, 1 ); reference.lookAt( 0, 0, 0 ); reference.updateMatrixWorld();
			let compared = 0, mismatches = 0, expectedDark = 0, measuredDark = 0, sumX = 0, sumY = 0;
			for ( let y = 4; y < W; y += 8 ) for ( let x = 4; x < W; x += 8 ) { const point = pixelPosition( x, y ), expected = oracle( point, phase, reference ); if ( [ [ .15, 0 ], [ -.15, 0 ], [ 0, .15 ], [ 0, -.15 ] ].some( d => oracle( point.clone().add( new THREE.Vector3( d[ 0 ], d[ 1 ], 0 ) ), phase, reference ) !== expected ) ) continue; const v = bytes[ ( y * W + x ) * 4 ]; compared ++; if ( expected ) { expectedDark ++; if ( v > 51 ) mismatches ++; } else if ( v < 204 ) mismatches ++; }
			for ( let y = 0; y < W; y ++ ) for ( let x = 0; x < W; x ++ ) if ( bytes[ ( y * W + x ) * 4 ] <= 51 ) { measuredDark ++; sumX += x; sumY += y; }
			check( compared > 3800 && expectedDark > 25, phase.name + ' nonvacuous whole-frame independent ray oracle' ); check( mismatches === 0, phase.name + ' actual visibility pixels match physical blocker rays: ' + mismatches ); check( measuredDark > 1500, phase.name + ' visible measured shadow area' );
			const probes = receivers.map( receiver => { const point = projectedReceiver( phase.pos, receiver.center ), value = atWorld( bytes, point ), shouldBlock = receiver.name === 'world' || phase.dynamic; check( shouldBlock ? value <= 51 : value >= 204, phase.name + ' ' + receiver.name + ' measured shadow=' + value ); return { name: receiver.name, point, value, expectedShadow: shouldBlock }; } );
			renderer.setRenderTarget( null ); renderer.render( scene, camera ); const figure = document.createElement( 'figure' ), img = document.createElement( 'img' ), caption = document.createElement( 'figcaption' ); img.src = renderer.domElement.toDataURL(); caption.textContent = phase.name; figure.append( img, caption ); document.querySelector( '#views' ).append( figure );
			const glError = gl.getError(); check( glError === gl.NO_ERROR, phase.name + ' GL error0' ); results.push( { ...phase, captures: atlas.status().spotCaptures, probes, compared, expectedDark, mismatches, measuredDark, shadowCentroid: [ sumX / measuredDark, sumY / measuredDark ], glError } );
		}
		for ( const base of [ 0, 2 ] ) { let actorShadowPixels = 0; for ( let i = 0; i < W * W; i ++ ) if ( images[ base ][ i * 4 ] >= 204 && images[ base + 1 ][ i * 4 ] <= 51 ) actorShadowPixels ++; check( actorShadowPixels > 2000, 'borrowed actor/instances add actual physical shadows at offset ' + base ); results[ base + 1 ].addedActorShadowPixels = actorShadowPixels; }
		const centroidShift = results[ 2 ].shadowCentroid[ 0 ] - results[ 0 ].shadowCentroid[ 0 ]; check( centroidShift < -8, 'moving offset source right shifts physical world shadow left' );
		check( snapshots.world.every( ( v, i ) => v === worldGeometry.attributes.position.array[ i ] ) && snapshots.actor.every( ( v, i ) => v === actorGeometry.attributes.position.array[ i ] ) && snapshots.instance.every( ( v, i ) => v === instanceGeometry.attributes.position.array[ i ] ), 'all borrowed geometry bytes unchanged' ); check( snapshots.matrices.every( ( v, i ) => v === instances.instanceMatrix.array[ i ] ) && snapshots.actorMatrix.every( ( v, i ) => v === actor.matrixWorld.elements[ i ] ), 'all original actor/instance transforms unchanged' ); check( actor.parent === originals && instances.parent === originals && actor.material === sourceMaterial, 'original actor scene/material ownership unchanged' );
		check( atlas.status().spotRenders === atlas.status().spotCaptures && SPOT_SHADOW_SIZE === W, 'one512 view per successful capture' ); check( errors.length === 0, 'no shader/runtime errors' );
	} catch ( error ) { failures.push( error.stack || String( error ) ); }
	finally { renderer.setRenderTarget( null ); button.disabled = false; }
	const evidence = { status: failures.length ? 'FAIL' : 'PASS', checks, failures, shaderErrors: errors, contract: 'Production spotlight capture + visibility shader, physical world + borrowed Mesh/InstancedMesh, actual GPU pixels; no game/compositor claim', size: [ W, W ], dpr: renderer.getPixelRatio(), cameraPosition: camera.position.toArray(), atlas: atlas.status(), results }; window.flashlightShadowEvidence = evidence; report.textContent = JSON.stringify( evidence, null, 2 ); return evidence;
}
button.addEventListener( 'click', run ); await run();
