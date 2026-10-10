// Who has which controller in local play across windows (card [37c]): players 2 and up first (player 1 has the keyboard
// and mouse), then player 1; a controller keeps its player while connected; one that comes back returns to its player
// if still free; a player who leaves frees theirs; extra controllers play nobody. Then two windows sharing over real
// BroadcastChannels: a player's window that reads no controllers (the browser shows them only to the focused window)
// still plays its own, from player 1's page's reading and assignment.
import { PadAssign_Key, PadAssign_Next } from '../src/platform/pad_assign.js';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const show = table => [ ...table ].map( ( [ k, v ] ) => k + '>' + v ).join( ' ' );

Deno.test( 'controllers go to players 2 and up first, stay while connected, come back to their player', () => {
	const last = new Map();
	let t = PadAssign_Next( new Map(), [ 'a' ], [ 1, 2, 3 ], last );
	same( show( t ), 'a>2', 'the first controller: player 2' );
	t = PadAssign_Next( t, [ 'a', 'b' ], [ 1, 2, 3 ], last );
	same( show( t ), 'a>2 b>3', 'the second: player 3' );
	t = PadAssign_Next( t, [ 'a', 'b', 'c' ], [ 1, 2, 3 ], last );
	same( show( t ), 'a>2 b>3 c>1', 'the third: player 1, once every other player has one' );
	t = PadAssign_Next( t, [ 'a', 'b', 'c', 'd' ], [ 1, 2, 3 ], last );
	same( show( t ), 'a>2 b>3 c>1', 'a fourth for three players plays nobody' );
	t = PadAssign_Next( t, [ 'b', 'c', 'd' ], [ 1, 2, 3 ], last );
	same( show( t ), 'b>3 c>1 d>2', 'controller a goes away: the spare one takes player 2' );
	t = PadAssign_Next( t, [ 'a', 'b', 'c', 'd' ], [ 1, 2, 3 ], last );
	same( show( t ), 'b>3 c>1 d>2', 'a comes back: its player is taken, so it waits' );
	t = PadAssign_Next( t, [ 'a', 'b', 'c' ], [ 1, 2, 3 ], last );
	same( show( t ), 'b>3 c>1 a>2', 'd goes: a returns to player 2' );
	t = PadAssign_Next( t, [ 'a', 'b', 'c' ], [ 1, 3 ], last );
	same( show( t ), 'b>3 c>1', 'player 2 leaves: a is free' );
	t = PadAssign_Next( t, [ 'a', 'b', 'c' ], [ 1, 3, 4 ], last );
	same( show( t ), 'b>3 c>1 a>4', 'player 4 joins: the free controller is theirs' );
	same( PadAssign_Key( { index: 2, id: 'Xbox' } ), '2|Xbox', 'a controller is its index and id' );
} );

Deno.test( 'a player\'s window that reads no controllers plays its own from player 1\'s page', async () => {
	const host = await import( '../src/platform/pad_share.js?player1' ), player = await import( '../src/platform/pad_share.js?player2' );
	const pad = ( index, a = false ) => ( { index, id: 'Pad ' + index, mapping: 'standard', axes: [ 0.5, 0, 0, 0 ], buttons: [ { pressed: a, value: a ? 1 : 0 } ] } );
	const tick = () => new Promise( r => setTimeout( r, 20 ) );
	try {
		host.PadShare_Join( 'share-test', 1 ); player.PadShare_Join( 'share-test', 2 );
		same( host.PadShare_Frame( [ pad( 0 ) ], [ 1, 2 ] ), null, 'player 1\'s page reads controller 0 and gives it to player 2' );
		await tick();
		const got = player.PadShare_Frame( [], [] );
		check( got && got.index === 0 && got.axes[ 0 ] === 0.5, 'player 2\'s window plays controller 0 from the shared reading' );
		host.PadShare_Frame( [ pad( 0, true ) ], [ 1, 2 ] ); await tick();
		same( player.PadShare_Frame( [], [] )?.buttons[ 0 ].pressed, true, 'and sees its A go down' );
		await new Promise( r => setTimeout( r, 600 ) );
		same( player.PadShare_Frame( [], [] ), null, 'a reading older than half a second is no longer the controller\'s state' );
	} finally {
		host.PadShare_Join( null ); player.PadShare_Join( null );
	}
} );
