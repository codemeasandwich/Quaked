// One ordinary native E1M3 client/server, with observation-only shader receipts.
const errors = [], panel = document.querySelector( 'section' );
window.addEventListener( 'error', event => errors.push( event.message ) );
for ( const type of [ 'mousedown', 'mouseup', 'keydown', 'keyup', 'pointerdown', 'pointerup' ] ) panel.addEventListener( type, event => event.stopPropagation() );
await import( '../main.js' );
while ( ! window.Cbuf_AddText ) await new Promise( resolve => setTimeout( resolve, 50 ) );
const { cl, cls } = await import( '../src/engine/client/client.js' ), { sv, svs } = await import( '../src/engine/server/server.js' );
const { Cvar_SetValue, Cvar_VariableValue } = await import( '../src/engine/common/cvar.js' );
const { Cbuf_AddText } = await import( '../src/engine/common/cmd.js' ), post = await import( '../src/gl_post.js' );
const { SV_LinkEdict } = await import( '../src/engine/server/world.js' );
const keys = await import( '../src/engine/client/keys.js' ), split = await import( '../src/r_demosplit.js' );
const { PointShadowFaceUV, POINT_SHADOW_SIZE } = await import( '../src/r_pointshadows.js' );
const points = { start: [ -736, -1592, 88 ], corner: [ -800, -1648, 88 ], landing: [ -608, -1600, 152 ], stairs: [ -656, -1264, 120 ], tower: [ -400, -1112, 72.0625 ] };
let setup = false, observed = null;
const render = window.renderer.render;
window.renderer.render = function ( scene, camera ) {
 const material = scene.children?.[ 0 ]?.material;
 if ( material?.fragmentShader?.includes( 'const int BOUNCE_SAMPLES' ) ) observed = material.uniforms;
 return render.call( this, scene, camera );
};
function position( name ) {
 if ( ! setup ) return;
 const player = sv.edicts[ 1 ], target = points[ name ];
 // Hold an inspection camera without gameplay door/trap collisions.
 player.v.movetype = 0; player.v.solid = 0;
 player.v.flags |= 64 | 128; player.v.origin = target; player.v.velocity = [ 0, 0, 0 ]; player.v.angles = [ 0, ( name === 'stairs' || name === 'tower' ) ? 90 : 270, 0 ]; player.v.fixangle = 1;
 cl.viewangles.set( player.v.angles ); SV_LinkEdict( player, false );
}
for ( const name of Object.keys( points ) ) document.querySelector( '#' + name ).onclick = () => position( name );
document.querySelector( '#shadows' ).onclick = () => Cvar_SetValue( 'r_pointshadows', Cvar_VariableValue( 'r_pointshadows' ) ? 0 : 1 );
document.querySelector( '#light' ).onclick = () => Cvar_SetValue( 'r_flashlight', Cvar_VariableValue( 'r_flashlight' ) ? 0 : 1 );
document.querySelector( '#hide' ).onclick = () => { panel.hidden = true; };
document.querySelector( '#probe' ).onclick = () => {
 const atlas = post.R_PointShadowAtlas(), source = post.R_GetWorldLights().find( light => light.pos.join() === '-966,-1750,256' ), entry = atlas?.lookup( source );
 if ( ! entry?.ready ) { document.querySelector( '#report' ).textContent = 'Return to Start and wait for the local torch shadow map.'; return; }
 const witnesses = [ { label: 'clear ray at start', point: [ -736, -1592, 110 ], blocked: false }, { label: 'blocked by native corner', point: [ -800, -1648, 110 ], blocked: true }, { label: 'blocked toward stairs', point: [ -656, -1264, 142 ], blocked: true } ];
 const samples = witnesses.map( witness => {
  const delta = witness.point.map( ( value, k ) => value - source.pos[ k ] ), face = PointShadowFaceUV( delta );
  const x = face.face * POINT_SHADOW_SIZE + Math.min( POINT_SHADOW_SIZE - 1, Math.max( 0, Math.floor( face.uv[ 0 ] * POINT_SHADOW_SIZE ) ) ), y = entry.slot * POINT_SHADOW_SIZE + Math.min( POINT_SHADOW_SIZE - 1, Math.max( 0, Math.floor( face.uv[ 1 ] * POINT_SHADOW_SIZE ) ) );
  const bytes = new Uint8Array( 4 ); window.renderer.readRenderTargetPixels( atlas.target, x, y, 1, 1, bytes );
  const depth = bytes[ 0 ] / 256 + bytes[ 1 ] / 65536 + bytes[ 2 ] / 16777216 + bytes[ 3 ] / ( 255 * 16777216 );
  const distance = Math.hypot( ...delta ), blockerDistance = depth * entry.far;
  return { ...witness, distance, blockerDistance, gpuBlocked: distance - 2 > blockerDistance, bytes: Array.from( bytes ), face: face.face };
 } );
 document.querySelector( '#report' ).textContent = JSON.stringify( { source: source.pos, entry, samples, allExpected: samples.every( sample => sample.gpuBlocked === sample.blocked ), glError: window.renderer.getContext().getError(), errors }, null, 2 );
};
document.querySelector( '#measure' ).onclick = async () => {
 const button = document.querySelector( '#measure' ); button.disabled = true;
 const frames = [], before = post.R_PointShadowStatus(); let previous;
 for ( let i = 0; i < 61; i ++ ) await new Promise( resolve => requestAnimationFrame( time => { if ( previous ) frames.push( time - previous ); previous = time; resolve(); } ) );
 const ordered = frames.slice().sort( ( a, b ) => a - b );
 document.querySelector( '#report' ).textContent = JSON.stringify( { frames: frames.length, meanMs: frames.reduce( ( a, b ) => a + b, 0 ) / frames.length, medianMs: ordered[ Math.floor( ordered.length / 2 ) ], canvas: [ window.renderer.domElement.width, window.renderer.domElement.height ], bounce: Cvar_VariableValue( 'r_bounce' ), flashlight: Cvar_VariableValue( 'r_flashlight' ), sceneScale: post.R_DynResScale(), before, after: post.R_PointShadowStatus(), glError: window.renderer.getContext().getError(), errors }, null, 2 );
 button.disabled = false;
};
split.R_DemoSplitRelease( true ); keys.set_key_dest( keys.key_game );
Cbuf_AddText( 'maxplayers 1\nr_hdr 1\nr_pointshadows 1\nr_bounce 1\nr_flashlight 1\ngamma .75\ncl_showfps 1\nr_dynres 1\nmap e1m3\n' );
setInterval( () => {
 if ( ! setup && sv.active && cls.signon === 4 && svs.clients[ 0 ]?.spawned && cl.worldmodel?.name === 'maps/e1m3.bsp' ) {
  setup = true; Cbuf_AddText( 'god\nnotarget\n' ); position( 'start' );
 }
 const status = post.R_PointShadowStatus(), on = Cvar_VariableValue( 'r_pointshadows' );
 document.querySelector( '#shadows' ).textContent = 'World shadows: ' + ( on ? 'on' : 'off' );
 document.querySelector( '#light' ).textContent = 'Inspection flashlight: ' + ( Cvar_VariableValue( 'r_flashlight' ) ? 'on' : 'off' );
 document.querySelector( '#status' ).textContent = errors.length || status.error ? 'Rendering issue — see diagnostics.' : ! setup ? 'Loading E1M3…' : status.pending ? 'Building nearby shadow maps…' : 'Native light positions · camera-independent world shadows.';
 const count = observed?.uCount?.value || 0, selected = [];
 for ( let i = 0; i < count; i ++ ) selected.push( { positionView: observed.uLightPos.value[ i ].toArray(), shadow: observed.uPointShadowInfo.value[ i ].toArray() } );
 document.querySelector( '#diagnostics' ).textContent = JSON.stringify( { level: cl.worldmodel?.name, setup, player: Array.from( sv.edicts?.[ 1 ]?.v.origin || [] ), angles: Array.from( cl.viewangles ), atlas: status, selected, errors }, null, 2 );
}, 250 );
