// Prepares the Bestiary's pencil replay (card: Folio pencil fast replay) from the owner-supplied
// folio-pencil-fast-replay.html: for each page image in newer/bestiary/, runs the supplied analysis worker
// (tools/folio/analysis_worker.js, verbatim) with the supplied Bestiarium template, lays the strokes out with the supplied
// schedulePaths (art 7 s, notes 4 s), and writes what the game's replay needs, in newer/bestiary/folio/:
//
//   <id>.reveal.png   per texel: R = when its first stroke reaches it, G = when its second (deepening) stroke does
//                     (255: none), as 0..254 of the replay's duration; B = the first stroke's strength (the supplied
//                     hatching pressure); A = 255 drawn by a stroke, 0 the page's own pixels (frame, title, rails)
//   <id>.paper.webp   the sampled paper the strokes are drawn onto (the analyzer's underpaint; WebP at quality 85, so within a
//                     few levels of it: lossless would be about five times the size)
//   index.json        the replay's duration and speed, the source's identity, and each page's image hash
//
// The analysis takes 20 to 60 seconds a page, so it is never run by the game. A page is made again when its image, the
// analyzer, the template, the schedule or the encoder changes (each recorded per page, as `made`). Usage:
//   node tools/prepare_folio.mjs [page-id ...]      (default: every page; skips pages whose image hash is unchanged)
//   QUAKED_CANVAS_MODULE=<@napi-rs/canvas index.js> selects the canvas module (it decodes and encodes the images).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import crypto from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const OUT = path.join( ROOT, 'newer/bestiary/folio' );
const SOURCE = { file: 'folio-pencil-fast-replay.html', sha256: 'b864769450933bf95e23af478223bdbca6ed808fef7af14d1b559b7e3f115295' };
export const FOLIO_SCHEDULE = { artSeconds: 7, noteSeconds: 4, firstShare: .68, speed: 3 }; // the supplied defaults
export const FOLIO_ENCODER = 1; // (raise when encodeReveal changes: every page is made again)
const canvasModule = () => import( process.env.QUAKED_CANVAS_MODULE || '@napi-rs/canvas' );
const sha256 = b => crypto.createHash( 'sha256' ).update( b ).digest( 'hex' );

// the supplied schedulePaths (its lay() and phase order), on the analyzer's paths
export function schedule( paths ) {

	const rand = n => { const v = Math.sin( n * 127.1 + 311.7 ) * 43758.5453; return v - Math.floor( v ); };
	function lay( items, origin, target ) {

		if ( ! items.length || target <= 0 ) return;
		let end = 0, previous = null;
		for ( const p of items ) {

			const travel = previous ? Math.hypot( previous.points.at( - 1 )[ 0 ] - p.points[ 0 ][ 0 ], previous.points.at( - 1 )[ 1 ] - p.points[ 0 ][ 1 ] ) : 0;
			p.duration = ( .009 + p.length / 1500 ) * ( 1 + .065 * ( rand( p.id ) - .5 ) );
			p.start = previous ? end + Math.min( .018, travel / 19000 ) : 0; p.end = p.start + p.duration; end = p.end; previous = p;

		}
		const scale = end ? target / end : 1;
		for ( const p of items ) { p.start = origin + p.start * scale; p.duration *= scale; p.end = p.start + p.duration; }

	}
	const { artSeconds, noteSeconds, firstShare } = FOLIO_SCHEDULE;
	const artExists = paths.some( p => p.group === 0 ), notesExists = paths.some( p => p.group === 1 );
	const artTotal = artExists ? artSeconds : 0, firstSecs = artTotal * firstShare, depthSecs = Math.max( artTotal - firstSecs, 0 );
	lay( paths.filter( p => p.phase === 1 ), 0, firstSecs );
	lay( paths.filter( p => p.phase === 0 ), 0, firstSecs );
	lay( paths.filter( p => p.phase === 2 ), firstSecs, depthSecs );
	lay( paths.filter( p => p.group === 1 ), 0, noteSeconds );
	return Math.max( artTotal, notesExists ? noteSeconds : 0, 1 );

}

// the supplied replay shader's per-texel stroke, as a reveal moment: progress = mix( t, smoothstep( t ), .65 ) reaches the
// texel's arc length (its head passes it); the first pass's strength is the supplied pressure envelope for hatching
const smooth = x => { x = Math.max( 0, Math.min( 1, x ) ); return x * x * ( 3 - 2 * x ); };
const INVERSE = ( () => { const out = new Float32Array( 1025 ); let t = 0; for ( let i = 0; i <= 1024; i ++ ) { const want = i / 1024; while ( t < 1 && ( .35 * t + .65 * t * t * ( 3 - 2 * t ) ) < want ) t += 1 / 16384; out[ i ] = t; } return out; } )();
export function encodeReveal( paths, ownership, width, height, duration ) {

	const own = new Uint32Array( ownership ), img = new Uint8ClampedArray( width * height * 4 );
	const when = ( id, along ) => { const p = paths[ id ]; return p ? ( p.start + INVERSE[ Math.round( along / 65535 * 1024 ) ] * p.duration ) / duration : 1; };
	for ( let i = 0; i < width * height; i ++ ) {

		const a = own[ i * 4 ], al = own[ i * 4 + 1 ], b = own[ i * 4 + 2 ], bl = own[ i * 4 + 3 ];
		if ( a === 0 ) continue; // the page's own pixels: A = 0
		const p = paths[ a - 1 ], u = al / 65535;
		const pressure = p && p.phase === 1 ? .48 * ( .45 + .55 * smooth( u / .12 ) * ( 1 - smooth( ( u - .88 ) / .12 ) ) ) : 1;
		img[ i * 4 ] = Math.round( Math.min( 1, when( a - 1, al ) ) * 254 );
		img[ i * 4 + 1 ] = b ? Math.round( Math.min( 1, when( b - 1, bl ) ) * 254 ) : 255;
		img[ i * 4 + 2 ] = Math.round( pressure * 255 );
		img[ i * 4 + 3 ] = 255;

	}
	return img;

}

// what a page was made by: the analyzer's and template's bytes, the schedule and the encoder's version
export function folioMade() {

	return { analyzer: sha256( fs.readFileSync( path.join( ROOT, 'tools/folio/analysis_worker.js' ) ) ), template: sha256( fs.readFileSync( path.join( ROOT, 'tools/folio/template.json' ) ) ),
		schedule: sha256( JSON.stringify( FOLIO_SCHEDULE ) ), encoder: FOLIO_ENCODER };

}

async function analyzePage( file ) {

	const { createCanvas, loadImage } = await canvasModule();
	const source = fs.readFileSync( path.join( ROOT, 'tools/folio/analysis_worker.js' ), 'utf8' );
	const ctx = { self: {}, postMessage: () => {}, console, performance, Math, JSON, Error, Map, Set, Object, Number, Array,
		Uint8ClampedArray, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array };
	vm.createContext( ctx ); vm.runInContext( source + '\n;globalThis.__analyze = analyze;', ctx );
	const template = JSON.parse( fs.readFileSync( path.join( ROOT, 'tools/folio/template.json' ), 'utf8' ) );
	const bytes = fs.readFileSync( file ), im = await loadImage( bytes );
	// the supplied loadPage: analysis at native size up to 1536 on the long side, over the supplied paper colour
	// (the game's replay reads the maps texel for texel against the image: a page analysed smaller would never be replayed)
	if ( Math.max( im.width, im.height ) > 1536 ) throw Error( file + ' is larger than 1536 on its long side: the replay needs maps at its own size' );
	const scale = 1, w = im.width, h = im.height;
	const c = createCanvas( w, h ), x = c.getContext( '2d' ); x.fillStyle = '#ead3a9'; x.fillRect( 0, 0, w, h ); x.drawImage( im, 0, 0, w, h );
	const result = ctx.__analyze( { width: w, height: h, pixels: x.getImageData( 0, 0, w, h ).data.buffer, cleanPixels: null, template, sensitivity: 1, style: { fluidity: 1, nib: 5.2 } }, () => {} );
	const duration = schedule( result.paths );
	const reveal = encodeReveal( result.paths, result.ownership, result.width, result.height, duration );
	const rc = createCanvas( result.width, result.height ), rx = rc.getContext( '2d' ), rd = rx.createImageData( result.width, result.height ); rd.data.set( reveal ); rx.putImageData( rd, 0, 0 );
	const pc = createCanvas( result.width, result.height ), px = pc.getContext( '2d' ), pd = px.createImageData( result.width, result.height ); pd.data.set( new Uint8Array( result.base ) ); px.putImageData( pd, 0, 0 );
	return { image: { width: im.width, height: im.height, sha256: sha256( bytes ) }, map: { width: result.width, height: result.height }, duration,
		reveal: Buffer.from( rc.toBuffer( 'image/png' ) ), paper: Buffer.from( pc.toBuffer( 'image/webp', 85 ) ),
		stats: { paths: result.stats.paths, segments: result.stats.segments, unownedForeground: result.stats.unownedForeground, analysisMs: Math.round( result.stats.analysisMs ) } };

}

if ( ! isMainThread ) {

	const r = await analyzePage( workerData.file );
	parentPort.postMessage( r, [ r.reveal.buffer, r.paper.buffer ].filter( b => b.byteLength ) );

} else if ( process.argv[ 1 ] && path.resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {

	const { BESTIARY_ENTRIES } = await import( path.join( ROOT, 'src/newer/ui/bestiary_state.js' ) );
	const wanted = process.argv.slice( 2 ), entries = BESTIARY_ENTRIES.filter( e => e.image && ( ! wanted.length || wanted.includes( e.id ) ) );
	fs.mkdirSync( OUT, { recursive: true } );
	const indexPath = path.join( OUT, 'index.json' );
	const index = fs.existsSync( indexPath ) ? JSON.parse( fs.readFileSync( indexPath, 'utf8' ) ) : { pages: {} };
	Object.assign( index, { version: 1, source: SOURCE, analyzer: { file: 'tools/folio/analysis_worker.js', sha256: sha256( fs.readFileSync( path.join( ROOT, 'tools/folio/analysis_worker.js' ) ) ) },
		template: 'tools/folio/template.json', schedule: FOLIO_SCHEDULE } );
	const made = folioMade();
	const todo = entries.filter( e => { const have = index.pages[ e.id ], bytes = fs.readFileSync( path.join( ROOT, 'newer/bestiary', e.image ) ); return ! ( have && have.image?.sha256 === sha256( bytes ) && JSON.stringify( have.made ) === JSON.stringify( made ) && fs.existsSync( path.join( OUT, have.reveal ) ) ); } );
	console.log( `${ todo.length } of ${ entries.length } pages to prepare` );
	const lanes = Math.max( 1, Math.min( todo.length, os.cpus().length - 1, 8 ) );
	let next = 0;
	await Promise.all( Array.from( { length: lanes }, async () => {

		while ( next < todo.length ) {

			const e = todo[ next ++ ], t0 = Date.now();
			const r = await new Promise( ( resolve, reject ) => { const w = new Worker( fileURLToPath( import.meta.url ), { workerData: { file: path.join( ROOT, 'newer/bestiary', e.image ) } } ); w.once( 'message', resolve ); w.once( 'error', reject ); } );
			fs.writeFileSync( path.join( OUT, e.id + '.reveal.png' ), Buffer.from( r.reveal ) );
			fs.writeFileSync( path.join( OUT, e.id + '.paper.webp' ), Buffer.from( r.paper ) );
			index.pages[ e.id ] = { image: { file: e.image, ...r.image }, map: r.map, duration: r.duration, reveal: e.id + '.reveal.png', paper: e.id + '.paper.webp', made, stats: r.stats };
			fs.writeFileSync( indexPath, JSON.stringify( index, null, 1 ) + '\n' );
			console.log( `${ e.id }: ${ r.stats.paths } strokes, ${ Math.round( ( Date.now() - t0 ) / 1000 ) } s, reveal ${ r.reveal.byteLength } B, paper ${ r.paper.byteLength } B` );

		}

	} ) );

}
