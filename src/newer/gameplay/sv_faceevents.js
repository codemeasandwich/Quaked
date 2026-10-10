/**
 * @module newer/gameplay/sv_faceevents
 *
 * Observations of QuakeC for the status-bar face and the shotgun's pellets: damage, healing and shots, without
 * changing the game (but for a pellet's delayed damage).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `epoch`, `program`, `world`, `map`, `activeShot`; 5 module-level
 * collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `SV_FaceReset` clears it after a QuakeC error.
 */
// Native-QC observations for the local HUD face and for the shotgun's pellets. A damage callback
// is observed separately from later healing/clientdata, and a dry-fire weapon
// switch is not a shot. The observation changes nothing in the game, with one deliberate exception: the
// TraceAttack of a pellet of an observed shotgun blast waits for its pellet (traceAttackEnter, sv_shotdelay.js).
import { sv, svs, FL_MONSTER } from '../../engine/server/server.js';
import { cls, ca_connected } from '../../engine/client/client.js';
import { R_NewerGame } from '../render/r_anim.js';
import { pr_crc, pr_functions, pr_global_struct, pr_globals_int, PR_GetString, PROG_TO_EDICT, pr_xfunction } from '../../engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1 } from '../../engine/progs/pr_comp.js';
import { GetEdictFieldValue, ED_FindFunction } from '../../engine/progs/pr_edict.js';
import { shotRaysNew, shotRayRecord, shotRayEvent, shotBlastId } from './sv_shotrays.js';
import { shotDelayCapture } from './sv_shotdelay.js';
import { IT_AXE, IT_SHOTGUN, IT_SUPER_SHOTGUN, IT_NAILGUN, IT_SUPER_NAILGUN, IT_GRENADE_LAUNCHER, IT_ROCKET_LAUNCHER, IT_LIGHTNING } from '../../engine/common/quakedef.js';

const LIMIT = 256, queues = { damage: [], shot: [], reward: [], rays: [], alert: [] }, names = new WeakMap();
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
const SHOTGUNS = new Set( [ 'W_FireShotgun', 'W_FireSuperShotgun' ] );
// the soldier's shotgun: army_fire is one FireBullets( 4, ... ) of the stock progs.dat (the only monster that shoots bullets)
const SOLDIER_FIRE = 'army_fire';
const AXE_STARTS = new Set( [ 'player_axe1', 'player_axeb1', 'player_axec1', 'player_axed1' ] );
const CADENCE = new Map( [ [ IT_AXE, .5 ], [ IT_SHOTGUN, .5 ], [ IT_SUPER_SHOTGUN, .7 ],
 [ IT_NAILGUN, .2 ], [ IT_SUPER_NAILGUN, .2 ], [ IT_GRENADE_LAUNCHER, .6 ], [ IT_ROCKET_LAUNCHER, .8 ], [ IT_LIGHTNING, .1 ] ] );
let epoch = 0, program = null, world = null, map = '', activeShot = null;
function name( fn ) { if ( !fn ) return ''; let value = names.get( fn ); if ( value === undefined ) { value = PR_GetString( fn.s_name ); names.set( fn, value ); } return value; }
const vector = value => value?.length >= 3 && [ value[0], value[1], value[2] ].every( Number.isFinite ) ? Array.from( value ).slice( 0, 3 ) : null;

export function SV_FaceReset() {
 queues.damage.length = queues.shot.length = queues.reward.length = queues.rays.length = queues.alert.length = 0; activeShot = null; epoch ++;
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
 return kind === 'damage' || kind === 'shot' || kind === 'reward' || kind === 'rays' || kind === 'alert' ? queues[kind].splice( 0 ) : [];
}
function emit( event ) { const queue = queues[event.kind]; if ( queue.length >= LIMIT ) queue.shift(); queue.push( event ); }

export function SV_FaceFunctionEnter( fn, caller ) {
 const functionName = name( fn ), ammo = FIRE_AMMO.get( functionName ), axe = AXE_STARTS.has( functionName ) && name( caller ) === 'W_Attack';
 if ( functionName === SOLDIER_FIRE ) return soldierEnter( fn );
 if ( functionName === 'TraceAttack' ) return traceAttackEnter( caller );
 if ( functionName === 'FoundTarget' ) return alertEnter();
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
 const token = { kind:'shot', epoch, player, time:sv.time, map:sv.name, weapon, function:functionName, ammo, before, previous:activeShot, childShot:false,
  rays: SHOTGUNS.has( functionName ) ? shotRaysNew() : null, id: shotBlastId() };
 activeShot = token; return token;
}

// FireBullets calling TraceAttack for a pellet that hit something, during an observed blast: its damage, blood and
// puff wait for the pellet's flight (sv_shotdelay.js), which has the interpreter run SUB_Null instead. Anything else
// calling TraceAttack, or no observed blast, runs as always.
function traceAttackEnter( caller ) {
 if ( !activeShot?.rays || name( caller ) !== 'FireBullets' ) return null;
 if ( !shotDelayCapture( activeShot ) ) return null;
 return { kind:'trace', epoch, skip: ED_FindFunction( 'SUB_Null' ).first_statement - 1 };
}

// A monster that has just noticed the player: its FoundTarget runs (it plays the sight sound). FoundTarget is called from
// FindTarget (the monster sees or hears the player), from T_Damage (the player hurt a monster that had a different enemy)
// and from monster_use (a trigger or alarm wakes it). The HUD face looks toward it when it is off screen. Read-only. Not during
// the respawn sequence, whose own alert wakes the whole level. Every event is queued (the queue is bounded); the client picks
// the ones the player cannot see and glances once per half second (R_FaceAlerts), so a visible monster cannot hide an unseen one.
function alertEnter() {
 syncEpoch(); if ( !SV_FaceLocalActive() ) return null;
 const monster = PROG_TO_EDICT( pr_global_struct.self ), player = svs.clients[0].edict;
 if ( !monster || monster.free || monster === player || !( monster.v.flags & FL_MONSTER ) || PROG_TO_EDICT( monster.v.enemy ) !== player ) return null;
 if ( player.v.health <= 0 || player._respawn?.sequence ) return null;
 emit( { kind:'alert', time:sv.time, map:sv.name, enemy:monster.index, source:vector( [0,1,2].map( i => monster.v.origin[i] + .5*(monster.v.mins[i]+monster.v.maxs[i]) ) ),
  origin:vector( player.v.origin ), viewAngles:vector( player.v.v_angle ) } );
 return null;
}

// A soldier firing his shotgun. Observed like the player's: read-only, local single-player Newer Game only.
function soldierEnter() {
 syncEpoch(); if ( !SV_FaceLocalActive() ) return null;
 const soldier = PROG_TO_EDICT( pr_global_struct.self );
 if ( !soldier || soldier.free || PR_GetString( soldier.v.classname ) !== 'monster_army' ) return null;
 const token = { kind:'soldier', epoch, soldier, time:sv.time, map:sv.name, weapon:0, function:SOLDIER_FIRE, previous:activeShot, rays:shotRaysNew(), id:shotBlastId() };
 activeShot = token; return token;
}

export function SV_FaceFunctionLeave( token ) {
 if ( !token || token.epoch !== epoch ) return;
 if ( token.kind === 'trace' ) return;
 if ( token.kind === 'shot' || token.kind === 'soldier' ) activeShot = token.previous;
 if ( token.kind === 'soldier' ) {
  syncEpoch(); if ( token.epoch !== epoch || !SV_FaceLocalActive() ) return;
  const event = shotRayEvent( token, token.rays ); if ( event ) emit( { ...event, enemy: token.soldier.index } );
  return;
 }
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
 if ( token.rays ) { const rays = shotRayEvent( token, token.rays ); if ( rays ) emit( rays ); }
}

// PF_traceline reports every traceline here. While an observed blast (a local player's shotgun or a soldier's army_fire) runs, it is one of that
// blast's rays (FireBullets' own); nothing else is recorded, and the trace itself is never touched.
export const SV_FaceShotActive = () => !! activeShot?.rays;
export function SV_FaceShotTrace( v1, v2, trace ) {
 // (only FireBullets' own pellet traces: the explosion of a barrel a pellet kills runs T_RadiusDamage inside the
 // same weapon function, and its CanDamage traces are not pellets)
 if ( activeShot?.rays && name( pr_xfunction ) === 'FireBullets' ) shotRayRecord( activeShot.rays, v1, v2, trace );
}
