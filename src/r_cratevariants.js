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

// faces: [ { mins: [x,y,z], maxs: [x,y,z], normal: [x,y,z] } ] (only the crate sides).
// Returns, for each face, the name of its variant picture or null.
export function R_CratePlan( mapName, faces, odds = CRATE_ODDS ) {

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

	// the crate's corner: its lowest, most west and south point
	const corner = new Map();
	for ( let i = 0; i < n; i ++ ) {

		const r = find( i ), c = corner.get( r ) || [ 1e9, 1e9, 1e9 ];
		for ( let k = 0; k < 3; k ++ ) c[ k ] = Math.min( c[ k ], Math.round( faces[ i ].mins[ k ] ) );
		corner.set( r, c );

	}

	const choice = new Map();
	for ( const [ r, c ] of corner ) {

		const h = hash( mapName + ':' + c.join( ',' ) );
		choice.set( r, h % odds === 0 ? ( ( h >>> 8 ) & 1 ) : - 1 );

	}

	return faces.map( ( f, i ) => {

		const box = choice.get( find( i ) );
		if ( box < 0 ) return null;

		// opposite faces of a crate get the two pictures of the box
		const side = f.normal[ 0 ] * 0.92 + f.normal[ 1 ] * 0.39 >= 0 ? 0 : 1;
		return CRATE_BOXES[ box ][ side ];

	} );

}
