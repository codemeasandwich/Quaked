/**
 * @module newer/render/r_post_lights
 *
 * The post pipeline's lights (card [44h], split from gl_post.js): the light database a map's entities, fixtures,
 * emissive surfaces and sky give it, and the lights chosen each frame for the volume and the relit surfaces.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `worldLights`, `leafKeyCounter`, `selectedCount`,
 * `portraitLight`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `R_BuildWorldLights` also resets and fills the liquids stage's pools and links and sets the sky stage's sun and sky
 * flag, in the order it always has. The frame's selection is `_selected` (the same array for the page's life), of
 * which `R_PostSelectedCount()` count.
 */
import { skyState, sunFromAngles, buildSkyCookie } from './r_post_sky.js';
import { R_PostLiquidsReset, R_PostAddLiquidLink, R_PostSetLiquidRegions, liquidKind, liquidMapLook } from './r_post_liquids.js';
import { SURF_DRAWSKY, MAX_VOLUME_LIGHTS, LIGHT_GAIN, EMITTER_LIGHT_GAIN } from './r_post_config.js';
import { R_ParseEntityLump } from './gl_portal.js';
import { Mod_PointInLeaf, Mod_LeafPVS } from '../../engine/render/gl_model.js';
import { R_ExitFixturePairs, R_LightCone } from './r_fixturelights.js';
import { WATER_PROBE_LIFT } from './r_waterprobe.js';
import { rockUniforms } from './r_rockfield.js';
import { R_PowerupLights, R_PowerupPulse } from './r_powerups.js';
import { R_RendVeilLights } from './r_rendveil.js';
import { R_FlashlightBeam } from './r_flashlight.js';

//============================================================================
// Light database
//============================================================================

let worldLights = [];

let leafKeyCounter = 0;

function parseVector( s, fallback ) {

	if ( s == null ) return fallback;
	const parts = String( s ).trim().split( /\s+/ ).map( parseFloat );
	if ( parts.length < 3 || parts.some( Number.isNaN ) ) return fallback;
	return parts;

}

function entityLightColor( ent ) {

	const c = parseVector( ent._color, null );
	if ( c != null ) {

		const scale = Math.max( c[ 0 ], c[ 1 ], c[ 2 ] ) > 1.0 ? 1 / 255 : 1;
		return [ c[ 0 ] * scale, c[ 1 ] * scale, c[ 2 ] * scale ];

	}

	const cls = ent.classname;
	if ( cls.indexOf( 'torch' ) >= 0 || cls.indexOf( 'flame' ) >= 0 ) return [ 1.0, 0.55, 0.22 ];
	if ( cls.indexOf( 'fluoro' ) >= 0 ) return [ 0.75, 0.88, 1.0 ];
	return [ 1.0, 0.82, 0.6 ];

}

function polyInfo( surf ) {

	let area = 0, cx = 0, cy = 0, cz = 0, n = 0;

	for ( let p = surf.polys; p; p = p.next ) {

		const v = p.verts;
		const f = v instanceof Float32Array
			? ( i, k ) => v[ i * 7 + k ]
			: ( i, k ) => v[ i ][ k ];

		for ( let i = 0; i < p.numverts; i ++ ) {

			cx += f( i, 0 ); cy += f( i, 1 ); cz += f( i, 2 );
			n ++;

		}

		for ( let i = 2; i < p.numverts; i ++ ) {

			const ax = f( i - 1, 0 ) - f( 0, 0 ), ay = f( i - 1, 1 ) - f( 0, 1 ), az = f( i - 1, 2 ) - f( 0, 2 );
			const bx = f( i, 0 ) - f( 0, 0 ), by = f( i, 1 ) - f( 0, 1 ), bz = f( i, 2 ) - f( 0, 2 );
			const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
			area += 0.5 * Math.sqrt( x * x + y * y + z * z );

		}

	}

	if ( n === 0 ) return null;
	return { area, center: [ cx / n, cy / n, cz / n ] };

}

function polyBounds( surf ) {

	const b = [ 1e9, 1e9, 1e9, - 1e9, - 1e9, - 1e9 ];
	let any = false;

	for ( let p = surf.polys; p; p = p.next ) {

		const v = p.verts;
		for ( let i = 0; i < p.numverts; i ++ ) {

			for ( let k = 0; k < 3; k ++ ) {

				const x = v instanceof Float32Array ? v[ i * 7 + k ] : v[ i ][ k ];
				if ( x < b[ k ] ) b[ k ] = x;
				if ( x > b[ k + 3 ] ) b[ k + 3 ] = x;

			}

			any = true;

		}

	}

	return any ? b : null;

}

// average colour and coverage of a texture's fullbright texels
function fullbrightEmission( texture ) {

	if ( texture._emission !== undefined ) return texture._emission;

	let result = null;
	const data = texture._fullbright != null && texture._fullbright.image != null
		? texture._fullbright.image.data
		: null;

	if ( data != null ) {

		let r = 0, g = 0, b = 0, n = 0;
		const pixels = data.length / 4;
		for ( let i = 0; i < pixels; i ++ ) {

			if ( data[ i * 4 + 3 ] === 0 ) continue;
			r += Math.pow( data[ i * 4 ] / 255, 2.2 );
			g += Math.pow( data[ i * 4 + 1 ] / 255, 2.2 );
			b += Math.pow( data[ i * 4 + 2 ] / 255, 2.2 );
			n ++;

		}

		if ( n > 0 )
			result = { color: [ r / n, g / n, b / n ], coverage: n / pixels };

	}

	texture._emission = result;
	return result;

}

function surfaceEmission( surf ) {

	const tex = surf.texinfo.texture;
	const name = tex.name.toLowerCase();

	if ( name.indexOf( '*lava' ) === 0 ) return { color: [ 1.0, 0.36, 0.1 ], coverage: 2.4 };
	if ( name.indexOf( '*slime' ) === 0 ) return { color: [ 0.25, 0.95, 0.2 ], coverage: 0.6 };
	if ( name.indexOf( '*teleport' ) === 0 ) return { color: [ 0.55, 0.65, 1.0 ], coverage: 0.15 };
	if ( name.charAt( 0 ) === '*' || tex.gl_texture == null ) return null;

	return fullbrightEmission( tex.gl_texture );

}

const SURFACE_CELL = 192;
const MAX_SURFACE_LIGHTS = 500;

/**
 * Builds the level's light database once per map (gl_rsurf.js `GL_BuildLightmaps`): the map's light entities
 * (power = light / 300, colour from `_color` or the class), exit-fixture lights, and up to 500 clustered emissive
 * surface lights (lava, light panels, glowing buttons), strongest first; also the water, slime and lava regions,
 * the liquid visibility links, whether the map has sky, the sky analysis and cookie, and the sun direction
 * (worldspawn `_sun_mangle` "yaw pitch" overrides the default). Replaces everything from the previous map.
 *
 * @param {?object} model the world brush model (`cl.worldmodel`); null clears the database
 * @returns {Array<object>} the new world light list (also kept for `R_GetWorldLights`): each `{ pos, color, power,
 *   radius, style, leaf, emitter, ... }` with `pos` in Quake units
 */
export function R_BuildWorldLights( model ) {

	worldLights = [];
	skyState.hasSky = false;
	R_PostLiquidsReset( model?.name );
	buildSkyCookie();
	skyState.sunDirection = [ - 0.28, - 0.18, 0.94 ];

	if ( model == null || model.nodes == null ) return worldLights;

	const entities = model.entities != null ? R_ParseEntityLump( model.entities ) : [];
	// light entities
	if ( model.entities != null ) {


		const world = entities.find( e => e.classname === 'worldspawn' );
		if ( world != null && world._sun_mangle != null ) {

			const a = parseVector( world._sun_mangle, null );
			if ( a != null ) skyState.sunDirection = sunFromAngles( a[ 0 ], a[ 1 ] );

		}

		for ( const ent of entities ) {

			if ( ent.classname == null || ent.classname.indexOf( 'light' ) !== 0 || ent.origin == null ) continue;

			const pos = parseVector( ent.origin, null );
			if ( pos == null ) continue;

			const value = ent.light !== undefined ? parseFloat( ent.light ) : 300;
			if ( ! ( value > 0 ) ) continue;

			worldLights.push( {
				pos,
				classname: ent.classname,
				emitter: FIRE_LIGHT.test( ent.classname ) ? 1 : 0,
				color: entityLightColor( ent ),
				power: value / 300,
				radius: 28,
				style: parseInt( ent.style, 10 ) || 0,
				// torches and fires burn unevenly: their light flickers (a light with a style of its own follows that)
				flicker: FIRE_LIGHT.test( ent.classname ) && ( parseInt( ent.style, 10 ) || 0 ) === 0 ? 1 : 0,
				leaf: Mod_PointInLeaf( pos, model )
			} );

		}

	}

	const fixturePairs=R_ExitFixturePairs(model,entities,worldLights,{info:polyInfo,bounds:polyBounds,leaf:Mod_PointInLeaf});
 const fixtureFaces=new Set(fixturePairs.map(pair=>pair.face));
 for(const pair of fixturePairs){
  const light=pair.helper;
  light.fixture={face:pair.face,authoredPosition:light.pos.slice(),panelCenter:pair.center};
  light.pos=pair.position;light.direction=pair.direction;light.cone=pair.cone;
  light.priority=4; // source membership only; retain authored radiance/style
  light.radius=96; // calibrated spread/falloff, not an authored BSP cone
  light.leaf=Mod_PointInLeaf(light.pos,model);
 }

	// emissive surfaces (lava, light panels, glowing buttons...)
	if ( model.surfaces != null ) {

		const first = model.firstmodelsurface || 0;
		const last = first + ( model.nummodelsurfaces || model.surfaces.length );
		const clusters = new Map();
		const liquidFaces = [];
		const lavaFaces = [];
		const linkSeen = new Set();
		const visCache = new Map();

		for ( let i = first; i < last; i ++ ) {

			const surf = model.surfaces[ i ];
			if ( surf == null || surf.texinfo == null || surf.texinfo.texture == null ) continue;
			if ( surf.flags & SURF_DRAWSKY ) { skyState.hasSky = true; continue; }

			// lava: the pools the heat shimmers over
			const lname = surf.texinfo.texture.name.toLowerCase();
			if ( lname.charAt( 0 ) === '*' && lname.indexOf( 'lava' ) >= 0 && Math.abs( surf.plane.normal[ 2 ] ) > 0.95 ) {

				const linfo = polyInfo( surf );
				const lbox = polyBounds( surf );
				if ( linfo != null && lbox != null ) lavaFaces.push( { kind: 2, min: [ lbox[ 0 ], lbox[ 1 ] ], max: [ lbox[ 3 ], lbox[ 4 ] ], z: linfo.center[ 2 ] } );

			}

			const liquid = liquidKind( surf.texinfo.texture.name );
			if ( liquid >= 0 && Math.abs( surf.plane.normal[ 2 ] ) > 0.95 ) {

				const info = polyInfo( surf );
				const box = polyBounds( surf );
				if ( info != null && box != null ) {

					const probePoint = [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] + WATER_PROBE_LIFT ];
					const validProbe = Mod_PointInLeaf( probePoint, model ).contents === - 1;
					// the air above this face and the liquid just below it
					const above = Mod_PointInLeaf( [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] + 4 ], model );
					const below = Mod_PointInLeaf( [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] - 4 ], model );
					// A suspended pool has a second, downward-facing boundary. It
					// bounds the same water; it is not another pool to composite.
					const underside = above.contents === ( liquid === 0 ? - 3 : - 4 ) && below.contents === - 1;
					liquidFaces.push( { kind: liquid, mapLook: liquidMapLook( surf.texinfo.texture.name ), min: [ box[ 0 ], box[ 1 ] ], max: [ box[ 3 ], box[ 4 ] ], z: info.center[ 2 ], underside, probePoint: validProbe ? probePoint : null } );
					if ( above !== below && below.contents !== - 2 ) {

						const key = above.__portalKey ?? ( above.__portalKey = ++ leafKeyCounter );
						const key2 = below.__portalKey ?? ( below.__portalKey = ++ leafKeyCounter );
						if ( ! linkSeen.has( key * 1e6 + key2 ) ) {

							linkSeen.add( key * 1e6 + key2 );
							if ( ! visCache.has( key2 ) )
								visCache.set( key2, Mod_LeafPVS( below, model ).slice( 0, ( model.numleafs + 7 ) >> 3 ) );
							if ( ! visCache.has( - key ) )
								visCache.set( - key, Mod_LeafPVS( above, model ).slice( 0, ( model.numleafs + 7 ) >> 3 ) );
							R_PostAddLiquidLink( { above, below, belowVis: visCache.get( key2 ), aboveVis: visCache.get( - key ) } );

						}

					}

				}

				continue;

			}

			if(fixtureFaces.has(i))continue; // matched physical source already owns its added light
			const emission = surfaceEmission( surf );
			if ( emission == null ) continue;

			// Large turbulent faces already contain subdivided polygons. Cluster
			// lava from those actual patches, not one distant pool-centre light.
			const lava = lname.indexOf( '*lava' ) === 0;
			const patches = [];
			if ( lava ) {
				for ( let p = surf.polys; p; p = p.next ) patches.push( polyInfo( { polys: { numverts: p.numverts, verts: p.verts, next: null } } ) );
			} else patches.push( polyInfo( surf ) );
			for ( const info of patches ) {
				if ( info == null || info.area < 64 ) continue;

				const key = surf.texinfo.texture.name + '|' +
					Math.floor( info.center[ 0 ] / SURFACE_CELL ) + ',' +
					Math.floor( info.center[ 1 ] / SURFACE_CELL ) + ',' +
					Math.floor( info.center[ 2 ] / SURFACE_CELL ) +
					// Opposite lava faces must not average their source into the pool.
					( lava ? '|' + Array.from( surf.plane.normal ).map( v => v * ( surf.flags & 2 ? -1 : 1 ) ).join( ',' ) : '' );

				let c = clusters.get( key );
				if ( c === undefined ) {

					c = { emission, texture: surf.texinfo.texture.name, area: 0, sum: [ 0, 0, 0 ], normal: [ 0, 0, 0 ] };
					clusters.set( key, c );

				}

				const sign = ( surf.flags & 2 ) ? - 1 : 1; // SURF_PLANEBACK
				c.area += info.area;
				for ( let a = 0; a < 3; a ++ ) {

					c.sum[ a ] += info.center[ a ] * info.area;
					c.normal[ a ] += surf.plane.normal[ a ] * sign * info.area;

				}
			}

		}

		R_PostSetLiquidRegions( liquidFaces, lavaFaces );

		const surfaceLights = [];
		for ( const c of clusters.values() ) {

			const len = Math.hypot( c.normal[ 0 ], c.normal[ 1 ], c.normal[ 2 ] ) || 1;
			const pos = [
				c.sum[ 0 ] / c.area + c.normal[ 0 ] / len * 10,
				c.sum[ 1 ] / c.area + c.normal[ 1 ] / len * 10,
				c.sum[ 2 ] / c.area + c.normal[ 2 ] / len * 10
			];

			surfaceLights.push( {
				pos,
				emitter: 1,
				texture: c.texture, // source provenance; entity/dynamic lamps have no surface texture
				color: c.emission.color,
				power: Math.min( 1.1, c.area * c.emission.coverage / ( 64 * 64 ) * 0.5 ),
				radius: Math.max( 24, Math.min( 110, Math.sqrt( c.area ) * 0.5 ) ),
				style: 0,
				leaf: Mod_PointInLeaf( pos, model )
			} );

		}

		surfaceLights.sort( ( a, b ) => b.power - a.power );
		for ( let i = 0; i < surfaceLights.length && i < MAX_SURFACE_LIGHTS; i ++ )
			worldLights.push( surfaceLights[ i ] );

	}

	rockUniforms.qrRockSun.value.set( ...skyState.sunDirection ).normalize();
	return worldLights;

}

/**
 * The light database built by `R_BuildWorldLights` (gl_rmain.js `R_ShadowLights` picks monsters' floor-shadow
 * lights from it).
 *
 * @returns {Array<object>} the live module list, replaced at each map (do not mutate)
 */
export function R_GetWorldLights() {

	return worldLights;

}

//============================================================================
// Per-frame light selection
//============================================================================

export const _selected = [];
for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ )
	_selected.push( { pos: [ 0, 0, 0 ], worldPos: [ 0, 0, 0 ], source: null, color: [ 0, 0, 0 ], radius: 30, range: 300, score: 0 } );
let selectedCount = 0;

/**
 * How many of `_selected` this frame's lights fill (set by `selectLights`, or by `R_PostFinish` from the frame's
 * snapshot).
 *
 * @returns {number} 0..MAX_VOLUME_LIGHTS
 */
export function R_PostSelectedCount() {

	return selectedCount;

}

/**
 * Sets how many of `_selected` count: 0 when no lights are selected this frame, or the frame snapshot's count.
 *
 * @param {number} n 0..MAX_VOLUME_LIGHTS
 */
export function R_PostSetSelectedCount( n ) {

	selectedCount = n;

}

const DLIGHT_COLOR = [ 1.0, 0.62, 0.28 ];
const MUZZLE_COLOR = [ 1.0, 0.78, 0.45 ]; // a muzzle flash is whiter and much stronger than an ember
const MUZZLE_POWER = 3;

function consider( px, py, pz, color, power, radius, view, add = 0, source = null, rankPower = power ) {

	// view space
	const vx = view[ 0 ] * px + view[ 4 ] * py + view[ 8 ] * pz + view[ 12 ];
	const vy = view[ 1 ] * px + view[ 5 ] * py + view[ 9 ] * pz + view[ 13 ];
	const vz = view[ 2 ] * px + view[ 6 ] * py + view[ 10 ] * pz + view[ 14 ];

	const dist2 = vx * vx + vy * vy + vz * vz;
	// Receiver lighting must not change when the camera turns at one location.
	// Visible flames receive priority over invisible baked-light helper entities.
	const score = rankPower / ( dist2 + 6000 ) * ( source?.bestiary ? 16 : source?.priority || ( source?.emitter === 1 ? 4 : 1 ) );

	let slot = null;
	if ( selectedCount < MAX_VOLUME_LIGHTS ) {

		slot = _selected[ selectedCount ++ ];

	} else {

		let worst = 0;
		for ( let i = 1; i < selectedCount; i ++ )
			if ( _selected[ i ].score < _selected[ worst ].score ) worst = i;
		if ( _selected[ worst ].score >= score ) return;
		slot = _selected[ worst ];

	}

	slot.score = score;
	slot.source = source; slot.worldPos[ 0 ] = px; slot.worldPos[ 1 ] = py; slot.worldPos[ 2 ] = pz;
 const shape=R_LightCone(source?.direction,source?.cone);
 slot.direction=shape?.direction || [0,0,0];slot.cone=shape?.cone || [1,1];
 slot.viewDirection=shape?[
 view[0]*shape.direction[0]+view[4]*shape.direction[1]+view[8]*shape.direction[2],
 view[1]*shape.direction[0]+view[5]*shape.direction[1]+view[9]*shape.direction[2],
 view[2]*shape.direction[0]+view[6]*shape.direction[1]+view[10]*shape.direction[2]]:[0,0,0];
	slot.add = add;
	slot.pos[ 0 ] = vx; slot.pos[ 1 ] = vy; slot.pos[ 2 ] = vz;
	slot.radius = radius;
	// Pickup pulses change radiance, not receiver reach or shadow residency.
	slot.range = source?.rendVeil ? source.range : 130 + 170 * Math.sqrt( source?.powerup || source?.bestiary ? rankPower : power );
	slot.color[ 0 ] = color[ 0 ] * power * LIGHT_GAIN;
	slot.color[ 1 ] = color[ 1 ] * power * LIGHT_GAIN;
	slot.color[ 2 ] = color[ 2 ] * power * LIGHT_GAIN;

}

const FIRE_LIGHT = /torch|flame|fire|brazier/i;

/**
 * How bright a fire is at a moment: a slow swell and quick flutters, a little different for every fire (phased by
 * its position) so a row of torches does not pulse together. Used for the flickering map lights here, for the
 * fire models' light (gl_rmain.js) and for the torch fire (r_torchfire.js).
 *
 * @param {number} x fire position x, Quake units
 * @param {number} y fire position y, Quake units
 * @param {number} z fire position z, Quake units
 * @param {number} time client time, seconds
 * @returns {number} brightness multiplier, 0.55..1.25
 */
export function R_FireFlicker( x, y, z, time ) {

	const ph = ( x * 0.013 + y * 0.017 + z * 0.011 ) % 6.2832;
	const a = Math.sin( time * 2.3 + ph ) * 0.5 + Math.sin( time * 5.1 + ph * 2.1 ) * 0.3;
	const b = Math.sin( time * 13.7 + ph * 3.3 ) * Math.sin( time * 8.9 + ph * 1.7 );
	return Math.min( 1.25, Math.max( 0.55, 0.9 + a * 0.15 + b * 0.18 ) );

}

// The Bestiary's portrait light while a first-sighting page is up ({ pos, color, power, radius, fade }, or null), given
// each frame by the renderer (gl_rmain.js) rather than imported, so post-processing does not depend on the interface
// (card [44g], debt D1c)
let portraitLight = null;
/**
 * Sets the Bestiary's portrait light for the next light selection; called each frame by gl_rmain.js before
 * `R_PostLightsFrame`. Kept until replaced.
 *
 * @param {?{ pos: Array<number>, color: Array<number>, power: number, radius: number, fade: number }} light the
 *   portrait light (world space, fade 0..1), or null/undefined when no first-sighting page is up
 */
export function R_PostSetPortraitLight( light ) {

	portraitLight = light ?? null;

}

/**
 * The per-frame light selection, into `_selected` (no snapshot; `R_SelectWorldLights` is its public, copying form):
 * map lights in the PVS (scaled by their light style, emitter gain and flicker), power-up lights, Rend the Veil
 * lights, the Bestiary portrait light and live dynamic lights, keeping the `MAX_VOLUME_LIGHTS` best by power over
 * distance. Run by `R_PostLightsFrame` while advanced lighting is on.
 *
 * @param {THREE.Matrix4} viewMatrix world-to-view matrix (`camera.matrixWorldInverse`)
 * @param {number} visframe the current visibility frame (`r_visframecount`); a light's leaf must carry it
 * @param {?ArrayLike<number>} styles light style values (`d_lightstylevalue`, 264 = normal)
 * @param {?Array<object>} dlights client dynamic lights (`cl_dlights`)
 * @param {number} time client time, seconds
 */
export function selectLights( viewMatrix, visframe, styles, dlights, time ) {

	selectedCount = 0;
	const view = viewMatrix.elements;

	for ( let i = 0; i < worldLights.length; i ++ ) {

		const l = worldLights[ i ];
		const leaf = l.leaf;
		// in the PVS (or embedded in a wall, where the leaf is solid)
		if ( leaf != null && leaf.contents !== - 2 && leaf.visframe !== visframe ) continue;

		let power = l.power;
		if ( l.style !== 0 && styles != null && styles[ l.style ] !== undefined )
			power *= styles[ l.style ] / 264;

		const rankPower = power; // flicker changes radiance, not slot membership
		if ( l.emitter === 1 ) power *= EMITTER_LIGHT_GAIN;
		if ( l.flicker === 1 ) power *= R_FireFlicker( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], time );

		if ( power <= 0.001 ) continue;
		consider( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], l.color, power, l.radius, view, 0, l, rankPower );

	}

	// Live pickup sources enter the SAME selection/snapshot/shadow slots as
	// map lights. Only radiance pulses; ranking and cube range stay stable.
	for ( const l of R_PowerupLights() ) {
		const pulse = l.powerup === 'quad' ? R_PowerupPulse( time ) : 1;
		consider( ...l.pos, l.color, l.power * pulse, l.radius, view, .65, l, l.power );
	}
	for(const l of R_RendVeilLights())consider(...l.origin,l.color,l.power,l.radius,view,0,l,l.power);
	const portrait=portraitLight;
	if(portrait&&portrait.fade>0)consider(...portrait.pos,portrait.color,portrait.power*portrait.fade,portrait.radius,view,0,portrait,portrait.power);

	if ( dlights != null ) {

		for ( let i = 0; i < dlights.length; i ++ ) {

			const d = dlights[ i ];
			if ( d == null || d.radius <= 0 || d.die < time ) continue;

			// (the game gives a muzzle flash a minimum light of 32)
			const muzzle = d.minlight === 32;
			// an ordinary light fades over its last 0.3 s; a flash is only 0.1 s long and full strength until it is gone
			const fade = Math.min( 1, ( d.die - time ) / ( muzzle ? 0.1 : 0.3 ) );
			consider( d.origin[ 0 ], d.origin[ 1 ], d.origin[ 2 ], muzzle ? MUZZLE_COLOR : DLIGHT_COLOR,
				d.radius / 300 * 1.4 * fade * ( muzzle ? MUZZLE_POWER * ( d.flashScale === undefined ? 1 : d.flashScale ) : 1 ), 40, view, 1, d, d.radius / 300 * 1.4 * (muzzle?MUZZLE_POWER:1) );

		}

	}

}

/**
 * Read-only diagnostic/public-test endpoint; normal rendering uses the same selection without allocating snapshots
 * every frame. Runs the per-frame light selection: map lights in the PVS (scaled by their light style, emitter
 * gain and flicker), power-up lights, Rend the Veil lights, the Bestiary portrait light and live dynamic lights,
 * keeping the `MAX_VOLUME_LIGHTS` best by power over distance. Overwrites the shared selection used by rendering.
 *
 * @param {THREE.Matrix4} viewMatrix world-to-view matrix (`camera.matrixWorldInverse`)
 * @param {number} visframe the current visibility frame (`r_visframecount`); a light's leaf must carry it
 * @param {?ArrayLike<number>} styles light style values (`d_lightstylevalue`, 264 = normal)
 * @param {?Array<object>} dlights client dynamic lights (`cl_dlights`)
 * @param {number} time client time, seconds
 * @returns {Array<{ source: ?object, position: Array<number>, color: Array<number>, range: number, score: number,
 *   direction: Array<number>, cone: Array<number> }>} fresh copies: world position (Quake units), HDR colour
 *   (colour x power x light gain), receiver range in Quake units and the ranking score
 */
export function R_SelectWorldLights( viewMatrix, visframe, styles, dlights, time ) {
 selectLights( viewMatrix, visframe, styles, dlights, time );
 return _selected.slice( 0, selectedCount ).map( light => ( { source: light.source, position: light.worldPos.slice(), color: light.color.slice(), range: light.range, score: light.score, direction:light.direction.slice(), cone:light.cone.slice() } ) );
}

/**
 * This frame's light uniforms, before the passes that use them (from `R_PostFinish`): the depth and camera, the
 * chosen lights' positions, colours, cookies and cones, and the flashlight in view space.
 *
 * @param {object} p the pipeline (`postState.gpu`)
 * @param {THREE.Camera} camera the view camera
 * @param {?object} frame this frame's snapshot (`R_PostLightsFrame`): its lights and beam
 * @param {number} time client time, seconds
 * @param {boolean} lighting whether advanced lighting is on
 */
export function R_PostLightUniforms( p, camera, frame, time, lighting ) {

	const sh = p.shared, hdr = p.hdr;
	sh.tDepth.value = hdr.depthTexture;
	sh.tNormal.value = hdr.textures[ 1 ];
	sh.uProj.value.copy( camera.projectionMatrix );
	sh.uProjInv.value.copy( camera.projectionMatrixInverse );
	sh.uViewInv.value.copy( camera.matrixWorld );
	sh.uNear.value = camera.near;
	sh.uFar.value = camera.far;
	sh.uCount.value = R_PostSelectedCount();
	sh.uPowerupTime.value = time;

	// the flashlight, in view space
	const beam = frame?.beam || R_FlashlightBeam();
	sh.uSpotOn.value = lighting && beam.on ? 1 : 0;
	if ( beam.on ) {

		const v = camera.matrixWorldInverse.elements;
		const bp = beam.pos, bd = beam.dir;
		sh.uSpotPos.value.set(
			v[ 0 ] * bp[ 0 ] + v[ 4 ] * bp[ 1 ] + v[ 8 ] * bp[ 2 ] + v[ 12 ],
			v[ 1 ] * bp[ 0 ] + v[ 5 ] * bp[ 1 ] + v[ 9 ] * bp[ 2 ] + v[ 13 ],
			v[ 2 ] * bp[ 0 ] + v[ 6 ] * bp[ 1 ] + v[ 10 ] * bp[ 2 ] + v[ 14 ] );
		sh.uSpotDir.value.set(
			v[ 0 ] * bd[ 0 ] + v[ 4 ] * bd[ 1 ] + v[ 8 ] * bd[ 2 ],
			v[ 1 ] * bd[ 0 ] + v[ 5 ] * bd[ 1 ] + v[ 9 ] * bd[ 2 ],
			v[ 2 ] * bd[ 0 ] + v[ 6 ] * bd[ 1 ] + v[ 10 ] * bd[ 2 ] ).normalize();

	}
	for ( let i = 0, n = R_PostSelectedCount(); i < n; i ++ ) {

		const s = frame.lights[ i ];
		sh.uLightPos.value[ i ].set( s.pos[ 0 ], s.pos[ 1 ], s.pos[ 2 ], s.radius );
		sh.uLightCol.value[ i ].set( s.color[ 0 ], s.color[ 1 ], s.color[ 2 ], s.range );
		p.compositeMaterial.uniforms.uLightAdd.value[ i ] = s.add || 0;
		// Invisible baked-light helpers illuminate receivers, but must not
		// appear as floating lamps in a liquid's specular highlight.
		p.compositeMaterial.uniforms.uLightSpecular.value[ i ] = s.source?.emitter === 1 || s.source?.fixture || s.source?.powerup || s.source?.rendVeil || s.add > 0 ? 1 : 0;
		sh.uLightCookie.value[ i ] = s.source?.cookie || 0;
		sh.uLightRotation.value[ i ].fromArray( s.powerupRotation );
  sh.uLightDirection.value[i].fromArray(s.viewDirection);
  sh.uLightCone.value[i].fromArray(s.cone);

	}

}
