// Public BSP classification and real Three cube-camera coverage. Pixel-level
// low-marker SSR/probe and distance-dependent transmission belong to the GPU
// trial; this fixture protects the lower capture against a low air ceiling.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/newer/render/gl_post.js' );
const modelApi = await import( '../src/engine/render/gl_model.js' );

function equal( actual, expected, label ) {

	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

}

Deno.test( 'low shoreline markers retain a safe above-water probe beneath a low ceiling without extra captures', async () => {

	// Separate public-module instance keeps simulated clock state independent
	// of other files' capture schedules; world building uses the real module.
	const probes = await import( '../src/newer/render/r_waterprobe.js?water-nearfield-fixture' );
	const descriptor = Object.getOwnPropertyDescriptor( performance, 'now' ); let now = 600000;
	Object.defineProperty( performance, 'now', { configurable: true, value: () => now } );
	const solid = { contents: - 2, compressed_vis: null }, air = { contents: - 1, compressed_vis: null };
	const liquid = { contents: - 3, compressed_vis: null };
	const tightCeiling = { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 4 }, children: [ solid, air ] };
	const sides = { contents: 0, plane: { normal: [ 1, 0, 0 ], dist: 200 }, children: [ tightCeiling, air ] };
	const ceiling = { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 14 }, children: [ solid, sides ] };
	const root = { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, children: [ ceiling, liquid ] };
	function face( x0, x1 ) {

		return { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: { name: '*04water1' } },
			polys: { numverts: 4, verts: [ [ x0, - 64, 0, 0, 0 ], [ x1, - 64, 0, 1, 0 ],
				[ x1, 64, 0, 1, 1 ], [ x0, 64, 0, 0, 1 ] ], next: null } };

	}
	const model = { entities: '', firstmodelsurface: 0, nummodelsurfaces: 2, numleafs: 3,
		nodes: [ root ], leafs: [ solid, air, liquid ], surfaces: [ face( - 64, 64 ), face( 300, 428 ) ] };
	const scene = new THREE.Scene(), marker = new THREE.Mesh( new THREE.BoxGeometry( 10, 10, 4 ), new THREE.MeshBasicMaterial() );
	marker.position.set( 0, 80, 10 ); scene.add( marker ); scene.updateMatrixWorld( true );
	const markerBox = new THREE.Box3().setFromObject( marker );
	const camera = new THREE.PerspectiveCamera( 100, 1.6, 4, 4096 );
	camera.up.set( 0, 0, 1 ); camera.position.set( 0, - 120, 10 ); camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld();
	let target = null, draws = 0, markerFaces = 0; const centres = [], visibility = [];
	const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: false },
		getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
		setRenderTarget: next => { target = next; },
		render( capturedScene, faceCamera ) {

			draws ++; equal( capturedScene, scene, 'capture uses the original level scene' );
			const centre = faceCamera.getWorldPosition( new THREE.Vector3() ).toArray(); centres.push( centre );
			equal( modelApi.Mod_PointInLeaf( centre, model ).contents, - 1, 'every cube face originates in actual air' );
			equal( centre[ 2 ] > faceCamera.near && centre[ 2 ] < markerBox.min.z, true, 'capture clears its near plane below the low marker' );
			const matrix = new THREE.Matrix4().multiplyMatrices( faceCamera.projectionMatrix, faceCamera.matrixWorldInverse );
			if ( new THREE.Frustum().setFromProjectionMatrix( matrix ).intersectsBox( markerBox ) ) markerFaces ++;

		}
	};
	try {

		post.R_BuildWorldLights( model ); const regions = post.R_GetLiquidRegions();
		const safe = regions.find( r => r.min[ 0 ] < 0 ), unsafe = regions.find( r => r.min[ 0 ] > 0 );
		equal( regions.length, 2, 'low ceiling does not erase physical pools' );
		equal( safe.kind, 0, 'Muddy appearance retains ordinary water physics' );
		equal( safe.probePoints.length, 1, 'low air chamber supplies a verified polygon anchor' );
		equal( modelApi.Mod_PointInLeaf( [ 0, 0, 36 ], model ).contents, - 2, 'former high capture would be inside the ceiling' );
		equal( unsafe.probePoints.length, 0, 'ceiling tighter than the capture near-plane clearance remains ineligible' );
		probes.R_WaterProbeUpdate( renderer, scene, camera, [ unsafe, safe ], all => visibility.push( all ), regions );
		const cached = probes.R_WaterProbeFor( safe );
		equal( cached != null, true, 'safe low pool captures despite the first unsafe candidate' );
		equal( draws, 6, 'one pool uses exactly six existing cube draws' );
		equal( markerFaces > 0, true, 'at least one real cube face covers the low shoreline marker' );
		equal( centres.every( point => point.join() === cached.center.join() ), true, 'published probe centre matches every rendered face' );
		equal( cached.center.join(), safe.probePoints[ 0 ].join(), 'capture retains the validated map anchor' );
		equal( probes.R_WaterProbeFor( unsafe ), null, 'unsafe low room gets no unverified fallback' );
		equal( visibility.join(), 'true,false', 'capture restores level visibility' ); equal( target, null, 'capture restores render target' );
		now += 2000; probes.R_WaterProbeUpdate( renderer, scene, camera, [ unsafe, safe ], () => {}, regions );
		equal( probes.R_WaterProbeFor( safe ), cached, 'subsequent frames retain the same probe' );
		equal( draws, 6, 'cached low-marker coverage needs no additional captures' );

	} finally {

		probes.R_WaterProbeClear(); post.R_BuildWorldLights( null ); marker.geometry.dispose(); marker.material.dispose();
		if ( descriptor ) Object.defineProperty( performance, 'now', descriptor ); else delete performance.now;

	}

} );
