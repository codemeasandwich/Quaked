// Independent actual Rogue-program execution proof. The owned mission pack
// remains read-only; base PR_StockProgs qualification must remain unchanged.
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
import { ED_FindFunction, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
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
import { SZ_Clear, COM_InitArgv } from '../src/engine/common/common.js';
import { R_Init } from '../src/engine/render/gl_rmain.js';
import { V_Init } from '../src/engine/client/view.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import { R_DemoLoadingCancel } from '../src/newer/ui/r_demoloading.js';
import { IT_LIGHTNING, IT_SHOTGUN } from '../src/engine/common/quakedef.js';
import { SV_ElectricActive, SV_ElectricReset, SV_ElectricDrain, SV_ElectricSnapshot, SV_AddElectricObserver } from '../src/newer/gameplay/sv_electricsounds.js';
import { rayWater } from '../src/newer/gameplay/sv_shotrays.js';
import { pakDirectory, readMember, isolatedPack } from '../tools/pak_members.mjs';

const root = fileURLToPath( new URL( '../', import.meta.url ) ), bytes = readFileSync( assetPath( root, 'games/shareware/pak0.pak' ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'shareware.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) );
// Registered base models missing from shareware are read positionally from the
// owned archive; no full 171MB base archive is duplicated into the test fixture.
const baseDirectory = await pakDirectory( process.env.QUAKED_ID1_PAK || '/Users/bri/quaked/Quake/pak0.pak' );
for ( const [ name, entry ] of baseDirectory ) if ( name.startsWith( 'progs/' ) && ! pak.COM_FindFile( name ) ) pak.COM_AddPack( isolatedPack( name, await readMember( entry ) ) );
const rogueBytes = readFileSync( process.env.QUAKED_OWNED_PAK || '/Users/bri/quaked/Dissolution of Eternity/pak0.pak' );
pak.COM_AddPack( pak.COM_LoadPackFile( 'owned-rogue.pak', rogueBytes.buffer.slice( rogueBytes.byteOffset, rogueBytes.byteOffset + rogueBytes.length ) ) ); COM_InitArgv( [ 'quaked', '-rogue' ] );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); cmd.Cbuf_Init(); cmd.Cmd_Init(); CL_Init(); R_Init(); V_Init(); Host_InitCommands();
for ( const c of [ skill, sv_gravity, travel.sv_seamless ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
svs.maxclients = svs.maxclientslimit = 1; svs.clients = [ new client_t() ]; NET_Init(); cls.state = ca_disconnected; cls.demoplayback = false;
const text = index => progs.PR_GetString( index );
function acknowledge() { const c = svs.clients[ 0 ]; if ( c?.active && c.netconnection && cls.netcon && ! cls.netcon.disconnected && c.message.cursize && NET_CanSendMessage( c.netconnection ) ) { NET_SendMessage( c.netconnection, c.message ); NET_GetMessage( cls.netcon ); SZ_Clear( c.message ); } }
async function fresh( map = 'r1m3' ) {
 vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'skill', 1 ); vars.Cvar_SetValue( 'sv_seamless', 1 ); acknowledge(); cmd.Cmd_ExecuteString( 'map ' + map, cmd.src_command ); await Promise.resolve(); SV_CheckForNewClients();
 const client = svs.clients[ 0 ]; assert.ok( client.active && cls.netcon?.driverdata === client.netconnection, 'actual native loopback paired' ); set_host_client( client ); SV_SetPlayer( client.edict ); cmd.Cmd_ExecuteString( 'spawn', cmd.src_client ); cmd.Cmd_ExecuteString( 'begin', cmd.src_client );
 cls.signon = 4; cl.intermission = 0; cl.worldmodel = sv.worldmodel; cl.viewentity = 1; cl.stats[ 0 ] = client.edict.v.health; cl.time = sv.time; acknowledge(); R_DemoLoadingCancel(); SV_ElectricReset(); assert.ok( SV_ElectricActive() ); return client.edict;
}
function native( entity, name ) { SZ_Clear( sv.datagram ); progs.pr_global_struct.self = progs.EDICT_TO_PROG( entity ); progs.pr_global_struct.time = sv.time; const fn = ED_FindFunction( name ); assert.ok( fn, 'native ' + name ); PR_ExecuteProgram( progs.pr_functions.indexOf( fn ) ); }
function equip( player, cells = 100 ) { player.v.items |= IT_LIGHTNING | IT_SHOTGUN; player.v.weapon = IT_LIGHTNING; player.v.ammo_cells = cells; player.v.button0 = 1; native( player, 'W_SetCurrentAmmo' ); }
function fire( player, cells = 100 ) { equip( player, cells ); SV_ElectricReset(); native( player, 'W_Attack' ); return SV_ElectricDrain(); }

function field( entity, name, value ) { const f = GetEdictFieldValue( entity, name ); assert.ok( f, 'native Rogue field ' + name ); if ( value !== undefined ) f.accessor.setFloat( f.ofs, value ); return f.accessor.getFloat( f.ofs ); }
function eelAndPlayer( player ) {
 const eels = sv.edicts.filter( e => e && ! e.free && e.v.health > 0 && text( e.v.classname ) === 'monster_eel' ); assert.ok( eels.length > 0, 'actual R1M3 map spawns electric eels' );
 const diagnostics = { wet: 0, clear: 0, traces: [] };
 for ( const eel of eels ) for ( const distance of [ 48, 64, 32, 80, 96, 128, 192 ] ) for ( const d of [ [ 1, 0 ], [ -1, 0 ], [ 0, 1 ], [ 0, -1 ] ] ) {
  const point = [ eel.v.origin[ 0 ] + d[ 0 ] * distance, eel.v.origin[ 1 ] + d[ 1 ] * distance, eel.v.origin[ 2 ] ];
  if ( SV_PointContents( point ) !== -3 ) continue; diagnostics.wet++; const fit = SV_Move( point, player.v.mins, player.v.maxs, point, MOVE_NORMAL, player ); if ( fit.startsolid || fit.allsolid ) continue; diagnostics.clear++;
  player.v.origin = point; player.v.velocity = [ 0, 0, 0 ]; player.v.health = 1000; player.v.armorvalue = 0; player.v.armortype = 0; SV_LinkEdict( player, false ); SV_CheckWater( player );
  const sight = SV_Move( eel.v.origin, [ 0, 0, 0 ], [ 0, 0, 0 ], player.v.origin, 0, eel );
  if ( diagnostics.traces.length < 5 ) diagnostics.traces.push( { eel: eel.index, source: Array.from( eel.v.origin ), point, hit: sight.ent?.index, open: sight.inopen, water: sight.inwater, startsolid: sight.startsolid, fraction: sight.fraction } );
  if ( sight.ent !== player || ( sight.inopen && sight.inwater ) ) continue; native( player, 'WaterMove' ); eel.v.enemy = progs.EDICT_TO_PROG( player ); return eel;
 }
 throw Error( 'No actual underwater Eel/player contact fixture found: ' + JSON.stringify( { diagnostics, eels: eels.map( eel => ( { index: eel.index, origin: Array.from( eel.v.origin ), contents: SV_PointContents( eel.v.origin ) } ) ) } ) );
}
Deno.test( 'verified Rogue identity admits actual eel_melee discharge without widening global stock gameplay authority', async () => {
 const player = await fresh(); assert.equal( progs.pr_crc, 48868 ); assert.equal( progs.PR_StockProgs(), false, 'mission program never becomes globally stock' );
 const eel = eelAndPlayer( player ), before = player.v.health; SV_ElectricReset(); native( eel, 'eel_melee' ); const events = SV_ElectricDrain();
 assert.equal( events.length, 1 ); const event = events[ 0 ]; assert.equal( event.actor, 'eel' ); assert.equal( event.kind, 'pulse' ); assert.equal( event.entity, eel.index ); assert.equal( event.traces.length, 0, 'eel radius zap is never fabricated as a gun beam' );
 const hit = event.hits.find( h => h.target === player.index ); assert.ok( hit && hit.healthLoss > 0 ); assert.equal( hit.healthLoss, before - player.v.health ); assert.equal( progs.PR_StockProgs(), false );
 console.log( 'ELECTRIC_REAL_ROGUE_EEL', JSON.stringify( { map: sv.name, crc: progs.pr_crc, eel: eel.index, healthBefore: before, healthAfter: player.v.health, event } ) );
} );
Deno.test( 'actual Rogue lightning preserves its native ammo_cells1 field and records the native pulse', async () => {
 const player = await fresh(); field( player, 'ammo_cells1', 20 ); player.v.ammo_cells = 20; player.v.items |= IT_LIGHTNING | IT_SHOTGUN; player.v.weapon = IT_LIGHTNING; player.v.button0 = 1; player.v.v_angle = [ -80, 0, 0 ];
 SV_CheckWater( player ); assert.equal( player.v.waterlevel, 0, 'Rogue start player is dry' ); native( player, 'W_SetCurrentAmmo' ); player.v.ammo_cells = 0; assert.equal( player.v.ammo_cells, 0, 'legacy cell projection deliberately differs from actual Rogue pool' ); SV_ElectricReset(); const before = field( player, 'ammo_cells1' ); native( player, 'W_Attack' );
 assert.equal( field( player, 'ammo_cells1' ), before - 1, 'only actual Rogue QC consumes its own cell pool' ); const events = SV_ElectricDrain(); assert.equal( events.length, 1 ); assert.equal( events[ 0 ].actor, 'player' ); assert.equal( events[ 0 ].traces.filter( t => t.caller === 'LightningDamage' ).length, 3 );
} );
Deno.test( 'actual Rogue eel events reject wrong native identity, unknown program, demo and unpaired client scopes', async () => {
 const player = await fresh(), eel = eelAndPlayer( player ), crc = progs.pr_crc, socket = cls.netcon, driver = socket.driver;
 cls.demoplayback = true; SV_ElectricReset(); native( eel, 'eel_melee' ); assert.equal( SV_ElectricDrain().length, 0 ); cls.demoplayback = false;
 socket.driver = 1; SV_ElectricReset(); native( eel, 'eel_melee' ); assert.equal( SV_ElectricDrain().length, 0 ); socket.driver = driver;
 progs.PR_SetCRC( 0 ); SV_ElectricReset(); assert.equal( SV_ElectricActive(), false ); native( eel, 'eel_melee' ); assert.equal( SV_ElectricDrain().length, 0 ); progs.PR_SetCRC( crc );
 const model = eel.v.model; eel.v.model = player.v.model; SV_ElectricReset(); native( eel, 'eel_melee' ); assert.equal( SV_ElectricDrain().length, 0, 'same function name on unsupported model cannot invent an eel cue' ); eel.v.model = model;
 SV_ElectricReset(); native( eel, 'eel_melee' ); assert.ok( SV_ElectricDrain().some( event => event.actor === 'eel' ), 'qualified live native eel remains observable after exclusions' );
 acknowledge(); CL_Disconnect_f(); COM_InitArgv( [ 'quaked' ] );
} );
