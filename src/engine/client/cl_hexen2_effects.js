/**
 * @module engine/client/cl_hexen2_effects
 *
 * Hexen II's long-lived client effects (uhexen2 engine/hexen2/cl_effect.c): the CE_* slots 1..62, their native sprite
 * or model, frame timing, movement and lifetime, plus the rain/snow volumes and the svc_hexen2_temp_entity stream
 * records. It is an additive module reached from the hooks `cl_hexen2.js` installs; a Quake session never spawns one.
 *
 * Types: plain values and functions; no exported classes.
 * State: the CE slots and their effect-entity pool (256, as native), the 32 stream records, and the effect models
 * loaded through `Mod_ForName`. Cleared when `CL_Hexen2Reset` gives the client a new `cl.h2` or by
 * `Hexen2_ClearEffects`.
 * Errors: `Hexen2_StartEffect` throws for an unknown CE_* type, as the native Host_Error does. Missing art is skipped
 * rather than fatal, so a partial installation still runs.
 */

import { AngleVectors, M_PI } from '../common/mathlib.js';
import { CONTENTS_EMPTY } from '../common/bspfile.js';
import { CE } from '../common/hexen2_effectwire.js';
import {
	cl, cl_entities, cl_numvisedicts, cl_visedicts, set_cl_numvisedicts, entity_t,
	MAX_VISEDICTS, CSHIFT_BONUS
} from './client.js';
import { Hexen2_SetClientHooks } from './cl_hexen2.js';
import { r_refdef } from '../render/render.js';
import { Mod_ForName, Mod_PointInLeaf } from '../render/gl_model.js';
import {
	R_RunParticleEffect2, R_RunParticleEffect3, R_RunParticleEffect4, R_ColoredParticleExplosion,
	R_RainEffect, R_SnowEffect, R_RunQuakeEffect, R_RiderParticle, R_GravityWellParticle, R_RocketTrail,
	PT
} from '../render/r_part.js';
import { V_HexenQuakeShake } from './view.js';

const MAX_EFFECTS = 256;
const MAX_EFFECT_ENTITIES = 256;
const MAX_STREAMS = 32;
const STREAM_ATTACHED = 16;
const HX_FRAME_TIME = 0.05;
const DRF_TRANSLUCENT = 128;
const MLS_TORCH = 3;
const MLS_ABSLIGHT = 7;
const SCALE_TYPE_XYONLY = 8;

// Thing types (uhexen2 effects.h:23-49).
const THINGTYPE_GREYSTONE = 1, THINGTYPE_WOOD = 2, THINGTYPE_METAL = 3, THINGTYPE_FLESH = 4, THINGTYPE_FIRE = 5,
	THINGTYPE_CLAY = 6, THINGTYPE_LEAVES = 7, THINGTYPE_HAY = 8, THINGTYPE_BROWNSTONE = 9, THINGTYPE_CLOTH = 10,
	THINGTYPE_WOOD_LEAF = 11, THINGTYPE_WOOD_METAL = 12, THINGTYPE_WOOD_STONE = 13, THINGTYPE_METAL_STONE = 14,
	THINGTYPE_METAL_CLOTH = 15, THINGTYPE_WEBS = 16, THINGTYPE_GLASS = 17, THINGTYPE_ICE = 18,
	THINGTYPE_CLEARGLASS = 19, THINGTYPE_REDGLASS = 20, THINGTYPE_ACID = 21, THINGTYPE_METEOR = 22,
	THINGTYPE_GREENFLESH = 23, THINGTYPE_BONE = 24;

// The native models, by CE_* type (uhexen2 cl_effect.c). Effects not listed here spawn no entity: rain, snow,
// fountain, quake, rider death, gravity well, and the two chunk/teleporter groups below have their own paths.
const SMOKE_MODELS = Object.freeze( {
	[ CE.WHITE_SMOKE ]: 'models/whtsmk1.spr', [ CE.SLOW_WHITE_SMOKE ]: 'models/whtsmk1.spr',
	[ CE.GREEN_SMOKE ]: 'models/grnsmk1.spr', [ CE.GREY_SMOKE ]: 'models/grysmk1.spr',
	[ CE.RED_SMOKE ]: 'models/redsmk1.spr', [ CE.TELESMK1 ]: 'models/telesmk1.spr',
	[ CE.TELESMK2 ]: 'models/telesmk2.spr', [ CE.REDCLOUD ]: 'models/rcloud.spr',
	[ CE.FLAMESTREAM ]: 'models/flamestr.spr', [ CE.ACID_MUZZFL ]: 'models/muzzle1.spr',
	[ CE.FLAMEWALL ]: 'models/firewal1.spr', [ CE.FLAMEWALL2 ]: 'models/firewal2.spr'
} );

const EXPLOSION_MODELS = Object.freeze( {
	[ CE.BLUESPARK ]: 'models/bspark.spr', [ CE.YELLOWSPARK ]: 'models/spark.spr',
	[ CE.SM_CIRCLE_EXP ]: 'models/fcircle.spr', [ CE.BG_CIRCLE_EXP ]: 'models/xplod29.spr',
	[ CE.SM_WHITE_FLASH ]: 'models/sm_white.spr', [ CE.YELLOWRED_FLASH ]: 'models/yr_flsh.spr',
	[ CE.SM_EXPLOSION ]: 'models/sm_expld.spr', [ CE.LG_EXPLOSION ]: 'models/bg_expld.spr',
	[ CE.FLOOR_EXPLOSION ]: 'models/fl_expld.spr', [ CE.FLOOR_EXPLOSION3 ]: 'models/biggy.spr',
	[ CE.BLUE_EXPLOSION ]: 'models/xpspblue.spr', [ CE.REDSPARK ]: 'models/rspark.spr',
	[ CE.GREENSPARK ]: 'models/gspark.spr', [ CE.ICEHIT ]: 'models/icehit.spr',
	[ CE.MEDUSA_HIT ]: 'models/medhit.spr', [ CE.MEZZO_REFLECT ]: 'models/mezzoref.spr',
	[ CE.FLOOR_EXPLOSION2 ]: 'models/flrexpl2.spr', [ CE.XBOW_EXPLOSION ]: 'models/xbowexpl.spr',
	[ CE.NEW_EXPLOSION ]: 'models/gen_expl.spr', [ CE.MAGIC_MISSILE_EXPLOSION ]: 'models/mm_expld.spr',
	[ CE.BONE_EXPLOSION ]: 'models/bonexpld.spr', [ CE.BLDRN_EXPL ]: 'models/xplsn_1.spr',
	[ CE.ACID_HIT ]: 'models/axplsn_2.spr', [ CE.ACID_SPLAT ]: 'models/axplsn_1.spr',
	[ CE.ACID_EXPL ]: 'models/axplsn_5.spr', [ CE.FBOOM ]: 'models/fboom.spr', [ CE.BOMB ]: 'models/pow.spr',
	[ CE.LBALL_EXPL ]: 'models/Bluexp3.spr', [ CE.FIREWALL_SMALL ]: 'models/firewal1.spr',
	[ CE.FIREWALL_MEDIUM ]: 'models/firewal5.spr', [ CE.FIREWALL_LARGE ]: 'models/firewal4.spr',
	[ CE.BRN_BOUNCE ]: 'models/spark.spr'
} );

const FLASH_MODELS = Object.freeze( {
	[ CE.WHITE_FLASH ]: 'models/gryspt.spr', [ CE.BLUE_FLASH ]: 'models/bluflash.spr',
	[ CE.SM_BLUE_FLASH ]: 'models/sm_blue.spr', [ CE.RED_FLASH ]: 'models/redspt.spr'
} );

const SMOKE_TYPES = new Set( Object.keys( SMOKE_MODELS ).map( Number ) );
SMOKE_TYPES.add( CE.GHOST );
const EXPLOSION_TYPES = new Set( Object.keys( EXPLOSION_MODELS ).map( Number ) );
EXPLOSION_TYPES.add( CE.LSHOCK );
const FLASH_TYPES = new Set( Object.keys( FLASH_MODELS ).map( Number ) );
SMOKE_TYPES.add( CE.ONFIRE );

/** The native stream models by TE_ type (uhexen2 cl_tent.c ParseStream), for the temp-entity pass in cl_tent.js. */
export const HEXEN2_STREAM_MODELS = Object.freeze( {
	24: Object.freeze( [ 'models/stltng2.mdl' ] ),
	25: Object.freeze( [ 'models/stchain.mdl' ] ),
	26: Object.freeze( [ 'models/stsunsf1.mdl', 'models/stsunsf2.mdl', 'models/stsunsf3.mdl', 'models/stsunsf4.mdl' ] ),
	27: Object.freeze( [ 'models/stsunsf5.mdl', null, 'models/stsunsf3.mdl', 'models/stsunsf4.mdl' ] ),
	28: Object.freeze( [ 'models/stlghtng.mdl' ] ),
	29: Object.freeze( [ 'models/stclrbm.mdl' ] ),
	30: Object.freeze( [ 'models/stice.mdl' ] ),
	31: Object.freeze( [ 'models/stmedgaz.mdl' ] ),
	32: Object.freeze( [ 'models/fambeam.mdl' ] )
} );

//=============================================================================
// Effect-entity pool
//=============================================================================

const effectEntities = [];
const effectEntityUsed = new Uint8Array( MAX_EFFECT_ENTITIES );
let effectEntityCount = 0;

for ( let i = 0; i < MAX_EFFECT_ENTITIES; i ++ ) {

	const ent = new entity_t();
	ent._effectPoolIndex = i;
	effectEntities.push( ent );

}

function clearEffectEntity( ent ) {

	ent.forcelink = false;
	ent.model = null;
	ent.frame = 0;
	ent.colormap = null;
	ent.skinnum = 0;
	ent.effects = 0;
	ent.scale = 1.0;
	ent.drawflags = 0;
	ent.abslight = 0;
	ent.origin.fill( 0 );
	ent.angles.fill( 0 );

}

function allocEffectEntity() {

	if ( effectEntityCount === MAX_EFFECT_ENTITIES ) return - 1;

	let index = - 1;
	for ( let i = 0; i < MAX_EFFECT_ENTITIES; i ++ )
		if ( ! effectEntityUsed[ i ] ) { index = i; break; }
	if ( index === - 1 ) return - 1;

	effectEntityUsed[ index ] = 1;
	effectEntityCount ++;
	const ent = effectEntities[ index ];
	clearEffectEntity( ent );
	return index;

}

function freeEffectEntity( index ) {

	if ( index < 0 || index >= MAX_EFFECT_ENTITIES || ! effectEntityUsed[ index ] ) return;
	effectEntityUsed[ index ] = 0;
	effectEntityCount --;
	clearEffectEntity( effectEntities[ index ] );

}

function linkEffectEntity( ent ) {

	if ( cl_numvisedicts >= MAX_VISEDICTS ) return;
	cl_visedicts[ cl_numvisedicts ] = ent;
	set_cl_numvisedicts( cl_numvisedicts + 1 );

}

function loadEffectModel( name ) {

	return name ? Mod_ForName( name, false ) : null;

}

function modelFrames( model ) { return model && model.numframes > 0 ? model.numframes : 1; }

//=============================================================================
// CE slots
//=============================================================================

const effectSlots = new Array( MAX_EFFECTS ).fill( null );
let effectsRef = cl.h2 ? cl.h2.effects : null;

/*
===============
Hexen2_ClearEffects

Drops every live CE slot and stream, returning the effect entities to the pool. Native CL_ClearEffects also runs on a
new level; CL_Hexen2Reset replacing cl.h2 is detected lazily by ensureSession.
===============
*/
/** Frees every live client effect and stream and returns their entities to the pool. */
export function Hexen2_ClearEffects() {

	for ( let i = 0; i < MAX_EFFECTS; i ++ ) if ( effectSlots[ i ] ) freeEffect( i );
	Hexen2_ClearStreams();

}

function ensureSession() {

	const next = cl.h2 ? cl.h2.effects : null;
	if ( next === effectsRef ) return;
	effectsRef = next;
	// A new cl.h2 (serverinfo, map change, connect) starts an empty effect set. The records just parsed into the new
	// array belong to this session, so only the module's slots and streams are cleared.
	for ( let i = 0; i < MAX_EFFECTS; i ++ ) if ( effectSlots[ i ] ) freeEffect( i );
	Hexen2_ClearStreams();

}

function freeEffect( index ) {

	const state = effectSlots[ index ];
	if ( ! state ) return;

	if ( state.entities ) for ( const entIndex of state.entities ) freeEffectEntity( entIndex );
	if ( state.entity !== undefined && state.entity >= 0 ) freeEffectEntity( state.entity );
	if ( state.entityIndices ) for ( const entIndex of state.entityIndices ) freeEffectEntity( entIndex );
	effectSlots[ index ] = null;

}

/** @returns {?object} the live CE state for a slot, or null */
export function Hexen2_GetEffect( index ) { ensureSession(); return effectSlots[ index ] ?? null; }

/**
 * Ends one CE slot, as svc_end_effect does.
 *
 * @param {number} index the native slot
 */
export function Hexen2_EndEffect( index ) { ensureSession(); freeEffect( index ); }

/**
 * The effect entities a CE slot owns, for the native-visual tests.
 *
 * @returns {ReadonlyArray<{ index: number, type: number, entity: object }>} live entity records
 */
export function Hexen2_EffectEntities() {

	const out = [];
	for ( const state of effectSlots ) {

		if ( ! state ) continue;
		const indices = state.entities ?? state.entityIndices ?? ( state.entity >= 0 ? [ state.entity ] : [] );
		for ( const entIndex of indices ) if ( entIndex >= 0 && effectEntityUsed[ entIndex ] )
			out.push( Object.freeze( { index: state.index, type: state.type, entity: effectEntities[ entIndex ] } ) );

	}
	return Object.freeze( out );

}

/**
 * Starts (or restarts) one CE slot, as svc_start_effect does.
 *
 * @param {number} index the native slot 0..255
 * @param {number} type the CE_* type 1..62
 * @param {object} params the decoded wire body (`hexen2_effectwire.js`)
 * @param {number} [startedAt=cl.time] presentation time the slot started
 * @returns {object} the new slot state
 * @throws {Error} for an unknown type, as native Host_Error
 */
export function Hexen2_StartEffect( index, type, params = {}, startedAt = cl.time ) {

	ensureSession();
	if ( ! Number.isInteger( index ) || index < 0 || index >= MAX_EFFECTS ) throw new Error( `CL_ParseEffect: bad slot ${index}` );
	if ( effectSlots[ index ] ) freeEffect( index );

	const state = {
		index, type, params, startedAt, timeAmount: 0, nextTime: 0,
		entity: - 1, entityIndices: null, entities: null,
		velocity: null, avel: null, stage: 0
	};
	effectSlots[ index ] = state;

	switch ( type ) {

		case CE.RAIN:
			state.wait = params.wait ?? 0;
			break;

		case CE.SNOW:
			break;

		case CE.FOUNTAIN:
			state.vforward = new Float32Array( 3 );
			state.vright = new Float32Array( 3 );
			state.vup = new Float32Array( 3 );
			AngleVectors( params.angle ?? [ 0, 0, 0 ], state.vforward, state.vright, state.vup );
			break;

		case CE.QUAKE:
			if ( params.origin ) V_HexenQuakeShake( params.origin, params.radius ?? 0 );
			break;

		case CE.RIDER_DEATH:
			state.stage = 0;
			break;

		case CE.GRAVITYWELL:
			break;

		case CE.TELEPORTERPUFFS: {

			const indices = [];
			let failed = false;
			for ( let i = 0; i < 8; i ++ ) {

				const entIndex = allocEffectEntity();
				if ( entIndex < 0 ) { failed = true; break; }
				indices.push( entIndex );
				const ent = effectEntities[ entIndex ];
				ent.origin.set( params.origin ?? [ 0, 0, 0 ] );
				const angle = i * 45 * Math.PI / 180;
				if ( ! state.velocity ) state.velocity = [];
				state.velocity[ i ] = [ 10 * Math.cos( angle ), 10 * Math.sin( angle ), 0 ];
				ent.model = loadEffectModel( 'models/telesmk2.spr' );
				ent.drawflags = DRF_TRANSLUCENT;

			}
			if ( failed ) {

				for ( const entIndex of indices ) freeEffectEntity( entIndex );
				effectSlots[ index ] = null;
				return null;

			}
			state.entities = indices;
			break;

		}

		case CE.TELEPORTERBODY: {

			const entIndex = allocEffectEntity();
			if ( entIndex < 0 ) { effectSlots[ index ] = null; return null; }
			state.entity = entIndex;
			const ent = effectEntities[ entIndex ];
			ent.origin.set( params.origin ?? [ 0, 0, 0 ] );
			ent.model = loadEffectModel( 'models/teleport.mdl' );
			ent.drawflags = SCALE_TYPE_XYONLY | DRF_TRANSLUCENT;
			ent.scale = 1.0;
			ent.skinnum = params.skinnum ?? 0;
			if ( ! ent.model ) { freeEffectEntity( entIndex ); effectSlots[ index ] = null; return null; }
			break;

		}

		case CE.BONESHARD:
		case CE.BONESHRAPNEL: {

			const entIndex = allocEffectEntity();
			if ( entIndex < 0 ) { effectSlots[ index ] = null; return null; }
			state.entity = entIndex;
			const ent = effectEntities[ entIndex ];
			ent.origin.set( params.origin ?? [ 0, 0, 0 ] );
			ent.model = loadEffectModel( type === CE.BONESHARD ? 'models/boneshot.mdl' : 'models/boneshrd.mdl' );
			if ( ! ent.model ) { freeEffectEntity( entIndex ); effectSlots[ index ] = null; return null; }
			break;

		}

		case CE.CHUNK: {

			let numChunks = Math.min( params.numChunks ?? 0, 16 );
			const aveScale = ( 30 + 100 * ( numChunks / 40.0 ) ) / 100;
			state.numChunks = numChunks;
			state.thingType = params.type ?? 0;
			state.srcVel = params.srcVel ?? [ 0, 0, 0 ];
			state.srcVel = [ state.srcVel[ 0 ], state.srcVel[ 1 ], state.srcVel[ 2 ] ];
			state.velocity = [];
			state.entityIndices = [];
			state.avel = [];
			for ( let i = 0; i < 3; i ++ ) state.avel.push( [ ( Math.random() * 850 | 0 ) - 425, ( Math.random() * 850 | 0 ) - 425, ( Math.random() * 850 | 0 ) - 425 ] );
			let failed = false;
			for ( let i = 0; i < numChunks; i ++ ) {

				const entIndex = allocEffectEntity();
				if ( entIndex < 0 ) { failed = true; break; }
				state.entityIndices.push( entIndex );
				const ent = effectEntities[ entIndex ];
				ent.origin.set( params.origin ?? [ 0, 0, 0 ] );

				const v = [
					state.srcVel[ 0 ] * ( 0.80 + ( Math.random() * 4 | 0 ) / 10.0 ) + ( Math.random() * 140 | 0 ) - 70,
					state.srcVel[ 1 ] * ( 0.80 + ( Math.random() * 4 | 0 ) / 10.0 ) + ( Math.random() * 140 | 0 ) - 70,
					state.srcVel[ 2 ] * ( 0.80 + ( Math.random() * 4 | 0 ) / 10.0 ) + ( Math.random() * 140 | 0 ) - 70
				];
				state.velocity.push( v );

				ent.angles[ 0 ] = Math.random() * 360 | 0;
				ent.angles[ 1 ] = Math.random() * 360 | 0;
				ent.angles[ 2 ] = Math.random() * 360 | 0;
				ent.scale = ( aveScale + ( Math.random() * 40 | 0 ) / 100 );

				const final = ( Math.random() * 100 | 0 ) * 0.01;
				const choice = chunkModel( state.thingType, final );
				ent.model = loadEffectModel( choice.name );
				if ( choice.skin !== undefined ) ent.skinnum = choice.skin;
				if ( choice.frame !== undefined ) ent.frame = choice.frame;
				if ( choice.drawflags ) ent.drawflags |= choice.drawflags;
				if ( choice.abslight !== undefined ) ent.abslight = choice.abslight;

			}
			if ( failed ) {

				for ( const entIndex of state.entityIndices ) freeEffectEntity( entIndex );
				effectSlots[ index ] = null;
				return null;

			}
			state.timeAmount = 4.0;
			break;

		}

		case CE.ONFIRE: {

			const entIndex = allocEffectEntity();
			if ( entIndex < 0 ) { effectSlots[ index ] = null; return null; }
			state.entity = entIndex;
			const ent = effectEntities[ entIndex ];
			ent.origin.set( params.origin ?? [ 0, 0, 0 ] );
			const rdm = Math.random() * 4 | 0;
			const name = rdm < 1 ? 'models/firewal1.spr' : rdm < 2 ? 'models/firewal2.spr' : 'models/firewal3.spr';
			ent.model = loadEffectModel( name );
			ent.drawflags = DRF_TRANSLUCENT;
			ent.abslight = 255;
			ent.frame = params.frame ?? 0;
			if ( ! ent.model ) { freeEffectEntity( entIndex ); effectSlots[ index ] = null; return null; }
			break;

		}

		default:
			if ( SMOKE_TYPES.has( type ) ) {

				const entIndex = allocEffectEntity();
				if ( entIndex < 0 ) { effectSlots[ index ] = null; return null; }
				state.entity = entIndex;
				const ent = effectEntities[ entIndex ];
				ent.origin.set( params.origin ?? [ 0, 0, 0 ] );
				ent.model = loadEffectModel( SMOKE_MODELS[ type ] );
				if ( type !== CE.REDCLOUD && type !== CE.ACID_MUZZFL && type !== CE.FLAMEWALL )
					ent.drawflags = DRF_TRANSLUCENT;
				if ( type === CE.ACID_MUZZFL ) { ent.drawflags = DRF_TRANSLUCENT | MLS_ABSLIGHT; ent.abslight = 51; }
				if ( type === CE.FLAMESTREAM ) { ent.drawflags = DRF_TRANSLUCENT | MLS_ABSLIGHT; ent.abslight = 255; }
				if ( type === CE.GHOST ) { ent.model = loadEffectModel( 'models/ghost.spr' ); ent.drawflags = DRF_TRANSLUCENT | MLS_ABSLIGHT; ent.abslight = 127; }
				if ( type === CE.FLAMESTREAM || type === CE.ONFIRE ) ent.frame = params.frame ?? 0;
				if ( ! ent.model ) { freeEffectEntity( entIndex ); effectSlots[ index ] = null; return null; }
				break;

			}
			if ( EXPLOSION_TYPES.has( type ) ) {

				const entIndex = allocEffectEntity();
				if ( entIndex < 0 ) { effectSlots[ index ] = null; return null; }
				state.entity = entIndex;
				const ent = effectEntities[ entIndex ];
				ent.origin.set( params.origin ?? [ 0, 0, 0 ] );
				if ( type === CE.LSHOCK ) {

					ent.model = loadEffectModel( 'models/vorpshok.mdl' );
					ent.drawflags = MLS_TORCH;
					ent.angles[ 2 ] = 90;
					ent.scale = 2.55;

				} else {

					ent.model = loadEffectModel( EXPLOSION_MODELS[ type ] );
					if ( type === CE.YELLOWRED_FLASH ) ent.drawflags = DRF_TRANSLUCENT;
					if ( type === CE.ACID_EXPL ) { ent.drawflags = MLS_ABSLIGHT; ent.abslight = 255; }

				}
				if ( ! ent.model ) { freeEffectEntity( entIndex ); effectSlots[ index ] = null; return null; }
				break;

			}
			if ( FLASH_TYPES.has( type ) ) {

				const entIndex = allocEffectEntity();
				if ( entIndex < 0 ) { effectSlots[ index ] = null; return null; }
				state.entity = entIndex;
				const ent = effectEntities[ entIndex ];
				ent.origin.set( params.origin ?? [ 0, 0, 0 ] );
				ent.model = loadEffectModel( FLASH_MODELS[ type ] );
				ent.drawflags = DRF_TRANSLUCENT;
				state.reverse = false;
				if ( ! ent.model ) { freeEffectEntity( entIndex ); effectSlots[ index ] = null; return null; }
				break;

			}
			throw new Error( 'CL_ParseEffect: bad type' );

	}

	return state;

}

// The native chunk model/threshold table (uhexen2 cl_effect.c:683-931).
function chunkModel( type, final ) {

	const pick = ( names, thresholds ) => names[ thresholds.findIndex( t => final < t ) ] ?? names[ names.length - 1 ];
	switch ( type ) {

		case THINGTYPE_GLASS:
		case THINGTYPE_REDGLASS:
		case THINGTYPE_CLEARGLASS:
		case THINGTYPE_WEBS: {

			const name = pick( [ 'models/shard1.mdl', 'models/shard2.mdl', 'models/shard3.mdl', 'models/shard4.mdl', 'models/shard5.mdl' ], [ 0.20, 0.40, 0.60, 0.80, 1 ] );
			if ( type === THINGTYPE_CLEARGLASS ) return { name, skin: 1, drawflags: DRF_TRANSLUCENT };
			if ( type === THINGTYPE_REDGLASS ) return { name, skin: 2 };
			if ( type === THINGTYPE_WEBS ) return { name, skin: 3, drawflags: DRF_TRANSLUCENT };
			return { name };

		}
		case THINGTYPE_WOOD:
			return { name: pick( [ 'models/splnter1.mdl', 'models/splnter2.mdl', 'models/splnter3.mdl', 'models/splnter4.mdl' ], [ 0.25, 0.50, 0.75, 1 ] ) };
		case THINGTYPE_METAL:
			return { name: pick( [ 'models/metlchk1.mdl', 'models/metlchk2.mdl', 'models/metlchk3.mdl', 'models/metlchk4.mdl' ], [ 0.25, 0.50, 0.75, 1 ] ) };
		case THINGTYPE_FLESH:
			return { name: pick( [ 'models/flesh1.mdl', 'models/flesh2.mdl', 'models/flesh3.mdl' ], [ 0.33, 0.66, 1 ] ) };
		case THINGTYPE_BROWNSTONE:
			return { name: pick( [ 'models/schunk1.mdl', 'models/schunk2.mdl', 'models/schunk3.mdl', 'models/schunk4.mdl' ], [ 0.25, 0.50, 0.75, 1 ] ), skin: 1 };
		case THINGTYPE_CLAY:
			return { name: pick( [ 'models/clshard1.mdl', 'models/clshard2.mdl', 'models/clshard3.mdl', 'models/clshard4.mdl' ], [ 0.25, 0.50, 0.75, 1 ] ) };
		case THINGTYPE_BONE:
			return { name: pick( [ 'models/clshard1.mdl', 'models/clshard2.mdl', 'models/clshard3.mdl', 'models/clshard4.mdl' ], [ 0.25, 0.50, 0.75, 1 ] ), skin: 1 };
		case THINGTYPE_LEAVES:
			return { name: pick( [ 'models/leafchk1.mdl', 'models/leafchk2.mdl', 'models/leafchk3.mdl' ], [ 0.33, 0.66, 1 ] ) };
		case THINGTYPE_HAY:
			return { name: pick( [ 'models/hay1.mdl', 'models/hay2.mdl', 'models/hay3.mdl' ], [ 0.33, 0.66, 1 ] ) };
		case THINGTYPE_CLOTH:
			return { name: pick( [ 'models/clthchk1.mdl', 'models/clthchk2.mdl', 'models/clthchk3.mdl' ], [ 0.33, 0.66, 1 ] ) };
		case THINGTYPE_WOOD_LEAF:
			return { name: pick( [ 'models/splnter1.mdl', 'models/leafchk1.mdl', 'models/splnter2.mdl', 'models/leafchk2.mdl', 'models/splnter3.mdl', 'models/leafchk3.mdl', 'models/splnter4.mdl' ], [ 0.14, 0.28, 0.42, 0.56, 0.70, 0.84, 1 ] ) };
		case THINGTYPE_WOOD_METAL:
			return { name: pick( [ 'models/splnter1.mdl', 'models/metlchk1.mdl', 'models/splnter2.mdl', 'models/metlchk2.mdl', 'models/splnter3.mdl', 'models/metlchk3.mdl', 'models/splnter4.mdl', 'models/metlchk4.mdl' ], [ 0.125, 0.25, 0.375, 0.50, 0.625, 0.75, 0.875, 1 ] ) };
		case THINGTYPE_WOOD_STONE:
			return { name: pick( [ 'models/splnter1.mdl', 'models/schunk1.mdl', 'models/splnter2.mdl', 'models/schunk2.mdl', 'models/splnter3.mdl', 'models/schunk3.mdl', 'models/splnter4.mdl', 'models/schunk4.mdl' ], [ 0.125, 0.25, 0.375, 0.50, 0.625, 0.75, 0.875, 1 ] ) };
		case THINGTYPE_METAL_STONE:
			return { name: pick( [ 'models/metlchk1.mdl', 'models/schunk1.mdl', 'models/metlchk2.mdl', 'models/schunk2.mdl', 'models/metlchk3.mdl', 'models/schunk3.mdl', 'models/metlchk4.mdl', 'models/schunk4.mdl' ], [ 0.125, 0.25, 0.375, 0.50, 0.625, 0.75, 0.875, 1 ] ) };
		case THINGTYPE_METAL_CLOTH:
			return { name: pick( [ 'models/metlchk1.mdl', 'models/clthchk1.mdl', 'models/metlchk2.mdl', 'models/clthchk2.mdl', 'models/metlchk3.mdl', 'models/clthchk3.mdl', 'models/metlchk4.mdl' ], [ 0.14, 0.28, 0.42, 0.56, 0.70, 0.84, 1 ] ) };
		case THINGTYPE_ICE:
			return { name: 'models/shard.mdl', skin: 0, frame: Math.random() * 2 | 0, drawflags: DRF_TRANSLUCENT | MLS_ABSLIGHT, abslight: 127 };
		case THINGTYPE_METEOR:
			return { name: 'models/tempmetr.mdl', skin: 0 };
		case THINGTYPE_ACID:
			return { name: 'models/sucwp2p.mdl', skin: 0 };
		case THINGTYPE_GREENFLESH:
			return { name: pick( [ 'models/sflesh1.mdl', 'models/sflesh2.mdl', 'models/sflesh3.mdl' ], [ 0.33, 0.66, 1 ] ), skin: 0 };
		default:
			return { name: pick( [ 'models/schunk1.mdl', 'models/schunk2.mdl', 'models/schunk3.mdl', 'models/schunk4.mdl' ], [ 0.25, 0.50, 0.75, 1 ] ), skin: 0 };

	}

}

/*
===============
Hexen2_UpdateEffects

The native CL_UpdateEffects step, called by cl_tent.js after the Quake beams each frame. Rain and snow are volumes
rather than entities; every other type animates its sprite/model at HX_FRAME_TIME and links it into cl_visedicts.
===============
*/
/**
 * Advances every live CE slot by one client frame and appends its entities to the frame's visedict list.
 *
 * @param {number} [frametime] the step; defaults to `cl.time - cl.oldtime` as native does
 */
export function Hexen2_UpdateEffects( frametime = null ) {

	ensureSession();
	if ( frametime === null ) frametime = cl.time - cl.oldtime;
	if ( ! frametime ) return;

	for ( let index = 0; index < MAX_EFFECTS; index ++ ) {

		const state = effectSlots[ index ];
		if ( ! state ) continue;
		const params = state.params;

		switch ( state.type ) {

			case CE.RAIN: {

				const org = [ params.minOrg[ 0 ], params.minOrg[ 1 ], params.maxOrg[ 2 ] ];
				state.nextTime += frametime;
				if ( state.nextTime >= ( state.wait ?? 0 ) ) {

					R_RainEffect( org, params.eSize, params.dir[ 0 ], params.dir[ 1 ], params.color, params.count );
					state.nextTime = 0;

				}
				break;

			}

			case CE.SNOW: {

				const org = params.minOrg, org2 = params.maxOrg;
				const snowOrg = [ ( org[ 0 ] + org2[ 0 ] ) * 0.5, ( org[ 1 ] + org2[ 1 ] ) * 0.5, r_refdef.vieworg[ 2 ] ];
				const dx = snowOrg[ 0 ] - r_refdef.vieworg[ 0 ], dy = snowOrg[ 1 ] - r_refdef.vieworg[ 1 ], dz = snowOrg[ 2 ] - r_refdef.vieworg[ 2 ];
				const distance = Math.sqrt( dx * dx + dy * dy + dz * dz );
				state.nextTime += frametime;
				if ( state.nextTime >= 0.10 && distance < 1024 ) {

					R_SnowEffect( org, org2, params.flags, params.dir, params.count );
					state.nextTime = 0;

				}
				break;

			}

			case CE.FOUNTAIN: {

				const forward = state.vforward, right = state.vright, up = state.vup, movedir = params.movedir;
				const mymin = [
					( - 3 * right[ 0 ] * movedir[ 0 ] + - 3 * forward[ 0 ] * movedir[ 1 ] + 2 * up[ 0 ] * movedir[ 2 ] ) * 15,
					( - 3 * right[ 1 ] * movedir[ 0 ] + - 3 * forward[ 1 ] * movedir[ 1 ] + 2 * up[ 1 ] * movedir[ 2 ] ) * 15,
					( - 3 * right[ 2 ] * movedir[ 0 ] + - 3 * forward[ 2 ] * movedir[ 1 ] + 2 * up[ 2 ] * movedir[ 2 ] ) * 15
				];
				const mymax = [
					( 3 * right[ 0 ] * movedir[ 0 ] + 3 * forward[ 0 ] * movedir[ 1 ] + 10 * up[ 0 ] * movedir[ 2 ] ) * 15,
					( 3 * right[ 1 ] * movedir[ 0 ] + 3 * forward[ 1 ] * movedir[ 1 ] + 10 * up[ 1 ] * movedir[ 2 ] ) * 15,
					( 3 * right[ 2 ] * movedir[ 0 ] + 3 * forward[ 2 ] * movedir[ 1 ] + 10 * up[ 2 ] * movedir[ 2 ] ) * 15
				];
				R_RunParticleEffect2( params.pos, mymin, mymax, params.color, PT.FASTGRAV, params.cnt );
				break;

			}

			case CE.QUAKE:
				R_RunQuakeEffect( params.origin, params.radius );
				V_HexenQuakeShake( params.origin, params.radius );
				break;

			case CE.RIDER_DEATH: {

				state.timeAmount += frametime;
				if ( state.timeAmount >= 1 ) { state.stage ++; state.timeAmount -= 1; }
				const angle = state.timeAmount * 2 * M_PI;
				const org = [ params.origin[ 0 ] + Math.sin( angle ) * 30, params.origin[ 1 ] + Math.cos( angle ) * 30, params.origin[ 2 ] ];
				if ( state.stage <= 6 ) R_RiderParticle( state.stage + 1, org );
				else {

					R_RiderParticle( 0, org );
					if ( state.stage === 7 ) {

						cl.cshifts[ CSHIFT_BONUS ].destcolor[ 0 ] = 255;
						cl.cshifts[ CSHIFT_BONUS ].destcolor[ 1 ] = 255;
						cl.cshifts[ CSHIFT_BONUS ].destcolor[ 2 ] = 255;
						cl.cshifts[ CSHIFT_BONUS ].percent = 256;

					} else if ( state.stage > 13 ) freeEffect( index );

				}
				break;

			}

			case CE.GRAVITYWELL: {

				state.timeAmount += frametime * 2;
				if ( state.timeAmount >= 1 ) state.timeAmount -= 1;
				const angle = state.timeAmount * 2 * M_PI;
				const org = [ params.origin[ 0 ] + Math.sin( angle ) * 30, params.origin[ 1 ] + Math.cos( angle ) * 30, params.origin[ 2 ] ];
				if ( params.lifetime < cl.time ) freeEffect( index );
				else R_GravityWellParticle( Math.random() * 8 | 0, org, params.color );
				break;

			}

			case CE.TELEPORTERPUFFS: {

				state.timeAmount += frametime;
				const first = effectEntities[ state.entities[ 0 ] ];
				while ( state.timeAmount >= HX_FRAME_TIME ) { first.frame ++; state.timeAmount -= HX_FRAME_TIME; }
				const current = first.frame;
				if ( current >= modelFrames( first.model ) ) { freeEffect( index ); break; }
				for ( const entIndex of state.entities ) {

					const ent = effectEntities[ entIndex ];
					const i = state.entities.indexOf( entIndex );
					const velocity = state.velocity[ i ];
					ent.origin[ 0 ] += ( frametime / HX_FRAME_TIME ) * velocity[ 0 ];
					ent.origin[ 1 ] += ( frametime / HX_FRAME_TIME ) * velocity[ 1 ];
					ent.origin[ 2 ] += ( frametime / HX_FRAME_TIME ) * velocity[ 2 ];
					ent.frame = current;
					linkEffectEntity( ent );

				}
				break;

			}

			case CE.TELEPORTERBODY: {

				state.timeAmount += frametime;
				const ent = effectEntities[ state.entity ];
				while ( state.timeAmount >= HX_FRAME_TIME ) { ent.scale -= 0.15; state.timeAmount -= HX_FRAME_TIME; }
				ent.angles[ 1 ] += 45;
				if ( ent.scale <= 0.10 ) freeEffect( index );
				else linkEffectEntity( ent );
				break;

			}

			case CE.BONESHARD:
			case CE.BONESHRAPNEL: {

				state.timeAmount += frametime;
				const ent = effectEntities[ state.entity ];
				const avelocity = params.avelocity ?? [ 0, 0, 0 ];
				ent.angles[ 0 ] += frametime * avelocity[ 0 ];
				ent.angles[ 1 ] += frametime * avelocity[ 1 ];
				ent.angles[ 2 ] += frametime * avelocity[ 2 ];
				const velocity = params.velocity ?? [ 0, 0, 0 ];
				ent.origin[ 0 ] += frametime * velocity[ 0 ];
				ent.origin[ 1 ] += frametime * velocity[ 1 ];
				ent.origin[ 2 ] += frametime * velocity[ 2 ];
				linkEffectEntity( ent );
				break;

			}

			case CE.CHUNK:
				updateChunks( state, frametime );
				if ( state.timeAmount < 0 ) freeEffect( index );
				break;

			default:
				if ( state.type === CE.LSHOCK ) updateLshock( state );
				else if ( SMOKE_TYPES.has( state.type ) ) updateSmoke( state, frametime );
				else if ( EXPLOSION_TYPES.has( state.type ) ) updateExplosion( state, frametime );
				else if ( FLASH_TYPES.has( state.type ) ) updateFlash( state, frametime );
				break;

		}

	}

}


function updateLshock( state ) {

	const ent = effectEntities[ state.entity ];
	if ( ! ent ) return;
	ent.skinnum = ent.skinnum === 0 ? 1 : ent.skinnum === 1 ? 0 : ent.skinnum;
	ent.scale -= 0.10;
	if ( ent.scale <= 0.10 ) freeEffect( state.index );
	else linkEffectEntity( ent );

}

function updateSmoke( state, frametime ) {

	const params = state.params;
	const ent = effectEntities[ state.entity ];
	if ( ! ent ) return;
	state.timeAmount += frametime;
	const smokeTime = params.framelength || HX_FRAME_TIME;
	const velocity = params.velocity ?? [ 0, 0, 0 ];
	ent.origin[ 0 ] += ( frametime / smokeTime ) * velocity[ 0 ];
	ent.origin[ 1 ] += ( frametime / smokeTime ) * velocity[ 1 ];
	ent.origin[ 2 ] += ( frametime / smokeTime ) * velocity[ 2 ];
	while ( state.timeAmount >= smokeTime ) { ent.frame ++; state.timeAmount -= smokeTime; }
	if ( ent.frame >= modelFrames( ent.model ) ) freeEffect( state.index );
	else linkEffectEntity( ent );

}

function updateExplosion( state, frametime ) {

	const ent = effectEntities[ state.entity ];
	if ( ! ent ) return;
	state.timeAmount += frametime;
	const step = state.type === CE.BG_CIRCLE_EXP ? HX_FRAME_TIME * 2 : HX_FRAME_TIME;
	while ( state.timeAmount >= step ) { ent.frame ++; state.timeAmount -= step; }
	if ( ent.frame >= modelFrames( ent.model ) ) freeEffect( state.index );
	else linkEffectEntity( ent );

}

function updateFlash( state, frametime ) {

	const ent = effectEntities[ state.entity ];
	if ( ! ent ) return;
	state.timeAmount += frametime;
	while ( state.timeAmount >= HX_FRAME_TIME ) {

		if ( ! state.reverse ) {

			if ( ent.frame >= modelFrames( ent.model ) - 1 ) { state.reverse = true; ent.frame --; }
			else ent.frame ++;

		} else ent.frame --;
		state.timeAmount -= HX_FRAME_TIME;

	}
	if ( ent.frame <= 0 && state.reverse ) freeEffect( state.index );
	else linkEffectEntity( ent );

}

function updateChunks( state, frametime ) {

	state.timeAmount -= frametime;
	if ( state.timeAmount < 0 ) return;

	for ( let i = 0; i < state.entityIndices.length; i ++ ) {

		const ent = effectEntities[ state.entityIndices[ i ] ];
		const oldorg = [ ent.origin[ 0 ], ent.origin[ 1 ], ent.origin[ 2 ] ];
		const velocity = state.velocity[ i ];
		ent.origin[ 0 ] += frametime * velocity[ 0 ];
		ent.origin[ 1 ] += frametime * velocity[ 1 ];
		ent.origin[ 2 ] += frametime * velocity[ 2 ];

		let moving = true;
		if ( cl.worldmodel ) {

			const leaf = Mod_PointInLeaf( ent.origin, cl.worldmodel );
			if ( leaf && leaf.contents !== CONTENTS_EMPTY ) {

				ent.origin.set( oldorg );
				velocity[ 0 ] = 0; velocity[ 1 ] = 0; velocity[ 2 ] = 0;
				moving = false;

			}

		}
		if ( moving ) {

			const avel = state.avel[ i % 3 ];
			ent.angles[ 0 ] += frametime * avel[ 0 ];
			ent.angles[ 1 ] += frametime * avel[ 1 ];
			ent.angles[ 2 ] += frametime * avel[ 2 ];

		}

		if ( state.timeAmount < frametime * 3 ) ent.scale *= 0.7;
		linkEffectEntity( ent );
		velocity[ 2 ] -= frametime * 500;

		switch ( state.thingType ) {

			case THINGTYPE_FLESH:
				if ( moving ) R_RocketTrail( oldorg, ent.origin, 17 );
				break;
			case THINGTYPE_ICE:
				if ( moving ) R_RocketTrail( oldorg, ent.origin, 8 );
				break;
			case THINGTYPE_ACID:
			case THINGTYPE_GREENFLESH:
				if ( moving ) R_RocketTrail( oldorg, ent.origin, 16 );
				break;
			case THINGTYPE_METEOR:
				R_RocketTrail( oldorg, ent.origin, 1 );
				break;

		}

	}

}

/**
 * The native CE_* types with no entity of their own, for tests and tooling: rain, snow, fountain, quake, rider death and
 * the gravity well.
 *
 * @param {number} type the CE_* type
 * @returns {boolean} true when the type animates server-supplied particle volumes rather than a sprite/model
 */
export function Hexen2_EffectHasNoEntity( type ) {

	return type === CE.RAIN || type === CE.SNOW || type === CE.FOUNTAIN || type === CE.QUAKE ||
		type === CE.RIDER_DEATH || type === CE.GRAVITYWELL;

}

//=============================================================================
// Particle/rain hooks
//=============================================================================

function particleHook( record ) {

	switch ( record.kind ) {

		case 'particle2':
			return R_RunParticleEffect2( record.origin, record.dmin, record.dmax, record.colour, record.effect, record.count );
		case 'particle3':
			return R_RunParticleEffect3( record.origin, record.box, record.colour, record.effect, record.count );
		case 'particle4':
			return R_RunParticleEffect4( record.origin, record.radius, record.colour, record.effect, record.count );
		case 'particle_explosion':
			return R_ColoredParticleExplosion( record.origin, record.colour, record.radius, record.counter );

	}

}

function rainHook( record ) {

	R_RainEffect( record.origin, record.size, record.xDir, record.yDir, record.colour, record.count );

}

//=============================================================================
// Stream records
//=============================================================================

const streams = new Array( MAX_STREAMS ).fill( null );

function newStream( entity, tag ) {

	for ( const stream of streams ) if ( stream && stream.entity === entity && stream.tag === tag ) return stream;
	for ( let i = 0; i < MAX_STREAMS; i ++ ) if ( ! streams[ i ] || streams[ i ].endTime < cl.time ) return streams[ i ] = { slot: i };
	return null;

}

/**
 * Adds or replaces an svc_hexen2_temp_entity stream record, as native ParseStream/NewStream do.
 *
 * @param {object} record the decoded stream (`cl_hexen2.js` CL_Hexen2TempEntity)
 * @returns {boolean} false when all 32 stream slots are busy, as native's "stream list overflow"
 */
export function Hexen2_AddStream( record ) {

	ensureSession();
	const stream = newStream( record.entity, record.tag );
	if ( ! stream ) return false;

	stream.type = record.type;
	stream.tag = record.tag;
	stream.flags = record.flags;
	stream.entity = record.entity;
	stream.skin = record.skin;
	stream.endTime = cl.time + record.duration;
	stream.lastTrailTime = 0;
	stream.source = [ record.source[ 0 ], record.source[ 1 ], record.source[ 2 ] ];
	stream.dest = [ record.dest[ 0 ], record.dest[ 1 ], record.dest[ 2 ] ];
	stream.offset = [ 0, 0, 0 ];
	if ( record.flags & STREAM_ATTACHED && cl_entities[ record.entity ] )
		for ( let i = 0; i < 3; i ++ ) stream.offset[ i ] = record.source[ i ] - cl_entities[ record.entity ].origin[ i ];
	return true;

}

/** @returns {ReadonlyArray<object>} the live stream records (mutable by the temp-entity pass, as native) */
export function Hexen2_LiveStreams() { return Object.freeze( streams.filter( s => s !== null ) ); }

/** Clears every stream record, as native CL_ClearTEnts does. */
export function Hexen2_ClearStreams() { streams.fill( null ); }

//=============================================================================
// Hooks
//=============================================================================

/**
 * Installs this module's presentation hooks. Called at import time and idempotent, so importing cl_tent.js (which does)
 * or this module directly is enough; U9's audio hooks merge in separately.
 */
export function Hexen2_InstallEffects() {

	Hexen2_SetClientHooks( {
		startEffect: record => { Hexen2_StartEffect( record.index, record.type, record.params, record.startedAt ); },
		endEffect: record => { Hexen2_EndEffect( record.index ); },
		particle: particleHook,
		rain: rainHook,
		stream: record => { Hexen2_AddStream( record ); }
	} );

}

Hexen2_InstallEffects();
