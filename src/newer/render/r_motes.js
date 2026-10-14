/**
 * @module newer/render/r_motes
 *
 * Small things in the air, for the add-on effects every game gets (card T-3faa98e3,
 * docs/addon-effects-integration-2026-10-13.md): sparks, falling drops and their splashes, bubbles, puffs of dust and
 * embers. One layer of points draws them all in one call, in Newer Game only (it is flagged `newerOnly`, so the classic
 * picture and the classic half of the title demo never show it). It has its own 512 places, so nothing here can take
 * a particle from Quake's own 2048 (r_part.js) or from the shotgun's, the torches' or any other effect's layers, which
 * it does not touch. What makes the motes (a sparking light, a drip, a nail on a wall, lava) lives in its own module
 * and calls `R_MoteSpawn`.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level typed arrays for the motes, `points` (the layer, made when first needed),
 * `lastTime`, `cursors` (one per owner's reservation), `alive`, `empty`, and the lists `listeners`, `makers` and
 * `motionBlocks` (each owner's collision check).
 *
 * Errors: none raised here.
 */
import * as THREE from 'three';
import { R_NewerGame } from '../mode.js';

/** The kinds of mote. */
export const MOTE_SPARK = 0, MOTE_DRIP = 1, MOTE_SPLASH = 2, MOTE_BUBBLE = 3, MOTE_PUFF = 4, MOTE_EMBER = 5;

/**
 * What each kind is: `size` across in Quake units (`grow` more by the end of its life), `gravity` in units a second
 * squared (negative rises), `drag` (the share of its speed lost a second), `life` in seconds, `color` in linear light
 * (above 1 glows in the Newer picture), `alpha` (0 for a glowing kind, which is added to the picture rather than laid
 * over it), and `sway` (units of sideways drift; 0 for every kind today: bubbles and embers rise straight, as the
 * reviewed nail and ember effects draw them).
 */
export const MOTES = Object.freeze( [
	Object.freeze( { name: 'spark', size: 1.5, grow: 0, gravity: 520, drag: 1.4, life: 0.55, color: [ 3.2, 2.1, 0.7 ], alpha: 0, sway: 0 } ),
	Object.freeze( { name: 'drip', size: 2.2, grow: 0, gravity: 800, drag: 0, life: 4, color: [ 0.62, 0.72, 0.8 ], alpha: 0.5, sway: 0 } ),
	Object.freeze( { name: 'splash', size: 1.4, grow: 0, gravity: 620, drag: 0.5, life: 0.28, color: [ 0.66, 0.76, 0.84 ], alpha: 0.42, sway: 0 } ),
	Object.freeze( { name: 'bubble', size: 2.4, grow: 0.8, gravity: - 110, drag: 2.2, life: 2.2, color: [ 0.72, 0.86, 0.96 ], alpha: 0.4, sway: 0 } ),
	Object.freeze( { name: 'puff', size: 5, grow: 11, gravity: - 14, drag: 2.6, life: 0.7, color: [ 0.46, 0.44, 0.42 ], alpha: 0.2, sway: 0 } ),
	Object.freeze( { name: 'ember', size: 1.7, grow: 0, gravity: - 16, drag: 0.5, life: 3.2, color: [ 2.6, 0.95, 0.22 ], alpha: 0, sway: 0 } )
] );

/** How many motes there can be at once; four reserved effect budgets never overwrite another live mote. */
export const MAX_MOTES = 512;
/** Independent reservations within the same draw: one effect cannot starve or erase another. */
export const MOTE_OWNERS = Object.freeze( [ 'drips', 'sparks', 'nails', 'embers' ] );
export const MOTES_PER_OWNER = MAX_MOTES / MOTE_OWNERS.length;
const defaultOwner = [ 'sparks', 'drips', 'drips', 'nails', 'nails', 'embers' ];
const cursors = new Uint16Array( MOTE_OWNERS.length );
const viewportHeight = { value: 480 };

const pos = new Float32Array( MAX_MOTES * 3 ), vel = new Float32Array( MAX_MOTES * 3 );
const born = new Float64Array( MAX_MOTES ).fill( - Infinity ), life = new Float32Array( MAX_MOTES );
const kindOf = new Uint8Array( MAX_MOTES ), scale = new Float32Array( MAX_MOTES ), seed = new Float32Array( MAX_MOTES );
const low = new Float32Array( MAX_MOTES ), high = new Float32Array( MAX_MOTES ); // it ends on reaching either height
const drawPos = new Float32Array( MAX_MOTES * 3 ), drawColor = new Float32Array( MAX_MOTES * 4 ), drawSize = new Float32Array( MAX_MOTES ), drawKind = new Uint8Array( MAX_MOTES );
let points = null, lastTime = null, alive = 0, empty = true;
const listeners = [], makers = [], motionBlocks = [];
const motionFrom = new Float32Array( 3 ), motionTo = new Float32Array( 3 );

// a soft round dot, its colour already multiplied by its cover (so one blend serves glowing and plain motes alike)
function dot() {

	const n = 16, data = new Uint8Array( n * n * 4 );
	for ( let y = 0; y < n; y ++ ) for ( let x = 0; x < n; x ++ ) {

		const r = Math.hypot( x + 0.5 - n / 2, y + 0.5 - n / 2 ) / ( n / 2 ), v = Math.round( 255 * Math.max( 0, 1 - r * r ) ** 1.5 );
		data.fill( v, ( y * n + x ) * 4, ( y * n + x ) * 4 + 4 );

	}
	const texture = new THREE.DataTexture( data, n, n, THREE.RGBAFormat );
	texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
	return texture;

}

function build() {

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( drawPos, 3 ) );
	geometry.setAttribute( 'color', new THREE.BufferAttribute( drawColor, 4 ) );
	geometry.setAttribute( 'aSize', new THREE.BufferAttribute( drawSize, 1 ) );
	geometry.setAttribute( 'aKind', new THREE.BufferAttribute( drawKind, 1 ) );
	// colour is laid on as (colour x cover) + what is behind x (1 - alpha x cover): alpha 0 adds light, alpha 1 covers
	const material = new THREE.PointsMaterial( { map: dot(), size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, fog: true,
		blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } );
	const before = material.onBeforeCompile;
	material.onBeforeCompile = function ( shader, renderer ) {

		before?.call( this, shader, renderer );
		// each mote its own size
		shader.uniforms.uMoteViewportHeight = viewportHeight;
  shader.vertexShader = 'attribute float aSize;\nattribute float aKind;\nvarying float vMoteKind;\nuniform float uMoteViewportHeight;\n' + shader.vertexShader
   .replace( '#include <begin_vertex>', '#include <begin_vertex>\nvMoteKind = aKind;' )
   .replace( 'gl_PointSize = size;', 'gl_PointSize = aSize * uMoteViewportHeight * 0.5 * projectionMatrix[1][1];' )
   .replace( 'gl_PointSize *= ( scale / - mvPosition.z );', 'gl_PointSize /= -mvPosition.z;' );
  // The layer is already premultiplied. Additive kinds (alpha 0) lose light in fog; they must not add fog light.
  shader.fragmentShader = ('varying float vMoteKind;\n' + shader.fragmentShader)
   .replace( '#include <opaque_fragment>', '#include <opaque_fragment>\nif (abs(vMoteKind - 3.0) < 0.25) { float radius = length(gl_PointCoord - vec2(0.5)); float rim = smoothstep(0.21, 0.29, radius); gl_FragColor *= rim; }' )
   .replace( '#include <fog_fragment>', THREE.ShaderChunk.fog_fragment
   .replace( 'fogColor, fogFactor', 'fogColor * gl_FragColor.a, fogFactor' ) );

	};
	const key = material.customProgramCacheKey.bind( material );
	material.customProgramCacheKey = () => key() + '|quaked-motes';
	points = new THREE.Points( geometry, material );
	points.name = 'quake_motes'; points.userData.newerOnly = true; points.frustumCulled = false; points.renderOrder = 8; points.visible = false;

}

/**
 * Makes one mote. Nothing is made outside Newer Game.
 *
 * @param {number} kind one of the MOTE_ kinds
 * @param {number} x where it starts (Quake units, world space)
 * @param {number} y
 * @param {number} z
 * @param {number} vx its speed (units a second)
 * @param {number} vy
 * @param {number} vz
 * @param {number} time the game's time now (`cl.time`, seconds)
 * @param {{ life?: number, size?: number, low?: number, high?: number, owner?: string }} [options] its life in seconds and its size as
 *   a multiple of the kind's, when not the kind's own; `low` and `high`, heights at which it ends early (a drop
 *   reaching the floor, a bubble the surface)
 * @returns {number} its place (0..511), or -1 when none was made
 */
export function R_MoteSpawn( kind, x, y, z, vx, vy, vz, time, options = null ) {

	if ( ! R_NewerGame() || ! MOTES[ kind ] || ! Number.isFinite( x + y + z + vx + vy + vz + time ) ) return - 1;
 const owner = MOTE_OWNERS.indexOf( options?.owner ?? defaultOwner[ kind ] );
 if ( owner < 0 ) return - 1;
 const start = owner * MOTES_PER_OWNER;
 let i = - 1;
 for ( let n = 0; n < MOTES_PER_OWNER; n ++ ) {
  const slot = start + ( cursors[ owner ] + n ) % MOTES_PER_OWNER;
  if ( born[ slot ] === - Infinity || time - born[ slot ] >= life[ slot ] ) { i = slot; cursors[ owner ] = ( slot - start + 1 ) % MOTES_PER_OWNER; break; }
 }
 if ( i < 0 ) return - 1;
	pos[ i * 3 ] = x; pos[ i * 3 + 1 ] = y; pos[ i * 3 + 2 ] = z;
	vel[ i * 3 ] = vx; vel[ i * 3 + 1 ] = vy; vel[ i * 3 + 2 ] = vz;
	empty = false;
	born[ i ] = time; life[ i ] = Number.isFinite( options?.life ) && options.life > 0 ? Math.min( 30, options.life ) : MOTES[ kind ].life; kindOf[ i ] = kind;
	scale[ i ] = Number.isFinite( options?.size ) && options.size > 0 ? Math.min( 16, options.size ) : 1;
	low[ i ] = Number.isFinite( options?.low ) ? options.low : - Infinity; high[ i ] = Number.isFinite( options?.high ) ? options.high : Infinity;
	// (its own steady number, for the flicker and sway: from its place and time, so a test can know it)
	seed[ i ] = ( ( i * 0.618034 + time * 0.37 ) % 1 + 1 ) % 1;
	return i;

}

/**
 * Asks to be told when a mote of one kind ends by reaching its `low` or `high` (a drop landing, a bubble surfacing).
 *
 * @param {number} kind the MOTE_ kind to hear of
 * @param {function(number, number, number, boolean, number): void} fn called with where it ended (x, y, z), whether
 *   it was at its `high`, and the game's time
 */
export function R_MotesListen( kind, fn ) { ( listeners[ kind ] ??= [] ).push( fn ); }

/**
 * Adds something that makes motes: `frame` is called once a frame, before the motes move, to make its new ones, and
 * `reset` for each new map. Each of the add-on effects registers itself as it is loaded.
 *
 * Collision callbacks are owner-scoped. Their from/to vectors are borrowed scratch arrays: inspect them
 * synchronously; never retain or mutate them. A blocked move retires that mote without landing callbacks.
 *
 * @param {{ owner?: string, frame?: function(number, ?ArrayLike<number>, boolean): void,
 *   reset?: function(): void, blocksMotion?: function(ArrayLike<number>, ArrayLike<number>): boolean }} maker `frame( time, eye, advancing )`
 *   with the game's time, view position, and whether emission may advance (false while paused); `reset()`
 */
export function R_MotesRegister( maker ) {
 makers.push( maker );
 const owner = MOTE_OWNERS.indexOf( maker.owner );
 if ( owner >= 0 && typeof maker.blocksMotion === 'function' ) motionBlocks[ owner ] = maker.blocksMotion;
}

/**
 * Moves every mote on to `time` and puts those still living into the layer. Called once a frame by the renderer
 * (gl_rmain.js), before the scene is drawn. Outside Newer Game the layer is hidden and every mote forgotten; time
 * going back (a new map, a restart) forgets them too; a pause (time standing still) holds them.
 *
 * @param {?THREE.Scene} scene the world scene; the layer joins it when there is something to draw
 * @param {number} time the game's time (`cl.time`, seconds)
 * @param {?ArrayLike<number>} [eye=null] where the view is (Quake units), for the makers: they make nothing far from it
 * @param {number} [height=480] actual scene viewport height in pixels, including dynamic resolution
 * @returns {number} how many are drawn
 */
export function R_MotesFrame( scene, time, eye = null, height = 480 ) {

 if ( Number.isFinite( height ) && height > 0 ) viewportHeight.value = height;

	if ( ! R_NewerGame() || ! Number.isFinite( time ) ) { if ( ! empty || lastTime !== null ) R_MotesClear(); return 0; }
	if ( lastTime !== null && time < lastTime - 0.3 ) R_MotesClear();
 time = Math.max( time, lastTime ?? time );
	const frameDt = lastTime === null ? 0 : Math.max( 0, Math.min( 0.1, time - lastTime ) );
	// Controls apply even while paused; makers receive whether emission time advanced.
	for ( const m of makers ) m.frame?.( time, eye, frameDt > 0 || lastTime === null );
	lastTime = Math.max( time, lastTime ?? time );
	let count = 0;
	for ( let i = 0; i < MAX_MOTES; i ++ ) {

		const age = time - born[ i ];
		if ( ! ( age >= 0 ) || age >= life[ i ] ) { if ( age >= life[ i ] ) born[ i ] = - Infinity; continue; }
		const k = MOTES[ kindOf[ i ] ], p = i * 3, dt = Math.min( frameDt, age );
		if ( dt > 0 ) {

			for ( let axis = 0; axis < 3; axis ++ ) motionFrom[ axis ] = pos[ p + axis ];
			const keep = Math.max( 0, 1 - k.drag * dt );
			vel[ p ] *= keep; vel[ p + 1 ] *= keep; vel[ p + 2 ] = vel[ p + 2 ] * keep - k.gravity * dt;
			pos[ p ] += vel[ p ] * dt; pos[ p + 1 ] += vel[ p + 1 ] * dt; pos[ p + 2 ] += vel[ p + 2 ] * dt;
			const blocked = motionBlocks[ Math.floor( i / MOTES_PER_OWNER ) ];
			if ( blocked ) {
				for ( let axis = 0; axis < 3; axis ++ ) motionTo[ axis ] = pos[ p + axis ];
				if ( blocked( motionFrom, motionTo ) ) { born[ i ] = - Infinity; continue; }
			}
			const atLow = pos[ p + 2 ] <= low[ i ], atHigh = pos[ p + 2 ] >= high[ i ];
			if ( atLow || atHigh ) {

				born[ i ] = - Infinity;
				for ( const fn of listeners[ kindOf[ i ] ] ?? [] ) fn( pos[ p ], pos[ p + 1 ], atLow ? low[ i ] : high[ i ], atHigh, time );
				continue;

			}

		}
		const t = age / life[ i ], d = count * 3, c = count * 4;
		// what floats drifts a little to and fro about its path (drawn, not moved, so its path stays its own)
		const drift = k.sway > 0 ? Math.sin( ( age * 1.7 + seed[ i ] * 6.283 ) ) * k.sway * Math.min( 1, age ) : 0;
		drawPos[ d ] = pos[ p ] + drift; drawPos[ d + 1 ] = pos[ p + 1 ] + drift * 0.6; drawPos[ d + 2 ] = pos[ p + 2 ];
		// it comes in over its first twentieth and goes out over its last third; an ember flickers
		let fade = Math.min( 1, t * 20 ) * Math.min( 1, ( 1 - t ) * 3 );
		if ( kindOf[ i ] === MOTE_EMBER ) fade *= 0.65 + 0.35 * Math.sin( age * 23 + seed[ i ] * 40 );
		const cover = k.alpha * fade, light = k.alpha > 0 ? cover : fade;
		drawColor[ c ] = k.color[ 0 ] * light; drawColor[ c + 1 ] = k.color[ 1 ] * light; drawColor[ c + 2 ] = k.color[ 2 ] * light; drawColor[ c + 3 ] = cover;
		drawSize[ count ] = ( k.size + k.grow * t ) * scale[ i ]; drawKind[ count ] = kindOf[ i ];
		count ++;

	}
	alive = count;
	if ( count === 0 ) { if ( points ) points.visible = false; return 0; }
	if ( ! points ) build();
	if ( scene && points.parent !== scene ) scene.add( points );
	const g = points.geometry;
	g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aKind.needsUpdate = true;
	g.setDrawRange( 0, count );
	points.visible = true;
	return count;

}

/** Retires only one effect's reserved motes, without landing callbacks or touching another effect. */
export function R_MotesRemove( owner ) {
 const index = MOTE_OWNERS.indexOf( owner );
 if ( index >= 0 ) born.fill( - Infinity, index * MOTES_PER_OWNER, ( index + 1 ) * MOTES_PER_OWNER );
}

// every mote gone and the layer hidden (the makers keep what they know of the map)
function forget() {

	born.fill( - Infinity ); cursors.fill( 0 ); alive = 0; lastTime = null; empty = true;
	if ( points ) { points.visible = false; points.geometry.setDrawRange( 0, 0 ); }

}

/** Forgets every mote, hides the layer and resets every maker. Called by the renderer for each new map (`R_NewMap`). */
export function R_MotesClear() {

	forget();
	for ( const m of makers ) m.reset?.();

}

/**
 * The layer as last drawn, for tests and trials.
 *
 * @returns {{ count: number, visible: boolean, motes: Array<{ kind: string, pos: Array<number>, color: Array<number>,
 *   size: number }>, layer: ?THREE.Points }} how many are drawn, whether the layer shows, each one drawn, and the layer
 */
export function R_MotesSnapshot() {

	const motes = [];
	for ( let n = 0; n < alive; n ++ ) motes.push( { kind: MOTES[ drawKind[ n ] ].name, pos: Array.from( drawPos.subarray( n * 3, n * 3 + 3 ) ), color: Array.from( drawColor.subarray( n * 4, n * 4 + 4 ) ), size: drawSize[ n ] } );
	return { count: alive, visible: !! points?.visible, motes, layer: points };

}
