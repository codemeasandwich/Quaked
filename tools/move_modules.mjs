// Moves src modules into their proposed folders (cards [44b]..[44g]; the plan is docs/architecture-baseline-2026-10-10.md,
// the progress docs/module-layout.md). Two steps, two commits, so git records each move as a rename:
//
//   node tools/move_modules.mjs <increment> [--dry]   moves every tracked module the classifier assigns to the increment
//   (commit)
//   node tools/move_modules.mjs --adapters            leaves a one-line adapter at each old path the last commit moved
//   (commit)
//
// The move:
//   * moves the files with git mv;
//   * rewrites every literal path that resolves to a moved module, in every tracked text file: imports, re-exports,
//     dynamic imports (with a query string or not), new URL( …, import.meta.url ), import map entries (/src/…), source
//     reads, and src/… paths in tools, Python and the JSON records under newer/, docs/ and tools/;
//   * recomputes a moved module's own relative paths from its new folder;
//   * rewrites a literal only when it resolves to a file or folder that exists, so other strings are left alone.
// The adapters ( export * from './engine/common/cmd.js'; ) serve paths built at run time ( '../src/' + name + '.js' ).
//
// Run it in a clean worktree. It refuses, before writing anything:
//   * uncommitted changes to any file it would touch;
//   * an untracked or ignored file (the owner's local files) that names a moved module: it cannot be rewritten safely;
//   * a source that is not tracked, or a destination that exists.
// An untracked module is never moved.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve( path.dirname( new URL( import.meta.url ).pathname ), '..' );
const args = process.argv.slice( 2 ), DRY = args.includes( '--dry' );
const git = ( ...a ) => execFileSync( 'git', a, { cwd: ROOT, encoding: 'utf8' } );
const fail = message => { console.error( message ); process.exit( 1 ); };
const rel = ( fromFile, to ) => { let r = path.posix.relative( path.posix.dirname( fromFile ), to ); if ( ! r.startsWith( '.' ) ) r = './' + r; return r; };

if ( args[ 0 ] === '--adapters' ) {

	// the last commit's moves of src modules, by git's rename detection
	const renames = git( 'diff', '--name-status', '-M30%', 'HEAD~1', 'HEAD' ).split( '\n' ).map( l => l.split( '\t' ) ).filter( ( [ s, a, b ] ) => /^R/.test( s || '' ) && /^src\/.*\.js$/.test( a ) && /^src\/.*\.js$/.test( b ) );
	if ( renames.length === 0 ) fail( 'the last commit moves no src module' );
	const increment = ( git( 'log', '-1', '--format=%s' ).match( /\[(44[b-f])\]/ ) || [] )[ 1 ] || '44';
	const present = renames.filter( ( [ , from ] ) => fs.existsSync( path.join( ROOT, from ) ) ).map( ( [ , from ] ) => from );
	if ( present.length ) fail( 'already exists (nothing written): ' + present.join( ' ' ) );
	for ( const [ , from, to ] of renames ) {

		if ( ! DRY ) fs.writeFileSync( path.join( ROOT, from ), '// Moved to ' + to + ' (card [' + increment + ']); kept for paths built at run time.\nexport * from \'' + rel( from, to ) + '\';\n' );

	}
	if ( ! DRY ) git( 'add', ...renames.map( r => r[ 1 ] ) );
	console.log( ( DRY ? 'would write ' : 'wrote ' ) + renames.length + ' adapters' );
	process.exit( 0 );

}

const increment = args[ 0 ];
if ( ! /^44[b-g]$/.test( increment || '' ) ) fail( 'usage: node tools/move_modules.mjs <44b..44g> [--dry] | --adapters [--dry]' );

// the classifier's plan, on the tree as it is now (its working files outside the repository)
const tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'quaked-move-' ) );
let plan;
try {

	execFileSync( 'node', [ 'tools/architecture_graph.mjs', '.', path.join( tmp, 'g.json' ) ], { cwd: ROOT, stdio: [ 'ignore', 'ignore', 'inherit' ] } );
	execFileSync( 'node', [ 'tools/architecture_classify.mjs', path.join( tmp, 'g.json' ), path.join( tmp, 'c.json' ) ], { cwd: ROOT, stdio: [ 'ignore', 'ignore', 'inherit' ] } );
	plan = JSON.parse( fs.readFileSync( path.join( tmp, 'c.json' ), 'utf8' ) );

} catch ( e ) { fail( 'the architecture tools failed on this tree (above); fix that first' ); } finally { fs.rmSync( tmp, { recursive: true, force: true } ); }

const tracked = new Set( git( 'ls-files', '-z' ).split( '\0' ).filter( Boolean ) );
const moves = new Map( Object.entries( plan.map ).filter( ( [ f, v ] ) => v.increment === increment && v.path !== f && tracked.has( f ) ).map( ( [ f, v ] ) => [ f, v.path ] ) );
const skipped = Object.entries( plan.map ).filter( ( [ f, v ] ) => v.increment === increment && v.path !== f && ! tracked.has( f ) ).map( ( [ f ] ) => f );
if ( skipped.length ) console.log( 'not moved (untracked): ' + skipped.join( ' ' ) );
if ( moves.size === 0 ) { console.log( 'nothing to move for ' + increment ); process.exit( 0 ); }
for ( const to of moves.values() ) if ( fs.existsSync( path.join( ROOT, to ) ) ) fail( 'destination exists: ' + to );

// the text files that may name a module
const TEXT = r => /\.(m?js|ts|html|py)$/.test( r ) && ! /^(newer|docs)\//.test( r ) || /\.json$/.test( r ) && /^(newer|docs|tools)\//.test( r ) && ! r.startsWith( 'docs/evidence/' );
const files = [ ...tracked ].filter( r => TEXT( r ) && fs.existsSync( path.join( ROOT, r ) ) && fs.statSync( path.join( ROOT, r ) ).size < 4e6 );
const dirty = git( 'status', '--porcelain', '--', ...files ).split( '\n' ).filter( l => l.trim() );
if ( dirty.length ) fail( 'uncommitted changes to files this would touch:\n' + dirty.join( '\n' ) );

const exists = p => fs.existsSync( path.join( ROOT, p ) );
const norm = p => path.posix.normalize( p );
const moved = p => moves.get( p ) ?? p;

// a literal path in a file, what it names now, and what it should say after the moves (null: unchanged)
function rewrite( f, text ) {

	const html = f.endsWith( '.html' ), at = moved( f );
	const base = html ? ( text.match( /<base\s+href=["']([^"']+)["']/ )?.[ 1 ] ?? null ) : null;
	// a page's relative URLs resolve against its base (an absolute base is from the root)
	const baseDir = base === null ? null : base.startsWith( '/' ) ? norm( base.slice( 1 ) || '.' ) : norm( path.posix.join( path.posix.dirname( f ), base ) );
	let count = 0;
	const out = text.replace( /(['"`])((?:\.{1,2}\/|\/)?[\w@./-]*?[\w-]+(?:\.[\w]+)?)(\?[^'"`\n]*)?\1/g, ( whole, q, spec, query = '' ) => {

		if ( spec.includes( '//' ) ) return whole;
		let target, kind;
		if ( spec.startsWith( '/' ) ) { target = norm( spec.slice( 1 ) ); kind = 'root-absolute'; }
		else if ( spec.startsWith( '.' ) ) { target = norm( path.posix.join( baseDir ?? path.posix.dirname( f ), spec ) ); kind = 'relative'; }
		else if ( spec.startsWith( 'src/' ) ) { target = norm( spec ); kind = 'root'; }
		else return whole;
		if ( target.startsWith( '..' ) || ! exists( target ) ) return whole;
		const goal = moved( target );
		if ( goal === target && at === f ) return whole; // neither end moves
		let next;
		if ( kind === 'root-absolute' ) next = '/' + goal;
		else if ( kind === 'root' ) next = goal;
		else if ( baseDir !== null ) { next = path.posix.relative( baseDir, goal ); if ( ! next.startsWith( '.' ) ) next = './' + next; } // (against the base, which does not move with the page)
		else next = rel( at, goal );
		if ( next === spec ) return whole;
		count ++;
		return q + next + query + q;

	} );
	return count ? { out, count } : null;

}

// files git does not track (the owner's local files, ignored or not) that name a moved module: refuse, naming them
const local = [];
const walkLocal = dir => { for ( const e of fs.readdirSync( path.join( ROOT, dir ), { withFileTypes: true } ) ) {

	const r = dir ? dir + '/' + e.name : e.name;
	// (not into another checkout or worktree inside this one: a folder holding .git)
	if ( e.isDirectory() ) { if ( ! [ '.git', '.claude', 'node_modules', 'resources', 'assets', 'music', 'maps' ].includes( e.name ) && ! e.isSymbolicLink() && ! fs.existsSync( path.join( ROOT, r, '.git' ) ) ) walkLocal( r ); }
	else if ( ! tracked.has( r ) && TEXT( r ) && ! e.isSymbolicLink() && fs.statSync( path.join( ROOT, r ) ).size < 4e6 && rewrite( r, fs.readFileSync( path.join( ROOT, r ), 'utf8' ) ) ) local.push( r );

} };
walkLocal( '' );
if ( local.length ) fail( 'untracked or ignored files name a module this would move (move it where they are not, or update them by hand first):\n  ' + local.join( '\n  ' ) );

const changes = [];
for ( const f of files ) { const r = rewrite( f, fs.readFileSync( path.join( ROOT, f ), 'utf8' ) ); if ( r ) changes.push( { file: f, to: moved( f ), ...r } ); }
if ( ! DRY ) {

	for ( const c of changes ) fs.writeFileSync( path.join( ROOT, c.file ), c.out );
	for ( const [ from, to ] of moves ) { fs.mkdirSync( path.dirname( path.join( ROOT, to ) ), { recursive: true } ); git( 'mv', from, to ); }
	git( 'add', ...changes.map( c => moved( c.file ) ) );

}
console.log( ( DRY ? 'would move ' : 'moved ' ) + moves.size + ' modules; ' + ( DRY ? 'would rewrite ' : 'rewrote ' ) + changes.reduce( ( n, c ) => n + c.count, 0 ) + ' literals in ' + changes.length + ' files' + ( DRY ? '' : '. Commit, then run --adapters and commit again.' ) );
for ( const c of changes.slice( 0, 400 ) ) console.log( '  ' + c.file + ( c.to !== c.file ? ' (-> ' + c.to + ')' : '' ) + ': ' + c.count );
