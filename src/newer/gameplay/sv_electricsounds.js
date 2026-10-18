/** Read-only electrical attack receipts from the existing QC enter/leave/trace
 * boundaries. Stock Quake and the verified Rogue program are qualified here;
 * PR_StockProgs remains unchanged, so no other enhancement gains authority.
 */
import { sv, svs } from '../../engine/server/server.js';
import { cl, cls, ca_connected } from '../../engine/client/client.js';
import { pr_functions, pr_crc, PR_StockProgs, PR_GetString, PROG_TO_EDICT, pr_global_struct,
	pr_globals_int, pr_xfunction } from '../../engine/progs/progs.js';
import { GetEdictFieldValue } from '../../engine/progs/pr_edict.js';
import { OFS_PARM0, OFS_PARM2 } from '../../engine/progs/pr_comp.js';
import { IT_LIGHTNING } from '../../engine/common/quakedef.js';
import { CONTENTS_WATER } from '../../engine/common/bspfile.js';
import { SV_PointContents } from '../../engine/server/world.js';
import { R_NewerGame } from '../mode.js';
import { rayWater } from './sv_shotrays.js';
import { Con_DPrintf } from '../../engine/common/console.js';

export const ELECTRIC_ROGUE_CRC = 48868; // owned progs SHA256 3d8063a8...8314179
const LIMIT = 128, MAX_TRACES = 4, MAX_HITS = 16;
let program, world, map, epoch = 0, active = null, receipts = [], cast = new WeakSet();
const names = new WeakMap(), observers = new Set();
const nameOf = fn => { if ( ! fn ) return ''; let n = names.get( fn ); if ( n === undefined ) { n = PR_GetString( fn.s_name ); names.set( fn, n ); } return n; };
const vec = p => p && [ p[ 0 ], p[ 1 ], p[ 2 ] ].every( Number.isFinite ) ? [ p[ 0 ], p[ 1 ], p[ 2 ] ] : null;
const centre = e => [ 0, 1, 2 ].map( i => e.v.origin[ i ] + ( e.v.mins[ i ] + e.v.maxs[ i ] ) / 2 );
const cells = e => { const f = pr_crc === ELECTRIC_ROGUE_CRC ? GetEdictFieldValue( e, 'ammo_cells1' ) : null; return f ? f.accessor.getFloat( f.ofs ) : e.v.ammo_cells; };
const waterPoint = e => {
 const origin = Array.from( e.v.origin );
 for ( const z of [ origin[ 2 ], origin[ 2 ] - 4, origin[ 2 ] + e.v.mins[ 2 ] + 1 ] ) {
  const point = [ origin[ 0 ], origin[ 1 ], z ]; if ( SV_PointContents( point ) === CONTENTS_WATER ) return point;
 }
 return null;
};
const sourceOf = e => [ 0, 1, 2 ].map( i => e.v.origin[ i ] + ( e.v.view_ofs?.[ i ] ?? 0 ) );

export function SV_ElectricReset() {
	program = pr_functions; world = sv.edicts; map = sv.name; epoch ++;
	active = null; receipts = []; cast = new WeakSet();
}
function sync() { if ( program !== pr_functions || world !== sv.edicts || map !== sv.name ) SV_ElectricReset(); }
/** Sound-only native ownership/compatibility gate; leaving a fatal discharge is
 * still observable, while admission of a new attack separately requires life. */
export function SV_ElectricActive() {
	const c = svs.clients?.[ 0 ], peer = cls.netcon?.driverdata;
	return !! ( sv.active && svs.maxclients === 1 && ( PR_StockProgs() || pr_crc === ELECTRIC_ROGUE_CRC ) &&
		R_NewerGame() && ! cls.demoplayback && cls.state === ca_connected && cl.worldmodel === sv.worldmodel &&
		cls.netcon?.driver === 0 && ! cls.netcon.disconnected && peer && ! peer.disconnected &&
		c?.active && c.netconnection === peer && c.edict === sv.edicts?.[ 1 ] && ! c.edict?.free );
}
/** Independent subscribers cannot consume each other's facts or the HUD queue. */
export function SV_AddElectricObserver( fn ) { observers.add( fn ); return () => observers.delete( fn ); }
function emit( event ) {
	event.epoch = epoch;
	if ( receipts.length >= LIMIT ) receipts.shift(); receipts.push( event );
	for ( const observer of observers ) {
		try { observer( event ); } catch ( error ) { Con_DPrintf( 'Electrical observer failed: %s\n', error?.message ?? error ); }
	}
}
export function SV_ElectricDrain() { sync(); if ( ! SV_ElectricActive() ) { SV_ElectricReset(); return []; } return receipts.splice( 0 ); }
export function SV_ElectricSnapshot() { sync(); return { active: SV_ElectricActive(), epoch, pending: receipts.length, limit: LIMIT }; }

/** Observe actual function entry, never execute or skip QC. */
export function SV_ElectricFunctionEnter( fn, caller ) {
	const n = nameOf( fn );
	if ( n !== 'W_FireLightning' && n !== 'CastLightning' && n !== 'T_EELZap' && n !== 'T_Damage' && n !== 'sham_magic1' && n !== 'sham_magic12' ) return null;
	sync(); if ( ! SV_ElectricActive() ) return null;
	if ( n === 'T_Damage' ) {
		if ( ! active ) return null;
		const parent = nameOf( caller ), attacker = PROG_TO_EDICT( pr_globals_int[ OFS_PARM2 ] );
		if ( attacker !== active.self || ! ( parent === 'LightningDamage' || parent === 'T_EELZap' ||
			( parent === 'T_RadiusDamage' && active.liquidDischarge ) ) ) return null;
		const target = PROG_TO_EDICT( pr_globals_int[ OFS_PARM0 ] );
		if ( ! target || target.free || target.index === 0 ) return null;
		const ray = active.traces.findLast( t => t.target === target.index );
		return { kind: 'damage', epoch, scope: active, target, position: ray ? ray.end : centre( target ),
			health: target.v.health, armor: target.v.armorvalue };
	}
	const self = PROG_TO_EDICT( pr_global_struct.self ), player = sv.edicts[ 1 ];
	if ( ! self || self.free || self.v.health <= 0 || player.v.health <= 0 ) return null;
	const classname = PR_GetString( self.v.classname ), model = PR_GetString( self.v.model );
	const shambler = classname === 'monster_shambler' && model === 'progs/shambler.mdl';
	if ( n === 'sham_magic1' || n === 'sham_magic12' ) {
		if ( ! shambler ) return null;
		if ( n === 'sham_magic1' ) {
			cast.delete( self ); emit( { kind: 'charge', actor: 'shambler', entity: self.index, time: sv.time, source: sourceOf( self ) } );
		} else if ( cast.has( self ) ) {
			cast.delete( self ); emit( { kind: 'stop', actor: 'shambler', entity: self.index, time: sv.time, source: sourceOf( self ) } );
		}
		return null;
	}
	let actor;
	if ( n === 'W_FireLightning' && self === player && self.v.weapon === IT_LIGHTNING && cells( self ) > 0 ) actor = 'player';
	else if ( n === 'CastLightning' && shambler ) actor = 'shambler';
	else if ( n === 'T_EELZap' && pr_crc === ELECTRIC_ROGUE_CRC && classname === 'monster_eel' && model === 'progs/eel2.mdl' ) actor = 'eel';
	else return null;
	const token = { kind: 'attack', epoch, actor, self, entity: self.index, time: sv.time, source: sourceOf( self ),
		ammo: cells( self ), previous: active, traces: [], hits: [], liquidDischarge: actor === 'player' && self.v.waterlevel > 1,
		waterDischarge: actor === 'player' && self.v.waterlevel > 1 && self.v.watertype === CONTENTS_WATER };
	active = token; return token;
}
/** Records only the central beam and its three native damage rays; CanDamage and
 * nested death/explosion traces are excluded by the current QC caller. */
export function SV_ElectricTrace( start, target, trace ) {
	if ( ! active || active.epoch !== epoch ) return;
	const caller = nameOf( pr_xfunction );
	if ( caller !== 'W_FireLightning' && caller !== 'CastLightning' && caller !== 'LightningDamage' ) return;
	if ( active.traces.length >= MAX_TRACES ) return;
	const from = vec( start ), end = vec( trace.endpos ); if ( ! from || ! end ) return;
	active.traces.push( { caller, start: from, end, target: trace.ent?.index ?? 0 } );
}
/** Finish a native receipt after QC has applied its own ammo/damage decisions. */
export function SV_ElectricFunctionLeave( token ) {
	if ( ! token || token.epoch !== epoch ) return;
	if ( token.kind === 'damage' ) {
		if ( token.scope.hits.length < MAX_HITS ) token.scope.hits.push( { target: token.target.index, position: token.position,
			healthLoss: Math.max( 0, token.health - token.target.v.health ), armorLoss: Math.max( 0, token.armor - token.target.v.armorvalue ) } );
		return;
	}
	active = token.previous;
	sync(); if ( token.epoch !== epoch || ! SV_ElectricActive() ) return;
	if ( token.actor === 'player' && ! ( cells( token.self ) < token.ammo ) ) return;
	const central = token.traces.find( t => t.caller !== 'LightningDamage' ) ?? token.traces[ 0 ];
	if ( token.actor === 'shambler' && ! central ) return; // no native cast ray, no invented strike
	if ( token.actor === 'shambler' ) cast.add( token.self );
	const water = [];
	for ( const ray of token.traces ) {
		const spans = rayWater( ray.start, ray.end, point => SV_PointContents( point ) === CONTENTS_WATER );
		if ( ! spans.length ) continue;
		const length = Math.hypot( ...ray.end.map( ( v, i ) => v - ray.start[ i ] ) ), f = length > 0 ? spans[ 0 ][ 0 ] / length : 0;
		const p = ray.start.map( ( v, i ) => v + ( ray.end[ i ] - v ) * f );
		if ( ! water.some( q => Math.hypot( ...q.map( ( v, i ) => v - p[ i ] ) ) < 4 ) ) water.push( p );
	}
	if ( token.waterDischarge && ! water.length ) { const point = waterPoint( token.self ); if ( point ) water.push( point ); }
	emit( { kind: 'pulse', actor: token.actor, entity: token.entity, time: token.time, source: token.source,
		start: central?.start ?? token.source, end: central?.end ?? token.source, traces: token.traces, hits: token.hits,
		water, liquidDischarge: token.liquidDischarge, waterDischarge: token.waterDischarge } );
}
