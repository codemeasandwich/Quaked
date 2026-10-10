// Getting the next level ready before the player leaves for it.
//
// Loading a level is mostly work, not waiting: the game's files are already in memory,
// and what takes the time is turning them into a level: reading its map (tens of
// milliseconds), making a relief map for every one of its textures (a quarter of a
// second), fetching and decoding our own textures, and loading the models of its
// monsters and items.  Much of that only needs the level's files, so it can be done
// early, a little each frame, while the player walks towards an exit.  What is made is
// kept (the relief maps by picture, the decoded textures by name, the models by name),
// so the real load finds it done and only has to put the level together.

import { Mod_LoadForPreview } from './engine/render/gl_model.js';
import { R_NormalMapFor } from './gl_normals.js';
import { R_NewerTexturesForModel, R_NewerTextureSettled } from './r_newertextures.js';
import { R_LevelEntities } from './newer/render/r_levelents.js';
import { Cvar_VariableValue } from './engine/common/cvar.js';

const warm = new Map(); // map name -> { step, model, models, textures }
let current = null; // the one being worked on
const FRAME_BUDGET = 3; // milliseconds a frame goes on this

export function R_WarmLevel( mapName ) {

	if ( warm.has( mapName ) ) return;

	// only a few are kept ready; the oldest go
	if ( warm.size >= 3 ) warm.delete( warm.keys().next().value );

	warm.set( mapName, { name: mapName, step: 'model', model: null, models: [], textures: [] } );

}

export function R_WarmForget() {

	warm.clear();
	current = null;

}

export function R_WarmPending() {

	for ( const w of warm.values() ) if ( w.step !== 'done' ) return true;
	return false;

}

// once a frame: a little of the next thing to do, within a few milliseconds
export function R_WarmFrame( budget = FRAME_BUDGET ) {

	if ( current === null || current.step === 'done' ) {

		current = null;
		for ( const w of warm.values() ) if ( w.step !== 'done' ) { current = w; break; }
		if ( current === null ) return;

	}

	const w = current;
	const end = performance.now() + budget;

	do {

		if ( w.step === 'model' ) {

			// the level itself: its map and textures
			w.model = Mod_LoadForPreview( 'maps/' + w.name + '.bsp' );
			if ( w.model == null ) { w.step = 'done'; return; }

			// (a level's own textures, ours, are fetched and decoded now)
			R_NewerTexturesForModel( w.model );

			w.textures = ( w.model.textures || [] ).filter( ( t ) => t != null && t.gl_texture != null && t.name.charAt( 0 ) !== '*' && t.name.slice( 0, 3 ) !== 'sky' );

			// the models of its monsters and items
			const seen = new Set();
			for ( const e of R_LevelEntities( w.model.entities, null, w.model.submodels, Cvar_VariableValue( 'skill' ) ) ) {

				if ( e.kind === 'brush' || seen.has( e.model ) ) continue;
				seen.add( e.model );
				w.models.push( e.model );

			}

			w.step = 'models';
			w.since = performance.now();

		} else if ( w.step === 'models' ) {

			if ( w.models.length === 0 ) { w.step = 'normals'; continue; }
			Mod_LoadForPreview( w.models.shift() );

		} else if ( w.step === 'normals' ) {

			if ( w.textures.length === 0 ) { w.step = 'done'; return; }

			// the relief map of the texture as it will be (our picture, once it has arrived)
			// is what is worth making: one whose picture is still on its way waits
			const at = w.textures.findIndex( ( t ) => R_NewerTextureSettled( t.name, t.gl_texture ) );
			if ( at < 0 ) {

				if ( performance.now() - w.since < 10000 ) return; // (a picture that never comes is not waited for)
				R_NormalMapFor( w.textures.shift().gl_texture );

			} else {

				R_NormalMapFor( w.textures.splice( at, 1 )[ 0 ].gl_texture );

			}

		} else {

			return;

		}

	} while ( performance.now() < end );

}
