/**
 * @module engine/client/hexen2_menu
 *
 * The in-game Hexen II pause menu model and its small DOM host: Resume, Inventory, Character and Options, plus the
 * stable panel/key model the page tests without a browser. The page draws the native HUD underneath; this menu is the
 * keyboard/pointer overlay, not a Quake menu screen.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports (the DOM host keeps its own closure).
 * Errors: none raised for missing HUD/cvars; absent values render as `-`.
 */

/** The menu panels, in the order Escape/back returns. */
export const HEXEN2_MENU_PANELS = Object.freeze( [ 'main', 'inventory', 'character', 'options' ] );

const CLASS_NAMES = Object.freeze( { 1: 'Paladin', 2: 'Crusader', 3: 'Necromancer', 4: 'Assassin', 5: 'Succubus' } );

function value( v ) { return typeof v === 'number' && Number.isFinite( v ) ? Math.round( v ) : '-'; }

/**
 * The class name for a native `playerclass` number.
 *
 * @param {number} playerClass 1..5, or 0/unknown
 * @returns {string} the name, or `Class <n>`/`Unknown`
 */
export function Hexen2_ClassName( playerClass ) {

	return CLASS_NAMES[ playerClass | 0 ] ?? ( ( playerClass | 0 ) > 0 ? `Class ${playerClass | 0}` : 'Unknown' );

}

/**
 * The selectable items of a panel. `Options` items adjust with Left/Right; the others activate with Enter.
 *
 * @param {string} panel one of HEXEN2_MENU_PANELS
 * @param {{ volume?: number, sensitivity?: number }} [values] the current presentation values
 * @returns {ReadonlyArray<{ id: string, label: string, value?: string, adjust?: boolean }>} the items
 */
export function Hexen2_MenuItems( panel, values = {} ) {

	if ( panel === 'inventory' || panel === 'character' ) return Object.freeze( [ { id: 'back', label: 'Back' } ] );
	if ( panel === 'options' ) return Object.freeze( [
		{ id: 'volume', label: 'Sound volume', value: value( values.volume ?? 1 ), adjust: true },
		{ id: 'sensitivity', label: 'Mouse sensitivity', value: value( values.sensitivity ?? 5 ), adjust: true },
		{ id: 'back', label: 'Back' }
	] );
	return Object.freeze( [
		{ id: 'resume', label: 'Resume' },
		{ id: 'inventory', label: 'Inventory' },
		{ id: 'character', label: 'Character' },
		{ id: 'options', label: 'Options' },
		{ id: 'save', label: 'Save game' },
		{ id: 'load', label: 'Load game' },
		{ id: 'newgame', label: 'New game / change class' },
		{ id: 'quit', label: 'Quit to shelf' }
	] );

}

/**
 * Moves a menu cursor inside its bounds (no wrap: the native menus clamp).
 *
 * @param {number} index the current index
 * @param {number} delta -1 for up, +1 for down
 * @param {number} count the item count
 * @returns {number} the clamped index
 */
export function Hexen2_MenuMove( index, delta, count ) {

	if ( ! Number.isFinite( count ) || count <= 0 ) return 0;
	const next = ( Number.isFinite( index ) ? index : 0 ) + ( delta < 0 ? - 1 : 1 );
	return Math.max( 0, Math.min( count - 1, next ) );

}

/**
 * The informational lines of a panel, built from the native HUD.
 *
 * @param {string} panel one of HEXEN2_MENU_PANELS
 * @param {?object} hud a HUD from `Hexen2_ReadHud`
 * @param {{ volume?: number, sensitivity?: number }} [values] presentation values for Options
 * @returns {ReadonlyArray<string>} the lines, already labelled
 */
export function Hexen2_MenuLines( panel, hud, values = {} ) {

	if ( ! hud ) return Object.freeze( [ 'No active player.' ] );
	if ( panel === 'inventory' ) return Object.freeze( [
		`Health: ${value( hud.health )} / ${value( hud.maxHealth )}`,
		`Mana: blue ${value( hud.manaBlue )} / green ${value( hud.manaGreen )} / max ${value( hud.maxMana )}`,
		`Armour: amulet ${value( hud.armour.armor_amulet )}, bracer ${value( hud.armour.armor_bracer )}, breastplate ${value( hud.armour.armor_breastplate )}, helmet ${value( hud.armour.armor_helmet )}`,
		`Rings: flight ${hud.rings.ring_flight ? 'yes' : 'no'}, water ${hud.rings.ring_water ? 'yes' : 'no'}, turning ${hud.rings.ring_turning ? 'yes' : 'no'}, regeneration ${hud.rings.ring_regeneration ? 'yes' : 'no'}`,
		`Weapon frame: ${value( hud.weaponFrame )}; item bits: ${value( hud.items )}`,
		`Artifacts: ${value( hud.inventory )} carried; active ${value( hud.artifactActive )}`,
		`Puzzle slots: ${hud.puzzle.filter( piece => piece !== '' ).join( ', ' ) || 'none'}`
	] );
	if ( panel === 'character' ) return Object.freeze( [
		`Class: ${Hexen2_ClassName( hud.playerClass )}`,
		`Level: ${value( hud.level )}; experience: ${value( hud.experience )}`,
		`Health: ${value( hud.health )} / ${value( hud.maxHealth )}`,
		`Strength ${value( hud.strength )}; intelligence ${value( hud.intelligence )}; wisdom ${value( hud.wisdom )}; dexterity ${value( hud.dexterity )}`
	] );
	if ( panel === 'options' ) return Object.freeze( [
		`Sound volume: ${value( values.volume ?? 1 )} (Left/Right)`,
		`Mouse sensitivity: ${value( values.sensitivity ?? 5 )} (Left/Right)`
	] );
	return Object.freeze( [ 'Hexen II — Esc to resume.' ] );

}

/**
 * Adjusts an option item by a direction.
 *
 * @param {string} id the option id (`volume` or `sensitivity`)
 * @param {number} direction -1 or +1
 * @param {{ volume?: number, sensitivity?: number }} current the current values
 * @returns {?{ id: string, value: number }} the new value, or null for a non-option id
 */
export function Hexen2_MenuAdjust( id, direction, current = {} ) {

	const step = direction < 0 ? - 1 : 1;
	if ( id === 'volume' ) return { id, value: Math.max( 0, Math.min( 1, Math.round( ( Number( current.volume ?? 1 ) + step * 0.1 ) * 10 ) / 10 ) ) };
	if ( id === 'sensitivity' ) return { id, value: Math.max( 1, Math.min( 20, ( Number( current.sensitivity ?? 5 ) | 0 ) + step ) ) };
	return null;

}

/**
 * Creates the DOM overlay. The page calls `open`, `close`, `key` and `update`; the page owns the simulation freeze.
 *
 * @param {{ document?: Document, onActivate: function(string): boolean, onQuit?: function(): void,
 *   onNewGame?: function(): void, onResume?: function(): void, pixel?: boolean }} options the host callbacks;
 *   `onActivate` returns true when it consumed the item (so the overlay refreshes); `pixel` hides the DOM host and
 *   leaves the page to draw the model on the native overlay canvas
 * @returns {{ open: function(boolean): void, isOpen: function(): boolean, toggle: function(): void,
 *   key: function(KeyboardEvent): boolean, update: function(object): void, state: function(): object,
 *   element: ?HTMLElement }} the host
 */
export function Hexen2_CreateMenu( options ) {

	const doc = options.document ?? ( typeof document !== 'undefined' ? document : null );
	if ( !doc ) return { open: () => {}, isOpen: () => false, toggle: () => {}, key: () => false, update: () => {}, element: null };
	const root = doc.createElement( 'div' );
	root.id = 'hexen2-menu';
	if ( options.pixel ) root.dataset.pixel = '1';
	root.style = 'position:fixed;inset:0;z-index:600;display:none;align-items:center;justify-content:center;background:rgba(5,5,8,.82);color:#efe2c4;font:16px/1.7 Georgia,serif';
	const panel = doc.createElement( 'div' );
	panel.style = 'min-width:min(620px,86vw);max-width:86vw;padding:1.4em 2em;border:1px solid #7a6a4a;background:#14110d;box-shadow:0 0 40px #000';
	root.append( panel ); doc.body.append( root );
	let open = false, state = { panel: 'main', index: 0, hud: null, values: { volume: 1, sensitivity: 5 } };
	const render = () => {

		const items = Hexen2_MenuItems( state.panel, state.values );
		state.index = Math.max( 0, Math.min( items.length - 1, state.index ) );
		panel.innerHTML = '';
		const title = doc.createElement( 'div' );
		title.textContent = state.panel === 'main' ? 'HEXEN II — PAUSED' : state.panel.toUpperCase();
		title.style = 'letter-spacing:.18em;font-size:1.1em;color:#d8c69b;margin-bottom:.8em';
		panel.append( title );
		const lines = Hexen2_MenuLines( state.panel, state.hud, state.values );
		if ( lines.length && state.panel !== 'main' ) {

			const info = doc.createElement( 'div' );
			info.style = 'font-size:.82em;color:#a99d86;white-space:pre-wrap;margin-bottom:.9em';
			info.textContent = lines.join( '\n' );
			panel.append( info );

		}
		items.forEach( ( item, i ) => {

			const row = doc.createElement( 'div' );
			row.dataset.id = item.id;
			row.style = 'padding:.25em .5em;' + ( i === state.index ? 'background:#3a3020;color:#fff1cf' : 'color:#bfb39b' );
			row.textContent = ( i === state.index ? '> ' : '  ' ) + item.label + ( item.value !== undefined ? ' : ' + item.value : '' );
			panel.append( row );

		} );
		root.style.display = options.pixel ? 'none' : ( open ? 'flex' : 'none' );

	};
	const api = {
		element: root,
		open( next ) { open = next === true; if ( open ) state.index = 0; render(); },
		isOpen() { return open; },
		toggle() { api.open( ! open ); },
		update( next ) { state = { ...state, ...next, values: { ...state.values, ...( next.values ?? {} ) } }; render(); },
		state() { return { ...state, values: { ...state.values } }; },
		key( event ) {

			if ( ! open ) return false;
			const items = Hexen2_MenuItems( state.panel, state.values );
			if ( event.code === 'Escape' ) { if ( state.panel === 'main' ) { api.open( false ); options.onResume?.(); } else { state.panel = 'main'; state.index = 0; render(); } return true; }
			if ( event.code === 'ArrowUp' ) { state.index = Hexen2_MenuMove( state.index, -1, items.length ); render(); return true; }
			if ( event.code === 'ArrowDown' ) { state.index = Hexen2_MenuMove( state.index, 1, items.length ); render(); return true; }
			const item = items[ state.index ];
			if ( ( event.code === 'ArrowLeft' || event.code === 'ArrowRight' ) && item?.adjust ) {

				const adjusted = Hexen2_MenuAdjust( item.id, event.code === 'ArrowLeft' ? -1 : 1, state.values );
				if ( adjusted ) { state.values[ adjusted.id ] = adjusted.value; if ( options.onActivate( 'adjust:' + adjusted.id + ':' + adjusted.value ) ) {} render(); }
				return true;

			}
			if ( event.code === 'Enter' || event.code === 'Space' ) {

				if ( item?.id === 'newgame' ) { options.onNewGame?.(); return true; }
				if ( item?.id === 'quit' ) { options.onQuit?.(); return true; }
				if ( options.onActivate( item?.id ) ) render();
				if ( item?.id === 'resume' ) api.open( false );
				return true;

			}
			return false;

		}
	};
	return api;

}
