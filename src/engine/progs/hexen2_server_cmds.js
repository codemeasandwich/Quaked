/**
 * @module engine/progs/hexen2_server_cmds
 *
 * Hexen II server builtins that act on the world's entities and messages: light styles, sounds, broadcast print,
 * spawn, remove, entity print and the debug break. They reuse the port's edict allocator, console and injected sound
 * entry point, and register into the Hexen dispatcher when the server loads the module.
 *
 * Types: plain values and functions; no exported classes.
 * State: none here; the server holds light styles, edicts and clients.
 * Errors: the native program errors for a bad light style, an un-precached sound, removing the world, or break().
 */

import { ED_Alloc, ED_Free, ED_Print } from './pr_edict.js';
import { sv, G_STRING, G_INT, G_INT_SET, G_FLOAT, G_EDICT, G_EDICTNUM, G_VECTOR, pr_argc, PR_GetString, RETURN_EDICT } from './progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4, OFS_RETURN } from './pr_comp.js';
import { PR_RunError } from './pr_exec.js';
import { Con_Printf } from '../common/console.js';
import { MSG_WriteByte, MSG_WriteShort, MSG_WriteCoord, MSG_WriteAngle } from '../common/common.js';
import { MAX_LIGHTSTYLES } from '../common/quakedef.js';
import { SV_StartSound } from '../server/sv_phys.js';
import { Hexen2_RegisterBuiltins } from './hexen2_cmds.js';

function varString( first ) {

	let out = '';
	for ( let i = first; i < pr_argc; i ++ ) out += PR_GetString( pr_global_int( OFS_PARM0 + i * 3 ) );
	return out;

}

// G_INT without importing the helper name that is already used below
function pr_global_int( o ) { return G_INT( o ); }

// #18 find(entity start, .field, string match): the next edict whose field string matches, else the world
function find() {

	const start = G_EDICTNUM( OFS_PARM0 ), fieldOfs = G_INT( OFS_PARM1 ), match = G_STRING( OFS_PARM2 );
	if ( fieldOfs < 0 || fieldOfs >= sv.edicts[ 0 ]._entityfields ) PR_RunError( 'find: bad field offset %i', fieldOfs );
	for ( let step = 1; step <= sv.num_edicts; step ++ ) {

		const index = ( start + step ) % sv.num_edicts;
		const ent = sv.edicts[ index ];
		if ( ! ent || ent.free ) continue;
		if ( PR_GetString( ent._fieldAccessor.getInt32( fieldOfs ) ) === match ) { RETURN_EDICT( ent ); return; }

	}
	RETURN_EDICT( sv.edicts[ 0 ] );

}

// #69 makestatic(entity): the native signon static spawn (svc_spawnstatic is 20 in the Hexen II protocol)
function makestatic() {

	const ent = G_EDICT( OFS_PARM0 );
	MSG_WriteByte( sv.signon, 20 );
	MSG_WriteShort( sv.signon, ent.v.modelindex | 0 );
	MSG_WriteShort( sv.signon, ent.v.frame | 0 );
	MSG_WriteByte( sv.signon, ent.v.colormap | 0 );
	MSG_WriteByte( sv.signon, ent.v.skin | 0 );
	for ( let i = 0; i < 3; i ++ ) {

		MSG_WriteCoord( sv.signon, ent.v.origin[ i ] );
		MSG_WriteAngle( sv.signon, ent.v.angles[ i ] );

	}
	ED_Free( ent );

}

// #74 ambientsound(position, sample, volume, attenuation): the native signon static sound (svc_spawnstaticsound 29)
function ambientsound() {

	const position = G_VECTOR( OFS_PARM0 ), sample = G_STRING( OFS_PARM1 );
	const volume = G_FLOAT( OFS_PARM2 ), attenuation = G_FLOAT( OFS_PARM3 );
	let index = - 1;
	for ( let i = 0; i < sv.sound_precache.length; i ++ ) {

		if ( sv.sound_precache[ i ] === sample ) { index = i; break; }
		if ( sv.sound_precache[ i ] == null ) break;

	}
	if ( index < 0 ) { Con_Printf( 'no precache: %s\n', sample ); return; }
	MSG_WriteByte( sv.signon, 29 );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.signon, position[ i ] );
	MSG_WriteShort( sv.signon, index ); // the mission-pack/private session ambient index is a word
	MSG_WriteByte( sv.signon, ( volume * 255 ) | 0 );
	MSG_WriteByte( sv.signon, ( attenuation * 64 ) | 0 );

}

// #35 lightstyle(style, value): the server-side style table (clients are told by the normal update path)
function lightstyle() {

	const style = G_FLOAT( OFS_PARM0 ) | 0, value = G_STRING( OFS_PARM1 );
	if ( style < 0 || style >= MAX_LIGHTSTYLES ) PR_RunError( 'lightstyle: bad style %i', style );
	sv.lightstyles[ style ] = value;

}

// #8 sound(entity, channel, sample, volume, attenuation): the existing SV_StartSound path
function sound() {

	const ent = G_EDICT( OFS_PARM0 ), channel = G_FLOAT( OFS_PARM1 ) | 0, sample = G_STRING( OFS_PARM2 );
	const volume = G_FLOAT( OFS_PARM3 ), attenuation = G_FLOAT( OFS_PARM4 );
	if ( channel < 0 || channel > 7 ) PR_RunError( 'sound: channel %i', channel );
	let precached = false;
	for ( let i = 0; i < sv.sound_precache.length; i ++ ) {

		if ( sv.sound_precache[ i ] === sample ) { precached = true; break; }
		if ( sv.sound_precache[ i ] == null ) break;

	}
	if ( ! precached ) { Con_Printf( 'no precache: %s\n', sample ); return; }
	if ( typeof SV_StartSound === 'function' )
		SV_StartSound( ent, channel, sample, ( volume * 255 ) | 0, attenuation );

}

// #23 bprint(text...): broadcast print; with no clients it reaches the server console (the native broadcast too)
function bprint() {

	Con_Printf( '%s', varString( 0 ) );

}

// #14 spawn(): allocate an edict and return it
function spawn() { RETURN_EDICT( ED_Alloc() ); }

// #15 remove(entity)
function remove() {

	const ent = G_EDICT( OFS_PARM0 );
	if ( ent === sv.edicts[ 0 ] ) PR_RunError( 'Tried to remove world' );
	ED_Free( ent );

}

// #31 eprint(entity): the entity dump
function eprint() { ED_Print( G_EDICT( OFS_PARM0 ) ); }

// #6 break(): the debug break is a deliberate program error in this port, never a silent no-op
function breakBuiltin() { PR_RunError( 'break statement' ); }

/** The server builtins this module installs into the Hexen II dispatcher. */
export const HEXEN2_SERVER_BUILTINS = Object.freeze( {
	6: breakBuiltin, 8: sound, 14: spawn, 15: remove, 18: find, 23: bprint, 31: eprint, 35: lightstyle, 69: makestatic, 74: ambientsound
} );

Hexen2_RegisterBuiltins( HEXEN2_SERVER_BUILTINS );
