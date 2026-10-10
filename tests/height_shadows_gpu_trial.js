// Deliberately no main.js, Quake server, RAF loop, asset downloads or synthetic
// renderer. Every fixture draw uses the current production material callbacks.
await import( '../src/engine/render/gl_rsurf.js' ); // production import order avoids its cycle
const THREE = await import( 'three' );
const post = await import( '../src/newer/render/gl_post.js' );
const skins = await import( '../src/newer/render/r_newerskins.js' );
const height = await import( '../src/newer/render/r_heightshadows.js' );
const anim = await import( '../src/newer/render/r_anim.js' );
const cvars = await import( '../src/engine/common/cvar.js' );
const W = 512, H = 512, report = document.querySelector( '#report' ), button = document.querySelector( '#run' );
const registered = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_bounce,
	anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water, height.r_heightshadows ];
for ( const variable of registered ) if ( ! cvars.Cvar_FindVar( variable.name ) ) cvars.Cvar_RegisterVariable( variable );
for ( const [ name, value ] of Object.entries( { r_hdr: 1, r_dynres: 0, r_bloom: 0, r_volumetric: 0, r_bounce: 0,
	r_newer_lighting: 1, r_newer_normals: 1, r_newer_water: 0, r_heightshadows: 1 } ) ) cvars.Cvar_SetValue( name, value );

const renderer = new THREE.WebGLRenderer( { antialias: false, preserveDrawingBuffer: true } );
renderer.setPixelRatio( 1 ); renderer.setSize( W, H ); renderer.setClearColor( 0, 0 );
const gl = renderer.getContext(), errors = [];
renderer.debug.onShaderError = ( context, program, vertex, fragment ) => errors.push( {
	program: context.getProgramInfoLog( program ), vertex: context.getShaderInfoLog( vertex ), fragment: context.getShaderInfoLog( fragment )
} );
window.addEventListener( 'error', event => errors.push( { message: event.message } ) );
window.addEventListener( 'unhandledrejection', event => errors.push( { rejection: String( event.reason ) } ) );
const camera = new THREE.OrthographicCamera( -8, 8, 8, -8, .1, 128 );
camera.position.set( 0, 0, 64 ); camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld( true );
const geometry = new THREE.PlaneGeometry( 16, 16 );
geometry.setAttribute( 'uv1', geometry.attributes.uv.clone() );
geometry.setAttribute( 'color', new THREE.BufferAttribute( new Float32Array( geometry.attributes.position.count * 3 ), 3 ) );
const originalPositions = geometry.attributes.position.array.slice(), originalUvs = geometry.attributes.uv.array.slice();
const pigment = new Uint8Array( [ 120, 80, 60, 255 ] ), originalPigment = pigment.slice();
const diffuse = new THREE.DataTexture( pigment, 1, 1 );
diffuse.colorSpace = THREE.SRGBColorSpace; diffuse.needsUpdate = true;
const heightPixels = new Uint8Array( 256 * 4 );
for ( let x = 0; x < 256; x ++ ) heightPixels.set( [ 128, 128, 255, x >= 141 && x <= 145 ? 255 : 51 ], x * 4 );
const normal = new THREE.DataTexture( heightPixels, 256, 1 );
normal.colorSpace = THREE.NoColorSpace; normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
normal.minFilter = normal.magFilter = THREE.NearestFilter; normal.generateMipmaps = false;
normal.userData.heightSource = true; normal.needsUpdate = true;
// R_NormalMapFor's supported cache reuses this exact authored normal/height
// texture. No color-to-height inference or repainting occurs in this fixture.
diffuse._normalMap = normal;
const black = new THREE.DataTexture( new Uint8Array( [ 0, 0, 0, 255 ] ), 1, 1 );
black.channel = 1; black.needsUpdate = true;
const world = new THREE.MeshLambertMaterial( { map: diffuse, lightMap: black, lightMapIntensity: 2 } );
post.R_RegisterDetail( world, diffuse );
const alias = skins.R_AssetAliasMaterial( { diffuse, normal }, 'height-shadow-gpu-proof' );
const scene = new THREE.Scene(), surface = new THREE.Mesh( geometry, world ); scene.add( surface );
const previewScene = new THREE.Scene(), previewCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 2 );
const previewMaterial = new THREE.ShaderMaterial( {
	uniforms: { tHeightShadow: { value: null }, uHeightMasks: { value: 1 }, uSource: { value: 0 } },
	vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
	fragmentShader: 'varying vec2 vUv;uniform int uSource;\n' + height.HEIGHT_MASK_DECODE_GLSL + '\nvoid main(){gl_FragColor=vec4(vec3(heightMaskVisibility(vUv,uSource)),1.);}',
	depthTest: false, depthWrite: false
} );
previewScene.add( new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), previewMaterial ) );

// This arithmetic decoder is independent of the production CPU codec and GLSL.
function decode( bytes ) {
	const word = bytes[ 0 ] + bytes[ 1 ] * 256 + bytes[ 2 ] * 65536 + bytes[ 3 ] * 16777216;
	const kind = Math.floor( word / 1073741824 ), valid = kind === 1 || kind === 2;
	return { valid, kind, values: Array.from( { length: 10 }, ( _, i ) => valid ? Math.floor( word / 2 ** ( i * 3 ) ) % 8 / 7 : 1 ) };
}
function pixel( target, uv, attachment ) {
	const bytes = new Uint8Array( 4 );
	renderer.readRenderTargetPixels( target, Math.floor( uv[ 0 ] * W ), Math.floor( uv[ 1 ] * H ), 1, 1, bytes, undefined, attachment );
	return Array.from( bytes );
}
const locations = { valley: [ .536, .5 ], ridge: [ .562, .5 ] };
const sources = [ { name: 'point', index: 0 }, { name: 'sun', index: 8 }, { name: 'flashlight', index: 9 } ];
function snapshot( name ) {
	return { points: name === 'point' ? [ { position: [ 16, 0, .03 ], range: 64, color: [ 1, 1, 1 ] } ] : [],
		sun: { direction: [ 1, 0, .03 ], on: name === 'sun', color: [ 1, 1, 1 ] },
		spot: { position: [ 16, 0, .03 ], range: 64, direction: [ -1, 0, -.002 ], cone: [ .99, .9 ], on: name === 'flashlight', color: [ 1, 1, 1 ] } };
}
// Independent geometric oracle: intersect the real height-ridge prism,
// clipping finite lights and the bounded UV search, without using the shader
// march or production visibility decoder. Neighbor agreement excludes only
// geometric transition margins and the world POM's small view-ray UV drift.
const ridgeBox = new THREE.Box3( new THREE.Vector3( ( 141 / 256 - .5 ) * 16, -8, -.32 ), new THREE.Vector3( ( 146 / 256 - .5 ) * 16, 8, 0 ) );
function ridgeBlocked( route, sourceName, u, v ) {
	const plane = new THREE.Vector3( ( u - .5 ) * 16, ( v - .5 ) * 16, 0 ), amplitude = route === 'world' ? .02 : .015, cap = route === 'world' ? .35 : .03;
	if ( u >= 141 / 256 && u < 146 / 256 ) return false;
	const origin = plane.clone(); origin.z = ( .2 - 1 ) * amplitude * 16;
	const finite = sourceName !== 'sun', delta = finite ? new THREE.Vector3( 16, 0, .03 ).sub( origin ) : new THREE.Vector3( 1, 0, .03 );
	const distance = delta.length(), direction = delta.clone().normalize();
	if ( sourceName === 'flashlight' ) { const directionFromPlane = new THREE.Vector3( 16, 0, .03 ).sub( plane ).normalize(), beam = new THREE.Vector3( -1, 0, -.002 ).normalize(); if ( directionFromPlane.negate().dot( beam ) <= .9 ) return false; }
	const hit = new THREE.Ray( origin, direction ).intersectBox( ridgeBox, new THREE.Vector3() ); if ( ! hit ) return false;
	const uvSpeed = Math.hypot( direction.x, direction.y ) / 16;
	const maxDistance = Math.min( -origin.z / direction.z, cap / uvSpeed, finite ? distance : Infinity );
	return hit.distanceTo( origin ) < maxDistance;
}
function wholeBand( target, route, source, mode, check ) {
	const rows = [], edgeMargin = 4 / W; let compared = 0, shadowed = 0;
	for ( const y of [ 64, 160, 256, 352, 448 ] ) {
		const bytes = new Uint8Array( W * 4 ), v = ( y + .5 ) / H; renderer.readRenderTargetPixels( target, 0, y, W, 1, bytes, undefined, 3 );
		let run = 0, runs = 0, interiors = 0, mismatch = 0, first = -1, last = -1;
		for ( let x = 0; x < W; x ++ ) {
			const u = ( x + .5 ) / W, decoded = decode( bytes.subarray( x * 4, x * 4 + 4 ) ), dark = decoded.values[ source.index ] <= 1 / 7;
			if ( dark ) { if ( ! run ) runs ++; run ++; if ( first < 0 ) first = x; last = x; } else run = 0;
			if ( mode !== 'height' ) { if ( decoded.valid || decoded.values[ source.index ] !== 1 ) mismatch ++; compared ++; continue; }
			const expected = ridgeBlocked( route, source.name, u, v );
			if ( ridgeBlocked( route, source.name, u - edgeMargin, v ) !== expected || ridgeBlocked( route, source.name, u + edgeMargin, v ) !== expected ) continue;
			compared ++; if ( expected ) { interiors ++; shadowed ++; if ( ! dark ) mismatch ++; } else if ( decoded.values[ source.index ] !== 1 ) mismatch ++;
		}
		check( mismatch === 0, route + ' ' + source.name + ' ' + mode + ' full band ray-oracle agreement at y=' + y + ' mismatches=' + mismatch );
		if ( mode === 'height' && interiors ) check( runs === 1, route + ' ' + source.name + ' continuous shadow interval, no zebra bands at y=' + y + ' runs=' + runs );
		rows.push( { y, comparedShadowPixels: interiors, mismatches: mismatch, shadowRuns: runs, first, last } );
	}
	check( compared > 2000, route + ' entire band includes more than2000 independent samples' );
	if ( mode === 'height' ) check( shadowed > 0, route + ' ray oracle has nonvacuous shadow interior' );
	return { rows, compared, shadowed, edgeMarginPixels: 4 };
}
function contrastProof( check ) {
	// Actual exported decoder/contrast arithmetic, including packed source masks
	// and the final gamma stage. This deliberately does not claim the full game
	// compositor: map-light selection and its receiver weights remain separate.
	const s = new THREE.Scene(), g = new THREE.PlaneGeometry( 2, 2 ), uniforms = { tHeightShadow: { value: null }, uHeightMasks: { value: 1 }, uSource: { value: 0 }, uIncidentWeight: { value: 3 }, uInvGamma: { value: 1 }, uRadiance: { value: new THREE.Vector3( .12, .08, .04 ) } };
	const material = new THREE.ShaderMaterial( { uniforms, depthTest: false, depthWrite: false,
		vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
		fragmentShader: 'varying vec2 vUv;uniform int uSource;uniform float uIncidentWeight;uniform float uInvGamma;uniform vec3 uRadiance;\n' + height.HEIGHT_MASK_DECODE_GLSL + '\nvoid main(){float visibility=heightMaskVisibility(vUv,uSource);float gain=heightRockContrast(vUv,visibility*uIncidentWeight,uIncidentWeight);gl_FragColor=vec4(pow(uRadiance*gain,vec3(uInvGamma)),1.);}' } );
	s.add( new THREE.Mesh( g, material ) ); const results = [];
	try {
		for(const incident of [3,.05]) for ( const gamma of [ 1, .75 ] ) for ( const kind of [ 0, 1, 2, 3 ] ) for ( const source of sources ) for ( const quantized of [ 0, 4, 7 ] ) {
			const values = new Array( 10 ).fill( 1 ); values[ source.index ] = quantized / 7;
			const bytes = kind === 0 ? new Uint8Array( 4 ) : kind === 3 ? new Uint8Array( [ 255, 255, 255, 255 ] ) : height.R_HeightShadowPack( values, kind === 2 );
			const texture = new THREE.DataTexture( bytes, 1, 1 ); texture.colorSpace = THREE.NoColorSpace; texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.needsUpdate = true;
			uniforms.uIncidentWeight.value=incident;uniforms.tHeightShadow.value = texture; uniforms.uSource.value = source.index; uniforms.uInvGamma.value = 1 / gamma;
			renderer.setRenderTarget( null ); renderer.render( s, previewCamera ); const pixel = new Uint8Array( 4 ); gl.readPixels( 256, 256, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel );
			const gain = kind===2?.5+(incident<.1?1.5:.5)*quantized/7:1, expected = [ .12, .08, .04 ].map( v => Math.round( Math.pow( v * gain, 1 / gamma ) * 255 ) );
			check( expected.every( ( v, i ) => Math.abs( v - pixel[ i ] ) <= 1 ), 'GPU rock-only gain then final gamma kind=' + kind + ' source=' + source.name + ' quant=' + quantized + ' gamma=' + gamma );
			results.push( { kind, source: source.name, quantized, gamma, incident, linearGain: gain, expected, pixel: Array.from( pixel ) } ); texture.dispose();
		}
		check( gl.getError() === gl.NO_ERROR, 'contrast helper no WebGL errors' );
	} finally { material.dispose(); g.dispose(); }
	return results;
}
function transparentOverlayProof( check ) {
	// Real MRT blending regression: the foreground's normal can own its depth
	// while an alpha-zero mask would leave a background rock tag. Production
	// depth-writing transparency must overwrite it to invalidFF instead.
	const background = new THREE.ShaderMaterial( { depthTest: true, depthWrite: true, blending: THREE.NoBlending,
		vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
		fragmentShader: 'layout(location=1) out highp vec4 gNormal;layout(location=2) out highp vec4 gAlbedo;layout(location=3) out highp vec4 gHeightMask;void main(){gl_FragColor=vec4(.1,.1,.1,1.);gNormal=vec4(.5,.5,1.,64.);gAlbedo=vec4(.2,.2,.2,1.);gHeightMask=vec4(1.,1.,1.,191./255.);}' } );
	background.onBeforeCompile = () => {};
	const bgGeometry = new THREE.PlaneGeometry( 16, 16 ), fgGeometry = new THREE.PlaneGeometry( 8, 8 ); fgGeometry.setAttribute( 'color', new THREE.Float32BufferAttribute( new Array( fgGeometry.attributes.position.count * 3 ).fill( .2 ), 3 ) );
	const s = new THREE.Scene(); s.add( new THREE.Mesh( bgGeometry, background ) ); const results = [];
	try {
		for ( const depthWrite of [ true, false ] ) {
			const material = skins.R_AssetAliasMaterial( { diffuse, normal }, 'height-shadow-transparent-overlay-' + depthWrite ); material.transparent = true; material.opacity = .5; material.depthWrite = depthWrite;
			const foreground = new THREE.Mesh( fgGeometry, material ); foreground.position.z = 8; s.add( foreground );
			post.R_PostBegin( renderer, true, W, H ); height.R_HeightShadowFrame( snapshot( 'point' ) ); height.R_HeightShadowScope( true ); post.R_PostBind( renderer ); const target = renderer.getRenderTarget(); renderer.clear(); renderer.render( s, camera );
			const center = decode( pixel( target, [ .5, .5 ], 3 ) ), edge = decode( pixel( target, [ .8, .5 ], 3 ) );
			check( depthWrite ? !center.valid && center.values.every( v => v === 1 ) : center.valid && center.kind === 2, 'actual transparent alias blend ' + ( depthWrite ? 'clears stale rock tag to invalidFF' : 'preserves underlying receiver without depth write' ) );
			check( edge.valid && edge.kind === 2, 'background rock tag unchanged outside foreground' ); check( gl.getError() === gl.NO_ERROR, 'transparent MRT blend no GL error' );
			// Capture the actual public compositor program through its real render,
			// then execute its receiver wrapper over these actual MRT textures.
			let compositeSource = ''; const originalRender = renderer.render;
			try { renderer.render = function ( scene, camera ) { const m = scene.children[ 0 ]?.material; if ( m?.uniforms?.uHeightMasks ) compositeSource = m.fragmentShader; return originalRender.call( renderer, scene, camera ); }; post.R_PostFinish( renderer, s, camera, { lx: 0, ly: 0, lw: W, lh: H }, 0, [], [], 42, .75, false ); } finally { renderer.render = originalRender; }
			const begin = compositeSource.indexOf( 'float receiverRockContrast(' ), open = compositeSource.indexOf( '{', begin ), close = compositeSource.indexOf( '\n}', open ); if ( begin < 0 || close < 0 ) throw new Error( 'actual compositor receiver wrapper unavailable' ); const wrapper = compositeSource.slice( begin, close + 2 );
			const query = new THREE.ShaderMaterial( { depthTest: false, depthWrite: false, uniforms: { tScene:{value:target.textures[0]},tNormal: { value: target.textures[ 1 ] }, tHeightShadow: { value: target.textures[ 3 ] }, uHeightMasks: { value: 1 }, uForegroundDepth: { value: depthWrite ? 56 : 64 } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: 'varying vec2 vUv;uniform sampler2D tNormal;uniform sampler2D tScene;uniform float uForegroundDepth;\n' + height.HEIGHT_MASK_DECODE_GLSL + '\n' + wrapper + '\nvoid main(){bool foreground=abs(vUv.x-.5)<.25&&abs(vUv.y-.5)<.25;float depth=foreground?uForegroundDepth:64.;float gain=receiverRockContrast(vec3(0.,0.,-depth),vUv,3.,3.);gl_FragColor=vec4(gain*.5,texture2D(tNormal,vUv).a/100.,0.,1.);}' } );
			const queryScene = new THREE.Scene(), queryGeometry = new THREE.PlaneGeometry( 2, 2 ); queryScene.add( new THREE.Mesh( queryGeometry, query ) ); renderer.setRenderTarget( null ); renderer.render( queryScene, previewCamera );
			const measured = {};
			for ( const [ name, uv ] of [ [ 'foreground', [ .5, .5 ] ], [ 'background', [ .8, .5 ] ] ] ) { const p = new Uint8Array( 4 ); gl.readPixels( Math.floor( uv[ 0 ] * W ), Math.floor( uv[ 1 ] * H ), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p ); const expectedPacketDepth = 64, receiverDepth = name === 'foreground' && depthWrite ? 56 : 64, expectedGain = 1; check( Math.abs( p[ 1 ] - expectedPacketDepth / 100 * 255 ) <= 1, 'actual transparent pass preserves solid background normal packet ' + name + ' depthWrite=' + depthWrite ); check( Math.abs( p[ 0 ] - expectedGain / 2 * 255 ) <= 1, 'actual compositor wrapper contrast ' + name + ' depthWrite=' + depthWrite ); measured[ name ] = { pixel: Array.from( p ), expectedPacketDepth, receiverDepth, expectedGain }; }
			check( gl.getError() === gl.NO_ERROR, 'actual receiver contrast query GL0' ); query.dispose(); queryGeometry.dispose();
			results.push( { depthWrite, center, edge, measured } ); s.remove( foreground ); material.dispose();
		}
	} finally { background.dispose(); bgGeometry.dispose(); fgGeometry.dispose(); height.R_HeightShadowScope( false ); }
	return results;
}
async function run() {
	button.disabled = true; document.querySelector( '#views' ).replaceChildren(); report.textContent = 'Rendering once…';
	const results = [], failures = []; let checks = 0, contrast = [], overlays = [];
	const check = ( condition, label ) => { checks ++; if ( ! condition ) failures.push( label ); };
	try {
		for ( const [ route, material ] of [ [ 'world', world ], [ 'alias', alias ] ] ) {
			surface.material = material;
			for ( const mode of [ 'height', 'no-height-source', 'scope-off' ] ) for ( const source of sources ) {
				normal.userData.heightSource = mode !== 'no-height-source';
				check( post.R_PostBegin( renderer, true, W, H ), 'production HDR supported' );
				// Controlled source snapshot proves material-to-mask propagation. This
				// does not claim map source selection or game-frame compositor proof.
				height.R_HeightShadowFrame( snapshot( source.name ) ); height.R_HeightShadowScope( mode !== 'scope-off' );
				post.R_PostBind( renderer ); const target = renderer.getRenderTarget();
				check( target.textures.length === 4 && target.samples === 0, 'four attachments without packed-mask averaging' );
				check( target.textures[ 3 ].type === THREE.UnsignedByteType && target.textures[ 3 ].colorSpace === THREE.NoColorSpace, 'RGBA8 data mask' );
				renderer.clear(); renderer.render( scene, camera );
				if ( errors.length ) throw new Error( 'Shader compilation failed: ' + JSON.stringify( errors[ 0 ] ) );
				const band = wholeBand( target, route, source, mode, check ), probes = {};
				for ( const [ name, uv ] of Object.entries( locations ) ) {
					const raw = pixel( target, uv, 3 ), decoded = decode( raw ), albedo = pixel( target, uv, 2 );
					check( decoded.values.every( ( value, i ) => value === height.R_HeightShadowDecode( raw, i ) ), 'independent codec agreement' );
					check( albedo.every( ( value, i ) => Math.abs( value - originalPigment[ i ] ) <= 1 ), route + ' retains original albedo' );
					check( decoded.values.every( ( value, i ) => i === source.index || value === 1 ), 'inactive sources remain lit' );
					if ( mode === 'height' ) check( decoded.valid && decoded.kind === 1 && ( name === 'valley' ? decoded.values[ source.index ] <= 1 / 7 : decoded.values[ source.index ] === 1 ), route + ' ' + source.name + ' ' + name + ' height visibility' );
					else check( ! decoded.valid && decoded.values.every( value => value === 1 ), route + ' ' + mode + ' invalid/lit' );
					probes[ name ] = { raw, ...decoded, albedo };
				}
				previewMaterial.uniforms.tHeightShadow.value = target.textures[ 3 ]; previewMaterial.uniforms.uSource.value = source.index;
				renderer.setRenderTarget( null ); renderer.render( previewScene, previewCamera );
				for ( const [ name, uv ] of Object.entries( locations ) ) {
					const decodedPixel = new Uint8Array( 4 ); gl.readPixels( Math.floor( uv[ 0 ] * W ), Math.floor( uv[ 1 ] * H ), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, decodedPixel );
					check( Math.abs( decodedPixel[ 0 ] - probes[ name ].values[ source.index ] * 255 ) <= 1, 'production GPU decoder agrees with independent arithmetic' );
					probes[ name ].gpuDecoded = Array.from( decodedPixel );
				}
				if ( mode === 'height' ) {
					const figure = document.createElement( 'figure' ), img = document.createElement( 'img' ), caption = document.createElement( 'figcaption' );
					img.src = renderer.domElement.toDataURL(); img.width = img.height = 256; caption.textContent = route + ' / ' + source.name + ': decoded visibility (white = lit)';
					figure.append( img, caption ); document.querySelector( '#views' ).append( figure );
				}
				const glError = gl.getError(); check( glError === gl.NO_ERROR, 'no WebGL error' );
				results.push( { route, mode, source: source.name, sourceIndex: source.index, band, probes, glError } );
			}
		}
		contrast = contrastProof( check ); overlays = transparentOverlayProof( check );
		check( originalPositions.every( ( value, i ) => value === geometry.attributes.position.array[ i ] ) && originalUvs.every( ( value, i ) => value === geometry.attributes.uv.array[ i ] ), 'geometry and UV bytes unchanged' );
		check( originalPigment.every( ( value, i ) => value === pigment[ i ] ), 'diffuse bytes unchanged' );
	} catch ( error ) { failures.push( error.stack || String( error ) ); }
	finally { height.R_HeightShadowScope( false ); normal.userData.heightSource = true; button.disabled = false; }
	const evidence = { status: failures.length ? 'FAIL' : 'PASS', checks, failures, shaderErrors: errors,
		contract: 'Production material + HDR mask + GPU decoder; rock-only contrast helper + gamma; controlled snapshot, no full compositor/map/game claim', dimensions: [ W, H ], draws: results.length, contrast, overlays, results };
	window.heightShadowEvidence = evidence; report.textContent = JSON.stringify( evidence, null, 2 ); return evidence;
}
button.addEventListener( 'click', run );
await run();
