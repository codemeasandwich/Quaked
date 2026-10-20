/** @module engine/client/menu_actions — the existing keyboard action lists, also used by pad mapping. */
import { GameProfile_Get } from '../common/game_profile.js';

const quake = [
	[ '+attack', 'attack' ],
	[ 'impulse 10', 'change weapon' ],
	[ '+jump', 'jump / swim up' ],
	[ '+forward', 'walk forward' ],
	[ '+back', 'backpedal' ],
	[ '+left', 'turn left' ],
	[ '+right', 'turn right' ],
	[ '+speed', 'run' ],
	[ '+moveleft', 'step left' ],
	[ '+moveright', 'step right' ],
	[ '+strafe', 'sidestep' ],
	[ '+lookup', 'look up' ],
	[ '+lookdown', 'look down' ],
	[ 'centerview', 'center view' ],
	[ '+mlook', 'mouse look' ],
	[ '+klook', 'keyboard look' ],
	[ '+moveup', 'swim up' ],
	[ '+movedown', 'swim down' ],
];

const hexen2 = Object.freeze( [
	[ '+attack', 'attack' ], [ 'impulse 10', 'next weapon' ], [ 'impulse 12', 'prev.weapon' ], [ '+jump', 'jump / swim up' ],
	[ '+forward', 'walk forward' ], [ '+back', 'backpedal' ], [ '+left', 'turn left' ], [ '+right', 'turn right' ],
	[ '+speed', 'run' ], [ '+moveleft', 'step left' ], [ '+moveright', 'step right' ], [ '+strafe', 'sidestep' ],
	[ '+crouch', 'crouch' ], [ '+lookup', 'look up' ], [ '+lookdown', 'look down' ], [ 'centerview', 'center view' ],
	[ '+moveup', 'swim up' ], [ '+movedown', 'swim down' ], [ 'impulse 13', 'lift object' ], [ 'invuse', 'use inv item' ],
	[ 'invdrop', 'drop inv item' ], [ '+showinfo', 'full inventory' ], [ '+showdm', 'info / frags' ], [ 'toggle_dm', 'toggle frags' ],
	[ '+infoplaque', 'objectives' ], [ 'invleft', 'inv move left' ], [ 'invright', 'inv move right' ], [ 'impulse 100', 'inv:torch' ],
	[ 'impulse 101', 'inv:qrtz flask' ], [ 'impulse 102', 'inv:mystic urn' ], [ 'impulse 103', 'inv:krater' ],
	[ 'impulse 104', 'inv:chaos devc' ], [ 'impulse 105', 'inv:tome power' ], [ 'impulse 106', 'inv:summon stn' ],
	[ 'impulse 107', 'inv:invisiblty' ], [ 'impulse 108', 'inv:glyph' ], [ 'impulse 109', 'inv:boots' ],
	[ 'impulse 110', 'inv:repulsion' ], [ 'impulse 111', 'inv:bo peep' ], [ 'impulse 112', 'inv:flight' ],
	[ 'impulse 113', 'inv:force cube' ], [ 'impulse 114', 'inv:icon defn' ]
] );

const actions = { quake, hexen2 };
for ( const list of Object.values( actions ) ) { for ( const entry of list ) Object.freeze( entry ); Object.freeze( list ); }

/** Returns the native Customize controls list selected by profile menu skin, without duplicating commands. */
export function M_ControllerActions( skin = GameProfile_Get().menuSkin ) { return actions[ skin ] || quake; }
