// G1 class stats on the shared host: SV_SpawnServer starts demo1 and PutClientInServer gives the Paladin the supplied
// gamecode's native class statistics. The spawn hands the chosen class to the gamecode the way the native menu does
// (`newclass`), which PutClientInServer copies into playerclass and uses for stats_NewClass: health/max_health from
// hitpoint_table (class 1 is 70..85) and max_mana from mana_table (class 1 is 84..95). Without it the class check
// rejects the player, max_mana stays 0 and mana pickups are refused.
import { loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'the spawned Paladin receives the native class statistics', () => {

	if ( ! loadHexen2Data() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player } = spawnHexen2Map( 'demo1', 1 );
	check( ( player.v.playerclass | 0 ) === 1, 'the spawned class is the Paladin: ' + ( player.v.playerclass | 0 ) );
	check( player.v.health >= 70 && player.v.health <= 95, 'native Paladin starting health (70..85): ' + player.v.health );
	check( player.v.max_health === player.v.health, 'max_health matches the starting health: ' + player.v.max_health );
	check( player.v.max_mana >= 84 && player.v.max_mana <= 95, 'native Paladin maximum mana (84..95): ' + player.v.max_mana );
	check( player.v.strength > 0 && player.v.intelligence > 0 && player.v.wisdom > 0 && player.v.dexterity > 0,
		'the class attributes were applied: ' + [ player.v.strength, player.v.intelligence, player.v.wisdom, player.v.dexterity ] );
	check( ( sv.edicts[ 0 ].v.max_mana | 0 ) === 0, 'the world did not receive the player stats' );

} );
