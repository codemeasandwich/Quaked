// Runs the supported source-builder CLI in a fresh temporary cwd. Only the
// fixture catalogue can be rewritten; real PAKs are read via bounded member IO.
// Actual e1m2 BSP/palette data supplies native renderer identity expectations.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from './helpers/resource_fs.mjs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { memberSearch, readMember, sha256 } from '../tools/pak_members.mjs';
import { GL_LoadTexture } from '../src/engine/render/gl_model_common.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import { GAME_CATALOGUE_GAMES } from '../src/engine/common/game_catalogue.js';

const root = resolve( import.meta.dirname, '..' );
const sourceRoot = process.env.QUAKED_GAME_ROOT ? resolve( process.env.QUAKED_GAME_ROOT ) : root;
const basePack = process.env.QUAKED_GAME_ROOT ? resolve( sourceRoot, GAME_CATALOGUE_GAMES.find( g => g.id === 'quake' ).folders.find( f => f.startsWith( 'games/' ) ).slice( 6 ), 'pak0.pak' ) : root + '/resources/id1/pak0.pak';
const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const equal = ( actual, expected, message ) => check( isDeepStrictEqual( actual, expected ), message );
const catalogue = JSON.parse( readFileSync( root + '/newer/textures/index.json' ) );

// Serialize only the real palette and two bounded BSP test members. The second
// map changes selected native texels, exercising new observed identities rather
// than merely running the builder twice over an identical input.
function carrier( entries ) {
	const directory = Buffer.alloc( entries.length * 64 ), payloads = []; let offset = 12;
	entries.forEach( ( [ name, bytes ], i ) => {
		directory.write( name, i * 64, 56, 'ascii' ); directory.writeUInt32LE( offset, i * 64 + 56 ); directory.writeUInt32LE( bytes.length, i * 64 + 60 );
		payloads.push( bytes ); offset += bytes.length;
	} );
	const header = Buffer.alloc( 12 ); header.write( 'PACK' ); header.writeUInt32LE( offset, 4 ); header.writeUInt32LE( directory.length, 8 );
	return Buffer.concat( [ header, ...payloads, directory ] );
}
function textureDirectory( bsp ) {
	const start = bsp.readInt32LE( 20 ), length = bsp.readInt32LE( 24 );
	check( start >= 124 && start + length <= bsp.length, 'bounded original BSP texture lump' );
	const count = bsp.readInt32LE( start ), textures = new Map();
	check( count > 0 && count <= 4096 && 4 + count * 4 <= length, 'bounded texture count' );
	for ( let i = 0; i < count; i ++ ) {
		const offset = bsp.readInt32LE( start + 4 + i * 4 ); if ( offset === -1 ) continue;
		check( offset >= 4 + count * 4 && offset + 40 <= length, 'bounded texture header' );
		const at = start + offset, name = bsp.subarray( at, at + 16 ).toString( 'latin1' ).split( '\0' )[ 0 ];
		const width = bsp.readUInt32LE( at + 16 ), height = bsp.readUInt32LE( at + 20 ), mip = bsp.readUInt32LE( at + 24 );
		check( width && height && mip >= 40 && offset + mip + width * height <= length, 'bounded texture pixels' );
		textures.set( name, { name, width, height, start: at + mip, size: width * height } );
	}
	return textures;
}
function nativeKey( bsp, t ) {
	const texture = GL_LoadTexture( t.name, t.width, t.height, bsp.subarray( t.start, t.start + t.size ), true, false, true );
	try { return R_GlassTextureKey( texture ); }
	finally { texture._fullbright?.dispose(); texture.dispose(); }
}

async function fixture( sourcesLast, run ) {
	const files = await memberSearch( [ basePack ] );
	const palette = await readMember( files.get( 'gfx/palette.lmp' ) ), bsp = await readMember( files.get( 'maps/e1m2.bsp' ) );
	console.log( 'SOURCE_BUILDER_INPUT ' + JSON.stringify( { source_root: sourceRoot, pack: basePack, paletteSha256: sha256( palette ), map: 'maps/e1m2.bsp', mapSha256: sha256( bsp ) } ) );
	VID_SetPalette( palette ); vid.fullbright = 224;
	const textures = textureDirectory( bsp ), guarded = 'metal5_6';
	check( textures.has( guarded ), 'real e1m2 contains known collision name' );
	const available = [ ...textures.keys() ].filter( name => name !== guarded && catalogue.textures[ name ] && ! name.startsWith( '*' ) && ! name.startsWith( 'sky' ) );
	check( available.length > 2, 'two additional real catalogued names available' );
	const inferred = available[ 0 ], emptyGuard = available[ 1 ], authoredKey = nativeKey( bsp, textures.get( guarded ) );
	const modified = Buffer.from( bsp );
	for ( const name of [ guarded, inferred, emptyGuard ] ) {
		const t = textures.get( name ), oldKey = nativeKey( bsp, t );
		for ( let value = 0; value < 256; value ++ ) {
			modified[ t.start ] = value;
			if ( nativeKey( modified, t ) !== oldKey ) break;
		}
		check( nativeKey( modified, t ) !== oldKey, 'second BSP has distinct native pixels for ' + name );
	}
	const seed = structuredClone( catalogue );
	seed.textures.__expansion_alias = 'foreign-authored.webp';
	seed.sources.__expansion_alias = [ '32x64:b15237abb6d97cf1' ];
	seed.sources[ guarded ] = [ authoredKey ]; seed.sources[ emptyGuard ] = []; delete seed.sources[ inferred ];
	seed.ordinaryVariants = { [ guarded ]: { [ nativeKey( modified, textures.get( guarded ) ) ]: { file: 'variant.webp', normal: { file: 'variant-height.webp', strength: 1.2 } } } };
	seed.builderTestMetadata = { purpose: 'must survive source block rewrite', nested: [ 'preserve', 71 ] };
	// Exercise both the historical sources-last convention and a new top-level
	// ordinaryVariants field appended after sources by a catalogue author.
	if ( sourcesLast ) { const sources = seed.sources; delete seed.sources; seed.sources = sources; }
	const directory = mkdtempSync( join( tmpdir(), 'quaked-source-builder-' ) ), indexPath = join( directory, 'newer/textures/index.json' ), packPath = join( directory, 'input.pak' );
	mkdirSync( join( directory, 'newer/textures' ), { recursive: true } );
	const seedText = JSON.stringify( seed, null, 1 ) + '\n', pack = carrier( [ [ 'gfx/palette.lmp', palette ], [ 'maps/e1m2.bsp', bsp ], [ 'maps/identity_modified.bsp', modified ] ] );
	writeFileSync( indexPath, seedText ); writeFileSync( packPath, pack );
	const execute = () => {
		const result = spawnSync( process.execPath, [ root + '/tools/build_texture_sources.mjs', '--pack', packPath ], { cwd: directory, env: process.env, encoding: 'utf8', timeout: 30000 } );
		check( ! result.error && result.status === 0, 'source-builder CLI succeeds: ' + ( result.error || result.stderr || result.stdout ) );
		return { output: result.stdout, text: readFileSync( indexPath, 'utf8' ), json: JSON.parse( readFileSync( indexPath, 'utf8' ) ) };
	};
	try {
		await run( { seed, seedText, inferred, guarded, emptyGuard, authoredKey, expectedNew: [ nativeKey( bsp, textures.get( inferred ) ), nativeKey( modified, textures.get( inferred ) ) ].sort(), excludedKey: nativeKey( modified, textures.get( guarded ) ), execute } );
		same( sha256( readFileSync( packPath ) ), sha256( pack ), 'input PAK remains byte-identical' );
	} finally { rmSync( directory, { recursive: true, force: true } ); }
}

Deno.test( 'source-builder CLI preserves authored expansion and base allowlists, infers only unrecorded native identities and is idempotent', () => fixture( true, async f => {
	const first = f.execute();
	for ( const [ name, keys ] of Object.entries( f.seed.sources ) ) equal( first.json.sources[ name ], keys, 'authored source guard preserved: ' + name );
	equal( first.json.sources[ f.inferred ], f.expectedNew, 'unrecorded name receives both independently observed native identities' );
	check( ! first.json.sources[ f.guarded ].includes( f.excludedKey ), 'existing base allowlist is not widened to another observed picture' );
	equal( first.json.sources[ f.emptyGuard ], [], 'explicit empty guard is not treated as absent' );
	for ( const [ field, value ] of Object.entries( f.seed ) ) if ( field !== 'sources' ) equal( first.json[ field ], value, 'other catalogue field retained: ' + field );
	const marker = ',\n "sources": ';
	same( first.text.slice( 0, first.text.indexOf( marker ) ), f.seedText.slice( 0, f.seedText.indexOf( marker ) ), 'historical catalogue prefix preserves exact authored formatting' );
	same( f.execute().text, first.text, 'second supported CLI invocation changes no bytes' );
} ) );

Deno.test( 'source-builder CLI retains ordinary variants and unrelated metadata following the sources property', () => fixture( false, async f => {
	const result = f.execute();
	for ( const [ field, value ] of Object.entries( f.seed ) ) if ( field !== 'sources' ) equal( result.json[ field ], value, 'trailing catalogue field retained: ' + field );
	equal( result.json.sources[ f.inferred ], f.expectedNew, 'trailing fields do not prevent source inference' );
} ) );
