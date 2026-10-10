// Observe the actual application's scene render and subsequent classic blit.
// Readback is only for this trial; production rendering has no GPU readbacks.
import * as THREE from 'three';
await import( '../main.js' );
const draw = await import( '../src/gl_draw.js' );
const sbar = await import( '../src/sbar.js' );
const hud = await import( '../src/r_newerhud.js' );
const split = await import( '../src/r_demosplit.js' );
const vid = await import( '../src/vid.js' );
const anim = await import( '../src/r_anim.js' );
const post = await import( '../src/gl_post.js' );
const portal = await import( '../src/gl_portal.js' );
const quake = await import( '../src/glquake.js' );
const { cl, cl_dlights } = await import( '../src/client.js' );
const { Cvar_SetValue } = await import( '../src/engine/common/cvar.js' );
const { R_ClassicTexture } = await import( '../src/r_newertextures.js' );
while ( ! vid.renderer ) await new Promise( resolve => setTimeout( resolve, 10 ) );
const renderer = vid.renderer, render = renderer.render;
const evidence = { frames: 0, restoredFrames: 0, failures: [], modes: {}, observations: { aliases: 0, weapons: 0, liquids: 0, skies: 0, nativeParticles: 0, dynamicLights: 0, enhancedNormals: 0, upgradedTextures: 0, classicHud: 0, enhancedHud: 0 }, sizes: [] };
let mode = 'all', snapshot = null, enhancedTarget = null, classicTarget = null;
function check( condition, message ) { if ( ! condition && ! evidence.failures.includes( message ) ) evidence.failures.push( message ); }
function visible( o ) { for ( let p = o; p; p = p.parent ) if ( ! p.visible ) return false; return true; }
function publish() {

	document.querySelector( '#classic-status' ).textContent = `${evidence.failures.length ? 'FAIL' : 'PASS'} — ${evidence.frames} actual classic draws; ${evidence.restoredFrames} restored; ${evidence.failures.length} failures`;
	document.querySelector( '#classic-evidence' ).textContent = JSON.stringify( evidence, null, 2 );

}
renderer.render = function ( scene, camera ) {

	const target = this.getRenderTarget();
	if ( scene === window.scene && target?.textures?.length >= 2 && target.depthTexture && ! anim.R_ClassicPassActive() ) {

		enhancedTarget = target; snapshot = new Map();
		scene.traverse( o => {

			snapshot.set( o, { material: o.material, position: o.position.toArray(), scale: o.scale.toArray(), parent: o.parent, visible: o.visible,
				colour: o._quakeOwner?._aliasGeo?.getAttribute( 'color' )?.array.slice(), pose: o._quakeOwner?._aliasGeo?.getAttribute( 'position' ) } );
			if ( visible( o ) && o.material?.normalMap ) evidence.observations.enhancedNormals ++;
			if ( visible( o ) && o.material?.map?.userData?.newerPicture ) evidence.observations.upgradedTextures ++;

		} );

	}
	const classic = scene === window.scene && anim.R_ClassicPassActive();
	if ( classic ) {

		classicTarget = target; evidence.frames ++; evidence.modes[ mode ] = ( evidence.modes[ mode ] || 0 ) + 1;
		for ( const get of [ anim.R_IsNewer, anim.R_NewerGame, anim.R_NewerLightingActive, anim.R_AnimEnabled, post.R_PostActive, post.R_WaterActive, portal.R_PortalsActive ] ) check( ! get(), `${get.name} enabled in classic` );
		check( post.classicLook.value === 1, 'native shader curve not selected' );
		check( target.width === enhancedTarget.width && target.height === enhancedTarget.height, 'resolution mismatch' );
		const size = `${target.width}x${target.height}`; if ( ! evidence.sizes.includes( size ) ) evidence.sizes.push( size );
		scene.traverse( o => {

			if ( ! visible( o ) ) return;
			check( ! o.userData.newerOnly && ! [ 'quake_decals', 'quake_level_portal', 'quake_level_view' ].includes( o.name ), 'enhanced-only object visible' );
			if ( o.isPoints && ! o.userData.newerOnly ) evidence.observations.nativeParticles ++;
			if ( o.isPointLight ) evidence.observations.dynamicLights ++;
			if ( o._quakeOwner?._aliasMesh === o ) evidence.observations.aliases ++;
			if ( o._quakeOwner === cl.viewent ) evidence.observations.weapons ++;
			if ( o.userData.quakeLiquid ) { evidence.observations.liquids ++; check( o.material.opacity === quake.r_wateralpha.value && o.material.depthWrite, 'enhanced liquid opacity/depth' ); check( ! o.material.isShaderMaterial, 'camera portal material retained' ); }
			if ( o.userData.quakeSky ) { evidence.observations.skies ++; check( o.material.depthWrite, 'enhanced sky depth' ); }
			for ( const m of ( Array.isArray( o.material ) ? o.material : o.material ? [ o.material ] : [] ) ) {

				for ( const key of [ 'normalMap', 'bumpMap', 'displacementMap', 'envMap' ] ) check( m[ key ] == null, `classic ${key} retained` );
				check( m.emissiveIntensity === undefined || m.emissiveIntensity === 1, 'enhanced emissive boost retained' );
				if ( m.map ) check( m.map.magFilter === THREE.NearestFilter && m.map.anisotropy === 1, 'forced enhanced filtering retained' );
				if ( o.userData.quakeLiquid ) check( m.map === R_ClassicTexture( o.userData.quakeLiquid.gl_texture ), 'liquid original texture missing' );
				if ( m.lightMap ) { const data = m.lightMap.image.data; for ( let p = 0; p < data.length; p += 4 ) check( data[ p ] === data[ p + 1 ] && data[ p ] === data[ p + 2 ], 'coloured lightmap retained' ); }

			}

		} );
		const expectedLights = quake.gl_flashblend.value === 0 ? 0 : cl_dlights.filter( l => l.die >= cl.time && l.radius > 0 ).length;
		check( scene.children.filter( o => o.isPointLight && visible( o ) ).length === expectedLights, 'enhanced dynamic slots retained' );

	}
	// The blit runs after R_ClassicOff, in this same simulation frame.
	if ( classicTarget && scene !== window.scene && target == null && scene.children[ 0 ]?.material?.map === classicTarget.texture ) {

		evidence.restoredFrames ++;
		check( ! anim.R_ClassicPassActive() && post.classicLook.value === 0, 'classic scope not restored' );
		for ( const [ o, saved ] of snapshot ) {

			check( o.material === saved.material && o.parent === saved.parent && o.visible === saved.visible, 'enhanced material/membership not restored' );
			check( o.position.toArray().every( ( v, i ) => v === saved.position[ i ] ) && o.scale.toArray().every( ( v, i ) => v === saved.scale[ i ] ), 'enhanced transform not restored' );
			if ( saved.pose ) check( o._quakeOwner._aliasGeo.getAttribute( 'position' ) === saved.pose, 'enhanced pose not restored' );
			if ( saved.colour ) check( o._quakeOwner._aliasGeo.getAttribute( 'color' ).array.every( ( v, i ) => v === saved.colour[ i ] ), 'enhanced alias light not restored' );

		}
		classicTarget = null;
		publish();

	}
	const result = render.call( this, scene, camera );
	if ( classic ) { check( this.getContext().getError() === 0, 'classic GPU error' ); publish(); }
	return result;

};
function all() {

	mode = 'all';
	for ( const name of [ 'r_hdr', 'r_newer_lighting', 'r_newer_normals', 'r_newer_water', 'r_newer_enemies', 'r_newer_portals', 'r_newer_textures', 'r_newer_hud', 'r_newer_shadows', 'r_bloom', 'r_volumetric', 'r_caustics', 'r_mist', 'r_reflect', 'r_bounce' ] ) Cvar_SetValue( name, 1 );
	Cvar_SetValue( 'gl_texturemode', 0 ); Cvar_SetValue( 'r_lerpmodels', 2 ); Cvar_SetValue( 'r_demosplit', 1 ); Cvar_SetValue( 'gl_flashblend', 1 ); Cvar_SetValue( 'r_shadows', 0 );

}
document.querySelector( '#all' ).onclick = all;
for ( const [ id, name ] of [ [ 'lighting', 'r_newer_lighting' ], [ 'normals', 'r_newer_normals' ], [ 'liquids', 'r_newer_water' ] ] ) document.querySelector( '#' + id ).onclick = () => { all(); mode = id + '-off'; Cvar_SetValue( name, 0 ); };
document.querySelector( '#full' ).onclick = () => { all(); mode = 'full-classic'; Cvar_SetValue( 'r_demosplit', 2 ); };
document.querySelector( '#split' ).onclick = all;
document.querySelector( '#flashblend' ).onclick = () => { all(); mode = 'native-baked-lights'; Cvar_SetValue( 'gl_flashblend', 0 ); };
document.querySelector( '#shadows' ).onclick = () => { all(); mode = 'native-shadows'; Cvar_SetValue( 'r_newer_shadows', 0 ); Cvar_SetValue( 'r_shadows', 1 ); };
while ( ! window.scene ) await new Promise( resolve => setTimeout( resolve, 10 ) );
const context = draw.Draw_GetOverlayCanvas().getContext( '2d' ), clipStack = [];
let rectangle = null, currentClip = null, observedImage = null;
for ( const method of [ 'save', 'restore', 'rect', 'clip', 'drawImage' ] ) {

	const original = context[ method ];
	context[ method ] = function ( ...args ) {

		if ( method === 'save' ) clipStack.push( currentClip );
		if ( method === 'restore' ) currentClip = clipStack.pop();
		if ( method === 'rect' ) rectangle = args;
		if ( method === 'clip' ) currentClip = rectangle;
		if ( method === 'drawImage' ) observedImage = args[ 0 ];
		return original.apply( this, args );

	};

}
function observeHud( original ) {

	return ( x, y, pic ) => {

		observedImage = null;
		const classic = anim.R_ClassicPassActive(), expected = classic ? pic.canvas : hud.R_NewerHudCanvas( pic ) || pic.canvas;
		original( x, y, pic );
		if ( ! split.R_DemoSplitActive() || ! pic.canvas ) return;
		check( observedImage === expected, 'HUD source does not match active half' );
		check( currentClip && currentClip[ 0 ] === ( classic && ! split.R_DemoSplitFull() ? draw.Draw_GetVirtualWidth() / 2 : 0 ), 'HUD half clip missing' );
		evidence.observations[ classic ? 'classicHud' : 'enhancedHud' ] ++;

	};

}
sbar.Sbar_SetExternals( { Draw_Pic: observeHud( draw.Draw_Pic ), Draw_TransPic: observeHud( draw.Draw_TransPic ) } );
all();
