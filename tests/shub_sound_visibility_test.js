// Independent scene/camera/BSP visibility transport proof. This uses real public
// renderer bounds and collision helpers with native-edict metadata fixtures;
// it does not claim an owned end.bsp campaign or native Shub AI execution.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cl, cls, cl_entities, ca_connected } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { sv, svs } from '../src/engine/server/server.js';
import { edict_t, PR_SetStringsData } from '../src/engine/progs/progs.js';
import { ED_NewString } from '../src/engine/progs/pr_edict.js';
import * as vars from '../src/engine/common/cvar.js';
import * as keys from '../src/engine/client/keys.js';
import * as sound from '../src/engine/sound/sound.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { R_BestiarySnapshot } from '../src/newer/ui/r_bestiary.js';
import { R_VisibleAliasBounds } from '../src/newer/render/r_aliasvisibility.js';
import { S_ObserveEnvironmentSounds, S_UpdateEnvironmentSounds, S_EnvironmentSoundsReset, S_EnvironmentSoundsShutdown, S_GetEnvironmentSoundsStatus, ENVIRONMENT_TRACK_URLS } from '../src/newer/sound/s_environmentsounds.js';

class Media {
 constructor() { this.paused = true; this.currentTime = 0; this.duration = 20; this.readyState = 4; this.plays = 0; }
 play() { this.plays++; this.paused = false; return this.pending || Promise.resolve(); }
 pause() { this.paused = true; }
 removeAttribute() { this.src = ''; }
 load() { this.loaded = true; }
 addEventListener() {} removeEventListener() {}
}
class Context {
 constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = {}; }
 createGain() { return { gain: { value: 0 }, connect( target ) { this.target = target; }, disconnect() {} }; }
 createMediaElementSource( media ) { return { connect( target ) { media.bus = target; }, disconnect() {} }; }
 close() { this.state = 'closed'; return Promise.resolve(); }
}
const emptyHull = () => ( { firstclipnode: -1 } );
const wallHull = ( dist = -50 ) => ( { firstclipnode: 0, lastclipnode: 0, clipnodes: [ { planenum: 0, children: [ -1, -2 ] } ], planes: [ { type: 2, normal: [ 0, 0, 1 ], dist } ] } );
async function game( run ) {
 const saved = new Map( [ 'window', 'document', 'Audio', 'localStorage' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) ), media = [];
 let geometry, material;
 try {
  Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context, location: { search: '', pathname: '/' } } } );
  Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } } );
  Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends Media { constructor() { super(); media.push( this ); } } } );
  Object.defineProperty( globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'quaked.bestiary.v1' ? JSON.stringify( { version: 1, unlocked: [ 'shub' ] } ) : null, setItem() {} } } );
  if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( r_hdr ); vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );
  sv.active = false; CL_ClearState(); S_EnvironmentSoundsReset(); dma.S_Init(); vars.Cvar_SetValue( 'nosound', 0 ); sound.volume.value = 1;
  cls.demoplayback = false; cls.state = ca_connected; cls.signon = 4; cl.worldmodel = { name: 'maps/shub-transport-fixture.bsp', hulls: [ emptyHull() ] }; cl.stats[ 0 ] = 100; cl.time = 10; cl.paused = false; cl.intermission = 0; cl.viewentity = 1; cl.maxclients = 1;
  keys.set_key_dest( keys.key_game ); sv.active = true; sv.paused = false; sv.worldmodel = cl.worldmodel; svs.maxclients = 1;
  PR_SetStringsData( new Uint8Array( [ 0 ] ) );
  const player = new edict_t( 1, 128 ), boss = new edict_t( 2, 128 ); player.v.health = 100; player.v.classname = ED_NewString( 'player' ); boss.v.health = 40000; boss.v.deadflag = 0; boss.v.classname = ED_NewString( 'monster_oldone' ); boss.v.model = ED_NewString( 'progs/oldone.mdl' ); boss.v.origin = [ 0, 0, -100 ];
  sv.edicts = [ null, player, boss ]; sv.num_edicts = 3; const peer = { disconnected: false }; cls.netcon = { driver: 0, disconnected: false, driverdata: peer }; svs.clients = [ { active: true, edict: player, netconnection: peer } ];
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 70, 1, 1, 1000 ); camera.position.set( 0, 0, 0 ); camera.lookAt( 0, 0, -100 ); camera.updateProjectionMatrix(); camera.updateMatrixWorld( true );
  geometry = new THREE.BoxGeometry( 16, 16, 16 ); material = new THREE.MeshBasicMaterial(); const mesh = new THREE.Mesh( geometry, material ); mesh.position.set( 0, 0, -100 ); scene.add( mesh ); scene.updateMatrixWorld( true );
  const entity = { model: { name: 'progs/oldone.mdl' }, origin: new Float32Array( [ 0, 0, -100 ] ), angles: new Float32Array( [ 0, 0, 0 ] ), _aliasMesh: mesh, _entityIndex: 2 }; cl_entities[ 2 ] = entity;
  const observe = () => S_ObserveEnvironmentSounds( scene, camera, [ entity ] );
  const step = async () => { dma.S_GetAudioContext().currentTime += .1; S_UpdateEnvironmentSounds(); await Promise.resolve(); await Promise.resolve(); return S_GetEnvironmentSoundsStatus(); };
  await step(); await run( { scene, camera, mesh, entity, boss, player, observe, step, media, deck: () => media.find( m => m.src === ENVIRONMENT_TRACK_URLS.shub ) } );
 } finally {
  S_EnvironmentSoundsShutdown(); dma.S_Shutdown(); sv.active = false; cls.netcon = null; geometry?.dispose(); material?.dispose();
  for ( const [ key, descriptor ] of saved ) { if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ]; }
 }
}
Deno.test( 'already-known Shub is heard once only after an actual visible scene observation', () => game( async ( { scene, camera, mesh, entity, boss, observe, step, media, deck } ) => {
 assert.ok( R_BestiarySnapshot().unlocked.includes( 'shub' ), 'persistent Bestiary already knows Shub' );
 assert.equal( media.length, 0, 'model/native metadata preload is silent' );
 mesh.visible = false; assert.equal( observe(), false ); mesh.visible = true;
 mesh.position.set( 1000, 0, -100 ); assert.equal( observe(), false, 'outside current camera is not seen' ); mesh.position.set( 0, 0, -100 );
 boss.v.health = 0; assert.equal( observe(), false ); boss.v.health = 40000;
 entity.model.name = 'progs/player.mdl'; assert.equal( observe(), false, 'native boss metadata cannot make a different drawn model Shub' ); entity.model.name = 'progs/oldone.mdl';
 assert.ok( R_VisibleAliasBounds( scene, camera, entity ), 'actual mesh and BSP line are visible' );
 assert.equal( observe(), true ); const state = await step(); assert.equal( state.shubSeen, true ); assert.equal( deck().plays, 1 ); assert.equal( deck().loop, false ); assert.equal( deck().bus.target, dma.S_GetMasterGain() );
 for ( let i = 0; i < 5; i++ ) { assert.equal( observe(), false ); await step(); }
 assert.equal( deck().plays, 1, 'turning or repeated render observations cannot replay the cue' );
} ) );
Deno.test( 'world walls and transformed brush doors block the shared drawn-alias sightline', () => game( async ( { scene, camera, entity, observe, step, deck } ) => {
 cl.worldmodel.hulls = [ wallHull() ]; assert.equal( R_VisibleAliasBounds( scene, camera, entity ), null ); assert.equal( observe(), false ); await step(); assert.ok( ! deck() );
 cl.worldmodel.hulls = [ emptyHull() ];
 const door = { model: { name: '*door', hulls: [ wallHull( 0 ) ] }, origin: [ 0, 0, -50 ], angles: [ 0, 0, 0 ] }; cl_entities[ 3 ] = door;
 assert.equal( R_VisibleAliasBounds( scene, camera, entity ), null, 'current transformed brush door occludes the boss' ); assert.equal( observe(), false );
 cl_entities[ 3 ] = null; assert.ok( R_VisibleAliasBounds( scene, camera, entity ) ); assert.equal( observe(), true ); await step(); assert.equal( deck().plays, 1 );
} ) );
Deno.test( 'Shub rejects demo, remote peer, hidden page and dead native identity before consuming first sighting', () => game( async ( { boss, player, observe, step, deck } ) => {
 cls.demoplayback = true; assert.equal( observe(), false ); cls.demoplayback = false;
 cls.netcon.driver = 1; assert.equal( observe(), false ); cls.netcon.driver = 0;
 const peer = cls.netcon.driverdata; cls.netcon.driverdata = {}; assert.equal( observe(), false ); cls.netcon.driverdata = peer;
 document.hidden = true; assert.equal( observe(), false ); document.hidden = false;
 player.v.health = 0; assert.equal( cl.stats[ 0 ], 100, 'client health deliberately remains stale' ); assert.equal( observe(), false, 'actual native player death cannot consume sighting' ); player.v.health = 100;
 player.free = true; assert.equal( observe(), false, 'freed local player cannot consume sighting' ); player.free = false;
 boss.v.deadflag = 1; assert.equal( observe(), false ); boss.v.deadflag = 0;
 boss.v.classname = ED_NewString( 'monster_knight' ); assert.equal( observe(), false ); boss.v.classname = ED_NewString( 'monster_oldone' );
 assert.equal( S_GetEnvironmentSoundsStatus().shubSeen, false ); assert.equal( observe(), true ); await step(); assert.equal( deck().plays, 1 );
} ) );
Deno.test( 'sound restart retains a same-world sighting and new client world permits a new first encounter', () => game( async ( { observe, step, media, deck } ) => {
 assert.equal( observe(), true ); await step(); const old = deck(); S_EnvironmentSoundsShutdown();
 assert.equal( observe(), false, 'audio stop/restart must not repeat a seen Shub' ); await step(); assert.equal( S_GetEnvironmentSoundsStatus().shubSeen, true ); assert.equal( old.paused, true );
 cl.worldmodel = { name: 'maps/next-shub-fixture.bsp', hulls: [ emptyHull() ] }; sv.worldmodel = cl.worldmodel; S_EnvironmentSoundsReset();
 assert.equal( observe(), true ); await step(); const current = media.find( m => m !== old && m.src === ENVIRONMENT_TRACK_URLS.shub ); assert.ok( current ); assert.equal( current.plays, 1 );
} ) );
