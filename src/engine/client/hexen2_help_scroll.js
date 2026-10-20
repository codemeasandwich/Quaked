/**
 * @module engine/client/hexen2_help_scroll
 *
 * The Hexen II help text as one scroll with sticky section headings. Native Hexen II shows five full-screen pictures
 * (gfx/menu/help01..05.lmp) whose sections run on from one page to the next; Quaked reflows the same text into the
 * pictures' black panel and scrolls it, keeping the heading of the section being read pinned to the top row and the
 * next unseen heading pinned to the bottom row (the first line of each); the text fades into the darkness beside a pin.
 *
 * Types: plain values and functions; no exported classes. A row is `{ text, heading, section }`; a view is
 * `{ scroll, max, rows, pinTop, pinBottom }` in menu pixels (see `Hexen2_HelpView`).
 * State: none; the page's scroll position lives in menu_hexen2_help.js.
 * Errors: none raised.
 *
 * Source: the text is transcribed from the help pictures (identical in the full game and the demo; Portal of Praevus
 * keeps the base pictures), wording and spelling as published. The owner approved keeping it in the repository
 * (20 October 2026).
 */

/** The six help sections in native order: the yellow heading and the red body text. */
export const HEXEN2_HELP_SECTIONS = Object.freeze( [
	{ heading: 'Basic movement:', body: 'Use the arrow keys to turn, and move in the direction you are facing. Holding the Shift key down will speed your movement. Press the space bar to crouch. To reconfigure your keys and mouse buttons, press F12 to go to the Customize Keys menu.' },
	{ heading: 'Looking around:', body: 'You can use the A and Z keys to look up and down. A better way to look around is to hold down the ; key and move your mouse around! It is very important to get use to looking around because many enemies come from above and if you want to swim or fly it is a must.' },
	{ heading: 'Jumping, flying, and swimming', body: 'To jump up, press the forward slash "/" key. When you are in water, pressing the forward slash key will make you swim directly up to the surface no matter what direction you are facing-this is a good panic button if you become disoriented in the water. To swim or fly in a certain direction, look in the direction and press the up arrow key to move forward. Don\'t stay underwater for extended periods unless you have the Ring of Water Breathing. When the Ring of Flight is acquired, you will be able to fly for a limited duration. Use the D and C keys to move up and down respectively.' },
	{ heading: 'Inventory system and examine screen:', body: 'Use the [ and ] keys to cycle through your inventory, and press Enter when you have highlighted the artifact that you would like to use. Press the back slash key "\\" to drop your currently selected artifact. Press the Tab key for important information about your character. This screen will show your current stats and puzzle items that you possess. You can also see how well your armor and rings are holding out! Press Q to see a list of current puzzle pieces.' },
	{ heading: 'Opening doors and pushing buttons:', body: 'To open doors and push buttons, merely touch them by moving into them. If a door cannot be opened, there is usually a message stating the reason. Some barriers need keys or puzzle items to get past them. If this is the case, get the item and come back and touch the door. Most of the time, pressing a button will affect an object nearby. If a button affects something not in your current area, a camera will show you what the button has done. Some buttons can be pressed multiple times-you can see them press in, and then come back out, ready for another press.' },
	{ heading: 'Shooting buttons and secret walls:', body: 'Some buttons must be attacked in order to use them. To find secret areas, look for walls that have a texture on them that is different then the surrounding walls, then attack it! Some areas may appear cracked or broken, and this is a sure sign that something is on the other side.' }
] );

/**
 * Word-wraps text to lines of at most `columns` characters; a word longer than a line is split.
 *
 * @param {string} text the text
 * @param {number} columns characters a line, at least 1
 * @returns {Array<string>} the lines, at least one
 */
export function Hexen2_HelpWrap( text, columns ) {

	const lines = [];
	let line = '';
	for ( let word of String( text ).split( /\s+/ ).filter( Boolean ) ) {

		while ( word.length > columns ) {

			if ( line ) { lines.push( line ); line = ''; }
			lines.push( word.slice( 0, columns ) );
			word = word.slice( columns );

		}
		if ( ! line ) line = word;
		else if ( line.length + 1 + word.length <= columns ) line += ' ' + word;
		else { lines.push( line ); line = word; }

	}
	if ( line || ! lines.length ) lines.push( line );
	return lines;

}

/**
 * Lays the sections out as rows of one scroll: each section's wrapped heading rows, then its wrapped body rows.
 *
 * @param {ReadonlyArray<{ heading: string, body: string }>} sections the sections, in order
 * @param {number} columns characters a row
 * @returns {{ rows: Array<{ text: string, heading: boolean, section: number }>, starts: Array<number> }} the rows and
 *   the row index where each section's heading begins
 */
export function Hexen2_HelpRows( sections, columns ) {

	const rows = [], starts = [];
	sections.forEach( ( { heading, body }, section ) => {

		starts.push( rows.length );
		for ( const text of Hexen2_HelpWrap( heading, columns ) ) rows.push( { text, heading: true, section } );
		for ( const text of Hexen2_HelpWrap( body, columns ) ) rows.push( { text, heading: false, section } );

	} );
	return { rows, starts };

}

/** Height of one text row in menu pixels (the 8-pixel character cell). */
export const HEXEN2_HELP_ROW = 8;

/**
 * The furthest the help can scroll: the last row resting in the bottom slot.
 *
 * @param {{ rows: Array<object> }} layout from `Hexen2_HelpRows`
 * @param {number} slots visible rows
 * @returns {number} the maximum scroll in menu pixels
 */
export function Hexen2_HelpMaxScroll( layout, slots ) {

	return Math.max( 0, layout.rows.length - slots ) * HEXEN2_HELP_ROW;

}

/**
 * Clamps a scroll position (menu pixels from the top of the text) to the scroll's range.
 *
 * @param {{ rows: Array<object> }} layout from `Hexen2_HelpRows`
 * @param {number} scroll the requested scroll in menu pixels
 * @param {number} slots visible rows
 * @returns {number} the scroll, within 0..`Hexen2_HelpMaxScroll`
 */
export function Hexen2_HelpClamp( layout, scroll, slots ) {

	return Math.min( Hexen2_HelpMaxScroll( layout, slots ), Math.max( 0, Number( scroll ) || 0 ) );

}

/**
 * What the help panel shows at a pixel scroll. Rows are placed at `y` menu pixels below the panel's text top (partly
 * hidden rows included, for the caller to clip). The section being read has its heading's first line pinned to the top
 * once that heading has scrolled above it, pushed up by the next heading as it arrives (an accordion's sticky
 * header); the first heading still below the panel is pinned to the bottom slot. The caller fades the text into the
 * darkness beside each pin.
 *
 * @param {{ rows: Array<{ text: string, heading: boolean, section: number }>, starts: Array<number> }} layout from
 *   `Hexen2_HelpRows`
 * @param {number} scroll menu pixels from the top of the text (clamped here)
 * @param {number} slots visible rows, at least 3
 * @returns {{ scroll: number, max: number, rows: Array<{ row: number, y: number }>,
 *   pinTop: ?{ text: string, section: number, y: number }, pinBottom: ?{ text: string, section: number, y: number } }}
 */
export function Hexen2_HelpView( layout, scroll, slots ) {

	const { rows, starts } = layout, R = HEXEN2_HELP_ROW;
	scroll = Hexen2_HelpClamp( layout, scroll, slots );
	const max = Hexen2_HelpMaxScroll( layout, slots ), height = slots * R;
	const shown = [];
	for ( let row = Math.floor( scroll / R ); row < rows.length; row ++ ) {

		const y = row * R - scroll;
		if ( y >= height ) break;
		shown.push( { row, y } );

	}
	if ( ! rows.length ) return { scroll, max, rows: shown, pinTop: null, pinBottom: null };

	const current = rows[ Math.min( rows.length - 1, Math.floor( scroll / R ) ) ].section;
	let pinTop = null;
	if ( starts[ current ] * R < scroll ) {

		// the next heading arriving under the pin pushes it up and out
		const next = starts[ current + 1 ], nextY = next === undefined ? Infinity : next * R - scroll;
		pinTop = { text: rows[ starts[ current ] ].text, section: current, y: Math.min( 0, nextY - R ) };

	}
	const bottom = ( slots - 1 ) * R;
	const below = starts.findIndex( start => start * R - scroll > bottom );
	const pinBottom = below >= 0 ? { text: rows[ starts[ below ] ].text, section: below, y: bottom } : null;
	return { scroll, max, rows: shown, pinTop, pinBottom };

}

/**
 * The scroll that brings a neighbouring section's heading to the top: `direction` -1 goes to the start of the section
 * being read (or the one before when already at its start), +1 to the next section.
 *
 * @param {{ rows: Array<{ section: number }>, starts: Array<number> }} layout from `Hexen2_HelpRows`
 * @param {number} scroll the current scroll in menu pixels
 * @param {number} slots visible rows
 * @param {number} direction -1 or +1
 * @returns {number} the new scroll in menu pixels, clamped
 */
export function Hexen2_HelpJump( layout, scroll, slots, direction ) {

	const { rows, starts } = layout, R = HEXEN2_HELP_ROW;
	if ( ! rows.length ) return 0;
	scroll = Hexen2_HelpClamp( layout, scroll, slots );
	const top = Math.round( scroll / R ), current = rows[ Math.min( rows.length - 1, top ) ].section;
	let target;
	if ( direction < 0 ) target = starts[ current ] < top ? starts[ current ] : starts[ Math.max( 0, current - 1 ) ];
	else target = current + 1 < starts.length ? starts[ current + 1 ] : rows.length;
	return Hexen2_HelpClamp( layout, target * R, slots );

}
