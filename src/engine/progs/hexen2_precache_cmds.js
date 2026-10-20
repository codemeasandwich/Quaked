/**
 * @module engine/progs/hexen2_precache_cmds
 *
 * The Hexen II precache and model builtins: `precache_sound`, `precache_model`, their versioned qcc aliases
 * (model2/3/4, sound2/3/4), the no-op `precache_file`, and the puzzle models. They reuse the server's existing
 * `sv.model_precache`/`sv.sound_precache` lists and the port's model loader, so a Hexen spawn function populates the
 * same structures the Quake gamecode does. Numbers are the pinned 114-entry contract; `pr_builtin_table.js` installs
 * this layer with the active profile's one table.
 *
 * Types: plain values and functions; no exported classes.
 * State: none; the server holds the precache lists.
 * Errors: the native program errors for an empty name, an out-of-spawn precache, an overflow or an unprecached model.
 */

import { sv, G_STRING, G_INT, G_INT_SET, G_EDICT, PROG_TO_EDICT, PR_GetString, pr_xfunction, pr_xstatement, pr_global_struct } from './progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_RETURN } from './pr_comp.js';
import { PR_RunError } from './pr_exec.js';
import { ss_loading } from '../server/server.js';
import { SV_SoundLimit } from '../server/sv_main.js';
import { SV_LinkEdict } from '../server/world.js';
import { Mod_ForName } from '../render/gl_model.js';
import { ED_NewString } from './pr_edict.js';

function checkSpawn() {

	if ( sv.state !== ss_loading ) PR_RunError( 'PF_Precache_*: Precache can only be done in spawn functions' );
	if ( ! sv.model_precache ) return false;
	return true;

}

// The existing model list: the name's index, or when allowed the next free slot with the model loaded; -1 otherwise.
function findModel( name, allowAdd ) {

	const limit = Math.min( sv.model_precache.length, 512 ); // MAX_MODELS: the model index is a word
	for ( let i = 0; i < limit; i ++ ) {

		if ( sv.model_precache[ i ] === name ) return i;
		if ( sv.model_precache[ i ] == null ) {

			if ( ! allowAdd ) return - 1;
			sv.model_precache[ i ] = name;
			sv.models[ i ] = Mod_ForName( name, true );
			return i;

		}

	}
	return - 1;

}

// The native setmodel tail: model string/index, the model's bounds, and a relink.
function applyModel( ent, nameOffset, index ) {

	ent.v.model = nameOffset;
	ent.v.modelindex = index;
	const model = sv.models ? sv.models[ index ] : null;
	if ( model ) {

		ent.v.mins = [ model.mins[ 0 ], model.mins[ 1 ], model.mins[ 2 ] ];
		ent.v.maxs = [ model.maxs[ 0 ], model.maxs[ 1 ], model.maxs[ 2 ] ];
		ent.v.size = [ model.maxs[ 0 ] - model.mins[ 0 ], model.maxs[ 1 ] - model.mins[ 1 ], model.maxs[ 2 ] - model.mins[ 2 ] ];

	} else {

		ent.v.mins = [ 0, 0, 0 ]; ent.v.maxs = [ 0, 0, 0 ]; ent.v.size = [ 0, 0, 0 ];

	}
	SV_LinkEdict( ent, false );

}

// #19 precache_sound(name): the existing sound list, limited to the list the server allocated
function precacheSound() {

	const name = G_STRING( OFS_PARM0 );
	G_INT_SET( OFS_RETURN, G_INT( OFS_PARM0 ) );
	if ( name === '' ) PR_RunError( 'PF_precache_sound: empty string' );
	if ( ! checkSpawn() || ! sv.sound_precache ) return;
	const limit = SV_SoundLimit();
	for ( let i = 0; i < limit; i ++ ) {

		if ( sv.sound_precache[ i ] === name ) return;
		if ( sv.sound_precache[ i ] == null ) { sv.sound_precache[ i ] = name; return; }

	}
	PR_RunError( 'PF_precache_sound: overflow' );

}

// #20 precache_model(name) and its qcc variants (#75/#97/#102)
function precacheModel() {

	const name = G_STRING( OFS_PARM0 );
	G_INT_SET( OFS_RETURN, G_INT( OFS_PARM0 ) );
	if ( name === '' ) PR_RunError( 'PF_precache_model: empty string' );
	if ( ! checkSpawn() ) return;
	const limit = Math.min( sv.model_precache.length, 512 ); // MAX_MODELS: the model index is a word
	for ( let i = 0; i < limit; i ++ ) {

		if ( sv.model_precache[ i ] === name ) return;
		if ( sv.model_precache[ i ] == null ) {

			sv.model_precache[ i ] = name;
			sv.models[ i ] = Mod_ForName( name, true );
			return;

		}

	}
	PR_RunError( 'PF_precache_model: overflow' );

}

// #90 precache_puzzle_model(name): the native "models/puzzle/<name>.mdl" model, precached and set on self
function precachePuzzleModel() {

	const ent = PROG_TO_EDICT( pr_global_struct.self ), name = 'models/puzzle/' + G_STRING( OFS_PARM0 ) + '.mdl';
	const index = findModel( name, true );
	if ( index < 0 ) PR_RunError( 'PF_precache_puzzle_model: overflow' );
	applyModel( ent, ED_NewString( name ), index );

}

// #87 setpuzzlemodel(entity, name): the same puzzle model on an explicit entity (and precached on a miss, as native)
function setPuzzleModel() {

	const ent = G_EDICT( OFS_PARM0 ), name = 'models/puzzle/' + G_STRING( OFS_PARM1 ) + '.mdl';
	const index = findModel( name, true );
	if ( index < 0 ) PR_RunError( 'PF_setpuzzlemodel: overflow' );
	applyModel( ent, ED_NewString( name ), index );

}

// #98/#103 precache_file(name): native keeps no separate file table
function precacheFile() { G_INT_SET( OFS_RETURN, G_INT( OFS_PARM0 ) ); }

/** The precache builtins this module installs into the Hexen II dispatcher. */
export const HEXEN2_PRECACHE_BUILTINS = Object.freeze( {
	19: precacheSound, 20: precacheModel, 75: precacheModel, 76: precacheSound,
	87: setPuzzleModel, 90: precachePuzzleModel,
	96: precacheSound, 97: precacheModel, 101: precacheSound, 102: precacheModel,
	98: precacheFile, 103: precacheFile
} );
