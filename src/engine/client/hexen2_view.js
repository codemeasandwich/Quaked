/**
 * @module engine/client/hexen2_view
 *
 * The Hexen II first-person view for the renderer: the eye origin (player origin plus the gamecode-set `view_ofs`),
 * the view angles, and the punching offset the native client adds for recoil. Pure reads of the player edict, so the
 * camera can be tested independently of WebGL.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; a missing player yields null.
 */

/**
 * The current first-person view.
 *
 * @param {?object} player the client's player edict (its `v` uses the Hexen field layout)
 * @returns {?{ origin: ReadonlyArray<number>, angles: ReadonlyArray<number>, punch: ReadonlyArray<number>,
 *   viewHeight: number }} the eye origin, view angles (pitch, yaw, roll) and view height, or null without a player
 */
export function Hexen2_ViewState( player ) {

	if ( ! player || ! player.v || ! player.v.origin ) return null;
	const v = player.v;
	const viewOfs = v.view_ofs ?? [ 0, 0, 0 ];
	const punch = v.punchangle ?? [ 0, 0, 0 ];
	return Object.freeze( {
		origin: Object.freeze( [ v.origin[ 0 ] + viewOfs[ 0 ], v.origin[ 1 ] + viewOfs[ 1 ], v.origin[ 2 ] + viewOfs[ 2 ] ] ),
		angles: Object.freeze( [ v.v_angle ? v.v_angle[ 0 ] : v.angles[ 0 ], v.v_angle ? v.v_angle[ 1 ] : v.angles[ 1 ], v.v_angle ? v.v_angle[ 2 ] : v.angles[ 2 ] ] ),
		punch: Object.freeze( [ punch[ 0 ], punch[ 1 ], punch[ 2 ] ] ),
		viewHeight: viewOfs[ 2 ]
	} );

}

/**
 * The view angles with the punching recoil applied (native client: viewangles + punchangle, normalised to -180..180
 * pitch and 0..360 yaw).
 *
 * @param {{ angles: ReadonlyArray<number>, punch: ReadonlyArray<number> }} view a view from `Hexen2_ViewState`
 * @returns {ReadonlyArray<number>} pitch, yaw, roll
 */
export function Hexen2_ViewAnglesWithPunch( view ) {

	let pitch = view.angles[ 0 ] + view.punch[ 0 ];
	let yaw = view.angles[ 1 ] + view.punch[ 1 ];
	let roll = view.angles[ 2 ] + view.punch[ 2 ];
	while ( pitch > 180 ) pitch -= 360;
	while ( pitch < - 180 ) pitch += 360;
	yaw = ( ( yaw % 360 ) + 360 ) % 360;
	roll = ( ( roll % 360 ) + 360 ) % 360;
	return Object.freeze( [ pitch, yaw, roll ] );

}
