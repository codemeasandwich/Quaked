import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import * as power from '../src/newer/render/r_powerups.js';
import * as post from '../src/newer/render/gl_post.js';
import * as newerMode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import * as height from '../src/newer/render/r_heightshadows.js';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { R_DrawAliasModel } from '../src/engine/render/gl_mesh.js';
import { entity_t } from '../src/engine/render/render.js';
import { cl } from '../src/engine/client/client.js';
import { R_ClassicMaterial } from '../src/newer/render/r_classicstate.js';
import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)

const report = document.querySelector( '#report' ), width = 768, heightPixels = 480;
try {

	for ( const variable of [ power.r_powerups, post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_bounce, post.r_pointshadows, height.r_heightshadows, newerMode.r_newer_lighting, newerMode.r_newer_normals, newerMode.r_newer_water ] ) if ( ! vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
	for ( const [ name, value ] of Object.entries( { r_powerups: 1, r_hdr: 1, r_dynres: 0, r_bloom: 0, r_volumetric: 0, r_bounce: 0, r_pointshadows: 0, r_heightshadows: 1, r_newer_lighting: 1, r_newer_normals: 1, r_newer_water: 0 } ) ) vars.Cvar_SetValue( name, value );
	const response = await fetch( '../pak0.pak' ); if ( ! response.ok ) throw new Error( 'Native PAK fetch failed' );
	COM_AddPack( COM_LoadPackFile( 'pak0.pak', await response.arrayBuffer() ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
	post.R_BuildWorldLights( { nodes: [ { contents: -1, visframe: 1 } ], entities: '', surfaces: [] } ); post.R_BuildSunOccluder( { surfaces: [] } );
	const renderer = new THREE.WebGLRenderer( { preserveDrawingBuffer: true, antialias: false } ); renderer.setSize( width, heightPixels ); renderer.setClearColor( 0, 0 ); renderer.autoClear = false; document.querySelector( '#main' ).append( renderer.domElement );
	const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 52, width / heightPixels, 1, 1500 ); camera.up.set( 0, 0, 1 );
	const pigment = new THREE.DataTexture( new Uint8Array( [ 116, 116, 116, 255 ] ), 1, 1 ); pigment.colorSpace = THREE.SRGBColorSpace; pigment.needsUpdate = true;
	const lm = new THREE.DataTexture( new Uint8Array( [ 40, 40, 40, 255 ] ), 1, 1 ); lm.channel = 1; lm.needsUpdate = true;
	function plane( w, h, position, rotation ) {

		const geometry = new THREE.PlaneGeometry( w, h ); geometry.setAttribute( 'uv1', geometry.attributes.uv.clone() );
		const material = new THREE.MeshLambertMaterial( { map: pigment, lightMap: lm, lightMapIntensity: 1, side: THREE.DoubleSide } ); post.R_RegisterDetail( material, pigment );
		const mesh = new THREE.Mesh( geometry, material ); mesh.position.set( ...position ); mesh.rotation.set( ...rotation ); scene.add( mesh ); return mesh;

	}
	plane( 300, 200, [ 0, 0, 0 ], [ 0, 0, 0 ] ); plane( 300, 130, [ 0, 58, 65 ], [ Math.PI / 2, 0, 0 ] );
	const items = [ 'progs/quaddama.mdl', 'progs/invulner.mdl', 'progs/invisibl.mdl' ].map( ( name, i ) => {

		const entity = new entity_t(); entity.model = Mod_ForName( name, true ); entity.origin.set( [ ( i - 1 ) * 75, 8, 22 ] ); entity.angles[ 1 ] = 90;
		const mesh = R_DrawAliasModel( entity, entity.model.cache.data ); if ( ! mesh ) throw new Error( 'Native alias did not render: ' + name ); scene.add( mesh ); return { entity, mesh };

	} );
	let time = 1, angle = 0, itemYaw = 90, overhead = false, enabled = true, rasterScale = 1, focusIndex = null;
	function update() {

		cl.time = time; vars.Cvar_SetValue( 'r_powerups', enabled ? 1 : 0 );
		power.R_PowerupBegin( scene );
		for ( const item of items ) {

			item.entity.angles[ 1 ] = itemYaw;
			const previous = item.mesh; item.mesh = R_DrawAliasModel( item.entity, item.entity.model.cache.data );
			if ( previous !== item.mesh ) { previous.removeFromParent(); scene.add( item.mesh ); }
			power.R_PowerupSeen( item.entity, item.mesh, scene, time );

		}
		power.R_PowerupEnd();
		if ( focusIndex === null ) { camera.position.set( 210 * Math.sin( angle ), -210 * Math.cos( angle ), overhead ? 260 : 105 ); camera.lookAt( 0, 10, 30 ); }
		else { const item = items[ focusIndex ], target = item.mesh.geometry.boundingBox.getCenter( new THREE.Vector3() ).applyMatrix4( item.mesh.matrixWorld ); target.z+=15; camera.position.copy( target ).add( new THREE.Vector3( 100 * Math.sin( angle ), -100 * Math.cos( angle ), overhead ? 130 : 45 ) ); camera.lookAt( target ); }
		camera.updateMatrixWorld();

	}
	function draw( read = false ) {

		post.R_PostBegin( renderer, true, Math.round( width * rasterScale ), Math.round( heightPixels * rasterScale ) );
		const snapshot = post.R_PostLightsFrame( renderer, scene, camera, 1, [], [], time, false ); post.R_PostBind( renderer ); renderer.clear( true, true, false );
		renderer.render( scene, camera ); height.R_HeightShadowScope( false ); const target = renderer.getRenderTarget(); let result;
		if ( read ) {

			const normal = new Uint16Array( target.width * target.height * 4 ), albedo = new Uint8Array( normal.length ), mask = new Uint8Array( normal.length ), hdr = new Uint16Array( normal.length );
			renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, hdr ); renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, normal, undefined, 1 ); renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, albedo, undefined, 2 ); renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, mask, undefined, 3 );
			result = { hdr, normal, albedo, mask, raster: [ target.width, target.height ], slots: snapshot.lights.map( l => ( { kind: l.source?.powerup, cookie: l.source?.cookie, position: l.worldPos.slice(), range: l.range } ) ) };

		}
		const originalRender = renderer.render;
		if ( read ) renderer.render = function ( drawScene, drawCamera ) {

			const returned = originalRender.call( this, drawScene, drawCamera );
			const volumes = drawScene.children.filter( object => object.material?.uniforms?.uEmitterDistance );
			if ( volumes.length ) {

				const emissionTarget = renderer.getRenderTarget(), pixels = new Uint16Array( emissionTarget.width * emissionTarget.height * 4 ); renderer.readRenderTargetPixels( emissionTarget, 0, 0, emissionTarget.width, emissionTarget.height, pixels );
				let emittingPixels = 0, nonfinite = 0; for ( let i = 0; i < pixels.length; i += 4 ) { const rgb = [ 0, 1, 2 ].map( c => THREE.DataUtils.fromHalfFloat( pixels[ i + c ] ) ); if ( rgb.some( value => ! Number.isFinite( value ) ) ) nonfinite ++; if ( rgb.some( value => value > .0001 ) ) emittingPixels ++; }
				result.firePass = { sources: volumes.length, raster: [ emissionTarget.width, emissionTarget.height ], separateFromSceneHDR: emissionTarget !== target, samplesOriginalOpaqueDepth: volumes.every( object => object.material.uniforms.uOpaqueDepth.value === target.depthTexture ), feedbackFree: volumes.every( object => object.material.uniforms.uOpaqueDepth.value !== emissionTarget.depthTexture ), emittingPixels, nonfinitePixels: nonfinite };
				result.fireEmission = pixels;

			}
			return returned;

		};
		try { post.R_PostFinish( renderer, scene, camera, { lx: 0, ly: 0, lw: width, lh: heightPixels }, 1, [], [], time, 1, false ); } finally { renderer.render = originalRender; }
		if ( read ) {

			result.screen = new Uint8Array( width * heightPixels * 4 ); const gl = renderer.getContext(); gl.readPixels( 0, 0, width, heightPixels, gl.RGBA, gl.UNSIGNED_BYTE, result.screen );
			// Volumes render into a separate emission target inside PostFinish.
			// Read the actual HDR and solid packets AFTER that production stage.
			result.hdrBeforeVolume = result.hdr; result.hdr = new Uint16Array( result.hdr.length );
			renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, result.hdr );
			const normal = new Uint16Array( result.normal.length ), albedo = new Uint8Array( result.albedo.length ), mask = new Uint8Array( result.mask.length );
			renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, normal, undefined, 1 ); renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, albedo, undefined, 2 ); renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, mask, undefined, 3 );
			result.volumePacketChanges = { normals: different( result.normal, normal ), albedo: different( result.albedo, albedo ), heightMasks: different( result.mask, mask ) }; result.normal = normal; result.albedo = albedo; result.mask = mask; result.glError = gl.getError();

		}
		return result;

	}
	function different( a, b ) { let count = 0, maximum = 0; for ( let i = 0; i < a.length; i ++ ) if ( a[ i ] !== b[ i ] ) { count ++; maximum = Math.max( maximum, Math.abs( a[ i ] - b[ i ] ) ); } return { changedComponents: count, maximum }; }
	function picture( label ) { const figure = document.createElement( 'figure' ), image = document.createElement( 'img' ), caption = document.createElement( 'figcaption' ); image.src = renderer.domElement.toDataURL(); caption.textContent = label; figure.append( image, caption ); document.querySelector( '#views' ).append( figure ); }
	function check() {

		const savedFocus = focusIndex; focusIndex = null; enabled = true; update(); document.querySelector( '#views' ).replaceChildren();
		const baseline = draw( true ); picture( 'Native pickups + production effects' );
		const groups = scene.children.filter( object => object.name.startsWith( 'powerup_' ) ); for ( const group of groups ) group.visible = false;
		const spritesHidden = draw( true ); picture( 'Same lights; effect sprites hidden' ); for ( const group of groups ) group.visible = true;
		const ring = power.R_PowerupLights().find( source => source.powerup === 'ring' ), cookie = ring.cookie; ring.cookie = 0;
		let cookieOff; try { cookieOff = draw( true ); picture( 'Same effects; ring directional light cookie disabled' ); } finally { ring.cookie = cookie; }
		const packets = { normals: different( baseline.normal, spritesHidden.normal ), albedo: different( baseline.albedo, spritesHidden.albedo ), heightMasks: different( baseline.mask, spritesHidden.mask ) };
		const sprites = different( baseline.hdr, spritesHidden.hdr ), projectedCookie = different( baseline.screen, cookieOff.screen );
		let solidPixels = 0; for ( let i = 3; i < baseline.normal.length; i += 4 ) if ( THREE.DataUtils.fromHalfFloat( baseline.normal[ i ] ) > 1 ) solidPixels ++;
		const result = { status: Object.values( packets ).every( x => x.changedComponents === 0 ) && sprites.changedComponents > 100 && projectedCookie.changedComponents > 100 && solidPixels > 10000 && ! baseline.glError && ! spritesHidden.glError && ! cookieOff.glError ? 'PASS' : 'FAIL', actualNativeModels: items.map( i => i.entity.model.name ), time, camera: camera.position.toArray(), fixedComparisonDraws: 4, solidPixels, slots: baseline.slots, retainedSolidPackets: packets, spriteHdrEffect: sprites, projectedRingCookieEffect: projectedCookie, glErrors: [ baseline.glError, spritesHidden.glError, cookieOff.glError ] };
		window.powerupsGpuResult = result; report.textContent = JSON.stringify( result, null, 2 );
		focusIndex = savedFocus; update(); draw();

	}
	function redraw() { update(); draw(); report.textContent = JSON.stringify( { focus: focusIndex === null ? 'all' : items[ focusIndex ].entity.model.name, time, cameraAngleRadians: angle, itemYawDegrees: itemYaw, overhead, enabled, pickups: power.R_PowerupStatus(), lights: power.R_PowerupLights() }, null, 2 ); }
	let animationHandle = 0, animationUntil = 0, animationLast = 0;
	function stopAnimation() { if ( animationHandle ) cancelAnimationFrame( animationHandle ); animationHandle = 0; animationUntil = 0; document.querySelector( '#animate' ).textContent = 'Animate fire (20s)'; document.querySelector( '#animation-status' ).textContent = 'Paused'; }
	function animateFrame( now ) {

		if ( ! animationUntil ) return;
		if ( now >= animationUntil ) { stopAnimation(); return; }
		try {

			if ( now - animationLast >= 1000 / 30 ) { const dt = ( now - animationLast ) / 1000; animationLast = now; time += dt; itemYaw = ( itemYaw + 100 * dt ) % 360; update(); draw(); }
			animationHandle = requestAnimationFrame( animateFrame );

		} catch ( error ) { stopAnimation(); report.textContent = 'Animation stopped: ' + error.stack; }

	}
	document.querySelector( '#animate' ).onclick = () => {

		if ( animationUntil ) { stopAnimation(); return; }
		enabled = true; animationLast = performance.now(); animationUntil = animationLast + 20000; document.querySelector( '#animate' ).textContent = 'Stop animation'; document.querySelector( '#animation-status' ).textContent = 'Animating · stops automatically after 20 seconds'; animationHandle = requestAnimationFrame( animateFrame );

	};
	function extended() {

		const saved = { time, angle, overhead, enabled, focusIndex }, savedShadow = vars.Cvar_VariableValue( 'r_pointshadows' ); let blocker;
		try {

			enabled = true; time = 1; angle = 0; overhead = false; focusIndex = null; update();
			const groups = scene.children.filter( object => object.name.startsWith( 'powerup_' ) ), sources = power.R_PowerupLights(), ring = sources.find( source => source.powerup === 'ring' );
			const powers = sources.map( source => source.power ); for ( const source of sources ) if ( source !== ring ) source.power = 0;
			const hideSprites = () => { for ( const group of groups ) group.visible = false; };
			const worldSamples = [];
			for ( const x of [ 95, 110, 125 ] ) for ( const z of [ 25, 40, 55, 70 ] ) worldSamples.push( new THREE.Vector3( x, 58, z ) );
			const sample = output => worldSamples.map( point => { const p = point.clone().project( camera ), x = Math.round( ( p.x * .5 + .5 ) * width ), y = Math.round( ( p.y * .5 + .5 ) * heightPixels ); return x >= 0 && x < width && y >= 0 && y < heightPixels ? Array.from( output.screen.slice( ( y * width + x ) * 4, ( y * width + x ) * 4 + 3 ) ) : null; } );
			let animation, cameraSamples, shadow;
			try {

				hideSprites(); const first = draw( true ), originalSamples = sample( first ); time += .5; update(); hideSprites(); const second = draw( true );
				animation = different( first.screen, second.screen );
				time = 1; angle = Math.PI / 12; update(); hideSprites(); const turned = draw( true ), turnedSamples = sample( turned ), errors = [];
				for ( let i = 0; i < originalSamples.length; i ++ ) if ( originalSamples[ i ] && turnedSamples[ i ] ) errors.push( Math.max( ...originalSamples[ i ].map( ( value, c ) => Math.abs( value - turnedSamples[ i ][ c ] ) ) ) );
				errors.sort( ( a, b ) => a - b ); cameraSamples = { samples: errors.length, medianMaximumRgbDifference: errors[ Math.floor( errors.length / 2 ) ], maximumRgbDifference: errors.at( -1 ), tolerance: 6 };
				angle = 0; update(); hideSprites();
				const geometry = new THREE.BoxGeometry( 24, 8, 60 ); geometry.translate( 75, 35, 30 );
				const material = new THREE.MeshLambertMaterial( { map: pigment, lightMap: lm, lightMapIntensity: 1 } ); geometry.setAttribute( 'uv1', geometry.attributes.uv.clone() ); post.R_RegisterDetail( material, pigment );
				blocker = new THREE.Mesh( geometry, material ); scene.add( blocker ); const atlas = post.R_PointShadowAtlas(); atlas.setGeometry( geometry ); vars.Cvar_SetValue( 'r_pointshadows', 1 );
				for ( let i = 0; i < 4 && ! atlas.lookup( ring ).ready; i ++ ) draw();
				const ready = atlas.lookup( ring ), withShadow = draw( true ); picture( 'Ring light with real opaque blocker and ready point-shadow cube' );
				vars.Cvar_SetValue( 'r_pointshadows', 0 ); const withoutShadow = draw( true );
				shadow = { ready: ready.ready, slot: ready.slot, far: ready.far, atlas: atlas.status(), imageDifference: different( withShadow.screen, withoutShadow.screen ), glErrors: [ withShadow.glError, withoutShadow.glError ] };

			} finally { sources.forEach( ( source, i ) => { source.power = powers[ i ]; } ); for ( const group of groups ) group.visible = true; }
			if ( blocker ) { blocker.removeFromParent(); post.R_PointShadowAtlas().setGeometry( null ); blocker.geometry.dispose(); blocker.material.dispose(); blocker = null; }
			const previousTarget = renderer.getRenderTarget(), classicTarget = new THREE.WebGLRenderTarget( width, heightPixels, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace } ), materials = new Map();
			scene.traverse( object => { if ( object.material ) { materials.set( object, object.material ); object.material = Array.isArray( object.material ) ? object.material.map( m => R_ClassicMaterial( m, t => t ) ) : R_ClassicMaterial( object.material, t => t ); } } );
			let classic;
			try {

				newerMode.R_AnimSetClassicPass( true ); post.classicLook.value = 1; height.R_HeightShadowScope( false ); for ( const group of groups ) group.visible = false;
				const results = [];
				for ( const on of [ 1, 0 ] ) {

					vars.Cvar_SetValue( 'r_powerups', on ); renderer.setRenderTarget( classicTarget ); renderer.clear( true, true, false ); renderer.render( scene, camera );
					const data = new Uint16Array( width * heightPixels * 4 ); renderer.readRenderTargetPixels( classicTarget, 0, 0, width, heightPixels, data ); results.push( data );

				}
				let nonblack = 0; for ( let i = 0; i < results[ 0 ].length; i += 4 ) if ( THREE.DataUtils.fromHalfFloat( results[ 0 ][ i ] ) + THREE.DataUtils.fromHalfFloat( results[ 0 ][ i + 1 ] ) + THREE.DataUtils.fromHalfFloat( results[ 0 ][ i + 2 ] ) > .01 ) nonblack ++;
				classic = { difference: different( results[ 0 ], results[ 1 ] ), nonblackPixels: nonblack, glError: renderer.getContext().getError(), availableEnhancedLights: power.R_PowerupLights().length };

			} finally { for ( const [ object, material ] of materials ) object.material = material; for ( const group of groups ) group.visible = true; newerMode.R_AnimSetClassicPass( false ); post.classicLook.value = 0; renderer.setRenderTarget( previousTarget ); classicTarget.dispose(); vars.Cvar_SetValue( 'r_powerups', 1 ); }
			const result = { status: animation.changedComponents > 100 && cameraSamples.samples >= 6 && cameraSamples.medianMaximumRgbDifference <= 6 && shadow.ready && shadow.imageDifference.changedComponents > 100 && shadow.glErrors.every( error => error === 0 ) && classic.difference.changedComponents === 0 && classic.nonblackPixels > 10000 && classic.glError === 0 ? 'PASS' : 'FAIL', isolatedRingAnimation: animation, fixedWorldReceiverAcrossCameraRotation: cameraSamples, opaqueBlocker: shadow, classicSameFramePowerupToggle: classic };
			window.powerupsExtendedResult = result; report.textContent = JSON.stringify( result, null, 2 );

		} catch ( error ) { report.textContent = 'FAIL ' + error.stack; window.powerupsExtendedResult = { status: 'FAIL', error: error.stack }; }
		finally { if ( blocker ) { blocker.removeFromParent(); post.R_PointShadowAtlas().setGeometry( null ); blocker.geometry.dispose(); blocker.material.dispose(); } vars.Cvar_SetValue( 'r_pointshadows', savedShadow ); ( { time, angle, overhead, enabled, focusIndex } = saved ); update(); draw(); }

	}
	document.querySelector( '#left' ).onclick = () => { angle -= Math.PI / 4; redraw(); }; document.querySelector( '#right' ).onclick = () => { angle += Math.PI / 4; redraw(); }; document.querySelector( '#above' ).onclick = () => { overhead = ! overhead; redraw(); }; document.querySelector( '#time' ).onclick = () => { time += .5; redraw(); }; document.querySelector( '#toggle' ).onclick = () => { enabled = ! enabled; redraw(); }; document.querySelector( '#check' ).onclick = () => { stopAnimation(); check(); };
	document.querySelector( '#extended' ).onclick = () => { stopAnimation(); extended(); };
	document.querySelector( '#item-rotation' ).onclick = () => { itemYaw = ( itemYaw + 45 ) % 360; redraw(); };
	for ( const button of document.querySelectorAll( '[data-focus]' ) ) button.onclick = () => { focusIndex = button.dataset.focus === 'all' ? null : Number( button.dataset.focus ); redraw(); };
	function blackShroud() {

		const saved = { time, angle, overhead, enabled, rasterScale, focusIndex }, originalVisibility = new Map( scene.children.map( object => [ object, object.visible ] ) ), temporary = [];
		try {

			enabled = true; focusIndex = null; update(); const pent = items[ 1 ], group = scene.children.find( object => object.name === 'powerup_pentagram' ), shroud = group.children.find( object => object.name.endsWith( '_shroud' ) ), flames = group.children.find( object => object.name.endsWith( '_flames' ) );
			const bright = new THREE.DataTexture( new Uint8Array( [ 255, 255, 255, 255 ] ), 1, 1 ); bright.channel = 1; bright.needsUpdate = true; temporary.push( bright );
			const wall = plane( 500, 500, [ 0, 0, 0 ], [ 0, 0, 0 ] ), panel = plane( 23, 17, [ 0, 0, 0 ], [ 0, 0, 0 ] );
			for ( const object of [ wall, panel ] ) { object.material.lightMap = bright; object.material.lightMapIntensity = 4; temporary.push( object ); } panel.material.color.setRGB( .25, 1, .3 );
			const results = []; document.querySelector( '#views' ).replaceChildren();
			for ( const configuration of [ { angle: 0, overhead: false, scale: 1 }, { angle: Math.PI / 3, overhead: false, scale: 1 }, { angle: Math.PI, overhead: false, scale: 1 }, { angle: Math.PI / 4, overhead: true, scale: 1 }, { angle: 0, overhead: false, scale: .5 } ] ) {

				angle = configuration.angle; overhead = configuration.overhead; rasterScale = configuration.scale; update();
				for ( const object of scene.children ) if ( object !== wall && object !== panel ) object.visible = object === pent.mesh || object === group;
				flames.visible = false; // isolate black opacity from deliberately emissive fire
				const towardEye = camera.position.clone().sub( group.position ).normalize(), right = new THREE.Vector3( 1, 0, 0 ).applyQuaternion( camera.quaternion ), up = new THREE.Vector3( 0, 1, 0 ).applyQuaternion( camera.quaternion );
				wall.position.copy( group.position ).addScaledVector( towardEye, -100 ); wall.quaternion.copy( camera.quaternion );
				panel.position.copy( group.position ).addScaledVector( towardEye, 45 ).addScaledVector( right, 15 ).addScaledVector( up, -12 ); panel.quaternion.copy( camera.quaternion );
				scene.updateMatrixWorld( true ); shroud.visible = false; const off = draw( true ); shroud.visible = true; const on = draw( true );
				const center = shroud.getWorldPosition( new THREE.Vector3() ).applyMatrix4( camera.matrixWorldInverse ), uniforms = shroud.material.uniforms, planeZ = center.z - uniforms.uBehind.value;
				let core = 0, black = 0, native = 0, nativeChanged = 0, opaquePanel = 0, panelChanged = 0, brightestCore = 0, offSum = 0, excludedBoundarySamples = 0, excludedExactFilterSamples = 0;
				const changedNativeSamples = [];
				const [ rw, rh ] = on.raster;
				const ray = new THREE.Raycaster(), opaque = [ pent.mesh, panel, wall ];
				const receiverAt = ( nx, ny ) => { ray.setFromCamera( new THREE.Vector2( nx, ny ), camera ); return ray.intersectObjects( opaque, false )[ 0 ]?.object; };
				for ( let y = 2; y < rh - 2; y ++ ) for ( let x = 2; x < rw - 2; x ++ ) {

					const sx = Math.min( width - 1, Math.floor( ( x + .5 ) / rw * width ) ), sy = Math.min( heightPixels - 1, Math.floor( ( y + .5 ) / rh * heightPixels ) ), si = ( sy * width + sx ) * 4;
					const nx = ( sx + .5 ) / width * 2 - 1, ny = ( sy + .5 ) / heightPixels * 2 - 1;
					const view = new THREE.Vector3( nx, ny, 0 ).applyMatrix4( camera.projectionMatrixInverse ); view.multiplyScalar( planeZ / view.z );
					const u = ( view.x - center.x ) / uniforms.uSize.value.x * 2, v = ( view.y - center.y ) / uniforms.uSize.value.y * 2;
					if ( Math.hypot( u, v ) > .32 ) continue; // guaranteed fully opaque core, independent of turbulent edge noise
					// Native aliases need not write the world's normal/depth packet.
					// Determine the actual opaque receiver independently from geometry.
					// The final compositor linearly filters the lower-resolution colour
					// raster. A pixel within 1.5 scene pixels of a receiver boundary can
					// validly blend bright symbol and black background: exclude that
					// footprint, never weaken blackness or foreground preservation.
					const receiver = receiverAt( nx, ny ); if ( ! receiver ) continue;
					let interior = true;
					for ( const dx of [ -1.5, 0, 1.5 ] ) for ( const dy of [ -1.5, 0, 1.5 ] ) if ( receiverAt( nx + dx * 2 / rw, ny + dy * 2 / rh ) !== receiver ) interior = false;
					if ( ! interior ) { excludedBoundarySamples ++; continue; }
					// In addition to the conservative boundary guard above, query the
					// exact four scene-texel centres contributing to final tScene
					// bilinear filtering. A narrow star-shaped hole can fall BETWEEN
					// the wider guard samples. Such a mixed-colour footprint is valid
					// filtering, not a changed opaque-symbol pixel.
					const tx = Math.floor( ( sx + .5 ) / width * rw - .5 ), ty = Math.floor( ( sy + .5 ) / heightPixels * rh - .5 ), filterReceivers = [];
					for ( const dx of [ 0, 1 ] ) for ( const dy of [ 0, 1 ] ) filterReceivers.push( receiverAt( ( tx + dx + .5 ) / rw * 2 - 1, ( ty + dy + .5 ) / rh * 2 - 1 ) );
					if ( filterReceivers.some( object => object !== receiver ) ) { excludedExactFilterSamples ++; continue; }
					const rgb = Array.from( on.screen.slice( si, si + 3 ) ), original = Array.from( off.screen.slice( si, si + 3 ) ), delta = Math.max( ...rgb.map( ( value, c ) => Math.abs( value - original[ c ] ) ) );
					if ( receiver === panel ) { opaquePanel ++; if ( delta > 2 ) panelChanged ++; }
					else if ( receiver === pent.mesh ) { native ++; if ( delta > 2 ) { nativeChanged ++; if ( changedNativeSamples.length < 12 ) changedNativeSamples.push( { scenePixel: [ x, y ], finalPixel: [ sx, sy ], on: rgb, off: original, maximumDelta: delta, exactFilterTexels: [ tx, ty, tx + 1, ty + 1 ], exactFilterReceivers: filterReceivers.map( object => object === pent.mesh ? 'native' : object === panel ? 'panel' : object === wall ? 'wall' : 'none' ) } ); } }
					else if ( receiver === wall && Math.max( ...original ) > 40 ) { core ++; offSum += Math.max( ...original ); brightestCore = Math.max( brightestCore, ...rgb ); if ( Math.max( ...rgb ) <= 5 ) black ++; }

				}
				const packets = { normals: different( on.normal, off.normal ), albedo: different( on.albedo, off.albedo ), heightMasks: different( on.mask, off.mask ) };
				results.push( { configuration, actualRaster: on.raster, receiverMask: 'Independent native geometry raycast at final pixel center, conservative boundary guard, and all four exact bilinear scene texel centres', excludedBoundarySamples, excludedExactFilterSamples, darkCorePixels: core, pixelsAtOrBelow5: black, brightestCore, meanOriginalLitCore: core ? offSum / core : null, nativeSymbolPixels: native, changedNativeSymbolPixels: nativeChanged, changedNativeSamples, opaquePanelPixels: opaquePanel, changedOpaquePanelPixels: panelChanged, retainedSolidPackets: packets, glErrors: [ on.glError, off.glError ], pass: core > 20 && black / core > .98 && opaquePanel > 10 && panelChanged === 0 && nativeChanged === 0 && Object.values( packets ).every( value => value.changedComponents === 0 ) && on.glError === 0 && off.glError === 0 } );
				picture( 'Deep-black core and opaque native symbol / green foreground panel · angle ' + Math.round( angle * 180 / Math.PI ) + '° · raster ' + on.raster.join( '×' ) );

			}
			flames.visible = true;
			const result = { status: results.every( result => result.pass ) && results.some( result => result.nativeSymbolPixels > 10 ) ? 'PASS' : 'FAIL', fixedSceneDraws: 10, isolation: 'Only pentagram and black shroud; emissive flames hidden during opacity measurement; independent bright background and opaque foreground panel', results };
			window.powerupsBlackShroudResult = result; report.textContent = JSON.stringify( result, null, 2 );

		} catch ( error ) { report.textContent = 'FAIL ' + error.stack; window.powerupsBlackShroudResult = { status: 'FAIL', error: error.stack }; }
		finally { for ( const object of temporary.reverse() ) { if ( object.isMesh ) { object.removeFromParent(); object.geometry.dispose(); object.material.dispose(); } else object.dispose(); } for ( const [ object, visible ] of originalVisibility ) object.visible = visible; ( { time, angle, overhead, enabled, rasterScale, focusIndex } = saved ); update(); for ( const group of scene.children.filter( object => object.name.startsWith( 'powerup_' ) ) ) for ( const child of group.children ) child.visible = true; draw(); }

	}
	document.querySelector( '#black' ).onclick = () => { stopAnimation(); blackShroud(); };
	function volumeCheck() {

		const saved = { time, angle, overhead, enabled, focusIndex, rasterScale }; let blocker;
		try {

			enabled = true; focusIndex = null; angle = 0; overhead = false; rasterScale = 1; time = 1; update(); document.querySelector( '#views' ).replaceChildren();
			const masters = scene.children.filter( object => object.name.startsWith( 'powerup_' ) ).flatMap( group => group.children.filter( child => child.userData.powerupVolume ) );
			if ( masters.length !== 2 ) throw new Error( 'Expected actual Quad and Pentagram volume masters' );
			const results = []; let proceduralVolumeAnimation;
			for ( const mode of [ 'unoccluded', 'partial opaque wall', 'full opaque wall' ] ) {

				if ( mode !== 'unoccluded' ) {

					blocker = plane( mode === 'full opaque wall' ? 800 : 50, mode === 'full opaque wall' ? 800 : 100, [ 0, 0, 0 ], [ 0, 0, 0 ] );
					blocker.position.copy( camera.position ).lerp( new THREE.Vector3( 0, 10, 30 ), .45 ); blocker.quaternion.copy( camera.quaternion );

				}
				for ( const master of masters ) master.visible = false; const off = draw( true ); for ( const master of masters ) master.visible = true; const on = draw( true ); picture( 'Actual volumetric pass: ' + mode );
				const delta = different( on.hdr, off.hdr ), screenDelta = different( on.screen, off.screen ), packets = on.volumePacketChanges;
				const protectedObjects = mode === 'unoccluded' ? items.map( item => item.mesh ) : [ blocker ], opaque = scene.children.filter( object => object.isMesh && ! object.material?.transparent ), ray = new THREE.Raycaster();
				const receiverAt = ( x, y ) => { ray.setFromCamera( new THREE.Vector2( x, y ), camera ); return ray.intersectObjects( opaque, false )[ 0 ]?.object; };
				const [ rw, rh ] = on.raster; let protectedPixels = 0, changedProtectedPixels = 0; const changedSamples = [];
				for ( const object of protectedObjects ) {

					object.updateMatrixWorld( true ); if ( ! object.geometry.boundingBox ) object.geometry.computeBoundingBox(); const box = object.geometry.boundingBox, projected = [];
					for ( const x of [ box.min.x, box.max.x ] ) for ( const y of [ box.min.y, box.max.y ] ) for ( const z of [ box.min.z, box.max.z ] ) projected.push( new THREE.Vector3( x, y, z ).applyMatrix4( object.matrixWorld ).project( camera ) );
					const minX = Math.max( 1, Math.floor( ( Math.min( ...projected.map( p => p.x ) ) * .5 + .5 ) * width ) ), maxX = Math.min( width - 2, Math.ceil( ( Math.max( ...projected.map( p => p.x ) ) * .5 + .5 ) * width ) );
					const minY = Math.max( 1, Math.floor( ( Math.min( ...projected.map( p => p.y ) ) * .5 + .5 ) * heightPixels ) ), maxY = Math.min( heightPixels - 2, Math.ceil( ( Math.max( ...projected.map( p => p.y ) ) * .5 + .5 ) * heightPixels ) );
					for ( let y = minY; y <= maxY; y += 2 ) for ( let x = minX; x <= maxX; x += 2 ) {

						if ( receiverAt( ( x + .5 ) / width * 2 - 1, ( y + .5 ) / heightPixels * 2 - 1 ) !== object ) continue;
						const tx = Math.floor( ( x + .5 ) / width * rw - .5 ), ty = Math.floor( ( y + .5 ) / heightPixels * rh - .5 ); let interior = true;
						for ( const dx of [ 0, 1 ] ) for ( const dy of [ 0, 1 ] ) if ( receiverAt( ( tx + dx + .5 ) / rw * 2 - 1, ( ty + dy + .5 ) / rh * 2 - 1 ) !== object ) interior = false;
						if ( ! interior ) continue; protectedPixels ++; const i = ( y * width + x ) * 4, rgb = Array.from( on.screen.slice( i, i + 3 ) ), original = Array.from( off.screen.slice( i, i + 3 ) ), difference = Math.max( ...rgb.map( ( value, c ) => Math.abs( value - original[ c ] ) ) );
						if ( difference > 1 ) { changedProtectedPixels ++; if ( changedSamples.length < 8 ) changedSamples.push( { pixel: [ x, y ], on: rgb, off: original } ); }

					}

				}
				results.push( { mode, unchangedSceneHDR: delta, finalImageContribution: screenDelta, actualFirePass: on.firePass, protectedPixels, changedProtectedPixels, changedSamples, retainedSolidPackets: packets, glErrors: [ on.glError, off.glError ], pass: delta.changedComponents === 0 && ( mode === 'full opaque wall' ? screenDelta.changedComponents === 0 : screenDelta.changedComponents > 100 && on.firePass?.emittingPixels > 100 ) && on.firePass?.separateFromSceneHDR && on.firePass?.samplesOriginalOpaqueDepth && on.firePass?.feedbackFree && on.firePass?.nonfinitePixels === 0 && protectedPixels > 50 && changedProtectedPixels === 0 && Object.values( packets ).every( value => value.changedComponents === 0 ) && on.glError === 0 && off.glError === 0 } );
				if ( mode === 'unoccluded' ) {

					const beforeTime = time, beforeCamera = camera.matrixWorld.elements.slice(), beforeItemYaw = itemYaw;
					const beforeNative = items.map( item => ( { matrix: item.mesh.matrixWorld.elements.slice(), position: item.mesh.geometry.attributes.position.array.slice() } ) );
					time = beforeTime + .5; update(); const animated = draw( true );
					let changedRgbComponents = 0, maximumLinearRgbDifference = 0, nonfinite = 0;
					if ( ! on.fireEmission || ! animated.fireEmission || on.fireEmission.length !== animated.fireEmission.length ) throw new Error( 'Actual emission framebuffer unavailable for fixed-pose animation comparison' );
					for ( let i = 0; i < on.fireEmission.length; i += 4 ) for ( let channel = 0; channel < 3; channel ++ ) {

						const a = THREE.DataUtils.fromHalfFloat( on.fireEmission[ i + channel ] ), b = THREE.DataUtils.fromHalfFloat( animated.fireEmission[ i + channel ] );
						if ( ! Number.isFinite( a ) || ! Number.isFinite( b ) ) nonfinite ++;
						const delta = Math.abs( a - b ); if ( delta > .000001 ) changedRgbComponents ++; maximumLinearRgbDifference = Math.max( maximumLinearRgbDifference, delta );

					}
					const unchangedCamera = beforeCamera.every( ( value, i ) => value === camera.matrixWorld.elements[ i ] );
					const unchangedNativePose = beforeItemYaw === itemYaw && beforeNative.every( ( previous, j ) => previous.matrix.every( ( value, i ) => value === items[ j ].mesh.matrixWorld.elements[ i ] ) && previous.position.every( ( value, i ) => value === items[ j ].mesh.geometry.attributes.position.array[ i ] ) );
					proceduralVolumeAnimation = { times: [ beforeTime, time ], measured: 'RGB of actual separate HalfFloat emission framebuffer; alpha and final scene lighting excluded', changedRgbComponents, maximumLinearRgbDifference, nonfiniteComponents: nonfinite, unchangedCamera, unchangedNativePose, glErrors: [ on.glError, animated.glError ], pass: changedRgbComponents > 100 && nonfinite === 0 && unchangedCamera && unchangedNativePose && on.glError === 0 && animated.glError === 0 };
					time = beforeTime; update();

				}
				if ( blocker ) { blocker.removeFromParent(); blocker.geometry.dispose(); blocker.material.dispose(); blocker = null; }

			}
			const result = { status: results.every( row => row.pass ) && proceduralVolumeAnimation?.pass ? 'PASS' : 'FAIL', fixedSceneDraws: 7, stage: 'Production separate fire-emission framebuffer captured during R_PostFinish; scene HDR and solid packets read afterward; only volume masters toggled', proceduralVolumeAnimation, results };
			window.powerupsVolumeResult = result; report.textContent = JSON.stringify( result, null, 2 );

		} catch ( error ) { report.textContent = 'FAIL ' + error.stack; window.powerupsVolumeResult = { status: 'FAIL', error: error.stack }; }
		finally { if ( blocker ) { blocker.removeFromParent(); blocker.geometry.dispose(); blocker.material.dispose(); } ( { time, angle, overhead, enabled, focusIndex, rasterScale } = saved ); update(); for ( const group of scene.children.filter( object => object.name.startsWith( 'powerup_' ) ) ) for ( const child of group.children ) child.visible = true; draw(); }

	}
	document.querySelector( '#volume' ).onclick = () => { stopAnimation(); volumeCheck(); };
	update(); check();

} catch ( error ) { report.textContent = 'FAIL ' + error.stack; window.powerupsGpuResult = { status: 'FAIL', error: error.stack }; }
