/**
 * @module newer/gameplay/sv_rendveil
 *
 * Rend the Veil: the arrival rite of stock monster-closet teleports, its save record and what the client draws.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: catches at 1 place.
 */
// A named stock monster-closet teleport owns one finite arrival rite. Native
// teleport_touch still owns destinations, telefrags, targets, damage and sound.
// The server clock releases AI at Focus even when no frame is being rendered.
import { sv, svs, MOVETYPE_STEP, FL_FLY, FL_SWIM } from '../../engine/server/server.js';
import { SV_DropToFloor } from '../../engine/server/world.js';
import { cls, ca_connected } from '../../engine/client/client.js';
import { PR_GetString, pr_functions, pr_crc } from '../../engine/progs/progs.js';
import { R_NewerGame } from '../mode.js';
import { Rend_Schedule } from './rend_veil_state.js';

const vector = value => Array.isArray( value ) && value.length === 3 &&
	value.every( component => Number.isFinite( component ) && Math.abs( component ) <= 1e6 );

/**
 * Checks that a value is a well-formed arrival-rite record: `version` 1, `start` a server time in seconds 0..1e9, a
 * `progs/<name>.mdl` model path, a finite 3-vector `origin` (|component| <= 1e6 Quake units) and an optional finite
 * `floorZ`. Used before a record is attached (`SV_RendVeilTouchEnd`), each time it is read back, when a savegame
 * writes it (`_newer_rend_veil` in pr_edict.js) and by `Rend_ParseRecord`.
 *
 * @param {*} record the candidate, usually an entity's `_rendVeil`
 * @returns {boolean} true when every field is valid
 */
export function Rend_ValidRecord( record ) {
	return record != null && typeof record === 'object' && record.version === 1 &&
		Number.isFinite( record.start ) && record.start >= 0 && record.start <= 1e9 &&
		typeof record.model === 'string' && /^progs\/[a-z0-9_]{1,64}\.mdl$/.test( record.model ) && vector( record.origin ) &&
 (record.floorZ===undefined||(Number.isFinite(record.floorZ)&&Math.abs(record.floorZ)<=1e6));
}

/**
 * Decodes a rite record saved as the URI-encoded JSON `_newer_rend_veil` field: when a savegame is loaded
 * (`ED_ParseEdict` in pr_edict.js) and when level entities are rebuilt from a snapshot (r_levelents.js).
 * Never throws: bad input yields null.
 *
 * @param {*} encoded the saved string (rejected when not a string or longer than 1024 characters)
 * @returns {?{ version: 1, start: number, model: string, origin: Array<number>, floorZ?: number }} a fresh copy holding only the known fields, or null when the input is missing,
 * malformed or fails `Rend_ValidRecord`
 */
export function Rend_ParseRecord( encoded ) {
	try {
		if ( typeof encoded !== 'string' || encoded.length > 1024 ) return null;
		const record = JSON.parse( decodeURIComponent( encoded ) );
		return Rend_ValidRecord( record ) ? { version: 1, start: record.start, model: record.model, origin: record.origin.slice(), ...(record.floorZ===undefined?{}:{floorZ:record.floorZ}) } : null;
	} catch { return null; }
}

/**
 * True when the rite may run: an active single-player Newer Game server running stock progs (CRC 24778) whose client 0
 * is this browser's own loopback connection, connected and not playing a demo or timedemo. Match the actual paired
 * local connection. An unrelated active server must never supply identity or a gameplay hold to a remote client or
 * recorded demo. Checked by every other function here.
 *
 * @returns {boolean} true when the local server and client are the paired single-player session
 */
export function SV_RendVeilLocalActive() {
	const client = svs.clients?.[ 0 ], connection = cls.netcon, peer = connection?.driverdata;
	return sv.active === true && svs.maxclients === 1 && pr_crc === 24778 &&
		! cls.demoplayback && ! cls.timedemo && cls.state === ca_connected &&
		connection?.driver === 0 && ! connection.disconnected && peer != null && ! peer.disconnected &&
		peer === client?.netconnection && peer.driverdata === connection && client.active === true &&
		client.edict === sv.edicts?.[ 1 ] && ! client.edict?.free && R_NewerGame();
}

function currentRecord( entity ) {
	const record = entity?._rendVeil;
	if ( ! record ) return null;
	if ( ! SV_RendVeilLocalActive() || ! Rend_ValidRecord( record ) || entity.free ||
		entity.v.health <= 0 || PR_GetString( entity.v.model ) !== record.model ||
		! PR_GetString( entity.v.classname ).startsWith( 'monster_' ) ||
		record.start > sv.time || sv.time - record.start >= Rend_Schedule().totalDuration ) {
		entity._rendVeil = null;
		return null;
	}
	return record;
}

/**
 * True while a monster's arrival rite is before Focus (`Rend_Schedule().focusAt` seconds after `start`), when the
 * server holds its thinker and movement (sv_phys.js `SV_RunThink` and the movement loop) and seamless pursuit skips
 * it (sv_seamless.js). Native retouch and telefrags stay active. Clears an expired or invalid record from the entity.
 *
 * @param {?edict_t} entity the entity to test
 * @returns {boolean} true while the rite is holding the monster
 */
export function SV_RendVeilHolding( entity ) {
	const record = currentRecord( entity );
	return record !== null && sv.time - record.start < Rend_Schedule().focusAt;
}

/**
 * Before QuakeC's touch function runs (`SV_RunTriggerTouch` in world.js): recognises a live monster touching a named
 * stock `trigger_teleport` whose touch is `teleport_touch` and whose target is an `info_teleport_destination`, and
 * records where it stood so `SV_RendVeilTouchEnd` can confirm the teleport.
 *
 * @param {?edict_t} entity the touching entity
 * @param {?edict_t} trigger the touched trigger
 * @returns {null|false|{ entity: edict_t, world: Array<edict_t>, before: Array<number>, destination: Array<number>, model: string }}
 * null = ordinary native touch, false = this pending arrival cannot retrigger (the caller skips the touch),
 * token = observe the native touch and attach a rite only to a confirmed arrival (origins copied, Quake units)
 */
export function SV_RendVeilTouchBegin( entity, trigger ) {
	if ( ! SV_RendVeilLocalActive() || ! entity || entity.free || ! trigger || trigger.free || entity.v.health <= 0 ||
		! PR_GetString( entity.v.classname ).startsWith( 'monster_' ) ||
		PR_GetString( trigger.v.classname ) !== 'trigger_teleport' ||
		! PR_GetString( trigger.v.targetname ) ||
		PR_GetString( pr_functions?.[ trigger.v.touch ]?.s_name || 0 ) !== 'teleport_touch' ) return null;
	if ( SV_RendVeilHolding( entity ) ) return false;
	const target = PR_GetString( trigger.v.target );
	const receiver = target && sv.edicts?.find( ed => ed && ! ed.free && PR_GetString( ed.v.targetname ) === target );
	if ( ! receiver || PR_GetString( receiver.v.classname ) !== 'info_teleport_destination' ) return null;
	const model = PR_GetString( entity.v.model );
	if ( ! /^progs\/[a-z0-9_]{1,64}\.mdl$/.test( model ) ) return null;
	return { entity, world: sv.edicts, before: Array.from( entity.v.origin ), destination: Array.from( receiver.v.origin ), model };
}

/**
 * After QuakeC's touch function: when the monster really moved (more than 1/16 unit) to within 1 unit of the
 * destination with its model unchanged, starts its rite at `sv.time`. A walking (MOVETYPE_STEP, not flying or
 * swimming) monster is first dropped to the floor and its vertical speed zeroed, and the record keeps that `floorZ`;
 * with no floor beneath it, no rite starts. The record is stored on `entity._rendVeil`, which savegames carry.
 *
 * @param {null|false|Object} token the value `SV_RendVeilTouchBegin` returned
 * @returns {?{ version: 1, start: number, model: string, origin: Array<number>, floorZ?: number }} the attached record, or null when no rite started (no token, another world since the
 * touch began, the monster died, did not teleport, or had no floor)
 */
export function SV_RendVeilTouchEnd( token ) {
	if ( ! token || ! SV_RendVeilLocalActive() || token.world !== sv.edicts ) return null;
	const entity = token.entity, origin = Array.from( entity.v.origin );
	if ( entity.free || entity.v.health <= 0 || PR_GetString( entity.v.model ) !== token.model ||
		! origin.some( ( value, i ) => Math.abs( value - token.before[ i ] ) > 1 / 16 ) ||
		Math.hypot( ...origin.map( ( value, i ) => value - token.destination[ i ] ) ) > 1 ) return null;
	// Stock teleport destinations add a player-sized vertical clearance. Settle
 // walking monsters BEFORE freezing them, so Focus does not introduce a fall.
 // Flying/swimming monsters retain their authored aerial/water destination.
 if(entity.v.movetype===MOVETYPE_STEP&&!((entity.v.flags|0)&(FL_FLY|FL_SWIM))){
  if(!SV_DropToFloor(entity))return null; // no safe support: ordinary native physics
  entity.v.velocity[2]=0;
 }
 const record = { version: 1, start: sv.time, model: token.model, origin: Array.from(entity.v.origin) };
	if(entity.v.movetype===MOVETYPE_STEP&&!((entity.v.flags|0)&(FL_FLY|FL_SWIM)))record.floorZ=entity.v.origin[2]+entity.v.mins[2];
 if(!Rend_ValidRecord(record))return null;
 entity._rendVeil = record;
	return record;
}

/**
 * Client bridge, read when the client parses an entity update (cl_parse.js) or relinks entities (cl_main.js) to give
 * the drawn entity its rite. No packet extension or remote server state is used. Expired or invalid native records
 * retire through the same server lifetime checks.
 *
 * @param {number} index edict number; client slots (1..maxclients) and the world never carry a rite
 * @param {?string} [modelName=null] when given, the record must be for this model path
 * @returns {?{ version: 1, start: number, model: string, origin: Array<number>, floorZ?: number }} the live server record (not a copy; do not mutate), or null when none applies
 */
export function SV_RendVeilClientRecord( index, modelName = null ) {
	const entity = sv.edicts?.[ index ];
	if ( ! entity || index <= svs.maxclients ) return null;
	const record = currentRecord( entity );
	return record && ( modelName == null || modelName === record.model ) ? record : null;
}
