import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { COM_PackHeader, COM_PackEntries } from '../src/engine/common/pak.js';
import { MIDI_ParseSMF } from '../src/engine/sound/midi_smf.js';
import { MIDI_RenderFM, MIDI_EncodeWAV } from '../src/engine/sound/midi_fm.js';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const roots = [ [ 'base', '/Users/bri/quaked/Hexen 2/data1' ], [ 'portal', '/Users/bri/quaked/Hexen 2/portals' ],
	[ 'demo', '/Users/bri/quaked/Hexen 2 Shareware/hexen2-demo/data1' ] ];
Deno.test( 'every installed Hexen II MIDI parses and renders within three seconds', async () => {
	let count = 0;
	for ( const [ edition, root ] of roots ) {
		let names;
		try { names = await readdir( root ); } catch ( error ) { if ( error.code !== 'ENOENT' ) throw error; console.log( 'SKIP owned MIDI: ' + root ); continue; }
		for ( const name of names.filter( n => /^pak\d+\.pak$/i.test( n ) ).sort() ) {
			const file = await open( join( root, name ), 'r' );
			try {
				const size = ( await file.stat() ).size;
				const read = async ( offset, length ) => { const bytes = new Uint8Array( length ); const { bytesRead } = await file.read( bytes, 0, length, offset ); check( bytesRead === length, 'complete read' ); return bytes; };
				const header = COM_PackHeader( new DataView( ( await read( 0, 12 ) ).buffer ), size ); check( header.ok, 'pack header' );
				const entries = COM_PackEntries( await read( header.dirofs, header.dirlen ), header.count, size ); check( entries.ok, 'pack directory' );
				for ( const entry of entries.files.filter( f => /^midi\/.*\.mid$/i.test( f.name ) ) ) {
					const bytes = await read( entry.filepos, entry.filelen );
					const start = performance.now(), song = MIDI_ParseSMF( bytes ), pcm = MIDI_RenderFM( song ), wav = MIDI_EncodeWAV( pcm ), ms = performance.now() - start;
					console.log( 'MIDI_MEASURE ' + JSON.stringify( { edition, pak: name, track: entry.name, seconds: +song.duration.toFixed( 3 ), ms: +ms.toFixed( 1 ), wavBytes: wav.byteLength } ) );
					check( ms < 3000, `${edition}/${entry.name} render ${ms}ms exceeds 3000ms` );
					check( pcm.left.some( n => Math.abs( n ) > .001 ) && pcm.left.every( n => Number.isFinite( n ) && Math.abs( n ) <= 1 ), 'audible bounded PCM' );
					count ++;
				}
			} finally { await file.close(); }
		}
	}
	console.log( 'MIDI_TRACKS ' + count );
} );
