// Moves src modules into their proposed folders (cards [44b]..[44f]; the plan is docs/architecture-baseline-2026-10-10.md).
// For each moved module:
//   * the file moves (git mv), and a one-line adapter is left at its old path (`export * from './engine/common/cmd.js';`)
//     for consumers that build a module's path at run time ( import( '../src/' + name + '.js' ) );
//   * every literal path that resolves to it is rewritten to its new place: imports, re-exports, dynamic imports (with a
//     query string or not), new URL( …, import.meta.url ), import map entries, source reads, and src/… paths in tools,
//     Python and the JSON records keyed by them;
//   * its own relative paths are recomputed from its new folder.
// A literal is rewritten only when it resolves to a file or folder that exists, so other strings are left alone. Usage:
//   node tools/move_modules.mjs <increment> [--dry]      (moves every module the classifier assigns to that increment)
// It refuses to run with uncommitted changes to the files it would touch, and prints what it changed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve( path.dirname( new URL( import.meta.url ).pathname ), '..' );
const [ increment, ...flags ] = process.argv.slice( 2 ), DRY = flags.includes( '--dry' );
if ( ! /^44[b-f]$/.test( increment || '' ) ) { console.error( 'usage: node tools/move_modules.mjs <44b..44f> [--dry]' ); process.exit( 1 ); }
const git = ( ...args ) => execFileSync( 'git', args, { cwd: ROOT, encoding: 'utf8' } );

// the classifier's plan, on the tree as it is now
const tmp = fs.mkdtempSync( path.join( ROOT, '.move-' ) );
try {

	execFileSync( 'node', [ 'tools/architecture_graph.mjs', '.', path.join( tmp, 'g.json' ) ], { cwd: ROOT, stdio: 'ignore' } );
	execFileSync( 'node', [ 'tools/architecture_classify.mjs', path.join( tmp, 'g.json' ), path.join( tmp, 'c.json' ) ], { cwd: ROOT, stdio: 'ignore' } );

} catch ( e ) { fs.rmSync( tmp, { recursive: true } ); console.error( 'the architecture tools failed on this tree; fix that first' ); process.exit( 1 ); }
const plan = JSON.parse( fs.readFileSync( path.join( tmp, 'c.json' ), 'utf8' ) );
fs.rmSync( tmp, { recursive: true } );
const moves = new Map( Object.entries( plan.map ).filter( ( [ f, v ] ) => v.increment === increment && v.path !== f ).map( ( [ f, v ] ) => [ f, v.path ] ) );
if ( moves.size === 0 ) { console.log( 'nothing to move for ' + increment ); process.exit( 0 ); }

// the text files that may name a module: as the graph tool scans, plus the JSON records under newer/, docs/ and tools/
const SKIP = new Set( [ 'node_modules', '.git', 'resources', 'assets', 'cards', 'music', 'maps' ] );
const files = [];
const walk = ( dir, top ) => { for ( const e of fs.readdirSync( dir, { withFileTypes: true } ) ) {

	const p = path.join( dir, e.name ), r = path.relative( ROOT, p ).split( path.sep ).join( '/' );
	if ( e.isDirectory() ) { if ( ! ( top && SKIP.has( e.name ) ) && e.name !== 'node_modules' && ! r.startsWith( 'docs/evidence' ) && ! e.name.startsWith( '.' ) ) walk( p, false ); }
	else if ( /\.(m?js|ts|html|py)$/.test( e.name ) && ! r.startsWith( 'newer/' ) && ! r.startsWith( 'docs/' ) || /\.json$/.test( e.name ) && /^(newer|docs|tools)\//.test( r ) && fs.statSync( p ).size < 4e6 ) files.push( r );

} };
walk( ROOT, true );
const dirty = git( 'status', '--porcelain', '--', ...files ).split( '\n' ).filter( l => l.trim() );
if ( dirty.length ) { console.error( 'uncommitted changes to files this would touch:\n' + dirty.join( '\n' ) ); process.exit( 1 ); }

const exists = p => fs.existsSync( path.join( ROOT, p ) );
const norm = p => path.posix.normalize( p );
const rel = ( fromFile, to ) => { let r = path.posix.relative( path.posix.dirname( fromFile ), to ); if ( ! r.startsWith( '.' ) ) r = './' + r; return r; };
const moved = p => moves.get( p ) ?? p;

const changes = [];
for ( const f of files ) {

	const text = fs.readFileSync( path.join( ROOT, f ), 'utf8' ), html = f.endsWith( '.html' );
	const base = html ? ( text.match( /<base\s+href=["']([^"']+)["']/ )?.[ 1 ] ?? '' ) : '';
	const at = moved( f ); // where this file will be
	let count = 0;
	const out = text.replace( /(['"`])((?:\.{1,2}\/|\/)?[\w@./-]*?[\w-]+(?:\.[\w]+)?)(\?[^'"`\n]*)?\1/g, ( whole, q, spec, query = '' ) => {

		if ( spec.includes( '//' ) || /^[a-z]+:/.test( spec ) ) return whole;
		// what the literal names now, in the order a reader would resolve it
		const candidates = [];
		if ( spec.startsWith( '/' ) ) candidates.push( [ norm( spec.slice( 1 ) ), 'root-absolute' ] );
		else if ( spec.startsWith( '.' ) ) {

			const from = html && base ? norm( path.posix.join( path.posix.dirname( f ), base ) ) : path.posix.dirname( f );
			candidates.push( [ norm( path.posix.join( from, spec ) ), 'relative' ] );

		} else if ( spec.startsWith( 'src/' ) ) candidates.push( [ norm( spec ), 'root' ] );
		for ( const [ target, kind ] of candidates ) {

			if ( target.startsWith( '..' ) || ! exists( target ) ) continue;
			const goal = moved( target );
			if ( goal === target && at === f ) return whole; // neither end moves
			let next;
			if ( kind === 'root-absolute' ) next = '/' + goal;
			else if ( kind === 'root' ) next = goal;
			else if ( html && base ) next = rel( norm( path.posix.join( path.posix.dirname( at ), base, 'x' ) ), goal ); // (against the page's base)
			else next = rel( at, goal );
			if ( spec.endsWith( '/' ) && ! next.endsWith( '/' ) ) next += '/';
			if ( next === spec && at === f ) return whole;
			count ++;
			return q + next + query + q;

		}
		return whole;

	} );
	if ( count ) changes.push( { file: f, to: at, count } );
	if ( ! DRY && count ) fs.writeFileSync( path.join( ROOT, f ), out );

}

// move the files and leave the adapters
for ( const [ from, to ] of moves ) {

	if ( DRY ) continue;
	fs.mkdirSync( path.dirname( path.join( ROOT, to ) ), { recursive: true } );
	git( 'mv', from, to );
	fs.writeFileSync( path.join( ROOT, from ), '// Moved to ' + to + ' (card [' + increment + ']); kept for paths built at run time.\nexport * from \'' + rel( from, to ) + '\';\n' );
	git( 'add', from );

}
console.log( ( DRY ? 'would move ' : 'moved ' ) + moves.size + ' modules; rewrote ' + changes.reduce( ( n, c ) => n + c.count, 0 ) + ' literals in ' + changes.length + ' files' );
for ( const c of changes.slice( 0, 400 ) ) console.log( '  ' + c.file + ( c.to !== c.file ? ' (-> ' + c.to + ')' : '' ) + ': ' + c.count );
