// Independent review checks at the material, collision and casing interfaces.
// The fixtures use real Three geometry and Quake BSP hull traversal.
import { readFileSync } from 'node:fs';
await import( '../src/gl_rsurf.js' );
const THREE = await import( 'three' );
const { R_AssetAliasMaterial, R_CloneAliasMaterial } = await import( '../src/r_newerskins.js' );
const { R_ShellTrace } = await import( '../src/r_shelltrace.js' );
const shells = await import( '../src/r_shells.js' );
const weapons = await import( '../src/r_weapons.js' );
const { cl } = await import( '../src/client.js' );
const { r_hdr } = await import( '../src/gl_post.js' );
const { Cvar_RegisterVariable, Cvar_SetValue, Cvar_FindVar } = await import( '../src/engine/common/cvar.js' );

function check( value, label ) { if ( ! value ) throw new Error( label ); }
function near( actual, expected, label, epsilon = 0.00005 ) {

	check( Number.isFinite( actual ) && Math.abs( actual - expected ) < epsilon, `${label}: ${actual} != ${expected}` );

}
function sameVector( actual, expected, label ) { expected.forEach( ( value, i ) => near( actual[ i ], value, label + ' ' + i ) ); }
function shader() {

	return { uniforms: {}, vertexShader: '#include <project_vertex>',
		fragmentShader: '#include <map_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>' };

}

Deno.test( 'review: cloned imported materials retain supplied maps and enhanced surface outputs', () => {

	const maps = { diffuse: new THREE.Texture(), normal: new THREE.Texture(), luma: new THREE.Texture() };
	const original = R_AssetAliasMaterial( maps, 'review' );
	try {

		for ( const transparent of [ false, true ] ) for ( const held of [ false, true ] ) {

			const material = R_CloneAliasMaterial( original ); material.transparent = transparent; material.userData.quakeViewmodel = held;
			const compiled = shader(); material.onBeforeCompile( compiled );
			check( compiled.uniforms.qrNormal.value === maps.normal, 'normal map survives clone' );
			check( compiled.uniforms.qrLuma.value === maps.luma, 'emissive map survives clone' );
			if ( held ) check( /gNormal\s*=\s*vec4\(qrN\*0\.5\+0\.5,-vQrView\.z-2\.\)/.test( compiled.fragmentShader ), 'held clone writes physical normal and distinct true-depth packet' );
			else if ( transparent ) check( /gNormal\s*=\s*vec4\(0\.\)/.test( compiled.fragmentShader ), 'authored translucent color pass marks blended receiver data unavailable until separate repair' );
			else check( /gNormal\s*=\s*vec4\(qrN\*0\.5\+0\.5,vQrView\.z\)/.test( compiled.fragmentShader ), 'opaque world alias writes analytic normal and true depth' );
			check( compiled.fragmentShader.includes( 'gAlbedo = vec4( qrAlbedo' ), 'unlit albedo written even for held transparency' );
			check( held ? material.customProgramCacheKey() !== original.customProgramCacheKey() : material.customProgramCacheKey() === original.customProgramCacheKey(), 'ordinary clone retains cache identity while held data contract has its own program' );
			material.dispose();

		}

	} finally { original.dispose(); Object.values( maps ).forEach( texture => texture.dispose() ); }

} );

function worldFloor() {

	return { name: 'maps/review.bsp', hulls: [ { firstclipnode: 0, lastclipnode: 0,
		planes: [ { normal: new Float32Array( [ 0, 0, 1 ] ), dist: 0, type: 2 } ],
		clipnodes: [ { planenum: 0, children: new Int16Array( [ - 1, - 2 ] ) } ] } ] };

}
function lift() {

	// A closed slab: x/y +-512, local z=-8..0. Its top stands above world floor.
	const planes = [
		[ [ 0, 0, 1 ], 0 ], [ [ 0, 0, - 1 ], 8 ],
		[ [ 1, 0, 0 ], 512 ], [ [ - 1, 0, 0 ], 512 ],
		[ [ 0, 1, 0 ], 512 ], [ [ 0, - 1, 0 ], 512 ]
	].map( ( [ normal, dist ] ) => ( { normal: new Float32Array( normal ), dist, type: 3 } ) );
	return { _entityIndex: 7, origin: [ 0, 0, 40 ], angles: [ 0, 0, 0 ],
		model: { name: '*review-lift', hulls: [ { planes, firstclipnode: 0, lastclipnode: 5,
			clipnodes: planes.map( ( _, i ) => ( { planenum: i, children: new Int16Array( [ - 1, i === 5 ? - 2 : i + 1 ] ) } ) ) } ] } };

}

Deno.test( 'review: raised and rotated brush floors intercept shell sweeps before the world floor', () => {

	const world = worldFloor(), platform = lift();
	const hit = R_ShellTrace( world, [ 0, 0, 70 ], [ 0, 0, - 10 ], 0.55, [ platform ] );
	check( hit.ent === platform, 'raised floor owns contact' ); near( hit.endpos[ 2 ], 40.58125, 'raised floor clearance' );
	check( ! hit.startsolid && ! hit.allsolid, 'sweep starts outside brush' );
	const ignored = { ...platform, model: { ...platform.model, name: 'progs/player.mdl' } };
	near( R_ShellTrace( world, [ 0, 0, 70 ], [ 0, 0, - 10 ], 0.55, [ ignored ] ).endpos[ 2 ], 0.58125, 'alias entity excluded' );
	platform.origin = [ 100, 25, 40 ]; platform.angles = [ 0, 90, 30 ];
	const normal = [ 0.5, 0, Math.sqrt( 3 ) / 2 ];
	const start = platform.origin.map( ( value, i ) => value + normal[ i ] * 10 );
	const end = platform.origin.map( ( value, i ) => value - normal[ i ] * 10 );
	const tilted = R_ShellTrace( world, start, end, 0.55, [ platform ] );
	check( tilted.ent === platform, 'tilted floor owns contact' ); sameVector( tilted.plane.normal, normal, 'brush normal rotated into world' );
	sameVector( tilted.endpos, platform.origin.map( ( value, i ) => value + normal[ i ] * 0.58125 ), 'brush hit transformed into world' );

} );

async function withShellTrial( fn ) {

	const originalFetch = globalThis.fetch, originalLoad = THREE.TextureLoader.prototype.load;
	const previous = { hdr: r_hdr.value, enabled: weapons.r_newer_weapons.value,
		viewentity: cl.viewentity, angles: cl.viewangles, velocity: cl.velocity, mesh: cl.viewent._aliasMesh };
	globalThis.fetch = async path => {

		try { const bytes = readFileSync( new URL( '../' + path, import.meta.url ) ); return { ok: true, json: async () => JSON.parse( bytes.toString() ) }; }
		catch { return { ok: false }; }

	};
	THREE.TextureLoader.prototype.load = function ( url, done ) {

		const texture = new THREE.DataTexture( new Uint8Array( [ 180, 120, 60, 255 ] ), 1, 1 ); queueMicrotask( () => done( texture ) ); return texture;

	};
	if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( r_hdr );
	Cvar_SetValue( 'r_hdr', 1 ); weapons.r_newer_weapons.value = 1;
	cl.viewentity = 1; cl.viewangles = [ 0, 0, 0 ]; cl.velocity = [ 0, 0, 0 ]; cl.viewent._aliasMesh = null;
	const world = worldFloor(), platform = lift(), scene = new THREE.Scene();
	let present = true;
	shells.R_ShellsReset();
	shells.R_ShellsSetup( { scene, client: () => cl, light: () => 128,
		trace: ( a, b, radius ) => R_ShellTrace( world, a, b, radius, present ? [ platform ] : [] ),
		entity: id => present && id === 7 ? platform : null } );
	shells.R_ShellsNewMap( world.name );
	try {

		await weapons.R_WeaponLoad( 'shell' );
		shells.R_ShellsFrame( 0 );
		await new Promise( resolve => queueMicrotask( resolve ) );
		await fn( { world, platform, scene, remove: () => { present = false; } } );

	} finally {

		shells.R_ShellsReset(); globalThis.fetch = originalFetch; THREE.TextureLoader.prototype.load = originalLoad;
		Cvar_SetValue( 'r_hdr', previous.hdr ); weapons.r_newer_weapons.value = previous.enabled;
		cl.viewentity = previous.viewentity; cl.viewangles = previous.angles; cl.velocity = previous.velocity; cl.viewent._aliasMesh = previous.mesh;

	}

}
function onlyShell() { return shells.R_ShellsSnapshot().levels[ 0 ].shells[ 0 ]; }

Deno.test( 'review: fired casing lands on a lift, follows translation and rotation, survives save, then falls when support disappears', async () => {

	await withShellTrial( async ( { world, platform, scene, remove } ) => {

		check( shells.R_ShellShot( 1, 1, 'weapons/guncock.wav', [ 0, 0, 70 ] ) === 1, 'one real shot accepted' );
		for ( let i = 0; i < 2400; i ++ ) shells.R_ShellsFrame( i / 120 );
		let shell = onlyShell();
		check( shell.rest && shell.support?.id === 7, 'casing settles on brush support' ); near( shell.p[ 2 ], 40.58125, 'casing stays above world floor', 0.032 );
		check( shell.p[ 2 ] >= 40.55, 'casing radius never penetrates lift' );
		check( scene.children.length === 1 && scene.children[ 0 ].count === 1, 'supported casing rendered' );
		const compiled = shader(); scene.children[ 0 ].material.onBeforeCompile( compiled );
		check( compiled.uniforms.uHasNormal && compiled.fragmentShader.includes( 'gAlbedo = vec4( qrAlbedo' ), 'actual casing chunk clone retains imported shader' );
		check( compiled.vertexShader.includes( 'instanceMatrix' ), 'actual casing shader transforms individual instance normals' );
		platform.origin = [ 30, 20, 60 ]; platform.angles[ 1 ] = 90;
		shells.R_ShellsFrame( 21 ); shell = onlyShell();
		sameVector( shell.p, [ 30 - shell.support.local[ 1 ], 20 + shell.support.local[ 0 ], 60 + shell.support.local[ 2 ] ], 'rotating translated platform carries casing' );
		const saved = JSON.parse( JSON.stringify( shells.R_ShellsSnapshot() ) );
		shells.R_ShellsRestore( saved ); shells.R_ShellsNewMap( world.name ); shells.R_ShellsFrame( 22 );
		sameVector( onlyShell().p, shell.p, 'save restoration retains supported position' );
		check( onlyShell().support.id === 7, 'save restoration retains support identity' );
		platform.origin[ 2 ] += 15; shells.R_ShellsFrame( 23 ); near( onlyShell().p[ 2 ], shell.p[ 2 ] + 15, 'restored casing follows lift' );
		remove();
		for ( let i = 0; i < 2400; i ++ ) shells.R_ShellsFrame( 24 + i / 120 );
		const dropped = onlyShell(); check( dropped.rest && ! dropped.support, 'removed support returns casing to world floor' );
		near( dropped.p[ 2 ], 0.58125, 'unsupported casing lands on world ground', 0.032 );
		check( dropped.p[ 2 ] >= 0.55, 'casing radius never penetrates world ground' );
		check( shells.R_ShellsStatus().count === 1, 'support removal never deletes casing' );

	} );

} );

Deno.test( 'review: brush rotation updates casing orientation even when its world position stays fixed', async () => {

	await withShellTrial( async ( { world, platform } ) => {

		shells.R_ShellsRestore( { version: 1, levels: [ { name: world.name, shells: [ {
			p: [ 0, 0, 40.58125 ], v: [ 0, 0, 0 ], q: [ 0, 0, 0, 1 ], spin: [ 0, 0, 0 ], rest: true, yaw: 0,
			support: { id: 7, model: platform.model.name, local: [ 0, 0, 0.58125 ], q: [ 0, 0, 0, 1 ] }
		} ] } ] } );
		shells.R_ShellsNewMap( world.name ); shells.R_ShellsFrame( 0 );
		platform.angles[ 1 ] = 90; shells.R_ShellsFrame( 1 );
		sameVector( onlyShell().p, [ 0, 0, 40.58125 ], 'pivot casing position unchanged' );
		const expected = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 0, 1 ), Math.PI / 2 );
		near( Math.abs( new THREE.Quaternion().fromArray( onlyShell().q ).dot( expected ) ), 1, 'pivot casing rotates with support' );

	} );

} );

Deno.test( 'review: malformed saved support is discarded without losing the physical casing', async () => {

	await withShellTrial( async ( { world, platform } ) => {

		shells.R_ShellsRestore( { version: 1, levels: [ { name: world.name, shells: [ {
			p: [ 0, 0, 80 ], v: [ 0, 0, 0 ], q: [ 0, 0, 0, 1 ], spin: [ 0, 0, 0 ], rest: true, yaw: 0,
			support: { id: 7, model: platform.model.name }
		} ] } ] } );
		shells.R_ShellsNewMap( world.name ); shells.R_ShellsFrame( 0 ); shells.R_ShellsFrame( 0.1 );
		check( shells.R_ShellsStatus().count === 1, 'damaged support does not delete casing' );
		check( ! onlyShell().support && ! onlyShell().rest, 'damaged support resumes ordinary gravity' );
		check( onlyShell().p.every( Number.isFinite ), 'damaged support leaves finite physical coordinates' );

	} );

} );
