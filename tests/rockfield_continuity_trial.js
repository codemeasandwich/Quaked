// A deliberately bounded, real renderer check. There is no replacement GLSL,
// synthetic height producer or CPU picture standing in for rendered results.
import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import * as post from '../src/newer/render/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import * as rock from '../src/newer/render/r_rockfield.js';
import { DrawGLPoly } from '../src/engine/render/gl_rsurf.js';

const size = 256, report = document.querySelector( '#report' );
const owned = [];
function face( profile, x0, x1, y0, y1 ) {

	// Native BSP polygons are clockwise; DrawGLPoly reverses their fan.
	const ground = profile === 'ground', points = [ [ x0, y0 ], [ x0, y1 ], [ x1, y1 ], [ x1, y0 ] ];
	return { flags: 0, plane: { normal: ground ? [ 0, 0, 1 ] : [ 0, -1, 0 ], dist: 0 }, texinfo: { texture: { name: ground ? 'wgrnd1_5' : 'uwall1_2', width: 64, height: 64 } }, polys: { numverts: 4, verts: new Float32Array( points.flatMap( ( [ x, y ] ) => [ ...( ground ? [ x, y, 0 ] : [ x, 0, y ] ), x / 64, y / 64, .5, .5 ] ) ) } };

}
function difference( a, b, channels = 3, threshold = 1 ) {

	let sum = 0, maximum = 0, changed = 0, count = 0;
	for ( let i = 0; i < a.length; i += 4 ) for ( let c = 0; c < channels; c ++ ) {

		const d = Math.abs( a[ i + c ] - b[ i + c ] ); sum += d; maximum = Math.max( maximum, d ); if ( d > threshold ) changed ++; count ++;

	}
	return { mean: sum / count, maximum, fractionAboveThreshold: changed / count, threshold };

}
async function populate( cache, chart ) {

	// Include a halo for projected hits, finite differences, cavity and shadow
	// reads. The fixture spans negative/positive pages and the four-way origin.
	const wanted = []; for ( let y = -3; y <= 2; y ++ ) for ( let x = -3; x <= 2; x ++ ) wanted.push( [ x, y ] );
	const deadline = performance.now() + 30000;
	while ( cache.tiles.size < wanted.length ) {

		for ( const [ x, y ] of wanted ) cache.request( chart, x, y );
		if ( cache.error || cache.failed.size || performance.now() > deadline ) throw new Error( 'Worker population failed: ' + ( cache.error || 'timeout/invalid tile' ) );
		await new Promise( resolve => setTimeout( resolve, 10 ) );

	}

}
try {

	for ( const v of [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_bounce, mode.r_newer_lighting, mode.r_newer_normals, mode.r_newer_water ] ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	for ( const [ key, value ] of Object.entries( { r_hdr: 1, r_dynres: 0, r_bloom: 0, r_volumetric: 0, r_bounce: 0, r_newer_lighting: 1, r_newer_normals: 1, r_newer_water: 0 } ) ) vars.Cvar_SetValue( key, value );
	const renderer = new THREE.WebGLRenderer( { preserveDrawingBuffer: true, antialias: false } ); owned.push( renderer ); renderer.setSize( size, size ); renderer.setClearColor( 0, 0 );
	const pixels = new Uint8Array( 64 * 64 * 4 );
	for ( let y = 0; y < 64; y ++ ) for ( let x = 0; x < 64; x ++ ) { const value = ( ( x >> 3 ) + ( y >> 3 ) ) % 2; pixels.set( value ? [ 131, 108, 80, 255 ] : [ 75, 85, 91, 255 ], ( y * 64 + x ) * 4 ); }
	const originalPixels = pixels.slice(), texture = new THREE.DataTexture( pixels, 64, 64 ); owned.push( texture ); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
	const lm = new THREE.DataTexture( new Uint8Array( [ 128, 128, 128, 255 ] ), 1, 1 ); owned.push( lm ); lm.channel = 1; lm.needsUpdate = true;
	const results = []; let unchanged = true;
	for ( const profile of [ 'wall', 'ground' ] ) {

		const cache = new rock.RockTileCache(); owned.push( cache ); let chartSeed, amplitude;
		const draws = [];
		for ( const arrangement of [ 'off', 'unsplit', 'split', 't-junction' ] ) {

			const rects = arrangement === 'split' ? [ [ -256, 0, -256, 256 ], [ 0, 256, -256, 256 ] ] : arrangement === 't-junction' ? [ [ -256, 0, -256, 256 ], [ 0, 256, -256, 0 ], [ 0, 256, 0, 256 ] ] : [ [ -256, 256, -256, 256 ] ];
			const faces = rects.map( r => face( profile, ...r ) ), fields = rock.R_RockfieldBuild( { name: 'maps/gpu-continuity.bsp', surfaces: faces } ), chart = fields.charts[ 0 ];
			if ( fields.charts.length !== 1 ) throw new Error( 'Fixture disconnected unexpectedly' );
			if ( chartSeed === undefined ) { chartSeed = chart.seed; amplitude = chart.amplitude; await populate( cache, chart ); }
			if ( chart.seed !== chartSeed ) throw new Error( 'Surface subdivision changed the procedural field seed' );
			rock.rockUniforms.qrRockHeights.value = cache.heightTexture; rock.rockUniforms.qrRockPages.value = cache.pageTexture; rock.rockUniforms.qrRockProbes = cache.probes;
			rock.rockUniforms.qrRockSun.value.set( .8, -.4, .25 ).normalize();
			const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 48, 1, 1, 2000 );
			camera.position.set( ...( profile === 'ground' ? [ 180, -240, 820 ] : [ 200, -820, 140 ] ) ); camera.up.set( 0, 0, 1 ); camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld();
			const snapshots = [];
			for ( const f of faces ) {

				const geometry = DrawGLPoly( f.polys, f.plane.normal ); owned.push( geometry );
				for ( const [ name, attr ] of Object.entries( geometry.attributes ) ) snapshots.push( { geometry, name, attr, data: attr.array.slice() } );
				rock.R_RockfieldGeometry( geometry, f );
				const material = new THREE.MeshLambertMaterial( { map: texture, lightMap: lm, lightMapIntensity: 2 } ); owned.push( material ); material.userData.rockField = true; post.R_RegisterDetail( material, texture ); scene.add( new THREE.Mesh( geometry, material ) );

			}
			post.R_PostBegin( renderer, true, size, size ); rock.rockUniforms.qrRockOn.value = arrangement === 'off' ? 0 : 1;
			post.R_PostBind( renderer ); renderer.render( scene, camera );
			const target = renderer.getRenderTarget(), albedo = new Uint8Array( size * size * 4 ), normalHalf = new Uint16Array( size * size * 4 );
			renderer.readRenderTargetPixels( target, 0, 0, size, size, albedo, undefined, 2 );
			renderer.readRenderTargetPixels( target, 0, 0, size, size, normalHalf, undefined, 1 );
			const normals = Float32Array.from( normalHalf, THREE.DataUtils.fromHalfFloat );
			let coveredPixels = 0, reliefAvailablePixels = 0;
			for ( let i = 0; i < normals.length; i += 4 ) { if ( normals[ i + 3 ] > 1 ) coveredPixels ++; if ( albedo[ i + 3 ] > 127 ) reliefAvailablePixels ++; }
			if ( coveredPixels < 10000 || reliefAvailablePixels < 10000 ) throw new Error( 'Fixture must contain visible shaded surface: ' + JSON.stringify( { coveredPixels, reliefAvailablePixels } ) );
			post.R_PostFinish( renderer, scene, camera, { lx: 0, ly: 0, lw: size, lh: size }, 0, [], [], 0, 1, false );
			const screen = new Uint8Array( size * size * 4 ), gl = renderer.getContext(); gl.readPixels( 0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, screen );
			const glError = gl.getError(); if ( glError ) throw new Error( 'GPU error ' + glError );
			for ( const s of snapshots ) unchanged &&= s.geometry.getAttribute( s.name ) === s.attr && s.data.every( ( v, i ) => v === s.attr.array[ i ] );
			const figure = document.createElement( 'figure' ), img = document.createElement( 'img' ), caption = document.createElement( 'figcaption' ); img.src = renderer.domElement.toDataURL(); caption.textContent = profile + ': ' + arrangement; figure.append( img, caption ); document.querySelector( '#views' ).append( figure );
			draws.push( { arrangement, albedo, normals, screen, coveredPixels, reliefAvailablePixels } );

		}
		const baseline = draws[ 1 ], effect = difference( draws[ 0 ].normals, baseline.normals, 3, .01 );
		const comparisons = draws.slice( 2 ).map( draw => ( { arrangement: draw.arrangement, albedo: difference( baseline.albedo, draw.albedo ), normals: difference( baseline.normals, draw.normals, 3, .01 ), finalImage: difference( baseline.screen, draw.screen, 3, 3 ) } ) );
		const pass = effect.fractionAboveThreshold > .005 && comparisons.every( c => c.albedo.mean < .35 && c.albedo.fractionAboveThreshold < .01 && c.normals.mean < .001 && c.normals.fractionAboveThreshold < .01 && c.finalImage.mean < .5 && c.finalImage.fractionAboveThreshold < .01 );
		results.push( { profile, pass, actualWorkerTiles: cache.tiles.size, amplitude, visibility: draws.map( ( { arrangement, coveredPixels, reliefAvailablePixels } ) => ( { arrangement, coveredPixels, reliefAvailablePixels } ) ), reliefNormalChange: effect, comparisons } );

	}
	unchanged &&= originalPixels.every( ( v, i ) => v === pixels[ i ] );
	const output = { status: unchanged && results.every( r => r.pass ) ? 'PASS' : 'FAIL', fixedDrawCount: 8, unchangedNativeAttributesAndTexture: unchanged, results };
	window.rockfieldContinuityResult = output; report.textContent = JSON.stringify( output, null, 2 );

} catch ( error ) { report.textContent = 'FAIL ' + error.stack; window.rockfieldContinuityResult = { status: 'FAIL', error: error.stack }; }
finally { rock.R_RockfieldBuild( null ); for ( const object of owned.reverse() ) object.dispose(); }
