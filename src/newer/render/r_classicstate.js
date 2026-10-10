/**
 * @module newer/render/r_classicstate
 *
 * Keeping the enhanced frame's state when the same tick is drawn again in Classic (the split title demo).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 2 module-level collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// A second rendering of the same simulation tick must not change the next
// enhanced frame. Keep cached geometry, entity poses and scene membership intact.
// Reuse backups for alias colours and optional native shadow positions.
const attributeBackups = new WeakMap();

/**
 * Snapshots the enhanced frame's scene state before the same simulation tick is drawn again in Classic (the split
 * title demo; gl_rmain.js `R_ClassicOn`). A second rendering of the tick must not change the next enhanced frame,
 * so cached geometry, entity poses and scene membership are kept intact. Records every object's parent,
 * visibility, material, transform, layers, render order, render callbacks and light values; each `_quakeOwner`
 * entity's origin/angles and alias pose fields; and the alias `color` and native shadow `position` attributes.
 * The enhanced draw has already smoothed origin/angles in place, so an entity whose `_smoothMove.lastTime` equals
 * `time` is put back on this tick's raw game coordinates for the native draw (time is not advanced).
 *
 * @param {THREE.Scene} scene the renderer's scene, traversed now and again on restore
 * @param {number} time client time of this tick (`cl.time`, seconds)
 * @returns {function(): void} restore: removes objects added since the snapshot, re-parents moved ones, puts every
 *   recorded value and attribute array back and updates world matrices. Call it once, after the Classic pass.
 *   Attribute backup arrays are kept per geometry in a WeakMap and reused across frames.
 */
export function R_SaveClassicScene( scene, time ) {

	const objects = new Map(), entities = new Map(), geometries = new Map();
	const saveGeometry = ( g, names ) => {

		if ( ! g || geometries.has( g ) ) return;
		let backups = attributeBackups.get( g );
		if ( ! backups ) { backups = new Map(); attributeBackups.set( g, backups ); }
		const written = new Map();
		for ( const name of names ) {

			const attribute = g.getAttribute( name );
			if ( ! attribute ) continue;
			let backup = backups.get( name );
			if ( ! backup || backup.length !== attribute.array.length ) {

				backup = new attribute.array.constructor( attribute.array.length );
				backups.set( name, backup );

			}
			backup.set( attribute.array ); written.set( name, backup );

		}
		geometries.set( g, { attributes: { ...g.attributes }, index: g.index,
			boundingBox: g.boundingBox && g.boundingBox.clone(), boundingSphere: g.boundingSphere && g.boundingSphere.clone(), written } );

	};
	scene.traverse( o => {

		objects.set( o, {
			parent: o.parent, visible: o.visible, material: o.material,
			position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone(),
			layers: o.layers.mask, renderOrder: o.renderOrder,
			onBeforeRender: o.onBeforeRender, onAfterRender: o.onAfterRender,
			intensity: o.intensity, distance: o.distance, decay: o.decay
		} );
		const e = o._quakeOwner;
		if ( ! e || entities.has( e ) ) return;
		entities.set( e, {
			origin: e.origin && Array.from( e.origin ), angles: e.angles && Array.from( e.angles ),
			_aliasPosenum: e._aliasPosenum, _aliasBlended: e._aliasBlended, _aliasPaliashdr: e._aliasPaliashdr,
			_aliasTemplate: e._aliasTemplate, _aliasColorArray: e._aliasColorArray, _aliasPartDrawn: e._aliasPartDrawn
		} );
		saveGeometry( e._aliasGeo, [ 'color' ] );
		saveGeometry( e._aliasShadowGeo, [ 'position' ] );
		// The enhanced draw has already smoothed these arrays in place. The
		// native draw uses this tick's game coordinates without advancing time.
		const move = e._smoothMove;
		if ( move && move.lastTime === time ) {

			for ( let i = 0; i < 3; i ++ ) { e.origin[ i ] = move.rawO[ i ]; e.angles[ i ] = move.rawA[ i ]; }

		}

	} );
	return () => {

		const added = [];
		scene.traverse( o => { if ( ! objects.has( o ) ) added.push( o ); } );
		for ( const o of added ) if ( o.parent ) o.parent.remove( o );
		for ( const [ o, s ] of objects ) {

			if ( o.parent !== s.parent ) {

				if ( o.parent ) o.parent.remove( o );
				if ( s.parent ) s.parent.add( o );

			}
			o.visible = s.visible; o.material = s.material;
			o.position.copy( s.position ); o.quaternion.copy( s.quaternion ); o.scale.copy( s.scale );
			o.layers.mask = s.layers; o.renderOrder = s.renderOrder;
			o.onBeforeRender = s.onBeforeRender; o.onAfterRender = s.onAfterRender;
			if ( o.isLight ) { o.intensity = s.intensity; o.distance = s.distance; o.decay = s.decay; }

		}
		for ( const [ g, s ] of geometries ) {

			g.attributes = s.attributes; g.index = s.index;
			g.boundingBox = s.boundingBox; g.boundingSphere = s.boundingSphere;
			for ( const [ name, backup ] of s.written ) { g.attributes[ name ].array.set( backup ); g.attributes[ name ].needsUpdate = true; }

		}
		for ( const [ e, s ] of entities ) {

			for ( let i = 0; i < 3; i ++ ) {

				if ( s.origin ) e.origin[ i ] = s.origin[ i ];
				if ( s.angles ) e.angles[ i ] = s.angles[ i ];

			}
			e._aliasPosenum = s._aliasPosenum; e._aliasBlended = s._aliasBlended; e._aliasPaliashdr = s._aliasPaliashdr;
			e._aliasTemplate = s._aliasTemplate; e._aliasColorArray = s._aliasColorArray; e._aliasPartDrawn = s._aliasPartDrawn;

		}
		scene.updateMatrixWorld( true );

	};

}

// Native variants never participate in the enhanced glow/detail registries.
// Reuse one per source material and update only mutable values; no per-frame
// material clones or shader invalidation on the enhanced materials.
const materials = new WeakMap();

/**
 * Classic (native look) variant of an enhanced material, for the Classic pass of the split title demo. Native
 * variants never take part in the enhanced glow/detail registries. One variant is made per source material and
 * cached in a WeakMap (disposed with the source); each call refreshes only its mutable values, so there are no
 * per-frame material clones or shader invalidation on the enhanced materials. The variant drops normal, bump,
 * displacement, roughness, metalness and environment maps, uses `userData.classicGlowColor` as colour when set,
 * and forces `emissiveIntensity` to 1.
 *
 * @param {THREE.Material} source the enhanced material currently on the object
 * @param {function(?THREE.Texture): ?THREE.Texture} textureFor maps the source's `map`/`emissiveMap` to its
 *   classic texture
 * @param {function(?THREE.Texture): ?THREE.Texture} [lightmapFor] maps the source's `lightMap` (default: unchanged)
 * @returns {THREE.Material} the cached classic material, marked `needsUpdate` only when it gains or loses a map
 */
export function R_ClassicMaterial( source, textureFor, lightmapFor = t => t ) {

	let m = materials.get( source );
	if ( ! m ) {

		m = new source.constructor().copy( { ...source, userData: {} } );
		m.onBeforeCompile = source.onBeforeCompile;
		m.customProgramCacheKey = source.customProgramCacheKey;
		m.normalMap = m.bumpMap = m.displacementMap = null;
		m.roughnessMap = m.metalnessMap = m.envMap = null;
		materials.set( source, m );
		source.addEventListener( 'dispose', () => m.dispose() );

	}
	const previousMap = m.map;
	m.map = textureFor( source.map );
	m.emissiveMap = textureFor( source.emissiveMap );
	m.lightMap = lightmapFor( source.lightMap );
	if ( ( previousMap != null ) !== ( m.map != null ) ) m.needsUpdate = true;
	if ( m.color ) {

		if ( source.userData.classicGlowColor ) m.color.fromArray( source.userData.classicGlowColor );
		else m.color.copy( source.color );

	}
	if ( m.emissive ) m.emissive.copy( source.emissive );
	if ( m.emissiveIntensity !== undefined ) m.emissiveIntensity = 1;
	m.opacity = source.opacity; m.transparent = source.transparent; m.depthWrite = source.depthWrite;
	return m;

}
