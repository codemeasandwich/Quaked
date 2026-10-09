// Architecture graph of Quaked (card [44a]): every static and dynamic import, worker and import.meta URL in src/, main.js,
// server/, tests/ and tools/; the strongly connected import cycles in src/; fan-in/out; outside consumers; and the proposed
// subsystem of each src module (tools/architecture_classify.mjs). Usage: node tools/architecture_graph.mjs <repo root> <out.json>
import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.argv[ 2 ];
const walk = ( dir, out = [] ) => { for ( const e of fs.readdirSync( dir, { withFileTypes: true } ) ) { const p = path.join( dir, e.name ); if ( e.isDirectory() ) { if ( ! /node_modules|\.git|resources|newer|assets|docs|cards/.test( e.name ) ) walk( p, out ); } else if ( /\.(m?js|ts|html)$/.test( e.name ) ) out.push( p ); } return out; };
const files = walk( ROOT ).filter( f => ! f.includes( '/worktrees/' ) );
const rel = f => path.relative( ROOT, f );
const edges = [];
const re = [ [ 'static', /(?:^|\n)\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g ], [ 'export', /(?:^|\n)\s*export\s+[^'";]*?\sfrom\s+['"]([^'"]+)['"]/g ], [ 'dynamic', /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g ], [ 'url', /new URL\(\s*['"`]([^'"`]+)['"`]\s*,\s*import\.meta\.url/g ], [ 'script', /<script[^>]*src=["']([^"']+)["']/g ] ];
for ( const f of files ) {
	const src = fs.readFileSync( f, 'utf8' );
	for ( const [ kind, r ] of re ) { r.lastIndex = 0; let m; while ( ( m = r.exec( src ) ) ) { const spec = m[ 1 ]; if ( ! spec.startsWith( '.' ) && ! spec.startsWith( '/' ) ) { edges.push( { from: rel( f ), to: spec, kind, external: true } ); continue; } let t = spec.startsWith( '/' ) ? path.join( ROOT, spec ) : path.resolve( path.dirname( f ), spec ); edges.push( { from: rel( f ), to: rel( t ), kind } ); } }
}
const src = files.map( rel ).filter( f => f.startsWith( 'src/' ) && f.endsWith( '.js' ) );
const lines = Object.fromEntries( src.map( f => [ f, fs.readFileSync( path.join( ROOT, f ), 'utf8' ).split( '\n' ).length ] ) );
// Tarjan on src static+export edges (the evaluation graph)
const adj = new Map( src.map( f => [ f, [] ] ) );
for ( const e of edges ) if ( adj.has( e.from ) && adj.has( e.to ) && ( e.kind === 'static' || e.kind === 'export' ) ) adj.get( e.from ).push( e.to );
let index = 0; const idx = new Map(), low = new Map(), on = new Set(), stack = [], sccs = [];
const strong = v => { idx.set( v, index ); low.set( v, index ); index ++; stack.push( v ); on.add( v );
	for ( const w of adj.get( v ) ) { if ( ! idx.has( w ) ) { strong( w ); low.set( v, Math.min( low.get( v ), low.get( w ) ) ); } else if ( on.has( w ) ) low.set( v, Math.min( low.get( v ), idx.get( w ) ) ); }
	if ( low.get( v ) === idx.get( v ) ) { const c = []; let w; do { w = stack.pop(); on.delete( w ); c.push( w ); } while ( w !== v ); sccs.push( c ); } };
for ( const v of src ) if ( ! idx.has( v ) ) strong( v );
const fanIn = Object.fromEntries( src.map( f => [ f, 0 ] ) ), fanOut = Object.fromEntries( src.map( f => [ f, new Set( adj.get( f ) ).size ] ) );
for ( const f of src ) for ( const t of new Set( adj.get( f ) ) ) fanIn[ t ] ++;
const consumers = Object.fromEntries( src.map( f => [ f, { tests: new Set(), tools: new Set(), server: new Set(), root: new Set() } ] ) );
for ( const e of edges ) if ( consumers[ e.to ] && ! e.from.startsWith( 'src/' ) ) { const k = e.from.startsWith( 'tests/' ) ? 'tests' : e.from.startsWith( 'tools/' ) ? 'tools' : e.from.startsWith( 'server/' ) ? 'server' : 'root'; consumers[ e.to ][ k ].add( e.from ); }
const missing = edges.filter( e => ! e.external && ! fs.existsSync( path.join( ROOT, e.to ) ) && ! /\$\{|\*/.test( e.to ) );
const out = { files: files.length, src: src.length, lines, sccs: sccs.filter( c => c.length > 1 ).map( c => c.sort() ), fanIn, fanOut,
	consumers: Object.fromEntries( Object.entries( consumers ).map( ( [ k, v ] ) => [ k, Object.fromEntries( Object.entries( v ).map( ( [ a, b ] ) => [ a, [ ...b ].sort() ] ) ) ] ) ),
	dynamic: edges.filter( e => e.from.startsWith( 'src/' ) && e.kind !== 'static' && e.kind !== 'export' ), missing, externals: [ ...new Set( edges.filter( e => e.external ).map( e => e.to ) ) ].sort() };
fs.writeFileSync( process.argv[ 3 ], JSON.stringify( out, null, 1 ) );
console.log( 'files', out.files, 'src modules', out.src, 'cycles', out.sccs.map( c => c.length ), 'missing refs', missing.length );
