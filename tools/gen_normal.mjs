// Generates a tangent-space normal map from raw RGBA texels using the game's own
// generator (src/gl_normals.js), so offline maps match the ones made at runtime.
//   node tools/gen_normal.mjs in.rgba WIDTH HEIGHT out.rgba

import { register } from 'node:module';
import fs from 'node:fs';

// gl_normals.js imports three for its texture wrapper only; the maths needs none of it
register( 'data:text/javascript,' + encodeURIComponent(
	'export async function resolve(s,c,n){ if(s==="three") return {url:"data:text/javascript,export{}",shortCircuit:true}; return n(s,c); }'
) );

const { R_GenerateNormalData } = await import( new URL( '../src/newer/render/gl_normals.js', import.meta.url ) );

const [ input, w, h, output ] = process.argv.slice( 2 );
const width = parseInt( w, 10 ), height = parseInt( h, 10 );
const rgba = new Uint8Array( fs.readFileSync( input ) );

fs.writeFileSync( output, R_GenerateNormalData( rgba, width, height, null ) );
