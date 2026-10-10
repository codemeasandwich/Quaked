await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const anim = await import( '../src/newer/render/r_anim.js' ), mode = await import( '../src/newer/mode.js' );
const quake = await import( '../src/engine/render/glquake.js' );
const surf = await import( '../src/engine/render/gl_rsurf.js' );
const light = await import( '../src/engine/render/gl_rlight.js' );
const split = await import( '../src/newer/render/r_demosplit.js' );
const { cl, cl_dlights } = await import( '../src/engine/client/client.js' );
const { R_ClassicTexture } = await import( '../src/newer/render/r_newertextures.js' );
const { R_SaveClassicScene, R_ClassicMaterial } = await import( '../src/newer/render/r_classicstate.js' );

function equal( a, b, label ) { if ( a !== b ) throw new Error( `${label}: expected ${b}, got ${a}` ); }
function texture( value = 20 ) { return new THREE.DataTexture( new Uint8Array( [ value, value, value, 255 ] ), 1, 1 ); }

Deno.test( 'classic scope overrides forced interpolation and every shared Newer gate without changing preferences', () => {

	const old = anim.r_lerpmodels.value;
	try {

		mode.R_AnimSetNewer( true ); mode.R_AnimSetLighting( true ); anim.r_lerpmodels.value = 2;
		equal( anim.R_AnimEnabled(), true, 'enhanced forced interpolation' );
		mode.R_AnimSetClassicPass( true );
		for ( const get of [ mode.R_NewerGame, mode.R_IsNewer, mode.R_NewerLightingActive, anim.R_AnimEnabled ] ) equal( get(), false, get.name );
		equal( anim.r_lerpmodels.value, 2, 'owner preference retained' );
		mode.R_AnimSetClassicPass( false );
		equal( mode.R_IsNewer(), true, 'enhanced restored' ); equal( mode.R_NewerLightingActive(), true, 'enhanced lighting restored' );

	} finally { anim.r_lerpmodels.value = old; mode.R_AnimSetClassicPass( false ); mode.R_AnimSetNewer( false ); mode.R_AnimSetLighting( false ); }

} );

Deno.test( 'native texture twins isolate filtering, original pixels, crate phase and disposal', () => {

	const source = texture( 90 ), base = texture( 30 ), variant = texture( 170 ), old = quake.gl_texturemode.value;
	try {

		source.magFilter = THREE.LinearFilter; source.anisotropy = 16;
		source.userData.classicImage = { data: new Uint8Array( [ 10, 10, 10, 255 ] ), width: 1, height: 1 };
		quake.gl_texturemode.value = 0;
		const twin = R_ClassicTexture( source );
		equal( twin.image.data[ 0 ], 10, 'original pixels' ); equal( twin.magFilter, THREE.NearestFilter, 'native filtering' );
		equal( twin.generateMipmaps, false, 'native non-mipmapped textures remain so' ); equal( twin.minFilter, THREE.NearestFilter, 'native non-mipmapped minification' );
		equal( twin.anisotropy, 1, 'no forced anisotropy' ); equal( source.magFilter, THREE.LinearFilter, 'enhanced filter preserved' );
		equal( R_ClassicTexture( base ).magFilter, THREE.NearestFilter, 'unreplaced texture also native' );
		variant.userData.classicBase = base; variant.offset.set( .25, .5 );
		equal( R_ClassicTexture( variant ), R_ClassicTexture( base ), 'original crate texture' );
		equal( R_ClassicTexture( variant ).offset.x, 0, 'original crate phase' );
		quake.gl_texturemode.value = 1;
		equal( R_ClassicTexture( source ), twin, 'twin reused' ); equal( twin.magFilter, THREE.LinearFilter, 'explicit native preference respected' );
		let disposed = 0; twin.addEventListener( 'dispose', () => disposed ++ ); source.dispose();
		equal( disposed, 1, 'twin follows source lifetime' ); equal( source.userData.classicTwin, undefined, 'stale cache cleared' );

	} finally { quake.gl_texturemode.value = old; base.dispose(); variant.dispose(); }

} );

Deno.test( 'native material variants suppress relief and glow while retaining original fullbright', () => {

	const diffuse = texture(), fullbright = texture( 220 ), lm = texture( 40 ), nativeLm = texture( 80 );
	const source = new THREE.MeshLambertMaterial( { map: diffuse, lightMap: lm, emissiveMap: fullbright, emissive: 0xffffff, emissiveIntensity: 5, normalMap: diffuse, bumpMap: diffuse, displacementMap: diffuse, envMap: diffuse } );
	source.color.setScalar( 2 ); source.userData.classicGlowColor = [ .2, .4, .6 ];
	const native = R_ClassicMaterial( source, R_ClassicTexture, t => t === lm ? nativeLm : t );
	equal( native.map, R_ClassicTexture( diffuse ), 'original diffuse' ); equal( native.emissiveMap, R_ClassicTexture( fullbright ), 'native fullbright retained' );
	for ( const key of [ 'normalMap', 'bumpMap', 'displacementMap', 'envMap' ] ) equal( native[ key ], null, key );
	equal( native.emissiveIntensity, 1, 'native glow' ); equal( native.color.r, .2, 'native fallback tint' ); equal( native.lightMap, nativeLm, 'native atlas' );
	equal( source.normalMap, diffuse, 'enhanced normal retained' ); equal( source.emissiveIntensity, 5, 'enhanced glow retained' );
	equal( R_ClassicMaterial( source, R_ClassicTexture ), native, 'material reused' );
	source.dispose(); for ( const t of [ diffuse, fullbright, lm, nativeLm ] ) t.dispose();

} );

Deno.test( 'scene rollback restores smoothed poses, alias colours, original shadows, lights and membership', () => {

	const scene = new THREE.Scene(), material = new THREE.MeshBasicMaterial(), g = new THREE.BufferGeometry(), shadow = new THREE.BufferGeometry();
	const position = new THREE.BufferAttribute( new Float32Array( [ 1, 2, 3 ] ), 3 );
	g.setAttribute( 'position', position ); g.setAttribute( 'color', new THREE.BufferAttribute( new Float32Array( [ .2, .3, .4 ] ), 3 ) );
	shadow.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ 4, 5, 6 ] ), 3 ) );
	const owner = { origin: [ 7, 8, 9 ], angles: [ 1, 2, 3 ], _aliasGeo: g, _aliasShadowGeo: shadow, _aliasPosenum: 2, _aliasBlended: true,
		_smoothMove: { lastTime: 10, rawO: [ 20, 30, 40 ], rawA: [ 40, 50, 60 ] } };
	const mesh = new THREE.Mesh( g, material ); mesh._quakeOwner = owner; mesh.position.set( 7, 8, 9 ); scene.add( mesh );
	const point = new THREE.PointLight( 0xffaa44, 3, 100 ); scene.add( point );
	const restore = R_SaveClassicScene( scene, 10 );
	equal( owner.origin[ 0 ], 20, 'current raw game coordinates selected' );
	mesh.material = new THREE.MeshBasicMaterial(); mesh.position.setScalar( 30 ); mesh.visible = false;
	g.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ 10, 20, 30 ] ), 3 ) ); g.attributes.color.array.fill( 1 );
	shadow.attributes.position.array.fill( 50 ); owner._aliasPosenum = 3; owner._aliasBlended = false;
	scene.remove( point ); point.intensity = 100; scene.add( new THREE.PointLight() );
	restore();
	equal( mesh.material, material, 'enhanced material identity' ); equal( mesh.position.x, 7, 'enhanced transform' ); equal( mesh.visible, true, 'visibility restored' );
	equal( g.attributes.position, position, 'enhanced blended attribute restored' ); equal( g.attributes.color.array[ 0 ], Math.fround( .2 ), 'enhanced vertex colour' );
	equal( shadow.attributes.position.array[ 0 ], 4, 'native optional shadow buffer restored' );
	equal( owner.origin[ 0 ], 7, 'enhanced smoothed origin restored' ); equal( owner.angles[ 1 ], 2, 'enhanced angles restored' );
	equal( owner._aliasPosenum, 2, 'pose bookkeeping restored' ); equal( owner._aliasBlended, true, 'interpolation bookkeeping restored' );
	equal( point.parent, scene, 'enhanced light reattached' ); equal( point.intensity, 3, 'light intensity restored' ); equal( scene.children.length, 2, 'temporary native lights removed' );
	g.dispose(); shadow.dispose(); material.dispose();

} );

Deno.test( 'classic atlases use grayscale samples and current light styles without corrupting enhanced cache', () => {

	const oldWorld = cl.worldmodel, oldStyle = quake.d_lightstylevalue[ 0 ], oldFull = quake.r_fullbright.value;
	const atlas = texture(), number = surf.lightmapTextures.length; surf.lightmapTextures.push( atlas );
	const face = { flags: 0, lightmaptexturenum: number, light_s: 2, light_t: 3, extents: [ 16, 16 ], styles: new Uint8Array( [ 0, 255, 255, 255 ] ),
		cached_light: new Int32Array( [ 999, 0, 0, 0 ] ), cached_dlight: true, dlightframe: - 1, samples: new Uint8Array( [ 32, 32, 32, 32 ] ), litsamples: new Uint8Array( [ 220, 1, 5, 220, 1, 5, 220, 1, 5, 220, 1, 5 ] ) };
	try {

		cl.worldmodel = { lightdata: face.samples, surfaces: [ face ] }; quake.r_fullbright.value = 0; quake.d_lightstylevalue[ 0 ] = 256;
		surf.R_ClassicLightmapsFrame( [ cl.worldmodel ] ); const native = surf.R_ClassicLightmap( atlas ), p = ( 3 * 128 + 2 ) * 4;
		equal( native.image.data[ p ], 64, 'original samples at allocated atlas location' ); equal( native.image.data[ p + 1 ], 64, 'grayscale green' ); equal( native.image.data[ p + 2 ], 64, 'grayscale blue' );
		equal( face.cached_light[ 0 ], 999, 'enhanced style cache preserved' ); equal( face.cached_dlight, true, 'enhanced dynamic cache preserved' );
		const version = native.version; surf.R_ClassicLightmapsFrame( [ cl.worldmodel ] ); equal( native.version, version, 'unchanged atlas not reuploaded' );
		quake.d_lightstylevalue[ 0 ] = 128; surf.R_ClassicLightmapsFrame( [ cl.worldmodel ] ); equal( native.image.data[ p ], 32, 'current original light style' );
		let disposals = 0; native.addEventListener( 'dispose', () => disposals ++ ); atlas.dispose(); equal( disposals, 1, 'native atlas follows map lifetime' );

	} finally { cl.worldmodel = oldWorld; quake.d_lightstylevalue[ 0 ] = oldStyle; quake.r_fullbright.value = oldFull; surf.lightmapTextures.pop(); }

} );

Deno.test( 'native dynamic lighting uses original intensity and restores enhanced fixed slots', () => {

	const scene = new THREE.Scene(), oldTime = cl.time, oldBlend = Array.from( quake.v_blend ), oldFlash = quake.gl_flashblend.value;
	const oldLights = cl_dlights.map( l => ( { die: l.die, radius: l.radius, origin: Array.from( l.origin ) } ) );
	try {

		cl.time = 10; quake.gl_flashblend.value = 1; for ( const l of cl_dlights ) { l.die = 0; l.radius = 0; }
		cl_dlights[ 0 ].die = 10.5; cl_dlights[ 0 ].radius = 100; cl_dlights[ 0 ].origin.set( [ 300, 0, 0 ] );
		mode.R_AnimSetLighting( true ); light.R_RenderDlights( cl, scene );
		equal( scene.children.length, 3, 'enhanced stable slots' ); equal( scene.children[ 0 ].intensity, 2500, 'enhanced half share' );
		const enhanced = scene.children.slice(), restore = R_SaveClassicScene( scene, cl.time );
		mode.R_AnimSetClassicPass( true ); light.R_RenderDlights( cl, scene );
		equal( scene.children.length, 1, 'native only active lights' ); equal( scene.children[ 0 ].intensity, 5000, 'native full share' );
		restore(); equal( scene.children.length, 3, 'enhanced slot count restored' ); for ( const l of enhanced ) equal( l.parent, scene, 'enhanced light restored' );

	} finally {

		mode.R_AnimSetClassicPass( false ); mode.R_AnimSetLighting( false );
		for ( const l of cl_dlights ) { l.die = 0; l.radius = 0; } light.R_RenderDlights( cl, scene );
		oldLights.forEach( ( s, i ) => { cl_dlights[ i ].die = s.die; cl_dlights[ i ].radius = s.radius; cl_dlights[ i ].origin.set( s.origin ); } );
		cl.time = oldTime; quake.gl_flashblend.value = oldFlash; quake.v_blend.set( oldBlend );

	}

} );

Deno.test( 'native baked dynamic light uses full brightness and clears expired contributions', () => {

	const oldWorld = cl.worldmodel, oldStyle = quake.d_lightstylevalue[ 0 ], oldFrame = quake.r_framecount, oldFull = quake.r_fullbright.value;
	const dl = cl_dlights[ 0 ], oldLight = { radius: dl.radius, minlight: dl.minlight, origin: Array.from( dl.origin ) };
	const atlas = texture(), number = surf.lightmapTextures.length; surf.lightmapTextures.push( atlas );
	const face = { flags: 0, lightmaptexturenum: number, light_s: 0, light_t: 0, extents: [ 0, 0 ], styles: new Uint8Array( [ 0, 255, 255, 255 ] ),
		cached_light: new Int32Array( 4 ), cached_dlight: false, dlightframe: 77, dlightbits: 1, samples: new Uint8Array( [ 0 ] ),
		plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] }, texturemins: [ 0, 0 ] };
	try {

		cl.worldmodel = { lightdata: face.samples, surfaces: [ face ] }; quake.set_r_framecount( 77 ); quake.d_lightstylevalue[ 0 ] = 256; quake.r_fullbright.value = 0;
		dl.radius = 64; dl.minlight = 0; dl.origin.fill( 0 ); mode.R_AnimSetLighting( true );
		const enhanced = new Uint8Array( 1 ); surf.R_BuildLightMap( face, enhanced, 0, 1, 1 ); equal( 255 - enhanced[ 0 ], 38, 'enhanced reduced baked share' );
		mode.R_AnimSetClassicPass( true ); surf.R_ClassicLightmapsFrame( [ cl.worldmodel ] ); const native = surf.R_ClassicLightmap( atlas );
		equal( native.image.data[ 0 ], 128, 'native full baked contribution' );
		dl.radius = 32; surf.R_ClassicLightmapsFrame( [ cl.worldmodel ] ); equal( native.image.data[ 0 ], 64, 'moving/decaying light updated this frame' );
		face.dlightframe = - 1; surf.R_ClassicLightmapsFrame( [ cl.worldmodel ] ); equal( native.image.data[ 0 ], 0, 'expired baked light removed' );
		equal( face.cached_dlight, true, 'enhanced dynamic cache untouched' );

	} finally {

		mode.R_AnimSetClassicPass( false ); mode.R_AnimSetLighting( false ); atlas.dispose(); surf.lightmapTextures.pop();
		cl.worldmodel = oldWorld; quake.d_lightstylevalue[ 0 ] = oldStyle; quake.set_r_framecount( oldFrame ); quake.r_fullbright.value = oldFull;
		dl.radius = oldLight.radius; dl.minlight = oldLight.minlight; dl.origin.set( oldLight.origin );

	}

} );

Deno.test( 'classic render failures restore scope and all renderer output state', () => {

	for ( const fail of [ 'prepare', 'scene', 'blit' ] ) {

		let target = { name: 'original' }, viewport = new THREE.Vector4( 2, 3, 80, 60 ), scissor = new THREE.Vector4( 4, 5, 60, 40 ), scissorTest = true;
		let clear = new THREE.Color( .1, .2, .3 ), alpha = .5, off = 0, renders = 0;
		const renderer = { autoClear: true, getRenderTarget: () => target, setRenderTarget: t => { target = t; },
			getViewport: v => v.copy( viewport ), setViewport: ( ...v ) => { viewport = v.length === 1 ? v[ 0 ].clone() : new THREE.Vector4( ...v ); },
			getScissor: v => v.copy( scissor ), setScissor: ( ...v ) => { scissor = v.length === 1 ? v[ 0 ].clone() : new THREE.Vector4( ...v ); },
			getScissorTest: () => scissorTest, setScissorTest: v => { scissorTest = v; },
			getClearColor: c => c.copy( clear ), getClearAlpha: () => alpha, setClearColor: ( c, a ) => { clear = new THREE.Color( c ); alpha = a; }, clear() {},
			render() { renders ++; if ( renders === ( fail === 'scene' ? 1 : 2 ) ) throw new Error( fail ); } };
		const before = target;
		try { split.R_DemoSplitClassic( renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), { lx: 0, ly: 0, lw: 80, lh: 60 }, () => { if ( fail === 'prepare' ) throw new Error( fail ); }, () => { off ++; } ); }
		catch ( error ) { equal( error.message, fail, 'original failure propagated' ); }
		equal( off, 1, 'rollback executed once' ); equal( target, before, 'target restored' ); equal( viewport.toArray().join(), '2,3,80,60', 'viewport restored' );
		equal( scissor.toArray().join(), '4,5,60,40', 'scissor restored' ); equal( scissorTest, true, 'scissor test restored' ); equal( renderer.autoClear, true, 'autoClear restored' );
		equal( clear.r, .1, 'clear colour restored' ); equal( alpha, .5, 'clear alpha restored' );

	}

} );
