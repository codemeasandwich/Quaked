// The in-game Hexen II pause-menu model: the item lists, cursor clamping, native HUD lines, class names and option
// adjustments. The DOM host is exercised by tools/hexen2-browser/product-trial.mjs (Escape opens it in a real page).
import { Hexen2_MenuItems, Hexen2_MenuMove, Hexen2_MenuLines, Hexen2_MenuAdjust, Hexen2_ClassName, HEXEN2_MENU_PANELS } from '../src/engine/client/hexen2_menu.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const hud = { playerClass: 1, health: 70, maxHealth: 85, manaBlue: 12, manaGreen: 3, maxMana: 95,
	armour: { armor_amulet: 20, armor_bracer: 0, armor_breastplate: 0, armor_helmet: 0 },
	level: 2, experience: 1000, strength: 12, intelligence: 14, wisdom: 11, dexterity: 13,
	rings: { ring_flight: 1, ring_water: 0, ring_turning: 0, ring_regeneration: 0 },
	items: 7, artifactActive: 1, inventory: 2, weaponFrame: 9, puzzle: [ 'skull', '', '', '', '', '', '', '' ] };

Deno.test( 'the pause menu has resume, inventory, character, options, save, load, new game and quit', () => {

	const items = Hexen2_MenuItems( 'main' );
	same( items.map( item => item.id ).join( ',' ), 'resume,inventory,character,options,save,load,newgame,quit', 'main items' );
	check( HEXEN2_MENU_PANELS.includes( 'inventory' ), 'inventory panel' );
	same( Hexen2_MenuItems( 'inventory' )[ 0 ].id, 'back', 'submenus go back' );
	same( Hexen2_MenuItems( 'options' ).map( item => item.id ).join( ',' ), 'volume,sensitivity,back', 'options items' );

	same( Hexen2_MenuMove( 0, -1, 8 ), 0, 'up at the top clamps' );
	same( Hexen2_MenuMove( 7, 1, 8 ), 7, 'down at the bottom clamps' );
	same( Hexen2_MenuMove( 2, 1, 8 ), 3, 'down moves' );
	same( Hexen2_MenuMove( 2, -1, 8 ), 1, 'up moves' );
	same( Hexen2_MenuMove( 0, 1, 0 ), 0, 'an empty menu stays at zero' );

} );

Deno.test( 'the inventory and character panels read the native HUD', () => {

	const inventory = Hexen2_MenuLines( 'inventory', hud ).join( '\n' );
	check( /Health: 70 \/ 85/.test( inventory ), 'health line: ' + inventory );
	check( /blue 12 \/ green 3 \/ max 95/.test( inventory ), 'mana line' );
	check( /amulet 20/.test( inventory ), 'armour line' );
	check( /flight yes/.test( inventory ), 'rings line' );
	check( /skull/.test( inventory ), 'puzzle line' );
	const character = Hexen2_MenuLines( 'character', hud ).join( '\n' );
	check( /Class: Paladin/.test( character ), 'class line' );
	check( /Level: 2; experience: 1000/.test( character ), 'level line: ' + character );
	check( /Strength 12; intelligence 14; wisdom 11; dexterity 13/.test( character ), 'stats line' );

	same( Hexen2_ClassName( 1 ), 'Paladin', 'class 1' );
	same( Hexen2_ClassName( 3 ), 'Necromancer', 'class 3' );
	same( Hexen2_ClassName( 5 ), 'Succubus', 'class 5' );
	same( Hexen2_ClassName( 0 ), 'Unknown', 'class 0' );
	same( JSON.stringify( Hexen2_MenuLines( 'character', null ) ), JSON.stringify( [ 'No active player.' ] ), 'no player' );

} );

Deno.test( 'the options adjust volume and mouse sensitivity within their bounds', () => {

	same( JSON.stringify( Hexen2_MenuAdjust( 'volume', 1, { volume: 0.7 } ) ), JSON.stringify( { id: 'volume', value: 0.8 } ), 'volume up' );
	same( JSON.stringify( Hexen2_MenuAdjust( 'volume', -1, { volume: 0 } ) ), JSON.stringify( { id: 'volume', value: 0 } ), 'volume floor' );
	same( JSON.stringify( Hexen2_MenuAdjust( 'volume', 1, { volume: 1 } ) ), JSON.stringify( { id: 'volume', value: 1 } ), 'volume ceiling' );
	same( JSON.stringify( Hexen2_MenuAdjust( 'sensitivity', 1, { sensitivity: 5 } ) ), JSON.stringify( { id: 'sensitivity', value: 6 } ), 'sensitivity up' );
	same( JSON.stringify( Hexen2_MenuAdjust( 'sensitivity', -1, { sensitivity: 1 } ) ), JSON.stringify( { id: 'sensitivity', value: 1 } ), 'sensitivity floor' );
	same( Hexen2_MenuAdjust( 'back', 1, {} ), null, 'a non-option is not adjusted' );

} );
