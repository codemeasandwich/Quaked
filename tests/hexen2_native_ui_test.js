// Retroactive controls for the code-first native host wiring: start-gate defaults, the local sound bridge (server write
// first, precache cache, mixer arguments, graceful missing/failing wire) and the charset sheet width that scrambled the
// HUD glyphs when Hexen's 256x128 sheet was read as Quake's 128x128.
import { Hexen2_StartChoice, Hexen2_LocalSoundArgs, Hexen2_PlayLocalSound, Hexen2_ViewModelAngles, Hexen2_ViewModelOrigin, HEXEN2_START_CLASSES, HEXEN2_VIEWMODEL_LIFT } from '../src/engine/client/hexen2_native_ui.js';
import { Hexen2_CharsetColumns, Hexen2_SmallFontIndex } from '../src/engine/common/hexen2_charset.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the start gate defaults, the sound bridge and the charset width behave natively', () => {

	same( JSON.stringify( Hexen2_StartChoice() ), JSON.stringify( { classId: 'paladin', skill: 1 } ), 'empty choice' );
	same( JSON.stringify( Hexen2_StartChoice( { classId: 'assassin', skill: 0 } ) ), JSON.stringify( { classId: 'assassin', skill: 0 } ), 'valid choice' );
	same( Hexen2_StartChoice( { classId: 'succubus', skill: 9 } ).classId, 'paladin', 'invalid class falls back' );
	same( Hexen2_StartChoice( { classId: 'crusader', skill: 9 } ).skill, 1, 'invalid skill falls back' );
	same( HEXEN2_START_CLASSES.length, 4, 'four base classes' );
	same( JSON.stringify( Hexen2_ViewModelAngles( [ 10, 65, 0 ] ) ), JSON.stringify( [ -10, 65, 0 ] ), 'viewmodel pitch is negated' );
	same( HEXEN2_VIEWMODEL_LIFT, 8, 'the lift clears the status bar' );
	same( JSON.stringify( Hexen2_ViewModelOrigin( [ 1, 2, 3 ], [ 0, 0, 50 ] ) ), JSON.stringify( [ 1, 2, 61 ] ), 'viewmodel origin at eye + lift' );

	same( Hexen2_CharsetColumns( 32768 ), 32, 'Hexen 256x128' );
	same( Hexen2_CharsetColumns( 16384 ), 16, 'Quake 128x128' );
	same( Hexen2_CharsetColumns( 1024 ), 0, 'too short' );
	same( Hexen2_SmallFontIndex( 32 ), 0, 'space' );
	same( Hexen2_SmallFontIndex( 65 ), 33, 'uppercase A stays in the sheet' );
	same( Hexen2_SmallFontIndex( 97 ), 33, 'lowercase a maps down' );
	same( Hexen2_SmallFontIndex( 96 ), 0, 'backtick is blank' );
	same( Hexen2_SmallFontIndex( 48 ), 16, 'digit 0' );

	const entity = { index: 7, v: { origin: [ 1, 2, 3 ] } };
	same( JSON.stringify( Hexen2_LocalSoundArgs( entity, 255, 1.5 ) ), JSON.stringify( { entnum: 7, origin: [ 1, 2, 3 ], fvol: 1, attenuation: 1.5 } ), 'full volume' );
	same( Hexen2_LocalSoundArgs( null, 128, 1 ).fvol, 128 / 255, 'half volume normalised' );

	const calls = [];
	const cache = new Map();
	const deps = { wire: ( ...args ) => calls.push( [ 'wire', ...args ] ), precache: name => { calls.push( [ 'precache', name ] ); return { name }; }, start: ( ...args ) => calls.push( [ 'start', ...args ] ), cache };
	const first = Hexen2_PlayLocalSound( entity, 2, 'spider/step1.wav', 200, 1, deps );
	check( first.ok, first.reason );
	const second = Hexen2_PlayLocalSound( entity, 2, 'spider/step1.wav', 200, 1, deps );
	check( second.ok, second.reason );
	same( calls.filter( call => call[ 0 ] === 'precache' ).length, 1, 'the sfx is precached once' );
	same( calls[ 0 ][ 0 ], 'wire', 'the server message is written first' );
	const start = calls.find( call => call[ 0 ] === 'start' );
	same( start[ 1 ], 7, 'the sound is spatialised at the entity' );
	same( start[ 5 ], 200 / 255, 'the mixer volume' );

	const failing = { wire: () => { throw new Error( 'server buffer full' ); }, precache: () => null, start: () => { throw new Error( 'must not start' ); } };
	const missing = Hexen2_PlayLocalSound( entity, 0, 'missing.wav', 255, 1, failing );
	same( missing.ok, false, 'a missing sound is reported' );
	const recovered = Hexen2_PlayLocalSound( entity, 0, 'ok.wav', 255, 1, { ...failing, precache: () => ( { name: 'ok' } ), start: () => {} } );
	same( recovered.ok, true, 'a failing server write does not stop local playback' );

} );
