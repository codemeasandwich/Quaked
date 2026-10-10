const controls = document.querySelector( 'section' ); for ( const event of [ 'mousedown', 'mouseup', 'keydown', 'keyup', 'touchstart', 'touchend', 'pointerdown', 'pointerup' ] ) controls.addEventListener( event, e => e.stopPropagation() );
await import( '../main.js' ); while ( ! window.Cbuf_AddText ) await new Promise( r => setTimeout( r, 20 ) );
const menu = await import( '../src/engine/client/menu.js' );
const { Cbuf_AddText, Cmd_ExecuteString } = await import( '../src/engine/common/cmd.js' ), cvar = await import( '../src/engine/common/cvar.js' ), keys = await import( '../src/engine/client/keys.js' );
const { sv, MOVETYPE_NOCLIP } = await import( '../src/engine/server/server.js' ), { cl,cls } = await import( '../src/engine/client/client.js' );
const blendRuntime = await import( '../src/glquake.js' );
const viewRuntime = await import( '../src/engine/client/view.js' ), renderRuntime = await import( '../src/gl_rmain.js' );
const post = await import( '../src/gl_post.js' ), split = await import( '../src/r_demosplit.js' ), world = await import( '../src/engine/server/world.js' );
const probe = await import( '../src/r_waterprobe.js' );
const loadingRuntime=await import('../src/r_demoloading.js');
const { Mod_PointInLeaf } = await import( '../src/gl_model.js' );
window.addEventListener('error',e=>evidence.errors.push(e.message)); window.addEventListener('unhandledrejection',e=>evidence.errors.push(String(e.reason?.stack||e.reason)));
const evidence = { sceneFrames: 0, errors: [], views: {}, pools: [], textures: [], captureFrames: 0, mode: 'startup', viewpoint: null };
const renderer = window.renderer, render = renderer.render; let selected = null;
renderer.render = function ( scene, camera ) {

	const target = this.getRenderTarget();
	if ( target?.isWebGLCubeRenderTarget ) evidence.captureFrames ++;
	if ( scene === window.scene && target?.depthTexture && target.textures.length >= 2 ) {

		evidence.sceneFrames ++; evidence.views[ evidence.mode ] = ( evidence.views[ evidence.mode ] || 0 ) + 1;
		const textures = [];
		scene.traverse( o => { if ( o.visible && o.userData.quakeLiquid && /water/i.test( o.userData.quakeLiquid.name ) ) textures.push( { name: o.userData.quakeLiquid.name, opacity: o.material.opacity, originalMap: o.material.map === o.userData.quakeLiquid.gl_texture, vertexColours: o.material.vertexColors, rgb: o.geometry.getAttribute( 'color' )?.array.slice( 0, 3 ) && Array.from( o.geometry.getAttribute( 'color' ).array.slice( 0, 3 ) ) } ); } );
		evidence.textures = textures;

	}
	if ( scene === window.scene && camera === window.camera ) evidence.screenBlendsThisFrame = [];
	if ( scene.children[ 0 ]?.name === 'quake_screen_blend' ) {
		const m = scene.children[ 0 ].material; evidence.lastScreenBlend = { rgbLinear: m.color.toArray(), alpha: m.opacity, splitDiagnostic: cvar.Cvar_VariableValue( 'r_demosplit' ) }; evidence.screenBlendsThisFrame.push( evidence.lastScreenBlend );
	}
	if ( scene === window.scene && camera === window.camera ) evidence.actualEye = { xyz: Array.from( camera.matrixWorld.elements ).slice( 12, 15 ), contents: renderRuntime.r_viewleaf?.contents, nativeBlend: Array.from( viewRuntime.v_blend ), liquidBlend: Array.from( blendRuntime.v_liquid_blend ) };
	const result = render.call( this, scene, camera ); return result;

};
function publish() {

	evidence.loading=loadingRuntime.R_DemoLoadingStatus();evidence.signon=cls.signon;evidence.serverTime=sv.time;evidence.glError=renderer.getContext().getError(); evidence.clientTime = cl.time; evidence.paused = sv.paused;
	evidence.options = { appearance: cvar.Cvar_VariableValue( 'r_water_look' ), water: cvar.Cvar_VariableValue( 'r_newer_water' ), lighting: cvar.Cvar_VariableValue( 'r_newer_lighting' ), reflect: cvar.Cvar_VariableValue( 'r_reflect' ), flashlight: cvar.Cvar_VariableValue( 'r_flashlight' ), normals:cvar.Cvar_VariableValue('r_newer_normals'), heightShadows:cvar.Cvar_VariableValue('r_heightshadows'), caustics:cvar.Cvar_VariableValue('r_caustics'), textures:cvar.Cvar_VariableValue('r_newer_textures') };

	evidence.pools = post.R_GetLiquidRegions().map( r => ( { kind: r.kind, mapLook: r.mapLook, min: r.min, max: r.max, z: r.z } ) );
	evidence.level = cl.worldmodel?.name;
	evidence.lights = post.R_GetWorldLights().map( l => ( { pos: l.pos, color: l.color, radius: l.radius } ) );
	evidence.liquidFaces = cl.worldmodel?.surfaces?.filter( s => /^\*/.test( s.texinfo?.texture?.name || '' ) ).map( s => ( { name: s.texinfo.texture.name, normal: Array.from( s.plane.normal ), points: s.polys && Array.from( s.polys.verts ).map( v => Array.from( v ).slice( 0, 3 ) ) } ) );
	evidence.probes = probe.R_WaterProbes().length;
	evidence.probeLocations = probe.R_WaterProbes().map( p => ( { centre: p.center, currentPool: post.R_GetLiquidRegions().includes( p.region ), contents: cl.worldmodel ? Mod_PointInLeaf( p.center, cl.worldmodel ).contents : null } ) );
	document.querySelector( '#status' ).textContent = `${evidence.sceneFrames} actual scene draws; ${evidence.mode}; ${evidence.probes || 0} cached probes`;
	document.querySelector( '#report' ).textContent = JSON.stringify( evidence, null, 2 );

}
document.querySelector( '#look-cycle' ).onclick = () => { const choice = ( Math.round( cvar.Cvar_VariableValue( 'r_water_look' ) ) + 1 ) % 5; cvar.Cvar_SetValue( 'r_water_look', choice ); document.querySelector( '#look-cycle' ).textContent = 'Water: ' + [ 'Map', 'Clear', 'Tinted', 'Muddy', 'Toxic' ][ choice ]; evidence.mode = 'appearance-' + choice; };
function startLevel( level ) {

	split.R_DemoSplitRelease( true ); keys.set_key_dest( keys.key_game ); evidence.mode = 'loading';
	selected = null;
	Cbuf_AddText( 'disconnect\nmaxplayers 1\nr_hdr 1\nr_dynres 1\nr_demosplit 0\nr_newer_lighting 1\nr_newer_normals 1\nr_heightshadows 1\nr_newer_textures 1\nr_newer_water 1\nr_reflect 0.6\nr_reflect_screen 1\nr_flashlight 0\nr_water_look 0\nbgmvolume 0\nmap ' + level + '\n' );

}
document.querySelector( '#start' ).onclick = () => startLevel( 'e1m1' );
document.querySelector( '#e1m3' ).onclick = () => startLevel( 'e1m3' );
document.querySelector( '#camera-apply' ).onclick = () => {
	if(cls.signon!==4||loadingRuntime.R_IntroLoadingHolding()){evidence.mode='waiting-for-prepared-map';return;}
	const values = document.querySelector( '#camera-values' ).value.split( /[ ,]+/ ).map( Number );
	if ( values.length !== 5 || ! values.every( Number.isFinite ) || ! cl.worldmodel ) return;
	const [ x, y, z, pitch, yaw ] = values, player = sv.edicts?.[ 1 ];
	if ( ! player || Mod_PointInLeaf( [ x, y, z ], cl.worldmodel ).contents === - 2 ) return;
	player.v.movetype = MOVETYPE_NOCLIP; player.v.health = 100; player.v.velocity = [ 0, 0, 0 ];
	player.v.origin = [ x, y, z - 22 ]; player.v.v_angle = [ pitch, yaw, 0 ]; player.v.angles = [ pitch, yaw, 0 ]; player.v.fixangle = 1;
	cl.viewangles.set( player.v.v_angle ); world.SV_LinkEdict( player, false ); keys.set_key_dest( keys.key_game );
	evidence.mode = 'reference-camera'; evidence.viewpoint = { eye: [ x, y, z ], angles: [ pitch, yaw, 0 ] };
};
function choosePool() {

	const regions = post.R_GetLiquidRegions().filter( r => r.kind === 0 );
	if ( ! selected || ! regions.includes( selected ) ) selected = regions.sort( ( a, b ) => ( b.max[ 0 ] - b.min[ 0 ] ) * ( b.max[ 1 ] - b.min[ 1 ] ) - ( a.max[ 0 ] - a.min[ 0 ] ) * ( a.max[ 1 ] - a.min[ 1 ] ) )[ 0 ];
	return selected;

}
function place( mode = 'pool', phase = 0 ) {

	const pool = choosePool(), player = sv.edicts?.[ 1 ]; if ( ! pool || ! player ) return;
	let cx = ( pool.min[ 0 ] + pool.max[ 0 ] ) / 2, cy = ( pool.min[ 1 ] + pool.max[ 1 ] ) / 2;
	const lights = post.R_GetWorldLights().filter( l => Math.abs( l.pos[ 2 ] - pool.z ) < 300 ); lights.sort( ( a, b ) => Math.hypot( a.pos[ 0 ] - cx, a.pos[ 1 ] - cy ) - Math.hypot( b.pos[ 0 ] - cx, b.pos[ 1 ] - cy ) );
	let light = lights[ 0 ];
	// The merged pool may be L-shaped. Select an actual water polygon in air
	// near its light rather than placing the camera in a solid AABB midpoint.
	const points = [];
	for ( const surface of cl.worldmodel.surfaces ) {

		if ( ! /water/i.test( surface.texinfo?.texture?.name || '' ) || Math.abs( surface.plane?.normal?.[ 2 ] || 0 ) < .95 ) continue;
		for ( let p = surface.polys; p; p = p.next ) {

			const xyz = [ 0, 0, 0 ]; for ( let i = 0; i < p.numverts; i ++ ) for ( let k = 0; k < 3; k ++ ) xyz[ k ] += p.verts instanceof Float32Array ? p.verts[ i * 7 + k ] : p.verts[ i ][ k ];
			for ( let k = 0; k < 3; k ++ ) xyz[ k ] /= p.numverts;
			if ( Math.abs( xyz[ 2 ] - pool.z ) > 2 || Mod_PointInLeaf( [ xyz[ 0 ], xyz[ 1 ], pool.z + 40 ], cl.worldmodel ).contents === - 2 ) continue;
			points.push( xyz );

		}

	}
	const visible = [];
	for ( const point of points ) for ( const source of lights ) {

		const distance = Math.hypot( point[ 0 ] - source.pos[ 0 ], point[ 1 ] - source.pos[ 1 ] );
		if ( distance < 80 || distance > 360 || source.pos[ 2 ] < pool.z + 8 ) continue;
		const trace = world.SV_Move( [ point[ 0 ], point[ 1 ], pool.z + 36 ], [ 0, 0, 0 ], [ 0, 0, 0 ], source.pos, world.MOVE_NOMONSTERS, player );
		if ( ! trace.startsolid && trace.fraction > .95 ) visible.push( { point, source, score: Math.abs( distance - 160 ) } );

	}
	if ( visible.length ) { visible.sort( ( a, b ) => a.score - b.score ); [ cx, cy ] = visible[ 0 ].point; light = visible[ 0 ].source; }
	else if ( points.length ) { points.sort( ( a, b ) => light ? Math.abs( Math.hypot( a[ 0 ] - light.pos[ 0 ], a[ 1 ] - light.pos[ 1 ] ) - 144 ) - Math.abs( Math.hypot( b[ 0 ] - light.pos[ 0 ], b[ 1 ] - light.pos[ 1 ] ) - 144 ) : Math.hypot( a[ 0 ] - cx, a[ 1 ] - cy ) - Math.hypot( b[ 0 ] - cx, b[ 1 ] - cy ) ); [ cx, cy ] = points[ 0 ]; }
	const yaw = light ? Math.atan2( light.pos[ 1 ] - cy, light.pos[ 0 ] - cx ) * 180 / Math.PI : 90;
	let height = mode === 'under-near' ? - 6 : mode === 'under-mid' ? - 32 : mode === 'under-far' ? - 80 : mode === 'under' ? - 16 : mode === 'grazing' ? 20 : mode === 'down' ? 72 : 40;
	// Test presets stay above solid floor even when the requested depth exceeds
	// this particular pool. Record the actual depth rather than claiming it.
	while ( height < - 6 && Mod_PointInLeaf( [ cx, cy, pool.z + height ], cl.worldmodel ).contents === - 2 ) height += 4;
	const pitch = mode.startsWith( 'under-' ) ? - 55 : mode === 'under' ? - 12 : mode === 'grazing' ? 6 : mode === 'down' ? 65 : 20;
	player.v.movetype = MOVETYPE_NOCLIP; player.v.health = 100; player.v.velocity = [ 0, 0, 0 ]; player.v.button0 = 0;
	player.v.origin = [ cx + Math.sin( phase ) * Math.min( 32, ( pool.max[ 0 ] - pool.min[ 0 ] ) / 6 ), cy, pool.z + height - 22 ];
	player.v.v_angle = [ pitch, yaw + Math.sin( phase * .7 ) * 18, 0 ];
	// fixangle serializes v.angles; keep its full view pitch until the packet is
	// sent. Ordinary player physics restores the model's -pitch/3 afterward.
	player.v.angles = Array.from( player.v.v_angle ); player.v.fixangle = 1;
	cl.viewangles.set( player.v.v_angle ); world.SV_LinkEdict( player, false ); keys.set_key_dest( keys.key_game );
	evidence.mode = mode; evidence.viewpoint = { pool: { min: pool.min, max: pool.max, z: pool.z }, eye: [ player.v.origin[ 0 ], player.v.origin[ 1 ], pool.z + height ], angles: Array.from( player.v.v_angle ), light: light?.pos || null };

}
for ( const mode of [ 'pool', 'grazing', 'down', 'under', 'under-near', 'under-mid', 'under-far' ] ) document.querySelector( '#' + mode ).onclick = () => place( mode );
document.querySelector( '#walk' ).onclick = async () => { for ( let i = 0; i < 152; i ++ ) { place( 'grazing', i / 24 ); await new Promise( r => setTimeout( r, i % 3 === 1 ? 60 : 70 ) ); } };
for ( const [ id, name ] of [ [ 'water', 'r_newer_water' ], [ 'lighting', 'r_newer_lighting' ], [ 'normals', 'r_newer_normals' ], [ 'height-shadows', 'r_heightshadows' ], [ 'caustics', 'r_caustics' ], [ 'reflection', 'r_reflect' ], [ 'flashlight', 'r_flashlight' ] ] ) document.querySelector( '#' + id ).onclick = () => { cvar.Cvar_SetValue( name, cvar.Cvar_VariableValue( name ) > 0 ? 0 : id === 'reflection' ? .6 : 1 ); evidence.mode = id + '-toggle'; };
document.querySelector( '#features-menu' ).onclick = () => { Cmd_ExecuteString( 'menu_options' ); menu.M_Keydown( keys.K_ENTER ); };
document.querySelector( '#classic-diagnostic' ).onclick = () => { cvar.Cvar_SetValue( 'r_demosplit', cvar.Cvar_VariableValue( 'r_demosplit' ) === 2 ? 0 : 2 ); evidence.mode = 'classic-diagnostic'; };
document.querySelector( '#pause' ).onclick = () => Cbuf_AddText( 'pause\n' );
document.querySelector( '#hide' ).onclick = () => { controls.style.display = 'none'; };
setInterval( publish, 500 ); publish();
