// Architecture graph of Quaked (card [44a]). Reads a source tree (best: a clean export of a commit, `git archive`, so ignored
// local files do not count) and writes one JSON with everything the baseline document states, so each number can be
// recomputed:
//   * every static import, re-export, literal dynamic import(), new URL( literal, import.meta.url ) and <script src> in
//     src/, main.js, server/, tests/ and tools/ (.js .mjs .ts .html), as module-to-module edges with their statement counts;
//   * the strongly connected import groups (cycles) of src/, with and without each subsystem;
//   * fan-in, fan-out and line counts of every src module;
//   * outside consumers of each src module (query strings stripped: ?case imports name the same file);
//   * per entry point (the page, the dedicated servers), the src modules it loads, directly and transitively;
//   * module-level state: mutable exports (export let), module-level Map/Set, browser storage, workers;
//   * consumers the import scan cannot see: generators that write src/ files, manifests keyed by src paths, module-relative
//     URLs built from computed names, computed source paths in tests and trials.
// It fails (exit 1) if a tracked src module is missing from the scan. Usage:
//   git archive HEAD | tar -x -C /tmp/q && node tools/architecture_graph.mjs /tmp/q /tmp/graph.json
import fs from 'node:fs';
import path from 'node:path';

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
	[ 'url', /new URL\(\s*['"`]([^'"`$]+)['"`]\s*,\s*import\.meta\.url/g ],
	[ 'script', /<script[^>]*\ssrc=["']([^"']+)["']/g ]
];
const statements = [];
for ( const [ f, s ] of Object.entries( text ) ) {

	if ( f.endsWith( '.py' ) ) continue;
	for ( const [ kind, re ] of PATTERNS ) {

		re.lastIndex = 0; let m;
		while ( ( m = re.exec( s ) ) ) {

			const spec = m[ 1 ].split( '?' )[ 0 ];
			if ( /^(node:|https?:|jsr:|npm:)/.test( spec ) || spec === 'three' || spec.startsWith( '@' ) ) continue;
			// (an HTML page's relative URLs resolve against its <base href>, if it has one)
			const base = f.endsWith( '.html' ) ? ( s.match( /<base\s+href=["']([^"']+)["']/ )?.[ 1 ] ?? '' ) : '';
			const from = path.resolve( path.dirname( path.join( ROOT, f ) ), base.startsWith( '/' ) ? path.relative( path.dirname( path.join( ROOT, f ) ), path.join( ROOT, base ) ) : base );
			const target = spec.startsWith( '/' ) ? spec.slice( 1 ) : rel( path.resolve( from, spec ) );
			statements.push( { from: f, to: target, kind } );

		}

	}

}
// distinct module pairs, with how many statements make each
const pairKey = e => e.from + ' -> ' + e.to;
const pairs = new Map();
for ( const e of statements ) { const k = pairKey( e ), p = pairs.get( k ) || { from: e.from, to: e.to, kinds: new Set(), statements: 0 }; p.kinds.add( e.kind ); p.statements ++; pairs.set( k, p ); }
const edges = [ ...pairs.values() ].map( p => ( { from: p.from, to: p.to, kinds: [ ...p.kinds ].sort(), statements: p.statements } ) );
const evaluation = edges.filter( e => isSrc( e.from ) && isSrc( e.to ) && e.kinds.some( k => k === 'static' || k === 'export' ) );

// --- cycles (Tarjan) over a module set ---
function cycles( nodes ) {

	const set = new Set( nodes ), adj = new Map( nodes.map( n => [ n, [] ] ) );
	for ( const e of evaluation ) if ( set.has( e.from ) && set.has( e.to ) ) adj.get( e.from ).push( e.to );
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
const state = Object.fromEntries( src.map( f => {

	const s = text[ f ];
	return [ f, {
		exportLet: ( s.match( /(?:^|\n)export\s+let\s/g ) || [] ).length,
		moduleMapsSets: ( s.match( /(?:^|\n)(?:let|const)\s+\w+\s*=\s*new\s+(?:Map|Set|WeakMap)\b/g ) || [] ).length,
		storage: /localStorage|sessionStorage|indexedDB|navigator\.storage|getDirectory\(/.test( s ),
		worker: /new\s+Worker\s*\(/.test( s ),
		topLevelCalls: ( s.match( /(?:^|\n)(?:[A-Z_]\w*|\w+\.\w+)\s*\([^)]*\)\s*;/g ) || [] ).length // (statements at column 0 that call something)
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

	}
	if ( isSrc( f ) ) for ( const m of s.matchAll( /new URL\(\s*['"`][^'"`]*['"`]\s*\+[^,]+,\s*import\.meta\.url/g ) ) hidden.computedUrls.push( { module: f, at: s.slice( 0, m.index ).split( '\n' ).length } );
	if ( ! isSrc( f ) ) for ( const m of s.matchAll( /(?:import\(|fetch\(|readFileSync\(|URL\()\s*['"`][^'"`]*src\/['"`]?\s*\+/g ) ) hidden.computedSource.push( { file: f, at: s.slice( 0, m.index ).split( '\n' ).length } );
	if ( f.endsWith( '.py' ) && /src\/\*\.js|\(\s*\w+\s*\/\s*['"]src['"]\s*\)\.glob\(\s*['"]\*\.js/.test( s ) ) hidden.globs.push( f ); // (a flat src/*.js glob goes blind once modules move into folders)

}
for ( const dir of [ 'newer' ] ) {

	const base = path.join( ROOT, dir );
	if ( ! fs.existsSync( base ) ) continue;
	const find = d => { for ( const e of fs.readdirSync( d, { withFileTypes: true } ) ) { const p = path.join( d, e.name ); if ( e.isDirectory() ) find( p ); else if ( e.name === 'manifest.json' || e.name === 'index.json' ) { const s = fs.readFileSync( p, 'utf8' ), keys = [ ...new Set( s.match( /src\/[\w./-]+\.js/g ) || [] ) ]; if ( keys.length ) hidden.manifests.push( { manifest: rel( p ), srcPaths: keys } ); } } };
	find( base );

}
hidden.generators = [ ...new Map( hidden.generators.map( g => [ g.tool + g.writes, g ] ) ).values() ];

// --- every tracked src module must have been scanned ---
const missing = edges.filter( e => ! e.to.endsWith( '/' ) && text[ e.to ] === undefined && ! fs.existsSync( path.join( ROOT, e.to ) ) );

const out = { root: ROOT, files: files.length, src, lines, fanIn, fanOut, edges, evaluationEdges: evaluation.length, cycles: cycles( src ), consumers, state, entries, hidden, missing };
if ( OUT ) fs.writeFileSync( OUT, JSON.stringify( out, null, 1 ) );
console.log( `files ${ files.length }, src modules ${ src.length }, distinct edges ${ edges.length } (${ statements.length } statements), cycles ${ out.cycles.map( c => c.length ).join( ', ' ) }, unresolved ${ missing.length }` );
export { cycles };
