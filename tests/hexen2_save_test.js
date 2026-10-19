// The version-1 Hexen II single-session save record and its persistence boundary: a native player snapshot validates,
// applies back to a live player, and refuses corrupted/lookalike records; the memory and localStorage stores round-trip
// one record without touching the Quake save keys.
import { HEXEN2_SAVE_SCHEMA, HEXEN2_SAVE_PLAYER_FIELDS, Hexen2_BuildSaveBundle, Hexen2_ValidateSaveBundle,
	Hexen2_ApplySaveBundle, Hexen2_CapturePlayer, Hexen2_SaveStore, Hexen2_NormalizeMapName, Hexen2_TransitionUrl, Hexen2_HubStore } from '../src/engine/common/hexen2_save.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
function player() {

	const v = { health: 75, max_health: 85, bluemana: 20, greenmana: 5, max_mana: 95, level: 2, experience: 1000,
		strength: 12, intelligence: 14, wisdom: 11, dexterity: 13, armor_amulet: 20, items: 7, weapon: 1,
		current_weapon: 1, weaponframe: 4, cnt_torch: 2, puzzle_inv1: 123, ring_flight: 1,
		origin: [ 10, 20, 30 ], angles: [ 0, 90, 0 ], velocity: [ 1, 2, 3 ], v_angle: [ 0, 90, 0 ] };
	for ( const name of HEXEN2_SAVE_PLAYER_FIELDS ) if ( !( name in v ) ) v[ name ] = 0;
	return { v };

}

Deno.test( 'a native player snapshot builds, validates and applies back', () => {

	const live = player(), bundle = Hexen2_BuildSaveBundle( { gameId: 'hexen2', classId: 'paladin', skill: 1, level: 'demo1', player: live, time: 12.5 } );
	same( bundle.schema, HEXEN2_SAVE_SCHEMA, 'schema' );
	same( bundle.kind, 'hexen2-single-session', 'kind' );
	same( bundle.identity.level, 'demo1', 'level' );
	same( bundle.player.health, 75, 'health' );
	same( JSON.stringify( bundle.vectors.origin ), JSON.stringify( [ 10, 20, 30 ] ), 'origin' );
	same( Hexen2_ValidateSaveBundle( bundle ).ok, true, 'the record validates' );

	const target = player();
	target.v.health = 1; target.v.origin = [ 0, 0, 0 ]; target.v.cnt_torch = 0;
	const applied = Hexen2_ApplySaveBundle( bundle, target );
	check( applied.ok, applied.reason );
	same( target.v.health, 75, 'health restored' );
	same( JSON.stringify( target.v.origin ), JSON.stringify( [ 10, 20, 30 ] ), 'origin restored' );
	same( target.v.cnt_torch, 2, 'artifact count restored' );
	same( target.v.puzzle_inv1, 123, 'puzzle slot restored' );
	const transition = player(); transition.v.origin = [ 0, 0, 0 ]; Hexen2_ApplySaveBundle( bundle, transition, { vectors: false } );
	same( JSON.stringify( transition.v.origin ), JSON.stringify( [ 0, 0, 0 ] ), 'a level transition keeps the new map start' );
	same( transition.v.health, 75, 'a level transition still restores the native fields' );

	same( Hexen2_NormalizeMapName( 'demo2' ), 'maps/demo2.bsp', 'a bare map name' );
	same( Hexen2_NormalizeMapName( 'maps/ruins.bsp' ), 'maps/ruins.bsp', 'an already-normalised path' );
	same( Hexen2_NormalizeMapName( '' ), '', 'an empty map is refused' );
	const url = Hexen2_TransitionUrl( { pathname: '/index.html', gameId: 'hexen2', classId: 'crusader', skill: 2, map: 'ruins', spot: 'start' } );
	check( url.startsWith( '/index.html?' ) && /autostart=1/.test( url ) && /class=crusader/.test( url ) && /map=maps%2Fruins.bsp/.test( url ), 'the transition URL: ' + url );
	const hubBundle = Hexen2_BuildSaveBundle( { gameId: 'hexen2', classId: 'paladin', skill: 1, level: 'maps/demo1.bsp', player: live,
		hub: { levels: { 'maps/demo1.bsp': { health: 75 } }, worlds: { 'maps/demo1.bsp': { schema: 1, level: 'maps/demo1.bsp' } } } } );
	same( Hexen2_ValidateSaveBundle( hubBundle ).ok, true, 'a hub save validates' );
	same( Object.keys( hubBundle.hub.worlds ).length, 1, 'the hub world is recorded' );
	const badHub = structuredClone( hubBundle ); badHub.hub.levels = null;
	same( Hexen2_ValidateSaveBundle( badHub ).ok, false, 'a malformed hub is refused' );
	const captured = Hexen2_CapturePlayer( live );
	same( Object.keys( captured.fields ).length, HEXEN2_SAVE_PLAYER_FIELDS.length, 'every field captured' );

} );

Deno.test( 'malformed and lookalike save records are refused before any live field is written', () => {

	const bundle = Hexen2_BuildSaveBundle( { gameId: 'hexen2', classId: 'paladin', skill: 1, level: 'demo1', player: player(), view: { angles: [ 0, 0, 0 ], time: 1 } } );
	const refuse = ( mutate, name ) => { const copy = structuredClone( bundle ); mutate( copy ); const r = Hexen2_ValidateSaveBundle( copy ); check( !r.ok, name + ' should be refused' ); };
	refuse( copy => { copy.schema = HEXEN2_SAVE_SCHEMA + 1; }, 'a future schema' );
	refuse( copy => { copy.kind = 'quake'; }, 'a Quake save' );
	refuse( copy => { copy.identity.level = ''; }, 'an empty level' );
	refuse( copy => { copy.identity.skill = 4; }, 'an out-of-range skill' );
	refuse( copy => { copy.player.health = null; }, 'a non-finite field' );
	refuse( copy => { copy.vectors.origin = [ 0, 0 ]; }, 'a short vector' );
	refuse( copy => { copy.time = 'soon'; }, 'a non-finite time' );
	refuse( copy => { copy.view.angles = [ 0, 0 ]; }, 'a short client view' );
	const target = player(); target.v.health = 3;
	const bad = structuredClone( bundle ); bad.player.health = '70';
	same( Hexen2_ApplySaveBundle( bad, target ).ok, false, 'apply refuses an invalid record' );
	same( target.v.health, 3, 'the invalid apply wrote nothing' );

} );

Deno.test( 'the memory and localStorage stores round-trip a record without Quake keys', async () => {

	const memory = Hexen2_SaveStore( { indexedDB: null, localStorage: null } );
	same( memory.kind, 'memory', 'memory fallback' );
	await memory.put( 'quicksave', { a: 1 } );
	same( ( await memory.get( 'quicksave' ) ).a, 1, 'memory get' );
	same( ( await memory.list() ).join( ',' ), 'quicksave', 'memory list' );
	await memory.remove( 'quicksave' );
	same( await memory.get( 'quicksave' ), null, 'memory remove' );

	const data = new Map();
	const storage = { get length() { return data.size; }, key: i => [ ...data.keys() ][ i ] ?? null,
		getItem: key => data.get( key ) ?? null, setItem: ( key, value ) => data.set( key, value ), removeItem: key => data.delete( key ) };
	storage.setItem( 'quake_save_1', 'legacy' );
	const local = Hexen2_SaveStore( { indexedDB: null, localStorage: storage } );
	same( local.kind, 'localstorage', 'localStorage fallback' );
	await local.put( 'quicksave', { health: 70 } );
	same( ( await local.get( 'quicksave' ) ).health, 70, 'localStorage get' );
	check( storage.getItem( 'quake_save_1' ) === 'legacy', 'the legacy Quake key is untouched' );
	await local.remove( 'quicksave' );
	same( await local.get( 'quicksave' ), null, 'localStorage remove' );

	const hub = Hexen2_HubStore( { localStorage: storage } );
	hub.put( 'maps/demo1.bsp', { level: 'maps/demo1.bsp' } );
	hub.put( 'demo2', { level: 'maps/demo2.bsp' } );
	same( hub.get( 'maps/demo2.bsp' ).level, 'maps/demo2.bsp', 'hub snapshots are normalised' );
	same( Object.keys( hub.all() ).length, 2, 'the hub has both visited levels' );
	hub.putWorld( 'maps/demo1.bsp', { schema: 1, level: 'maps/demo1.bsp' } );
	same( hub.getWorld( 'demo1' ).level, 'maps/demo1.bsp', 'the hub world snapshot is normalised' );
	same( Object.keys( hub.allWorlds() ).length, 1, 'the hub world list' );
	hub.clear();
	same( Object.keys( hub.all() ).length, 0, 'the hub clears' );
	same( Object.keys( hub.allWorlds() ).length, 0, 'the hub clears worlds' );

} );
