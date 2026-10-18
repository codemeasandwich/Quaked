// Hexen II file layout (src/engine/common/hexen2_filesystem.js): native precedence (corrected overlay, expansion loose,
// expansion PAKs high to low, base loose, base PAKs high to low), pak0..pak9 probed across gaps, case-insensitive names
// with later entries in one pack winning, an effective manifest with provenance, the program-header layout check and
// edition detection that refuses mixed editions. Plan sections 3 and 4 (T01/T02 prerequisites).
import { openSync, readSync, closeSync, existsSync, readFileSync } from './helpers/resource_fs.mjs';
import {
	Hexen2_OrderedPakNumbers, Hexen2_BuildLayers, Hexen2_ResolveFile, Hexen2_Manifest, Hexen2_ReadProgHeader,
	Hexen2_DetectEdition, HEXEN2_PAK_LIMIT, HEXEN2_REQUIRED_BASE_FILES
} from '../src/engine/common/hexen2_filesystem.js';
import { HEXEN2_LAYOUT_CRCS } from '../src/engine/common/hexen2_profile.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const throws = ( fn, m ) => { try { fn(); } catch { return; } throw new Error( 'expected a throw: ' + m ); };

// A structurally valid progs.dat header with the given layout CRC and a 4 KB body to hold every section.
function progBytes( crc ) {

	const bytes = new Uint8Array( 4096 ), view = new DataView( bytes.buffer );
	const header = [ 6, crc, 60, 1, 68, 1, 76, 1, 84, 1, 120, 4, 124, 8, 8 ];
	header.forEach( ( value, i ) => view.setInt32( i * 4, value, true ) );
	return bytes;

}
const baseFiles = [ ...HEXEN2_REQUIRED_BASE_FILES, 'maps/demo1.bsp', 'default.cfg' ];

Deno.test( 'paks are ordered highest first across gaps, and only 0..9 are accepted', () => {

	same( Hexen2_OrderedPakNumbers( [ 0, 3, 9 ] ).join( ',' ), '9,3,0', 'descending with gaps kept' );
	same( Hexen2_OrderedPakNumbers( [ 1, 1, 0, 1 ] ).join( ',' ), '1,0', 'duplicates dropped' );
	same( Hexen2_OrderedPakNumbers( [] ).length, 0, 'no packs' );
	throws( () => Hexen2_OrderedPakNumbers( [ HEXEN2_PAK_LIMIT ] ), 'pak10 is outside the supported layout' );
	throws( () => Hexen2_OrderedPakNumbers( [ -1 ] ), 'a negative pak number' );
	throws( () => Hexen2_OrderedPakNumbers( [ 1.5 ] ), 'a fractional pak number' );

} );

Deno.test( 'the native precedence holds tier by tier, and the corrected overlay wins everything', () => {

	const base = { loose: [ 'progs.dat', 'strings.txt' ], paks: [ { number: 0, files: [ 'maps/demo1.bsp', 'progs.dat' ] } ] };
	const expansion = { loose: [ 'progs.dat', 'puzzles.txt' ], paks: [ { number: 3, files: [ 'progs.dat', 'maps/keep1.bsp' ] } ] };
	const layers = Hexen2_BuildLayers( { base, expansion } );
	same( layers.map( l => l.tier ).join( '>' ), 'expansion-loose>expansion-pak>base-loose>base-pak', 'tier order' );
	same( Hexen2_ResolveFile( layers, 'progs.dat' ).tier, 'expansion-loose', 'expansion loose progs wins' );
	same( Hexen2_ResolveFile( layers, 'maps/keep1.bsp' ).tier, 'expansion-pak', 'expansion pack map' );
	same( Hexen2_ResolveFile( layers, 'strings.txt' ).tier, 'base-loose', 'base loose file' );
	same( Hexen2_ResolveFile( layers, 'maps/demo1.bsp' ).tier, 'base-pak', 'base pack map' );
	const overlay = Hexen2_BuildLayers( { overlay: [ 'progs.dat' ], base, expansion } );
	same( Hexen2_ResolveFile( overlay, 'progs.dat' ).tier, 'corrected-overlay', 'the corrected overlay wins' );
	same( Hexen2_ResolveFile( overlay, 'progs.dat' ).source, 'corrected gamecode overlay', 'overlay provenance' );
	same( Hexen2_ResolveFile( layers, 'maps/none.bsp' ), null, 'an absent file resolves to null' );

} );

Deno.test( 'names match case-insensitively and a later entry in one pack wins, as native sequential loading does', () => {

	const layers = Hexen2_BuildLayers( { base: { loose: [], paks: [ { number: 2, files: [ 'Progs.Dat', 'maps/A.bsp', 'MAPS/a.BSP' ] } ] } } );
	same( Hexen2_ResolveFile( layers, 'progs.dat' ).name, 'Progs.Dat', 'case-insensitive match keeps the packed spelling' );
	same( Hexen2_ResolveFile( layers, 'maps/a.bsp' ).name, 'MAPS/a.BSP', 'the later duplicate in the pack wins' );
	check( Hexen2_ResolveFile( layers, 'PROGS.DAT' ) !== null, 'upper-case lookup works' );

} );

Deno.test( 'the corrected overlay may carry only its approved program outputs', () => {

	throws( () => Hexen2_BuildLayers( { overlay: [ 'maps/demo1.bsp' ] } ), 'a map in the corrected overlay' );
	throws( () => Hexen2_BuildLayers( { overlay: [ 'strings.txt' ] } ), 'strings in the corrected overlay' );
	const ok = Hexen2_BuildLayers( { overlay: [ 'progs.dat', 'progs2.dat' ] } );
	same( ok[ 0 ].files.size, 2, 'the two program outputs are admitted' );
	same( Hexen2_ResolveFile( ok, 'progs2.dat' ).tier, 'corrected-overlay', 'progs2.dat resolves from the overlay' );

} );

Deno.test( 'the effective manifest lists each winning file once, sorted, with a stable digest', () => {

	const layers = Hexen2_BuildLayers( {
		base: { loose: [ 'strings.txt' ], paks: [ { number: 1, files: [ 'strings.txt', 'maps/demo1.bsp' ] }, { number: 0, files: [ 'maps/start.bsp' ] } ] }
	} );
	const manifest = Hexen2_Manifest( layers );
	same( manifest.count, 3, 'three distinct logical files' );
	same( manifest.files.map( f => f.name ).join( ',' ), 'maps/demo1.bsp,maps/start.bsp,strings.txt', 'sorted' );
	same( manifest.files[ 2 ].tier, 'base-loose', 'the loose strings.txt wins over the pack' );
	same( Hexen2_Manifest( layers ).digest, manifest.digest, 'the digest is stable' );
	const changed = Hexen2_Manifest( Hexen2_BuildLayers( { base: { loose: [ 'strings.txt' ], paks: [ { number: 1, files: [ 'maps/demo1.bsp', 'maps/eidolon.bsp' ] }, { number: 0, files: [ 'maps/start.bsp' ] } ] } } ) );
	check( changed.digest !== manifest.digest, 'a changed file set changes the digest' );

} );

Deno.test( 'the program header check accepts both supplied layouts and rejects malformed ones', () => {

	const base = Hexen2_ReadProgHeader( progBytes( HEXEN2_LAYOUT_CRCS.base ) );
	same( base.version, 6, 'version' );
	same( base.layout, 'hexen2-base', 'base layout' );
	same( base.entityFields, 8, 'entity fields' );
	same( Hexen2_ReadProgHeader( progBytes( HEXEN2_LAYOUT_CRCS.portals ) ).layout, 'hexen2-portals', 'portal layout' );
	same( Hexen2_ReadProgHeader( progBytes( 5927 ) ).layout, 'unknown', 'an unrecognised CRC is reported, not guessed' );
	throws( () => Hexen2_ReadProgHeader( new Uint8Array( 20 ) ), 'a truncated header' );
	const badVersion = progBytes( HEXEN2_LAYOUT_CRCS.base ); new DataView( badVersion.buffer ).setInt32( 0, 5, true );
	throws( () => Hexen2_ReadProgHeader( badVersion ), 'version 5' );
	const badCount = progBytes( HEXEN2_LAYOUT_CRCS.base ); new DataView( badCount.buffer ).setInt32( 12, 0, true );
	throws( () => Hexen2_ReadProgHeader( badCount ), 'a zero statement count' );
	const pastEnd = progBytes( HEXEN2_LAYOUT_CRCS.base ); new DataView( pastEnd.buffer ).setInt32( 16, 60 + 8 + 8 + 8 + 36 + 4, true ); new DataView( pastEnd.buffer ).setInt32( 24, 100000, true );
	throws( () => Hexen2_ReadProgHeader( pastEnd ), 'globals running past the file' );

} );

Deno.test( 'edition detection proves the program layout and refuses mixed editions', () => {

	const base = { files: baseFiles, progsHeader: Hexen2_ReadProgHeader( progBytes( HEXEN2_LAYOUT_CRCS.base ) ) };
	const expansion = { files: [ 'progs.dat', 'puzzles.txt', 'maps/keep1.bsp' ], progsHeader: Hexen2_ReadProgHeader( progBytes( HEXEN2_LAYOUT_CRCS.portals ) ) };
	const detected = Hexen2_DetectEdition( { base } );
	check( detected.ok, detected.reason );
	same( detected.edition, 'base', 'base edition' );
	same( detected.gameId, 'hexen2', 'base id' );
	const portals = Hexen2_DetectEdition( { base, expansion } );
	check( portals.ok, portals.reason );
	same( portals.edition, 'portals', 'Portal edition' );
	same( portals.classes.length, 5, 'Portal classes include the Succubus' );
	same( Hexen2_DetectEdition( { base, expansion: { ...expansion, progsHeader: Hexen2_ReadProgHeader( progBytes( HEXEN2_LAYOUT_CRCS.base ) ) } } ).ok, false, 'a base program as the expansion is mixed editions' );
	same( Hexen2_DetectEdition( { base: null, expansion } ).ok, false, 'an expansion without a base installation is refused' );
	const missing = Hexen2_DetectEdition( { base: { files: [ 'progs.dat' ], progsHeader: base.progsHeader } } );
	check( ! missing.ok && /missing/.test( missing.reason ), 'required base files are proven' );
	const unsupported = Hexen2_DetectEdition( { base: { files: baseFiles, progsHeader: Hexen2_ReadProgHeader( progBytes( 5927 ) ) } } );
	check( ! unsupported.ok && /unsupported base layout CRC 5927/.test( unsupported.reason ), 'an unrecognised layout is refused with its CRC' );

} );

Deno.test( 'the demo edition needs the pinned archive signature and a version 6 program', () => {

	const signature = { entries: 797, directoryCrc: 22780, bytes: 27750257 };
	const demo = Hexen2_DetectEdition( { demo: { ...signature, progsHeader: Hexen2_ReadProgHeader( progBytes( 0 ) ) } } );
	check( demo.ok, demo.reason );
	same( demo.edition, 'demo', 'demo edition' );
	same( demo.classes.length, 4, 'the demo keeps the native class restrictions' );
	check( ! Hexen2_DetectEdition( { demo: { ...signature, entries: 798, progsHeader: Hexen2_ReadProgHeader( progBytes( 0 ) ) } } ).ok, 'a mismatched entry count is refused' );
	check( ! Hexen2_DetectEdition( { demo: { ...signature, bytes: 1, progsHeader: Hexen2_ReadProgHeader( progBytes( 0 ) ) } } ).ok, 'a mismatched size is refused' );
	check( ! Hexen2_DetectEdition( { demo: signature } ).ok, 'a demo without a validated program is refused' );

} );

// The owner's supplied installation (plan input inventory ownedFixtureIdentity): read-only, and skipped when absent.
Deno.test( 'the supplied base and Portal installations resolve through the native precedence and are detected', async () => {

	const BASE = '/Users/bri/quaked/Hexen 2';
	if ( ! existsSync( BASE + '/data1/progs.dat' ) || ! existsSync( BASE + '/portals/progs.dat' ) ) {

		console.log( 'SKIP: the supplied Hexen II installation is not present at ' + BASE );
		return;

	}
	// Native sequential loading lets a later duplicate in one pack win (the supplied pak1 repeats three members), so
	// this reader keeps the last occurrence; the shared offline preparation helper rightly refuses duplicates.
	const names = path => {

		const fd = openSync( path, 'r' );
		try {

			const header = Buffer.alloc( 12 ); readSync( fd, header, 0, 12, 0 );
			same( header.toString( 'ascii', 0, 4 ), 'PACK', 'a PAK at ' + path );
			const start = header.readUInt32LE( 4 ), length = header.readUInt32LE( 8 );
			const directory = Buffer.alloc( length ); readSync( fd, directory, 0, length, start );
			const last = new Map();
			for ( let at = 0; at < length; at += 64 ) {

				const text = directory.subarray( at, at + 56 ), end = text.indexOf( 0 );
				const name = text.subarray( 0, end < 0 ? 56 : end ).toString( 'latin1' );
				last.set( name, true );

			}
			return [ ...last.keys() ];

		} finally { closeSync( fd ); }

	};
	const basePaks = [
		{ number: 0, files: await names( BASE + '/data1/pak0.pak' ) },
		{ number: 1, files: await names( BASE + '/data1/pak1.pak' ) }
	];
	const expansionPaks = [ { number: 3, files: await names( BASE + '/portals/pak3.pak' ) } ];
	const baseLoose = [ 'progs.dat', 'progs2.dat', 'strings.txt', 'hexen.rc', 'default.cfg' ].filter( f => existsSync( BASE + '/data1/' + f ) );
	const expansionLoose = [ 'progs.dat', 'puzzles.txt', 'strings.txt', 'hexen.rc', 'default.cfg' ].filter( f => existsSync( BASE + '/portals/' + f ) );
	const baseHeader = Hexen2_ReadProgHeader( readFileSync( BASE + '/data1/progs.dat' ) );
	const expansionHeader = Hexen2_ReadProgHeader( readFileSync( BASE + '/portals/progs.dat' ) );
	same( baseHeader.crc, HEXEN2_LAYOUT_CRCS.base, 'the supplied base program header CRC' );
	same( expansionHeader.crc, HEXEN2_LAYOUT_CRCS.portals, 'the supplied Portal program header CRC' );

	const layers = Hexen2_BuildLayers( {
		base: { loose: baseLoose, paks: basePaks },
		expansion: { loose: expansionLoose, paks: expansionPaks }
	} );
	const progs = Hexen2_ResolveFile( layers, 'progs.dat' );
	same( progs.tier, 'expansion-loose', 'the Portal loose progs.dat wins over the base one' );
	check( Hexen2_Manifest( layers ).files.some( f => f.name.toLowerCase() === 'maps/demo1.bsp' ), 'the base demo map is in the manifest' );
	const baseOnly = Hexen2_DetectEdition( { base: { files: [ ...baseLoose, ...basePaks.flatMap( p => p.files ) ], progsHeader: baseHeader } } );
	check( baseOnly.ok, baseOnly.reason );
	same( baseOnly.edition, 'base', 'the base installation is detected' );
	const portals = Hexen2_DetectEdition( {
		base: { files: [ ...baseLoose, ...basePaks.flatMap( p => p.files ) ], progsHeader: baseHeader },
		expansion: { files: [ ...expansionLoose, ...expansionPaks.flatMap( p => p.files ) ], progsHeader: expansionHeader }
	} );
	check( portals.ok, portals.reason );
	same( portals.edition, 'portals', 'the Portal installation over its base is detected' );

} );
