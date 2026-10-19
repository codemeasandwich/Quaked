// Independent real-browser trial. Endpoint wrappers only observe and forward;
// all media, gains, analyzers, time and PCM belong to the one real engine context.
await import( '../src/engine/render/gl_rsurf.js' );
await import( '../src/newer/install.js' );
const { cl, cls, cl_entities, ca_connected, SIGNONS } = await import( '../src/engine/client/client.js' );
const { CL_ClearState } = await import( '../src/engine/client/cl_main.js' );
const { sv } = await import( '../src/engine/server/server.js' );
const vars = await import( '../src/engine/common/cvar.js' );
const keys = await import( '../src/engine/client/keys.js' );
const sound = await import( '../src/engine/sound/sound.js' );
const dma = await import( '../src/engine/sound/snd_dma.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const { R_AnimSetClassicPass } = await import( '../src/newer/mode.js' );
const { STAT_HEALTH } = await import( '../src/engine/common/quakedef.js' );
const { CL_WaterReset } = await import( '../src/newer/gameplay/cl_water.js' );
const water = await import( '../src/newer/sound/s_playerwater.js' );
vars.Cvar_SetStorageWritable( false );
const button = document.querySelector( '#run' ), output = document.querySelector( '#result' );
const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );
const checks = [];
const check = ( name, passed, detail ) => { checks.push( { name, passed: !! passed, detail } ); if ( ! passed ) throw Error( name + ': ' + JSON.stringify( detail ) ); };
async function until( predicate, timeout = 15000 ) { const start = performance.now(); while ( ! predicate() ) { if ( performance.now() - start > timeout ) throw Error( 'Timed out waiting for native media readiness' ); await sleep( 10 ); } }
function analyzer( context, input ) { const node = context.createAnalyser(); node.fftSize = 256; input.connect( node ); return node; }
function rms( node ) { const values = new Float32Array( node.fftSize ); node.getFloatTimeDomainData( values ); let sum = 0, peak = 0; for ( const v of values ) { sum += v * v; peak = Math.max( peak, Math.abs( v ) ); } return { rms: Math.sqrt( sum / values.length ), peak }; }
async function samples( master, underwater, duration, epoch = performance.now() ) { const result = []; do { result.push( { ms: performance.now() - epoch, master: rms( master ), underwater: rms( underwater ) } ); await sleep( 2 ); } while ( performance.now() - epoch < duration ); return result; }
const maxRMS = ( rows, key ) => Math.max( ...rows.map( row => row[ key ].rms ) );
const firstPCM = ( rows, key ) => rows.find( row => row[ key ].rms > 1e-6 )?.ms ?? null;
async function hashes() {
 const urls = { ...water.WATER_TRACK_URLS, waterSource: new URL( '../src/newer/sound/s_playerwater.js', import.meta.url ).href, deckSource: new URL( '../src/newer/sound/s_effectdeck.js', import.meta.url ).href, soundSource: new URL( '../src/engine/sound/snd_dma.js', import.meta.url ).href, observationSource: new URL( '../src/newer/gameplay/cl_water.js', import.meta.url ).href, trialHTML: new URL( './water_audio_browser_trial.html', import.meta.url ).href, trial: import.meta.url };
 return Object.fromEntries( await Promise.all( Object.entries( urls ).map( async ( [ key, url ] ) => { const response = await fetch( url ); if ( ! response.ok ) throw Error( url + ' ' + response.status ); const bytes = await response.arrayBuffer(), digest = await crypto.subtle.digest( 'SHA-256', bytes ); return [ key, { url, bytes: bytes.byteLength, sha256: Array.from( new Uint8Array( digest ), value => value.toString( 16 ).padStart( 2, '0' ) ).join( '' ) } ]; } ) ) );
}
button.disabled = false; button.textContent = 'Run trusted real-audio trial'; output.textContent = 'Ready. Click to initialize and resume the real engine AudioContext.'; window.waterAudioReady = true;
button.addEventListener( 'click', async event => {
 button.disabled = true; checks.length = 0;
 const media = [], realAudio = window.Audio; let context, masterProbe, underwaterProbe;
 const report = { started: new Date().toISOString(), trustedClick: event.isTrusted, scope: 'Isolated Chrome source-module fixture, synthetic BSP water plane, actual MP3 media/AudioContext and PCM. Master and underwater-specific passive analyzer branches have no audible output. No played map, app rebuild, speaker latency or owner listening acceptance.' };
 try {
  // The returned value really is a native HTMLAudioElement; no readiness,
  // playback, seeking, clocks or nodes are simulated.
  window.Audio = function ( ...args ) { const element = new realAudio( ...args ), record = { element, plays: 0, pauses: 0, seeking: 0, source: null, gain: null }; media.push( record ); const play = element.play.bind( element ), pause = element.pause.bind( element ); element.play = ( ...values ) => { record.plays++; return play( ...values ); }; element.pause = ( ...values ) => { record.pauses++; return pause( ...values ); }; element.addEventListener( 'seeking', () => record.seeking++ ); return element; };
  window.Audio.prototype = realAudio.prototype;
  if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( r_hdr );
  vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'nosound', 0 ); sound.volume.value = 1; sound.bgmvolume.value = 0; R_AnimSetClassicPass( false );
  sv.active = false; sv.paused = false; CL_ClearState(); CL_WaterReset();
  // Remains inside the browser's trusted click handler before its first await.
  dma.S_Init(); context = dma.S_GetAudioContext(); const resumed = context.resume();
  const realCreate = context.createMediaElementSource.bind( context );
  context.createMediaElementSource = element => { const source = realCreate( element ), record = media.find( item => item.element === element ), connect = source.connect.bind( source ); record.source = source; source.connect = ( target, ...args ) => { record.gain = target; return connect( target, ...args ); }; return source; };
  await resumed;
  vars.Cvar_SetValue( 'volume', 1 ); dma.S_GetMasterGain().gain.value = sound.volume.value;
  report.context = { state: context.state, sampleRate: context.sampleRate, baseLatency: context.baseLatency, outputLatency: context.outputLatency, constructor: context.constructor.name, masterGain: dma.S_GetMasterGain().gain.value };
  cls.demoplayback = true; cls.demofile = {}; cls.state = ca_connected; cls.signon = SIGNONS; cl.viewentity = 1; cl.viewheight = 22; cl.onground = true; cl.time = 10;
  cl.worldmodel = { nodes: [ { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, children: [ { contents: -1 }, { contents: -3 } ] } ] };
  cl.stats[ STAT_HEALTH ] = 100; cl.paused = false; cl.intermission = 0; cl.items = 0; keys.set_key_dest( keys.key_game ); cl.velocity.fill( 0 );
  const origin = cl_entities[ 1 ].origin; origin.set( [ 0, 0, 40 ] ); water.S_UpdatePlayerWater();
  const bed = media.find( item => item.element.src === water.WATER_TRACK_URLS.underwater );
  masterProbe = analyzer( context, dma.S_GetMasterGain() ); underwaterProbe = analyzer( context, bed.gain );
  await until( () => media.length === 4 && media.every( item => item.element.readyState >= 3 ) && ! bed.element.paused && bed.element.currentTime >= .35 );
  await sleep( 100 );
  const snapshot = () => ( { time: bed.element.currentTime, plays: bed.plays, seeking: bed.seeking, paused: bed.element.paused, count: media.length, contextTime: context.currentTime, status: water.S_GetPlayerWaterStatus() } );
  report.prepared = media.map( item => ( { url: item.element.src, nativeElement: item.element instanceof HTMLAudioElement, readyState: item.element.readyState, duration: item.element.duration, networkState: item.element.networkState, currentTime: item.element.currentTime, paused: item.element.paused, plays: item.plays } ) );
  report.drySamples = await samples( masterProbe, underwaterProbe, 100 ); report.dry = snapshot();
  check( 'all four real streams ready; only silent underwater bed playing', media.length === 4 && media.every( item => item.element instanceof HTMLAudioElement && item.element.readyState >= 3 && ( item === bed ? ! item.element.paused : item.element.paused && item.plays === 0 ) ), report.prepared );
  check( 'dry actual master and underwater PCM exactly zero', maxRMS( report.drySamples, 'master' ) === 0 && maxRMS( report.drySamples, 'underwater' ) === 0, report.drySamples );
  const before = snapshot(); origin[ 2 ] = -40; const diveStart = performance.now(); water.S_UpdatePlayerWater(); const immediate = snapshot();
  report.dive = { before, immediate, synchronousMs: performance.now() - diveStart };
  check( 'dive opens real underwater gain synchronously', immediate.status.tracks.underwater.gain === 1 && bed.gain.gain.value === 1 && immediate.status.submerged && ! immediate.paused, report.dive );
  check( 'dive reuses running full recording without new media/play/seek', immediate.count === before.count && immediate.plays === before.plays && immediate.seeking === before.seeking && immediate.time >= before.time && immediate.time - before.time < .05, report.dive );
  report.diveSamples = await samples( masterProbe, underwaterProbe, 180, diveStart );
  report.onset = { underwaterMs: firstPCM( report.diveSamples, 'underwater' ), masterMs: firstPCM( report.diveSamples, 'master' ), thresholdRMS: 1e-6, analyserFrames: underwaterProbe.fftSize };
  check( 'actual underwater PCM arrives within 50ms', report.onset.underwaterMs !== null && report.onset.underwaterMs < 50, report.onset );
  check( 'actual master PCM confirms audible-bus output', maxRMS( report.diveSamples, 'master' ) > 1e-6, report.onset );
  origin[ 2 ] = 40; const surfaceStart = performance.now(); water.S_UpdatePlayerWater(); report.surface = { immediate: snapshot(), underwaterGain: bed.gain.gain.value };
  check( 'surface closes underwater gain synchronously without stopping warm loop', bed.gain.gain.value === 0 && ! bed.element.paused && bed.plays === before.plays && bed.seeking === before.seeking, report.surface );
  report.surfaceSamples = await samples( masterProbe, underwaterProbe, 180, surfaceStart );
  report.surface.silenceByMs = report.surfaceSamples.find( ( row, index, rows ) => rows.slice( index ).every( sample => sample.master.rms === 0 && sample.underwater.rms === 0 ) )?.ms ?? null;
  const lateSurface = report.surfaceSamples.filter( row => row.ms >= 50 );
  check( 'surface actual PCM is silent after render/analyzer window', maxRMS( lateSurface, 'master' ) === 0 && maxRMS( lateSurface, 'underwater' ) === 0, { master: maxRMS( lateSurface, 'master' ), underwater: maxRMS( lateSurface, 'underwater' ) } );
  report.surface.after = snapshot();
  check( 'surface warm recording keeps advancing without replay or seek', report.surface.after.time > report.surface.immediate.time + .1 && bed.plays === before.plays && bed.seeking === before.seeking, report.surface );
  cl.paused = true; water.S_UpdatePlayerWater(); report.pause = snapshot();
  check( 'pause immediately stops all actual media', media.every( item => item.element.paused ) && report.pause.status.reason === 'paused', report.pause );
  report.pauseSamples = await samples( masterProbe, underwaterProbe, 100 );
  check( 'pause remains actually silent', maxRMS( report.pauseSamples.filter( row => row.ms >= 50 ), 'master' ) === 0, report.pause );
  report.sourceHashes = await hashes(); report.status = 'PASS';
 } catch ( error ) { report.status = 'FAIL'; report.error = error.stack; }
 finally {
  report.checks = checks; window.waterAudioResult = report;
  output.className = report.status.toLowerCase(); output.textContent = `${report.status}: ${checks.filter( item => item.passed ).length}/${checks.length} checks\nActual underwater onset: ${report.onset?.underwaterMs?.toFixed( 2 )} ms; master: ${report.onset?.masterMs?.toFixed( 2 )} ms\nDry PCM zero; dive gain 1 immediately; no new bed play/seek/media; surface gain 0 immediately; pause stops.\nScope: real native browser PCM in a controlled source fixture. No app/full-game/speaker acceptance.\n\n` + JSON.stringify( report, null, 2 ); button.textContent = report.status + ' — ' + checks.filter( item => item.passed ).length + '/' + checks.length + ' checks';
  masterProbe?.disconnect(); underwaterProbe?.disconnect(); water.S_PlayerWaterShutdown(); dma.S_Shutdown(); window.Audio = realAudio;
 }
} );
