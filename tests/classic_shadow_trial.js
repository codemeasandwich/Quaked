// Public native demo parser + real Classic render endpoint. Diagnostic draws
// never advance the simulation and restore every temporary switch/visibility.
const panel = document.querySelector( 'section' ), status = document.querySelector( '#status' ), report = document.querySelector( '#report' );
for ( const event of [ 'mousedown', 'mouseup', 'keydown', 'keyup', 'pointerdown', 'pointerup' ] ) panel.addEventListener( event, e => e.stopPropagation() );
document.querySelector( '#hide' ).onclick = () => { panel.hidden = true; };
document.addEventListener( 'keydown', e => { if ( e.key === 'Escape' ) { panel.hidden = false; e.stopImmediatePropagation(); } }, true );
const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );
const started = performance.now(); let busy = true;
try {

	await import( '../main.js' );
	while ( ! window.Cbuf_AddText || ! window.renderer ) { if ( performance.now() - started > 115000 ) throw new Error( 'Application startup exceeded 115 seconds' ); await sleep( 50 ); }
	const renderer = window.renderer; renderer.setAnimationLoop( null );
	const THREE = await import( 'three' ), { COM_FindFile } = await import( '../src/engine/common/pak.js' );
	const { cl, cls, cl_entities } = await import( '../src/engine/client/client.js' );
	const { CL_PlayDemoFromData, CL_GetMessage } = await import( '../src/engine/client/cl_demo.js' ), { CL_ParseServerMessage } = await import( '../src/engine/client/cl_parse.js' );
	const { CL_RelinkEntities } = await import( '../src/engine/client/cl_main.js' ), { V_CalcRefdef } = await import( '../src/engine/client/view.js' );
	const { SCR_UpdateScreen, SCR_EndLoadingPlaque } = await import( '../src/engine/render/gl_screen.js' );
	const { Cvar_SetValue, Cvar_VariableValue } = await import( '../src/engine/common/cvar.js' ), keys = await import( '../src/engine/client/keys.js' );
	const { R_DemoLoadingCancel } = await import( '../src/r_demoloading.js' ), { LoadingScreen_Remove } = await import( '../src/loading_screen.js' );
	const { rockUniforms } = await import( '../src/newer/render/r_rockfield.js' ), { heightShadowUniforms } = await import( '../src/newer/render/r_heightshadows.js' );
	const { classicLook } = await import( '../src/newer/render/gl_post.js' ), { vid } = await import( '../src/engine/render/vid.js' );
	const whiteLightmap = new THREE.DataTexture( new Uint8Array( [ 255, 255, 255, 255 ] ), 1, 1 ); whiteLightmap.channel = 1; whiteLightmap.needsUpdate = true;
	const data = COM_FindFile( 'demo1.dem' )?.data; if ( ! data ) throw new Error( 'Native demo1.dem unavailable' );
	const demoBytes = data instanceof Uint8Array ? data : new Uint8Array( data );
	renderer.setPixelRatio( 1 ); renderer.setSize( 800, 500 ); vid.width = 800; vid.height = 500; vid.recalc_refdef = true;
	function decode( target ) {

		if ( target.texture.type !== THREE.HalfFloatType ) throw new Error( 'Expected real Classic half-float target' );
		const half = new Uint16Array( target.width * target.height * 4 ); renderer.readRenderTargetPixels( target, 0, 0, target.width, target.height, half );
		return Float32Array.from( half, THREE.DataUtils.fromHalfFloat );

	}
	function difference( a, b, width, height ) {

		let changedPixels = 0, sum = 0, maximum = 0, minX = width, minY = height, maxX = -1, maxY = -1;
		for ( let i = 0; i < a.length; i += 4 ) {

			let changed = false; for ( let c = 0; c < 3; c ++ ) { const delta = Math.abs( a[ i + c ] - b[ i + c ] ); maximum = Math.max( maximum, delta ); sum += delta; if ( delta > .001 ) changed = true; }
			if ( changed ) { changedPixels ++; const x = i / 4 % width, y = Math.floor( i / 4 / width ); minX = Math.min( minX, x ); maxX = Math.max( maxX, x ); minY = Math.min( minY, y ); maxY = Math.max( maxY, y ); }

		}
		return { changedPixels, totalPixels: width * height, meanLinearRgbDifference: sum / ( width * height * 3 ), maximumLinearDifference: maximum, changedBoundsBottomLeft: changedPixels ? [ minX, minY, maxX, maxY ] : null };

	}
	function preview( data, width, height, label ) {

		const canvas = document.createElement( 'canvas' ); canvas.width = width; canvas.height = height;
		const context = canvas.getContext( '2d' ), image = context.createImageData( width, height );
		const srgb = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** ( 1 / 2.4 ) - .055;
		for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

			const source = ( y * width + x ) * 4, dest = ( ( height - y - 1 ) * width + x ) * 4;
			for ( let c = 0; c < 3; c ++ ) image.data[ dest + c ] = Math.round( 255 * srgb( Math.min( 1, Math.max( 0, data[ source + c ] * renderer.toneMappingExposure ) ) ) ); image.data[ dest + 3 ] = 255;

		}
		context.putImageData( image, 0, 0 ); const figure = document.createElement( 'figure' ), img = document.createElement( 'img' ), caption = document.createElement( 'figcaption' ); img.src = canvas.toDataURL(); img.alt = label; caption.textContent = label; figure.append( img, caption ); document.querySelector( '#captures' ).append( figure );

	}
	function rays( scene, camera ) {

		const ray = new THREE.Raycaster(), records = [];
		for ( const [ label, x, y ] of [ [ 'center', 0, 0 ], [ 'upper right', .55, .45 ], [ 'upper left', -.4, .4 ] ] ) {

			ray.setFromCamera( new THREE.Vector2( x, y ), camera );
			const hit = ray.intersectObjects( scene.children, true ).find( hit => hit.object.visible && hit.object.name.startsWith( 'world_' ) );
			if ( ! hit ) { records.push( { label, hit: false } ); continue; }
			const material = Array.isArray( hit.object.material ) ? hit.object.material[ hit.face.materialIndex ] : hit.object.material;
			const lightmap = material.lightMap, image = lightmap?.image, uv = hit.uv1?.clone(); let atlasSample = null;
			if ( uv && image?.data && image.width && image.height ) {

				lightmap.transformUv( uv ); const px = Math.max( 0, Math.min( image.width - 1, Math.floor( uv.x * image.width ) ) ), py = Math.max( 0, Math.min( image.height - 1, Math.floor( uv.y * image.height ) ) );
				const channels = image.data.length / ( image.width * image.height ), offset = ( py * image.width + px ) * channels;
				atlasSample = { size: [ image.width, image.height ], channel: lightmap.channel, uv: uv.toArray(), pixel: [ px, py ], values: Array.from( image.data.slice( offset, offset + channels ) ), storage: image.data.constructor.name, colorSpace: lightmap.colorSpace };

			}
			records.push( { label, object: hit.object.name, point: hit.point.toArray(), uv: hit.uv?.toArray(), lightmapUv: hit.uv1?.toArray(), materialType: material.type, nativeAtlasSample: atlasSample } );

		}
		return records;

	}
	async function seek( requested ) {

		if ( busy ) return; busy = true; const deadline = performance.now() + 110000;
		const controls = [ ...panel.querySelectorAll( 'button,input' ) ]; controls.forEach( element => { element.disabled = true; } );
		const originalRender = renderer.render; let intercepted = false, result;
		try {

			const packet = Math.max( 5, Math.min( 973, Math.trunc( requested ) ) ); document.querySelector( '#packet' ).value = packet;
			status.textContent = 'Replaying native demo packets to ' + packet + '…'; report.textContent = ''; document.querySelector( '#captures' ).replaceChildren();
			CL_PlayDemoFromData( demoBytes.buffer.slice( demoBytes.byteOffset, demoBytes.byteOffset + demoBytes.byteLength ), false ); cls.timedemo = false; cl.paused = false; R_DemoLoadingCancel();
			let consumed = 0;
			while ( consumed < packet ) {

				R_DemoLoadingCancel(); cl.time = cl.mtime[ 0 ] + 1;
				if ( CL_GetMessage() !== 1 ) throw new Error( 'Native parser stopped at packet ' + consumed ); CL_ParseServerMessage(); consumed ++;
				if ( performance.now() > deadline ) throw new Error( 'Bounded seek timed out' );
				if ( consumed % 64 === 0 ) await sleep( 0 );

			}
			cl.time = cl.mtime[ 0 ]; cl.oldtime = cl.time; CL_RelinkEntities(); V_CalcRefdef(); cl.paused = true;
			keys.set_key_dest( keys.key_game ); R_DemoLoadingCancel(); SCR_EndLoadingPlaque(); LoadingScreen_Remove();
			for ( const [ name, value ] of Object.entries( { r_hdr: 1, r_demosplit: 2, r_dynres: 0, r_newer_lighting: 1, viewsize: 120 } ) ) Cvar_SetValue( name, value );
			status.textContent = 'Warming a bounded frozen scene…';
			for ( let i = 0; i < 8; i ++ ) { SCR_UpdateScreen(); if ( performance.now() > deadline ) throw new Error( 'Bounded warmup timed out' ); await sleep( 50 ); }
			renderer.render = function ( scene, camera ) {

				const value = originalRender.call( this, scene, camera );
				if ( intercepted || scene !== window.scene || classicLook.value !== 1 ) return value;
				intercepted = true; const target = renderer.getRenderTarget(); if ( ! target ) throw new Error( 'Classic endpoint did not use its native render target' );
				const baseline = decode( target ), width = target.width, height = target.height, shadows = [];
				scene.traverse( object => { if ( object.visible && object._quakeOwner?._aliasShadowMesh === object ) shadows.push( object ); } );
				const rock = rockUniforms.qrRockOn.value, heightOn = heightShadowUniforms.uHeightShadowOn.value;
				const rerender = () => { renderer.clear( true, true, false ); originalRender.call( renderer, scene, camera ); return decode( target ); };
				const sourceRayWitness = rays( scene, camera ), lightmaps = new Map();
				scene.traverse( object => { for ( const material of Array.isArray( object.material ) ? object.material : object.material ? [ object.material ] : [] ) if ( material.lightMap ) lightmaps.set( material, material.lightMap ); } );
				const nativeShadows = []; let reliefOff, allShadowsOff, whiteLightmapView;
				try {

					rockUniforms.qrRockOn.value = 0; heightShadowUniforms.uHeightShadowOn.value = 0; reliefOff = rerender(); rockUniforms.qrRockOn.value = rock; heightShadowUniforms.uHeightShadowOn.value = heightOn;
					for ( const object of shadows.slice( 0, 32 ) ) {

						if ( performance.now() > deadline ) throw new Error( 'Bounded shadow isolation timed out' );
						object.visible = false; let removed; try { removed = rerender(); } finally { object.visible = true; }
						const entity = object._quakeOwner; nativeShadows.push( { entity: cl_entities.indexOf( entity ), model: entity.model?.name, origin: Array.from( entity.origin || [] ), shadowPosition: object.position.toArray(), vertices: object.geometry?.attributes.position?.count, difference: difference( baseline, removed, width, height ) } );

					}
					for ( const object of shadows ) object.visible = false; allShadowsOff = rerender(); for ( const object of shadows ) object.visible = true;
					for ( const material of lightmaps.keys() ) material.lightMap = whiteLightmap; whiteLightmapView = rerender(); for ( const [ material, lightmap ] of lightmaps ) material.lightMap = lightmap;

				} finally { rockUniforms.qrRockOn.value = rock; heightShadowUniforms.uHeightShadowOn.value = heightOn; for ( const object of shadows ) object.visible = true; for ( const [ material, lightmap ] of lightmaps ) material.lightMap = lightmap; renderer.clear( true, true, false ); originalRender.call( renderer, scene, camera ); }
				let nonblack = 0; for ( let i = 0; i < baseline.length; i += 4 ) if ( baseline[ i ] + baseline[ i + 1 ] + baseline[ i + 2 ] > .01 ) nonblack ++;
				preview( baseline, width, height, 'Actual Classic target · original' ); preview( allShadowsOff, width, height, 'Same Classic target · native alias shadows hidden' ); preview( whiteLightmapView, width, height, 'Same Classic target · original baked lightmaps replaced with white' );
				result = { status: nonblack > width * height * .1 ? 'CAPTURED' : 'FAIL_BLANK', packet: consumed, map: cl.worldmodel?.name, demoTime: cl.time, player: Array.from( cl_entities[ cl.viewentity ].origin ), viewAngles: Array.from( cl.viewangles ), camera: camera.position.toArray(), target: [ width, height ], nonblackPixels: nonblack, classicLook: classicLook.value, reliefUniforms: { rock, heightOn }, nativeShadowCvar: Cvar_VariableValue( 'r_shadows' ), reliefDisabled: difference( baseline, reliefOff, width, height ), allNativeShadowsDisabled: difference( baseline, allShadowsOff, width, height ), whiteBakedLightmaps: { changedMaterials: lightmaps.size, difference: difference( baseline, whiteLightmapView, width, height ) }, sourceRayWitness, visibleNativeShadowCount: shadows.length, individualShadowLimit: 32, nativeShadows, glError: renderer.getContext().getError() };
				return value;

			};
			SCR_UpdateScreen(); if ( ! intercepted ) throw new Error( 'No actual Classic endpoint draw observed' );
			window.classicShadowTrialResult = result; report.textContent = JSON.stringify( result, null, 2 ); status.textContent = result.status + ' · packet ' + packet + ' · frozen native demo; no animation loop';

		} catch ( error ) { window.classicShadowTrialResult = { status: 'FAIL', error: error.stack }; report.textContent = error.stack; status.textContent = 'FAIL'; }
		finally { renderer.render = originalRender; renderer.setAnimationLoop( null ); controls.forEach( element => { element.disabled = false; } ); busy = false; }

	}
	busy = false;
	document.querySelector( '#seek' ).onclick = () => seek( Number( document.querySelector( '#packet' ).value ) );
	for ( const button of document.querySelectorAll( '[data-packet]' ) ) button.onclick = () => seek( Number( button.dataset.packet ) );
	document.querySelector( '#prev' ).onclick = () => seek( Number( document.querySelector( '#packet' ).value ) - 5 );
	document.querySelector( '#next' ).onclick = () => seek( Number( document.querySelector( '#packet' ).value ) + 5 );
	await seek( Number( new URLSearchParams( location.search ).get( 'packet' ) || 850 ) );

} catch ( error ) { window.renderer?.setAnimationLoop( null ); report.textContent = error.stack; status.textContent = 'FAIL'; window.classicShadowTrialResult = { status: 'FAIL', error: error.stack }; }
