// Level Select built from an add-on's own maps (src/engine/client/level_select_auto.js; docs/add-ons-2026-10-13.md,
// step 3): what a map's entities say (its message, its kinds of player start) and how its name groups it, with no
// table per add-on. Maps without a player start (props) are left out; no page holds more than 14 levels.
import { LevelSelect_ReadMap, LevelSelect_AutoTable, LevelSelect_SetGamePacks, LevelSelect_GameTable, LevelSelect_OwnPacks, LEVEL_SELECT_AUTO_PAGE } from '../src/engine/client/level_select_auto.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
// a map file whose entity lump (lump 0) holds `text`; magic 29 (BSP29) or 'BSP2'
const bsp = ( text, magic = 29 ) => { const t = text + '\0', b = new Uint8Array( 124 + t.length ), v = new DataView( b.buffer ); if ( magic === 29 ) v.setInt32( 0, 29, true ); else b.set( [ ...magic ].map( c => c.charCodeAt( 0 ) ) ); v.setInt32( 4, 124, true ); v.setInt32( 8, t.length, true ); for ( let i = 0; i < t.length; i ++ ) b[ 124 + i ] = t.charCodeAt( i ); return b; };
const ents = ( message, ...starts ) => `{\n"classname" "worldspawn"\n"message" "${message}"\n}\n` + starts.map( s => `{\n"classname" "${s}"\n"origin" "0 0 0"\n}\n` ).join( '' );

Deno.test( 'a map\'s message and player starts are read from its entities, in BSP29 and BSP2', () => {

	const m = LevelSelect_ReadMap( bsp( ents( 'Gates of Abyss', 'info_player_start', 'info_player_deathmatch' ) ) );
	same( m.message, 'Gates of Abyss', 'the worldspawn message' ); check( m.start && m.deathmatch, 'both kinds of start' );
	check( LevelSelect_ReadMap( bsp( ents( 'Arena', 'info_player_deathmatch' ), 'BSP2' ) ).start === false, 'BSP2: a deathmatch map has no single-player start' );
	same( LevelSelect_ReadMap( bsp( ents( 'Remastered', 'info_player_start' ), '2PSB' ) ).message, 'Remastered', '2PSB too' );
	const exits = LevelSelect_ReadMap( bsp( ents( 'Hub', 'info_player_start' ) + '{\n"classname" "trigger_changelevel"\n"map" "D2"\n}\n{\n"classname" "trigger_changelevel"\n"map" "d1"\n}\n{\n"classname" "trigger_changelevel"\n"map" "d2"\n}\n' ) ).exits;
	same( exits.join(), 'd2,d1', 'its level exits, in order, once each, in lower case' );
	same( LevelSelect_ReadMap( bsp( ents( 'Prop' ) ) ).start, false, 'a prop has no start' );
	same( LevelSelect_ReadMap( new Uint8Array( [ 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ] ) ), null, 'not a map' );
	const cut = bsp( ents( 'x', 'info_player_start' ) ); new DataView( cut.buffer ).setInt32( 8, 99999, true );
	same( LevelSelect_ReadMap( cut ), null, 'an entity lump past the end of the file' );

} );

Deno.test( 'maps group by their names: introduction, numbered episodes, other levels, final levels, deathmatch', () => {

	const map = ( name, message, start = true, deathmatch = false ) => ( { map: name, info: { message, start, deathmatch } } );
	const t = LevelSelect_AutoTable( [
		map( 'x1m2', 'Power Hungry' ), map( 'x1m1', 'Enter the Unknown.' ), map( 'x2m1', '  Suburban\n Anarchy ' ), map( 'start', 'X-Men Mansion' ), map( 'soeintro', 'Introduction' ),
		map( 'x1end', 'Apocalypse' ), map( 'aopend', 'Legends' ), map( 'xdm1', 'X-tinction', true, true ), map( 'arena', 'Only deathmatch', false, true ), map( 'isle', '' ), map( 'b_shell0', 'Shells', false, false ),
		{ map: 'broken', info: null } ] );
	same( t.episodes.map( e => e.name ).join(), 'Introduction,Episode 1,Episode 2,Levels,Final Levels,Deathmatch', 'the groups in order' );
	const in_ = n => t.levels.filter( l => l.episode === t.episodes.find( e => e.name === n ).episode ).map( l => l.map ).join();
	same( in_( 'Introduction' ), 'start,soeintro', 'start first, then intro maps' );
	same( in_( 'Episode 1' ), 'x1m1,x1m2,x1end', 'episode 1 in order, its numbered end last' );
	same( in_( 'Final Levels' ), 'aopend', 'an unnumbered end' );
	same( in_( 'Deathmatch' ), 'arena,xdm1', 'deathmatch-only maps and dm-named maps' );
	same( in_( 'Levels' ), 'isle', 'an unnumbered level' );
	same( t.levels.find( l => l.map === 'x1m1' ).name, 'Enter the Unknown', 'no trailing full stop' );
	same( t.levels.find( l => l.map === 'x2m1' ).name, 'Suburban Anarchy', 'one line, single spaces' );
	same( t.levels.find( l => l.map === 'isle' ).name, 'isle', 'a blank message: the file name' );
	check( ! t.levels.some( l => l.map === 'b_shell0' || l.map === 'broken' ), 'props and unreadable maps are left out' );
	same( LevelSelect_AutoTable( [ map( 'b_x', 'prop', false, false ) ] ), null, 'no levels: no table' );
	const tidy = LevelSelect_AutoTable( [ map( 'd3b', 'SECRET MISSIONS' ), map( 'e2', 'the blackness beneath' ), map( 'soeintro', 'Soul of Evil - Introduction' ), map( 'soeexit', 'Soul of Evil - Epilogue' ), map( 'r1', 'Base - Alpha' ), map( 'r2', 'Mixed Case Kept' ), map( 'd14', 'B.O.S.S. HQ' ), map( 'd5', 'THE FLOOD OF DOOM' ) ] );
	const name = m => tidy.levels.find( l => l.map === m ).name;
	same( name( 'd3b' ), 'Secret Missions', 'all capitals: title case' ); same( name( 'e2' ), 'The Blackness Beneath', 'all lower case: title case' );
	same( name( 'soeintro' ), 'Introduction', 'a prefix several maps share is the game\'s name: dropped' ); same( name( 'soeexit' ), 'Epilogue', 'and for each' );
	same( name( 'r1' ), 'Base - Alpha', 'a prefix only one map has stays' ); same( name( 'r2' ), 'Mixed Case Kept', 'mixed case stays as written' );
	same( name( 'd14' ), 'B.O.S.S. HQ', 'initials and short capitals stay' ); same( name( 'd5' ), 'The Flood of Doom', 'small words lower but the first' );

} );

Deno.test( 'a long group is split into pages of at most 14; the table is built from the game\'s own packs, later packs winning', () => {

	const many = Array.from( { length: 20 }, ( _, i ) => ( { map: 'd' + ( i + 1 ), info: { message: 'Mission ' + ( i + 1 ), start: true, deathmatch: false } } ) );
	const t = LevelSelect_AutoTable( many );
	same( t.episodes.map( e => e.name ).join(), 'Levels,Levels (2)', 'two pages' );
	same( t.episodes[ 0 ].episode, 1, 'with no introduction the first group is still number 1, where the menu opens' );
	same( t.levels.filter( l => l.episode === 1 ).length, LEVEL_SELECT_AUTO_PAGE, 'the first holds 14' );
	same( t.levels[ 1 ].map, 'd2', 'natural order: d2 before d10' );
	const pack = ( files ) => { let at = 0; const parts = files.map( ( [ name, data ] ) => { const f = { name, filepos: at, filelen: data.length }; at += data.length; return [ f, data ]; } ); const buf = new Uint8Array( at ); parts.forEach( ( [ f, d ] ) => buf.set( d, f.filepos ) ); return { files: parts.map( p => p[ 0 ] ), data: buf.buffer }; };
	LevelSelect_SetGamePacks( [ pack( [ [ 'maps/start.bsp', bsp( ents( 'Old', 'info_player_start' ) ) ], [ 'maps/b_bh10.bsp', bsp( ents( 'Health' ) ) ] ] ), pack( [ [ 'maps/start.bsp', bsp( ents( 'The Academy', 'info_player_start' ) ) ], [ 'gfx.wad', new Uint8Array( 4 ) ] ] ) ] );
	try {

		const built = LevelSelect_GameTable();
		same( built.levels.map( l => l.map + ':' + l.name ).join(), 'start:The Academy', 'the later pack\'s start, and no prop' );
		check( LevelSelect_GameTable() === built, 'built once and kept' );

	} finally { LevelSelect_SetGamePacks( [] ); }
	same( LevelSelect_GameTable(), null, 'no game packs: no table' );

} );

Deno.test( 'the campaign follows the level exits from start; extras go after it; numbering and names never collide', () => {

	const map = ( name, message, exits = [], start = true ) => ( { map: name, info: { message, start, deathmatch: false, exits } } );
	const t = LevelSelect_AutoTable( [ map( 'csm0__', 'Test' ), map( 'd2', 'Two', [ 'd10' ] ), map( 'start', 'Academy', [ 'd1' ] ), map( 'd1', 'One', [ 'd2' ] ), map( 'd10', 'Ten', [ 'start' ] ), map( 'show1', 'Show' ) ] );
	same( t.episodes.map( e => e.episode + ':' + e.name ).join(), '0:Introduction,1:Levels,2:Other Levels', 'intro 0, then from 1' );
	same( t.levels.filter( l => l.episode === 1 ).map( l => l.map ).join(), 'd1,d2,d10', 'in the order the exits lead' );
	same( t.levels.filter( l => l.episode === 2 ).map( l => l.map ).join(), 'csm0__,show1', 'test maps no exit reaches, after the campaign' );
	const ad = LevelSelect_AutoTable( [ map( 'ad_e1m1', 'Hanger 16' ), map( 'ad_s1m1', 'Slipgate' ), map( 'e01m1', 'Zero One' ), map( 'e1m2', 'One Two' ) ] );
	same( ad.episodes.map( e => e.name ).join(), 'AD_E1,AD_S1,E1', 'series sharing a number are named apart; e01 and e1 are one' );
	same( ad.levels.filter( l => l.episode === ad.episodes[ 2 ].episode ).map( l => l.map ).join(), 'e01m1,e1m2', 'e01m1 and e1m2 together' );
	const big = LevelSelect_AutoTable( [ map( 'e3000m1', 'Far' ), map( 'zfinal', 'Last' ) ] );
	same( big.episodes.map( e => e.name ).join(), 'Episode 3000,Final Levels', 'a large number stays before the final levels' );
	const caps = LevelSelect_AutoTable( [ map( 'a', 'IT IS ON' ), map( 'b', 'PART III' ), map( 'c', 'X-MEN BASE' ) ] ), named = m => caps.levels.find( l => l.map === m ).name;
	same( named( 'a' ), 'It Is on', 'two-letter words with vowels in title case' ); same( named( 'b' ), 'Part III', 'Roman numerals kept' ); same( named( 'c' ), 'X-Men Base', 'after a hyphen too' );

} );

Deno.test( 'only map names the map command takes whole are offered; the app\'s own packs are those under the game\'s id', () => {

	const pack = files => { let at = 0; const parts = files.map( ( [ name, data ] ) => { const f = { name, filepos: at, filelen: data.length }; at += data.length; return [ f, data ]; } ); const buf = new Uint8Array( at ); parts.forEach( ( [ f, d ] ) => buf.set( d, f.filepos ) ); return { files: parts.map( p => p[ 0 ] ), data: buf.buffer }; };
	LevelSelect_SetGamePacks( [ pack( [ [ 'maps/my map;echo injected.bsp', bsp( ents( 'Bad', 'info_player_start' ) ) ], [ 'maps/good_1.bsp', bsp( ents( 'Good', 'info_player_start' ) ) ] ] ) ] );
	try { same( LevelSelect_GameTable().levels.map( l => l.map ).join(), 'good_1', 'a name with a space or ; is left out' ); } finally { LevelSelect_SetGamePacks( [] ); }
	const packs = [ { filename: 'quake/pak0.pak' }, { filename: 'quoth/loose' }, { filename: 'quoth/pak0.pak' }, { filename: 'quoth_2/pak0.pak' } ];
	same( LevelSelect_OwnPacks( packs, 'quoth' ).map( p => p.filename ).join(), 'quoth/loose,quoth/pak0.pak', 'its own packs, not Quake\'s or another game\'s' );

} );
