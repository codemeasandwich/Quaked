// Public capture/state coverage with real Three objects and a recording renderer.
// No GPU/pixel claim: logical viewport defaults and physical RT state deliberately
// differ, reproducing the DPR/dynamic-resolution crop that a flat fake misses.
import * as THREE from 'three';
import { R_AnimSetNewer, R_IsNewer } from '../src/r_anim.js';
import { R_RendVeilSeen, R_RendVeilClear, R_RendVeilCapture, R_RendVeilFields, R_RendVeilBackgroundDepth, R_RendVeilLights, R_RendVeilShadowVersion } from '../src/r_rendveil.js';
import { R_CreateShadowCaptureMaterial } from '../src/r_pointshadows.js';
import { RV_SURFACE_DECL, RV_VERTEX_BIND, RV_FRAGMENT_MASK, RV_REVEAL_VERTEX } from '../src/rend_veil/material-binding.js';
import { OPTICS_FRAGMENT } from '../src/rend_veil/optics-shader.js';

const check = ( value, why ) => { if ( ! value ) throw Error( why ); };
const same = ( actual, expected, why ) => check( actual === expected, `${why}: ${actual} !== ${expected}` );
const vector = ( actual, expected, why ) => same( actual.toArray().join(), expected.toArray().join(), why );
const near = ( actual, expected, why ) => check( Math.abs( actual - expected ) < 1e-9, `${why}: ${actual} != ${expected}` );
const nearPoint = ( actual, expected, why ) => { for ( const axis of [ 'x', 'y', 'z' ] ) near( actual[ axis ], expected[ axis ], why + ':' + axis ); };

// Model the WebGL blend factors selected by the actual public materials, not
// source colour or geometry. This exposes metadata corruption even though this
// fixture does not compile GLSL or perform GPU framebuffer writes.
function blendPacket( material, source, destination ) {
	const factor = value => {
		if ( value === THREE.ZeroFactor ) return 0;
		if ( value === THREE.OneFactor ) return 1;
		if ( value === THREE.SrcAlphaFactor ) return source[ 3 ];
		if ( value === THREE.OneMinusSrcAlphaFactor ) return 1 - source[ 3 ];
		throw Error( 'unsupported blend factor in receiver-data fixture' );
	};
	let rgbSource, rgbDestination, alphaSource, alphaDestination;
	if ( material.blending === THREE.AdditiveBlending ) {
		rgbSource = alphaSource = source[ 3 ]; rgbDestination = alphaDestination = 1;
	} else {
		same( material.blending, THREE.CustomBlending, 'ink uses separate custom colour/metadata blending' );
		same( material.blendEquation, THREE.AddEquation, 'colour equation is additive weighted blending' );
		same( material.blendEquationAlpha, THREE.AddEquation, 'metadata alpha equation is additive weighted blending' );
		rgbSource = factor( material.blendSrc ); rgbDestination = factor( material.blendDst );
		alphaSource = factor( material.blendSrcAlpha ); alphaDestination = factor( material.blendDstAlpha );
	}
	return destination.map( ( value, i ) => source[ i ] * ( i === 3 ? alphaSource : rgbSource ) + value * ( i === 3 ? alphaDestination : rgbDestination ) );
}

function inkContract( material ) {
	same( material.blendSrc, THREE.SrcAlphaFactor, 'ink colour uses source coverage' ); same( material.blendDst, THREE.OneMinusSrcAlphaFactor, 'ink colour attenuates covered destination' );
	same( material.blendSrcAlpha, THREE.ZeroFactor, 'source coverage cannot replace receiver metadata alpha' ); same( material.blendDstAlpha, THREE.OneFactor, 'destination metadata alpha is retained' );
	const normal = [ .25, .50, .75, -137.5 ], mask = [ 1, .4, .2, 129 / 255 ], albedo = [ .8, .4, .2, .06 ];
	same( blendPacket( material, [ 0, 0, 0, 0 ], normal ).join(), normal.join(), 'zero-alpha output preserves signed native depth and normal RGB' );
	same( blendPacket( material, [ 0, 0, 0, 0 ], mask ).join(), mask.join(), 'zero-alpha output preserves packed visibility mask and tag' );
	const darkened = blendPacket( material, [ 0, 0, 0, .4 ], albedo );
	for ( let i = 0; i < 3; i ++ ) near( darkened[ i ], albedo[ i ] * .6, 'ink darkens only covered albedo RGB' );
	same( darkened[ 3 ], albedo[ 3 ], 'albedo receiver class tag survives nonzero ink coverage' );
}

function recordingRenderer( target ) {
	const r = { target, face: 2, mip: 1, autoClear: false, dpr: 2, test: true,
		viewport: new THREE.Vector4( 19, 23, 720, 400 ), scissor: new THREE.Vector4( 11, 17, 600, 320 ),
		physicalViewport: target.viewport.clone(), physicalScissor: target.scissor.clone(), physicalTest: target.scissorTest,
		draws: [], fail: false };
	r.getRenderTarget = () => r.target; r.getActiveCubeFace = () => r.face; r.getActiveMipmapLevel = () => r.mip;
	r.getViewport = value => value.copy( r.viewport ); r.getScissor = value => value.copy( r.scissor ); r.getScissorTest = () => r.test;
	r.setViewport = value => { r.viewport.copy( value ); r.physicalViewport.copy( value ).multiplyScalar( r.dpr ); };
	r.setScissor = value => { r.scissor.copy( value ); r.physicalScissor.copy( value ).multiplyScalar( r.dpr ); };
	r.setScissorTest = value => { r.test = r.physicalTest = value; };
	r.setRenderTarget = ( value, face = 0, mip = 0 ) => {
		r.target = value; r.face = face; r.mip = mip;
		r.physicalViewport.copy( value ? value.viewport : r.viewport.clone().multiplyScalar( r.dpr ) );
		r.physicalScissor.copy( value ? value.scissor : r.scissor.clone().multiplyScalar( r.dpr ) );
		r.physicalTest = value ? value.scissorTest : r.test;
	};
	r.render = scene => {
		r.draws.push( { target: r.target, viewport: r.physicalViewport.clone(),
			hidden: scene.children.filter( object => object.name === 'capture subject' || object.userData.rendVeilVisualOnly || object.name === 'Rend the Veil / destination' ).map( object => object.visible ) } );
		if ( r.fail ) throw Error( 'intentional capture renderer failure' );
	};
	return r;
}

function fixture( run, initialAge = .9, dimensions = [ 16, 16, 52 ], model = 'progs/ogre.mdl' ) {
	const oldDocument = globalThis.document, oldNewer = R_IsNewer();
	const context = new Proxy( {}, { get: ( object, key ) => key in object ? object[ key ] : () => {} } );
	globalThis.document = { createElement: () => ( { width: 0, height: 0, getContext: () => context } ) };
	const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 75, 1.6, 1, 2048 );
	const geometry = new THREE.BoxGeometry( ...dimensions ), material = new THREE.MeshBasicMaterial();
	const origin = [ 128, 64, dimensions[ 2 ] / 2 ];
	const mesh = new THREE.Mesh( geometry, material ); mesh.name = 'capture subject'; mesh.position.set( ...origin ); scene.add( mesh );
	const entity = { model: { name: model }, _rendVeil: { start: 0, model, origin }, _rendVeilTime: initialAge };
	mesh._quakeOwner = entity; scene.updateMatrixWorld( true );
	const originalScale = mesh.scale.clone(), originalMatrix = mesh.matrixWorld.clone();
	const positions = geometry.getAttribute( 'position' );
	const originalWorldVertices = Array.from( { length: positions.count }, ( _, i ) => new THREE.Vector3().fromBufferAttribute( positions, i ).applyMatrix4( originalMatrix ) );
	const target = new THREE.WebGLRenderTarget( 640, 360, { count: 4, depthBuffer: true, type: THREE.HalfFloatType } );
	target.depthTexture = new THREE.DepthTexture( 640, 360 );
	const renderer = recordingRenderer( target );
	try {
		R_AnimSetNewer( true ); R_RendVeilSeen( entity, mesh, scene );
		same( R_RendVeilFields().length, 1, 'public invocation has one live optical field' );
		run( { scene, camera, mesh, entity, geometry, target, renderer, originalMaterial: material, originalScale, originalMatrix, originalWorldVertices } );
	} finally {
		R_RendVeilClear(); R_AnimSetNewer( oldNewer ); globalThis.document = oldDocument;
		target.depthTexture.dispose(); target.dispose(); geometry.dispose(); material.dispose();
	}
}

function verifyRestored( scene, mesh, target, renderer, visibleBefore ) {
	same( renderer.target, target, 'native HDR target restored' ); same( renderer.face, 2, 'active face restored' ); same( renderer.mip, 1, 'mip restored' );
	vector( renderer.viewport, new THREE.Vector4( 19, 23, 720, 400 ), 'logical viewport default restored' );
	vector( renderer.scissor, new THREE.Vector4( 11, 17, 600, 320 ), 'logical scissor default restored' );
	vector( renderer.physicalViewport, target.viewport, 'physical HDR rectangle survives DPR2 and offset defaults' );
	vector( renderer.physicalScissor, target.scissor, 'physical HDR scissor survives offset defaults' );
	same( renderer.test, true, 'logical scissor test restored' ); same( renderer.physicalTest, target.scissorTest, 'target owns physical scissor test' );
	same( renderer.autoClear, false, 'auto-clear restored' ); same( mesh.visible, true, 'existing subject visible after background capture' );
	scene.children.forEach( object => same( object.visible, visibleBefore.get( object ), 'subject/local/ghost visibility restored' ) );
	const draw = renderer.draws.at( -1 ); check( draw.target !== target, 'background capture uses another target' );
	vector( draw.viewport, draw.target.viewport, 'background draw uses its full physical rectangle' );
	check( draw.hidden.length >= 2 && draw.hidden.every( visible => visible === false ), 'subject and visual layers hidden during actual public capture' );
	same( R_RendVeilBackgroundDepth(), draw.target.depthTexture, 'public depth binding is the actual capture depth' );
}

Deno.test( 'public Rend background capture restores physical HDR viewport at DPR2 with offset logical defaults', () => fixture( ( { scene, camera, mesh, target, renderer } ) => {
	const visibleBefore = new Map( scene.children.map( object => [ object, object.visible ] ) );
	R_RendVeilCapture( renderer, scene, camera );
	same( renderer.draws.length, 1, 'one public background draw' ); verifyRestored( scene, mesh, target, renderer, visibleBefore );
} ) );

Deno.test( 'public Rend background capture restores visibility/state after render failure and can capture again', () => fixture( ( { scene, camera, mesh, target, renderer } ) => {
	const visibleBefore = new Map( scene.children.map( object => [ object, object.visible ] ) ); renderer.fail = true;
	let caught = null; try { R_RendVeilCapture( renderer, scene, camera ); } catch ( error ) { caught = error; }
	same( caught?.message, 'intentional capture renderer failure', 'capture failure retained rather than hidden' );
	verifyRestored( scene, mesh, target, renderer, visibleBefore );
	renderer.fail = false; R_RendVeilCapture( renderer, scene, camera );
	same( renderer.draws.length, 2, 'capture guard retires after failure' ); verifyRestored( scene, mesh, target, renderer, visibleBefore );
} ) );

Deno.test( 'public Rend doubles destination FX while preserving native body vertices and finite dim light reach', () => fixture( ( { mesh, geometry, originalScale, originalMatrix, originalWorldVertices } ) => {
	const field = R_RendVeilFields()[ 0 ]; near( field.scale, 20, '52-unit native height gives doubled 20-unit FX frame' );
	vector( mesh.scale, originalScale, 'native mesh scale is unchanged' ); same( mesh.matrixWorld.elements.join(), originalMatrix.elements.join(), 'native model world transform is unchanged' );
	const positions = geometry.getAttribute( 'position' ), measured = new THREE.Box3();
	originalWorldVertices.forEach( ( world, i ) => {
		nearPoint( new THREE.Vector3().fromBufferAttribute( positions, i ).applyMatrix4( mesh.matrixWorld ), world, 'actual native world vertex preserved' );
		measured.expandByPoint( world.clone().applyMatrix4( field.toReference ) );
	} );
	// The supplied binding adds .10 conservative body units. The doubled FX
	// frame must halve that padding along with the measured actual body bounds.
	const padded = measured.clone().expandByScalar( .05 );
	nearPoint( field.subjectBounds.min, padded.min, 'body lower bounds and padding measured in destination FX coordinates' );
	nearPoint( field.subjectBounds.max, padded.max, 'body upper bounds and padding measured in destination FX coordinates' );
	nearPoint( measured.getSize( new THREE.Vector3() ), new THREE.Vector3( .8, 2.6, .8 ), 'native body occupies half-size canonical FX bounds' );
	const again = R_RendVeilFields()[ 0 ]; nearPoint( again.subjectBounds.getSize( new THREE.Vector3() ), new THREE.Vector3( .9, 2.7, .9 ), 'public padded bounds reads never cumulatively rescale the subject' );
	const light = R_RendVeilLights()[ 0 ]; check( light, 'appearance publishes its native destination light' );
	near( light.range, 84, 'finite light reach is 4.2 source units in doubled FX frame' );
	nearPoint( new THREE.Vector3( ...light.origin ), new THREE.Vector3( 128, 64, 24 ), 'actual source emitter transforms through destination FX frame' );
	check( Number.isFinite( light.power ) && light.power > 0 && light.power < .1, 'non-rune native light is finite and subdued at age .9' );
} ) );

Deno.test( 'public shadow capture keeps full-size body coordinates and clock uniforms distinct from doubled FX', () => fixture( ( { mesh, entity, geometry, scene, camera, renderer, originalWorldVertices } ) => {
	const material = R_CreateShadowCaptureMaterial( 'void main(){gl_FragColor=vec4(1.);}' );
	const caster = new THREE.Mesh( geometry, material ); caster.userData.rendVeilSource = mesh;
	caster.matrixAutoUpdate = false; caster.matrix.copy( mesh.matrixWorld ); caster.matrixWorld.copy( mesh.matrixWorld );
	try {
		material.onBeforeRender( renderer, scene, camera, geometry, caster );
		const u = material.uniforms, key = material.customProgramCacheKey(), canonical = new THREE.Box3(), positions = geometry.getAttribute( 'position' );
		check( u.uRVEffectFromModel.value.isMatrix4 && u.uRVModelFromEffect.value.isMatrix4, 'capture uses actual Three canonical matrix uniforms' );
		check( u.uRVMagic.value.isColor && typeof u.uRVTime.value === 'number', 'capture binds shader colour and scalar types' );
		near( u.uRVTime.value, .9, 'first capture gets current clock before shader compilation' ); near( u.uRVProgress.value, .352, 'body reveal uses appearance clock' );
		check( u.uRVSurfaceEffect.value > 0, 'same current body coating reaches shadow capture' ); same( u.uRVGhost.value, -1, 'physical caster is not a ghost' );
		originalWorldVertices.forEach( ( world, i ) => {
			const body = new THREE.Vector3().fromBufferAttribute( positions, i ).applyMatrix4( u.uRVEffectFromModel.value ); canonical.expandByPoint( body );
			nearPoint( body.clone().applyMatrix4( u.uRVModelFromEffect.value ).applyMatrix4( caster.matrixWorld ), world, 'canonical shadow transform round-trips actual native vertex' );
		} );
		nearPoint( canonical.getSize( new THREE.Vector3() ), new THREE.Vector3( 1.6, 5.2, 1.6 ), 'shadow reveal uses full-size original body frame' );
		near( R_RendVeilShadowVersion( mesh ), .9, 'cache qualification includes current reveal clock' );
		entity._rendVeilTime = 1.4; R_RendVeilSeen( entity, mesh, scene ); material.onBeforeRender( renderer, scene, camera, geometry, caster );
		near( u.uRVTime.value, 1.4, 'same capture uniforms refresh after clock advance' ); near( R_RendVeilShadowVersion( mesh ), 1.4, 'cache version changes despite unchanged posed geometry' );
		same( material.customProgramCacheKey(), key, 'clock advances uniforms rather than creating a different capture program' );
		entity._rendVeilTime = 2.5; R_RendVeilSeen( entity, mesh, scene ); material.onBeforeRender( renderer, scene, camera, geometry, caster );
		near( u.uRVProgress.value, 1, 'Focus casts complete opaque native body' ); near( u.uRVSurfaceEffect.value, 0, 'Focus clears temporary shadow coating' ); near( R_RendVeilShadowVersion( mesh ), 0, 'Focus retires reveal cache clock' );
	} finally { material.dispose(); }
} ) );

Deno.test( 'public local ink preserves receiver metadata while rune letters keep additive colour-only output', () => fixture( ( { scene } ) => {
	const group = scene.children.find( object => object.name === 'Rend the Veil / destination' ); check( group, 'public binding creates its actual local effect group' );
	const ink = [], runes = []; group.traverse( object => { if ( object.material?.isShaderMaterial ) ( object.isLineSegments ? runes : ink ).push( object.material ); } );
	check( ink.length >= 3 && runes.length > 0, 'actual public graph contains distinct local ink and rune materials' );
	for ( const material of ink ) {
		inkContract( material ); const shader = material.fragmentShader;
		check( /rvReceiver\s*=\s*vec4\(0\.\)/.test( shader ) && /rvReceiverExtra\s*=\s*vec4\(0\.\)/.test( shader ), 'actual ink program emits zero normal/extra receiver packets' );
		check( /rvAlbedo\s*=\s*vec4\(0\.\)/.test( shader ), 'actual ink program starts with zero albedo RGB' );
		// Summoning layers share a uniform object: only the actual seal program
		// declares/samples uSeal. Pool and veil must keep ordinary visible coverage.
		if ( /uniform\s+sampler2D\s+uSeal\b/.test( shader ) ) {
			check( /rvAlbedo\.a\s*=\s*clamp\(gl_FragColor\.a\*\(1\.-marks\.g\),0\.,1\.\)/.test( shader ), 'actual seal coverage explicitly excludes its rune-letter channel' );
			const receiver = [ .8, .4, .2, .08 ];
			same( blendPacket( material, [ 0, 0, 0, .8 * ( 1 - 1 ) ], receiver ).join(), receiver.join(), 'letter pixels do not darken underlying albedo or alter its tag' );
		} else check( /rvAlbedo\.a\s*=\s*clamp\(gl_FragColor\.a,0\.,1\.\)/.test( shader ), 'actual non-seal ink program uses visible colour coverage' );
	}
	for ( const material of runes ) {
		same( material.blending, THREE.AdditiveBlending, 'public rune letters retain supplied additive blending' );
		check( ! /rvAlbedo\.a\s*=/.test( material.fragmentShader ), 'rune program never writes ink coverage into the receiver attachment' );
		const receiver = [ .2, .3, .4, .06 ]; same( blendPacket( material, [ 0, 0, 0, 0 ], receiver ).join(), receiver.join(), 'additive rune zero packet leaves receiver RGB/class metadata intact' );
		check( blendPacket( material, [ .02, .01, .04, 1 ], receiver )[ 0 ] > receiver[ 0 ], 'rune colour can still add light independently of receiver data' );
	}
} ) );

Deno.test( 'public ghost shader darkens covered albedo without corrupting signed depth or receiver class alpha', () => fixture( ( { scene, renderer } ) => {
	const ghosts = scene.children.filter( object => object.userData.rendVeilVisualOnly ); check( ghosts.length > 0, 'actual public binding supplies ghost meshes' );
	for ( const ghost of ghosts ) {
		const material = ghost.material; inkContract( material ); same( material.depthWrite, false, 'ghost never becomes hardware-depth receiver' );
		const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
		material.onBeforeCompile( shader, renderer );
		check( /gNormal=vec4\(0\.\)/.test( shader.fragmentShader ) && /gHeightMask=vec4\(0\.\)/.test( shader.fragmentShader ), 'actual composed ghost program emits zero normal/mask packets' );
		check( /gAlbedo=vec4\(0\.,0\.,0\.,clamp\(diffuseColor\.a,0\.,1\.\)\)/.test( shader.fragmentShader ), 'actual composed ghost program supplies black RGB and bounded visible coverage only' );
	}
} ) );

Deno.test( 'public body and shadow programs reuse supplied radial coverage and post-posed transforms through Appearance and Focus', async () => {
	const reference = await Deno.readTextFile( 'tools/summoning_reference/quaked-rend-the-veil-v1.0.0.html' );
	const chunk = name => {
		const match = new RegExp( 'const ' + name + '=`([\\s\\S]*?)`;' ).exec( reference ); check( match, 'supplied reference exports ' + name ); return match[ 1 ];
	};
	const compact = text => text.replace( /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '' ).replace( /\s+/g, '' );
	same( RV_FRAGMENT_MASK.trim(), chunk( 'RV_FRAGMENT_MASK' ).trim(), 'body/ghost mask is the exact supplied integration mask' );
	same( RV_VERTEX_BIND.trim(), chunk( 'RV_VERTEX_BIND' ).trim(), 'canonical transform follows exact supplied post-posed vertex sequence' );
	const radial = /float rvField\(vec3 q\)\{[\s\S]*?\}/;
	same( radial.exec( RV_SURFACE_DECL )?.[ 0 ], radial.exec( chunk( 'RV_SURFACE_DECL' ) )?.[ 0 ], 'radial field center/radius/noise/clamp coefficients match supplied source' );
	check( ! RV_SURFACE_DECL.includes( 'rvDissolve' ), 'no invented spatial-hash replacement remains' );
	fixture( ( { scene, camera, mesh, entity, geometry, renderer, originalMaterial } ) => {
		const program = ( material, library ) => {
			const base = THREE.ShaderLib[ library ]; check( base, 'actual Three shader library exists' );
			const shader = { uniforms: {}, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader };
			material.onBeforeCompile( shader, renderer ); return shader;
		};
		const body = program( mesh.material, 'basic' ), depth = program( mesh.customDepthMaterial, 'depth' ), distance = program( mesh.customDistanceMaterial, 'distance' );
		const capture = R_CreateShadowCaptureMaterial( 'void main(){gl_FragColor=vec4(1.);}' ), caster = new THREE.Mesh( geometry, capture );
		caster.userData.rendVeilSource = mesh; caster.matrixWorld.copy( mesh.matrixWorld );
		const ghosts = scene.children.filter( object => object.userData.rendVeilVisualOnly ).map( ghost => ( { ghost, shader: program( ghost.material, 'basic' ) } ) );
		const mask = compact( RV_FRAGMENT_MASK );
		for ( const shader of [ body, depth, distance, ...ghosts.map( value => value.shader ) ] ) check( compact( shader.fragmentShader ).includes( mask ), 'actual composed program contains the exact shared mask' );
		check( compact( capture.fragmentShader ).includes( mask ), 'actual native atlas capture contains the same supplied mask' );
		try {
			for ( const [ age, expected ] of [ [ 0, 0 ], [ .5, 0 ], [ .9, .352 ], [ 1.1, .648 ], [ 1.5, 1 ] ] ) {
				entity._rendVeilTime = age; R_RendVeilSeen( entity, mesh, scene ); capture.onBeforeRender( renderer, scene, camera, geometry, caster );
				for ( const uniforms of [ body.uniforms, depth.uniforms, distance.uniforms, capture.uniforms ] ) near( uniforms.uRVProgress.value, expected, 'actual colour/depth/distance/atlas share source Appearance progress at ' + age );
				check( mesh.material !== originalMaterial && mesh.material.transparent === false && mesh.material.depthWrite === true, 'source appearance draws opaque covered native fragments' );
				for ( const { ghost, shader } of ghosts ) {
					near( shader.uniforms.uRVProgress.value, expected, 'ghost program follows current source clock' );
					if ( age === 0 || age === .5 || age === 1.5 ) same( ghost.visible, false, 'source formation endpoints never show a replacement silhouette' );
				}
			}
			// Exact source field is clamped strictly inside (0,1): its shared
			// body predicate therefore has zero coverage at progress0/full at1.
			check( /return clamp\(f,\.003,\.997\)/.test( RV_SURFACE_DECL ), 'source field has strict zero/full coverage endpoints' );
			entity._rendVeilTime = 2.5; R_RendVeilSeen( entity, mesh, scene );
			same( mesh.material, originalMaterial, 'Focus restores the exact original host material/program owner' );
			same( mesh.customDepthMaterial, undefined, 'Focus restores original depth binding' ); same( mesh.customDistanceMaterial, undefined, 'Focus restores original distance binding' );
		} finally { capture.dispose(); }
	}, 0 );
} );

Deno.test( 'native optical protection restores the supplied matched-Unwind receiver behavior', async () => {
	const reference = await Deno.readTextFile( 'tools/summoning_reference/quaked-rend-the-veil-v1.0.0.html' );
	const match = /float\s+protect\s*=\s*([\w.\s*+\-/()]+);/.exec( OPTICS_FRAGMENT ); check( match, 'actual optical source defines receiver protection' );
	const expression = match[ 1 ].replace( /\s+/g, '' );
	const original = /float\s+protect\s*=\s*([\w.\s*+\-/()]+);/.exec( reference ); check( original, 'supplied optical source defines receiver protection' );
	same( expression, original[ 1 ].replace( /\s+/g, '' ), 'optical protection exactly matches supplied source expression' );
	same( expression, '1.-subjectFront*uFocus', 'body protection follows source matched-Unwind clock' );
	check( /support\*=protect;volume\*=protect;band\*=protect;/.test( OPTICS_FRAGMENT ), 'actual field support, smoke volume and ripple all use receiver protection' );
	check( OPTICS_FRAGMENT.includes( 'texture2D(uBackgroundDepth,uv)' ), 'formed receiver classification still uses real background-depth contract' );
	// This arithmetic is read from the emitted expression, not a GPU claim.
	const constant = Number( expression.split( '-' )[ 0 ] );
	near( constant - 1 * 0, 1, 'Appearance retains original full optical field over formed samples before Unwind' );
	near( constant - 1 * .5, .5, 'matched Unwind progressively protects the formed subject' );
	near( constant - 1 * 1, 0, 'Focus fully protects the opaque subject' );
	near( constant - 0 * 1, 1, 'background retains the surrounding ritual field' );
} );

Deno.test( 'public native long-body reveal fit covers the whole radial input without changing model vertices or shadow ownership', () => fixture( ( { scene, camera, mesh, geometry, renderer, originalScale, originalMatrix, originalWorldVertices } ) => {
	const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
	mesh.material.onBeforeCompile( shader, renderer );
	const body = shader.uniforms, capture = R_CreateShadowCaptureMaterial( 'void main(){gl_FragColor=vec4(1.);}' );
	const caster = new THREE.Mesh( geometry, capture ); caster.userData.rendVeilSource = mesh; caster.matrixWorld.copy( mesh.matrixWorld );
	try {
		capture.onBeforeRender( renderer, scene, camera, geometry, caster );
		check( body.uRVRevealFromBody.value.isMatrix4, 'actual public body binding supplies a typed reveal-input transform' );
		same( body.uRVRevealFromBody.value.elements.join(), capture.uniforms.uRVRevealFromBody.value.elements.join(), 'borrowed native shadow caster receives the same whole-model input fit' );
		const center = new THREE.Vector3( 0, 2.3, 0 ), positions = geometry.getAttribute( 'position' );
		let rawOutside = 0, fittedOutside = 0, maxRaw = 0, maxFitted = 0;
		originalWorldVertices.forEach( ( world, i ) => {
			const local = new THREE.Vector3().fromBufferAttribute( positions, i ), raw = local.clone().applyMatrix4( body.uRVEffectFromModel.value );
			const rawRadius = raw.distanceTo( center ), fitted = raw.clone().applyMatrix4( body.uRVRevealFromBody.value ), fittedRadius = fitted.distanceTo( center );
			maxRaw = Math.max( maxRaw, rawRadius ); maxFitted = Math.max( maxFitted, fittedRadius );
			if ( rawRadius > 2.55 + 1e-9 ) rawOutside ++; if ( fittedRadius > 2.55 + 1e-9 ) fittedOutside ++;
			nearPoint( local.applyMatrix4( mesh.matrixWorld ), world, 'actual long native model vertex is not moved or scaled by reveal fit' );
		});
		check( rawOutside > 0 && maxRaw > 5, '83x16x38 native-like long geometry exposes height-only domain overflow' );
		same( fittedOutside, 0, 'no native anchor remains outside the authored radial domain until the final progress bypass' );
		near( maxFitted, 2.55, 'largest actual anchor fits the unchanged source radius' );
		nearPoint( center.clone().applyMatrix4( body.uRVRevealFromBody.value ), center, 'input fit preserves original source reveal center' );
		vector( mesh.scale, originalScale, 'long native body scale remains unchanged' ); same( mesh.matrixWorld.elements.join(), originalMatrix.elements.join(), 'long native model world transform remains unchanged' );
		for ( const program of [ shader.vertexShader, capture.vertexShader ] ) {
			const originalAt = program.indexOf( RV_VERTEX_BIND ), fitAt = program.indexOf( RV_REVEAL_VERTEX );
			check( originalAt >= 0 && fitAt >= originalAt + RV_VERTEX_BIND.length, 'fit applies only to coverage anchor after original vertex/ghost/coat geometry transform' );
		}
		const world = new THREE.Mesh( geometry, capture ); world.matrixWorld.makeTranslation( 900, 400, 50 );
		capture.onBeforeRender( renderer, scene, camera, geometry, world );
		same( capture.uniforms.uRVRevealFromBody.value.elements.join(), new THREE.Matrix4().elements.join(), 'ordinary private world capture resets reveal fit to identity' );
		same( capture.uniforms.uRVEffectFromModel.value.elements.join(), new THREE.Matrix4().elements.join(), 'ordinary private world capture retains original model coordinates' );
		near( capture.uniforms.uRVProgress.value, 1, 'ordinary world remains fully opaque rather than inheriting actor coverage' );
	} finally { capture.dispose(); }
}, .9, [ 83, 16, 38 ], 'progs/demon.mdl' ) );

Deno.test( 'public changed pose attribute version refreshes live whole-model fit for body and borrowed shadow without scaling geometry', () => fixture( ( { scene, camera, mesh, entity, geometry, renderer, originalScale, originalMatrix } ) => {
	const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
	mesh.material.onBeforeCompile( shader, renderer );
	const body = shader.uniforms, material = mesh.material, capture = R_CreateShadowCaptureMaterial( 'void main(){gl_FragColor=vec4(1.);}' );
	const caster = new THREE.Mesh( geometry, capture ); caster.userData.rendVeilSource = mesh; caster.matrixWorld.copy( mesh.matrixWorld );
	try {
		capture.onBeforeRender( renderer, scene, camera, geometry, caster );
		const positions = geometry.getAttribute( 'position' ), oldVersion = positions.version, oldFit = body.uRVRevealFromBody.value.clone(), center = new THREE.Vector3( 0, 2.3, 0 );
		// Actual native pose bytes change, with the same BufferAttribute/mesh.
		for ( let i = 0; i < positions.count; i ++ ) positions.setX( i, positions.getX( i ) * 1.8 );
		positions.needsUpdate = true; check( positions.version > oldVersion, 'actual GPU-upload pose version advances' );
		const posedWorld = Array.from( { length: positions.count }, ( _, i ) => new THREE.Vector3().fromBufferAttribute( positions, i ).applyMatrix4( mesh.matrixWorld ) );
		check( Array.from( { length: positions.count }, ( _, i ) => new THREE.Vector3().fromBufferAttribute( positions, i ).applyMatrix4( body.uRVEffectFromModel.value ).applyMatrix4( oldFit ).distanceTo( center ) ).some( radius => radius > 2.55 ), 'larger real pose would escape a stale registration-only fit' );
		R_RendVeilSeen( entity, mesh, scene ); capture.onBeforeRender( renderer, scene, camera, geometry, caster );
		same( mesh.material, material, 'position update retains the same native material binding' ); same( geometry.getAttribute( 'position' ), positions, 'position update preserves actual pose attribute ownership' );
		check( body.uRVRevealFromBody.value.elements.join() !== oldFit.elements.join(), 'live reveal matrix updates for enlarged posed vertices' );
		same( body.uRVRevealFromBody.value.elements.join(), capture.uniforms.uRVRevealFromBody.value.elements.join(), 'borrowed shadow reads the same updated live entry fit' );
		let maximum = 0;
		posedWorld.forEach( ( world, i ) => {
			const local = new THREE.Vector3().fromBufferAttribute( positions, i ), fitted = local.clone().applyMatrix4( body.uRVEffectFromModel.value ).applyMatrix4( body.uRVRevealFromBody.value );
			maximum = Math.max( maximum, fitted.distanceTo( center ) ); check( fitted.distanceTo( center ) <= 2.55 + 1e-9, 'every enlarged current pose anchor stays inside source radial domain' );
			nearPoint( local.applyMatrix4( mesh.matrixWorld ), world, 'reveal refresh cannot alter actual new native pose vertices' );
		});
		near( maximum, 2.55, 'refreshed fit reaches unchanged authored radius' );
		vector( mesh.scale, originalScale, 'pose refresh leaves native model scale unchanged' ); same( mesh.matrixWorld.elements.join(), originalMatrix.elements.join(), 'pose refresh leaves native model transform unchanged' );
	} finally { capture.dispose(); }
}, .9, [ 83, 16, 38 ], 'progs/demon.mdl' ) );
