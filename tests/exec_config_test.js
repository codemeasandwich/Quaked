// `exec` and the 2021 re-release (found 13 October 2026 in the Mac app: W did not move the player in Quake). Its
// quake.rc ends without a newline, so its last line ran into the next queued command (`bind w +forward`); and its PAKs
// have no default.cfg, so the classic keys (the arrow keys, Ctrl, ...) were never bound. Through cmd.js and pak.js.
import { Cbuf_Init, Cmd_Init, Cmd_AddCommand, Cbuf_AddText, Cbuf_InsertText, Cbuf_Execute, Cmd_SetExecFallback } from '../src/engine/common/cmd.js';
import { COM_LoadPackFile, COM_AddPack } from '../src/engine/common/pak.js';
import { HOST_CLASSIC_DEFAULT_CFG, Host_SetDefaultCfgFallback } from '../src/engine/server/host.js';
import { Key_Init, Key_WriteBindings } from '../src/engine/client/keys.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

function pak( files ) {

	const names = Object.keys( files ), bodies = names.map( n => new TextEncoder().encode( files[ n ] ) );
	const dataBytes = bodies.reduce( ( s, b ) => s + b.length, 0 ), out = new Uint8Array( 12 + dataBytes + names.length * 64 ), view = new DataView( out.buffer );
	out.set( new TextEncoder().encode( 'PACK' ) ); view.setInt32( 4, 12 + dataBytes, true ); view.setInt32( 8, names.length * 64, true );
	let at = 12; names.forEach( ( n, i ) => { out.set( bodies[ i ], at ); const d = 12 + dataBytes + i * 64; out.set( new TextEncoder().encode( n ), d ); view.setInt32( d + 56, at, true ); view.setInt32( d + 60, bodies[ i ].length, true ); at += bodies[ i ].length; } );
	return out.buffer;

}

Deno.test( 'a script without a final newline does not swallow the next command; a missing default.cfg runs the classic keys', () => {

	Cbuf_Init(); Cmd_Init();
	const ran = [];
	for ( const name of [ 'marker', 'classic', 'alias_end' ] ) Cmd_AddCommand( name, () => ran.push( name ) );
	COM_AddPack( COM_LoadPackFile( 'rerelease.pak', pak( { 'exectest.rc': 'exec default.cfg\nalias_end' } ) ) );
	Cmd_SetExecFallback( 'default.cfg', 'classic\n' );
	try {

		Cbuf_InsertText( 'exec exectest.rc\n' ); Cbuf_AddText( 'marker\n' ); Cbuf_Execute();
		same( ran.join(), 'classic,alias_end,marker', 'the fallback default.cfg ran, then the last line, then the queued command' );

	} finally {

		Cmd_SetExecFallback( 'default.cfg', null );

	}

} );

Deno.test( 'the classic default keys bind what the original default.cfg bound', () => {

	const lines = HOST_CLASSIC_DEFAULT_CFG.split( '\n' );
	same( lines[ 0 ], 'unbindall', 'resets first, as default.cfg does' );
	for ( const bind of [ 'bind UPARROW +forward', 'bind DOWNARROW +back', 'bind CTRL +attack', 'bind ESCAPE togglemenu', 'bind ~ toggleconsole', 'bind 1 "impulse 1"', 'bind MOUSE1 +attack' ] )
		check( lines.includes( bind ), 'binds ' + bind );
	check( ! /\bbind w\b/.test( HOST_CLASSIC_DEFAULT_CFG ), 'WASD stays with the port defaults host.js adds after quake.rc' );

} );

Deno.test( 'Host_Init registers the classic keys: exec default.cfg with no file binds all of them', async () => {

	Cbuf_Init(); Cmd_Init(); Key_Init(); Host_SetDefaultCfgFallback();
	Cbuf_InsertText( 'exec default.cfg\n' ); Cbuf_Execute();
	const written = Key_WriteBindings(), expected = HOST_CLASSIC_DEFAULT_CFG.split( '\n' ).filter( l => l.startsWith( 'bind ' ) );
	same( written.split( '\n' ).filter( l => l.startsWith( 'bind ' ) ).length, expected.length, 'every classic bind takes (each key name resolves)' );
	check( written.includes( 'bind "UPARROW" "+forward"' ) && written.includes( 'bind "CTRL" "+attack"' ), 'arrow and fire keys bound' );
	const host = await Deno.readTextFile( new URL( '../src/engine/server/host.js', import.meta.url ) ), init = host.slice( host.indexOf( 'export async function Host_Init' ) );
	check( init.indexOf( 'Host_SetDefaultCfgFallback()' ) > 0 && init.indexOf( 'Host_SetDefaultCfgFallback()' ) < init.indexOf( "exec quake.rc" ), 'Host_Init registers it before quake.rc runs' );

} );
