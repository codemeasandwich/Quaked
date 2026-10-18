// Hexen II session identity (src/engine/common/hexen2_profile.js): the three public editions and their native classes,
// the gamecode layouts read from the supplied installs, the private session protocol, and the descriptor rules the
// plan fixes (Corrected/Classic by default, Installed keeps native rules, Enhanced rules are Corrected single-player
// only, presentation and content root never enter the simulation digest). Plan sections 3 and 7 (R12/R23).
import {
	HEXEN2_FAMILY, HEXEN2_PROTOCOL, HEXEN2_PROFILES, HEXEN2_LAYOUT_CRCS, HEXEN2_SIMULATION_FEATURES,
	Hexen2_Profile, Hexen2_IsGameId, Hexen2_ClassesFor, Hexen2_ClassesForEdition,
	Hexen2_CreateSession, Hexen2_ValidateSession, Hexen2_SimulationDigest, Hexen2_EnhancedRules
} from '../src/engine/common/hexen2_profile.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const legal = { gameId: 'hexen2', contentRoot: 'owned-base', gamecodeDigest: 'a'.repeat( 16 ) };

Deno.test( 'the three public Hexen II editions carry their native classes and pinned layout CRCs', () => {

	same( HEXEN2_PROFILES.hexen2.edition, 'base', 'base edition' );
	same( HEXEN2_PROFILES[ 'hexen2-portals' ].edition, 'portals', 'expansion edition' );
	same( HEXEN2_PROFILES[ 'hexen2-demo' ].edition, 'demo', 'demo edition' );
	for ( const id of [ 'hexen2', 'hexen2-portals', 'hexen2-demo' ] ) check( Hexen2_IsGameId( id ), id + ' is a Hexen II game' );
	check( ! Hexen2_IsGameId( 'quake' ), 'Quake is not a Hexen II game' );
	same( Hexen2_Profile( 'hexen2' ).layoutCrc, HEXEN2_LAYOUT_CRCS.base, 'base layout CRC' );
	same( HEXEN2_LAYOUT_CRCS.base, 38488, 'the supplied base program header CRC' );
	same( HEXEN2_LAYOUT_CRCS.portals, 26905, 'the supplied Portal program header CRC' );
	const base = Hexen2_ClassesFor( 'hexen2' ), portals = Hexen2_ClassesFor( 'hexen2-portals' );
	same( base.length, 4, 'four base classes' );
	same( portals.length, 5, 'five Portal classes' );
	same( portals[ 4 ].id, 'succubus', 'Succubus is the expansion class' );
	check( portals[ 4 ].expansionOnly, 'Succubus is expansion-only' );
	same( Hexen2_ClassesForEdition( 'demo' ).length, 4, 'the demo carries the four base classes' );
	same( Hexen2_ClassesForEdition( 'nonsense' ).length, 0, 'an unknown edition offers nothing' );
	same( Hexen2_ClassesFor( 'quake' ).length, 0, 'a non-Hexen id offers nothing' );

} );

Deno.test( 'the private session protocol is 1019 quaked-hexen2-v1 with demo readers 18 and 19', () => {

	same( HEXEN2_PROTOCOL.number, 1019, 'the private live protocol number' );
	same( HEXEN2_PROTOCOL.version, 'quaked-hexen2-v1', 'the private protocol version' );
	same( HEXEN2_PROTOCOL.demoVersions.join( ',' ), '18,19', 'the replay-only native demo protocols' );
	check( Object.isFrozen( HEXEN2_PROTOCOL.demoVersions ), 'the demo versions are frozen' );

} );

Deno.test( 'a new run defaults to Corrected gamecode and the Classic rules preset', () => {

	const created = Hexen2_CreateSession( legal );
	check( created.ok, created.reason );
	same( created.session.gamecodeMode, 'corrected', 'gamecode default' );
	same( created.session.rules, 'classic', 'rules default' );
	same( created.session.family, HEXEN2_FAMILY, 'family' );
	same( created.session.edition, 'base', 'edition comes from the game id' );
	same( created.session.protocol, 1019, 'protocol' );
	check( HEXEN2_SIMULATION_FEATURES.every( key => created.session.features[ key ] === false ), 'the SP features start off' );
	check( Object.isFrozen( created.session ), 'the descriptor is frozen' );

} );

Deno.test( 'the simulation digest covers the simulation fields and excludes content root and presentation', () => {

	const a = Hexen2_CreateSession( legal ).session;
	const b = Hexen2_CreateSession( { ...legal, contentRoot: 'another-owned-root' } ).session;
	same( a.digest, b.digest, 'the content root does not change the simulation identity' );
	same( Hexen2_SimulationDigest( a ), a.digest, 'the digest is reproducible' );
	const changed = Hexen2_CreateSession( { ...legal, gamecodeDigest: 'b'.repeat( 16 ) } ).session;
	check( changed.digest !== a.digest, 'a different gamecode digest changes the simulation identity' );
	const enhanced = Hexen2_CreateSession( { ...legal, rules: 'enhanced' } ).session;
	check( enhanced.digest !== a.digest, 'a different rules preset changes the simulation identity' );
	same( enhanced.features.sp_fire_quench, false, 'the SP features are opt-in even under Enhanced' );

} );

Deno.test( 'Installed gamecode keeps its native rules: Enhanced is refused, not silently weakened', () => {

	const created = Hexen2_CreateSession( { ...legal, gamecodeMode: 'installed', rules: 'enhanced' } );
	check( ! created.ok, 'Installed + Enhanced is refused' );
	check( /Installed gamecode/.test( created.reason ), 'the reason names the installed/native rule' );
	const installed = Hexen2_CreateSession( { ...legal, gamecodeMode: 'installed', gamecodeDigest: '' } );
	check( installed.ok, installed.reason );
	same( installed.session.rules, 'classic', 'installed runs native rules' );

} );

Deno.test( 'the SP simulation features are Corrected Enhanced single-player only', () => {

	for ( const key of HEXEN2_SIMULATION_FEATURES ) {

		const onClassic = Hexen2_CreateSession( { ...legal, features: { [ key ]: true } } );
		check( ! onClassic.ok, key + ' is refused under Classic rules' );
		const onInstalled = Hexen2_CreateSession( { ...legal, gamecodeMode: 'installed', gamecodeDigest: '', rules: 'classic', features: { [ key ]: true } } );
		check( ! onInstalled.ok, key + ' is refused with installed gamecode' );
		const onEnhanced = Hexen2_CreateSession( { ...legal, rules: 'enhanced', features: { [ key ]: true } } );
		check( onEnhanced.ok, key + ': ' + onEnhanced.reason );
		check( Hexen2_EnhancedRules( onEnhanced.session ), key + ' runs under Enhanced rules' );

	}
	const unknown = Hexen2_CreateSession( { ...legal, features: { sp_invented: true } } );
	check( ! unknown.ok, 'an unknown feature is refused, never dropped' );

} );

Deno.test( 'descriptor validation rejects tampering instead of repairing it', () => {

	const session = Hexen2_CreateSession( legal ).session;
	check( Hexen2_ValidateSession( session ).ok, 'a created descriptor validates' );
	check( ! Hexen2_ValidateSession( { ...session, digest: 'fnv1a32:00000000' } ).ok, 'a forged digest is rejected' );
	check( ! Hexen2_ValidateSession( { ...session, edition: 'portals' } ).ok, 'an edition that does not match the game id is rejected' );
	check( ! Hexen2_ValidateSession( { ...session, protocol: 15 } ).ok, 'a Quake protocol is rejected' );
	check( ! Hexen2_ValidateSession( { ...session, protocolVersion: undefined } ).ok, 'a descriptor without protocol identity is rejected' );
	check( ! Hexen2_ValidateSession( { ...session, gamecodeMode: 'corrected', gamecodeDigest: '' } ).ok, 'Corrected without a program digest is rejected' );
	check( ! Hexen2_ValidateSession( { ...session, contentRoot: '' } ).ok, 'an empty content root is rejected' );
	check( ! Hexen2_ValidateSession( { ...session, contentRoot: 'bad\u0000token' } ).ok, 'a content root with a control character is rejected' );

} );

Deno.test( 'the legal descriptor accepts a lowered hex digest and refuses a malformed one', () => {

	const upper = Hexen2_CreateSession( { ...legal, gamecodeDigest: 'ABCDEF0123456789' } );
	check( upper.ok, upper.reason );
	same( upper.session.gamecodeDigest, 'abcdef0123456789', 'the digest is normalised to lower case' );
	const short = Hexen2_CreateSession( { ...legal, gamecodeDigest: 'abc' } );
	check( ! short.ok, 'a short digest is refused' );
	const nonHex = Hexen2_CreateSession( { ...legal, gamecodeDigest: 'zzzzzzzzzzzzzzzz' } );
	check( ! nonHex.ok, 'a non-hexadecimal digest is refused' );

} );
