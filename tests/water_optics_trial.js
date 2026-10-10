await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/gl_post.js' ), anim = await import( '../src/newer/render/r_anim.js' );
const surf = await import( '../src/engine/render/gl_rsurf.js' ), cvar = await import( '../src/engine/common/cvar.js' ), quake = await import( '../src/engine/render/glquake.js' );
const probes = await import( '../src/r_waterprobe.js' );
const mist = await import( '../src/r_mist.js' );
const flashlight = await import( '../src/r_flashlight.js' );
const { cl } = await import( '../src/engine/client/client.js' );
const vars = [ post.r_bounce, post.r_water_look, post.r_mist, flashlight.r_flashlight, post.r_hdr, post.r_dynres, post.r_reflect, post.r_reflect_screen, post.r_caustics, post.r_bloom, post.r_volumetric, post.r_newbright, post.r_newcontrast, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
for ( const v of vars ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
for ( const [ name, value ] of [ [ 'r_hdr', 1 ], [ 'r_dynres', 0 ], [ 'r_newer_lighting', 0 ], [ 'r_newer_normals', 1 ], [ 'r_newer_water', 1 ], [ 'r_reflect', .8 ], [ 'r_reflect_screen', 1 ], [ 'r_caustics', 0 ], [ 'r_bloom', 0 ], [ 'r_volumetric', 0 ] ] ) cvar.Cvar_SetValue( name, value );
const renderer = new THREE.WebGLRenderer( { antialias: false, preserveDrawingBuffer: true } ); renderer.setPixelRatio( 1 ); renderer.setSize( 480, 270 ); renderer.autoClear = false; renderer.setClearColor( 0, 1 ); document.querySelector( '#result-view' ).append( renderer.domElement );
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 78, 480 / 270, 4, 4096 ); camera.up.set( 0, 0, 1 );
const rgba = new Uint8Array( 32 * 32 * 4 ), waterPixels = new Uint8Array( 32 * 32 * 4 );
for ( let y = 0; y < 32; y ++ ) for ( let x = 0; x < 32; x ++ ) {

	const p = ( y * 32 + x ) * 4, checker = ( ( x >> 2 ) + ( y >> 2 ) ) % 2 === 0 ? 75 : 25;
	rgba.set( [ checker, checker * .8, checker * .6, 255 ], p );
	const wave = 30 + 15 * Math.sin( x * .9 ) * Math.cos( y * .7 ); waterPixels.set( [ wave * .65, wave, wave * .48, 255 ], p );

}
const floorTexture = new THREE.DataTexture( rgba, 32, 32 ), waterTexture = new THREE.DataTexture( waterPixels, 32, 32 );
for ( const t of [ floorTexture, waterTexture ] ) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; }
floorTexture.repeat.set( 4, 4 ); waterTexture.repeat.set( 4, 4 );
const floorMaterial = new THREE.MeshBasicMaterial( { map: floorTexture } ), floor = new THREE.Mesh( new THREE.PlaneGeometry( 256, 320 ), floorMaterial ); floor.position.set( 0, 48, - 64 ); scene.add( floor );
const wallMaterial = new THREE.MeshBasicMaterial( { color: new THREE.Color( .065, .045, .025 ) } );
const wall = new THREE.Mesh( new THREE.BoxGeometry( 256, 6, 200 ), wallMaterial ); wall.position.set( 0, 208, 40 ); scene.add( wall );
const lampMaterial = new THREE.MeshBasicMaterial( { color: new THREE.Color( 5, 2.2, .3 ) } ), lamp = new THREE.Mesh( new THREE.BoxGeometry( 14, 2, 20 ), lampMaterial ); lamp.position.set( - 25, 202, 66 ); scene.add( lamp );
const redMaterial = new THREE.MeshBasicMaterial( { color: new THREE.Color( 4, .1, .03 ) } ), red = new THREE.Mesh( new THREE.BoxGeometry( 16, 10, 16 ), redMaterial ); red.position.set( 60, 184, 22 ); scene.add( red );
const ledgeMaterial = new THREE.MeshBasicMaterial( { color: new THREE.Color( .11, .14, .2 ) } ), ledge = new THREE.Mesh( new THREE.BoxGeometry( 42, 30, 16 ), ledgeMaterial ); ledge.position.set( 75, 12, 8 ); scene.add( ledge );
const waterGeometry = new THREE.PlaneGeometry( 256, 320, 4, 4 ); waterGeometry.translate( 0, 48, 0 );
post.R_PostBegin( renderer, true, 480, 270 );
const baselineMaterials = [0,1].map(()=>new THREE.MeshBasicMaterial({map:waterTexture,transparent:true,side:THREE.DoubleSide}));
const surfaceMaterial = () => { if(surf.R_LiquidSurfaceMaterial)return surf.R_LiquidSurfaceMaterial({name:'*water1',gl_texture:waterTexture},1);const active=post.R_WaterActive(),m=baselineMaterials[active?1:0];m.opacity=active?post.R_LiquidOpacity('*water1',1):1;m.depthWrite=!active;return m; };
const water = new THREE.Mesh( waterGeometry, surfaceMaterial() ); scene.add( water );
const leaf = { contents: - 1, visframe: 0, compressed_vis: null }, plane = { normal: [ 0, 0, 1 ], dist: - 64, type: 2 };
const samples = new Uint8Array( 17 * 21 ).fill( 64 );
const surface = { flags: 0, texinfo: { vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] }, texturemins: [ - 128, - 112 ], extents: [ 256, 320 ], samples, styles: new Uint8Array( [ 0, 255, 255, 255 ] ) };
const model = { entities: '', lightdata: samples, surfaces: [ { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: { name: '*water1', gl_texture: waterTexture } }, polys: { numverts: 4, verts: [ [ - 128, - 112, 0, 0, 0 ], [ 128, - 112, 0, 1, 0 ], [ 128, 208, 0, 1, 1 ], [ - 128, 208, 0, 0, 1 ] ], next: null } } ], firstmodelsurface: 0, nummodelsurfaces: 1, nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ], numleafs: 1 };
const lightWorld = { lightdata: samples, surfaces: [ surface ], nodes: [ { contents: 0, plane, firstsurface: 0, numsurfaces: 1, children: [ leaf, { contents: - 2 } ] } ] };
post.R_BuildWorldLights( model ); quake.d_lightstylevalue[ 0 ] = 256;
const gl = renderer.getContext(), viewport = { lx: 0, ly: 0, lw: 480, lh: 270 }, pixels = () => { const p = new Uint8Array( 480 * 270 * 4 ); gl.readPixels( 0, 0, 480, 270, gl.RGBA, gl.UNSIGNED_BYTE, p ); return p; };
let frame = 0, running = false, environment = 'dim', flashlightOn = false, flashlightAim = null, surfaceView = null;
const evidence = { reference: { frames: 152, durationMs: 10140, sourceSha256: 'f2fcae232fbb9c8c1c071c553b09e8dcda0aca4d3e82554b1d30e724c1fbf23c' }, frames: [], failures: [], checks: [], performance: null };
function publish( message ) { document.querySelector( '#status' ).textContent = message; document.querySelector( '#evidence' ).textContent = JSON.stringify( evidence, null, 2 ); }
function setEnvironment( mode ) {

	environment = mode; const k = mode === 'black' ? 0 : mode === 'bright' ? 3 : 1;
	floorMaterial.color.setScalar( k ); wallMaterial.color.setRGB( .065 * k, .045 * k, .025 * k ); quake.d_lightstylevalue[ 0 ] = mode === 'black' ? 0 : mode === 'bright' ? 512 : 256;
	// A MeshBasic ledge is baked radiance too; source-free checks must darken it.
	ledgeMaterial.color.setRGB( mode === 'black' ? 0 : .11, mode === 'black' ? 0 : .14, mode === 'black' ? 0 : .2 );
	lamp.visible = red.visible = mode !== 'black';

}
function draw( time, moving = false, z = 48, vertical = false ) {

	cl.time = time; quake.set_r_framecount( ++ frame );
	camera.up.set( 0, vertical ? 1 : 0, vertical ? 0 : 1 ); camera.position.set( moving ? Math.sin( time * .5 ) * 36 : 0, vertical ? 48 : - 160, z ); camera.lookAt( moving ? Math.sin( time * .3 ) * 32 : 0, vertical ? 48 : 64, vertical ? - 64 : - 12 ); if ( surfaceView ) {
		camera.up.set( 0, 1, 0 ); camera.position.set( 0, 48, surfaceView.depth );
		const angle = surfaceView.angle * Math.PI / 180;
		camera.lookAt( 0, 48 + Math.sin( angle ) * 100, surfaceView.depth + ( surfaceView.depth < 0 ? 1 : - 1 ) * Math.cos( angle ) * 100 );
	}
	camera.updateMatrixWorld();
	// Seed the live public beam deterministically for fixed-camera comparisons.
	cvar.Cvar_SetValue( 'r_flashlight', 0 ); flashlight.R_FlashlightUpdate( [ 0, 0, 0 ], [ 0, 1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] );
	if ( flashlightOn ) {
		cvar.Cvar_SetValue( 'r_flashlight', 1 );
		const forward = flashlightAim || camera.getWorldDirection( new THREE.Vector3() );
		const right = new THREE.Vector3().setFromMatrixColumn( camera.matrixWorld, 0 ), up = new THREE.Vector3().setFromMatrixColumn( camera.matrixWorld, 1 );
		flashlight.R_FlashlightUpdate( camera.position.toArray(), forward.toArray(), right.toArray(), up.toArray() );
	}
	post.R_PostSetUnderwater( surfaceView?.underwater ?? ( ( surfaceView ? surfaceView.depth : z ) < 0 ) ); post.R_PostBegin( renderer, true, 480, 270 );
	water.material = surfaceMaterial();
	if ( water.material.vertexColors ) surf.R_UpdateWaterTextureLight( waterGeometry, lightWorld );
	mist.R_MistFrame( scene, time );
	post.R_WaterProbesFrame( renderer, scene, camera, () => {} ); post.R_PostBind( renderer ); renderer.clear(); renderer.render( scene, camera );
	leaf.visframe = frame;
	post.R_PostFinish( renderer, scene, camera, viewport, frame, [], [], time, 1, false );
	return gl.getError();

}
function delta( a, b, mask = null ) { let changed = 0, total = 0, maximum = 0; for ( let p = 0; p < a.length; p += 4 ) { if ( mask && ! mask( p / 4 ) ) continue; let d = 0; for ( let c = 0; c < 3; c ++ ) d = Math.max( d, Math.abs( a[ p + c ] - b[ p + c ] ) ); if ( d > 1 ) changed ++; maximum = Math.max( maximum, d ); total ++; } return { changed, total, maximum }; }
function check( name, passed, data ) { evidence.checks.push( { name, passed, ...data } ); if ( ! passed ) evidence.failures.push( name ); }
document.querySelector( '#checks' ).onclick = async () => {

	if ( running ) return; running = true; evidence.checks = []; evidence.failures = []; flashlightOn = false; flashlightAim = null; cvar.Cvar_SetValue( 'r_newer_lighting', 0 ); setEnvironment( 'dim' );
	cvar.Cvar_SetValue( 'r_reflect', 0 ); cvar.Cvar_SetValue( 'r_newer_water', 1 ); draw( 1 ); const refractA = pixels(); draw( 2.7 ); const refractB = pixels(); const rd = delta( refractA, refractB ); check( 'animated refraction with reflections disabled', rd.changed > 15, rd );
	const centre = ledge.position.clone().project( camera ), px = ( centre.x * .5 + .5 ) * 480, py = ( centre.y * .5 + .5 ) * 270;
	const foreground = i => Math.abs( i % 480 - px ) < 5 && Math.abs( Math.floor( i / 480 ) - py ) < 5;
	const fd = delta( refractA, refractB, foreground ); check( 'dry foreground ledge is not bent into water', fd.changed === 0 && fd.total > 0, fd );
	cvar.Cvar_SetValue( 'r_newer_water', 0 ); draw( 1 ); const nativeA = pixels(); draw( 2.7 ); const nativeB = pixels(); const nd = delta( nativeA, nativeB ); check( 'water-off stable native surface', nd.changed === 0, nd );
	cvar.Cvar_SetValue( 'r_newer_water', 1 ); cvar.Cvar_SetValue( 'r_reflect', .8 ); cvar.Cvar_SetValue( 'r_reflect_screen', 0 );
	// Remove transmitted floor/texture colour so temporal differences in this
	// ROI must come from reflected light, not refraction of the checkerboard.
	floorMaterial.color.setScalar(0);quake.d_lightstylevalue[0]=0;draw(1);const probeA=pixels();draw(2.7);const probeB=pixels();
	const waterOnly=i=>Math.floor(i/480)<140&&i%480>150&&i%480<300;
	const pd=delta(probeA,probeB,waterOnly);check('cached probe reflection ripples with SSR disabled',pd.changed>15,pd);
	cvar.Cvar_SetValue('r_reflect',0);draw(1);const noReflection=pixels();const reflectedSignal=delta(probeA,noReflection,waterOnly);check('reflected highlight is present over black transmitted water',reflectedSignal.changed>15,reflectedSignal);
	setEnvironment('dim');
	setEnvironment( 'black' ); cvar.Cvar_SetValue( 'r_reflect', 0 ); cvar.Cvar_SetValue( 'r_caustics', 1 ); draw( 1 ); const dark = pixels(); const lower = i => i % 480 > 180 && i % 480 < 300 && Math.floor( i / 480 ) < 75; let darkMax = 0; for(let i=0;i<dark.length/4;i++)if(lower(i))darkMax=Math.max(darkMax,dark[i*4],dark[i*4+1],dark[i*4+2]); check( 'unlit water and caustics do not glow', darkMax === 0, { maximum: darkMax } );
	setEnvironment( 'bright' ); draw( 1 ); const bright = pixels(); const bd = delta( dark, bright, lower ); check( 'water brightness responds to environment', bd.changed > 100, bd );
	setEnvironment( 'dim' ); cvar.Cvar_SetValue( 'r_reflect_screen', 1 ); cvar.Cvar_SetValue( 'r_reflect', .8 ); cvar.Cvar_SetValue( 'r_caustics', 0 ); const error = draw( 3 ); check( 'GPU shader compile/render', error === 0, { glError: error } );
	publish( evidence.failures.length ? 'FAIL — GPU checks' : 'PASS — GPU checks' ); running = false;

};
document.querySelector( '#motion' ).onclick = async () => {

	if ( running ) return; running = true; evidence.frames = [];
	const ledger = await ( await fetch( '/water-reference/frame-timing-ledger.json' ) ).json(); document.querySelector( '#reference' ).src = '/reference-water.gif?replay=' + Date.now();
	document.querySelector( '#captured-frames' ).replaceChildren();
	for ( const entry of ledger.frames ) {

		const started = performance.now(), error = draw( entry.start_ms / 1000, true );
		evidence.frames.push( { frame: entry.frame, referenceStartMs: entry.start_ms, referenceDurationMs: entry.duration_ms, glError: error } );
		const captured = document.createElement( 'img' ); captured.dataset.frame = String( entry.frame ); captured.src = renderer.domElement.toDataURL( 'image/png' ); document.querySelector( '#captured-frames' ).append( captured );
		if ( error ) evidence.failures.push( `GPU frame ${entry.frame}` );
		publish( `Comparing complete sequence: ${entry.frame}/152` );
		await new Promise( r => setTimeout( r, Math.max( 0, entry.duration_ms - ( performance.now() - started ) ) ) );

	}
	check( 'complete ordered temporal render coverage', evidence.frames.length === 152 && evidence.frames.every( ( f, i ) => f.frame === i + 1 && f.glError === 0 ), { rendered: evidence.frames.length } );
	publish( 'Complete 152-frame controlled motion trial recorded' ); running = false;

};
document.querySelector( '#perf' ).onclick = () => {

	if ( running ) return; for ( let i = 0; i < 10; i ++ ) draw( i * .1 ); gl.finish(); const start = performance.now();
	const syncPixel = new Uint8Array( 4 );
	for ( let i = 0; i < 120; i ++ ) { draw( i / 30 ); gl.readPixels( 240, 135, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel ); } const elapsed = performance.now() - start;
	evidence.performance = { frames: 120, width: 480, height: 270, elapsedMs: elapsed, meanMs: elapsed / 120, environment, method: 'one-pixel readback after each complete frame; synchronization overhead included' }; publish( 'Fixed-resolution controlled cost recorded' );

};
for ( const mode of [ 'dim', 'bright', 'black' ] ) document.querySelector( '#' + mode ).onclick = () => { setEnvironment( mode ); draw( 1 ); publish( mode + ' environment' ); };
draw( 0 ); publish( 'Ready — original GIF uses complete native timing; controlled scene is a raster comparison, not the same RTX scene' );

// Fixed-time lighting checks use the same full public frame pipeline as gameplay.
document.querySelector( '#flashlight-checks' ).onclick = () => {
	if ( running ) return; running = true; evidence.flashlightChecks = []; evidence.flashlightFailures = [];
	const record = ( name, passed, data ) => { evidence.flashlightChecks.push( { name, passed, ...data } ); if ( ! passed ) evidence.flashlightFailures.push( name ); };
	// Only rays reaching the submerged floor through the pool count. The
	// rectangular crop also contains part of the dry ledge, whose diffuse
	// flashlight response must not be mistaken for a water-surface glint.
	let mask = null;
	const waterROI = i => mask ? mask[ i ] !== 0 : Math.floor( i / 480 ) < 140 && i % 480 > 150 && i % 480 < 300;
	function updateWaterMask() {
		mask = null; const next = new Uint8Array( 480 * 270 ), ray = new THREE.Raycaster(), point = new THREE.Vector3(), plane = new THREE.Plane( new THREE.Vector3( 0, 0, 1 ), 0 );
		for ( let i = 0; i < next.length; i ++ ) {
			if ( ! waterROI( i ) ) continue;
			ray.setFromCamera( new THREE.Vector2( ( i % 480 + .5 ) / 480 * 2 - 1, ( Math.floor( i / 480 ) + .5 ) / 270 * 2 - 1 ), camera );
			if ( ! ray.ray.intersectPlane( plane, point ) || point.x <= - 122 || point.x >= 122 || point.y <= - 106 || point.y >= 202 ) continue;
			if ( ray.intersectObjects( scene.children.filter( o => o !== water ), false )[ 0 ]?.object === floor ) next[ i ] = 1;
		}
		mask = next;
	}
	cvar.Cvar_SetValue( 'r_newer_water', 1 ); cvar.Cvar_SetValue( 'r_newer_lighting', 1 ); cvar.Cvar_SetValue( 'r_caustics', 0 ); cvar.Cvar_SetValue( 'r_reflect_screen', 0 ); setEnvironment( 'dim' );
	flashlightOn = false; cvar.Cvar_SetValue( 'r_reflect', .8 ); draw( 1 ); updateWaterMask(); const envOff = pixels();
	cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 ); const baseOff = pixels();
	flashlightOn = true; cvar.Cvar_SetValue( 'r_reflect', .8 ); draw( 1 ); const envOn = pixels();
	cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 ); const baseOn = pixels();
	const reflectionOff = delta( envOff, baseOff, waterROI ), reflectionOn = delta( envOn, baseOn, waterROI );
	record( 'environment reflection remains present with flashlight on', reflectionOff.changed > 100 && reflectionOn.changed > 100, { flashlightOff: reflectionOff, flashlightOn: reflectionOn } );
	// Black transmission removes diffuse floor/texture light; probes/SSR are off.
	floorMaterial.color.setScalar( 0 ); quake.d_lightstylevalue[ 0 ] = 0;
	flashlightOn = false; draw( 1, false, 80, true ); updateWaterMask(); const glintOff = pixels();
	flashlightOn = true; draw( 1, false, 80, true ); const glintOn = pixels(); const glint = delta( glintOff, glintOn, waterROI );
	record( 'flashlight produces surface glints over black transmission with reflections off', glint.changed > 15, glint );
	flashlightAim = new THREE.Vector3( 0, - 1, 0 ); draw( 1, false, 80, true ); const away = delta( glintOff, pixels(), waterROI );
	record( 'beam aimed away does not light water', away.changed === 0, away );
	flashlightAim = null;
	const blocker = new THREE.Mesh( new THREE.BoxGeometry( 20, 160, 2 ), new THREE.MeshBasicMaterial( { color: 0 } ) ); blocker.position.set( 14, 48, 40 ); scene.add( blocker );
	flashlightOn = false; draw( 1, false, 80, true ); updateWaterMask(); const blockedOff = pixels(); flashlightOn = true; draw( 1, false, 80, true ); const blockedOn = pixels();
	let shadowCandidates = 0, shadowed = 0;
	for ( let i = 0; i < glintOff.length / 4; i ++ ) {
		if ( ! waterROI( i ) ) continue;
		const p = i * 4, glintSignal = Math.max( ...[ 0, 1, 2 ].map( c => glintOn[ p + c ] - glintOff[ p + c ] ) );
		const dryChange = Math.max( ...[ 0, 1, 2 ].map( c => Math.abs( blockedOff[ p + c ] - glintOff[ p + c ] ) ) );
		if ( glintSignal <= 5 || dryChange > 1 ) continue;
		shadowCandidates ++;
		const blockedSignal = Math.max( ...[ 0, 1, 2 ].map( c => blockedOn[ p + c ] - blockedOff[ p + c ] ) );
		if ( blockedSignal < glintSignal * .5 ) shadowed ++;
	}
	record( 'opaque occluder shadows visible water glints', shadowCandidates > 15 && shadowed > 15, { candidates: shadowCandidates, shadowed } );
	scene.remove( blocker ); blocker.geometry.dispose(); blocker.material.dispose();
	for ( const [ name, height ] of [ [ 'grazing', 20 ], [ 'downward', 120 ] ] ) {
		flashlightOn = false; draw( 1, false, height ); updateWaterMask(); const off = pixels(); flashlightOn = true; const error = draw( 1, false, height ), response = delta( off, pixels(), waterROI );
		record( 'bounded flashlight water response at ' + name + ' angle', error === 0 && response.total > 100 && response.maximum < 128, { ...response, glError: error } );
	}
	flashlightAim = null; cvar.Cvar_SetValue( 'r_newer_lighting', 0 ); draw( 1 ); updateWaterMask(); const inactiveOn = pixels(); flashlightOn = false; draw( 1 ); const inactive = delta( inactiveOn, pixels() );
	record( 'lighting off suppresses flashlight contribution', inactive.changed === 0, inactive );
	cvar.Cvar_SetValue( 'r_newer_lighting', 1 );
	// Aim above water at opaque wall: lit reflected receivers can contribute,
	// while direct surface glint remains out of the cone.
	flashlightAim = new THREE.Vector3( 0, 1, .25 ).normalize(); cvar.Cvar_SetValue( 'r_reflect', .8 ); cvar.Cvar_SetValue( 'r_reflect_screen', 1 );
	flashlightOn = false; draw( 1 ); const wallOff = pixels(); flashlightOn = true; draw( 1 ); const wallOn = pixels(); const wallLight = delta( wallOff, wallOn, waterROI );
	cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 ); const noSSR = pixels(); flashlightOn = false; draw( 1 ); const noSSROff = pixels(); const directOnly = delta( noSSR, noSSROff, waterROI );
	record( 'flashlight-lit opaque SSR receiver is reflected into water', wallLight.changed > 15 && directOnly.changed === 0, { reflected: wallLight, directOnly } );
	flashlightAim = null; flashlightOn = true; cvar.Cvar_SetValue( 'r_reflect', .8 ); const error = draw( 1 );
	record( 'flashlight water shader compiles and renders', error === 0, { glError: error } );
	publish( evidence.flashlightFailures.length ? 'FAIL — flashlight water checks' : 'PASS — flashlight water checks' ); running = false;
};
document.querySelector( '#flashlight' ).onclick = () => { flashlightOn = ! flashlightOn; cvar.Cvar_SetValue( 'r_newer_lighting', 1 ); setEnvironment( 'dim' ); draw( 1 ); publish( 'Flashlight ' + ( flashlightOn ? 'on' : 'off' ) ); };

// Four authored appearances, same geometry/camera/time; no image filters.
document.querySelector( '#looks' ).onclick = () => {
	if ( running ) return; running = true; document.body.classList.add( 'looks-preview' ); evidence.looks = []; evidence.lookFailures = [];
	const record = ( name, passed, data ) => { evidence.looks.push( { name, passed, ...data } ); if ( ! passed ) evidence.lookFailures.push( name ); };
	const views = document.querySelector( '#look-views' ); views.replaceChildren();
	cvar.Cvar_SetValue( 'r_newer_water', 1 ); cvar.Cvar_SetValue( 'r_newer_lighting', 1 ); cvar.Cvar_SetValue( 'r_reflect', .8 ); cvar.Cvar_SetValue( 'r_reflect_screen', 1 ); cvar.Cvar_SetValue( 'r_caustics', 1 ); cvar.Cvar_SetValue( 'r_mist', .6 ); flashlightOn = false; flashlightAim = null; setEnvironment( 'bright' );
	const summaries = [];
	const region = i => i % 480 > 170 && i % 480 < 285 && Math.floor( i / 480 ) > 32 && Math.floor( i / 480 ) < 100;
	for ( let look = 1; look <= 4; look ++ ) {
		cvar.Cvar_SetValue( 'r_water_look', look ); const error = draw( 1 ); const image = pixels();
		const sum = [ 0, 0, 0 ], values = []; let count = 0;
		for ( let i = 0; i < image.length / 4; i ++ ) if ( region( i ) ) { count ++; for ( let c = 0; c < 3; c ++ ) sum[ c ] += image[ i * 4 + c ]; values.push( image[ i * 4 ] * .2126 + image[ i * 4 + 1 ] * .7152 + image[ i * 4 + 2 ] * .0722 ); }
		values.sort( ( a, b ) => a - b );
		const summary = { look: post.LIQUID_LOOKS[ look - 1 ].name, glError: error, meanRGB: sum.map( x => x / count ), luminanceRange: values[ Math.floor( values.length * .9 ) ] - values[ Math.floor( values.length * .1 ) ], textureRetained: water.material.map === waterTexture, opacity: water.material.opacity, physicalKind: post.R_GetLiquidRegions()[ 0 ].kind, mist: scene.children.some( o => o.visible && o.userData.liquidToxicMist ) }; summaries.push( summary );
		record( summary.look + ' renders with original texture and immutable liquid kind', error === 0 && summary.textureRetained && summary.physicalKind === 0, summary );
		const figure = document.createElement( 'figure' ), caption = document.createElement( 'figcaption' ), capture = document.createElement( 'img' ); caption.textContent = summary.look; capture.src = renderer.domElement.toDataURL( 'image/png' ); capture.dataset.look = summary.look; figure.append( caption, capture ); views.append( figure );
		cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 ); const reflection = delta( image, pixels(), region );
		record( summary.look + ' retains environmental reflection', reflection.changed > 15, reflection );
		cvar.Cvar_SetValue( 'r_reflect', .8 );
	}
	record( 'clear retains more floor contrast than muddy', summaries[ 0 ].luminanceRange > summaries[ 2 ].luminanceRange, { clear: summaries[ 0 ].luminanceRange, muddy: summaries[ 2 ].luminanceRange } );
	record( 'tint increases green relative to red compared with clear', summaries[ 1 ].meanRGB[ 1 ] / summaries[ 1 ].meanRGB[ 0 ] > summaries[ 0 ].meanRGB[ 1 ] / summaries[ 0 ].meanRGB[ 0 ], { clear: summaries[ 0 ].meanRGB, tinted: summaries[ 1 ].meanRGB } );
	record( 'muddy is warm brown and toxic is vivid green with mist', summaries[ 2 ].meanRGB[ 0 ] > summaries[ 2 ].meanRGB[ 2 ] && summaries[ 3 ].meanRGB[ 1 ] > summaries[ 3 ].meanRGB[ 0 ] * 1.25 && summaries[ 3 ].mist, { muddy: summaries[ 2 ].meanRGB, toxic: summaries[ 3 ].meanRGB } );
	for ( let look = 1; look <= 3; look ++ ) {
		cvar.Cvar_SetValue( 'r_water_look', look ); setEnvironment( 'black' ); cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 ); const image = pixels(); let maximum = 0;
		for ( let i = 0; i < image.length / 4; i ++ ) if ( region( i ) ) maximum = Math.max( maximum, image[ i * 4 ], image[ i * 4 + 1 ], image[ i * 4 + 2 ] );
		record( post.LIQUID_LOOKS[ look - 1 ].name + ' has no source-free glow', maximum === 0, { maximum } );
	}
	cvar.Cvar_SetValue( 'r_water_look', 0 ); setEnvironment( 'dim' ); cvar.Cvar_SetValue( 'r_reflect', .8 ); draw( 1 );
	publish( evidence.lookFailures.length ? 'FAIL — four water looks' : 'PASS — four water looks' ); running = false;
};

// The water interface is measured over a real flat-radiance environment, then
// from below over a black receiver: no source image/filter determines the result.
document.querySelector( '#surface-checks' ).onclick = async () => {
	if ( running ) return; running = true; evidence.surfaceChecks = []; evidence.surfaceFailures = []; document.body.classList.add( 'looks-preview' );
	const record = ( name, passed, data ) => { evidence.surfaceChecks.push( { name, passed, ...data } ); if ( ! passed ) evidence.surfaceFailures.push( name ); };
	const output = document.querySelector( '#look-views' ); output.replaceChildren();
	function capture( label ) { const f = document.createElement( 'figure' ), c = document.createElement( 'figcaption' ), i = document.createElement( 'img' ); c.textContent = label; i.dataset.surface = label; i.src = renderer.domElement.toDataURL( 'image/png' ); f.append( c, i ); output.append( f ); }
	const centre = i => Math.abs( i % 480 - 240 ) < 4 && Math.abs( Math.floor( i / 480 ) - 135 ) < 4;
	function mean( p, mask = centre ) { let sum = 0, n = 0; for ( let i = 0; i < p.length / 4; i ++ ) if ( mask( i ) ) { sum += .2126 * p[ i * 4 ] + .7152 * p[ i * 4 + 1 ] + .0722 * p[ i * 4 + 2 ]; n ++; } return sum / n; }
	const originalFloorZ = floor.position.z, originalBackground = scene.background, originalFloorGeometry = floor.geometry;
	const originalVisibility = [ wall, lamp, red, ledge ].map( o => o.visible );
	try {
		for ( const [ name, value ] of [ [ 'r_newer_lighting', 0 ], [ 'r_newer_water', 1 ], [ 'r_water_look', 1 ], [ 'r_reflect_screen', 0 ], [ 'r_reflect', .6 ], [ 'r_caustics', 0 ], [ 'r_mist', 0 ] ] ) cvar.Cvar_SetValue( name, value );
		flashlightOn = false; flashlightAim = null; setEnvironment( 'dim' ); floorMaterial.color.setScalar( 0 ); quake.d_lightstylevalue[ 0 ] = 0;
		// Uniform reflected radiance and a black opaque receiver at every angle
		// isolate Fresnel response from changing wall/sky coverage.
		for ( const o of [ wall, lamp, red, ledge ] ) o.visible = false;
		floor.geometry = new THREE.PlaneGeometry( 8192, 8192 );
		scene.background = new THREE.Color( .8, .8, .8 ); probes.R_WaterProbeClear();
		// Exclude the black calibration receiver from the environment capture,
		// giving the angle test constant cube radiance even after box projection.
		floor.visible = water.visible = false; surfaceView = { depth: 8, angle: 0 }; draw( 1 ); floor.visible = water.visible = true;
		const angles = [];
		for ( const angle of [ 0, 45, 75, 85 ] ) {
			surfaceView = { depth: 8, angle }; const error = draw( 1 ), on = pixels(); capture( 'Above ' + angle + ' degrees from normal' );
			cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 ); const off = pixels(); cvar.Cvar_SetValue( 'r_reflect', .6 );
			const signal = mean( on ) - mean( off ); angles.push( { angle, signal, glError: error } );
		}
		record( 'grazing surface reflection strengthens while perpendicular transmission stays clear', angles.every( x => x.glError === 0 ) && angles[ 3 ].signal > angles[ 2 ].signal && angles[ 2 ].signal > angles[ 1 ].signal && angles[ 1 ].signal > angles[ 0 ].signal && angles[ 0 ].signal < angles[ 3 ].signal * .35, { angles } );
		floor.position.z = - 256;
		// Internal reflection has a different physical source: capture the real
		// black submerged receiver. Preserve the public one-capture/second limit.
		probes.R_WaterProbeClear(); await new Promise( resolve => setTimeout( resolve, 1100 ) );
		surfaceView = { depth: 8, angle: 0 }; draw( 1 );
		surfaceView = { depth: - 8, angle: 0 }; const upError = draw( 1 ), windowPixels = pixels(); capture( 'Below: clear Snell window' );
		surfaceView = { depth: - 8, angle: 65 }; const tirError = draw( 1 ), tir = pixels(); capture( 'Below: internal reflection' );
		cvar.Cvar_SetValue( 'r_reflect', .2 ); draw( 1 ); const weaker = pixels();
		record( 'internal reflection suppresses air outside Snell window even at lower enabled strength', upError === 0 && tirError === 0 && mean( windowPixels ) > mean( tir ) + 20 && delta( tir, weaker, centre ).changed === 0, { normalWindowMean: mean( windowPixels ), outsideWindowMean: mean( tir ), lowerStrengthDifference: delta( tir, weaker, centre ) } );
		cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 ); const optedOut = pixels();
		record( 'reflection off remains an explicit underwater optics opt-out', mean( optedOut ) > mean( tir ) + 20, { reflectionOffMean: mean( optedOut ), enabledMean: mean( tir ) } );
		cvar.Cvar_SetValue( 'r_reflect', .6 ); surfaceView.underwater = false; draw( 1 );
		record( 'dry-view classification prevents a fabricated underside at the same low coordinates', delta( optedOut, pixels(), centre ).changed === 0, delta( optedOut, pixels(), centre ) );
		surfaceView.underwater = true;
		const foreground = new THREE.Mesh( new THREE.BoxGeometry( 64, 64, 2 ), new THREE.MeshBasicMaterial( { color: new THREE.Color( .1, .2, .4 ) } ) ); foreground.position.set( 0, 48, - 2 ); scene.add( foreground );
		surfaceView = { depth: - 8, angle: 0 }; draw( 1 ); const foregroundOn = pixels(); cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 );
		record( 'opaque foreground before the underside is not replaced by water optics', delta( foregroundOn, pixels(), centre ).changed === 0, delta( foregroundOn, pixels(), centre ) );
		scene.remove( foreground ); foreground.geometry.dispose(); foreground.material.dispose();
		cvar.Cvar_SetValue( 'r_reflect', .6 ); surfaceView = { depth: - 8, angle: 35 }; draw( 1 ); const near = pixels();
		surfaceView = { depth: - 40, angle: 35 }; const midError = draw( 1 ), middle = pixels(); capture( 'Below: surface 40 units away' );
		surfaceView = { depth: - 90, angle: 35 }; const farError = draw( 1 ), far = pixels(); capture( 'Below: surface 90 units away' );
		const nearMid = delta( near, middle ), midFar = delta( middle, far );
		record( 'underside provides changing perspective and attenuation cues at multiple depths', midError === 0 && farError === 0 && nearMid.changed > 100 && midFar.changed > 100, { nearToMiddle: nearMid, middleToFar: midFar } );
		// Clear, lit floor: caustics modulate received light and remain below it.
		surfaceView = null; floor.geometry.dispose(); floor.geometry = originalFloorGeometry; floor.position.z = originalFloorZ; scene.background = originalBackground; [ wall, lamp, red, ledge ].forEach( ( o, i ) => { o.visible = originalVisibility[ i ]; } ); setEnvironment( 'bright' ); cvar.Cvar_SetValue( 'r_reflect', 0 ); cvar.Cvar_SetValue( 'r_caustics', 0 ); draw( 1, false, 80, true ); const noCaustics = pixels();
		cvar.Cvar_SetValue( 'r_caustics', 1 ); const csError = draw( 1, false, 80, true ), caustics = pixels(); capture( 'Clear: stronger floor caustics' );
		record( 'received-light caustics illuminate the submerged floor', csError === 0 && delta( noCaustics, caustics, centre ).changed > 15 && mean( caustics ) > mean( noCaustics ), { delta: delta( noCaustics, caustics, centre ), beforeMean: mean( noCaustics ), causticMean: mean( caustics ) } );
		setEnvironment( 'black' ); draw( 1, false, 80, true ); const black = pixels(); let maximum = 0; for ( let i = 0; i < black.length / 4; i ++ ) if ( centre( i ) ) maximum = Math.max( maximum, black[ i * 4 ], black[ i * 4 + 1 ], black[ i * 4 + 2 ] );
		record( 'stronger clear caustics still do not manufacture light', maximum === 0, { maximum } );
	} finally {
		floor.visible = water.visible = true; surfaceView = null; if ( floor.geometry !== originalFloorGeometry ) { floor.geometry.dispose(); floor.geometry = originalFloorGeometry; } floor.position.z = originalFloorZ; scene.background = originalBackground; [ wall, lamp, red, ledge ].forEach( ( o, i ) => { o.visible = originalVisibility[ i ]; } ); cvar.Cvar_SetValue( 'r_water_look', 0 ); cvar.Cvar_SetValue( 'r_reflect', .8 ); cvar.Cvar_SetValue( 'r_caustics', 0 ); setEnvironment( 'dim' ); post.R_PostSetUnderwater( false ); probes.R_WaterProbeClear();
	}
	publish( evidence.surfaceFailures.length ? 'FAIL — water interface checks' : 'PASS — water interface checks' ); running = false;
};

// Each visible marker must contribute in its own wet reflection region.
document.querySelector( '#marker-checks' ).onclick = async () => {
	if ( running ) return; running = true; evidence.markerChecks = []; evidence.markerFailures = [];
	const record = ( name, passed, data ) => { evidence.markerChecks.push( { name, passed, ...data } ); if ( ! passed ) evidence.markerFailures.push( name ); };
	const markers = [ [ 'gold lamp', lamp ], [ 'red marker', red ], [ 'blue ledge', ledge ] ];
	const wallColour = wallMaterial.color.clone();
	try {
		for ( const [ name, value ] of [ [ 'r_newer_water', 1 ], [ 'r_newer_lighting', 0 ], [ 'r_water_look', 3 ], [ 'r_reflect', .6 ], [ 'r_mist', 0 ], [ 'r_caustics', 0 ] ] ) cvar.Cvar_SetValue( name, value );
		setEnvironment( 'dim' ); floorMaterial.color.setScalar( 0 ); wallMaterial.color.setScalar( 0 ); quake.d_lightstylevalue[ 0 ] = 0; flashlightOn = false; surfaceView = null;
		const masks = new Map(); draw( 1 ); const ray = new THREE.Raycaster(), plane = new THREE.Plane( new THREE.Vector3( 0, 0, 1 ), 0 ), hit = new THREE.Vector3();
		for ( const [ name, marker ] of markers ) {
			const virtual = marker.position.clone(); virtual.z *= - 1; virtual.project( camera );
			const cx = ( virtual.x * .5 + .5 ) * 480, cy = ( virtual.y * .5 + .5 ) * 270, mask = new Uint8Array( 480 * 270 );
			for ( let i = 0; i < mask.length; i ++ ) {
				if ( Math.abs( i % 480 - cx ) > 18 || Math.abs( Math.floor( i / 480 ) - cy ) > 18 ) continue;
				ray.setFromCamera( new THREE.Vector2( ( i % 480 + .5 ) / 480 * 2 - 1, ( Math.floor( i / 480 ) + .5 ) / 270 * 2 - 1 ), camera );
				if ( ! ray.ray.intersectPlane( plane, hit ) || hit.x <= - 122 || hit.x >= 122 || hit.y <= - 106 || hit.y >= 202 ) continue;
				const receiver = ray.intersectObjects( scene.children.filter( o => o !== water ), false )[ 0 ];
				if ( receiver && receiver.point.z < - .5 ) mask[ i ] = 1;
			}
			// Keep the reflected-region measurement two pixels away from dry
			// silhouettes and ROI edges; bilinear transmission mixes edge texels.
			const interior = mask.slice();
			for ( let i = 0; i < mask.length; i ++ ) if ( mask[ i ] ) {
				for ( let dy = - 2; dy <= 2 && interior[ i ]; dy ++ ) for ( let dx = - 2; dx <= 2; dx ++ ) {
					const x = i % 480 + dx, y = Math.floor( i / 480 ) + dy;
					if ( x < 0 || x >= 480 || y < 0 || y >= 270 || ! mask[ y * 480 + x ] ) { interior[ i ] = 0; break; }
				}
			}
			masks.set( name, interior );
		}
		for ( const screen of [ 1, 0 ] ) for ( const [ name, marker ] of markers ) {
			cvar.Cvar_SetValue( 'r_reflect_screen', screen ); const mask = i => masks.get( name )[ i ] !== 0;
			// Freeze cached radiance while testing the on-screen source. For the
			// fallback-only case, use the public capture rate for each visibility.
			marker.visible = false; if ( screen === 0 ) { await new Promise( r => setTimeout( r, 1100 ) ); probes.R_WaterProbeClear(); } draw( 1 ); const off = pixels();
			marker.visible = true; if ( screen === 0 ) { await new Promise( r => setTimeout( r, 1100 ) ); probes.R_WaterProbeClear(); } draw( 1 ); const on = pixels(), response = delta( off, on, mask );
			if ( screen === 0 && marker === ledge ) {
				// One box-parallax capture cannot relocate every interior object.
				// The combined renderer's visible ledge is proved by SSR above.
				evidence.interiorProbeDiagnostic = { name, ...response, qualification: 'Approximate single-box fallback; no exact interior-object coverage claim' };
			} else record( name + ' contributes in its reflected water region with ' + ( screen ? 'SSR' : 'cached probe only' ), response.changed > 5, { ...response, screen } );
			if ( screen === 1 ) {
				marker.visible = false; draw( 3 ); const offLater = pixels(); marker.visible = true; draw( 3 ); const onLater = pixels();
				const firstContribution = new Int16Array( on.length ), laterContribution = new Int16Array( on.length );
				for ( let p = 0; p < on.length; p ++ ) { firstContribution[ p ] = on[ p ] - off[ p ]; laterContribution[ p ] = onLater[ p ] - offLater[ p ]; }
				cvar.Cvar_SetValue( 'r_reflect', 0 ); marker.visible = false; draw( 1 ); const disabled = pixels(); marker.visible = true; draw( 1 ); const disabledOn = pixels(), control = delta( disabled, disabledOn, mask );
				marker.visible = false; draw( 3 ); const disabledLater = pixels(); marker.visible = true; draw( 3 ); const disabledOnLater = pixels();
				for ( let p = 0; p < on.length; p ++ ) { firstContribution[ p ] -= disabledOn[ p ] - disabled[ p ]; laterContribution[ p ] -= disabledOnLater[ p ] - disabledLater[ p ]; }
				const rgb = marker.material.color, channel = rgb.b > rgb.r && rgb.b > rgb.g ? 2 : rgb.g > rgb.r ? 1 : 0;
				let positive = 0; for ( let i = 0; i < on.length / 4; i ++ ) if ( mask( i ) && firstContribution[ i * 4 + channel ] > 2 ) positive ++;
				record( name + ' has positive reflected colour after subtracting transmission controls', positive > 5, { positive, channel, transmissionControl: control } );
				const shimmer = delta( firstContribution, laterContribution, mask ); record( name + ' isolated reflected contribution has an animated shimmer', shimmer.changed > 5, shimmer ); cvar.Cvar_SetValue( 'r_reflect', .6 );
			}
		}
	} finally {
		markers.forEach( ( [ , marker ] ) => { marker.visible = true; } ); cvar.Cvar_SetValue( 'r_reflect_screen', 1 ); cvar.Cvar_SetValue( 'r_water_look', 0 ); cvar.Cvar_SetValue( 'r_mist', .6 ); setEnvironment( 'dim' ); wallMaterial.color.copy( wallColour ); probes.R_WaterProbeClear();
	}
	publish( evidence.markerFailures.length ? 'FAIL — reflected marker checks' : 'PASS — reflected marker checks' ); running = false;
};

// Calibrated colour detail travels through the actual water volume. Equal
// source luminance keeps the sediment light field stable between colours.
document.querySelector( '#muddy-depth-checks' ).onclick = () => {
	if ( running ) return; running = true; evidence.muddyDepthChecks = []; evidence.muddyDepthFailures = [];
	const record = ( name, passed, data ) => { evidence.muddyDepthChecks.push( { name, passed, ...data } ); if ( ! passed ) evidence.muddyDepthFailures.push( name ); };
	const originalGeometry = floor.geometry, originalMap = floorMaterial.map, originalPolys = model.surfaces[ 0 ].polys;
	const visible = [ wall, lamp, red, ledge, water ].map( o => o.visible );
	const centre = i => Math.abs( i % 480 - 240 ) < 4 && Math.abs( Math.floor( i / 480 ) - 135 ) < 4;
	function colourDifference( a, b ) { let sum = 0, count = 0; for ( let i = 0; i < a.length / 4; i ++ ) if ( centre( i ) ) { sum += Math.abs( a[ i * 4 ] - b[ i * 4 ] ); count ++; } return sum / count; }
	try {
		for ( const [ name, value ] of [ [ 'r_newer_water', 1 ], [ 'r_newer_lighting', 0 ], [ 'r_water_look', 3 ], [ 'r_reflect', 0 ], [ 'r_mist', 0 ], [ 'r_caustics', 0 ] ] ) cvar.Cvar_SetValue( name, value );
		flashlightOn = false; setEnvironment( 'dim' ); [ wall, lamp, red, ledge, water ].forEach( o => { o.visible = false; } );
		floor.geometry = new THREE.PlaneGeometry( 4096, 4096 ); floorMaterial.map = null; floorMaterial.needsUpdate = true;
		model.surfaces[ 0 ].polys = { numverts: 4, verts: [ [ - 512, - 512, 0 ], [ 512, - 512, 0 ], [ 512, 512, 0 ], [ - 512, 512, 0 ] ], next: null }; post.R_BuildWorldLights( model );
		const colours = [ [ .6, .4, .2 ], [ .2, ( .6 * .2126 + .4 * .7152 + .2 * .0722 - .2 * .2126 - .19 * .0722 ) / .7152, .19 ] ];
		const contrasts = [], controls = [], means = [];
		for ( const angle of [ 0, 60, 75 ] ) {
			surfaceView = { depth: 32, angle }; const images = [];
			for ( const colour of colours ) { floorMaterial.color.setRGB( ...colour ); const error = draw( 1 ); images.push( pixels() ); if ( error ) throw new Error( 'Muddy depth GL error ' + error ); }
			contrasts.push( colourDifference( ...images ) ); let sum = 0, count = 0;
			for ( let i = 0; i < images[ 0 ].length / 4; i ++ ) if ( centre( i ) ) { sum += images[ 0 ][ i * 4 ]; count ++; } means.push( sum / count );
			cvar.Cvar_SetValue( 'r_newer_water', 0 ); const native = [];
			for ( const colour of colours ) { floorMaterial.color.setRGB( ...colour ); draw( 1 ); native.push( pixels() ); }
			controls.push( colourDifference( ...native ) ); cvar.Cvar_SetValue( 'r_newer_water', 1 );
		}
		const retained = contrasts.map( ( c, i ) => c / controls[ i ] );
		record( 'near Muddy volume retains distinguishable submerged source colours', contrasts[ 0 ] > 25 && retained[ 0 ] > .35, { angles: [ 0, 60, 75 ], contrasts, controls, retained, redMeans: means } );
		record( 'longer in-water paths progressively obscure the same floor colours', retained[ 0 ] > retained[ 1 ] && retained[ 1 ] > retained[ 2 ] && retained[ 2 ] < retained[ 0 ] * .5, { retained, approximateWaterPaths: [ 64, 128, 247 ] } );
		// Restore the textured, lit receiver and check every optical profile.
		floor.geometry.dispose(); floor.geometry = originalGeometry; floorMaterial.map = originalMap; floorMaterial.needsUpdate = true; model.surfaces[ 0 ].polys = originalPolys; post.R_BuildWorldLights( model ); surfaceView = null; water.visible = true; setEnvironment( 'bright' );
		for ( let choice = 1; choice <= 4; choice ++ ) {
			cvar.Cvar_SetValue( 'r_water_look', choice ); cvar.Cvar_SetValue( 'r_caustics', 0 ); draw( 1, false, 80, true ); const off = pixels();
			cvar.Cvar_SetValue( 'r_caustics', 1 ); const error = draw( 1, false, 80, true ), response = delta( off, pixels(), centre );
			record( post.LIQUID_LOOKS[ choice - 1 ].name + ' caustics remain visible on the transmitted lit floor', error === 0 && response.changed > 10, { ...response, glError: error } );
		}
	} finally {
		if ( floor.geometry !== originalGeometry ) { floor.geometry.dispose(); floor.geometry = originalGeometry; } floorMaterial.map = originalMap; floorMaterial.needsUpdate = true; model.surfaces[ 0 ].polys = originalPolys; post.R_BuildWorldLights( model );
		[ wall, lamp, red, ledge, water ].forEach( ( o, i ) => { o.visible = visible[ i ]; } ); surfaceView = null; cvar.Cvar_SetValue( 'r_water_look', 0 ); cvar.Cvar_SetValue( 'r_reflect', .6 ); cvar.Cvar_SetValue( 'r_mist', .6 ); cvar.Cvar_SetValue( 'r_caustics', 0 ); setEnvironment( 'dim' ); probes.R_WaterProbeClear();
	}
	publish( evidence.muddyDepthFailures.length ? 'FAIL — muddy depth checks' : 'PASS — muddy depth checks' ); running = false;
};

// Exercise the actual toxic sprites, animation and live control gates.
document.querySelector( '#vapour-checks' ).onclick = () => {
	if ( running ) return; running = true; evidence.vapourChecks = []; evidence.vapourFailures = [];
	const record = ( name, passed, data ) => { evidence.vapourChecks.push( { name, passed, ...data } ); if ( ! passed ) evidence.vapourFailures.push( name ); };
	try {
		cvar.Cvar_SetValue( 'r_newer_water', 1 ); cvar.Cvar_SetValue( 'r_water_look', 4 ); cvar.Cvar_SetValue( 'r_mist', .6 ); setEnvironment( 'bright' ); surfaceView = null; flashlightOn = false;
		const error = draw( 1 ), image = pixels(), stream = scene.children.find( o => o.userData.liquidToxicMist ), positions = stream.geometry.attributes.position.array.slice();
		const laterError = draw( 1.25 ), later = stream.geometry.attributes.position.array; let rising = 0, narrow = true;
		for ( let i = 0; i < later.length; i += 3 ) { if ( later[ i + 2 ] > positions[ i + 2 ] && later[ i + 2 ] - positions[ i + 2 ] < 3 ) rising ++; if ( Math.hypot( later[ i ] - positions[ i ], later[ i + 1 ] - positions[ i + 1 ] ) > 3 ) narrow = false; }
		record( 'small toxic streams rise slowly with narrow drift and retained geometry', error === 0 && laterError === 0 && stream.visible && scene.children.includes( stream ) && rising > positions.length / 3 * .75 && narrow, { sprites: positions.length / 3, rising, narrow, glError: laterError } );
		draw( 1 ); cvar.Cvar_SetValue( 'r_mist', 0 ); draw( 1 ); const hidden = delta( image, pixels() );
		record( 'toxic vapour is visibly rendered and the haze slider hides it', ! stream.visible && hidden.changed > 15, hidden );
		cvar.Cvar_SetValue( 'r_mist', .6 ); cvar.Cvar_SetValue( 'r_newer_water', 0 ); draw( 1 );
		record( 'liquids off hides toxic streams in the real scene', ! stream.visible, { visible: stream.visible } );
	} finally {
		cvar.Cvar_SetValue( 'r_newer_water', 1 ); cvar.Cvar_SetValue( 'r_water_look', 0 ); cvar.Cvar_SetValue( 'r_mist', .6 ); setEnvironment( 'dim' ); draw( 1 );
	}
	publish( evidence.vapourFailures.length ? 'FAIL — toxic vapour checks' : 'PASS — toxic vapour checks' ); running = false;
};

// Ordinary point/torch receiver radiance must be visible through SSR too.
document.querySelector( '#torch-checks' ).onclick = () => {
	if ( running ) return; running = true; evidence.torchChecks = []; evidence.torchFailures = [];
	const record = ( name, passed, data ) => { evidence.torchChecks.push( { name, passed, ...data } ); if ( ! passed ) evidence.torchFailures.push( name ); };
	const baseEntities = model.entities;
	function light( active, origin = '0 175 50' ) { model.entities = active ? '{ "classname" "light" "origin" "' + origin + '" "light" "400" "_color" "1 .6 .2" }' : baseEntities; post.R_BuildWorldLights( model ); }
	const cameraRay = new THREE.Raycaster(), point = new THREE.Vector3(), poolPlane = new THREE.Plane( new THREE.Vector3( 0, 0, 1 ), 0 ), mask = new Uint8Array( 480 * 270 );
	try {
		for ( const [ name, value ] of [ [ 'r_newer_lighting', 1 ], [ 'r_newer_water', 1 ], [ 'r_water_look', 1 ], [ 'r_reflect', .6 ], [ 'r_reflect_screen', 1 ], [ 'r_bounce', 0 ], [ 'r_caustics', 0 ], [ 'r_mist', 0 ] ] ) cvar.Cvar_SetValue( name, value );
		flashlightOn = false; surfaceView = null; setEnvironment( 'dim' ); floorMaterial.color.setScalar( 0 ); quake.d_lightstylevalue[ 0 ] = 0;
		light( false ); draw( 1 ); const off = pixels();
		for ( let i = 0; i < mask.length; i ++ ) {
			if ( Math.floor( i / 480 ) >= 140 || i % 480 <= 150 || i % 480 >= 300 ) continue;
			cameraRay.setFromCamera( new THREE.Vector2( ( i % 480 + .5 ) / 480 * 2 - 1, ( Math.floor( i / 480 ) + .5 ) / 270 * 2 - 1 ), camera );
			if ( ! cameraRay.ray.intersectPlane( poolPlane, point ) || point.x <= - 122 || point.x >= 122 || point.y <= - 106 || point.y >= 202 ) continue;
			if ( cameraRay.intersectObjects( scene.children.filter( o => o !== water ), false )[ 0 ]?.object === floor ) mask[ i ] = 1;
		}
		const waterOnly = i => mask[ i ] !== 0;
		light( true ); const error = draw( 1 ), on = pixels(); const illuminated = delta( off, on, waterOnly );
		record( 'ordinary warm light illuminates the reflected opaque wall', error === 0 && illuminated.changed > 30, { ...illuminated, glError: error } );
		cvar.Cvar_SetValue( 'r_reflect', 0 ); draw( 1 ); const noReflectionOn = pixels(); light( false ); draw( 1 ); const noReflectionOff = pixels(); const transmitted = delta( noReflectionOn, noReflectionOff, waterOnly );
		record( 'torch reflection test is isolated from black transmitted floor and dry ledge', transmitted.changed === 0, transmitted );
		cvar.Cvar_SetValue( 'r_reflect', .6 ); cvar.Cvar_SetValue( 'r_newer_lighting', 0 ); light( true ); draw( 1 ); const inactiveOn = pixels(); light( false ); draw( 1 ); const inactive = delta( inactiveOn, pixels(), waterOnly );
		record( 'lighting off keeps ordinary reflected-light shading inactive', inactive.changed === 0, inactive );
		// Same receiver/scene resolution, synchronized readback after every frame.
		cvar.Cvar_SetValue( 'r_newer_lighting', 1 ); const costs = [];
		for ( const active of [ false, true ] ) {
			light( active ); for ( let i = 0; i < 10; i ++ ) draw( 1 ); gl.finish(); const sync = new Uint8Array( 4 ), start = performance.now();
			for ( let i = 0; i < 90; i ++ ) { draw( 1 ); gl.readPixels( 240, 135, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync ); }
			costs.push( { ordinaryLight: active, frames: 90, width: 480, height: 270, meanMs: ( performance.now() - start ) / 90 } );
		}
		evidence.torchCost = { method: 'one-pixel readback per fixed-time full frame; includes main and reflected receiver lighting, not an isolated SSR cost or gameplay FPS', costs };
		// A black floor isolates incident-light sediment from old painted water.
		cvar.Cvar_SetValue( 'r_water_look', 3 ); cvar.Cvar_SetValue( 'r_reflect', 0 ); cvar.Cvar_SetValue( 'r_mist', 0 ); light( false ); draw( 1 ); const sedimentOff = pixels();
		light( true, '0 40 40' ); draw( 1 ); const sedimentOn = pixels(); const sediment = delta( sedimentOff, sedimentOn, waterOnly );
		record( 'Muddy body scatters incident light independently of a black floor and reflections', sediment.changed > 30, sediment );
		cvar.Cvar_SetValue( 'r_mist', 1 ); draw( 1 ); const hazed = pixels(), haze = delta( sedimentOn, hazed, waterOnly );
		record( 'Muddy near-surface haze responds to the mist control', haze.changed > 30, haze );
		light( false ); setEnvironment( 'black' ); draw( 1 ); const noSource = pixels(); let maximum = 0;
		for ( let i = 0; i < mask.length; i ++ ) if ( waterOnly( i ) ) maximum = Math.max( maximum, noSource[ i * 4 ], noSource[ i * 4 + 1 ], noSource[ i * 4 + 2 ] );
		record( 'Muddy incident-light sediment and haze do not emit without a source', maximum === 0, { maximum } );
	} finally {
		light( false ); cvar.Cvar_SetValue( 'r_bounce', 1 ); cvar.Cvar_SetValue( 'r_mist', .6 ); cvar.Cvar_SetValue( 'r_water_look', 0 ); cvar.Cvar_SetValue( 'r_reflect', .6 ); setEnvironment( 'dim' );
	}
	publish( evidence.torchFailures.length ? 'FAIL — ordinary reflected-light checks' : 'PASS — ordinary reflected-light checks' ); running = false;
};

// Compare the current compositor with its previous water constants in this
// fixture only. Same source pixels, camera, time, absorption and lights.
let restraintMode='current';
const restraintSources=new WeakMap(),restraintRender=renderer.render;
renderer.render=function(scene,camera){
 const material=scene.children[0]?.material;
 if(material?.uniforms?.uWaterCount && material.fragmentShader){
  if(!restraintSources.has(material))restraintSources.set(material,{source:material.fragmentShader,mode:null});
  const stored=restraintSources.get(material);
  if(stored.mode!==restraintMode){
   let source=stored.source;
   if(restraintMode==='previous')source=source.replace('liquidRipple( look ) * 0.65','liquidRipple( look )').replace('vec2( 0.004 * uProj[ 0 ][ 0 ] / uProj[ 1 ][ 1 ], 0.004 )','vec2( 0.012 * uProj[ 0 ][ 0 ] / uProj[ 1 ][ 1 ], 0.012 )').replace('clamp( offset * 0.35,','clamp( offset,');
   if(restraintMode==='straight')source=source.replace('uvd = waterRefractionUv( uvd );','uvd = uvd;');
   material.fragmentShader=source;material.needsUpdate=true;stored.mode=restraintMode;
  }
 }
 return restraintRender.call(this,scene,camera);
};
document.querySelector('#restraint-checks').onclick=()=>{
 if(running)return;running=true;evidence.checks=[];evidence.failures=[];flashlightOn=false;flashlightAim=null;surfaceView=null;
 setEnvironment('dim');cvar.Cvar_SetValue('r_newer_lighting',0);cvar.Cvar_SetValue('r_reflect',0);cvar.Cvar_SetValue('r_caustics',0);cvar.Cvar_SetValue('r_newer_water',1);cvar.Cvar_SetValue('r_water_look',1);
 const records=[];
 try{
  for(const time of [1,2.7]){
   const draws={};for(const mode of ['straight','previous','current']){restraintMode=mode;const error=draw(time,false,48);draws[mode]=pixels();check('restraint '+mode+' GPU t='+time,error===0,{glError:error});}
   // Interior submerged checker receiver only: exclude bank/ledge silhouettes.
   const roi=i=>{const x=i%480,y=Math.floor(i/480);return x>145&&x<285&&y>35&&y<90;};
   const difference=(a,b)=>{let sum=0,count=0;for(let i=0;i<a.length/4;i++)if(roi(i)){for(let c=0;c<3;c++)sum+=Math.abs(a[i*4+c]-b[i*4+c]);count+=3;}return sum/count;};
   const previous=difference(draws.previous,draws.straight),current=difference(draws.current,draws.straight);
   const sample={time,previousMeanDifference:previous,currentMeanDifference:current};records.push(sample);
   check('current refraction keeps submerged pattern closer to straight receiver t='+time,previous>.1&&current<previous*.85,sample);
  }
  evidence.restraint=records;
 }finally{restraintMode='current';draw(1);running=false;publish(evidence.failures.length?'FAIL — restrained water':'PASS — restrained water');}
};
