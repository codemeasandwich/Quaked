// Read-only native-QC observations for the local HUD face. A damage callback
// is observed separately from later healing/clientdata, and a dry-fire weapon
// switch is not a shot. This bridge never modifies entities, QC globals or RNG.
import { sv, svs } from './server.js';
import { cls, ca_connected } from './client.js';
import { R_NewerGame } from './r_anim.js';
import { pr_crc, pr_functions, pr_global_struct, pr_globals_int, PR_GetString, PROG_TO_EDICT } from './progs.js';
import { OFS_PARM0, OFS_PARM1 } from './pr_comp.js';
import { GetEdictFieldValue } from './pr_edict.js';
import { IT_AXE, IT_SHOTGUN, IT_SUPER_SHOTGUN, IT_NAILGUN, IT_SUPER_NAILGUN, IT_GRENADE_LAUNCHER, IT_ROCKET_LAUNCHER, IT_LIGHTNING } from './quakedef.js';

const LIMIT = 256, queues = { damage: [], shot: [], reward: [] }, names = new WeakMap();
const POWERS = new Map( [
 [ 'item_artifact_super_damage', [ 'quad', 'super_damage_finished' ] ],
 [ 'item_artifact_invulnerability', [ 'invulnerability', 'invincible_finished' ] ],
 [ 'item_artifact_invisibility', [ 'invisibility', 'invisible_finished' ] ],
 [ 'item_artifact_envirosuit', [ 'suit', 'radsuit_finished' ] ]
] );
function timer( player, field ) { const value = GetEdictFieldValue( player, field ); return value ? value.accessor.getFloat( value.ofs ) : 0; }
const FIRE_AMMO = new Map( [
 [ 'W_FireShotgun', 'ammo_shells' ], [ 'W_FireSuperShotgun', 'ammo_shells' ],
 [ 'W_FireSpikes', 'ammo_nails' ], [ 'W_FireSuperSpikes', 'ammo_nails' ],
 [ 'W_FireGrenade', 'ammo_rockets' ], [ 'W_FireRocket', 'ammo_rockets' ], [ 'W_FireLightning', 'ammo_cells' ]
] );
const AXE_STARTS = new Set( [ 'player_axe1', 'player_axeb1', 'player_axec1', 'player_axed1' ] );
const CADENCE = new Map( [ [ IT_AXE, .5 ], [ IT_SHOTGUN, .5 ], [ IT_SUPER_SHOTGUN, .7 ],
 [ IT_NAILGUN, .2 ], [ IT_SUPER_NAILGUN, .2 ], [ IT_GRENADE_LAUNCHER, .6 ], [ IT_ROCKET_LAUNCHER, .8 ], [ IT_LIGHTNING, .1 ] ] );
let epoch = 0, program = null, world = null, map = '', activeShot = null;
function name( fn ) { if ( !fn ) return ''; let value = names.get( fn ); if ( value === undefined ) { value = PR_GetString( fn.s_name ); names.set( fn, value ); } return value; }
const vector = value => value?.length >= 3 && [ value[0], value[1], value[2] ].every( Number.isFinite ) ? Array.from( value ).slice( 0, 3 ) : null;

export function SV_FaceReset() {
 queues.damage.length = queues.shot.length = queues.reward.length = 0; activeShot = null; epoch ++;
 program = pr_functions; world = sv.edicts; map = sv.name;
}
function syncEpoch() { if ( program !== pr_functions || world !== sv.edicts || map !== sv.name ) SV_FaceReset(); }

export function SV_FaceLocalActive() {
 const client = svs.clients?.[0], peer = cls.netcon?.driverdata;
 return sv.active === true && svs.maxclients === 1 && pr_crc === 24778 && !cls.demoplayback &&
  cls.state === ca_connected && cls.netcon?.driver === 0 && !cls.netcon.disconnected &&
  !!peer && !peer.disconnected && peer === client?.netconnection && client.active === true &&
  client.edict === sv.edicts?.[1] && !client.edict?.free && R_NewerGame();
}

export function SV_FaceDrain( kind ) {
 syncEpoch();
 if ( !SV_FaceLocalActive() ) { SV_FaceReset(); return []; }
 return kind === 'damage' || kind === 'shot' || kind === 'reward' ? queues[kind].splice( 0 ) : [];
}
function emit( event ) { const queue = queues[event.kind]; if ( queue.length >= LIMIT ) queue.shift(); queue.push( event ); }

export function SV_FaceFunctionEnter( fn, caller ) {
 const functionName = name( fn ), ammo = FIRE_AMMO.get( functionName ), axe = AXE_STARTS.has( functionName ) && name( caller ) === 'W_Attack';
 if ( functionName !== 'T_Damage' && functionName !== 'powerup_touch' && !ammo && !axe ) return null;
 syncEpoch(); if ( !SV_FaceLocalActive() ) return null;
 const player = svs.clients[0].edict;
 if ( PR_GetString( player.v.classname ) !== 'player' || player.v.health <= 0 ) return null;
 if ( functionName === 'powerup_touch' ) {
  if ( PROG_TO_EDICT( pr_global_struct.other ) !== player ) return null;
  const pickup = PROG_TO_EDICT( pr_global_struct.self ), power = pickup && POWERS.get( PR_GetString( pickup.v.classname ) );
  if ( !power || pickup.free || pickup.v.solid !== 1 ) return null; // native SOLID_TRIGGER
  return { kind:'reward', epoch, player, pickup, power:power[0], field:power[1], before:timer(player,power[1]), items:player.v.items, time:sv.time, map:sv.name };
 }
 if ( functionName === 'T_Damage' ) {
  if ( PROG_TO_EDICT( pr_globals_int[OFS_PARM0] ) !== player ) return null;
  const inflictor = PROG_TO_EDICT( pr_globals_int[OFS_PARM1] );
  const type = inflictor ? PR_GetString( inflictor.v.classname ) : '';
  // World/fall/floor-trigger damage has no meaningful horizontal attacker.
  const source = inflictor && !inflictor.free && inflictor.index > 0 && !/^trigger_|^worldspawn$/.test( type )
   ? vector( [0,1,2].map( i => inflictor.v.origin[i] + .5*(inflictor.v.mins[i]+inflictor.v.maxs[i]) ) ) : null;
  return { kind:'damage', epoch, player, time:sv.time, map:sv.name, before:player.v.health,
   armorBefore:player.v.armorvalue, source, origin:vector(player.v.origin), viewAngles:vector(player.v.v_angle) };
 }
 if ( PROG_TO_EDICT( pr_global_struct.self ) !== player ) return null;
 const weapon = player.v.weapon|0;
 if ( axe ) return weapon === IT_AXE ? { kind:'axe', epoch, time:sv.time, map:sv.name, weapon, function:functionName } : null;
 const before = player.v[ammo]; if ( !Number.isFinite(before) || before <= 0 ) return null;
 const token = { kind:'shot', epoch, player, time:sv.time, map:sv.name, weapon, function:functionName, ammo, before, previous:activeShot, childShot:false };
 activeShot = token; return token;
}

export function SV_FaceFunctionLeave( token ) {
 if ( !token || token.epoch !== epoch ) return;
 if ( token.kind === 'shot' ) activeShot = token.previous;
 syncEpoch(); if ( token.epoch !== epoch || !SV_FaceLocalActive() ) return;
 if ( token.kind === 'reward' ) {
  if ( timer(token.player,token.field) !== token.before || token.player.v.items !== token.items || token.pickup.v.solid !== 1 )
   emit( { kind:'reward', time:token.time, map:token.map, power:token.power, entity:token.pickup.index } );
  return;
 }
 if ( token.kind === 'damage' ) {
  const after = token.player.v.health, armorAfter = token.player.v.armorvalue;
  if ( !Number.isFinite(after) || !Number.isFinite(armorAfter) ) return;
  const loss = Math.max( 0, token.before-after ), armorLoss = Math.max( 0, token.armorBefore-armorAfter );
  if ( loss+armorLoss <= 0 ) return;
  emit( { kind:'damage', time:token.time, map:token.map, loss, amount:loss+armorLoss, before:token.before, after, armorLoss,
   source:token.source, origin:token.origin, viewAngles:token.viewAngles, ...(token.source ? {} : { angle:null }) } );
  return;
 }
 if ( token.kind === 'shot' ) {
  if ( !Number.isFinite(token.player.v[token.ammo]) || token.player.v[token.ammo] >= token.before ) return;
  // Native super-shotgun and super-nail fallback calls nest another discharge
  // routine. That inner confirmed shot owns the event; never emit it twice.
  if ( token.previous ) token.previous.childShot = true;
  if ( token.childShot ) return;
 }
 emit( { kind:'shot', time:token.time, map:token.map, weapon:token.weapon, cadence:CADENCE.get(token.weapon) || .5, function:token.function } );
}
