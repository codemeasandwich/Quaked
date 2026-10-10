// The Bestiary's pencil replay (card: Folio pencil fast replay): on the first-discovery page, the creature's illustration
// and notes are drawn as if by pencil, from the owner-supplied folio-pencil-fast-replay.html (sha256 b8647694…).
//
// The supplied page analyses each page image in a worker (30 to 60 seconds a page) into strokes, and replays them with a
// WebGL2 shader that, per texel, mixes the sampled paper with the page's own pixel as the stroke's head passes. Here the
// analysis is done ahead of time by tools/prepare_folio.mjs (the supplied worker, verbatim, and its schedulePaths), into
// two small images a page in newer/bestiary/folio/: when each texel's first and second strokes reach it and how strong the
// first is (<id>.reveal.png), and the paper (<id>.paper.webp). The replay itself is the supplied shader's per-texel rule
// (first = reached x strength; reveal = first + ( 1 - first ) x second; colour = mix( paper, ink, reveal )), drawn by a
// small WebGL2 canvas of its own and composed into the Bestiary's 2D overlay as an image (R_FolioPlate). The page's own
// pixels (frame, title, rails, ornament) are never touched, and the finished replay is the page itself.
//
// Loading: the index once, and a page's two images when its encounter begins (a few hundred kB). A page that is not
// ready, has no prepared data, fails to load, or a browser without WebGL2 (or a lost context) keeps the line reveal.

import { COM_NewerURL } from './pak.js';

const FOLDER = 'newer/bestiary/folio/';
const url = file => COM_NewerURL( FOLDER + file, new URL( '../' + FOLDER + file, import.meta.url ).href );

let index = null, indexState = 'idle'; // 'idle' | 'loading' | 'ready' | 'failed'
const pages = new Map(); // id -> { state, reveal, paper, page, duration }
let gl = null, canvas = null, program = null, textures = null, uniforms = null, lost = false, shownFor = null;
export const folioStats = { plates: 0, failures: 0 };

function loadImage( file ) {

	return new Promise( ( resolve, reject ) => {

		if ( typeof Image === 'undefined' ) { reject( Error( 'no images here' ) ); return; }
		const im = new Image(); im.decoding = 'async';
		im.onload = () => resolve( im ); im.onerror = () => reject( Error( 'folio image failed: ' + file ) );
		im.src = url( file );

	} );

}

function loadIndex() {

	if ( indexState !== 'idle' ) return;
	indexState = 'loading';
	fetch( url( 'index.json' ) ).then( r => { if ( ! r.ok ) throw Error( 'folio index ' + r.status ); return r.json(); } )
		.then( j => { index = j; indexState = 'ready'; } ).catch( () => { indexState = 'failed'; folioStats.failures ++; } );

}

/*
================
R_FolioPrepare

Begin loading a page's replay (cheap to call every frame). Returns its state: 'loading', 'ready' or 'none' (no prepared
data, a failure, or no browser: the caller keeps its line reveal).
================
*/
export function R_FolioPrepare( id ) {

	if ( typeof fetch === 'undefined' ) return 'none';
	loadIndex();
	if ( indexState === 'failed' ) return 'none';
	if ( indexState !== 'ready' ) return 'loading';
	const info = index.pages?.[ id ];
	if ( ! info ) return 'none';
	let p = pages.get( id );
	if ( p === undefined ) {

		p = { state: 'loading', duration: info.duration, speed: index.schedule?.speed || 3 };
		pages.set( id, p );
		Promise.all( [ loadImage( info.reveal ), loadImage( info.paper ) ] )
			.then( ( [ reveal, paper ] ) => { p.reveal = reveal; p.paper = paper; p.state = 'ready'; } )
			.catch( () => { p.state = 'none'; folioStats.failures ++; } );

	}
	return p.state;

}

// the replay's length on screen in seconds (the supplied duration at the supplied speed), or 0
export function R_FolioSeconds( id ) {

	const p = pages.get( id );
	return p && p.state === 'ready' ? p.duration / p.speed : 0;

}

const VERTEX = `#version 300 es
void main(){ vec2 p = vec2( float( ( gl_VertexID << 1 ) & 2 ), float( gl_VertexID & 2 ) ); gl_Position = vec4( p * 2. - 1., 0., 1. ); }`;
// the supplied replayFS's per-texel rule, on the prepared reveal moments (0..254 of the replay; 255: no second stroke)
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSource, uPaper, uReveal;
uniform float uTime;
uniform vec2 uSize;
out vec4 outColor;
void main(){
 ivec2 p = ivec2( gl_FragCoord.x, uSize.y - 1. - gl_FragCoord.y );
 vec3 ink = texelFetch( uSource, p, 0 ).rgb;
 vec4 r = texelFetch( uReveal, p, 0 );
 if ( r.a < .5 ) { outColor = vec4( ink, 1. ); return; }
 vec3 paper = texelFetch( uPaper, p, 0 ).rgb;
 float q = 1. / 254., t1 = r.r * 255. / 254., t2 = r.g * 255. / 254.;
 float first = smoothstep( t1, t1 + q, uTime ) * r.b;
 float second = r.g > .999 ? 0. : smoothstep( t2, t2 + q, uTime );
 float reveal = first + ( 1. - first ) * second;
 outColor = vec4( mix( paper, ink, reveal ), 1. );
}`;

function setup() {

	if ( gl !== null || lost || typeof document === 'undefined' ) return gl !== null;
	canvas = document.createElement( 'canvas' );
	gl = canvas.getContext( 'webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true } );
	if ( ! gl ) { lost = true; return false; }
	canvas.addEventListener( 'webglcontextlost', e => { e.preventDefault(); gl = null; lost = true; } );
	const shader = ( type, src ) => { const s = gl.createShader( type ); gl.shaderSource( s, src ); gl.compileShader( s ); if ( ! gl.getShaderParameter( s, gl.COMPILE_STATUS ) ) throw Error( gl.getShaderInfoLog( s ) ); return s; };
	try {

		program = gl.createProgram(); gl.attachShader( program, shader( gl.VERTEX_SHADER, VERTEX ) ); gl.attachShader( program, shader( gl.FRAGMENT_SHADER, FRAGMENT ) ); gl.linkProgram( program );
		if ( ! gl.getProgramParameter( program, gl.LINK_STATUS ) ) throw Error( gl.getProgramInfoLog( program ) );

	} catch ( e ) { gl = null; lost = true; folioStats.failures ++; return false; }
	uniforms = Object.fromEntries( [ 'uSource', 'uPaper', 'uReveal', 'uTime', 'uSize' ].map( n => [ n, gl.getUniformLocation( program, n ) ] ) );
	textures = [ gl.createTexture(), gl.createTexture(), gl.createTexture() ];
	gl.bindVertexArray( gl.createVertexArray() );
	return true;

}

function upload( texture, image ) {

	gl.bindTexture( gl.TEXTURE_2D, texture );
	// (the prepared maps are data: no premultiplying, no colour conversion, no flipping)
	gl.pixelStorei( gl.UNPACK_FLIP_Y_WEBGL, false ); gl.pixelStorei( gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false ); gl.pixelStorei( gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE );
	gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image );
	for ( const [ k, v ] of [ [ gl.TEXTURE_MIN_FILTER, gl.NEAREST ], [ gl.TEXTURE_MAG_FILTER, gl.NEAREST ], [ gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE ], [ gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ] ] ) gl.texParameteri( gl.TEXTURE_2D, k, v );

}

/*
================
R_FolioPlate

The page drawn so far at amount 0..1 of its replay, as a canvas to draw into the overlay, or null (not ready, a size the
prepared maps do not match, no WebGL2, or a lost context: the caller keeps its line reveal).
================
*/
export function R_FolioPlate( id, image, amount ) {

	const p = pages.get( id );
	if ( ! p || p.state !== 'ready' || ! image || ! setup() ) return null;
	const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
	if ( p.reveal.naturalWidth !== w || p.reveal.naturalHeight !== h ) return null; // (the maps are of the image at its own size)
	if ( shownFor !== id ) {

		canvas.width = w; canvas.height = h;
		upload( textures[ 0 ], image ); upload( textures[ 1 ], p.paper ); upload( textures[ 2 ], p.reveal );
		shownFor = id;

	}
	gl.viewport( 0, 0, w, h ); gl.useProgram( program );
	textures.forEach( ( t, i ) => { gl.activeTexture( gl.TEXTURE0 + i ); gl.bindTexture( gl.TEXTURE_2D, t ); } );
	gl.uniform1i( uniforms.uSource, 0 ); gl.uniform1i( uniforms.uPaper, 1 ); gl.uniform1i( uniforms.uReveal, 2 );
	gl.uniform1f( uniforms.uTime, Math.max( 0, Math.min( 1, amount ) ) ); gl.uniform2f( uniforms.uSize, w, h );
	gl.drawArrays( gl.TRIANGLES, 0, 3 );
	folioStats.plates ++;
	return canvas;

}
