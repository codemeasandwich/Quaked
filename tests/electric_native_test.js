// Independent stock-QC execution proof: actual attacks own ammo, traces, water
// discharge and damage. The sound observer may only report those outcomes.
import assert from 'node:assert/strict';
import { readFileSync } from './helpers/resource_fs.mjs';
import { fileURLToPath } from 'node:url';
import { assetPath } from '../tools/distribution/manifest.mjs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { PR_ExecuteProgram, PR_ResetStack } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { ED_FindFunction } from '../src/engine/progs/pr_edict.js';
import { sv, svs, client_t, set_host_client, skill, FL_GODMODE } from '../src/engine/server/server.js';
import { SV_CheckForNewClients } from '../src/engine/server/sv_main.js';
import { SV_SetPlayer, SV_CheckWater, sv_gravity } from '../src/engine/server/sv_phys.js';
import { SV_LinkEdict, SV_Move, MOVE_NORMAL, SV_PointContents } from '../src/engine/server/world.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { CL_Init, CL_Disconnect_f } from '../src/engine/client/cl_main.js';
import { cls, cl, ca_disconnected } from '../src/engine/client/client.js';
import { NET_Init, NET_SendMessage, NET_GetMessage, NET_CanSendMessage } from '../src/engine/net/net_main.js';
import { SZ_Clear } from '../src/engine/common/common.js';
import { R_Init } from '../src/engine/render/gl_rmain.js';
import { V_Init } from '../src/engine/client/view.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import { R_DemoLoadingCancel } from '../src/newer/ui/r_demoloading.js';
import { IT_LIGHTNING, IT_SHOTGUN } from '../src/engine/common/quakedef.js';
import { SV_ElectricActive, SV_ElectricReset, SV_ElectricDrain, SV_ElectricSnapshot, SV_AddElectricObserver } from '../src/newer/gameplay/sv_electricsounds.js';
import { rayWater } from '../src/newer/gameplay/sv_shotrays.js';

const root = fileURLToPath( new URL( '../', import.meta.url ) ), bytes = readFileSync( assetPath( root, 'games/shareware/pak0.pak' ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'shareware.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); cmd.Cbuf_Init(); cmd.Cmd_Init(); CL_Init(); R_Init(); V_Init(); Host_InitCommands();
for ( const c of [ skill, sv_gravity, travel.sv_seamless ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
svs.maxclients = svs.maxclientslimit = 1; svs.clients = [ new client_t() ]; NET_Init(); cls.state = ca_disconnected; cls.demoplayback = false;
const text = index => progs.PR_GetString( index );
function acknowledge() { const c = svs.clients[ 0 ]; if ( c?.active && c.netconnection && cls.netcon && ! cls.netcon.disconnected && c.message.cursize && NET_CanSendMessage( c.netconnection ) ) { NET_SendMessage( c.netconnection, c.message ); NET_GetMessage( cls.netcon ); SZ_Clear( c.message ); } }
async function fresh( map = 'e1m2' ) {
 vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'skill', 1 ); vars.Cvar_SetValue( 'sv_seamless', 1 ); acknowledge(); cmd.Cmd_ExecuteString( 'map ' + map, cmd.src_command ); await Promise.resolve(); SV_CheckForNewClients();
 const client = svs.clients[ 0 ]; assert.ok( client.active && cls.netcon?.driverdata === client.netconnection, 'actual native loopback paired' ); set_host_client( client ); SV_SetPlayer( client.edict ); cmd.Cmd_ExecuteString( 'spawn', cmd.src_client ); cmd.Cmd_ExecuteString( 'begin', cmd.src_client );
 cls.signon = 4; cl.intermission = 0; cl.worldmodel = sv.worldmodel; cl.viewentity = 1; cl.stats[ 0 ] = client.edict.v.health; cl.time = sv.time; acknowledge(); R_DemoLoadingCancel(); SV_ElectricReset(); assert.ok( SV_ElectricActive() ); return client.edict;
}
function native( entity, name ) { SZ_Clear( sv.datagram ); progs.pr_global_struct.self = progs.EDICT_TO_PROG( entity ); progs.pr_global_struct.time = sv.time; const fn = ED_FindFunction( name ); assert.ok( fn, 'native ' + name ); PR_ExecuteProgram( progs.pr_functions.indexOf( fn ) ); }
function equip( player, cells = 100 ) { player.v.items |= IT_LIGHTNING | IT_SHOTGUN; player.v.weapon = IT_LIGHTNING; player.v.ammo_cells = cells; player.v.button0 = 1; native( player, 'W_SetCurrentAmmo' ); }
function fire( player, cells = 100 ) { equip( player, cells ); SV_ElectricReset(); native( player, 'W_Attack' ); return SV_ElectricDrain(); }
function targetPair( player ) {
 const target = sv.edicts.find( e => e && ! e.free && text( e.v.classname ) === 'monster_army' ); assert.ok( target, 'real E1M2 soldier' );
 player.v.origin = [ target.v.origin[ 0 ] - 400, target.v.origin[ 1 ], target.v.origin[ 2 ] ]; player.v.v_angle = [ -Math.atan2( ( target.v.mins[ 2 ] + target.v.maxs[ 2 ] ) / 2 - 22, 400 ) * 180 / Math.PI, 0, 0 ]; player.v.velocity = [ 0, 0, 0 ]; SV_LinkEdict( player, false ); SV_CheckWater( player );
 assert.equal( player.v.waterlevel, 0, 'damage fixture is dry' ); target.v.health = 1000; target.v.armorvalue = 0; target.v.armortype = 0; return target;
}
function waterPosition( player, wanted ) {
 for ( const leaf of sv.worldmodel.leafs ) {
  if ( leaf.contents !== -3 ) continue; const b = leaf.minmaxs;
  for ( const fx of [ .5, .25, .75 ] ) for ( const fy of [ .5, .25, .75 ] ) for ( let z = b[ 2 ] + 25; z < b[ 5 ] + 25; z += 4 ) {
   const point = [ b[ 0 ] + ( b[ 3 ] - b[ 0 ] ) * fx, b[ 1 ] + ( b[ 4 ] - b[ 1 ] ) * fy, z ], fit = SV_Move( point, player.v.mins, player.v.maxs, point, MOVE_NORMAL, player );
   if ( fit.startsolid || fit.allsolid ) continue; player.v.origin = point; SV_CheckWater( player );
   if ( player.v.waterlevel === wanted && player.v.watertype === -3 ) { SV_LinkEdict( player, false ); return point; }
  }
 }
 throw Error( 'No actual waterlevel ' + wanted + ' position found' );
}
Deno.test( 'actual stock lightning records the visual trace and all three damage rays after one ammo-consuming pulse', async () => {
 const player = await fresh(); player.v.v_angle = [ -85, 0, 0 ]; SV_CheckWater( player ); const events = fire( player );
 assert.equal( player.v.ammo_cells, 99 ); assert.equal( events.length, 1 ); const event = events[ 0 ]; assert.equal( event.kind, 'pulse' ); assert.equal( event.actor, 'player' ); assert.equal( event.entity, player.index );
 assert.equal( event.traces.filter( r => r.caller === 'LightningDamage' ).length, 3, 'all three actual damage rays retained' );
 assert.ok( event.traces.some( r => r.caller === 'W_FireLightning' ), 'visual central trace retained separately' );
 assert.equal( event.liquidDischarge, false ); assert.ok( event.traces.every( r => [ ...r.start, ...r.end ].every( Number.isFinite ) ) );
 assert.equal( SV_ElectricDrain().length, 0, 'diagnostic drain consumes once' );
} );
Deno.test( 'native damage receipts and contacts distinguish target, armor and invulnerable contact from a miss', async () => {
 const player = await fresh(), target = targetPair( player ); let events = fire( player ); let hit = events[ 0 ]?.hits.find( h => h.target === target.index );
 assert.ok( hit && hit.healthLoss > 0, 'actual native target damage is recorded: ' + JSON.stringify( { target: target.index, solid: target.v.solid, takedamage: target.v.takedamage, player: Array.from( player.v.origin ), targetOrigin: Array.from( target.v.origin ), events } ) ); assert.equal( hit.healthLoss, 1000 - target.v.health ); assert.ok( hit.position.every( Number.isFinite ) );
 target.v.health = 1000; target.v.armorvalue = 100; target.v.armortype = .8; sv.time += .2; events = fire( player ); hit = events[ 0 ]?.hits.find( h => h.target === target.index ); assert.ok( hit && hit.armorLoss > 0, 'native armor absorption counted independently' );
 target.v.health = 1000; target.v.armorvalue = 0; target.v.armortype = 0; target.v.flags |= FL_GODMODE; sv.time += .2; events = fire( player ); hit = events[ 0 ]?.hits.find( h => h.target === target.index ); assert.ok( hit, 'blocked native damage attempt still establishes contact' ); assert.equal( hit.healthLoss, 0 ); assert.equal( target.v.health, 1000 ); target.v.flags &= ~FL_GODMODE;
 player.v.v_angle = [ -85, 0, 0 ]; sv.time += .2; events = fire( player ); assert.equal( events[ 0 ].hits.length, 0, 'a ray away from every target is a miss' );
} );
Deno.test( 'waist-deep native water discharge consumes all cells without inventing a normal beam', async () => {
 const player = await fresh( 'e1m1' ); const origin = waterPosition( player, 2 ); assert.equal( player.v.waterlevel, 2 ); player.v.flags |= FL_GODMODE;
 const events = fire( player, 12 ); assert.equal( player.v.ammo_cells, 0, 'native water discharge consumes all cells' ); const event = events.find( e => e.kind === 'pulse' ); assert.ok( event ); assert.equal( event.liquidDischarge, true ); assert.equal( event.waterDischarge, true ); assert.ok( event.water.length > 0 ); assert.ok( event.water.every( point => SV_PointContents( point ) === -3 ), 'waist-discharge water cue positions are actual water, not the dry eye' );
 assert.ok( ! event.traces.some( r => r.caller === 'W_FireLightning' ), 'native water branch returns before the normal visual ray' ); assert.equal( player.v.health, 100, 'read-only observer never overrides native god mode or damage' ); console.log( 'ELECTRIC_NATIVE_WATER', JSON.stringify( { origin, event } ) );
} );
Deno.test( 'a dry native beam crossing actual BSP water reports its first water contact without a discharge', async () => {
 const player = await fresh( 'e1m1' ); waterPosition( player, 2 );
 for ( let i = 0; i < 20 && player.v.waterlevel > 0; i++ ) { player.v.origin[ 2 ] += 4; SV_CheckWater( player ); }
 assert.equal( player.v.waterlevel, 0, 'actual shooter body is dry' ); SV_LinkEdict( player, false ); player.v.v_angle = [ 90, 0, 0 ];
 const events = fire( player ); const event = events.find( e => e.kind === 'pulse' ); assert.ok( event ); assert.equal( event.liquidDischarge, false ); assert.equal( player.v.ammo_cells, 99 ); assert.ok( event.water.length > 0, 'native traced segment crosses a real water interval' );
 const ray = event.traces.find( r => r.caller === 'W_FireLightning' ); assert.ok( ray );
 assert.ok( rayWater( ray.start, ray.end, point => SV_PointContents( point ) === -3 ).length > 0, 'water receipt agrees with existing sampler using explicit water-only predicate' );
 assert.equal( rayWater( ray.start, ray.end, point => SV_PointContents( point ) === -4 ).length, 0, 'real-water beam cannot be mislabeled slime' );
} );
Deno.test( 'real native Shambler charge/cast/terminal state events remain distinct and a stop needs an actual cast', async () => {
 const player = await fresh( 'e1m6' ), shambler = sv.edicts.find( e => e && ! e.free && text( e.v.classname ) === 'monster_shambler' ); assert.ok( shambler ); shambler.v.enemy = progs.EDICT_TO_PROG( player ); player.v.health = 1000; cl.stats[ 0 ] = 1000;
 native( shambler, 'sham_magic12' ); assert.equal( SV_ElectricDrain().length, 0, 'terminal frame alone cannot invent a firing stop' );
 const before = player.v.health; for ( const frame of [ 1, 2, 3, 4, 5, 6, 9, 10, 11, 12 ] ) { sv.time += .1; native( shambler, 'sham_magic' + frame ); }
 const events = SV_ElectricDrain(); assert.equal( events.filter( e => e.kind === 'charge' ).length, 1 ); assert.ok( events.some( e => e.kind === 'pulse' && e.actor === 'shambler' ) ); assert.equal( events.filter( e => e.kind === 'stop' ).length, 1 );
 assert.ok( events.every( e => e.entity === shambler.index && e.actor === 'shambler' ) ); assert.ok( player.v.health <= before, 'only native cast can affect the player' );
 SV_ElectricReset(); native( shambler, 'sham_magic12' ); assert.equal( SV_ElectricDrain().length, 0, 'reset discards previous-cast stop entitlement' );
} );
Deno.test( 'read-only electric observation leaves native ammo, damage, trace globals and randomness unchanged', async () => {
 const run = async enabled => {
  const player = await fresh(), target = targetPair( player ); equip( player ); SV_ElectricReset(); const crc = progs.pr_crc; let calls = 0, seed = 12345; const original = Math.random;
  Math.random = () => { calls++; seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0; return seed / 4294967296; };
  try { if ( ! enabled ) progs.PR_SetCRC( 0 ); native( player, 'W_Attack' ); } finally { progs.PR_SetCRC( crc ); Math.random = original; }
  return { ammo: player.v.ammo_cells, health: target.v.health, armor: target.v.armorvalue, trace: Array.from( progs.pr_global_struct.trace_endpos ), fraction: progs.pr_global_struct.trace_fraction, calls, events: SV_ElectricDrain() };
 };
 const observed = await run( true ), plain = await run( false ); assert.ok( observed.events.length > 0 ); assert.equal( plain.events.length, 0 ); delete observed.events; delete plain.events; assert.deepEqual( observed, plain, 'observer neither reruns nor changes the native attack' );
} );
Deno.test( 'unrelated weapon, dry fire, demo, unpaired connection and abandoned VM state cannot fabricate electric events', async () => {
 const player = await fresh(); assert.equal( fire( player, 0 ).length, 0 ); equip( player );
 const socket = cls.netcon, driver = socket.driver, crc = progs.pr_crc;
 cls.demoplayback = true; assert.equal( fire( player ).length, 0 ); cls.demoplayback = false;
 socket.driver = 1; assert.equal( fire( player ).length, 0 ); socket.driver = driver;
 progs.PR_SetCRC( 0 ); assert.equal( SV_ElectricActive(), false ); assert.equal( fire( player ).length, 0 ); progs.PR_SetCRC( crc );
 equip( player ); player.v.weapon = IT_SHOTGUN; player.v.ammo_shells = 10; native( player, 'W_SetCurrentAmmo' ); SV_ElectricReset(); native( player, 'W_Attack' ); assert.equal( SV_ElectricDrain().length, 0 );
 PR_ResetStack(); SV_ElectricReset(); assert.equal( SV_ElectricDrain().length, 0 ); assert.ok( SV_ElectricSnapshot() );
 const copies = [], unsubscribe = SV_AddElectricObserver( event => copies.push( event ) ); try { fire( player ); assert.equal( copies.length, 1, 'actual emitted event fanout independent of diagnostic drain' ); assert.equal( SV_ElectricDrain().length, 0 ); } finally { unsubscribe(); }
 acknowledge(); CL_Disconnect_f();
} );
