import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import * as post from '../src/newer/render/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import * as rock from '../src/newer/render/r_rockfield.js';
import { ROCK_AXIS_U, ROCK_AXIS_V } from '../src/newer/render/r_rocksurfaces.js';
import { DrawGLPoly } from '../src/engine/render/gl_rsurf.js';

const report = document.querySelector( '#report' ), owned = [];
// Explicit mutation control only for proving this diagnostic catches the old
// common-length-normalized frame. Production source is never modified.
const mutation = new URLSearchParams( location.search ).get( 'mutation' );
try {

	for ( const v of [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_bounce, mode.r_newer_lighting, mode.r_newer_normals, mode.r_newer_water ] ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	for ( const [ key, value ] of Object.entries( { r_hdr: 1, r_dynres: 0, r_bloom: 0, r_volumetric: 0, r_bounce: 0, r_newer_lighting: 1, r_newer_normals: 1, r_newer_water: 0 } ) ) vars.Cvar_SetValue( key, value );
	const axisU = new THREE.Vector3( ...ROCK_AXIS_U ), axisV = new THREE.Vector3( ...ROCK_AXIS_V );
	const planeNormal = axisU.clone().add( axisV ).addScaledVector( axisU.clone().cross( axisV ), .3 ).normalize();
	const tangent = planeNormal.clone().cross( new THREE.Vector3( 0, 0, 1 ) ).normalize(), bitangent = planeNormal.clone().cross( tangent ).normalize();
	// This oblique plane makes both projected axis lengths appreciably below
	// one. Normalizing either basis incorrectly cannot hide behind an almost
	// unit projected axis (as it could on an axis-aligned vertical wall).
	const localPoints = [ [ -256, -256 ], [ -256, 256 ], [ 256, 256 ], [ 256, -256 ] ];
	const points = localPoints.map( ( [ x, y ] ) => tangent.clone().multiplyScalar( x ).addScaledVector( bitangent, y ).toArray() );
	const face = { flags: 0, plane: { normal: planeNormal.toArray(), dist: 0 }, texinfo: { texture: { name: 'uwall1_2', width: 64, height: 64 } }, polys: { numverts: 4, verts: new Float32Array( points.flatMap( ( p, i ) => [ ...p, localPoints[ i ][ 0 ] / 64, localPoints[ i ][ 1 ] / 64, .5, .5 ] ) ) } };
	const fields = rock.R_RockfieldBuild( { name: 'maps/analytic-metric.bsp', surfaces: [ face ] } ), chart = fields.charts[ 0 ];
	class LinearDiagnosticWorker {

		postMessage( request ) {

			queueMicrotask( () => {

				const n = request.config.cells, b = request.config.border, width = n + 1 + 2 * b, data = new Float32Array( width * width );
				for ( let y = 0; y < width; y ++ ) for ( let x = 0; x < width; x ++ ) data[ y * width + x ] = .5 + ( request.x + ( x - b ) / n ) / 16 + ( request.y + ( y - b ) / n ) / 32;
				this.onmessage( { data: { id: request.id, result: { tileX: request.x, tileY: request.y, width, data } } } );

			} );

		}
		terminate() {}

	}
	const cache = new rock.RockTileCache( () => new LinearDiagnosticWorker() ); owned.push( cache );
	for ( let y = -3; y <= 2; y ++ ) for ( let x = -3; x <= 2; x ++ ) { cache.request( chart, x, y ); await Promise.resolve(); }
	if ( cache.tiles.size !== 36 ) throw new Error( 'Diagnostic cache incomplete' );
	rock.rockUniforms.qrRockHeights.value = cache.heightTexture; rock.rockUniforms.qrRockPages.value = cache.pageTexture; rock.rockUniforms.qrRockProbes = cache.probes;
	const geometry = DrawGLPoly( face.polys, face.plane.normal ); owned.push( geometry ); rock.R_RockfieldGeometry( geometry, face );
	const texture = new THREE.DataTexture( new Uint8Array( [ 110, 100, 90, 255 ] ), 1, 1 ); owned.push( texture ); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
	const lm = new THREE.DataTexture( new Uint8Array( [ 128, 128, 128, 255 ] ), 1, 1 ); owned.push( lm ); lm.channel = 1; lm.needsUpdate = true;
	const material = new THREE.MeshLambertMaterial( { map: texture, lightMap: lm, lightMapIntensity: 2 } ); owned.push( material ); material.userData.rockField = true; post.R_RegisterDetail( material, texture );
	if ( mutation === 'normalized-frame' ) {

		const patch = material.onBeforeCompile;
		material.onBeforeCompile = function ( shader, renderer ) {

			patch.call( this, shader, renderer );
			const marker = 'qrRockGradU*=256.;qrRockGradV*=256.;';
			if ( ! shader.fragmentShader.includes( marker ) ) throw new Error( 'Mutation marker no longer matches production shader' );
			shader.fragmentShader = shader.fragmentShader.replace( marker, marker + '\nfloat mutationScale=inversesqrt(max(max(dot(qrRockGradU,qrRockGradU),dot(qrRockGradV,qrRockGradV)),1e-20));qrRockGradU*=mutationScale;qrRockGradV*=mutationScale;' );

		};

	}
	else if ( mutation ) throw new Error( 'Unknown diagnostic mutation' );
	const renderer = new THREE.WebGLRenderer( { preserveDrawingBuffer: true, antialias: false } ); owned.push( renderer ); renderer.setSize( 256, 256 ); renderer.setClearColor( 0, 0 );
	const scene = new THREE.Scene(); scene.add( new THREE.Mesh( geometry, material ) );
	// The chart gradient is projected onto the actual wall plane. Its two
	// coordinate directions are not normalized separately and need not be
	// perpendicular. This is the independent physical chain-rule expectation.
	const gradU = axisU.clone().addScaledVector( planeNormal, -axisU.dot( planeNormal ) ), gradV = axisV.clone().addScaledVector( planeNormal, -axisV.dot( planeNormal ) );
	const expected = planeNormal.clone().addScaledVector( gradU, -chart.amplitude / 16 ).addScaledVector( gradV, -chart.amplitude / 32 ).normalize();
	// Each R16F height has at most 2^-12 rounding error below height 1.
	// A central difference at e >= 1/64 therefore has at most 1/64 slope
	// error. Multiply by physical amplitude and projected gradient lengths.
	// Allow encoded RGB16F normal error plus a small filtering-roundoff margin.
	const maximumErrorBound = chart.amplitude * ( gradU.length() + gradV.length() ) / 64 + .004;
	const results = [];
	for ( const position of [ [ 0, -820, 0 ], [ 260, -820, 180 ] ] ) for ( const roll of [ 0, Math.PI / 4 ] ) {

		const camera = new THREE.PerspectiveCamera( 48, 1, 1, 2000 ); camera.position.copy( planeNormal ).multiplyScalar( -position[ 1 ] ).addScaledVector( tangent, position[ 0 ] ).addScaledVector( bitangent, position[ 2 ] ); camera.up.copy( bitangent ); camera.lookAt( 0, 0, 0 ); camera.rotateZ( roll ); camera.updateMatrixWorld();
		post.R_PostBegin( renderer, true, 256, 256 ); rock.rockUniforms.qrRockOn.value = 1; post.R_PostBind( renderer ); renderer.render( scene, camera );
		const data = new Uint16Array( 256 * 256 * 4 ); renderer.readRenderTargetPixels( renderer.getRenderTarget(), 0, 0, 256, 256, data, undefined, 1 );
		let count = 0, errorSum = 0, maximumError = 0; const average = new THREE.Vector3();
		for ( let y = 48; y < 208; y ++ ) for ( let x = 48; x < 208; x ++ ) {

			const i = ( y * 256 + x ) * 4, depth = THREE.DataUtils.fromHalfFloat( data[ i + 3 ] ); if ( depth <= 1 ) continue;
			const actual = new THREE.Vector3( ...[ 0, 1, 2 ].map( c => THREE.DataUtils.fromHalfFloat( data[ i + c ] ) * 2 - 1 ) ).transformDirection( camera.matrixWorld );
			const error = actual.distanceTo( expected ); errorSum += error; maximumError = Math.max( maximumError, error ); average.add( actual ); count ++;

		}
		post.R_PostFinish( renderer, scene, camera, { lx: 0, ly: 0, lw: 256, lh: 256 }, 0, [], [], 0, 1, false );
		const img = document.createElement( 'img' ); img.src = renderer.domElement.toDataURL(); img.alt = 'Diagnostic plane; camera roll ' + roll; document.querySelector( '#views' ).append( img );
		const glError = renderer.getContext().getError();
		results.push( { position: camera.position.toArray(), rollRadians: roll, samples: count, meanNormalError: count ? errorSum / count : null, maximumNormalError: maximumError, measuredWorldNormal: average.divideScalar( count || 1 ).toArray(), glError, pass: count > 10000 && errorSum / count < .003 && maximumError < maximumErrorBound && glError === 0 } );

	}
	const output = { status: results.every( r => r.pass ) ? 'PASS' : 'FAIL', mutation: mutation || null, fixedDrawCount: 4, diagnosticHeight: '0.5 + u/16 + v/32', expectedWorldNormal: expected.toArray(), quantizationMaximumErrorBound: maximumErrorBound, maximumMeanError: .003, results };
	window.rockfieldMetricResult = output; report.textContent = JSON.stringify( output, null, 2 );

} catch ( error ) { report.textContent = 'FAIL ' + error.stack; window.rockfieldMetricResult = { status: 'FAIL', error: error.stack }; }
finally { rock.R_RockfieldBuild( null ); for ( const object of owned.reverse() ) object.dispose(); }
