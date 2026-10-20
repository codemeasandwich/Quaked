/**
 * @module engine/client/hexen2_help_scroll
 *
 * The Hexen II help text as one scroll with sticky section headings. Native Hexen II shows five full-screen pictures
 * (gfx/menu/help01..05.lmp) whose sections run on from one page to the next; Quaked reflows the same text into the
 * pictures' black panel and scrolls it, keeping the heading of the section being read pinned to the top row and the
 * next unseen heading pinned to the bottom row (the first line of each), with the rows next to a pin faded.
 *
 * Types: plain values and functions; no exported classes. A row is `{ text, heading, section }`; a view is
 * `{ scroll, max, pinTop, pinBottom, lines }` (see `Hexen2_HelpView`).
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

/**
 * Clamps a scroll position (the row index shown in the top slot) to the scroll's range.
 *
 * @param {number} scroll the requested first row
 * @param {number} rowCount rows in the scroll
 * @param {number} slots visible rows
 * @returns {number} an integer in 0..max(0, rowCount - slots)
 */
export function Hexen2_HelpClamp( scroll, rowCount, slots ) {

	const max = Math.max( 0, rowCount - slots );
	return Math.min( max, Math.max( 0, Math.trunc( scroll ) || 0 ) );

}

/**
 * What the help panel shows at a scroll position. When the section in the top slot started above it, that section's
 * first heading line is pinned over the top slot; when a later section's heading starts at or below the bottom slot,
 * its first line is pinned over the bottom slot. A pinned slot shows only the pin, and the row next to each pin is
 * faded so the pins read as sticky headers over the scrolling text.
 *
 * @param {{ rows: Array<{ text: string, heading: boolean, section: number }>, starts: Array<number> }} layout from
 *   `Hexen2_HelpRows`
 * @param {number} scroll the first row shown (clamped here)
 * @param {number} slots visible rows, at least 3
 * @returns {{ scroll: number, max: number, pinTop: ?{ text: string, section: number },
 *   pinBottom: ?{ text: string, section: number }, lines: Array<{ slot: number, row: number, faded: boolean }> }}
 *   the clamped scroll, its maximum, the pins and the scrolling rows to draw by slot
 */
export function Hexen2_HelpView( layout, scroll, slots ) {

	const { rows, starts } = layout;
	scroll = Hexen2_HelpClamp( scroll, rows.length, slots );
	const max = Math.max( 0, rows.length - slots );
	if ( ! rows.length ) return { scroll, max, pinTop: null, pinBottom: null, lines: [] };

	const current = rows[ scroll ].section;
	const pinTop = starts[ current ] < scroll ? { text: rows[ starts[ current ] ].text, section: current } : null;
	const last = scroll + slots - 1;
	const next = starts.findIndex( ( start, section ) => section > current && start >= last );
	const pinBottom = next >= 0 ? { text: rows[ starts[ next ] ].text, section: next } : null;

	const lines = [];
	for ( let slot = 0; slot < slots; slot ++ ) {

		const row = scroll + slot;
		if ( row >= rows.length ) break;
		if ( ( pinTop && slot === 0 ) || ( pinBottom && slot === slots - 1 ) ) continue;
		lines.push( { slot, row, faded: ( !! pinTop && slot === 1 ) || ( !! pinBottom && slot === slots - 2 ) } );

	}
	return { scroll, max, pinTop, pinBottom, lines };

}

/**
 * The scroll position that brings a neighbouring section's heading to the top: `direction` -1 goes to the start of
 * the section being read (or the one before when already at its start), +1 to the next section.
 *
 * @param {{ rows: Array<{ section: number }>, starts: Array<number> }} layout from `Hexen2_HelpRows`
 * @param {number} scroll the current first row
 * @param {number} slots visible rows
 * @param {number} direction -1 or +1
 * @returns {number} the new scroll position, clamped
 */
export function Hexen2_HelpJump( layout, scroll, slots, direction ) {

	const { rows, starts } = layout;
	if ( ! rows.length ) return 0;
	scroll = Hexen2_HelpClamp( scroll, rows.length, slots );
	const current = rows[ scroll ].section;
	let target;
	if ( direction < 0 ) target = starts[ current ] < scroll ? starts[ current ] : starts[ Math.max( 0, current - 1 ) ];
	else target = current + 1 < starts.length ? starts[ current + 1 ] : rows.length;
	return Hexen2_HelpClamp( target, rows.length, slots );

}
