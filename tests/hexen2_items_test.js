// G1 items on the shared host: a Paladin on demo1 picks up the level's own health and mana items through the supplied
// gamecode's touch handling. The class maximum mana that the mana pickup needs is applied at spawn.
import { SV_LinkEdict } from '../src/engine/server/world.js';
import { SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the Paladin picks up native health and mana items on demo1', () => {

	if ( ! loadHexen2Data() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv, player } = spawnHexen2Map( 'demo1', 1 );

	const frames = ( count = 3 ) => { for ( let i = 0; i < count; i ++ ) { SV_Physics(); pr_global_struct.time = sv.time; } };
	const pickup = classname => {

		const item = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === classname );
		check( item !== undefined, `demo1 spawned a ${classname}` );
		item.v.origin = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
		SV_LinkEdict( item, true );
		return item;

	};

	// native health pickup: the level's item_health gives its native amount
	player.v.health = 50;
	pickup( 'item_health' );
	let error = null;
	try { frames( 5 ); } catch ( e ) { error = e; }
	check( error === null, 'the health pickup ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	same( player.v.health, 60, 'the native health amount (50 -> 60)' );

	// native mana pickup: the class maximum mana is now applied at spawn, so the blue potion is accepted
	const blueBefore = player.v.bluemana | 0;
	pickup( 'item_mana_blue' );
	error = null;
	try { frames( 5 ); } catch ( e ) { error = e; }
	check( error === null, 'the mana pickup ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( ( player.v.bluemana | 0 ) > blueBefore, `blue mana rose: ${blueBefore} -> ${player.v.bluemana | 0}` );

} );
