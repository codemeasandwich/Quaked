/**
 * @module engine/render/r_controller_model
 *
 * Owner-supplied procedural controller reference, 20 October 2026: controller-source/dist/model.js.
 * Geometry and named anchors retained; world Y is up, +Z points towards the grips. No game renderer state is used.
 */
/** Builds the retained reference geometry and independently movable controls with group-space leader anchors. */
export function buildController( THREE ) {
	const group = new THREE.Group();
	group.name = 'Annotated controller';
	const controls = {};
	const anchors = {};
	const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
	const material = ( color, roughness = 0.82 ) => new THREE.MeshStandardMaterial( {
		color, roughness, metalness: 0.015
	} );
	const mats = {
		shell: material( 0x717472 ), side: material( 0x565a58 ), bottom: material( 0x505452 ),
		outline: material( 0x222725 ), socket: material( 0x343a37 ), rubber: material( 0x454a47 ),
		cap: material( 0x999c97 ), pad: material( 0xaaaDA5 ), inset: material( 0x777c76 ),
		grip: material( 0x7e827e ), shoulder: material( 0x92968f ), trigger: material( 0x7a8079 ),
		green: material( 0x98aa4a, 0.57 ), blue: material( 0x328ab8, 0.52 ),
		red: material( 0xca493e, 0.56 ), yellow: material( 0xd7a51c, 0.53 )
	};
	function mesh( geometry, mat, parent = group ) {
		const m = new THREE.Mesh( geometry, Array.isArray( mat ) ? mat : mat.clone() );
		m.castShadow = true;
		m.receiveShadow = true;
		parent.add( m );
		return m;
	}
	function cylinder( radiusTop, radiusBottom, height, mat, parent, y = 0, segments = 64 ) {
		const m = mesh( new THREE.CylinderGeometry( radiusTop, radiusBottom, height, segments ), mat, parent );
		m.position.y = y;
		return m;
	}
	function ring( radius, thickness, y, mat, parent = group ) {
		const m = mesh( new THREE.TorusGeometry( radius, thickness, 8, 72 ), mat, parent );
		m.rotation.x = Math.PI / 2;
		m.position.y = y;
		return m;
	}
	function roundedShape( width, depth, radius ) {
		const s = new THREE.Shape();
		const x = -width / 2, z = -depth / 2;
		const r = Math.min( radius, width / 2, depth / 2 );
		s.moveTo( x + r, z );
		s.lineTo( x + width - r, z );
		s.quadraticCurveTo( x + width, z, x + width, z + r );
		s.lineTo( x + width, z + depth - r );
		s.quadraticCurveTo( x + width, z + depth, x + width - r, z + depth );
		s.lineTo( x + r, z + depth );
		s.quadraticCurveTo( x, z + depth, x, z + depth - r );
		s.lineTo( x, z + r );
		s.quadraticCurveTo( x, z, x + r, z );
		return s;
	}
	function roundedBox( width, depth, height, radius, mat, parent, bevel = 0.025 ) {
		const g = new THREE.ExtrudeGeometry( roundedShape( width, depth, radius ), {
			depth: height, steps: 1, bevelEnabled: bevel > 0,
			bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10
		} );
		g.rotateX( -Math.PI / 2 );
		g.translate( 0, -height / 2, 0 );
		return mesh( g, mat, parent );
	}
	function register( id, controlGroup, type, anchor ) {
		controlGroup.name = id;
		const meshes = [];
		controlGroup.traverse( child => {
			if ( child.isMesh ) {
				child.userData.controlId = id;
				meshes.push( child );
			}
		} );
		controls[id] = {group: controlGroup, meshes, restPosition: controlGroup.position.clone(), restRotation: controlGroup.rotation.clone(), type};
		anchors[id] = anchor.clone();
	}

	// A continuous loft gives the body its rounded face, palm grips, and full underside.
	const outlinePoints = [
		[0, -1.48], [1.3, -1.51], [2.35, -1.43], [2.88, -1.12],
		[3.025, -0.60], [2.96, 0.13], [2.83, 0.97], [2.65, 1.81],
		[2.42, 2.33], [2.10, 2.40], [1.78, 2.08], [1.35, 1.44],
		[0.77, 1.22], [0, 1.18], [-0.77, 1.22], [-1.35, 1.44],
		[-1.78, 2.08], [-2.10, 2.40], [-2.42, 2.33], [-2.65, 1.81],
		[-2.83, 0.97], [-2.96, 0.13], [-3.025, -0.60], [-2.88, -1.12],
		[-2.35, -1.43], [-1.3, -1.51]
	];
	const outlineCurve = new THREE.CatmullRomCurve3( outlinePoints.map( p => V( p[0], 0, p[1] ) ), true, 'centripetal' );
	const N = 192;
	const perimeter = Array.from( {length: N}, ( _, i ) => outlineCurve.getPoint( i / N ) );
	const centerZ = 0.22;
	const loft = [
		[0.001, .505], [.38, .505], [.68, .486], [.88, .426],
		[.955, .355], [.985, .270], [1, .120], [1.014, -.045],
		[1.001, -.245], [.957, -.422], [.835, -.535], [.40, -.565], [.001, -.565]
	];
	const positions = [], indices = [];
	loft.forEach( ( [scale, y] ) => perimeter.forEach( p => positions.push( p.x * scale, y, centerZ + ( p.z - centerZ ) * scale ) ) );
	const bodyGeometry = new THREE.BufferGeometry();
	for ( let j = 0; j < loft.length - 1; j++ ) {
		const start = indices.length;
		for ( let i = 0; i < N; i++ ) {
			const ni = ( i + 1 ) % N, a = j * N + i, b = j * N + ni;
			const c = ( j + 1 ) * N + i, d = ( j + 1 ) * N + ni;
			indices.push( a, b, c, b, d, c );
		}
		bodyGeometry.addGroup( start, indices.length - start, j < 6 ? 0 : j < 10 ? 1 : 2 );
	}
	bodyGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	bodyGeometry.setIndex( indices );
	bodyGeometry.computeVertexNormals();
	const shell = mesh( bodyGeometry, [mats.shell, mats.side, mats.bottom] );
	shell.name = 'Sculpted two-piece shell';

	function perimeterLine( scale, y, width, mat ) {
		const points = perimeter.map( p => V( p.x * scale, y, centerZ + ( p.z - centerZ ) * scale ) );
		const c = new THREE.CatmullRomCurve3( points, true, 'centripetal' );
		return mesh( new THREE.TubeGeometry( c, 192, width, 6, true ), mat );
	}
	perimeterLine( 1.006, -.175, .017, mats.outline ).name = 'Shell parting seam';
	perimeterLine( .996, .165, .012, mats.outline ).name = 'Face edge';

	// Evaluate the same radial loft for grip panels, so their surfaces hug the shell.
	function topY( x, z ) {
		let dx = x, dz = z - centerZ;
		const length = Math.hypot( dx, dz );
		if ( length < .0001 ) return .505;
		dx /= length; dz /= length;
		let distance = Infinity;
		for ( let i = 0; i < N; i++ ) {
			const a = perimeter[i], b = perimeter[( i + 1 ) % N];
			const ex = b.x - a.x, ez = b.z - a.z;
			const ax = a.x, az = a.z - centerZ;
			const den = dx * ez - dz * ex;
			if ( Math.abs( den ) < 1e-8 ) continue;
			const t = ( ax * ez - az * ex ) / den;
			const u = ( ax * dz - az * dx ) / den;
			if ( t > 0 && u >= 0 && u <= 1 ) distance = Math.min( distance, t );
		}
		const r = Math.min( 1, length / distance );
		for ( let j = 1; j < 7; j++ ) {
			if ( r <= loft[j][0] ) {
				const f = ( r - loft[j - 1][0] ) / ( loft[j][0] - loft[j - 1][0] );
				return THREE.MathUtils.lerp( loft[j - 1][1], loft[j][1], Math.max( 0, f ) );
			}
		}
		return .12;
	}
	function gripPatch( sign ) {
		const points = [
			[1.63, .75], [1.90, .28], [2.35, .05], [2.69, .32],
			[2.63, 1.13], [2.40, 2.06], [2.18, 2.16], [1.91, 1.77], [1.66, 1.19]
		].map( p => V( sign * p[0], 0, p[1] ) );
		if ( sign < 0 ) points.reverse();
		const curve = new THREE.CatmullRomCurve3( points, true, 'centripetal' );
		const count = 64, ringCount = 7;
		const p = [], ix = [], cx = sign * 2.17, cz = 1.06;
		for ( let j = 0; j <= ringCount; j++ ) {
			const scale = Math.max( .001, j / ringCount );
			for ( let i = 0; i < count; i++ ) {
				const v = curve.getPoint( i / count );
				const x = cx + ( v.x - cx ) * scale, z = cz + ( v.z - cz ) * scale;
				p.push( x, topY( x, z ) + .008, z );
			}
		}
		for ( let j = 0; j < ringCount; j++ ) for ( let i = 0; i < count; i++ ) {
			const ni = ( i + 1 ) % count, a = j * count + i, b = j * count + ni;
			const c = ( j + 1 ) * count + i, d = ( j + 1 ) * count + ni;
			ix.push( a, b, c, b, d, c );
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( p, 3 ) );
		g.setIndex( ix ); g.computeVertexNormals();
		const patch = mesh( g, mats.grip );
		patch.material.side = THREE.DoubleSide;
		patch.name = sign < 0 ? 'Left palm inset' : 'Right palm inset';
	}
	gripPatch( -1 ); gripPatch( 1 );

	function stick( id, x, z ) {
		const g = new THREE.Group(); group.add( g ); g.position.set( x, .475, z );
		cylinder( .675, .69, .075, mats.outline, g, .015 );
		cylinder( .565, .665, .100, mats.inset, g, .098 );
		ring( .65, .018, .065, mats.outline, g );
		cylinder( .38, .46, .11, mats.socket, g, .174 );
		cylinder( .29, .325, .22, mats.rubber, g, .272 );
		const profile = [[0,.365],[.33,.365],[.425,.395],[.47,.445],[.48,.495],[.448,.552],[.37,.578],[0,.568]];
		const cap = mesh( new THREE.LatheGeometry( profile.map( p => new THREE.Vector2( ...p ) ), 80 ), mats.cap, g );
		cap.name = 'Rounded thumbstick cap';
		ring( .465, .012, .495, mats.outline, g );
		ring( .385, .006, .577, mats.inset, g );
		register( id, g, 'stick', V( x, 1.065, z ) );
		const prefix = id === 'left-stick' ? 'left' : 'right';
		anchors[`${prefix}-axis-x-neg`] = V( x - .79, 1.085, z );
		anchors[`${prefix}-axis-x-pos`] = V( x + .79, 1.085, z );
		anchors[`${prefix}-axis-z-neg`] = V( x, 1.085, z - .79 );
		anchors[`${prefix}-axis-z-pos`] = V( x, 1.085, z + .79 );
	}
	stick( 'left-stick', -1.65, -.48 );
	stick( 'right-stick', 1.04, .74 );

	// Four individual arms make the direction pad's annotations and hit targets exact.
	const padX = -1.03, padZ = .9;
	const padMount = new THREE.Group(); group.add( padMount ); padMount.position.set( padX, .475, padZ );
	cylinder( .64, .66, .105, mats.outline, padMount, .025 );
	cylinder( .59, .625, .105, mats.inset, padMount, .111 );
	cylinder( .547, .56, .062, mats.cap, padMount, .179 );
	ring( .574, .015, .183, mats.outline, padMount );
	const padCenter = roundedBox( .255, .255, .055, .04, mats.pad, padMount, .018 );
	padCenter.position.y = .247;
	const pads = [
		['pad-up', 0, -.30, 0], ['pad-right', .30, 0, Math.PI / 2],
		['pad-down', 0, .30, Math.PI], ['pad-left', -.30, 0, -Math.PI / 2]
	];
	pads.forEach( ( [id, dx, dz, rotation] ) => {
		const g = new THREE.Group(); group.add( g );
		g.position.set( padX + dx, .716, padZ + dz );
		const arm = roundedBox( .235, .39, .052, .032, mats.pad, g, .013 );
		arm.rotation.y = rotation;
		register( id, g, 'pad', V( padX + dx * 1.28, .77, padZ + dz * 1.28 ) );
	} );

	function faceButton( id, x, z, mat ) {
		const g = new THREE.Group(); group.add( g ); g.position.set( x, .485, z );
		cylinder( .29, .31, .055, mats.outline, g, .025 );
		cylinder( .268, .283, .045, mats.socket, g, .068 );
		const profile = [[0,.07],[.19,.07],[.237,.092],[.252,.14],[.248,.19],[.215,.235],[0,.243]];
		mesh( new THREE.LatheGeometry( profile.map( p => new THREE.Vector2( ...p ) ), 64 ), mat, g );
		ring( .244, .008, .152, mat, g );
		register( id, g, 'button', V( x, .745, z ) );
	}
	faceButton( 'button-a', 1.85, -.17, mats.green );
	faceButton( 'button-x', 1.42, -.60, mats.blue );
	faceButton( 'button-b', 2.28, -.60, mats.red );
	faceButton( 'button-y', 1.85, -1.03, mats.yellow );

	function utilityButton( id, x, radius, capMat ) {
		const g = new THREE.Group(); group.add( g ); g.position.set( x, .505, -.1 );
		cylinder( radius + .036, radius + .05, .04, mats.outline, g, .012 );
		const cap = cylinder( radius, radius + .01, .075, capMat, g, .065 );
		if ( id !== 'guide' ) { cap.scale.z = .78; }
		ring( radius - .008, .007, .105, capMat, g );
		register( id, g, 'button', V( x, .626, -.1 ) );
	}
	utilityButton( 'back', -.58, .105, mats.inset );
	utilityButton( 'start', .58, .105, mats.inset );
	utilityButton( 'guide', 0, .325, mats.inset );

	function bumper( id, sign ) {
		const g = new THREE.Group(); group.add( g );
		g.position.set( sign * 2.02, .155, -1.465 );
		g.rotation.y = sign * -.07;
		g.rotation.z = sign * -.035;
		const socket = roundedBox( 1.31, .275, .24, .09, mats.outline, g, .023 );
		socket.position.z = -.035;
		const cap = roundedBox( 1.22, .205, .205, .075, mats.shoulder, g, .031 );
		cap.position.set( 0, .025, -.095 );
		register( id, g, 'bumper', V( sign * 2.02, .255, -1.68 ) );
	}
	bumper( 'left-bumper', -1 );
	bumper( 'right-bumper', 1 );

	function trigger( id, sign ) {
		const g = new THREE.Group(); group.add( g );
		g.position.set( sign * 2.10, -.16, -1.47 );
		g.rotation.z = sign * -.085;
		// Side profile, swept across the finger's width; the front face curves down and back.
		const s = new THREE.Shape();
		s.moveTo( -.06, .16 );
		s.bezierCurveTo( .10, .17, .24, .12, .265, -.035 );
		s.bezierCurveTo( .29, -.20, .34, -.37, .24, -.51 );
		s.quadraticCurveTo( .16, -.61, -.005, -.54 );
		s.quadraticCurveTo( -.09, -.49, -.075, -.34 );
		s.lineTo( -.035, -.045 );
		s.quadraticCurveTo( -.105, .09, -.06, .16 );
		const geo = new THREE.ExtrudeGeometry( s, {
			depth: .65, bevelEnabled: true, bevelThickness: .035, bevelSize: .035,
			bevelSegments: 3, steps: 1, curveSegments: 16
		} );
		geo.rotateY( Math.PI / 2 );
		geo.translate( -.325, 0, 0 );
		const triggerMesh = mesh( geo, mats.trigger, g );
		triggerMesh.name = 'Curved finger trigger';
		const edge = new THREE.LineSegments( new THREE.EdgesGeometry( geo, 38 ), new THREE.LineBasicMaterial( {color: 0x303630, transparent: true, opacity: .75} ) );
		g.add( edge );
		const hinge = cylinder( .09, .09, .70, mats.socket, g, .08, 32 );
		hinge.rotation.z = Math.PI / 2;
		register( id, g, 'trigger', V( sign * 2.10, -.46, -1.79 ) );
	}
	trigger( 'left-trigger', -1 );
	trigger( 'right-trigger', 1 );

	// Quiet underside detailing keeps the reconstruction complete when it is rotated.
	const underside = new THREE.Group(); group.add( underside ); underside.position.set( 0, -.574, .22 );
	const panel = roundedBox( 1.54, 1.13, .022, .12, mats.side, underside, .008 );
	panel.name = 'Underside service panel';
	for ( const [x,z] of [[-2.35,.7],[2.35,.7],[-1.85,-.83],[1.85,-.83]] ) {
		const screw = new THREE.Group(); group.add( screw ); screw.position.set( x, -.498, z );
		cylinder( .052, .052, .025, mats.outline, screw, 0, 20 );
	}

	group.userData.reconstruction = 'Procedural interpretation of the supplied annotated controller reference';
	group.userData.faceDirection = '+Y';
	return {group, controls, anchors, materials: Object.values( mats )};
}

/** Metadata retained with the owner-supplied procedural reconstruction. */
export const modelInfo = {
	title: 'Annotated game controller',
	units: 'relative',
	controlCount: 17,
	construction: 'Sculpted shell, separate thumbsticks, directional pad, face buttons, bumpers and triggers'
};
