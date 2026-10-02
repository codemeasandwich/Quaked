await import( '../src/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/gl_post.js' ), anim = await import( '../src/r_anim.js' );
const surf = await import( '../src/gl_rsurf.js' ), cvar = await import( '../src/cvar.js' ), quake = await import( '../src/glquake.js' );
const mist = await import( '../src/r_mist.js' );
const flashlight = await import( '../src/r_flashlight.js' );
const { cl } = await import( '../src/client.js' );
const vars = [ post.r_water_look, post.r_mist, flashlight.r_flashlight, post.r_hdr, post.r_dynres, post.r_reflect, post.r_reflect_screen, post.r_caustics, post.r_bloom, post.r_volumetric, post.r_newbright, post.r_newcontrast, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
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
let frame = 0, running = false, environment = 'dim', flashlightOn = false, flashlightAim = null;
const evidence = { reference: { frames: 152, durationMs: 10140, sourceSha256: 'f2fcae232fbb9c8c1c071c553b09e8dcda0aca4d3e82554b1d30e724c1fbf23c' }, frames: [], failures: [], checks: [], performance: null };
function publish( message ) { document.querySelector( '#status' ).textContent = message; document.querySelector( '#evidence' ).textContent = JSON.stringify( evidence, null, 2 ); }
function setEnvironment( mode ) {

	environment = mode; const k = mode === 'black' ? 0 : mode === 'bright' ? 3 : 1;
	floorMaterial.color.setScalar( k ); wallMaterial.color.setRGB( .065 * k, .045 * k, .025 * k ); quake.d_lightstylevalue[ 0 ] = mode === 'black' ? 0 : mode === 'bright' ? 512 : 256;
	lamp.visible = red.visible = mode !== 'black';

}
function draw( time, moving = false, z = 48, vertical = false ) {

	cl.time = time; quake.set_r_framecount( ++ frame );
	camera.up.set( 0, vertical ? 1 : 0, vertical ? 0 : 1 ); camera.position.set( moving ? Math.sin( time * .5 ) * 36 : 0, vertical ? 48 : - 160, z ); camera.lookAt( moving ? Math.sin( time * .3 ) * 32 : 0, vertical ? 48 : 64, vertical ? - 64 : - 12 ); camera.updateMatrixWorld();
	// Seed the live public beam deterministically for fixed-camera comparisons.
	cvar.Cvar_SetValue( 'r_flashlight', 0 ); flashlight.R_FlashlightUpdate( [ 0, 0, 0 ], [ 0, 1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] );
	if ( flashlightOn ) {
		cvar.Cvar_SetValue( 'r_flashlight', 1 );
		const forward = flashlightAim || camera.getWorldDirection( new THREE.Vector3() );
		const right = new THREE.Vector3().setFromMatrixColumn( camera.matrixWorld, 0 ), up = new THREE.Vector3().setFromMatrixColumn( camera.matrixWorld, 1 );
		flashlight.R_FlashlightUpdate( camera.position.toArray(), forward.toArray(), right.toArray(), up.toArray() );
	}
	post.R_PostSetUnderwater( z < 0 ); post.R_PostBegin( renderer, true, 480, 270 );
	water.material = surfaceMaterial();
	if ( water.material.vertexColors ) surf.R_UpdateWaterTextureLight( waterGeometry, lightWorld );
	mist.R_MistFrame( scene, time );
	post.R_WaterProbesFrame( renderer, scene, camera, () => {} ); post.R_PostBind( renderer ); renderer.clear(); renderer.render( scene, camera );
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
