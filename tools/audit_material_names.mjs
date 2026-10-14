// Counts the texture names the installed games' maps use and what the footstep and impact material table
// (src/newer/sound/s_material.js) makes of them, for docs/material-sounds-2026-10-14.md.
// usage: node tools/audit_material_names.mjs [library folder, default ~/quaked]
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { S_MaterialOfTexture } from '../src/newer/sound/s_material.js';

const root = process.argv[ 2 ] ?? homedir() + '/quaked', uses = new Map();
for ( const game of readdirSync( root ) ) {

	let files = [];
	try { files = readdirSync( `${root}/${game}` ); } catch { continue; }
	for ( const f of files.filter( n => /^pak\d\.pak$/i.test( n ) ) ) {

		const b = readFileSync( `${root}/${game}/${f}` );
		if ( b.toString( 'latin1', 0, 4 ) !== 'PACK' ) continue;
		const dir = b.readInt32LE( 4 ), count = b.readInt32LE( 8 ) / 64;
		for ( let i = 0; i < count; i ++ ) {

			const e = dir + i * 64, name = b.toString( 'latin1', e, e + 56 ).replace( /\0.*$/, '' );
			if ( ! /^maps\/.*\.bsp$/i.test( name ) ) continue;
			const map = b.subarray( b.readInt32LE( e + 56 ), b.readInt32LE( e + 56 ) + b.readInt32LE( e + 60 ) );
			const lump = map.readInt32LE( 4 + 2 * 8 ), size = map.readInt32LE( 8 + 2 * 8 );
			if ( size < 4 ) continue;
			for ( let t = 0, n = map.readInt32LE( lump ); t < n; t ++ ) {

				const at = map.readInt32LE( lump + 4 + t * 4 );
				if ( at < 0 ) continue;
				const tex = map.toString( 'latin1', lump + at, lump + at + 16 ).replace( /\0.*$/, '' ).toLowerCase();
				if ( tex ) uses.set( tex, ( uses.get( tex ) ?? 0 ) + 1 );

			}

		}

	}

}
const by = new Map();
let total = 0;
for ( const [ tex, n ] of uses ) { const m = S_MaterialOfTexture( tex ); by.set( m, ( by.get( m ) ?? 0 ) + n ); total += n; }
console.log( `${uses.size} texture names, ${total} uses` );
for ( const [ m, n ] of [ ...by ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ) ) console.log( `${m.padEnd( 7 )} ${String( n ).padStart( 6 )}  ${( n / total * 100 ).toFixed( 0 )}%` );
