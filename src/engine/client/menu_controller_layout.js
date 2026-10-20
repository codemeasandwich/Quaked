/** @module engine/client/menu_controller_layout — pure two-column controller callout layout and family names. */

/** One input per standard button, plus fixed stick axes; anchors come from the retained reference model. */
export const CONTROLLER_INPUTS = Object.freeze( [
	[ 'left-trigger', 6, - 1.79, 'LT' ], [ 'left-bumper', 4, - 1.68, 'LB' ],
	[ 'left-move', null, - 1.27, 'L stick', 'left-axis-z-neg' ], [ 'left-stick', 10, - .48, 'L press' ],
	[ 'back', 8, - .1, 'Back' ], [ 'pad-up', 12, .516, 'D-pad up' ], [ 'pad-left', 14, .9, 'D-pad left' ],
	[ 'pad-right', 15, .9, 'D-pad right' ], [ 'pad-down', 13, 1.284, 'D-pad down' ],
	[ 'right-trigger', 7, - 1.79, 'RT' ], [ 'right-bumper', 5, - 1.68, 'RB' ],
	[ 'button-y', 3, - 1.03, 'Y' ], [ 'button-x', 2, - .6, 'X' ], [ 'button-b', 1, - .6, 'B' ],
	[ 'button-a', 0, - .17, 'A' ], [ 'start', 9, - .1, 'Start' ], [ 'guide', 16, - .1, 'Guide' ],
	[ 'right-look', null, -.05, 'R stick', 'right-axis-z-neg' ], [ 'right-stick', 11, .74, 'R press' ]
].map( ( [ id, index, z, label, anchor ], i ) => Object.freeze( { id, index, z, label, anchor: anchor || id, side: i < 9 ? 'left' : 'right' } ) ) );

/** Returns family-specific positional button names; generic/unknown controllers retain Xbox names. */
export function M_ControllerFamily( id = '' ) {

	if ( /dualsense|dualshock|playstation|054c/i.test( id ) ) return 'playstation';
	if ( /switch|nintendo|pro controller|joy-?con|057e/i.test( id ) ) return 'nintendo';
	return 'xbox';

}

const families = {
	playstation: [ 'Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options' ],
	nintendo: [ 'B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '-', '+' ]
};
/** The printed hardware name at this standard-mapping position. */
export function M_ControllerInputName( input, id ) { return families[ M_ControllerFamily( id ) ]?.[ input.index ] || input.label; }

/**
 * Fits all callouts in two non-overlapping columns, sorted by top-view anchor height. Coordinates are page units;
 * multiplying by the overlay's UI scale gives physical pixels. Native fonts occupy two eight-unit lines per row.
 */
export function M_ControllerLayout( width, height ) {

	const labelWidth = Math.min( 152, Math.floor( width * .30 ) ), top = 32, bottom = height - 24;
	const result = [];
	for ( const side of [ 'left', 'right' ] ) {

		const entries = CONTROLLER_INPUTS.filter( input => input.side === side ).sort( ( a, b ) => a.z - b.z );
		const step = ( bottom - top ) / entries.length;
		for ( let i = 0; i < entries.length; i ++ ) result.push( { ...entries[ i ], x: side === 'left' ? 6 : width - labelWidth - 6,
			y: top + i * step, width: labelWidth, height: Math.min( 16, step ), textScale: Math.min( 1, step / 16 ), lineHeight: Math.min( 8, step / 2 ) } );

	}
	return { labels: result, model: { x: labelWidth + 10, y: top, width: width - 2 * labelWidth - 20, height: bottom - top } };

}
