/**
 * @module newer/gameplay/sv_gore
 *
 * Gibs in proportion to a monster's size when it bursts (Newer Game only).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `lastNum`, `lastTime`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Newer Game: a monster bursting scatters gibs and blood in proportion to its size.
//
// The game's own death code (QuakeC) throws a head and three gibs whatever the monster.  When the first
// of them is made, this adds more to make up the size of the monster (a soldier is three times what a
// zombie is, a shambler six), a spray of blood, and tells the client, which leaves a pool where the
// body burst and gives the player the grin of someone who did it.

import { sv, svs } from '../../engine/server/server.js';
import { PR_GetString, pr_global_struct, pr_functions, PROG_TO_EDICT } from '../../engine/progs/progs.js';
import { ED_Alloc, ED_FindFunction, ED_NewString } from '../../engine/progs/pr_edict.js';
import { SV_LinkEdict } from '../../engine/server/world.js';
import { SV_StartParticle } from '../../engine/server/sv_main.js';
import { MSG_WriteByte, MSG_WriteCoord } from '../../engine/common/common.js';
import { svc_temp_entity, TE_GORE } from '../../engine/common/protocol.js';
import { R_NewerGame } from '../render/r_anim.js';
import { SV_AxeGibSeen } from './sv_axecut.js';

// how much a monster bursts: 1 is a zombie (thin), then by size
export const GORE_SIZE = {
	monster_zombie: 1, monster_fish: 1,
	monster_dog: 2, monster_tarbaby: 2,
	monster_army: 3, monster_enforcer: 3, monster_wizard: 3, monster_knight: 3, monster_shalrath: 3,
	monster_demon1: 4, monster_ogre: 4, monster_ogre_marksman: 4, monster_hell_knight: 4,
	monster_shambler: 6,
	monster_boss: 8
};

const GIB_MODEL = /^progs\/(gib[123]|zom_gib|h_)/;
const BLOOD = 73; // the colour of Quake's blood
const GIBS = [ 'progs/gib1.mdl', 'progs/gib2.mdl', 'progs/gib3.mdl' ];

let lastNum = - 1;
let lastTime = - 1;

function modelIndex( name ) {

	for ( let i = 0; i < sv.model_precache.length; i ++ ) {

		if ( sv.model_precache[ i ] == null ) break;
		if ( sv.model_precache[ i ] === name ) return i;

	}

	return - 1;

}

// the gibs' speed, as the game works it out from how far below zero the monster's health went
function velocityForDamage( dm ) {

	const v = [ 100 * ( Math.random() * 2 - 1 ), 100 * ( Math.random() * 2 - 1 ), 200 + 100 * Math.random() ];
	const k = dm > - 50 ? 0.7 : dm > - 200 ? 2 : 10;
	return [ v[ 0 ] * k, v[ 1 ] * k, v[ 2 ] * k ];

}

// called whenever the game sets an entity's model
export function SV_GoreOnSetModel( e, name ) {

	if ( GIB_MODEL.test( name ) === false || pr_global_struct == null ) return;
	if ( svs.maxclients !== 1 || R_NewerGame() === false ) return;

	const self = PROG_TO_EDICT( pr_global_struct.self );
	if ( self == null || self.free ) return;

	const cls = PR_GetString( self.v.classname );
	if ( cls.indexOf( 'monster_' ) !== 0 ) return;

	// once for each monster that bursts (its head and its gibs are all made at once)
	if ( lastNum === self.index && Math.abs( sv.time - lastTime ) < 0.1 ) return;
	lastNum = self.index;
	lastTime = sv.time;

	// the player's doing, unless another monster was the one it was fighting
	const enemy = self.v.enemy;
	if ( enemy !== 0 && enemy !== 1 ) return;

	const size = GORE_SIZE[ cls ] !== undefined ? GORE_SIZE[ cls ] : 2;
	const o = [ self.v.origin[ 0 ], self.v.origin[ 1 ], self.v.origin[ 2 ] ];

	// the rest of the gibs: three for each size over the first
	const fn = ED_FindFunction( 'SUB_Remove' );
	const think = fn !== null ? pr_functions.indexOf( fn ) : 0;
	const dm = self.v.health;
	for ( let k = 0; k < ( size - 1 ) * 3; k ++ ) {

		const name2 = GIBS[ k % 3 ];
		const index = modelIndex( name2 );
		if ( index < 0 ) continue;

		const g = ED_Alloc();
		g.v.origin = [ o[ 0 ], o[ 1 ], o[ 2 ] ];
		g.v.model = ED_NewString( name2 );
		g.v.modelindex = index;
		SV_AxeGibSeen( g, name2 );
		g.v.movetype = 6; // MOVETYPE_BOUNCE
		g.v.solid = 0;
		const vel = velocityForDamage( dm );
		const spread = 1 + 0.08 * size;
		g.v.velocity = [ vel[ 0 ] * spread, vel[ 1 ] * spread, vel[ 2 ] ];
		g.v.avelocity = [ Math.random() * 600, Math.random() * 600, Math.random() * 600 ];
		g.v.think = think;
		g.v.ltime = sv.time;
		g.v.nextthink = sv.time + 10 + Math.random() * 10;
		g.v.frame = 0;
		g.v.flags = 0;
		SV_LinkEdict( g, false );

	}

	// a shower of blood, more for more (never count 255: the client takes that as an exploding box's blast)
	SV_StartParticle( o, [ 0, 0, 1 ], BLOOD, Math.min( 254, 30 * size ) );
	if ( size > 2 ) SV_StartParticle( o, [ 0, 0, 0.5 ], BLOOD, Math.min( 254, 20 * size ) );

	// for the client: the pool (from size 2 up) and the grin
	MSG_WriteByte( sv.datagram, svc_temp_entity );
	MSG_WriteByte( sv.datagram, TE_GORE );
	MSG_WriteCoord( sv.datagram, o[ 0 ] );
	MSG_WriteCoord( sv.datagram, o[ 1 ] );
	MSG_WriteCoord( sv.datagram, o[ 2 ] );
	MSG_WriteByte( sv.datagram, size );

}
