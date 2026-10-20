// G1 RPG mechanics on demo1 with the supplied gamecode: armour pieces, an artifact and a weapon pick up through the
// gamecode's touch handling, and a kill awards experience and advances the class level with the native health/mana
// growth. Plan sections 5 and 7 (E16-E22 prerequisites).
import { SV_LinkEdict } from '../src/engine/server/world.js';
import { SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { Hexen2_ArtifactCounts } from '../src/engine/client/hexen2_inventory.js';
import { loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'armour, an artifact and a weapon pick up on demo1', () => {

	if ( ! loadHexen2Data() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player } = spawnHexen2Map( 'demo1', 1 );
	const frames = ( count = 1 ) => { for ( let i = 0; i < count; i ++ ) { SV_Physics(); pr_global_struct.time = sv.time; } };
	// let the level's items run PlaceItem (solid trigger) before moving them onto the player
	frames( 5 );
	const pickup = classname => {

		const item = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === classname );
		check( item !== undefined, `demo1 spawned a ${classname}` );
		item.v.origin = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
		SV_LinkEdict( item, true );
		frames( 3 );
		return item;

	};

	// demo1's bracer, breastplate and helmet carry NOT_COOP|NOT_SINGLE (spawnflags 196608): native single player spawns
	// only the amulet (uhexen2 ED_LoadFromFile), so that is the single-player armour piece this level offers
	pickup( 'item_armor_amulet' );
	check( ( player.v.armor_amulet | 0 ) > 0, 'armor_amulet was picked up: ' + ( player.v.armor_amulet | 0 ) );

	pickup( 'art_torch' );
	check( ( player.v.cnt_torch | 0 ) > 0, 'the torch count follows the pickup: ' + ( player.v.cnt_torch | 0 ) );
	check( Hexen2_ArtifactCounts( player )[ 0 ] > 0, 'the inventory reads the torch count' );

	const itemsBefore = player.v.items | 0;
	pickup( 'wp_weapon2' );
	check( ( player.v.items | 0 ) !== itemsBefore, `the weapon pickup changed items: ${itemsBefore} -> ${player.v.items | 0}` );

} );

Deno.test( 'a kill awards experience and advances the class level', () => {

	if ( ! loadHexen2Data() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player } = spawnHexen2Map( 'demo1', 1 );
	const frames = ( count = 1 ) => { for ( let i = 0; i < count; i ++ ) { SV_Physics(); pr_global_struct.time = sv.time; } };
	player.v.experience = 944; // just below the Paladin level-2 threshold (945)
	const levelBefore = player.v.level | 0, maxHealthBefore = player.v.max_health, maxManaBefore = player.v.max_mana;
	const monster = sv.edicts.find( ent => ent && ! ent.free && /^monster_/.test( PR_GetString( ent.v.classname ) ) );
	check( monster !== undefined, 'the level spawned a monster' );
	monster.v.origin = [ player.v.origin[ 0 ] + 64, player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	monster.v.movetype = 0; monster.v.health = 1;
	SV_LinkEdict( monster, true );
	player.v.angles = [ 0, 0, 0 ]; player.v.v_angle = [ 0, 0, 0 ];
	player.v.impulse = 1; frames( 1 ); player.v.impulse = 0; player.v.button0 = 1;
	let error = null;
	try { frames( 30 ); } catch ( e ) { error = e; }
	player.v.button0 = 0;
	check( error === null, 'the kill frames ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( ( player.v.experience | 0 ) > 944, 'experience rose on the kill: ' + ( player.v.experience | 0 ) );
	check( ( player.v.level | 0 ) > levelBefore, `the kill advanced the level: ${levelBefore} -> ${player.v.level | 0}` );
	check( player.v.max_health > maxHealthBefore, `max health grew with the level: ${maxHealthBefore} -> ${player.v.max_health}` );
	check( player.v.max_mana > maxManaBefore, `max mana grew with the level: ${maxManaBefore} -> ${player.v.max_mana}` );

} );
