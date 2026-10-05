import * as THREE from 'three';
await import( '../src/gl_rsurf.js' ); // established renderer import order
const pak = await import( '../src/pak.js' ), model = await import( '../src/gl_model.js' );
const mesh = await import( '../src/gl_mesh.js' ), weapons = await import( '../src/r_weapons.js' );
const anim = await import( '../src/r_anim.js' ), vars = await import( '../src/cvar.js' );
const normals = await import( '../src/anorm_dots.js' );
const hdr = ( await import( '../src/gl_post.js' ) ).r_hdr;
vars.Cvar_RegisterVariable( hdr ); vars.Cvar_RegisterVariable( weapons.r_newer_weapons ); vars.Cvar_SetValue( 'r_hdr', 1 ); anim.R_AnimSetNewer( true );
pak.COM_AddPack( await pak.COM_FetchPak( '../pak0.pak', 'pak0.pak' ) );
const vid = await import( '../src/vid.js' ); vid.VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); model.Mod_Init();
// Gallery lives under tests/, unlike the root-based game. Resolve art through
// the ordinary pack reader so public production loaders use unchanged paths.
const oldFetch = window.fetch;
window.fetch = ( path, ...args ) => oldFetch( typeof path === 'string' && path.startsWith( 'newer/' ) ? '../' + path : path, ...args );
const oldLoad = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = function ( path, ...args ) { return oldLoad.call( this, path.startsWith( 'newer/' ) ? '../' + path : path, ...args ); };
const index = await weapons.R_WeaponsLoad(), keys = Object.keys( index.models );
await Promise.all( keys.map( weapons.R_WeaponLoad ) );
const renderer = new THREE.WebGLRenderer( { antialias: true, preserveDrawingBuffer: true } ); const rows = Math.ceil( keys.length / 4 ); renderer.setSize( 1200, rows * 300 ); document.body.append( renderer.domElement );
renderer.setScissorTest( true );
const views = [], evidence = [];
for ( const [ i, key ] of keys.entries() ) {

	const original = model.Mod_ForName( 'progs/' + key + '.mdl', true ), header = original.cache.data;
	const entity = { model: original, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ], frame: 0, skinnum: 0, syncbase: 0 };
	const geometry = mesh.GL_DrawAliasFrame( header, 0 );
	const fit = index.models[ key ];
	const box = new THREE.Box3( new THREE.Vector3().fromArray( fit.nativeMin ), new THREE.Vector3().fromArray( fit.nativeMax ) );
	const center = box.getCenter( new THREE.Vector3() ), size = box.getSize( new THREE.Vector3() );
	const scene = new THREE.Scene(); scene.background = new THREE.Color( 0x252a30 );
	const camera = new THREE.OrthographicCamera( - 32, 32, 24, - 24, .1, 1000 ); camera.up.set( 0, 0, 1 );
	camera.position.copy( center ).add( new THREE.Vector3( size.x * .2, - 150, size.z * .25 ) ); if ( fit.fitKind === 'source-quake-coordinates' && key === 'g_nail' ) camera.position.copy( center ).add( new THREE.Vector3( 100, - 110, 40 ) );
	camera.lookAt( center );
	scene.add( new THREE.Box3Helper( box, 0x00ffff ) );
	const drawn = mesh.R_DrawAliasModel( entity, header, normals.r_avertexnormal_dots[ 0 ], .8 ); scene.add( drawn );
	drawn.geometry.computeBoundingBox();
	evidence.push( { key, original: { min: box.min.toArray(), max: box.max.toArray() }, fitted: { min: drawn.geometry.boundingBox.min.toArray(), max: drawn.geometry.boundingBox.max.toArray() }, vertices: drawn.geometry.getAttribute( 'position' ).count } );
	const label = document.createElement( 'span' ); label.textContent = key; label.style = `position:absolute;left:${i % 4 * 300 + 8}px;top:${Math.floor( i / 4 ) * 300 + 65}px`; document.body.append( label );
	views.push( { entity, header, scene, camera, drawn, i } );

}
function render() {

	for ( const { entity, header, scene, camera, i } of views ) {

		mesh.R_DrawAliasModel( entity, header, normals.r_avertexnormal_dots[ 0 ], .8 );
		renderer.setViewport( i % 4 * 300, ( rows - 1 - Math.floor( i / 4 ) ) * 300, 300, 300 ); renderer.setScissor( i % 4 * 300, ( rows - 1 - Math.floor( i / 4 ) ) * 300, 300, 300 ); renderer.render( scene, camera );

	}

}
document.querySelector( '#native' ).onclick = () => { vars.Cvar_SetValue( 'r_newer_weapons', 1 - vars.Cvar_VariableValue( 'r_newer_weapons' ) ); render(); };
window.weaponModelsEvidence = evidence; window.weaponModelsStatus = weapons.R_WeaponStatus(); render();
document.querySelector( '#status' ).textContent = ` — ${window.weaponModelsStatus.ready.length} replacements loaded; native fallbacks: ${Object.keys( window.weaponModelsStatus.failures ).join( ', ' ) || 'none'}`;
