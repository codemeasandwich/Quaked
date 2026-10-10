import * as THREE from 'three';
import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
await import( '../src/engine/render/gl_rsurf.js' );
const pak = await import( '../src/engine/common/pak.js' ), models = await import( '../src/engine/render/gl_model.js' ), mesh = await import( '../src/engine/render/gl_mesh.js' );
const skins = await import( '../src/newer/render/r_newerskins.js' ), newerMode = await import( '../src/newer/mode.js' ), face = await import( '../src/newer/render/enemy_face.js' );
const vars = await import( '../src/engine/common/cvar.js' ), vid = await import( '../src/engine/render/vid.js' ), dots = ( await import( '../src/engine/common/anorm_dots.js' ) ).r_avertexnormal_dots[ 0 ];
const status = document.querySelector( '#status' ), errors = [], receipts = [];
window.addEventListener( 'error', event => errors.push( event.message ) );
window.addEventListener( 'unhandledrejection', event => errors.push( String( event.reason ) ) );
try {
	vars.Cvar_RegisterVariable( ( await import( '../src/newer/render/gl_post.js' ) ).r_hdr ); vars.Cvar_SetValue( 'r_hdr', 1 );
	newerMode.R_AnimSetNewer( true ); newerMode.R_AnimSetLighting( false ); newerMode.r_newer_normals.value = 0;
	const manifest = await ( await fetch( 'newer/enemies/index.json', { cache: 'no-store' } ) ).json(); if ( new URL( location.href ).searchParams.get( 'sourceTone' ) === '1' ) manifest.models.ogre[ 0 ].faces.colorBalance = [ 1, 1, 1 ];
	skins.R_NewerSetIndex( manifest );
	pak.COM_AddPack( await pak.COM_FetchPak( 'games/shareware/pak0.pak', 'pak0.pak' ) ); vid.VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); models.Mod_Init();
	const renderer = new THREE.WebGLRenderer( { antialias: true, preserveDrawingBuffer: true } ); renderer.setSize( 1200, 900 ); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = 'auto'; renderer.setScissorTest( true ); document.body.append( renderer.domElement );
	let views = [], mode = 0, moving = false, classic = false, activeModel = '', lastFrame = 0, generation = 0;
	function report() {
		const current = views.map( v => ( { seed: v.entity._faceSeed, face: face.Face_Index( v.entity, v.model.name, 12 ), frame: v.entity.frame } ) );
		const bindings = views.map( v => {
			const probe = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
			v.entity._aliasMesh.material.onBeforeCompile?.( probe );
			return { balance: probe.uniforms.uFaceColorBalance?.value?.toArray(), alignment: probe.uniforms.uFaceAlignment?.value?.toArray(), targetPivot: probe.uniforms.uFaceTargetPivot?.value?.toArray(), pixelSize: probe.uniforms.uFacePixelSize?.value?.toArray(), colorShader: probe.fragmentShader.includes( 'uFaceColorBalance' ) };
		} );
		const receipt = { bindings, model: activeModel, colorBalance: manifest.models[ activeModel ]?.[ 0 ]?.faces?.colorBalance || [ 1, 1, 1 ], relief: newerMode.r_newer_normals.value !== 0, lighting: newerMode.R_NewerLightingActive(), manifest: manifest.version, individuals: current, classic, view: mode, status: skins.R_NewerSkinsStatus(), glError: renderer.getContext().getError(), errors, checked: receipts };
		document.querySelector( '#report' ).textContent = JSON.stringify( receipt, null, 2 ); window.enemyFaceReceipt = receipt;
	}
	function render() {
		for ( const [ i, v ] of views.entries() ) {
			const front = mode === 0 ? [ 140, 0, 0 ] : mode === 1 ? [ 110, -110, 0 ] : [ -140, 0, 0 ];
			v.camera.position.copy( v.center ).add( new THREE.Vector3( ...front ) ); v.camera.lookAt( v.center );
			mesh.R_DrawAliasModel( v.entity, v.header, dots, 1.2 );
			renderer.setViewport( i % 4 * 300, ( 2 - Math.floor( i / 4 ) ) * 300, 300, 300 ); renderer.setScissor( i % 4 * 300, ( 2 - Math.floor( i / 4 ) ) * 300, 300, 300 );
			renderer.render( v.scene, v.camera );
		}
		report();
	}
	async function generate( key, random = false ) {
		const epoch = ++ generation;
		status.textContent = 'Loading ' + key + '…';
		for ( const v of views ) v.entity._aliasGeo?.dispose(); views = [];
		const model = models.Mod_ForName( 'progs/' + key + '.mdl', true ), header = model.cache.data;
		await skins.R_NewerSkinsPrepare( [ model ] ); const deadline = performance.now() + 35000;
		while ( ! skins.R_NewerSkinsStatus( [ model ] ).settled && performance.now() < deadline ) await new Promise( resolve => setTimeout( resolve, 30 ) );
		if ( epoch !== generation ) return;
		for ( let i = 0; i < 12; i ++ ) {
			const entity = { model, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ], frame: 0, skinnum: 0, syncbase: 0, _faceSeed: random ? null : i };
			face.Face_Assign( entity, model.name );
			const drawn = mesh.R_DrawAliasModel( entity, header, dots, 1.2 ); drawn.geometry.computeBoundingBox();
			const bounds = drawn.geometry.boundingBox, center = bounds.getCenter( new THREE.Vector3() ); center.z = bounds.max.z - 8;
			const scene = new THREE.Scene(); scene.background = new THREE.Color( 0x272323 ); scene.add( drawn );
			const camera = new THREE.OrthographicCamera( -16, 16, 16, -16, .1, 400 ); camera.up.set( 0, 0, 1 );
			views.push( { model, header, entity, center, scene, camera } );
		}
		activeModel = key; render();
		const ok = skins.R_NewerSkinsStatus( [ model ] ).fallback === 0 && errors.length === 0;
		status.textContent = `${ok ? 'Ready' : 'Fallback — inspect receipt'}: twelve ${key} individuals. Faces stay assigned through animation, views and Classic toggles.`;
		status.dataset.result = ok ? 'pass' : 'fail';
		receipts.push( { model: key, random, faces: views.map( v => v.entity._faceSeed % 12 ), ready: ok } ); report();
	}
	document.querySelector( '#model' ).onchange = event => generate( event.target.value );
	document.querySelector( '#roll' ).onclick = () => generate( activeModel, true );
	document.querySelector( '#view' ).onclick = () => { mode = ( mode + 1 ) % 3; render(); };
	document.querySelector( '#classic' ).onclick = () => { classic = ! classic; newerMode.R_AnimSetClassicPass( classic ); render(); };
	document.querySelector( '#lighting' ).onclick = async () => {
		const on = newerMode.r_newer_normals.value === 0; newerMode.r_newer_normals.value = on ? 1 : 0; newerMode.R_AnimSetLighting( on );
		await skins.R_NewerSkinsPrepare( views.map( v => v.model ) );
		const deadline = performance.now() + 35000; while ( ! skins.R_NewerSkinsStatus().settled && performance.now() < deadline ) await new Promise( resolve => setTimeout( resolve, 30 ) ); render();
	};
	document.querySelector( '#download' ).onclick = () => { const a = document.createElement( 'a' ); a.download = 'enemy-faces-' + activeModel + '.png'; a.href = renderer.domElement.toDataURL( 'image/png' ); a.click();
		const b = document.createElement( 'a' ); b.download = 'enemy-faces-' + activeModel + '.json'; b.href = 'data:application/json;charset=utf-8,' + encodeURIComponent( document.querySelector( '#report' ).textContent ); b.click(); };
	document.querySelector( '#animate' ).onclick = () => { moving = ! moving; };
	function frame( time ) { if ( moving && time - lastFrame > 100 ) { lastFrame = time; for ( const v of views ) v.entity.frame = ( v.entity.frame + 1 ) % v.header.numframes; render(); } requestAnimationFrame( frame ); }
	await generate( 'soldier' ); requestAnimationFrame( frame );
} catch ( error ) { status.textContent = 'FAIL: ' + error.stack; status.dataset.result = 'fail'; console.error( error ); }
