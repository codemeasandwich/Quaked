// Bounded radial-distance shadows for static world/map lights and the moving
// flashlight. Geometry is borrowed from the existing solid-world occluder and
// live actor/brush meshes; no BSP, vertex copy or source reparenting.
import * as THREE from 'three';

export const POINT_SHADOW_SLOTS = 8;
export const POINT_SHADOW_SIZE = 128;
export const POINT_SHADOW_CELL_UNITS = 256;
export const POINT_SHADOW_FAR_LIMIT = 4096;
export const POINT_SHADOW_BIAS = 2;
export const SPOT_SHADOW_SIZE = 512;
export const SPOT_SHADOW_BIAS = 1;
const WIDTH = POINT_SHADOW_SIZE * 6, HEIGHT = POINT_SHADOW_SIZE * POINT_SHADOW_SLOTS;
const DIRECTIONS = [ [ 1, 0, 0 ], [ -1, 0, 0 ], [ 0, 1, 0 ], [ 0, -1, 0 ], [ 0, 0, 1 ], [ 0, 0, -1 ] ];
const UPS = [ [ 0, 0, 1 ], [ 0, 0, 1 ], [ 0, 0, 1 ], [ 0, 0, 1 ], [ 0, 1, 0 ], [ 0, 1, 0 ] ];
const ABSENT = Object.freeze( { slot: -1, far: 0, ready: false } );

function coordinates( value ) {

	const point = value?.isVector3 ? [ value.x, value.y, value.z ] : value;
	return point && point.length >= 3 && [ point[ 0 ], point[ 1 ], point[ 2 ] ].every( Number.isFinite )
		? [ point[ 0 ], point[ 1 ], point[ 2 ] ] : null;

}

// Matches the six explicit capture cameras. UVs increase right/up inside each
// atlas face; dominant-axis ties choose X, then Y, consistently in JS and GLSL.
export function PointShadowFaceUV( delta ) {

	const point = coordinates( delta );
	if ( ! point ) throw new TypeError( 'Point shadow direction must contain three finite coordinates' );
	const [ x, y, z ] = point, ax = Math.abs( x ), ay = Math.abs( y ), az = Math.abs( z );
	let face, u, v, scale;
	if ( ax >= ay && ax >= az ) {

		face = x >= 0 ? 0 : 1; u = x >= 0 ? - y : y; v = z; scale = ax;

	} else if ( ay >= az ) {

		face = y >= 0 ? 2 : 3; u = y >= 0 ? x : - x; v = z; scale = ay;

	} else {

		face = z >= 0 ? 4 : 5; u = z >= 0 ? - x : x; v = y; scale = az;

	}
	return { face, uv: scale > 0 ? [ .5 + .5 * u / scale, .5 + .5 * v / scale ] : [ .5, .5 ] };

}

const VERTEX = `
varying vec3 pointShadowWorld;
void main() {
 vec4 local=vec4(position,1.);
 #ifdef USE_INSTANCING
 local=instanceMatrix*local;
 #endif
 vec4 world=modelMatrix*local;
 pointShadowWorld=world.xyz;
 gl_Position=projectionMatrix*viewMatrix*world;
}
`;
const FRAGMENT = `
#include <packing>
uniform vec3 pointShadowLight;
uniform float pointShadowFar;
varying vec3 pointShadowWorld;
void main() {
 gl_FragColor=packDepthToRGBA(clamp(length(pointShadowWorld-pointShadowLight)/pointShadowFar,0.,1.));
}
`;

export class PointShadowAtlas {

	constructor( geometry = null ) {

		this.geometry = null; this.chunks = []; this.triangles = 0;
		this.scene = new THREE.Scene();
		this.material = new THREE.ShaderMaterial( {
			vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.DoubleSide,
			blending: THREE.NoBlending, depthTest: true, depthWrite: true, toneMapped: false,
			uniforms: { pointShadowLight: { value: new THREE.Vector3() }, pointShadowFar: { value: 1 } }
		} );
		// The engine patches ordinary materials for MRT output; this private
		// one-attachment data capture must retain only its packed-distance output.
		this.material.onBeforeCompile = () => {};
		this.material.customProgramCacheKey = () => 'quake-static-point-shadow-radial-v1';
		this.target = new THREE.WebGLRenderTarget( WIDTH, HEIGHT, {
			format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
			minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
			generateMipmaps: false, depthBuffer: true, stencilBuffer: false
		} );
		this.target.texture.name = 'quake_static_point_shadow_atlas';
		this.target.texture.colorSpace = THREE.NoColorSpace;
		this.target.texture.internalFormat = 'RGBA8';
		this.spotTarget = new THREE.WebGLRenderTarget( SPOT_SHADOW_SIZE, SPOT_SHADOW_SIZE, {
			format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
			minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
			generateMipmaps: false, depthBuffer: true, stencilBuffer: false
		} );
		this.spotTarget.texture.name = 'quake_moving_flashlight_world_shadow';
		this.spotTarget.texture.colorSpace = THREE.NoColorSpace;
		this.spotTarget.texture.internalFormat = 'RGBA8';
		this.spotCamera = new THREE.PerspectiveCamera( 48, 1, 1, 1500 );
		this._spotVP = new THREE.Matrix4(); this.spotReady = false;
		this.spotCaptures = 0; this.spotRenders = 0; this.spotFailedCaptures = 0;
		this.spotError = null; this.spotDynamicMeshes = 0;
		this._dynamicClones = new WeakMap(); this._borrowedClones = new Set();
		this.cameras = DIRECTIONS.map( ( _, face ) => {

			const camera = new THREE.PerspectiveCamera( 90, 1, .1, 1 );
			camera.up.fromArray( UPS[ face ] ); return camera;

		} );
		this.entries = new Map(); this.slots = new Array( POINT_SHADOW_SLOTS ).fill( null );
		this.epoch = 0; this.access = 0; this.captures = 0; this.faceRenders = 0;
		this.failedCaptures = 0; this.requested = 0; this.error = null; this.disposed = false;
		this._look = new THREE.Vector3();
		if ( geometry ) this.setGeometry( geometry );

	}

	get texture() { return this.target.texture; }
	get spotTexture() { return this.spotTarget.texture; }
	get spotVP() { return this._spotVP; }

	_clearDynamicClones() {

		for ( const clone of this._borrowedClones ) {

			this.scene.remove( clone );
			if ( clone.isInstancedMesh ) {

				// Release the clone's VAOs, never the source's borrowed instance GPU
				// attribute. Three's instanced dispose handler otherwise removes it.
				clone.instanceMatrix = new THREE.InstancedBufferAttribute( new Float32Array( 0 ), 16 );
				clone.instanceColor = null; clone.dispatchEvent( { type: 'dispose' } );

			}

		}
		this._borrowedClones.clear(); this._dynamicClones = new WeakMap();

	}

	_clearChunks() {

		for ( const mesh of this.chunks ) {

			this.scene.remove( mesh );
			// Three's disposal deletes geometry attribute GPU buffers. This position
			// attribute belongs to the original occluder and every other chunk.
			mesh.geometry.deleteAttribute( 'position' ); mesh.geometry.dispose();

		}
		this.chunks.length = 0; this.triangles = 0;

	}

	setGeometry( geometry ) {

		if ( this.disposed ) throw new Error( 'Point shadow atlas was disposed' );
		if ( geometry === this.geometry ) return this;
		const position = geometry?.getAttribute( 'position' ), index = geometry?.getIndex();
		const count = index ? index.count : position?.count || 0;
		if ( geometry && ( ! position || position.itemSize !== 3 || count % 3 !== 0 ) )
			throw new TypeError( 'Point shadows require a triangle BufferGeometry with position vec3' );
		this._clearChunks(); this.geometry = geometry; this.invalidate();
		if ( ! position || ! count ) return this;
		const groups = new Map();
		const vertex = corner => index ? index.getX( corner ) : corner;
		const scale = 3 * POINT_SHADOW_CELL_UNITS;
		const cell = ( a, b, c ) => Math.floor( ( position.getX( a ) + position.getX( b ) + position.getX( c ) ) / scale ) + ',' +
			Math.floor( ( position.getY( a ) + position.getY( b ) + position.getY( c ) ) / scale ) + ',' +
			Math.floor( ( position.getZ( a ) + position.getZ( b ) + position.getZ( c ) ) / scale );
		// Two bounded passes allocate exactly one Uint32 index per source corner.
		// Bounds include full triangle vertices, not just their centroid cell.
		for ( let corner = 0; corner < count; corner += 3 ) {

			const a = vertex( corner ), b = vertex( corner + 1 ), c = vertex( corner + 2 ), key = cell( a, b, c );
			let group = groups.get( key );
			if ( ! group ) groups.set( key, group = { count: 0, used: 0, box: new THREE.Box3() } );
			group.count += 3;
			for ( const id of [ a, b, c ] ) group.box.expandByPoint( this._look.set( position.getX( id ), position.getY( id ), position.getZ( id ) ) );

		}
		for ( const group of groups.values() ) group.indices = new Uint32Array( group.count );
		for ( let corner = 0; corner < count; corner += 3 ) {

			const a = vertex( corner ), b = vertex( corner + 1 ), c = vertex( corner + 2 ), group = groups.get( cell( a, b, c ) );
			group.indices.set( [ a, b, c ], group.used ); group.used += 3;

		}
		for ( const group of groups.values() ) {

			const chunk = new THREE.BufferGeometry(); chunk.setAttribute( 'position', position );
			chunk.setIndex( new THREE.BufferAttribute( group.indices, 1 ) );
			chunk.boundingBox = group.box; chunk.boundingSphere = group.box.getBoundingSphere( new THREE.Sphere() );
			const mesh = new THREE.Mesh( chunk, this.material ); mesh.name = 'quake_point_shadow_chunk';
			mesh.matrixAutoUpdate = false; mesh.frustumCulled = true;
			this.chunks.push( mesh ); this.scene.add( mesh );

		}
		this.triangles = count / 3; return this;

	}

	invalidate() {

		this.epoch ++; this.entries.clear(); this.slots.fill( null ); this.requested = 0; this.error = null;
		this.clearSpot(); this._clearDynamicClones();
		return this;

	}

	lookup( source ) {

		const entry = this.entries.get( source );
		return entry ? { slot: entry.slot, far: entry.far, ready: entry.ready } : ABSENT;

	}

	status() {

		const ready = [ ...this.entries.values() ].filter( entry => entry.ready ).length;
		return { maxSlots: POINT_SHADOW_SLOTS, resident: this.entries.size, ready, pending: this.entries.size - ready,
			requested: this.requested, chunks: this.chunks.length, triangles: this.triangles,
			captures: this.captures, faceRenders: this.faceRenders, failedCaptures: this.failedCaptures,
			spotReady: this.spotReady, spotCaptures: this.spotCaptures, spotRenders: this.spotRenders,
			spotFailedCaptures: this.spotFailedCaptures, spotError: this.spotError, spotDynamicMeshes: this.spotDynamicMeshes,
			epoch: this.epoch, error: this.error, disposed: this.disposed };

	}

	clearSpot() {

		this.spotReady = false; this.spotError = null; this.spotDynamicMeshes = 0;
		return this;

	}

	// Flashlight position/direction change every frame; never cache its depth by
	// source identity. Only opaque live actor/brush meshes are borrowed for this
	// one capture, then removed before any static point-light cube can render.
	updateSpot( renderer, beam, dynamicMeshes = [] ) {

		this.clearSpot(); if ( this.disposed ) return this.status();
		const position = coordinates( beam?.pos ?? beam?.position ), direction = coordinates( beam?.dir ?? beam?.direction );
		const length = direction && Math.hypot( ...direction ), inputRange = beam?.range ?? 1500, outerCos = beam?.outerCos ?? .92;
		if ( ! beam?.on || ! renderer || ! position || ! length || length < 1e-8 ||
			! Number.isFinite( inputRange ) || inputRange <= 1 || ! Number.isFinite( outerCos ) || outerCos <= 0 || outerCos >= 1 ) return this.status();
		const far = Math.min( POINT_SHADOW_FAR_LIMIT, inputRange ), clones = [], seen = new Set();
		try {

			for ( const source of dynamicMeshes ) {

				if ( ! source?.isMesh || source.isSkinnedMesh || source.isBatchedMesh || ! source.geometry?.getAttribute( 'position' ) ||
					! source.visible || seen.has( source ) || this.chunks.includes( source ) ) continue;
				const materials = Array.isArray( source.material ) ? source.material : [ source.material ];
				if ( materials.some( material => ! material || material.transparent || material.depthWrite === false || material.visible === false ) ) continue;
				let hidden = false;
				for ( let parent = source.parent; parent; parent = parent.parent ) if ( ! parent.visible ) { hidden = true; break; }
				if ( hidden ) continue;
				seen.add( source ); let clone = this._dynamicClones.get( source );
				if ( ! clone ) {

					clone = new THREE.Mesh( source.geometry, this.material ); clone.name = 'quake_flashlight_borrowed_caster';
					clone.matrixAutoUpdate = false; clone.frustumCulled = false;
					this._dynamicClones.set( source, clone ); this._borrowedClones.add( clone );

				}
				clone.geometry = source.geometry; clone.matrix.copy( source.matrixWorld ); clone.matrixWorld.copy( source.matrixWorld );
				if ( source.isInstancedMesh ) {

					clone.isInstancedMesh = true; clone.count = source.count; clone.instanceMatrix = source.instanceMatrix;
					clone.instanceColor = null; clone.morphTexture = null;

				}
				clones.push( clone ); this.scene.add( clone );

			}
			this.spotDynamicMeshes = clones.length;
			if ( ! this.chunks.length && ! clones.length ) return this.status();
			const camera = this.spotCamera;
			camera.position.fromArray( position ); camera.up.set( 0, 0, 1 );
			if ( Math.abs( direction[ 2 ] / length ) > .99 ) camera.up.set( 0, 1, 0 );
			camera.fov = Math.min( 179, THREE.MathUtils.radToDeg( 2 * Math.acos( outerCos ) ) + 2 );
			camera.near = 1; camera.far = far; camera.updateProjectionMatrix();
			this._look.fromArray( position ).add( new THREE.Vector3().fromArray( direction ).multiplyScalar( 1 / length ) );
			camera.lookAt( this._look ); camera.updateMatrixWorld( true );
			this._captureSpot( renderer, position, far );
			this._spotVP.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
			this.spotReady = true; this.spotCaptures ++;

		} catch ( error ) { this.spotFailedCaptures ++; this.spotError = String( error?.message || error ); }
		finally { for ( const clone of clones ) this.scene.remove( clone ); }
		return this.status();

	}

	_captureSpot( renderer, position, far ) {

		const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace?.() || 0, mip = renderer.getActiveMipmapLevel?.() || 0;
		const viewport = renderer.getViewport( new THREE.Vector4() ), scissor = renderer.getScissor( new THREE.Vector4() );
		const scissorTest = renderer.getScissorTest(), clearColor = renderer.getClearColor( new THREE.Color() ), clearAlpha = renderer.getClearAlpha();
		const autoClear = renderer.autoClear, xrEnabled = renderer.xr?.enabled, capture = this.spotTarget;
		const captureViewport = capture.viewport.clone(), captureScissor = capture.scissor.clone(), captureScissorTest = capture.scissorTest;
		try {

			if ( renderer.xr ) renderer.xr.enabled = false;
			renderer.autoClear = false; renderer.setClearColor( 0xffffff, 1 );
			this.material.uniforms.pointShadowLight.value.fromArray( position ); this.material.uniforms.pointShadowFar.value = far;
			capture.viewport.set( 0, 0, SPOT_SHADOW_SIZE, SPOT_SHADOW_SIZE ); capture.scissor.copy( capture.viewport ); capture.scissorTest = true;
			renderer.setRenderTarget( capture ); renderer.clear( true, true, false ); renderer.render( this.scene, this.spotCamera ); this.spotRenders ++;

		} finally {

			try {

				capture.viewport.copy( captureViewport ); capture.scissor.copy( captureScissor ); capture.scissorTest = captureScissorTest;
				renderer.setViewport( viewport ); renderer.setScissor( scissor ); renderer.setScissorTest( scissorTest );
				renderer.setClearColor( clearColor, clearAlpha ); renderer.setRenderTarget( target, face, mip );

			} finally { renderer.autoClear = autoClear; if ( renderer.xr ) renderer.xr.enabled = xrEnabled; }

		}

	}

	update( renderer, sources = [] ) {

		if ( this.disposed ) return this.status();
		const normalize = item => {

			const position = coordinates( item?.position ), far = item?.far;
			return item?.source != null && position && Number.isFinite( far ) && far > 0
				? { source: item.source, position, far: Math.min( POINT_SHADOW_FAR_LIMIT, far ) } : null;

		};
		const selected = [], protectedSources = new Set();
		// Preserve every requested resident before choosing new sources, even when
		// an oversized caller list places newcomers ahead of its existing slots.
		for ( const item of sources ) {

			const value = normalize( item );
			if ( ! value && item?.source != null ) {

				// An explicitly invalid current pose/range must not expose that
				// source's previously captured cube as if it were still current.
				const old = this.entries.get( item.source );
				if ( old ) { this.entries.delete( item.source ); this.slots[ old.slot ] = null; }

			}
			if ( value && this.entries.has( value.source ) && ! protectedSources.has( value.source ) ) {

				selected.push( value ); protectedSources.add( value.source );

			}

		}
		for ( const item of sources ) {

			if ( selected.length >= POINT_SHADOW_SLOTS ) break;
			const value = normalize( item );
			if ( value && ! protectedSources.has( value.source ) ) { selected.push( value ); protectedSources.add( value.source ); }

		}
		this.requested = selected.length;
		for ( const value of selected ) {

			let entry = this.entries.get( value.source );
			if ( ! entry ) {

				let slot = this.slots.findIndex( entry => entry === null );
				if ( slot < 0 ) {

					let oldest;
					for ( const resident of this.entries.values() ) if ( ! protectedSources.has( resident.source ) && ( ! oldest || resident.used < oldest.used ) ) oldest = resident;
					if ( ! oldest ) continue;
					slot = oldest.slot; this.entries.delete( oldest.source );

				}
				entry = { ...value, slot, ready: false, used: 0 }; this.entries.set( value.source, entry ); this.slots[ slot ] = entry;

			} else if ( entry.far !== value.far || value.position.some( ( coordinate, i ) => coordinate !== entry.position[ i ] ) ) {

				entry.position = value.position; entry.far = value.far; entry.ready = false;

			}
			entry.used = ++ this.access;

		}
		const pending = selected.map( value => this.entries.get( value.source ) ).find( entry => entry && ! entry.ready );
		if ( pending && renderer && this.chunks.length ) {

			try { this._capture( renderer, pending ); pending.ready = true; this.captures ++; this.error = null; }
			catch ( error ) { this.failedCaptures ++; this.error = String( error?.message || error ); }

		}
		return this.status();

	}

	_capture( renderer, entry ) {

		const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace?.() || 0, mip = renderer.getActiveMipmapLevel?.() || 0;
		const viewport = renderer.getViewport( new THREE.Vector4() ), scissor = renderer.getScissor( new THREE.Vector4() );
		const scissorTest = renderer.getScissorTest(), clearColor = renderer.getClearColor( new THREE.Color() ), clearAlpha = renderer.getClearAlpha();
		const autoClear = renderer.autoClear, xrEnabled = renderer.xr?.enabled;
		const atlasViewport = this.target.viewport.clone(), atlasScissor = this.target.scissor.clone(), atlasScissorTest = this.target.scissorTest;
		try {

			if ( renderer.xr ) renderer.xr.enabled = false;
			renderer.autoClear = false; renderer.setClearColor( 0xffffff, 1 ); this.target.scissorTest = true;
			this.material.uniforms.pointShadowLight.value.fromArray( entry.position ); this.material.uniforms.pointShadowFar.value = entry.far;
			for ( let side = 0; side < 6; side ++ ) {

				const camera = this.cameras[ side ]; camera.position.fromArray( entry.position );
				camera.near = Math.min( 1, entry.far * .01 ); camera.far = entry.far; camera.updateProjectionMatrix();
				this._look.set( entry.position[ 0 ] + DIRECTIONS[ side ][ 0 ], entry.position[ 1 ] + DIRECTIONS[ side ][ 1 ], entry.position[ 2 ] + DIRECTIONS[ side ][ 2 ] ); camera.lookAt( this._look ); camera.updateMatrixWorld( true );
				// Renderer setters are logical-screen coordinates and apply DPR even
				// with a target bound. Target properties are physical texel coordinates;
				// rebinding applies each face rectangle without scaling it by DPR.
				this.target.viewport.set( side * POINT_SHADOW_SIZE, entry.slot * POINT_SHADOW_SIZE, POINT_SHADOW_SIZE, POINT_SHADOW_SIZE );
				this.target.scissor.copy( this.target.viewport ); renderer.setRenderTarget( this.target );
				renderer.clear( true, true, false ); renderer.render( this.scene, camera ); this.faceRenders ++;

			}

		} finally {

			try {

				this.target.viewport.copy( atlasViewport ); this.target.scissor.copy( atlasScissor ); this.target.scissorTest = atlasScissorTest;
				// Restore logical defaults first, then bind the prior target last so
				// its own unscaled viewport/scissor (and cube face/mip) win on the GPU.
				renderer.setViewport( viewport ); renderer.setScissor( scissor ); renderer.setScissorTest( scissorTest );
				renderer.setClearColor( clearColor, clearAlpha ); renderer.setRenderTarget( target, face, mip );

			} finally { renderer.autoClear = autoClear; if ( renderer.xr ) renderer.xr.enabled = xrEnabled; }

		}

	}

	dispose() {

		if ( this.disposed ) return;
		this.invalidate(); this._clearChunks(); this.geometry = null;
		this.target.dispose(); this.spotTarget.dispose(); this.material.dispose(); this.disposed = true;

	}

}

// Insert after Three's <packing> chunk. Keep radial depth in world units and
// clamp each PCF tap to a half texel inside its face to prevent atlas bleeding.
export const POINT_SHADOW_GLSL = `
uniform sampler2D tPointShadow;
uniform vec2 uPointShadowInfo[${POINT_SHADOW_SLOTS}];
void pointShadowFaceUV(vec3 d,out int face,out vec2 uv) {
 vec3 a=abs(d);vec2 p;float divisor;
 if(a.x>=a.y&&a.x>=a.z){face=d.x>=0.?0:1;p=vec2(d.x>=0.?-d.y:d.y,d.z);divisor=a.x;}
 else if(a.y>=a.z){face=d.y>=0.?2:3;p=vec2(d.y>=0.?d.x:-d.x,d.z);divisor=a.y;}
 else{face=d.z>=0.?4:5;p=vec2(d.z>=0.?-d.x:d.x,d.y);divisor=a.z;}
 uv=divisor>0.?p/divisor*.5+.5:vec2(.5);
}
float pointShadowTap(vec2 faceUv,vec2 offset,int face,float slot,float distanceWorld,float farWorld) {
 const float side=${POINT_SHADOW_SIZE}.0;
 vec2 local=clamp(faceUv+offset/side,vec2(.5/side),vec2(1.-.5/side));
 vec2 uv=(vec2(float(face)*side,slot*side)+local*side)/vec2(${WIDTH}.0,${HEIGHT}.0);
 float blocker=unpackRGBAToDepth(texture2D(tPointShadow,uv))*farWorld;
 return distanceWorld-${POINT_SHADOW_BIAS}.0<=blocker?1.:0.;
}
float pointWorldVisibility(vec3 receiverWorld,vec3 lightWorld,int index) {
 if(index<0||index>=${POINT_SHADOW_SLOTS})return 1.;
 vec2 info=uPointShadowInfo[index];
 if(info.x<0.||info.x>=${POINT_SHADOW_SLOTS}.||info.y<=0.)return 1.;
 vec3 delta=receiverWorld-lightWorld;float distanceWorld=length(delta);
 if(distanceWorld<=${POINT_SHADOW_BIAS}.0||distanceWorld>=info.y)return 1.;
 int face;vec2 uv;pointShadowFaceUV(delta,face,uv);
 float value=pointShadowTap(uv,vec2(0.),face,info.x,distanceWorld,info.y);
 value+=pointShadowTap(uv,vec2(1.,0.),face,info.x,distanceWorld,info.y);
 value+=pointShadowTap(uv,vec2(-1.,0.),face,info.x,distanceWorld,info.y);
 value+=pointShadowTap(uv,vec2(0.,1.),face,info.x,distanceWorld,info.y);
 value+=pointShadowTap(uv,vec2(0.,-1.),face,info.x,distanceWorld,info.y);
 return value*.2;
}
`;

// Insert after Three's <packing>. The offset moving beam captures the same
// world + live actor/brush geometry; virtual local height uses its separate mask.
export const SPOT_WORLD_SHADOW_GLSL = `
uniform sampler2D tSpotShadow;
uniform mat4 uSpotShadowVP;
uniform vec4 uSpotShadowLightWorld;
uniform float uSpotWorldShadowOn;
float spotShadowTap(vec2 uv,vec2 offset,float distanceWorld){
 const float side=${SPOT_SHADOW_SIZE}.0;
 vec2 sampleUv=clamp(uv+offset/side,vec2(.5/side),vec2(1.-.5/side));
 float blocker=unpackRGBAToDepth(texture2D(tSpotShadow,sampleUv))*uSpotShadowLightWorld.w;
 return distanceWorld-${SPOT_SHADOW_BIAS}.0<=blocker?1.:0.;
}
float spotWorldVisibility(vec3 receiverWorld){
 if(uSpotWorldShadowOn<.5||uSpotShadowLightWorld.w<=1.)return 1.;
 vec4 clip=uSpotShadowVP*vec4(receiverWorld,1.);
 if(clip.w<=0.)return 1.;vec3 projected=clip.xyz/clip.w;
 if(any(greaterThan(abs(projected),vec3(1.))))return 1.;
 float distanceWorld=length(receiverWorld-uSpotShadowLightWorld.xyz);
 if(distanceWorld<=${SPOT_SHADOW_BIAS}.0||distanceWorld>=uSpotShadowLightWorld.w)return 1.;
 vec2 uv=projected.xy*.5+.5;float value=spotShadowTap(uv,vec2(0.),distanceWorld);
 value+=spotShadowTap(uv,vec2(1.,0.),distanceWorld);value+=spotShadowTap(uv,vec2(-1.,0.),distanceWorld);
 value+=spotShadowTap(uv,vec2(0.,1.),distanceWorld);value+=spotShadowTap(uv,vec2(0.,-1.),distanceWorld);
 return value*.2;
}
`;
