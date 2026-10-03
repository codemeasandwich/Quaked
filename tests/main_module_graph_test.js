// Fresh main.js dependency evaluation in its actual import order. Only its
// final main() invocation is held back: no DOM, game, server or GPU is started.
// Browser boot remains a separate check; this guards renderer import-cycle TDZs
// that the ordinary test runner's deliberate gl_rsurf bootstrap can conceal.
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

Deno.test( 'fresh production main entry graph evaluates without a renderer preimport or TDZ', () => {

	const entry = new URL( '../main.js', import.meta.url ).href;
	const loader = `let three, entry;
export function initialize( data ) { three = data.three; entry = data.entry; }
export async function resolve( specifier, context, next ) {
 if ( specifier === 'three' ) return { url: three, shortCircuit: true };
 return next( specifier, context );
}
export async function load( url, context, next ) {
 const result = await next( url, context );
 if ( url !== entry ) return result;
 const source = String( result.source );
 if ( ! /main\\(\\);\\s*$/.test( source ) ) throw new Error( 'Entry invocation changed; update evaluation test boundary.' );
 return { ...result, source: source.replace( /main\\(\\);\\s*$/, 'globalThis.__quakeEntryGraphEvaluated = true;' ) };
}`;
	const script = `import { register } from 'node:module';
register( ${JSON.stringify( 'data:text/javascript,' + encodeURIComponent( loader ) )}, { data: { three: ${JSON.stringify( pathToFileURL( resolve( process.env.QUAKED_THREE_MODULE ) ).href )}, entry: ${JSON.stringify( entry )} } } );
await import( ${JSON.stringify( entry )} );
if ( ! globalThis.__quakeEntryGraphEvaluated ) throw new Error( 'Production entry did not evaluate.' );
console.log( 'FRESH_MAIN_GRAPH_OK' );`;
	const child = spawnSync( process.execPath, [ '--input-type=module', '-e', script ], { encoding: 'utf8', cwd: fileURLToPath( new URL( '..', import.meta.url ) ), timeout: 30000 } );
	if ( child.status !== 0 || ! child.stdout.includes( 'FRESH_MAIN_GRAPH_OK' ) ) throw new Error( `${child.error || ''}\n${child.stdout}\n${child.stderr}` );

} );
