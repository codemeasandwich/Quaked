// Newer Game's gameplay hooks apply on stock QuakeC: id's 1.06 progs.dat and the 2021 re-release's
// (src/engine/progs/progs.js PR_StockProgs; docs/stock-progs-2026-10-14.md). Until 14 October 2026 they demanded the
// 1.06 file's CRC alone, so in the app, which plays the owner's own (re-release) Quake, the shotgun's pellets, the
// face's water and reactions, respawn, Rend the Veil, axe cuts and the rest were all silently off.
import { readFileSync, readdirSync, existsSync } from './helpers/resource_fs.mjs';
const progs = await import( '../src/engine/progs/progs.js' );
const { CRC_Init, CRC_ProcessByte, CRC_Value } = await import( '../src/engine/common/crc.js' );
const { pakDirectory, readMember } = await import( '../tools/pak_members.mjs' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ), 'utf8' );
const GATED = [ 'src/newer/gameplay/sv_faceevents.js', 'src/newer/gameplay/sv_respawn.js', 'src/newer/gameplay/sv_axecut.js',
	'src/newer/gameplay/sv_rendveil.js', 'src/newer/gameplay/sv_unseen.js', 'src/newer/gameplay/sv_firequench.js',
	'src/newer/gameplay/sv_pronezombie.js', 'src/newer/gameplay/sv_meleespray.js', 'src/newer/gameplay/sv_teleporttrain.js',
	'src/engine/server/sv_cloak.js', 'src/engine/server/sv_main.js' ];

Deno.test( 'stock QuakeC is the 1.06 progs.dat or the 2021 re-release\'s; anything else is not', () => {

	const before = progs.pr_crc;
	try {

		for ( const [ crc, stock ] of [ [ 24778, true ], [ 59507, true ], [ 12345, false ], [ 0, false ] ] ) {

			progs.PR_SetCRC( crc );
			same( progs.PR_StockProgs(), stock, 'CRC ' + crc );

		}

	} finally { progs.PR_SetCRC( before ); }

} );

Deno.test( 'on the re-release\'s QuakeC the gameplay additions are on in a local Newer Game, and off on a mod\'s', async () => {

	const { sv, svs } = await import( '../src/engine/server/server.js' );
	const { cls } = await import( '../src/engine/client/client.js' );
	const cvar = await import( '../src/engine/common/cvar.js' ), { r_hdr } = await import( '../src/newer/render/gl_post.js' );
	if ( ! cvar.Cvar_FindVar( 'r_hdr' ) ) cvar.Cvar_RegisterVariable( r_hdr );
	const gates = {
		ring: ( await import( '../src/newer/gameplay/sv_unseen.js' ) ).SV_UnseenActive,
		proneZombies: ( await import( '../src/newer/gameplay/sv_pronezombie.js' ) ).SV_ProneZombieActive,
		fireQuench: ( await import( '../src/newer/gameplay/sv_firequench.js' ) ).SV_FireQuenchActive,
		respawn: ( await import( '../src/newer/gameplay/sv_respawn.js' ) ).SV_RespawnAllowed
	};
	const before = { crc: progs.pr_crc, active: sv.active, max: svs.maxclients, demo: cls.demoplayback, state: cls.state, hdr: cvar.Cvar_VariableValue( 'r_hdr' ) };
	try {

		sv.active = true; svs.maxclients = 1; cls.demoplayback = false; cls.state = 2; cvar.Cvar_Set( 'r_hdr', '1' );
		for ( const [ crc, on ] of [ [ 59507, true ], [ 24778, true ], [ 31337, false ] ] ) {

			progs.PR_SetCRC( crc );
			for ( const [ name, gate ] of Object.entries( gates ) ) same( !! gate(), on, `${name} with CRC ${crc}` );

		}

	} finally {

		progs.PR_SetCRC( before.crc ); sv.active = before.active; svs.maxclients = before.max; cls.demoplayback = before.demo; cls.state = before.state; cvar.Cvar_Set( 'r_hdr', String( before.hdr ) );

	}

} );

Deno.test( 'the re-release\'s own builtins exist: finaleFinished (#79, its finale) and localsound (#80)', async () => {

	( await import( '../src/engine/server/pr_cmds.js' ) ).PR_InitBuiltins();
	check( progs.pr_numbuiltins >= 81, 'at least 81 builtins: ' + progs.pr_numbuiltins );
	same( progs.pr_builtins[ 79 ].name, 'PF_finaleFinished', 'builtin #79' );
	same( progs.pr_builtins[ 80 ].name, 'PF_localsound', 'builtin #80' );
	same( progs.pr_builtins[ 78 ].name, 'PF_setspawnparms', 'builtin #78 unchanged' );

} );

Deno.test( 'no gameplay hook tests the CRC itself: every one asks PR_StockProgs', () => {

	for ( const path of GATED ) {

		const source = read( path );
		check( ! /pr_crc\s*[!=<>]=?=?\s*[\w.]+|[\w.]+\s*[!=<>]=?=?\s*pr_crc\b/.test( source.replace( /\/\/.*$|\/\*[\s\S]*?\*\//gm, '' ) ), path + ' compares pr_crc itself' );
		check( source.includes( 'PR_StockProgs()' ), path + ' asks PR_StockProgs' );

	}

} );

// the whole-file CRC as PR_LoadProgs computes it
function crcOf( bytes ) { let crc = CRC_Init(); for ( const b of bytes ) crc = CRC_ProcessByte( crc, b ); return CRC_Value( crc ); }
// a progs.dat's function names (dprograms_t: ofs_functions 8, numfunctions 9, ofs_strings 10; dfunction_t is 36 bytes, s_name at 16)
function functionNames( bytes ) {

	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength ), int = k => view.getInt32( k * 4, true );
	const strings = int( 10 ), names = new Set();
	for ( let k = 0; k < int( 9 ); k ++ ) {

		let at = strings + view.getInt32( int( 8 ) + k * 36 + 16, true ), end = at;
		while ( bytes[ end ] ) end ++;
		names.add( new TextDecoder( 'latin1' ).decode( bytes.subarray( at, end ) ) );

	}
	return names;

}

Deno.test( 'the owner\'s re-release Quake is stock, and has every QuakeC function the gameplay hooks name', async () => {

	// the owner's games (QUAKED_GAME_ROOT; missing there is a failure), else resources/id1 (the runner skips it when absent)
	const root = process.env.QUAKED_GAME_ROOT;
	const folder = root && existsSync( root ) ? readdirSync( root ).find( n => n.toLowerCase() === 'quake' ) ?? 'Quake' : 'Quake';
	const pak = root ? `${root}/${folder}/pak0.pak` : new URL( '../resources/id1/pak0.pak', import.meta.url ).pathname;
	readFileSync( pak, { flag: 'r' } ).subarray( 0, 0 ); // (ENOENT names the missing pak)
	const member = ( await pakDirectory( pak ) ).get( 'progs.dat' );
	const bytes = new Uint8Array( await readMember( member ) );
	const crc = crcOf( bytes );
	check( progs.STOCK_PROGS_CRCS.includes( crc ), 'the owner\'s Quake QuakeC (CRC ' + crc + ') is stock' );
	const names = functionNames( bytes );
	// every quoted QuakeC-looking name in the hooks that the 1.06 QuakeC defines must be in this one too
	const shareware = root && existsSync( `${root}/shareware/pak0.pak` ) ? functionNames( new Uint8Array( await readMember( ( await pakDirectory( `${root}/shareware/pak0.pak` ) ).get( 'progs.dat' ) ) ) ) : null;
	const named = new Set();
	for ( const path of [ ...GATED, 'src/newer/gameplay/sv_shotdelay.js', 'src/newer/gameplay/sv_shotrays.js' ] ) for ( const m of read( path ).matchAll( /['"]([A-Za-z_][A-Za-z0-9_]{2,})['"]/g ) ) named.add( m[ 1 ] );
	const quakec = [ ...named ].filter( n => shareware ? shareware.has( n ) : names.has( n ) );
	check( quakec.length >= 30, 'found the hooks\' QuakeC names: ' + quakec.length );
	const missing = quakec.filter( n => ! names.has( n ) );
	same( missing.join(), '', 'QuakeC functions the hooks name that the re-release lacks' );

} );
