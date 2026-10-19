/**
 * @module newer/sound/s_lava
 *
 * Lava you can hear, item 4 of the add-on effects for every game (card T-3faa98e3, docs/lava-ambient-2026-10-14.md):
 * Quake's sound system has always had a lava ambient channel, faded by how near each leaf of the map is to lava, but
 * never gave it a sound. In Newer Game it plays `ambience/lava1.wav`: the game's own file where it has one
 * (Dimension of the Machine, Soul of Evil), otherwise the engine's made one (s_synth.js), through the ordinary sound
 * cache and mixer (S_SetLavaAmbient, snd_dma.js). Its loudness in each leaf is the map's own lava level, as the map
 * compiler's vis stored it; the 1996 maps were compiled without lava levels, so for a map that has lava but no levels
 * they are worked out the way vis works them out (R_LavaLevelsFill).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `leaves` (the map load whose levels were last looked at), `hasLava`,
 * `filled`, `sound`.
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl } from '../../engine/client/client.js';
import { Mod_LeafPVS } from '../../engine/render/gl_model.js';
import { S_PrecacheSound, S_SetLavaAmbient } from '../../engine/sound/snd_dma.js';
import { S_RegisterSoundFallback } from '../../engine/sound/snd_mem.js';
import { AMBIENT_LAVA } from '../../engine/sound/sound.js';
import { R_NewerGame } from '../mode.js';
import { SYNTH_Sound } from './s_synth.js';
import { NewerBindings } from '../content_bindings.js';

/** Lava you can hear: 0 off, 1 on (saved; Options, Newer features). */
export const s_lava = new cvar_t( 's_lava', '1', true );

/** Quake's lava sound, by Dimension of the Machine's name for it; kept as the old public constant. The live name is the
 * active game's binding (`content_bindings.js`), e.g. Hexen's `ambience/lava.wav`. */
export const LAVA_SOUND = 'ambience/lava1.wav';

let leaves = null, hasLava = false, filled = 0, sound = null;

const isLava = surf => /^\*lava/i.test( surf?.texinfo?.texture?.name ?? '' );

/**
 * Fills in the lava ambient levels of a map that has lava surfaces but no stored lava levels, as the map compiler's
 * vis (CalcAmbientSounds) works them out: for each leaf, the nearest lava surface among the leaves it can see,
 * measured from the leaf's box to the surface's corners as vis measures it (how far outside the box each corner lies,
 * added up along the three axes); 255 within 100 units, falling to 0 at 500. A map with any
 * stored lava level is left exactly as it is.
 *
 * @param {?object} model the world model
 * @returns {number} how many leaves were given a level (0 when nothing was filled)
 */
export function R_LavaLevelsFill( model ) {

	const leafs = model?.leafs;
	if ( ! leafs || leafs.length < 2 ) return 0;
	// a map with any lava level of its own is left as it is (and costs no more than this look)
	for ( let i = 1; i < leafs.length; i ++ ) if ( leafs[ i ].ambient_sound_level?.[ AMBIENT_LAVA ] > 0 ) return 0;
	const lavaLeaves = [];
	for ( let i = 1; i < leafs.length; i ++ ) {

		const l = leafs[ i ];
		const points = [];
		const marks = l.firstmarksurface ?? [];
		for ( let k = 0; k < ( l.nummarksurfaces ?? marks.length ); k ++ ) {

			const surf = marks[ k ];
			if ( ! isLava( surf ) ) continue;
			for ( let p = surf.polys; p; p = p.next ) for ( const v of p.verts ?? [] ) points.push( v[ 0 ], v[ 1 ], v[ 2 ] );

		}
		if ( points.length ) lavaLeaves.push( { index: i, points } );

	}
	if ( lavaLeaves.length === 0 ) return 0;
	let count = 0;
	for ( let i = 1; i < leafs.length; i ++ ) {

		const l = leafs[ i ], box = l.minmaxs;
		if ( ! l.ambient_sound_level || ! box || l.contents === - 2 ) continue;
		const vis = Mod_LeafPVS( l, model );
		let nearest = Infinity;
		for ( const lava of lavaLeaves ) {

			const bit = lava.index - 1;
			if ( lava.index !== i && ! ( vis[ bit >> 3 ] & ( 1 << ( bit & 7 ) ) ) ) continue;
			const pts = lava.points;
			for ( let p = 0; p < pts.length && nearest > 0; p += 3 ) {

				let d = 0;
				for ( let a = 0; a < 3; a ++ ) { const v = pts[ p + a ]; if ( v > box[ a + 3 ] ) d += v - box[ a + 3 ]; else if ( v < box[ a ] ) d += box[ a ] - v; }
				if ( d < nearest ) nearest = d;

			}

		}
		if ( nearest === Infinity ) continue;
		const vol = nearest < 100 ? 1 : Math.max( 0, 1 - nearest * 0.002 );
		const level = Math.round( vol * 255 );
		if ( level > 0 ) { l.ambient_sound_level[ AMBIENT_LAVA ] = level; count ++; }

	}
	return count;

}

// the map's levels, looked at once per load of the map (and filled in when it needs it): a restart of the same map
// keeps its model but loads its leaves again, without the filled levels, so the leaves are what is remembered
function look() {

	const world = cl.worldmodel;
	if ( leaves === ( world?.leafs ?? null ) ) return;
	leaves = world?.leafs ?? null; filled = 0; hasLava = false; sound = null;
	if ( ! leaves ) return;
	filled = R_LavaLevelsFill( world );
	for ( let i = 1; i < leaves.length && ! hasLava; i ++ ) if ( leaves[ i ].ambient_sound_level?.[ AMBIENT_LAVA ] > 0 ) hasLava = true;

}

/**
 * The lava channel's sound now: the lava's sound in Newer Game with `s_lava` on, on a map with lava levels; else null
 * (the channel fades out, as it always was). Called each frame by the sound system's ambient update.
 *
 * @returns {?object} the sound (`sfx_t`), or null
 */
export function S_LavaAmbient() {

	if ( ! R_NewerGame() || ! ( s_lava.value > 0 ) || ! cl.worldmodel ) return null;
	look();
	if ( ! hasLava ) return null;
	// (looked up once per map load; a sound restart, which forgets every sound, comes with a new map)
	sound ??= S_PrecacheSound( NewerBindings().sounds.lava );
	return sound;

}

/**
 * What this module knows of the current map, for tests and trials.
 *
 * @returns {{ hasLava: boolean, filled: number }} whether the map has lava levels, and how many leaves were filled in
 */
export function S_LavaSnapshot() { look(); return { hasLava, filled }; }

S_SetLavaAmbient( S_LavaAmbient );
// the made sounds are for Newer Game's effects only: in New Game a missing sound stays missing, as always
S_RegisterSoundFallback( name => R_NewerGame() ? SYNTH_Sound( name ) : null );
