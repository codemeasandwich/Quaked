// One real, ordinary client/server. No synthetic geometry or extra game loop.
const panel = document.querySelector( 'section' ), errors = [];
const originalError = console.error;
console.error = ( ...args ) => { errors.push( args.map( a => String( a ) ).join( ' ' ).slice( 0, 2000 ) ); if ( errors.length > 8 ) errors.shift(); originalError( ...args ); };
window.addEventListener( 'error', e => errors.push( e.message ) );
for ( const type of [ 'mousedown', 'mouseup', 'keydown', 'keyup', 'pointerdown', 'pointerup' ] ) panel.addEventListener( type, e => e.stopPropagation() );
await import( '../main.js' );
while ( ! window.Cbuf_AddText ) await new Promise( r => setTimeout( r, 50 ) );
const { Cbuf_AddText } = await import( '../src/engine/common/cmd.js' ), { Cvar_SetValue, Cvar_VariableValue } = await import( '../src/engine/common/cvar.js' );
const { cl, cls } = await import( '../src/engine/client/client.js' ), { sv, svs } = await import( '../src/engine/server/server.js' );
const post = await import( '../src/gl_post.js' );
const { R_HeightShadowDecode } = await import( '../src/r_heightshadows.js' );
const THREE = await import( 'three' );
const { SV_LinkEdict } = await import( '../src/engine/server/world.js' );
const { SV_HullPointContents } = await import( '../src/engine/server/world.js' );
const { R_DemonReliefStatus } = await import( '../src/engine/render/gl_rsurf.js' );
const { Mod_PointInLeaf } = await import( '../src/engine/render/gl_model.js' );
const drops = await import( '../src/r_screendrops.js' );
const keys = await import( '../src/engine/client/keys.js' ), split = await import( '../src/r_demosplit.js' ), rock = await import( '../src/r_rockfield.js' );
let generation = 0, setupCount = 0, inspectionMovement = null;
// Trial-only A/B switch uses the production shader's uniform holder.
const { rockBandWarpOn } = await import('../src/r_rockshader.js');
document.querySelector('#band-warp').onclick = () => {
 rockBandWarpOn.value = 1-rockBandWarpOn.value;
 document.querySelector('#band-warp').textContent = 'Break up bands: '+(rockBandWarpOn.value?'on':'off');
};
document.querySelector( '#wall-band' ).onclick = () => {
 if ( !sv.active || cls.signon !== 4 || !sv.edicts?.[1] ) return;
 Cvar_SetValue('scr_centertime',0);
 position( [864,1008,-39.969], [0,0,0] );
 inspectionMovement = sv.edicts[1].v.movetype; sv.edicts[1].v.movetype = 0;
};

const viewParams = new URLSearchParams( location.search );
const initialLevel = [ 'start', 'e1m1', 'e1m2', 'e1m6' ].includes( viewParams.get( 'level' ) ) ? viewParams.get( 'level' ) : 'e1m1';
function viewVector( key, fallback ) {
 const text = viewParams.get( key );
 if ( ! text ) return fallback;
 const v = text.split( ',' ).map( Number );
 return v.length === 3 && v.every( n => Number.isFinite( n ) && Math.abs( n ) < 32768 ) ? v : fallback;
}
const initialPosition = viewVector( 'pos', initialLevel === 'start' ? [ 544, 288, 32 ] : [ 128, 1008, -199.95 ] );
const initialAngles = viewVector( 'angles', [ 0, 90, 0 ] );
function position( target = initialPosition, angles = initialAngles ) {
 if ( ! sv.active || cls.signon !== 4 ) return;
 const player = sv.edicts[ 1 ];
 if ( inspectionMovement !== null ) { player.v.movetype = inspectionMovement; inspectionMovement = null; }
 player.v.flags |= 64 | 128;
 player.v.origin = target; player.v.velocity = [ 0, 0, 0 ]; player.v.angles = angles; player.v.v_angle = angles; player.v.fixangle = 1; cl.viewangles.set( angles ); SV_LinkEdict( player, false ); drops.R_ScreenDropsClear(); setupCount ++;
}
document.querySelector( "#position" ).onclick = () => position( initialLevel === 'start' ? [ 864, 792, -39.969 ] : [ 128, 1008, -199.95 ], [ 0, 90, 0 ] );
if ( initialLevel === 'start' ) { document.querySelector( '#position' ).textContent = 'Hard entrance'; document.querySelector( '#logo' ).hidden = false;  }
document.querySelector( '#logo' ).onclick = () => {
 if ( ! sv.active || cls.signon !== 4 ) return;
 // Inspection only: hold a real client camera at plaque height, without
 // gravity pulling it down. Returning to an entrance restores native movement.
 position( [ 544, 576, 272 ], [ 0, 90, 0 ] );
 inspectionMovement = sv.edicts[ 1 ].v.movetype; sv.edicts[ 1 ].v.movetype = 0;
 Cvar_SetValue( 'r_flashlight', 1 );
};
if ( [ 'start', 'e1m2', 'e1m6' ].includes( initialLevel ) ) { document.querySelector( '#face' ).hidden = false; document.querySelector( '#face-angle' ).hidden = false; document.querySelector( '#face-side' ).hidden = false; document.querySelector( '#face-relief' ).hidden = false; }
function inspectFace( mode = 0 ) {
 if ( ! sv.active || cls.signon !== 4 ) return;
 const face = cl.worldmodel.surfaces.find( s => [ 'dem4_1', 'dem4_4', 'dem5_3' ].includes( s.texinfo?.texture?.name ) && s.polys );
 if ( ! face ) return;
 const points = []; for ( let p = face.polys; p; p = p.next ) for ( let i = 0; i < p.numverts; i ++ ) points.push( Array.from( p.verts.slice( i * 7, i * 7 + 3 ) ) );
 const center = [ 0, 1, 2 ].map( k => ( Math.min( ...points.map( p => p[ k ] ) ) + Math.max( ...points.map( p => p[ k ] ) ) ) / 2 );
 const normal = Array.from( face.plane.normal, x => x * ( face.flags & 2 ? -1 : 1 ) );
 const tangent = Math.hypot( normal[ 0 ], normal[ 1 ] ) > .01 ? [ normal[ 1 ], -normal[ 0 ], 0 ] : [ 1, 0, 0 ];
 let eye = null;
 const distances = mode === 2 ? [ 24, 32, 48, 64, 80 ] : mode === 1 ? [ 64, 80, 96, 112 ] : [ 112, 96, 80, 64, 48, 32 ];
 for ( const distance of distances ) {
  for ( const direction of [ 1, -1 ] ) {
   const lateral = mode === 2 ? 96 : mode === 1 ? 64 : 0;
   const candidate = center.map( ( x, k ) => x + normal[ k ] * distance + tangent[ k ] * lateral * direction );
   if ( Mod_PointInLeaf( candidate, cl.worldmodel ).contents !== -2 ) { eye = candidate; break; }
  }
  if ( eye ) break;
 }
 if ( ! eye ) return;
 const aim = center.map( ( x, k ) => x - eye[ k ] );
 position( [ eye[ 0 ], eye[ 1 ], eye[ 2 ] - 22 ], [ -Math.atan2( aim[ 2 ], Math.hypot( aim[ 0 ], aim[ 1 ] ) ) * 180 / Math.PI, Math.atan2( aim[ 1 ], aim[ 0 ] ) * 180 / Math.PI, 0 ] );
 inspectionMovement = sv.edicts[ 1 ].v.movetype; sv.edicts[ 1 ].v.movetype = 0;
 Cvar_SetValue( 'r_newer_normals', 1 ); Cvar_SetValue( 'r_flashlight', 1 );
 document.querySelector( '#face-relief' ).textContent = 'Face relief: on';
}
document.querySelector( '#face' ).onclick = () => inspectFace( 0 );
document.querySelector( '#face-angle' ).onclick = () => inspectFace( 1 );
document.querySelector( '#face-side' ).onclick = () => inspectFace( 2 );
document.querySelector( '#face-relief' ).onclick = () => {
 const on = Cvar_VariableValue( 'r_newer_normals' ) === 0; Cvar_SetValue( 'r_newer_normals', on ? 1 : 0 );
 document.querySelector( '#face-relief' ).textContent = on ? 'Face relief: on' : 'Face relief: off';
};
document.querySelector( '#cliff' ).onclick = () => {
 if ( ! sv.active || cls.signon !== 4 ) return;
 cl.viewangles.set( [ -8, 35, 0 ] ); sv.edicts[ 1 ].v.angles = [ -8, 35, 0 ]; sv.edicts[ 1 ].v.fixangle = 1;
};
document.querySelector('#retreat').onclick=()=>{
 if(initialLevel!=='e1m1'||!sv.active||cls.signon!==4)return;
 const point=[[128,768,-199.96875],[128,512,-199.96875],[128,256,-199.96875]].find(p=>SV_HullPointContents(cl.worldmodel.hulls[1],cl.worldmodel.hulls[1].firstclipnode,p)===-1);
 if(point)position(point,[-8,35,0]);
};
document.querySelector( '#roof' ).onclick = () => {
 if ( ! sv.active || cls.signon !== 4 ) return;
 const yaw = cl.viewangles[ 1 ]; cl.viewangles.set( [ -65, yaw, 0 ] );
 sv.edicts[ 1 ].v.angles = [ -65, yaw, 0 ]; sv.edicts[ 1 ].v.fixangle = 1;
};
function start() {
 const token = ++ generation, oldEdicts = sv.edicts; inspectionMovement = null;
 split.R_DemoSplitRelease( true ); keys.set_key_dest( keys.key_game );
 Cbuf_AddText( 'maxplayers 1\nr_hdr 1\nr_dynres 1\nr_flashlight 1\nr_heightshadows 1\nr_pointshadows 1\ngamma .75\nmap ' + initialLevel + '\n' );
 const ready = setInterval( () => {
  if ( token !== generation ) { clearInterval( ready ); return; }
  if ( sv.edicts === oldEdicts || ! svs.clients[ 0 ]?.spawned || cls.demoplayback || cls.signon !== 4 || ! sv.active || cl.worldmodel?.name !== 'maps/' + initialLevel + '.bsp' || cl.stats[ 0 ] <= 0 ) return;
  clearInterval( ready ); split.R_DemoSplitRelease( true ); Cvar_SetValue( 'r_hdr', 1 ); Cvar_SetValue( 'r_rockfield', 1 );
  position();
  if (viewParams.get('inspect') === 'bands') document.querySelector('#wall-band').onclick();
 }, 100 );
}
document.querySelector( '#materials' ).onclick = () => {
 const ray = new THREE.Raycaster(), found = [];
 for ( const [ label, x, y ] of [ [ 'left wall', -.55, .2 ], [ 'right wall', .55, .2 ], [ 'ahead', 0, 0 ], [ 'above', 0, .6 ], [ 'below', 0, -.5 ] ] ) {
  ray.setFromCamera( new THREE.Vector2( x, y ), window.camera );
  const hit = ray.intersectObjects( window.scene.children, true ).find( h => h.object.name.startsWith( 'world_' ) );
  if ( hit ) { const gpu = window.renderer.properties.get( hit.object.material ), uniforms = gpu.uniforms; found.push( { label, texture: hit.object.name.replace( /^world_/, '' ).replace( /_displaced$/, '' ).replace( /_lm\d+$/, '' ), continuousRelief: hit.object.material.userData.rockField === true, realDisplacement: hit.object.material.userData.realDisplacement === true, vertices: hit.object.geometry.getAttribute( 'position' ).count, normalMap: !! hit.object.material.normalMap, normalSize: [ hit.object.material.normalMap?.image?.width, hit.object.material.normalMap?.image?.height ], carvingReference: !! hit.object.material.normalMap?.userData.referenceHeight, sculptedRelief: hit.object.material.normalMap?.userData.surfaceRelief, programKey: hit.object.material.customProgramCacheKey(), gpuBinding: { carvedProgram: gpu.currentProgram?.cacheKey?.includes( '-carved' ), normalWidth: uniforms?.normalMap?.value?.image?.width, referenceWidth: uniforms?.uCarveReference?.value?.image?.width, classic: uniforms?.uClassic?.value }, height: hit.object.material.map?.userData.newerHeight?.file, savedScalar: hit.object.material.map?.userData.newerHeight?.dataFile, textureSize: [ hit.object.material.map?.image?.width, hit.object.material.map?.image?.height ], point: hit.point.toArray() } ); }
 }
 document.querySelector( '#materials-report' ).textContent = JSON.stringify( found, null, 2 );
};
function toggle() { Cvar_SetValue( 'r_rockfield', Cvar_VariableValue( 'r_rockfield' ) > 0 ? 0 : 1 ); }
document.querySelector( '#shadow-probe' ).onclick = () => {
 const renderer=window.renderer, previous=renderer.getRenderTarget();
 post.R_PostBind(renderer); const target=renderer.getRenderTarget(), counts=[0,0,0,0], rockSpot=[0,0,0,0,0,0,0,0];
 if(target.textures.length===4) {
  const bytes=new Uint8Array(target.width*target.height*4);
  renderer.readRenderTargetPixels(target,0,0,target.width,target.height,bytes,undefined,3);
  for(let i=0;i<bytes.length;i+=4) {
   const kind=bytes[i+3]>>>6;counts[kind]++;
   if(kind===2) rockSpot[Math.round(R_HeightShadowDecode(bytes.subarray(i,i+4),9)*7)]++;
  }
 }
 renderer.setRenderTarget(previous);
 document.querySelector('#report').textContent=JSON.stringify({attachments:target.textures.length,maskClasses:{invalidClear:counts[0],ordinaryHeight:counts[1],rockWall:counts[2],invalidOpaque:counts[3]},rockWallSpotVisibilityBins:rockSpot,defaults:Object.fromEntries(['gamma','r_flashlight','r_heightshadows','r_pointshadows'].map(name=>[name,Cvar_VariableValue(name)])),worldShadows:post.R_PointShadowStatus(),glError:renderer.getContext().getError(),errors},null,2);
};
document.querySelector( '#toggle' ).onclick = toggle; document.querySelector( '#restart' ).onclick = start;
document.querySelector( '#hide' ).onclick = () => { panel.style.display = 'none'; };
document.addEventListener( 'keydown', e => { if ( e.key === 'Escape' && panel.style.display === 'none' ) { panel.style.display = ''; e.preventDefault(); e.stopImmediatePropagation(); } }, true );
function gpuSummary() {
 const renderer = window.renderer, previous = renderer.getRenderTarget();
  post.R_PostBind( renderer ); const hdr = renderer.getRenderTarget(), albedo = new Uint8Array( hdr.width * hdr.height * 4 );
  renderer.readRenderTargetPixels( hdr, 0, 0, hdr.width, hdr.height, albedo, undefined, 2 ); renderer.setRenderTarget( previous );
  let valid = 0, alphaBelowOpaquePixels = 0, minAvailableAlpha = 255, carvingPixels = 0, deepCutPixels = 0;
  for ( let i = 3; i < albedo.length; i += 4 ) if ( albedo[ i ] > 13 ) { valid ++; if ( albedo[ i ] < 128 ) { carvingPixels ++; if ( albedo[ i ] < 60 ) deepCutPixels ++; } minAvailableAlpha = Math.min( minAvailableAlpha, albedo[ i ] ); if ( albedo[ i ] < 255 ) alphaBelowOpaquePixels ++; }
 return { width: hdr.width, height: hdr.height, valid, alphaBelowOpaquePixels, minAvailableAlpha, carvingPixels, deepCutPixels };
}
let measuring = false;
// Frame delivery measurement, not a claimed GPU timestamp. Dynamic resolution
// is held at the same setting/size for both samples, then the owner's settings
// are restored. No fixed-delay inference of shader readiness.
document.querySelector( '#measure' ).onclick = async () => {
 if ( measuring || rock.R_RockfieldStatus().pending || rock.R_RockfieldStatus().resident < 1 ) return;
 measuring = true; const controls = [ ...panel.querySelectorAll( 'button' ) ]; controls.forEach( b => { b.disabled = true; } );
 const fixedAngles = Array.from( cl.viewangles ); const player = sv.edicts[ 1 ], oldMovement = player.v.movetype; player.v.movetype = 0; player.v.velocity = [ 0, 0, 0 ];
 const old = { dyn: Cvar_VariableValue( 'r_dynres' ), rock: Cvar_VariableValue( 'r_rockfield' ) }, results = [];
 Cvar_SetValue( 'r_dynres', 0 );
 try {
  for ( const on of [ 0, 1 ] ) {
   Cvar_SetValue( 'r_rockfield', on ); document.querySelector( '#report' ).textContent = 'Measuring ' + ( on ? 'relief ON' : 'relief OFF' ) + '… Keep the camera still.';
   let last, frames = [];
   for ( let i = 0; i < 90; i ++ ) { cl.viewangles.set( fixedAngles ); Cvar_SetValue( 'r_rockfield', on ); const now = await new Promise( requestAnimationFrame ); if ( last && i > 30 ) frames.push( now - last ); last = now; }
   frames.sort( ( a, b ) => a - b );
   results.push( { relief: !! on, samples: frames.length, meanMs: frames.reduce( ( a, b ) => a + b, 0 ) / frames.length, medianMs: frames[ Math.floor( frames.length / 2 ) ], player: Array.from( player.v.origin ), canvas: [ window.renderer.domElement.width, window.renderer.domElement.height ], cache: rock.R_RockfieldStatus(), actualGpuAlbedo: gpuSummary() } );
  }
  const oldSun = rock.rockUniforms.qrRockSun.value.clone(); let grazingLightProbe;
  try {
   // Controlled data-path check, separate from the map's authored lighting.
   // Restore its real sun immediately after the readback.
   rock.rockUniforms.qrRockSun.value.set( -.08, -.08, 1 ).normalize();
   await new Promise( requestAnimationFrame ); await new Promise( requestAnimationFrame );
   grazingLightProbe = { direction: rock.rockUniforms.qrRockSun.value.toArray(), actualGpuAlbedo: gpuSummary() };
  } finally { rock.rockUniforms.qrRockSun.value.copy( oldSun ); }
  document.querySelector( '#report' ).textContent = JSON.stringify( { frameDeliveryMeasurement: results, grazingLightProbe, glError: window.renderer.getContext().getError(), errors }, null, 2 );
 } finally { player.v.movetype = oldMovement; Cvar_SetValue( 'r_dynres', old.dyn ); Cvar_SetValue( 'r_rockfield', old.rock ); controls.forEach( b => { b.disabled = false; } ); measuring = false; }
};
setInterval( () => {
 const state = rock.R_RockfieldStatus(); document.querySelector( '#toggle' ).textContent = 'Relief: ' + ( state.active ? 'on' : 'off' );
 document.querySelector( '#status' ).textContent = state.error || errors.length ? 'Rendering issue — see diagnostics.' : cls.signon !== 4 ? 'Loading the level…' : state.pending ? 'Loading the continuous surface…' : state.active ? 'Connected rock surfaces · saved relief settings · original textures and geometry.' : 'Original surface detail — procedural layer off.';
 document.querySelector( '#diagnostics' ).textContent = JSON.stringify( { ...state, bandWarp: rockBandWarpOn.value, demonRelief: R_DemonReliefStatus(), level: cl.worldmodel?.name, signon: cls.signon, setupCount, serverActive: sv.active, spawned: svs.clients[ 0 ]?.spawned, demo: cls.demoplayback, viewangles: Array.from( cl.viewangles ), player: Array.from( sv.edicts?.[ 1 ]?.v.origin || [] ), errors }, null, 2 );
}, 250 );
start();
