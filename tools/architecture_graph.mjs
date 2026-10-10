// Architecture graph of Quaked (card [44a]). Reads a source tree (best: a clean export of a commit, `git archive`, so ignored
// local files do not count) and writes one JSON with everything the baseline document states, so each number can be
// recomputed:
//   * every static import, re-export, dynamic import() (literal, with a computed query, or through a helper), new URL(
//     literal, import.meta.url ), source read or fetched, import map entry and <script src> in src/, the root's files,
//     server/, tests/ and tools/ (.js .mjs .ts .html .py), as module-to-module edges with their statement counts;
//   * the strongly connected import groups (cycles) of src/, with and without each subsystem;
//   * fan-in, fan-out and line counts of every src module;
//   * outside consumers of each src module (query strings stripped: ?case imports name the same file);
//   * per entry point (the page, the dedicated servers), the src modules it loads, directly and transitively;
//   * module-level state: mutable exports (export let), module-level Map/Set, browser storage, workers;
//   * consumers the import scan cannot see: generators that write src/ files, manifests keyed by src paths, module-relative
//     URLs built from computed names, computed source paths in tests and trials, ignore rules, and (a catch-all) every src
//     path written as a string in a file with no edge to it;
//   * the debts' checks: importers taking only the Newer/Classic mode from r_anim.js (D2), engine functions the TypeScript
//     server declares again (D5), modules the game never loads (D9).
// It fails (exit 1) if any file under src/ was not scanned, or a reference resolves nowhere other than the known ones
// (KNOWN_MISSING, by file and target). An import's bare specifier (src/x.js, with no ./) is unresolved, as browsers and Node treat it.
// Usage:
//   git archive <commit> | tar -x -C /tmp/q && node tools/architecture_graph.mjs /tmp/q /tmp/graph.json
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const ROOT = path.resolve( process.argv[ 2 ] || '.' ), OUT = process.argv[ 3 ];
const SKIP_AT_ROOT = new Set( [ 'node_modules', '.git', 'resources', 'newer', 'assets', 'docs', 'cards', 'music', 'maps' ] ); // (only at the repo's root)
const walk = ( dir, out = [] ) => {

	for ( const e of fs.readdirSync( dir, { withFileTypes: true } ) ) {

		const p = path.join( dir, e.name );
		if ( e.isDirectory() ) { if ( ! ( dir === ROOT && SKIP_AT_ROOT.has( e.name ) ) && e.name !== 'node_modules' ) walk( p, out ); }
		else if ( /\.(m?js|ts|html|py)$/.test( e.name ) ) out.push( p );

	}
	return out;

};
const files = walk( ROOT ), rel = f => path.relative( ROOT, f ).split( path.sep ).join( '/' );
const isSrc = f => f.startsWith( 'src/' ) && f.endsWith( '.js' );
const src = files.map( rel ).filter( isSrc ).sort();
const text = Object.fromEntries( files.map( f => [ rel( f ), fs.readFileSync( f, 'utf8' ) ] ) );

// --- edges ---
const PATTERNS = [
	[ 'static', /(?:^|\n)\s*import\s+(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g ],
	[ 'export', /(?:^|\n)\s*export\s+[^'";]*?\sfrom\s+['"]([^'"]+)['"]/g ],
	[ 'dynamic', /import\(\s*['"`]([^'"`$]+)['"`]\s*\)/g ],
	// a literal passed through a helper that returns the specifier ( import( dependency( literal ) ) )
	[ 'dynamic-wrapped', /import\(\s*[\w.]+\(\s*['"`]([^'"`$]+\.js)['"`]/g ],
	// a module named by a literal with a computed query (fresh instances per case: '…js?case-' + n, `…js?${ n }`)
	[ 'dynamic-computed', /import\(\s*['"`]([^'"`$?]+\.js)\?[^'"`]*(?:['"`]\s*\+|\$\{)/g ],
	// source text read by tests and tools (a move changes what they read)
	[ 'read', /readFile(?:Sync)?\(\s*new URL\(\s*['"`]([^'"`$]+\.js)['"`]\s*,\s*import\.meta\.url/g ],
	// a module's source fetched over HTTP by a trial page or test
	[ 'fetch', /fetch\(\s*['"`]([^'"`$]*src\/[^'"`$]+\.js)['"`]/g ],
	// an import map's entries keyed by a module path (an HTML trial page)
	[ 'importmap', /"(\/?src\/[\w./-]+\.js)"\s*:/g ],
	// a worker started from a module URL (loaded by the game, unlike a URL merely built)
	[ 'worker', /new\s+(?:Shared)?Worker\(\s*new URL\(\s*['"`]([^'"`$]+)['"`]\s*,\s*import\.meta\.url/g ],
	[ 'url', /new URL\(\s*['"`]([^'"`$]+)['"`]\s*,\s*import\.meta\.url/g ],
	[ 'script', /<script[^>]*\ssrc=["']([^"']+)["']/g ]
];
const statements = [];
const consumed = {}; // file -> [ start, end ) spans a pattern above read (the catch-all lists only literals outside them)
for ( const [ f, s ] of Object.entries( text ) ) {

	if ( f.endsWith( '.py' ) ) continue;
	// an HTML page's import map keys are bare specifiers it may use
	const mapped = new Set( f.endsWith( '.html' ) ? [ ...( s.match( /<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/ )?.[ 1 ] ?? '' ).matchAll( /"([^"]+)"\s*:/g ) ].map( m => m[ 1 ] ) : [] );
	const readAt = new Set(); // (new URL inside readFile or new Worker: counted once, as a read or a worker)
	const spans = consumed[ f ] = [];
	for ( const [ kind, re ] of PATTERNS ) {

		if ( kind === 'importmap' && ! f.endsWith( '.html' ) ) continue;

		re.lastIndex = 0; let m;
		while ( ( m = re.exec( s ) ) ) {

			const spec = m[ 1 ].split( '?' )[ 0 ];
			spans.push( [ m.index, m.index + m[ 0 ].length ] );
			if ( kind === 'read' || kind === 'worker' ) readAt.add( m.index + m[ 0 ].indexOf( 'new URL' ) );
			if ( kind === 'url' && readAt.has( m.index ) ) continue;
			if ( /^(node:|https?:|jsr:|npm:|data:|blob:)/.test( spec ) || spec === 'three' || spec.startsWith( 'three/' ) || spec.startsWith( '@' ) || builtinModules.includes( spec.split( '/' )[ 0 ] ) ) continue;
			// an import's specifier must be relative ( ./ ../ / ) unless an import map names it: src/x.js with no ./ is a bare specifier,
			// which browsers and Node reject, so it is recorded unresolved rather than resolved as a path
			// (a helper's argument is not a specifier: pathToFileURL( literal ) is relative to the working directory, the root)
			if ( kind === 'dynamic-wrapped' && ! /^(\.{1,2}\/|\/)/.test( spec ) ) { statements.push( { from: f, to: spec, kind, query: false } ); continue; }
			if ( /^(static|export|dynamic|dynamic-computed)$/.test( kind ) && ! /^(\.{1,2}\/|\/)/.test( spec ) && ! [ ...mapped ].some( k => k.endsWith( '/' ) ? spec.startsWith( k ) : spec === k ) ) { statements.push( { from: f, to: 'bare:' + spec, kind, query: false } ); continue; }
			// (an HTML page's relative URLs resolve against its <base href>, if it has one)
			const base = f.endsWith( '.html' ) ? ( s.match( /<base\s+href=["']([^"']+)["']/ )?.[ 1 ] ?? '' ) : '';
			const from = path.resolve( path.dirname( path.join( ROOT, f ) ), base.startsWith( '/' ) ? path.relative( path.dirname( path.join( ROOT, f ) ), path.join( ROOT, base ) ) : base );
			const target = spec.startsWith( '/' ) ? spec.slice( 1 ) : kind === 'importmap' ? spec : rel( path.resolve( from, spec ) );
			if ( target === '' ) continue; // (new URL( '..', import.meta.url ): a folder, not a module)
			statements.push( { from: f, to: target, kind, query: /\?/.test( m[ 1 ] ) || kind === 'dynamic-computed' } );

		}

	}

}
// distinct module pairs, with how many statements make each
const pairKey = e => e.from + ' -> ' + e.to;
const pairs = new Map();
for ( const e of statements ) { const k = pairKey( e ), p = pairs.get( k ) || { from: e.from, to: e.to, kinds: new Set(), statements: 0 }; p.kinds.add( e.kind ); p.statements ++; pairs.set( k, p ); }
const edges = [ ...pairs.values() ].map( p => ( { from: p.from, to: p.to, kinds: [ ...p.kinds ].sort(), statements: p.statements } ) );
const evaluation = edges.filter( e => isSrc( e.from ) && isSrc( e.to ) && e.kinds.some( k => k === 'static' || k === 'export' ) );

// adapters left at old paths by a move: modules whose code is only `export * from '…'` (cycles are measured through them)
// (one `export *` line only: a module re-exporting several is a real module of its own; a chain of adapters is followed to
// its end)
const adapterStep = Object.fromEntries( src.map( f => [ f, text[ f ].replace( /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '' ).trim() ] ).filter( ( [ , t ] ) => t && /^export\s*\*\s*from\s*['"][^'"]+['"]\s*;?$/.test( t ) ).map( ( [ f, t ] ) => [ f, rel( path.resolve( path.dirname( path.join( ROOT, f ) ), t.match( /['"]([^'"]+)['"]/ )[ 1 ] ) ) ] ) );
const adapters = Object.fromEntries( Object.keys( adapterStep ).map( f => { let t = f; const seen = new Set(); while ( adapterStep[ t ] && ! seen.has( t ) ) { seen.add( t ); t = adapterStep[ t ]; } return [ f, t ]; } ) );

// --- cycles (Tarjan) over a module set (an adapter is measured through: its importers reach the module it re-exports) ---
function cycles( nodes ) {

	nodes = nodes.filter( n => ! adapters[ n ] );
	const set = new Set( nodes ), adj = new Map( nodes.map( n => [ n, [] ] ) ), through = f => adapters[ f ] ?? f;
	for ( const e of evaluation ) { const a = through( e.from ), b = through( e.to ); if ( a !== b && set.has( a ) && set.has( b ) ) adj.get( a ).push( b ); }
	let index = 0; const idx = new Map(), low = new Map(), on = new Set(), stack = [], out = [];
	const strong = v => {

		idx.set( v, index ); low.set( v, index ); index ++; stack.push( v ); on.add( v );
		for ( const w of adj.get( v ) ) { if ( ! idx.has( w ) ) { strong( w ); low.set( v, Math.min( low.get( v ), low.get( w ) ) ); } else if ( on.has( w ) ) low.set( v, Math.min( low.get( v ), idx.get( w ) ) ); }
		if ( low.get( v ) === idx.get( v ) ) { const c = []; let w; do { w = stack.pop(); on.delete( w ); c.push( w ); } while ( w !== v ); if ( c.length > 1 ) out.push( c.sort() ); }

	};
	for ( const v of nodes ) if ( ! idx.has( v ) ) strong( v );
	return out.sort( ( a, b ) => b.length - a.length );

}

// --- per module ---
const lines = Object.fromEntries( src.map( f => [ f, text[ f ].split( '\n' ).length - ( text[ f ].endsWith( '\n' ) ? 1 : 0 ) ] ) );
const fanIn = Object.fromEntries( src.map( f => [ f, 0 ] ) ), fanOut = Object.fromEntries( src.map( f => [ f, 0 ] ) );
for ( const e of evaluation ) { fanOut[ e.from ] ++; fanIn[ e.to ] ++; }
const consumers = Object.fromEntries( src.map( f => [ f, [] ] ) );
for ( const e of edges ) if ( consumers[ e.to ] && ! isSrc( e.from ) ) consumers[ e.to ].push( e.from );
// the starts of a module's top-level statements: a scan that tracks (), [], {} depth outside strings, template literals and
// comments, and starts a statement at depth 0 after ; or a closing } or a line end that completes one
function topLevel( s ) {

	const out = []; let depth = 0, i = 0, start = true, current = '';
	const n = s.length;
	while ( i < n ) {

		const c = s[ i ], d = s[ i + 1 ];
		if ( c === '/' && d === '/' ) { while ( i < n && s[ i ] !== '\n' ) i ++; continue; }
		if ( c === '/' && d === '*' ) { i = s.indexOf( '*/', i + 2 ); i = i < 0 ? n : i + 2; continue; }
		if ( c === '"' || c === "'" ) { const q = c; i ++; while ( i < n && s[ i ] !== q ) { if ( s[ i ] === '\\' ) i ++; i ++; } i ++; if ( start && depth === 0 ) { current = q + 'string'; } continue; }
		if ( c === '`' ) { i ++; let inner = 0; while ( i < n ) { if ( s[ i ] === '\\' ) { i += 2; continue; } if ( s[ i ] === '$' && s[ i + 1 ] === '{' ) { inner ++; i += 2; continue; } if ( inner && s[ i ] === '}' ) { inner --; i ++; continue; } if ( ! inner && s[ i ] === '`' ) break; i ++; } i ++; continue; }
		if ( '([{'.includes( c ) ) { if ( start && depth === 0 ) { out.push( s.slice( i, i + 80 ).trim() ); start = false; } depth ++; i ++; continue; }
		// (a closing brace ends a block statement: function, class, if, for …; an object or import list goes on to its ;)
		if ( ')]}'.includes( c ) ) { depth = Math.max( 0, depth - 1 ); i ++; if ( depth === 0 && c === '}' && /^(export\s+)?(async\s+)?(function|class|if|for|while|else|try|catch|finally|switch|do)\b|^\{/.test( out.at( - 1 ) || '' ) ) start = true; continue; }
		if ( depth === 0 && c === ';' ) { start = true; i ++; continue; }
		if ( depth === 0 && start && /\S/.test( c ) ) { const line = s.slice( i, s.indexOf( '\n', i ) < 0 ? n : s.indexOf( '\n', i ) ); out.push( line.trim() ); start = false; }
		i ++;

	}
	return out;

}

const state = Object.fromEntries( src.map( f => {

	const s = text[ f ];
	return [ f, {
		exportLet: ( s.match( /(?:^|\n)export\s+let\s/g ) || [] ).length,
		moduleMapsSets: ( s.match( /(?:^|\n)(?:let|const)\s+\w+\s*=\s*new\s+(?:Map|Set|WeakMap)\b/g ) || [] ).length,
		storage: /localStorage|sessionStorage|indexedDB|navigator\.storage|getDirectory\(/.test( s ),
		worker: /new\s+Worker\s*\(/.test( s ),
		// statements that run at import: top-level statements (found by bracket depth, outside strings and comments) that are
		// not declarations or imports/exports: calls, loops, conditionals, assignments
		topLevelStatements: topLevel( s ).filter( t => ! /^(import\b|export\s+(const|let|var|function|class|async)\b|export\s*\{|export\s*\*|const\b|let\b|var\b|function\b|class\b|async\s+function\b|['"]use strict)/.test( t ) ).length,
		topLevelExamples: topLevel( s ).filter( t => ! /^(import\b|export\s+(const|let|var|function|class|async)\b|export\s*\{|export\s*\*|const\b|let\b|var\b|function\b|class\b|async\s+function\b|['"]use strict)/.test( t ) ).slice( 0, 3 ).map( t => t.slice( 0, 60 ) )
	} ];

} ) );

// --- entry points: the src modules each loads ---
function closure( start ) {

	const seen = new Set(), todo = [ ...start ];
	while ( todo.length ) { const f = todo.pop(); for ( const e of edges ) if ( e.from === f && e.kinds.some( k => k === 'static' || k === 'export' || k === 'dynamic' ) && ! seen.has( e.to ) && text[ e.to ] !== undefined ) { seen.add( e.to ); todo.push( e.to ); } }
	return [ ...seen ].filter( isSrc ).sort();

}
const entryNames = [ 'main.js', 'server/main.ts', 'server/game_server.js', 'server/lobby_server.js' ].filter( f => text[ f ] !== undefined );
const entries = Object.fromEntries( entryNames.map( f => [ f, { direct: [ ...new Set( edges.filter( e => e.from === f && isSrc( e.to ) ).map( e => e.to ) ) ].sort(), transitive: closure( [ f ] ) } ] ) );
// a server module may reach src only through another server file
for ( const f of entryNames ) entries[ f ].viaServerFiles = closure( edges.filter( e => e.from === f && e.to.startsWith( 'server/' ) ).map( e => e.to ).concat( [ f ] ) ).length;

// --- what the import scan cannot see ---
const hidden = { generators: [], manifests: [], computedUrls: [], computedSource: [], globs: [] };
for ( const [ f, s ] of Object.entries( text ) ) {

	// a generator: a tool whose write call (writeFile, writeFileSync, open( …, 'w' ), write_text) names a src file, or which
	// keeps such a path in a constant it writes (OUT, OUTPUT, DEST, TARGET …)
	if ( f.startsWith( 'tools/' ) ) {

		for ( const m of s.matchAll( /(?:write\w*|open)\(\s*(?:path\.join\([^,]*,\s*)?['"`](?:\.\.\/)?(src\/[\w./-]+\.js)['"`]/gi ) ) hidden.generators.push( { tool: f, writes: m[ 1 ] } );
		for ( const m of s.matchAll( /\b(?:OUT\w*|DEST\w*|TARGET\w*|output\w*)\s*=\s*[^;\n]*['"`](?:\.\.\/)?(src\/[\w./-]+\.js)['"`]/g ) ) hidden.generators.push( { tool: f, writes: m[ 1 ] } );
		for ( const m of s.matchAll( /['"](src\/[\w./-]+\.js)['"]\)\.write_text|\/\s*['"](src)['"]\s*\/\s*['"]([\w.-]+\.js)['"][^\n]*write/g ) ) hidden.generators.push( { tool: f, writes: m[ 1 ] || 'src/' + m[ 3 ] } );
		// Python: a generator names its output in a write ( Path( literal ): content, then write_bytes/write_text ), a
		// reader reads a src file's text ( Path( literal ).read_text() )
		if ( f.endsWith( '.py' ) ) {

			for ( const m of s.matchAll( /Path\(\s*['"](src\/[\w./-]+\.js)['"]\s*\)\s*:/g ) ) if ( /write_(bytes|text)/.test( s ) ) hidden.generators.push( { tool: f, writes: m[ 1 ] } );
			for ( const m of s.matchAll( /['"](src\/[\w./-]+\.js)['"]\s*\)\s*\.write_(?:text|bytes)|open\(\s*[^)]*['"](src\/[\w./-]+\.js)['"][^)]*['"]w/g ) ) hidden.generators.push( { tool: f, writes: m[ 1 ] || m[ 2 ] } );
			for ( const m of s.matchAll( /['"](src\/[\w./-]+\.js)['"]\s*\)\s*\.read_(?:text|bytes)/g ) ) ( hidden.pyReaders ??= [] ).push( { tool: f, reads: m[ 1 ] } );

		}

	}
	if ( isSrc( f ) ) for ( const m of s.matchAll( /new URL\(\s*['"`][^'"`]*['"`]\s*\+[^,]+,\s*import\.meta\.url/g ) ) hidden.computedUrls.push( { module: f, at: s.slice( 0, m.index ).split( '\n' ).length } );
	// a source path built at run time: a string literal ending in src/ (or holding src/…) followed by +, or a path.join with
	// a src/ literal, in any test, tool or page
	if ( ! isSrc( f ) ) for ( const m of s.matchAll( /['"`][^'"`\n]*src\/[^'"`\n]*['"`]\s*\+|path\.join\([^)\n]*['"`]src\/[^'"`]*['"`]/g ) ) hidden.computedSource.push( { file: f, at: s.slice( 0, m.index ).split( '\n' ).length, text: m[ 0 ].slice( 0, 80 ) } );
	// catch-all: a src path written as a string in a test, tool, server file or page, with no edge from that file to it (the
	// patterns above do not see how it is used, so it is listed for a person to check)
	if ( ! isSrc( f ) ) for ( const m of s.matchAll( /['"`](?:\.{1,2}\/)*(src\/[\w./-]+\.js)['"`]/g ) ) if ( ! ( consumed[ f ] || [] ).some( ( [ a, b ] ) => m.index >= a && m.index < b ) ) ( hidden.srcLiterals ??= [] ).push( { file: f, names: m[ 1 ], at: s.slice( 0, m.index ).split( '\n' ).length } );
	if ( f.endsWith( '.py' ) && /src\/\*\.js|\(\s*\w+\s*\/\s*['"]src['"]\s*\)\.glob\(\s*['"]\*\.js/.test( s ) ) hidden.globs.push( f ); // (a flat src/*.js glob goes blind once modules move into folders)

}
// data files keyed by src paths: manifests under newer/, policy and provenance files under docs/ and tools/
for ( const dir of [ 'newer', 'docs', 'tools' ] ) {

	const base = path.join( ROOT, dir );
	if ( ! fs.existsSync( base ) ) continue;
	const find = d => { for ( const e of fs.readdirSync( d, { withFileTypes: true } ) ) { const p = path.join( d, e.name ); if ( e.isDirectory() ) find( p ); else if ( e.name.endsWith( '.json' ) && ( dir !== 'docs' || ! rel( p ).startsWith( 'docs/evidence/' ) ) ) { const s = fs.readFileSync( p, 'utf8' ), keys = [ ...new Set( s.match( /src\/[\w./-]+(?:\.js)?/g ) || [] ) ].filter( k => /\.js$|^src\/[\w-]+$/.test( k ) ); if ( keys.length ) hidden.manifests.push( { manifest: rel( p ), srcPaths: keys } ); } } };
	find( base );

}
// documents that cite src paths (not consumers, but they go stale), anywhere under docs/
const docs = []; const walkDocs = d => { for ( const e of fs.readdirSync( d, { withFileTypes: true } ) ) { const p = path.join( d, e.name ); if ( e.isDirectory() ) walkDocs( p ); else if ( e.name.endsWith( '.md' ) && /src\/[\w./-]+\.js/.test( fs.readFileSync( p, 'utf8' ) ) ) docs.push( rel( p ) ); } };
if ( fs.existsSync( path.join( ROOT, 'docs' ) ) ) walkDocs( path.join( ROOT, 'docs' ) );
hidden.docsCitingSrc = docs.length;
// ignore rules keyed by src paths (a move into a folder defeats them)
hidden.gitignoreSrc = fs.existsSync( path.join( ROOT, '.gitignore' ) ) ? fs.readFileSync( path.join( ROOT, '.gitignore' ), 'utf8' ).split( '\n' ).filter( l => /^\/?src\//.test( l.trim() ) ) : [];
// literals outside every span a pattern read, once per file and path: what the catch-all leaves for a person (a file that
// imports a module and also reads or hashes it by path is listed for the second use)
hidden.srcLiterals = [ ...new Map( ( hidden.srcLiterals || [] ).map( l => [ l.file + ' ' + l.names, l ] ) ).values() ];
// engine functions the TypeScript server declares again (card [44a] D5): any function src/ declares, exported or not; and,
// whatever their names now, every server function with an engine prefix (a renamed copy still has one)
{ const declared = new Set( src.flatMap( f => [ ...text[ f ].matchAll( /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*\(/g ) ].map( m => m[ 1 ] ) ) );
	const server = Object.entries( text ).filter( ( [ f ] ) => f.startsWith( 'server/' ) && f.endsWith( '.ts' ) ).flatMap( ( [ f, s ] ) => [ ...s.matchAll( /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g ) ].map( m => ( { file: f, function: m[ 1 ] } ) ) );
	hidden.serverReimplements = server.filter( d => declared.has( d.function ) );
	hidden.serverEnginePrefixed = server.filter( d => /^(SV_|Host_|MSG_|Mod_|COM_)/.test( d.function ) );
	// D5's check is by file, since a name check cannot show a copy is gone (a renamed copy, or a class method, keeps its
	// body): the files holding the engine-logic copies, null once deleted (the check), else how many functions each declares
	// ( function x(, or const x = ( … ) => / function ) for information
	// and what remains: every function in server/*.ts, declared, arrow const or class/object method, so moving the copies
	// into another file (as methods or not) does not lower it
	const FUNCTIONS = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*\w+\s*\(|(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*(?::[^=\n]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=\n]+)?=>|\w+\s*=>)|(?:^|\n)\s*(?:(?:public|private|protected|static|async|get|set|override|readonly)\s+)*(?!(?:if|for|while|switch|catch|return|function|with|else|do|new|typeof|await|super)\b)\w+\s*\([^)]*\)\s*(?::[^{;\n]+)?\{/g;
	hidden.serverFunctions = Object.entries( text ).filter( ( [ f ] ) => f.startsWith( 'server/' ) && f.endsWith( '.ts' ) ).reduce( ( n, [ , s ] ) => n + ( s.match( FUNCTIONS ) || [] ).length, 0 );
	hidden.serverCopyFiles = Object.fromEntries( [ 'server/host_server.ts', 'server/mod_server.ts', 'server/pak_server.ts' ].map( f => [ f, text[ f ] === undefined ? null : ( text[ f ].match( /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*\w+\s*\(|(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*(?::[^=\n]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=\n]+)?=>|\w+\s*=>)/g ) || [] ).length ] ) ); }
hidden.generators = [ ...new Map( hidden.generators.map( g => [ g.tool + g.writes, g ] ) ).values() ];

// --- counts the baseline states ---
// query-string imports of src modules (each ?case a fresh instance), literal and computed, by file
const queryImports = statements.filter( e => e.query && isSrc( e.to ) );
const importMapEntries = statements.filter( e => e.kind === 'importmap' );
// importers of r_anim.js that take only the Newer/Classic mode from it (card [44a] D2)
const MODE = new Set( [ 'R_NewerGame', 'R_AnimSetClassicPass', 'R_ClassicPassActive', 'R_AnimSetNewer', 'R_AnimSetLighting', 'R_NewerLightingActive', 'R_IsNewer', 'r_newer_water', 'r_newer_lighting', 'r_newer_normals', 'r_newer_enemies' ] );
// (by what each import resolves to, through adapters, so moving the importers or r_anim.js does not change the count; a
// namespace import counts as taking everything)
// A named re-export ( export { R_NewerGame } from './r_anim.js' ) takes those names too, so a forwarding module counts as
// an importer. If r_anim.js is renamed, set ANIM to its new name: the tool fails rather than count nothing.
const ANIM = 'r_anim.js';
const through = f => adapters[ f ] ?? f;
const anim = src.find( f => f.split( '/' ).pop() === ANIM && ! adapters[ f ] );
const failures = anim ? [] : [ 'no module named ' + ANIM + ' (the D2 check measures its importers): update ANIM' ];
const animImporters = {};
for ( const f of src ) if ( ! adapters[ f ] ) for ( const m of text[ f ].matchAll( /(?:^|\n)\s*(?:import|export)\s*(\{[^}]*\}|\*\s*as\s+\w+|\*)\s*from\s*['"]([^'"]+)['"]/g ) ) {

	if ( through( rel( path.resolve( path.dirname( path.join( ROOT, f ) ), m[ 2 ] ) ) ) !== anim ) continue;
	( animImporters[ f ] ??= [] ).push( ...( m[ 1 ].startsWith( '*' ) ? [ '*' ] : m[ 1 ].slice( 1, - 1 ).split( ',' ).map( x => x.trim().split( /\s+as\s+/ )[ 0 ] ).filter( Boolean ) ) );

}
const modeOnly = Object.entries( animImporters ).filter( ( [ , names ] ) => names.every( n => MODE.has( n ) ) ).map( ( [ f ] ) => f );
// where each mode name is declared (not re-exported): D2 is done when each name has exactly one declaration, outside
// r_anim.js, in a module that does not reach r_anim.js through its imports (a copy left behind, or a facade, fails it)
const reachesAnim = f => { const seen = new Set( [ f ] ), todo = [ f ]; while ( todo.length ) { const x = todo.pop(); if ( x === anim ) return true; for ( const e of evaluation ) if ( e.from === x ) { const t = through( e.to ); if ( ! seen.has( t ) ) { seen.add( t ); todo.push( t ); } } } return false; };
const modeHome = Object.fromEntries( [ ...MODE ].map( n => { const declaring = src.filter( f => ! adapters[ f ] && new RegExp( '(?:^|\\n)\\s*export\\s+(?:const|let|var|(?:async\\s+)?function)\\s+' + n + '\\b' ).test( text[ f ] ) ); return [ n, { declaredIn: declaring, done: declaring.length === 1 && declaring[ 0 ] !== anim && ! reachesAnim( declaring[ 0 ] ) } ]; } ) );
// modules nothing imports, by any edge (orphans), other than the entry points' own targets
const imported = new Set( edges.map( e => e.to ) );
const orphans = src.filter( f => ! imported.has( f ) );
// modules the game never loads: not reached from the page or the room server by imports, dynamic imports or workers (a
// URL merely built does not load a module), so a test importing a module does not make it used (card [44a] D9)
const reach = new Set(), todoReach = entryNames.filter( f => f === 'main.js' || f === 'server/game_server.js' );
while ( todoReach.length ) { const f = todoReach.pop(); for ( const e of edges ) if ( e.from === f && e.kinds.some( k => /^(static|export|dynamic|worker)$/.test( k ) ) && text[ e.to ] !== undefined && ! reach.has( e.to ) ) { reach.add( e.to ); todoReach.push( e.to ); } }
const unreached = src.filter( f => ! reach.has( f ) && ! adapters[ f ] );

// --- fail closed: every file under src/ scanned, and no unresolved reference beyond those known ---
const onDisk = []; const walkSrc = d => { for ( const e of fs.readdirSync( d, { withFileTypes: true } ) ) { const p = path.join( d, e.name ); if ( e.isDirectory() ) walkSrc( p ); else onDisk.push( rel( p ) ); } };
if ( fs.existsSync( path.join( ROOT, 'src' ) ) ) walkSrc( path.join( ROOT, 'src' ) );
const unscanned = onDisk.filter( f => ! src.includes( f ) );
const isFile = p => { try { return fs.statSync( path.join( ROOT, p ) ).isFile(); } catch { return false; } };
// (an import must name a file; a URL may name a folder)
const missing = edges.filter( e => ! e.to.endsWith( '/' ) && text[ e.to ] === undefined && ! ( e.kinds.some( k => /^(static|export|dynamic)/.test( k ) ) ? isFile( e.to ) : fs.existsSync( path.join( ROOT, e.to ) ) ) );
// known: deliberate absence checks and the owner's local inputs (ignored files), by file and target. (D7's three trial
// pages, whose inline imports climbed above their <base href="../">, import ./src/… since card [44b].)
const KNOWN_MISSING = [ e => e.from === 'tests/axe_original_test.js' && /^newer\/weapons\/(v_axe\.json|axe)$/.test( e.to ), e => /^resources\/id1\/pak0\.pak$/.test( e.to ), e => /^(fieldlab-fx-3d-updated|arc-weapons-wall-canvas-shotgun|rockfield-v1\.\d\.0)\.html$/.test( e.to ) ];
const unexpected = missing.filter( e => ! KNOWN_MISSING.some( known => known( e ) ) );

const out = { root: ROOT, files: files.length, scannedRootFiles: files.map( rel ).filter( f => ! f.includes( '/' ) ), src, lines, fanIn, fanOut, edges, evaluationEdges: evaluation.length, cycles: cycles( src ), consumers, state, entries, hidden, missing, unscanned, unexpected,
	counts: { queryImports: queryImports.length, queryImportFiles: new Set( queryImports.map( e => e.from ) ).size, queryImportsComputed: queryImports.filter( e => e.kind === 'dynamic-computed' ).length, importMapEntries: importMapEntries.length, animImporters: Object.keys( animImporters ).length, animModeOnly: modeOnly.length },
	modeOnly, modeHome, orphans, unreached, adapters };
if ( OUT ) fs.writeFileSync( OUT, JSON.stringify( out, null, 1 ) );
console.log( `files ${ files.length }, src modules ${ src.length }, distinct edges ${ edges.length } (${ statements.length } statements), cycles ${ out.cycles.map( c => c.length ).join( ', ' ) }, unresolved ${ missing.length } (unexpected ${ unexpected.length }), unscanned ${ unscanned.length }` );
if ( unscanned.length || unexpected.length || failures.length ) { console.error( 'unscanned: ' + unscanned.join( ' ' ) + '\nunexpected unresolved: ' + unexpected.map( e => e.from + ' -> ' + e.to ).join( ' ' ) + '\n' + failures.join( '\n' ) ); process.exit( 1 ); }
export { cycles };
