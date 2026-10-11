/**
 * @module newer/render/quadvision_region
 *
 * Which monsters Quad's through-wall vision may reveal: not those waiting in monster closets (owner request 11 Oct
 * 2026, card [QV1]).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `edicts`, `closets`.
 *
 * Errors: catches at 1 place.
 */
// Quake levels keep monsters for ambushes in "monster closets": rooms outside the playable level from which a
// trigger_teleport sends them in when the level's own trigger uses it. Quad's vision draws every living monster through
// walls (r_quadvision.js), so it showed those too and gave the ambushes away. The owner's rule: only monsters actually
// in the level, active or not, are revealed.
//
// A closet's teleporter is a trigger_teleport with a targetname: QuakeC teleport_touch works for it only for 0.2 s after
// the level's trigger uses it, so whatever stands in it is waiting to be sent in. A monster whose box overlaps such a
// teleporter is in a closet and is not revealed; once teleported out it is in the level and is. A level's ordinary
// teleporters have no targetname. Monsters behind closed doors are in the level and are revealed.
//
// Checked against every id1 map (the shareware episode in tests/quadvision_closets_native_test.js, the registered
// game's 23 maps in a one-off scan of 1091 monsters): no monster in the level is hidden and none waiting in a closet is
// shown. A sealed-region test (the leaves joined to the player's through the visibility data) was tried as well and
// hid nothing more on any of those maps, so it was left out.
import { PR_GetString } from '../../engine/progs/progs.js';

let edicts = null, closets = []; // the edict list the boxes were read from; the closet teleporters' [ absmin, absmax ]

const text = n => { try { return n ? PR_GetString( n ) : ''; } catch { return ''; } };

/**
 * A test for "this monster is not waiting in a monster closet". The closet teleporters are read once per edict list
 * (each server spawn builds a new one); they are brush triggers and do not move.
 *
 * @param {{ edicts: Array<Object> }} server the server state (`sv`)
 * @returns {function(Object): boolean} given an edict (`v.absmin`, `v.absmax`), false when its box overlaps a closet's
 *   teleporter; true otherwise, and for an edict without a box
 */
export function QuadVisionRegion( server ) {

	const list = server?.edicts;
	if ( ! Array.isArray( list ) ) return () => true;
	if ( list !== edicts ) {

		edicts = list; closets = [];
		for ( const e of list )
			if ( e && ! e.free && e.v.absmin != null && text( e.v.classname ) === 'trigger_teleport' && text( e.v.targetname ) !== '' )
				closets.push( [ Array.from( e.v.absmin ), Array.from( e.v.absmax ) ] );

	}
	const boxes = closets;
	return e => {

		const lo = e.v.absmin, hi = e.v.absmax;
		if ( lo == null || hi == null ) return true;
		for ( const [ a, b ] of boxes ) if ( lo[ 0 ] <= b[ 0 ] && hi[ 0 ] >= a[ 0 ] && lo[ 1 ] <= b[ 1 ] && hi[ 1 ] >= a[ 1 ] && lo[ 2 ] <= b[ 2 ] && hi[ 2 ] >= a[ 2 ] ) return false;
		return true;

	};

}

/**
 * Forgets the closets read: the next `QuadVisionRegion` reads them again.
 */
export function QuadVisionRegionReset() { edicts = null; closets = []; }
