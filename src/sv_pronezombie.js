// A knocked-down zombie can be finished off (card [40], owner request). Newer Game only; Classic keeps Quake's.
//
// In the stock progs a zombie hit for 25 or more at once falls (zombie_paine1..12). At paine10 it goes SOLID_NOT and lies there:
// paine11 waits 5 seconds and paine12 tries to stand (SOLID_SLIDEBOX and a test move; if something is in the way it goes
// SOLID_NOT again and waits once more). While it is SOLID_NOT nothing can touch it: hitscan traces pass through, missiles fly
// over it, and T_RadiusDamage's findradius skips it. So it always gets up again.
//
// Here, while it lies there, it is a low solid box instead (SOLID_BBOX, from its feet to 12 units up, the size it stood in
// across): shots, nails and missiles hit it, a blast reaches it, and a player still steps over it (a step is 18 units). What a hit
// does is the game's own rule, unchanged: zombie_pain resets its health to 60 on every hit, so only 60 or more at once kills it
// (a rocket or a grenade, a quad blast), and then the game's own zombie_die throws its head and gibs, once, and counts the kill.
// A smaller hit does nothing, as before, and it gets up on time. When it tries to stand, it is given back its standing box and
// SOLID_NOT first, so the game's own stand-up test runs exactly as written; if that fails it lies down again, still hittable.
//
// Everything is the game's own state: solid, mins and maxs are entity fields, saved and loaded with the game. Local single player
// with the stock progs (the frame function names are the game's), Newer Game only.

import { sv, svs } from './server.js';
import { R_NewerGame } from './r_anim.js';
import { pr_crc, pr_functions, pr_global_struct, PR_GetString, PROG_TO_EDICT } from './progs.js';
import { ED_FindFunction } from './pr_edict.js';
import { SV_LinkEdict } from './world.js';

export const SOLID_NOT = 0, SOLID_BBOX = 2;
export const STAND = Object.freeze( { mins: [ - 16, - 16, - 24 ], maxs: [ 16, 16, 40 ] } ); // the zombie's own setsize
export const PRONE = Object.freeze( { mins: [ - 16, - 16, - 24 ], maxs: [ 16, 16, - 12 ] } );

let program = null, lying = null, standing = null;
function functions() {
	if ( program === pr_functions ) return;
	program = pr_functions;
	lying = new Set( [ 'zombie_paine10', 'zombie_paine11', 'zombie_paine12' ].map( n => ED_FindFunction( n ) ).filter( Boolean ) );
	standing = ED_FindFunction( 'zombie_paine12' );
}
export const SV_ProneZombieActive = () => sv.active === true && svs.maxclients === 1 && pr_crc === 24778 && R_NewerGame();
const zombie = e => !! e && ! e.free && e.v.health > 0 && PR_GetString( e.v.classname ) === 'monster_zombie' && PR_GetString( e.v.model ) === 'progs/zombie.mdl';
function box( e, b, solid ) { e.v.mins = b.mins.slice(); e.v.maxs = b.maxs.slice(); for ( let a = 0; a < 3; a ++ ) e.v.size[ a ] = b.maxs[ a ] - b.mins[ a ]; e.v.solid = solid; SV_LinkEdict( e, false ); }
export const SV_ZombieProne = e => zombie( e ) && e.v.solid === SOLID_BBOX && e.v.maxs[ 2 ] === PRONE.maxs[ 2 ];

// QuakeC function hooks (pr_exec.js)
export function SV_ProneZombieEnter( f ) {
	if ( sv.active !== true || svs.maxclients !== 1 || pr_crc !== 24778 ) return null;
	functions();
	if ( ! lying.has( f ) || ! R_NewerGame() ) return null;
	const self = PROG_TO_EDICT( pr_global_struct.self );
	if ( ! zombie( self ) ) return null;
	// standing up: the game's own test, from the state it expects (non-solid, its standing box)
	if ( f === standing && SV_ZombieProne( self ) ) box( self, STAND, SOLID_NOT );
	return { self };
}
export function SV_ProneZombieLeave( token ) {
	if ( ! token ) return;
	const self = token.self;
	// still down (or it could not stand): lying there, hittable
	if ( zombie( self ) && self.v.solid === SOLID_NOT ) box( self, PRONE, SOLID_BBOX );
}
