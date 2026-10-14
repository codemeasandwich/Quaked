// Full engine pages and the supported native BroadcastChannel transport. This
// fixture stages server coordinates and optional timer boundaries; it never
// invents client Ring state, poses, inventory, snapshots or rendering subjects.
// Trial defaults and controls must never replace the owner's saved settings.
const cvar = await import( '../src/engine/common/cvar.js' );
cvar.Cvar_SetStorageWritable( false );
await import( '../src/newer/install.js' );
const evidence = { kind: 'real-window-transport', settingsPersistence: 'disabled before engine startup', sequence: [], errors: [], shaderHashes: {}, actions: [], source: 'fieldlab-fx-3d-updated.html#03-operative', referenceSha256: '7e35fc808c24200e9dbf2b010a72d2fbea04aca567528ebd2e61e79979afc7d6' };
window.addEventListener( 'error', e => evidence.errors.push( e.message ) );
window.addEventListener( 'unhandledrejection', e => evidence.errors.push( String( e.reason?.stack || e.reason ) ) );
const controls = document.querySelector( '#controls' );
for ( const event of [ 'mousedown', 'mouseup', 'keydown', 'keyup', 'touchstart', 'touchend', 'pointerdown', 'pointerup' ] ) controls.addEventListener( event, e => e.stopPropagation() );
await import( '../main.js' );
while ( ! window.Cbuf_AddText ) await new Promise( r => setTimeout( r, 20 ) );
const { Cbuf_AddText } = await import( '../src/engine/common/cmd.js' );
const { MSG_WriteByte, MSG_WriteAngle } = await import( '../src/engine/common/common.js' );
const { svc_setangle } = await import( '../src/engine/common/protocol.js' );
const { newerDefaults } = await import( '../src/engine/client/menu_common.js' );
const keys = await import( '../src/engine/client/keys.js' );
const { sv, svs, MOVETYPE_NOCLIP, MOVETYPE_WALK, FL_GODMODE, FL_NOTARGET } = await import( '../src/engine/server/server.js' );
const { cl, cls, cl_entities } = await import( '../src/engine/client/client.js' );
const { CL_GetPredictedPlayer } = await import( '../src/engine/client/cl_pred.js' );
const { Window_NewSession, Window_HostSession } = await import( '../src/engine/net/net_window.js' );
const { LocalPlay_PlayerUrl, LocalPlay_PlayerWindow, LocalPlay_PlayerCommands } = await import( '../src/engine/client/local_play.js' );
const { SV_LinkEdict, SV_RunTriggerTouch } = await import( '../src/engine/server/world.js' );
const { Mod_PointInLeaf } = await import( '../src/engine/render/gl_model.js' );
const progs = await import( '../src/engine/progs/progs.js' );
const { ED_FindFunction, GetEdictFieldValue } = await import( '../src/engine/progs/pr_edict.js' );
const { PR_ExecuteProgram } = await import( '../src/engine/progs/pr_exec.js' );
const { OFS_PARM0 } = await import( '../src/engine/progs/pr_comp.js' );
const { R_DemoSplitRelease } = await import( '../src/newer/render/r_demosplit.js' );
const { R_IntroLoadingHolding } = await import( '../src/newer/ui/r_demoloading.js' );
const { R_BestiaryCancel } = await import( '../src/newer/ui/r_bestiary.js' );
const { R_PowerVisionStatus } = await import( '../src/newer/render/r_powervision.js' );
const { R_DynResScale } = await import( '../src/newer/render/gl_post.js' );
const { R_CloakStatus, CLOAK_FRAGMENT, CLOAK_VERTEX } = await import( '../src/newer/render/r_cloak.js' );
const role = LocalPlay_PlayerWindow( location.search );
let session = role?.session || null, staged = false, startupApplied = false, serial = 0;
const renderer = window.renderer;
async function sha256( source ) { const hash = await crypto.subtle.digest( 'SHA-256', new TextEncoder().encode( source ) ); return Array.from( new Uint8Array( hash ), n => n.toString( 16 ).padStart( 2, '0' ) ).join( '' ); }
evidence.shaderHashes.fragment = await sha256( CLOAK_FRAGMENT ); evidence.shaderHashes.vertex = await sha256( CLOAK_VERTEX );
const render = renderer.render;
renderer.render = function( scene, camera ) {
 if ( staged ) R_BestiaryCancel();
 const result = render.call( this, scene, camera );
 if ( scene.material?.fragmentShader === CLOAK_FRAGMENT ) evidence.cloakDraws = ( evidence.cloakDraws || 0 ) + 1;
 return result;
};
function action( name, details = {} ) { evidence.actions.push( { serial: ++serial, name, clientTime: cl.time, serverTime: sv.time, ...details } ); if ( evidence.actions.length > 150 ) evidence.actions.shift(); }
function command( text ) { keys.set_key_dest( keys.key_game ); Cbuf_AddText( text + '\n' ); }
function links() { if ( ! session ) return; for ( const n of [ 2, 3 ] ) { const link = document.querySelector( '#join' + n ); link.href = LocalPlay_PlayerUrl( n, session ); link.textContent = 'Player ' + n + ': ' + link.href; } }
function player() { const slot = Number( document.querySelector( '#slot' ).value ); const client = svs.clients?.[ slot - 1 ]; if ( ! sv.active || ! client?.active || ! client.spawned ) throw new Error( 'Selected player is not signed on to this host' ); return client.edict; }
function ring() { const item = sv.edicts?.find( e => e && ! e.free && progs.PR_GetString( e.v.classname ) === 'item_artifact_invisibility' ); if ( ! item ) throw new Error( 'This map has no native Ring pickup' ); return item; }
function quad() { const item = sv.edicts?.find( e => e && ! e.free && progs.PR_GetString( e.v.classname ) === 'item_artifact_super_damage' ); if ( ! item ) throw new Error( 'This map has no native Quad pickup' ); return item; }
function nativeCall( entity, name ) { const fn = progs.pr_functions.indexOf( ED_FindFunction( name ) ); if ( fn <= 0 ) throw new Error( 'Missing native function ' + name ); const self = progs.pr_global_struct.self, time = progs.pr_global_struct.time; try { progs.pr_global_struct.self = progs.EDICT_TO_PROG( entity ); progs.pr_global_struct.time = sv.time; PR_ExecuteProgram( fn ); } finally { progs.pr_global_struct.self = self; progs.pr_global_struct.time = time; } }
function timer( p, name = 'invisible_finished' ) { const f = GetEdictFieldValue( p, name ); return f ? f.accessor.getFloat( f.ofs ) : null; }
function stage( p, values, noclip = true ) {
 if ( values.length !== 5 || ! values.every( Number.isFinite ) ) throw new Error( 'Expected x y z pitch yaw' );
 if ( Mod_PointInLeaf( values.slice( 0, 3 ), sv.worldmodel ).contents === -2 ) throw new Error( 'Refused to stage inside solid world' );
 const [ x, y, z, pitch, yaw ] = values;
 const client = svs.clients.find( c => c.active && c.spawned && c.edict === p );
 if ( ! client?.message || client.message.cursize + 4 > client.message.maxsize ) throw new Error( 'Selected player reliable channel is unavailable or full' );
 // Explicit inspection-only protection and placement; neither grants power-ups.
 p.v.flags |= FL_GODMODE | FL_NOTARGET; p.v.movetype = noclip ? MOVETYPE_NOCLIP : MOVETYPE_WALK;
 p.v.origin = [ x, y, z ]; p.v.velocity = [ 0, 0, 0 ]; p.v.v_angle = [ pitch, yaw, 0 ]; p.v.angles = [ pitch, yaw, 0 ]; p.v.fixangle = 1;
 SV_LinkEdict( p, false ); staged = true;
 // Test staging must survive the window driver's allowed snapshot coalescing.
 // The existing native fixangle can be lost with its unreliable snapshot.
 // Deliver the same existing svc_setangle on this client's reliable channel;
 // production transport and Ring/body replication are not changed.
 MSG_WriteByte( client.message, svc_setangle );
 for ( const angle of [ pitch, yaw, 0 ] ) MSG_WriteAngle( client.message, angle );
 action( 'fixture-reliable-setangle', { slot: p.index, desiredAngles: [ pitch, yaw, 0 ], encoding: 'existing native one-byte angles; inspect observer viewangles after delivery' } );
 action( 'fixture-stage', { slot: p.index, origin: values.slice( 0, 3 ), pitch, yaw, noclip, protection: 'god/notarget flags; fixture only' } );
}
function bind( id, handler ) { document.querySelector( '#' + id ).onclick = async () => { try { await handler(); } catch ( error ) { evidence.errors.push( id + ': ' + error.message ); } publish(); }; }
function hostTrial( map ) {
 if ( cls.signon !== 4 ) throw new Error( 'Wait for initial native signon before hosting' );
 session = Window_NewSession(); links(); R_DemoSplitRelease( true );
 command( `disconnect\nwindowhost -\nmaxplayers 3\ncoop 1\ndeathmatch 0\nwindowhost ${session}\nr_hdr 1\n${newerDefaults()}r_cloak 1\nr_dynres 0\nr_demosplit 0\nbgmvolume 0\nname "Player 1"\nmap ${map}` );
 action( 'native-host', { session, slots: 3, map, transport: 'BroadcastChannel/window driver' } );
}
bind( 'host', () => hostTrial( 'e1m3' ) );
bind( 'host-powers', () => hostTrial( 'e3m2' ) );
bind( 'newer', () => { R_DemoSplitRelease( true ); command( 'r_hdr 1\n' + newerDefaults() + 'r_cloak 1\nr_dynres 0\nr_demosplit 0\nbgmvolume 0' ); action( 'newer' ); } );
bind( 'dynres', () => { const value = cvar.Cvar_VariableValue( 'r_dynres' ) ? 0 : 1; cvar.Cvar_SetValue( 'r_dynres', value ); action( 'native-dynamic-resolution', { value } ); } );
bind( 'classic', () => { command( 'r_hdr 0\nr_demosplit 0' ); action( 'classic' ); } );
bind( 'disconnect', () => { command( 'disconnect' ); action( 'disconnect' ); } );
bind( 'reconnect', () => { if ( ! role ) throw new Error( 'Use host button to restart a host; reconnect is for joining clients' ); command( LocalPlay_PlayerCommands( role ) ); action( 'reconnect', role ); } );
bind( 'ring', () => { const p = player(), item = ring(); if ( ! item.v.solid || ! item.v.modelindex ) throw new Error( 'Ring was already picked up; wait for native regeneration or explicitly regenerate fixture' ); stage( p, [ ...item.v.origin, 0, 0 ] ); const before = p.v.items; SV_RunTriggerTouch( p, item ); action( 'actual-native-ring-touch', { slot: p.index, ring: item.index, beforeItems: before, afterItems: p.v.items, expires: timer( p ) } ); } );
bind( 'regen', () => { const item = ring(); nativeCall( item, 'SUB_regen' ); action( 'fixture-native-ring-regeneration', { ring: item.index } ); } );
bind( 'quad', () => { const p = player(), item = quad(); if ( ! item.v.solid || ! item.v.modelindex ) throw new Error( 'Quad was already picked up; wait for native regeneration or explicitly regenerate fixture' ); stage( p, [ ...item.v.origin, 0, 0 ] ); const before = p.v.items; SV_RunTriggerTouch( p, item ); action( 'actual-native-quad-touch', { slot: p.index, quad: item.index, beforeItems: before, afterItems: p.v.items, expires: timer( p, 'super_damage_finished' ) } ); } );
bind( 'quad-regen', () => { const item = quad(); nativeCall( item, 'SUB_regen' ); action( 'fixture-native-quad-regeneration', { quad: item.index } ); } );
bind( 'expire', () => { const p = player(), f = GetEdictFieldValue( p, 'invisible_finished' ); if ( ! f || timer( p ) <= sv.time ) throw new Error( 'Selected player has no active native Ring timer' ); const before = timer( p ); f.accessor.setFloat( f.ofs, sv.time + .15 ); action( 'fixture-shortened-timer-native-expiry', { slot: p.index, before, after: timer( p ) } ); } );
bind( 'damage', () => {
 const p = player(), world = sv.edicts[ 0 ];
 // Fixture removes its own staging immunity/armour so real T_Damage produces
 // a non-gib corpse. Native death, Ring clearing and respawn own the result.
 p.v.flags &= ~FL_GODMODE; p.v.armorvalue = 0; p.v.armortype = 0;
 const field = GetEdictFieldValue( p, 'invincible_finished' ); if ( field ) field.accessor.setFloat( field.ofs, 0 );
 progs.pr_globals_int[ OFS_PARM0 ] = progs.EDICT_TO_PROG( p ); progs.pr_globals_int[ OFS_PARM0 + 3 ] = progs.EDICT_TO_PROG( world ); progs.pr_globals_int[ OFS_PARM0 + 6 ] = progs.EDICT_TO_PROG( world ); progs.pr_globals_float[ OFS_PARM0 + 9 ] = Math.max( 1, p.v.health + 1 );
 nativeCall( p, 'T_Damage' ); action( 'native-lethal-T_Damage', { slot: p.index, health: p.v.health, deadflag: p.v.deadflag, items: p.v.items } );
} );
bind( 'aim', () => {
 if ( cls.signon !== 4 ) throw new Error( 'Wait for client signon before aiming' );
 const values = document.querySelector( '#position' ).value.trim().split( /[ ,]+/ ).map( Number );
 if ( values.length !== 5 || ! values.every( Number.isFinite ) ) throw new Error( 'Expected x y z pitch yaw; aim uses pitch/yaw only' );
 const before = Array.from( cl.viewangles ); cl.viewangles.set( [ values[ 3 ], values[ 4 ], 0 ] ); keys.set_key_dest( keys.key_game ); staged = true;
 action( 'fixture-local-camera-aim', { before, desiredAngles: [ values[ 3 ], values[ 4 ], 0 ], actualClientAngles: Array.from( cl.viewangles ) } );
} );
bind( 'stage', () => stage( player(), document.querySelector( '#position' ).value.trim().split( /[ ,]+/ ).map( Number ) ) );
bind( 'pair', () => { const p = player(), item = ring(); stage( p, sv.name === 'e3m2' ? [ item.v.origin[ 0 ], item.v.origin[ 1 ] + 100, item.v.origin[ 2 ], 4.57, -90 ] : [ item.v.origin[ 0 ] + 100, item.v.origin[ 1 ], item.v.origin[ 2 ] + 16, 8, 180 ] ); } );
for ( const [ id, values ] of Object.entries( { 'start-wearer': [ -736, -1696, 88, 0, 90 ], 'start-observer': [ -736, -1592, 88, 0, 270 ], 'torch-wearer': [ 1300, -352, -80, 0, 180 ], 'torch-observer': [ 1120, -352, -80, 0, 0 ] } ) ) bind( id, () => { document.querySelector( '#position' ).value = values.join( ' ' ); stage( player(), values ); } );
bind( 'walkmode', () => { const p = player(); p.v.movetype = MOVETYPE_WALK; action( 'native-walking-restored', { slot: p.index } ); } );
function pulse( name, duration = 700 ) { command( '+' + name ); action( 'native-input', { name, duration } ); setTimeout( () => command( '-' + name ), duration ); let n = 0; const record = setInterval( () => { evidence.sequence.push( state() ); if ( evidence.sequence.length > 120 ) evidence.sequence.shift(); if ( ++n === 20 ) clearInterval( record ); }, 100 ); }
for ( const [ id, name ] of [ [ 'walk', 'forward' ], [ 'turn', 'right' ], [ 'attack', 'attack' ], [ 'jump', 'jump' ], [ 'respawn', 'attack' ] ] ) bind( id, () => pulse( name, id === 'jump' ? 150 : 700 ) );
bind( 'kill', () => { command( 'kill' ); action( 'native-client-suicide' ); } );
for ( const [ id, map ] of [ [ 'nextmap', 'e1m1' ], [ 'backmap', 'e1m3' ], [ 'powers-map', 'e3m2' ] ] ) bind( id, () => { if ( ! sv.active ) throw new Error( 'Only the host changes level' ); command( 'changelevel ' + map ); action( 'native-changelevel', { map } ); } );
bind( 'pause', () => { command( 'pause' ); action( 'native-pause-request' ); } );
// A bounded recording of actual WebGL output; no replay or substituted state.
// captureStream does not include the DOM report or the separate HUD canvas.
let capture = null, captureURL = null, closing = false;
bind( 'record', async () => {
 if ( capture ) throw new Error( 'A five-second recording is already running' );
 const canvas = renderer.domElement;
 if ( typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined' ) {
  evidence.capture = { supported: false, reason: 'Canvas captureStream or MediaRecorder unavailable' }; document.querySelector( '#capture-status' ).textContent = evidence.capture.reason; return;
 }
 const mimeType = [ 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4' ].find( mime => MediaRecorder.isTypeSupported( mime ) );
 const stream = canvas.captureStream( 8 );
 let recorder;
 try { recorder = new MediaRecorder( stream, { ...( mimeType ? { mimeType } : {} ), videoBitsPerSecond: 4000000 } ); }
 catch ( error ) { stream.getTracks().forEach( track => track.stop() ); throw error; }
 capture = { recorder, stream }; const started = performance.now(), chunks = [], samples = [], before = state();
 const drawsBefore = evidence.cloakDraws || 0;
 document.querySelector( '#record' ).disabled = true;
 document.querySelector( '#capture-status' ).textContent = 'Recording actual game canvas for five seconds…';
 evidence.capture = { supported: true, recording: true, requestedSeconds: 5, requestedFramesPerSecond: 8, width: canvas.width, height: canvas.height, before };
 action( 'canvas-recording-start', { requestedSeconds: 5, requestedFramesPerSecond: 8 } );
 await new Promise( ( resolve, reject ) => {
  let failed = false;
  const sample = setInterval( () => { if ( samples.length < 24 ) samples.push( state() ); }, 250 );
  const stop = setTimeout( () => { if ( recorder.state !== 'inactive' ) recorder.stop(); }, 5000 );
  const cleanup = () => { clearTimeout( stop ); clearInterval( sample ); stream.getTracks().forEach( track => track.stop() ); capture = null; document.querySelector( '#record' ).disabled = false; };
  recorder.ondataavailable = event => { if ( event.data.size ) chunks.push( event.data ); };
  recorder.onerror = event => { failed = true; cleanup(); evidence.capture.recording = false; evidence.capture.error = event.error?.message || 'MediaRecorder failed'; document.querySelector( '#capture-status' ).textContent = evidence.capture.error; reject( event.error || new Error( evidence.capture.error ) ); };
  recorder.onstop = () => {
   cleanup(); if ( failed ) return; if ( closing ) { resolve(); return; } const blob = new Blob( chunks, { type: recorder.mimeType || mimeType || 'video/webm' } );
   if ( captureURL ) URL.revokeObjectURL( captureURL ); captureURL = URL.createObjectURL( blob );
   const video = document.querySelector( '#capture-video' ), link = document.querySelector( '#capture-download' );
   video.src = captureURL; link.href = captureURL; link.download = 'operative-cloak-observer-' + new Date().toISOString().replace( /[:.]/g, '-' ) + ( blob.type.includes( 'mp4' ) ? '.mp4' : '.webm' );
   document.querySelector( '#capture-output' ).hidden = false;
   evidence.capture = { ...evidence.capture, recording: false, actualWallSeconds: ( performance.now() - started ) / 1000, mimeType: blob.type, bytes: blob.size, cloakDraws: ( evidence.cloakDraws || 0 ) - drawsBefore, after: state(), samples, filename: link.download, canvasOnly: true };
   document.querySelector( '#capture-status' ).textContent = `Recorded ${blob.size} bytes of actual observer canvas; ${evidence.capture.cloakDraws} cloak draws. Playback and download below.`;
   action( 'canvas-recording-complete', { bytes: blob.size, mimeType: blob.type } ); resolve();
  };
  try { recorder.start( 250 ); } catch ( error ) { failed = true; cleanup(); evidence.capture.recording = false; evidence.capture.error = error.message; reject( error ); }
 } );
} );
window.addEventListener( 'pagehide', () => { closing = true; if ( capture?.recorder.state !== 'inactive' ) capture?.recorder.stop(); capture?.stream.getTracks().forEach( track => track.stop() ); if ( captureURL ) URL.revokeObjectURL( captureURL ); } );
bind( 'snapshot', () => { evidence.sequence.push( state() ); if ( evidence.sequence.length > 120 ) evidence.sequence.shift(); action( 'snapshot' ); } );
bind( 'hide', () => { controls.style.display = 'none'; document.querySelector( '#show' ).style.display = 'block'; } );
bind( 'show', () => { controls.style.display = ''; document.querySelector( '#show' ).style.display = 'none'; } );
function state() {
 return { serial: serial, wallTime: new Date().toISOString(), map: cl.worldmodel?.name, signon: cls.signon, ready: cls.signon === 4 && ! R_IntroLoadingHolding(), viewentity: cl.viewentity, ownItems: cl.items, clientTime: cl.time, serverTime: sv.active ? sv.time : null, paused: sv.active ? sv.paused : cl.paused, protocol: cl.protocol, session: Window_HostSession() || session,
  eye: window.camera?.position.toArray() || null, cameraWorld: window.camera ? { eye: Array.from( window.camera.matrixWorld.elements ).slice( 12, 15 ), forward: [ -window.camera.matrixWorld.elements[ 8 ], -window.camera.matrixWorld.elements[ 9 ], -window.camera.matrixWorld.elements[ 10 ] ] } : null, viewangles: Array.from( cl.viewangles ), mode: cvar.Cvar_VariableValue( 'r_hdr' ), cloak: R_CloakStatus(), wearerVision: R_PowerVisionStatus(), glError: renderer.getContext().getError(),
  players: Array.from( { length: cl.maxclients || 0 }, ( _, slot ) => { const p = CL_GetPredictedPlayer( slot ), e = cl_entities[ slot + 1 ]; return { slot: slot + 1, decoded: p && { model: cl.model_precache[ p.modelindex ]?.name, frame: p.frame, cloakBodyFrame: p.cloakBodyFrame, origin: Array.from( p.origin ), flags: p.flags }, entity: e && { model: e.model?.name, frame: e.frame, cloakBodyFrame: e.cloakBodyFrame, origin: Array.from( e.origin ), angles: Array.from( e.angles ), visible: e._aliasMesh?.visible } }; } ),
  serverPlayers: sv.active ? svs.clients.filter( p => p.active ).map( p => ( { name: p.name, slot: p.edict?.index, spawned: p.spawned, negotiated: p.cloakBodyCapability, items: p.edict?.v.items, model: sv.model_precache[ p.edict?.v.modelindex ], frame: p.edict?.v.frame, health: p.edict?.v.health, ringExpires: timer( p.edict ), quadExpires: timer( p.edict, 'super_damage_finished' ), origin: Array.from( p.edict.v.origin ) } ) ) : [],
  settings: { gamma: cvar.Cvar_VariableValue( 'gamma' ), brightness: cvar.Cvar_VariableValue( 'r_newbright' ), cloak: cvar.Cvar_VariableValue( 'r_cloak' ), dynamicResolution: cvar.Cvar_VariableValue( 'r_dynres' ), renderScale: R_DynResScale(), drawingBuffer: [ renderer.domElement.width, renderer.domElement.height ], viewport: [ innerWidth, innerHeight, devicePixelRatio ], fov: window.camera?.fov, transport: 'native BroadcastChannel window/loopback' } };
}
function publish() {
 if ( ! startupApplied && cls.signon === 4 ) { startupApplied = true; command( 'r_hdr 1\n' + newerDefaults() + 'r_cloak 1\nr_dynres 0\nr_demosplit 0\nbgmvolume 0' ); }
 const current = state(); evidence.current = current;
 document.querySelector( '#status' ).textContent = `${current.map || 'startup'}; signon ${current.signon}; player ${cl.viewentity}; ${current.ready ? 'ready' : 'preparing'}; ${current.serverPlayers.length} server clients; ${current.cloak.proxies} cloak proxies; ${evidence.errors.length} errors`;
 document.querySelector( '#report' ).textContent = JSON.stringify( evidence, null, 2 );
}
links(); setInterval( publish, 500 ); publish();
