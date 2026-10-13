// The switch a game starts with, decided as main.js decides it (GameSelection_StartSwitch, docs/add-ons-2026-10-13.md):
// packs mounted in main.js's order (Quake, the shareware, then the add-on's pak0, pak1), then the gfx.wad the engine
// will draw from, the last mounted pack's, chooses. Quoth's pak1 carries Scourge of Armagon's status-bar pictures, so
// it runs with -hipnotic; an add-on with no gfx.wad of its own runs as standard Quake; a mission pack keeps its own.
import * as pak from '../src/engine/common/pak.js';
import { GameSelection_StartSwitch } from '../src/engine/common/game_selection.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const wad = names => { const b = new Uint8Array( 12 + names.length * 32 ), v = new DataView( b.buffer ); b.set( [ 87, 65, 68, 50 ] ); v.setInt32( 4, names.length, true ); v.setInt32( 8, 12, true ); names.forEach( ( n, i ) => b.set( new TextEncoder().encode( n ), 12 + i * 32 + 16 ) ); return b; };
const mount = ( name, files ) => pak.COM_AddPack( pak.COM_LoadPackFile( name, pak.COM_BuildPack( files ) ) );
const quake = [ 'conchars', 'sb_sigil1', 'inv_shotgun', 'face1' ], other = { name: 'progs.dat', data: new Uint8Array( 8 ) };

Deno.test( 'a game with no switch of its own starts with the one its mounted gfx.wad asks for', () => {

	mount( 'id1/pak0.pak', [ { name: 'gfx.wad', data: wad( quake ) }, other ] );
	mount( 'shareware/pak0.pak', [ { name: 'gfx.wad', data: wad( quake ) } ] );
	same( GameSelection_StartSwitch( { name: 'Found', switch: null } ), null, 'Quake\'s gfx.wad on top: standard Quake (an add-on without its own)' );
	mount( 'quoth/pak0.pak', [ { name: 'gfx.wad', data: wad( quake ) }, other ] );
	mount( 'quoth/pak1.pak', [ { name: 'gfx.wad', data: wad( [ ...quake, 'inv_laser', 'inv_mjolnir', 'sb_wsuit' ] ) } ] );
	same( GameSelection_StartSwitch( { name: 'Quoth', switch: null } ), '-hipnotic', 'Quoth: its last pack\'s gfx.wad has Scourge of Armagon\'s pictures' );
	same( GameSelection_StartSwitch( { name: 'Dissolution of Eternity', switch: '-rogue' } ), '-rogue', 'a mission pack keeps its own switch' );
	same( GameSelection_StartSwitch( null ), null, 'no mission: none' );

} );
