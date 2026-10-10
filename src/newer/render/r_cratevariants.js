/**
 * @module newer/render/r_cratevariants
 *
 * Rare crate pictures: once in 40 a crate wears a different picture, the same on all its sides.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `sessionSeed`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Rare variants of the crate sides (Newer Game): once in 40 a crate wears a different picture,
// chosen per crate and not per wall face, so its sides agree with each other.
//
// There are two boxes.  Each box has two pictures, one for one side of a crate and one for the
// opposite side:
//   box 1  Dharma                    | the same steel with a Half-Life graffiti
//   box 2  SCP                       | SCP with a Half-Life graffiti
//
// A crate is the faces that touch each other and use crate0_side or crate1_side.  Which crates
// change, and how, is worked out from the level's name and where the crate stands, so it is the same
// every time the level is played (and from every side of a level crossing).

export const CRATE_ODDS = 40;
export const CRATE_BOXES = [
	[ 'crate_dharma', 'crate_dharma_hl' ],
	[ 'crate_scp', 'crate_scp_hl' ]
];

// more ordinary pictures: a crate whose faces are all whole picks from these and its own, all four
// sides alike
export const CRATE_COMMON = [ 'crate_eagle', 'crate_bolt', 'crate_skull' ];

// chosen afresh each time the game starts (each page load), and kept for the whole session so
// a level looks the same on every visit and from both sides of a level crossing
let sessionSeed = ( Math.random() * 0xffffffff ) >>> 0;

/**
 * Replaces the session seed that `R_CratePlan` mixes into every crate's choice (normally chosen at random once per
 * page load and kept for the session). Used by tests to make plans repeatable; takes effect from the next map load.
 *
 * @param {number} seed any number; truncated to an unsigned 32-bit integer
 */
export function R_CrateSetSeed( seed ) {

	sessionSeed = seed >>> 0;

}

/**
 * Whether a wall texture is a crate side that may wear a variant picture. Called for each surface by
 * `Mod_CrateVariants` (gl_model.js, through the hook table) while a brush model loads.
 *
 * @param {string} name the BSP texture name
 * @returns {boolean} true for `crate<digit>_side` (crate0_side, crate1_side)
 */
export function R_IsCrateSide( name ) {

	return /^crate\d_side$/.test( name );

}

function hash( s ) {

	let h = 2166136261;
	for ( let i = 0; i < s.length; i ++ ) h = Math.imul( h ^ s.charCodeAt( i ), 16777619 );
	h ^= h >>> 15;
	h = Math.imul( h, 0x85ebca6b );
	h ^= h >>> 13;
	return h >>> 0;

}

/**
 * Chooses a picture for every crate side of one brush model, at model load from `Mod_CrateVariants` (gl_model.js,
 * through the hook table; only in Newer Game with `r_newer_textures` on and `r_newer_crates` ≥ 1). Faces whose boxes
 * meet (within 2 units) form one crate; each 64-unit crate, named by its lowest corner, is chosen by itself from a
 * hash of the session seed, the map name and that corner, so the result is the same on every visit in a session.
 * One crate in `odds` gets a rare box (its opposite faces get the box's two pictures); the rest keep their own picture
 * or take one of `common`, all sides alike.
 *
 * @param {string} mapName the model's name (e.g. `maps/e1m1.bsp`), part of the hash
 * @param {Array<{ mins: Array<number>, maxs: Array<number>, normal: Array<number>, whole: boolean }>} faces only the
 *   crate sides: bounds in Quake units (model space) and the outward face normal. `whole` is whether the face shows
 *   exactly one whole picture (the picture's size, starting on its edge). A crate with a face that does not (a half
 *   crate, a crate set off the grid) keeps its ordinary picture, because a picture with a sign in the middle only
 *   looks right whole.
 * @param {number} [odds=CRATE_ODDS] one crate in this many gets a rare box (from `r_newer_crates`); must be ≥ 1
 * @param {Array<string>} [common=CRATE_COMMON] the ordinary alternative pictures (empty: none)
 * @returns {Array<?string>} for each face, in order, the texture name of its variant picture, or null to keep its own
 */
export function R_CratePlan( mapName, faces, odds = CRATE_ODDS, common = CRATE_COMMON ) {

	const n = faces.length;
	const parent = faces.map( ( _, i ) => i );
	const find = ( i ) => {

		while ( parent[ i ] !== i ) {

			parent[ i ] = parent[ parent[ i ] ];
			i = parent[ i ];

		}

		return i;

	};

	// faces that touch (their boxes meet, with a little margin) are one crate
	const M = 2;
	for ( let i = 0; i < n; i ++ ) {

		for ( let j = i + 1; j < n; j ++ ) {

			const a = faces[ i ], b = faces[ j ];
			if ( a.mins[ 0 ] - M <= b.maxs[ 0 ] && b.mins[ 0 ] - M <= a.maxs[ 0 ]
				&& a.mins[ 1 ] - M <= b.maxs[ 1 ] && b.mins[ 1 ] - M <= a.maxs[ 1 ]
				&& a.mins[ 2 ] - M <= b.maxs[ 2 ] && b.mins[ 2 ] - M <= a.maxs[ 2 ] ) parent[ find( j ) ] = find( i );

		}

	}

	// a cluster with a face that is not one whole picture (a half crate, a tall crate) stays as it is
	const broken = new Set();
	for ( let i = 0; i < n; i ++ ) if ( faces[ i ].whole === false ) broken.add( find( i ) );

	// each crate is chosen by itself, so stacked and neighbouring crates differ: a face belongs to the
	// crate that stands behind it (a crate is 64 across), named by that crate's lowest corner
	const choice = new Map();
	const crateOf = ( f ) => {

		const axis = Math.abs( f.normal[ 0 ] ) > 0.5 ? 0 : Math.abs( f.normal[ 1 ] ) > 0.5 ? 1 : 2;
		const c = [ Math.round( f.mins[ 0 ] ), Math.round( f.mins[ 1 ] ), Math.round( f.mins[ 2 ] ) ];
		if ( f.normal[ axis ] > 0 ) c[ axis ] -= 64;
		return c.join( ',' );

	};

	const pick = ( c ) => {

		let v = choice.get( c );
		if ( v !== undefined ) return v;

		const key = sessionSeed + ':' + mapName + ':' + c;
		const h = hash( key );
		if ( h % odds === 0 ) {

			v = ( h >>> 8 ) & 1;

		} else {

			// an ordinary one: its own picture, or one of the others
			const k = common.length > 0 ? hash( 'common:' + key ) % ( common.length + 1 ) : 0;
			v = k === 0 ? - 1 : - 2 - ( k - 1 );

		}

		choice.set( c, v );
		return v;

	};

	return faces.map( ( f, i ) => {

		if ( broken.has( find( i ) ) ) return null;
		const box = pick( crateOf( f ) );
		if ( box === - 1 ) return null;
		if ( box <= - 2 ) return common[ - 2 - box ];

		// opposite faces of a crate get the two pictures of the box
		const side = f.normal[ 0 ] * 0.92 + f.normal[ 1 ] * 0.39 >= 0 ? 0 : 1;
		return CRATE_BOXES[ box ][ side ];

	} );

}
