// Independent stock-QC/public parser proof. Existing native pickup functions own
// timer changes; no synthetic cue callback is used to make a sound assertion pass.
import assert from 'node:assert/strict';
import { readFileSync } from './helpers/resource_fs.mjs';
import { fileURLToPath } from 'node:url';
import { assetPath } from '../tools/distribution/manifest.mjs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { ED_FindFunction, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { sv, svs, client_t, set_host_client, skill } from '../src/engine/server/server.js';
import { SV_CheckForNewClients, SV_WriteClientdataToMessage } from '../src/engine/server/sv_main.js';
import { SV_SetPlayer, sv_gravity } from '../src/engine/server/sv_phys.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { CL_Init, CL_Disconnect_f } from '../src/engine/client/cl_main.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { cls, cl, ca_disconnected } from '../src/engine/client/client.js';
import { NET_Init, NET_SendMessage, NET_GetMessage, NET_CanSendMessage } from '../src/engine/net/net_main.js';
import { SZ_Clear, sizebuf_t, SZ_Alloc, COM_SetNetMessage } from '../src/engine/common/common.js';
import { R_Init } from '../src/engine/render/gl_rmain.js';
import { V_Init } from '../src/engine/client/view.js';
import * as keys from '../src/engine/client/keys.js';
import * as sound from '../src/engine/sound/sound.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import { R_DemoLoadingCancel } from '../src/newer/ui/r_demoloading.js';
import { R_PlayerFaceFrame } from '../src/newer/ui/r_facegame.js';
import { SV_AddPowerupObserver, SV_PlayerPowerMask, SV_FaceLocalActive, SV_FaceDrain } from '../src/newer/gameplay/sv_faceevents.js';
import { SV_CheatPower } from '../src/newer/gameplay/sv_cheats.js';
import { S_PlayerEventsReset, S_UpdatePlayerEvents, S_PlayerEventsShutdown, S_GetPlayerEventsStatus, PLAYER_EVENT_TRACK_URLS } from '../src/newer/sound/s_playerevents.js';
import { IT_QUAD, IT_INVISIBILITY, IT_INVULNERABILITY, IT_SUIT } from '../src/engine/common/quakedef.js';

const root = fileURLToPath( new URL( '../', import.meta.url ) ), bytes = readFileSync( assetPath( root, 'games/shareware/pak0.pak' ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'shareware.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); cmd.Cbuf_Init(); cmd.Cmd_Init(); CL_Init(); R_Init(); V_Init(); Host_InitCommands();
for ( const value of [ skill, sv_gravity, travel.sv_seamless ] ) if ( ! vars.Cvar_FindVar( value.name ) ) vars.Cvar_RegisterVariable( value );
svs.maxclients = svs.maxclientslimit = 1; svs.clients = [ new client_t() ]; NET_Init(); cls.state = ca_disconnected; cls.demoplayback = false;
const text = index => progs.PR_GetString( index );
function acknowledge() { const c = svs.clients[ 0 ]; if ( c?.active && c.netconnection && cls.netcon && ! cls.netcon.disconnected && c.message.cursize && NET_CanSendMessage( c.netconnection ) ) { NET_SendMessage( c.netconnection, c.message ); NET_GetMessage( cls.netcon ); SZ_Clear( c.message ); } }
async function fresh( map = 'e1m8', travelling = false ) {
 vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'skill', 1 ); vars.Cvar_SetValue( 'sv_seamless', 1 );
 acknowledge(); cmd.Cmd_ExecuteString( ( travelling ? 'changelevel ' : 'map ' ) + map, cmd.src_command ); await Promise.resolve(); SV_CheckForNewClients();
 const client = svs.clients[ 0 ]; assert.ok( client.active && cls.netcon?.driverdata === client.netconnection, 'real native loopback paired' );
 set_host_client( client ); SV_SetPlayer( client.edict ); cmd.Cmd_ExecuteString( 'spawn', cmd.src_client ); cmd.Cmd_ExecuteString( 'begin', cmd.src_client );
 cls.signon = 4; cl.intermission = 0; cl.worldmodel = sv.worldmodel; cl.viewentity = 1; cl.paused = false; acknowledge(); R_DemoLoadingCancel(); keys.set_key_dest( keys.key_game );
 assert.ok( SV_FaceLocalActive(), 'native observer authority established' ); return client.edict;
}
function native( entity, name ) { SZ_Clear( sv.datagram ); progs.pr_global_struct.self = progs.EDICT_TO_PROG( entity ); progs.pr_global_struct.time = sv.time; const fn = ED_FindFunction( name ); assert.ok( fn, name ); PR_ExecuteProgram( progs.pr_functions.indexOf( fn ) ); }
function field( player, name ) { const f = GetEdictFieldValue( player, name ); return f.accessor.getFloat( f.ofs ); }
const powers = {
 quad: { type: 'item_artifact_super_damage', bit: IT_QUAD, timer: 'super_damage_finished' },
 ring: { type: 'item_artifact_invisibility', bit: IT_INVISIBILITY, timer: 'invisible_finished' },
 pentagram: { type: 'item_artifact_invulnerability', bit: IT_INVULNERABILITY, timer: 'invincible_finished' },
 suit: { type: 'item_artifact_envirosuit', bit: IT_SUIT, timer: 'radsuit_finished' }
};
function collect( player, name, renew = false ) {
 const power = powers[ name ], item = sv.edicts.find( e => e && ! e.free && text( e.v.classname ) === power.type ); assert.ok( item, 'real map contains ' + power.type );
 if ( renew ) native( item, 'SUB_regen' ); else if ( item.v.solid !== 1 && item.v.think ) { progs.pr_global_struct.self = progs.EDICT_TO_PROG( item ); PR_ExecuteProgram( item.v.think ); }
 assert.equal( item.v.solid, 1 ); progs.pr_global_struct.other = progs.EDICT_TO_PROG( player ); native( item, 'powerup_touch' );
 assert.ok( player.v.items & power.bit ); assert.ok( Math.abs( field( player, power.timer ) - sv.time - 30 ) < .001 ); return item;
}
function wire( player ) { const packet = new sizebuf_t(); SZ_Alloc( packet, 8192 ); SV_SetPlayer( player ); SV_WriteClientdataToMessage( player, packet ); COM_SetNetMessage( packet ); CL_ParseServerMessage(); cl.time = sv.time; }
class Media {
 constructor() { this.paused = true; this.currentTime = 0; this.readyState = 4; this.duration = 30; this.plays = 0; }
 play() { this.plays++; this.paused = false; return Promise.resolve(); }
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
async function audio( run ) {
 const descriptors = new Map( [ 'window', 'document', 'Audio' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) ), media = [];
 try {
  Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context, location: { search: '', pathname: '/' }, innerWidth: 640, innerHeight: 400, devicePixelRatio: 1 } } );
  Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } } );
  Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends Media { constructor() { super(); media.push( this ); } } } );
  S_PlayerEventsReset(); dma.S_Init(); vars.Cvar_SetValue( 'nosound', 0 ); sound.volume.value = 1;
  const step = async ( dt = .01 ) => { dma.S_GetAudioContext().currentTime += dt; S_UpdatePlayerEvents(); await Promise.resolve(); await Promise.resolve(); return S_GetPlayerEventsStatus(); };
  await run( { media, step, deck: key => media.find( m => m.src === PLAYER_EVENT_TRACK_URLS[ key ] ) } );
 } finally { S_PlayerEventsShutdown(); acknowledge(); CL_Disconnect_f(); dma.S_Shutdown(); for ( const [ key, descriptor ] of descriptors ) { if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ]; } }
}

Deno.test( 'real native pickups fan out audio after HUD consumption and distinguish refresh from new power', () => audio( async ( { step, deck } ) => {
 const player = await fresh(); wire( player ); await step();
 collect( player, 'quad' ); wire( player ); R_PlayerFaceFrame(); assert.equal( SV_FaceDrain( 'reward' ).length, 0, 'HUD consumed its own reward queue' );
 await step(); assert.equal( deck( 'quad' ).plays, 1, 'independent audio event survives HUD drain' );
 sv.time += 1; const item = collect( player, 'quad', true ); wire( player ); await step(); assert.equal( deck( 'quad' ).plays, 2, 'real timer renewal gets pickup cue' );
 assert.ok( ! deck( 'pair' ), 'same distinct power does not become a pair' );
 progs.pr_global_struct.other = progs.EDICT_TO_PROG( player ); native( item, 'powerup_touch' ); wire( player ); await step(); assert.equal( deck( 'quad' ).plays, 2, 'consumed trigger cannot invent another pickup' );
} ) );
Deno.test( 'same-frame native distinct pickups preserve transitions and exact timer expiry ignores stale item bits', () => audio( async ( { step, deck } ) => {
 let player = await fresh( 'e1m3' ); wire( player ); await step(); collect( player, 'ring' ); wire( player ); await step();
 player = await fresh( 'e1m8', true ); wire( player ); await step();
 const events = [], unsubscribe = SV_AddPowerupObserver( event => events.push( event ) );
 try {
  collect( player, 'quad' ); collect( player, 'pentagram' );
  assert.equal( events.length, 2 ); assert.deepEqual( events.map( e => e.beforePowers ), [ IT_INVISIBILITY, IT_QUAD | IT_INVISIBILITY ] );
  assert.deepEqual( events.map( e => e.afterPowers ), [ IT_QUAD | IT_INVISIBILITY, IT_QUAD | IT_INVISIBILITY | IT_INVULNERABILITY ] );
  wire( player ); R_PlayerFaceFrame(); const status = await step(); assert.equal( status.powerCount, 3 ); assert.equal( deck( 'triple' ).plays, 1, 'host-end polling cannot erase intermediate 1->2->3 event sequence' );
  assert.equal( SV_PlayerPowerMask(), IT_QUAD | IT_INVISIBILITY | IT_INVULNERABILITY );
  sv.time = Math.max( ...[ 'quad', 'ring', 'pentagram' ].map( key => field( player, powers[ key ].timer ) ) ) + .01;
  assert.ok( player.v.items & IT_QUAD, 'item bit deliberately stale until native CheckPowerups runs' );
  assert.equal( SV_PlayerPowerMask(), 0, 'expired native deadlines never masquerade as active powers' );
  await step( 2 ); assert.equal( deck( 'pair' )?.paused ?? true, true );
 } finally { unsubscribe(); }
} ) );
Deno.test( 'actual native suit and cheat power switches cannot fabricate distinct pickup combos', () => audio( async ( { step, deck, media } ) => {
 const player = await fresh( 'e1m1' ); wire( player ); await step();
 collect( player, 'suit' ); wire( player ); await step(); assert.equal( media.length, 0 ); assert.equal( SV_PlayerPowerMask(), 0 );
 SV_CheatPower( 'ring' ); wire( player ); await step(); assert.equal( SV_PlayerPowerMask(), 0, 'cheated item and native timer excluded' ); assert.equal( media.length, 0, 'toggle is not a pickup' );
 collect( player, 'quad' ); wire( player ); await step(); assert.equal( SV_PlayerPowerMask(), IT_QUAD ); assert.equal( deck( 'quad' ).plays, 1 ); assert.ok( ! deck( 'pair' ), 'real Quad beside cheated Ring remains one genuine power' );
 SV_CheatPower( 'quad' ); SV_CheatPower( 'pentagram' ); wire( player ); await step(); assert.equal( SV_PlayerPowerMask(), 0 ); assert.ok( ! deck( 'triple' ), 'three cheat flags cannot fabricate triple pickup' );
} ) );
Deno.test( 'native observations remain local and do not turn demo, remote or initial restored bits into pickup cues', () => audio( async ( { step, deck } ) => {
 const player = await fresh(); wire( player ); await step(); cls.demoplayback = true; collect( player, 'quad' ); wire( player ); await step(); assert.ok( ! deck( 'quad' ) );
 cls.demoplayback = false; S_PlayerEventsReset(); wire( player ); await step(); assert.ok( ! deck( 'quad' ), 'existing native ownership is a silent baseline' );
 const socket = cls.netcon, driver = socket.driver; socket.driver = 1;
 try { assert.equal( SV_PlayerPowerMask(), 0, 'remote socket cannot read local native power state' ); } finally { socket.driver = driver; }
} ) );

Deno.test( 'actual native ClientKill reaches the parser and emits a single death/reset cue', () => audio( async ( { step, deck } ) => {
 const player = await fresh( 'e1m1' ); wire( player ); await step(); native( player, 'ClientKill' );
 assert.ok( player.v.health <= 0 && player._respawn?.sequence, 'actual game death coordinator owns the reset' );
 wire( player ); await step(); assert.equal( deck( 'death' ).plays, 1 );
 wire( player ); await step(); assert.equal( deck( 'death' ).plays, 1, 'repeated native death clientdata stays silent' );
} ) );

Deno.test( 'paired local custom-progs protocol fallback filters real cheat switches before counting pickup edges', () => audio( async ( { step, deck, media } ) => {
 const player = await fresh( 'e1m1' ); wire( player ); await step(); const crc = progs.pr_crc;
 try {
  // Public program identity setter selects the custom-progs fallback while the
  // real loopback, player, clientdata writer and cheat API remain unchanged.
  progs.PR_SetCRC( 0 ); assert.equal( SV_FaceLocalActive(), false );
  SV_CheatPower( 'ring' ); wire( player ); let state = await step(); assert.equal( state.powerCount, 0 ); assert.equal( media.length, 0, 'custom local cheated Ring is not a pickup cue' );
  collect( player, 'quad' ); wire( player ); state = await step(); assert.equal( state.powerMask, IT_QUAD ); assert.equal( deck( 'quad' ).plays, 1 ); assert.ok( ! deck( 'pair' ), 'cheated Ring plus earned Quad remains one power' );
  SV_CheatPower( 'quad' ); SV_CheatPower( 'pentagram' ); wire( player ); state = await step(); assert.equal( state.powerCount, 0 ); assert.ok( ! deck( 'triple' ) );
 } finally { progs.PR_SetCRC( crc ); }
} ) );
