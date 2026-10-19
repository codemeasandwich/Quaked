/**
 * @module engine/render/gl_entity_semantics
 *
 * Hexen II's per-entity render state (uhexen2 engine/hexen2/gl_rmain.c `R_DrawAliasModel` ~737-910 and
 * engine/hexen2/gl_rsurf.c `R_RenderBrushPoly`): the `drawflags` model light style (MLS_*), the absolute light
 * (`abslight`), the entity scale and its SCALE_TYPE_ and SCALE_ORIGIN_ placement, the `DRF_TRANSLUCENT` pass, and the
 * model-flag skin modes (EF_HOLEY, EF_TRANSPARENT, EF_SPECIAL_TRANS, EF_FACE_VIEW).
 *
 * Quake entities carry scale 1.0, drawflags 0 and abslight 0 (common/quakedef.js, client/client.js), and every
 * Quake model has none of the Hexen II model-flag bits, so all of these helpers answer "unchanged" for Quake: the
 * style is MLS_NONE, the scale is the identity and the material is the one the renderer already chose.
 *
 * Types: plain constants, plain objects; no exported classes.
 *
 * State: no mutable exports; the helpers read `r_wateralpha` from glquake.js and the entity they are given.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import * as THREE from 'three';
import { r_wateralpha } from './glquake.js';
import { EF_ROTATE } from './gl_model_types.js';

// uhexen2 engine/hexen2/quakedef.h:176-195
export const MLS_MASKIN = 7; // the low three drawflags bits choose the model light style
export const MLS_NONE = 0;
export const MLS_FULLBRIGHT = 1;
export const MLS_POWERMODE = 2;
export const MLS_TORCH = 3;
export const MLS_TOTALDARK = 4;
export const MLS_ABSLIGHT = 7;

export const SCALE_TYPE_MASKIN = 24;
export const SCALE_TYPE_UNIFORM = 0;
export const SCALE_TYPE_XYONLY = 8;
export const SCALE_TYPE_ZONLY = 16;
export const SCALE_ORIGIN_MASKIN = 96;
export const SCALE_ORIGIN_CENTER = 0;
export const SCALE_ORIGIN_BOTTOM = 32;
export const SCALE_ORIGIN_TOP = 64;
export const DRF_TRANSLUCENT = 128;
export const DRF_ANIMATEONCE = 256;

// The constant in the native scaling origin: `xyfact = (entScale - 1.0) * 127.95` is the model half-extent the
// MDL's 0..255 vertices are centred in, so a scaled model grows about its middle rather than its feet
// (uhexen2 engine/hexen2/gl_rmain.c:830-840).
export const ALIAS_SCALE_ORIGIN = 127.95;

// Hexen II's model-flag bits (uhexen2 engine/h2shared/gl_model.h:390-410). Bits 0-7 are Quake's effect flags;
// these four are above them and Quake's loader never sets them.
export const EF_TRANSPARENT = ( 1 << 12 ); // skin index 0 clear, odd texels translucent
export const EF_HOLEY = ( 1 << 14 ); // solid model with colour 0 clear
export const EF_SPECIAL_TRANS = ( 1 << 15 ); // particle-table translucency
export const EF_FACE_VIEW = ( 1 << 16 ); // poly model always faces the viewer

// How a model's skin is converted (uhexen2 engine/h2shared/gl_draw.c GL_Upload8 / TEX_* flags)
export const SKIN_MODE_DEFAULT = 0;
export const SKIN_MODE_TRANSPARENT = 1;
export const SKIN_MODE_HOLEY = 2;
export const SKIN_MODE_SPECIAL = 3;

/**
 * The entity's model light style, `drawflags & MLS_MASKIN` (uhexen2 engine/hexen2/gl_rmain.c:745). Quake's entities
 * have drawflags 0, which is MLS_NONE.
 *
 * @param {?entity_t} entity a client entity; its `drawflags` may be absent
 * @returns {number} 0..7
 */
export function R_EntityMls( entity ) {

	return ( entity?.drawflags ?? 0 ) & MLS_MASKIN;

}

/**
 * Whether an entity is drawn in the translucent pass (`DRF_TRANSLUCENT`, uhexen2 quakedef.h:194).
 *
 * @param {?entity_t} entity a client entity
 * @returns {boolean} true when the entity's drawflags ask for it
 */
export function R_EntityIsTranslucent( entity ) {

	return ( ( entity?.drawflags ?? 0 ) & DRF_TRANSLUCENT ) !== 0;

}

/**
 * The alpha `DRF_TRANSLUCENT` draws at: `r_wateralpha` (uhexen2 gl_rmain.c:895), which is 0.33 by default in Hexen II.
 *
 * @param {?entity_t} entity a client entity
 * @returns {number} 0..1; 1 for an opaque entity
 */
export function R_EntityAlpha( entity ) {

	return R_EntityIsTranslucent( entity ) ? r_wateralpha.value : 1;

}

/**
 * The entity's scale as a factor (uhexen2 entity_t.scale, a byte of scale*100; Quaked's client entity keeps the
 * factor 1.0 instead). Missing, zero, negative and non-finite values mean unscaled.
 *
 * @param {?entity_t} entity a client entity
 * @returns {number} the factor, 1 for unscaled
 */
export function R_EntityScaleValue( entity ) {

	const scale = entity?.scale;
	return typeof scale === 'number' && Number.isFinite( scale ) && scale > 0 ? scale : 1;

}

/**
 * The model light style an entity's `drawflags` select, as a light-style number (uhexen2 gl_rmain.c:756-762: the
 * style lives in `d_lightstylevalue[24 + mls]`). MLS_ABSLIGHT and MLS_NONE have no style.
 *
 * @param {?entity_t} entity a client entity
 * @returns {number} 25..28 for the fullbright/powermode/torch/totaldark styles, -1 otherwise
 */
export function R_EntityLightStyle( entity ) {

	const mls = R_EntityMls( entity );
	return mls === MLS_NONE || mls === MLS_ABSLIGHT ? - 1 : 24 + mls;

}

/**
 * How an entity's alias model is lit (uhexen2 gl_rmain.c:745-791): the `EF_ROTATE` pulse, `MLS_ABSLIGHT`, another
 * model light style, or the ordinary sampled world light. Selection only; the caller reads the light-style value.
 *
 * @param {?entity_t} entity a client entity
 * @param {number} [modelFlags] the entity model's flags (EF_ROTATE is a Hexen II model flag here)
 * @param {boolean} [hexen] whether the active game is Hexen II (EF_ROTATE's pulse is native Hexen II lighting, and
 *   Quake's items already render unlit-by-that-rule)
 * @returns {{ mode: string, style: number, abslight: number }} `mode` is 'rotate', 'abslight', 'style' or 'sample';
 *   `style` the light-style index for 'style' (-1 otherwise); `abslight` the absolute light (0 otherwise)
 */
export function R_EntityLightInfo( entity, modelFlags = 0, hexen = false ) {

	const abslight = entity?.abslight | 0;
	const style = R_EntityLightStyle( entity );

	if ( hexen && ( modelFlags & EF_ROTATE ) !== 0 ) return { mode: 'rotate', style: - 1, abslight: 0 };
	if ( R_EntityMls( entity ) === MLS_ABSLIGHT ) return { mode: 'abslight', style: - 1, abslight };
	if ( style >= 0 ) return { mode: 'style', style, abslight: 0 };
	return { mode: 'sample', style: - 1, abslight: 0 };

}

/**
 * The alias model vertex transform an entity's scale asks for (uhexen2 gl_rmain.c:816-870). The native renderer
 * translates by SCALE_ORIGIN_* and multiplies `paliashdr.scale` by the entity factor; Quaked's geometry already has
 * `v * paliashdr.scale + paliashdr.scale_origin` baked in, so the equivalent is a per-axis factor about the model
 * origin plus a model-space offset. The caller rotates the offset with the entity (R_RotateForEntity).
 *
 * The odd asymmetry is native: an axis the scale type leaves alone still contributes `paliashdr.scale * 1.0` to a
 * centred or top origin (`xyfact`/`zfact` start at 1.0, not 0).
 *
 * @param {?entity_t} entity a client entity
 * @param {?aliashdr_t} paliashdr the model header (`scale`, `scale_origin` in Quake units)
 * @returns {{ scale: Float32Array, offset: Float32Array }} per-axis factors and the model-space offset; with no
 *   scaling (Quake's 1.0) both are the identity, so the caller can use them unconditionally
 */
export function R_AliasScaleTransform( entity, paliashdr ) {

	const out = { scale: new Float32Array( [ 1, 1, 1 ] ), offset: new Float32Array( 3 ) };
	const entScale = R_EntityScaleValue( entity );
	if ( entScale === 1 || paliashdr == null ) return out;

	const drawflags = ( entity?.drawflags ?? 0 ) | 0;
	const scaleType = drawflags & SCALE_TYPE_MASKIN;
	const scaleOrigin = drawflags & SCALE_ORIGIN_MASKIN;
	const ps = paliashdr.scale ?? [ 0, 0, 0 ];

	let xfact = 1, yfact = 1, zfact = 1;
	let xyfact = 1, zfact2 = 1; // (native's xyfact/zfact, the origin terms)

	const delta = ( entScale - 1 ) * ALIAS_SCALE_ORIGIN;

	if ( scaleType === SCALE_TYPE_XYONLY ) {

		xfact = yfact = entScale;
		xyfact = delta;

	} else if ( scaleType === SCALE_TYPE_ZONLY ) {

		zfact = entScale;
		zfact2 = delta;

	} else {

		xfact = yfact = zfact = entScale;
		xyfact = zfact2 = delta;

	}

	out.scale[ 0 ] = xfact;
	out.scale[ 1 ] = yfact;
	out.scale[ 2 ] = zfact;

	if ( scaleOrigin === SCALE_ORIGIN_BOTTOM ) {

		out.offset[ 0 ] = - ps[ 0 ] * xyfact;
		out.offset[ 1 ] = - ps[ 1 ] * xyfact;

	} else if ( scaleOrigin === SCALE_ORIGIN_TOP ) {

		out.offset[ 0 ] = - ps[ 0 ] * xyfact;
		out.offset[ 1 ] = - ps[ 1 ] * xyfact;
		out.offset[ 2 ] = - ps[ 2 ] * zfact2 * 2.0;

	} else {

		out.offset[ 0 ] = - ps[ 0 ] * xyfact;
		out.offset[ 1 ] = - ps[ 1 ] * xyfact;
		out.offset[ 2 ] = - ps[ 2 ] * zfact2;

	}

	return out;

}

/**
 * Where Hexen II samples an alias model's world light: at the middle of the model's box, not at its feet
 * (uhexen2 engine/hexen2/gl_rmain.c:740-750 `AliasModelGetLightInfo`, which adds
 * `(model->mins[2] + model->maxs[2]) / 2` to the origin). Quake samples at the entity origin, so its light is
 * unchanged.
 *
 * @param {?entity_t} entity a client entity (its `origin`)
 * @param {?model_t} model the entity's model (`mins`/`maxs` in Quake units)
 * @param {boolean} hexen whether the active game is Hexen II
 * @param {Float32Array} [out] the three-element result to write (a fresh array when absent)
 * @returns {Float32Array} the sample point
 */
export function R_AliasLightOrigin( entity, model, hexen, out = new Float32Array( 3 ) ) {

	out[ 0 ] = entity?.origin?.[ 0 ] ?? 0;
	out[ 1 ] = entity?.origin?.[ 1 ] ?? 0;
	out[ 2 ] = entity?.origin?.[ 2 ] ?? 0;
	if ( hexen ) {

		// an alias model keeps its true frame-bounds centre (gl_model_alias.js); the model's own mins/maxs are
		// Quake's placeholder for the server's collision boxes
		const centre = model?.cache?.data?.lightZCentre
			?? ( model?.mins != null && model?.maxs != null ? ( model.mins[ 2 ] + model.maxs[ 2 ] ) / 2 : 0 );
		out[ 2 ] += centre;

	}
	return out;

}

/**
 * The yaw and pitch an `EF_FACE_VIEW` model turns to instead of its own angles (uhexen2 gl_rmain.c:159-193): the
 * model looks from its origin at the viewer. The native code measures the direction from the entity to `r_origin`,
 * takes yaw = atan2(dy, dx) and pitch = atan2(dz, horizontal length) in degrees 0..360.
 *
 * @param {?entity_t} entity the entity (its `origin`)
 * @param {ArrayLike<number>} viewOrigin the viewer's eye (r_origin, Quake units)
 * @returns {{ yaw: number, pitch: number }} degrees, 0..360
 */
export function R_FaceViewAngles( entity, viewOrigin ) {

	const ox = entity?.origin?.[ 0 ] ?? 0, oy = entity?.origin?.[ 1 ] ?? 0, oz = entity?.origin?.[ 2 ] ?? 0;
	let dx = ( viewOrigin?.[ 0 ] ?? 0 ) - ox, dy = ( viewOrigin?.[ 1 ] ?? 0 ) - oy, dz = ( viewOrigin?.[ 2 ] ?? 0 ) - oz;
	const length = Math.hypot( dx, dy, dz );
	if ( length > 0 ) { dx /= length; dy /= length; dz /= length; }

	const forward = Math.hypot( dx, dy );
	let yaw = Math.atan2( dy, dx ) * 180 / Math.PI;
	if ( yaw < 0 ) yaw += 360;
	let pitch = Math.atan2( dz, forward ) * 180 / Math.PI;
	if ( pitch < 0 ) pitch += 360;

	return { yaw, pitch };

}

/**
 * The skin conversion a model's flags select (uhexen2 engine/h2shared/gl_model.c:2253-2259): EF_TRANSPARENT wins
 * over EF_HOLEY, which wins over EF_SPECIAL_TRANS.
 *
 * @param {number} flags the model's `flags` (the MDL header's)
 * @returns {number} SKIN_MODE_DEFAULT, SKIN_MODE_TRANSPARENT, SKIN_MODE_HOLEY or SKIN_MODE_SPECIAL
 */
export function R_ModelSkinMode( flags ) {

	if ( ( flags & EF_TRANSPARENT ) !== 0 ) return SKIN_MODE_TRANSPARENT;
	if ( ( flags & EF_HOLEY ) !== 0 ) return SKIN_MODE_HOLEY;
	if ( ( flags & EF_SPECIAL_TRANS ) !== 0 ) return SKIN_MODE_SPECIAL;
	return SKIN_MODE_DEFAULT;

}

/**
 * Applies a model skin mode's render state to the material an alias model was given (uhexen2 gl_rmain.c:890-912):
 * blending on, and EF_SPECIAL_TRANS' reverse blend and no back-face culling. Texture alpha comes from the loader
 * (gl_draw.js GL_ConvertSkinPixels), so this only sets the state Three.js needs to use it.
 *
 * @param {?THREE.Material} material the alias material (the model's cached one, or Newer's replacement)
 * @param {number} mode a SKIN_MODE_* value
 * @param {boolean} [newer] whether the enhanced pipeline is drawing: the enhanced materials are shared with other
 *   passes, so nothing is changed there beyond alpha testing (its imported art carries its own alpha)
 * @returns {?THREE.Material} `material`
 */
export function R_ApplyModelSkinMode( material, mode, newer = false ) {

	if ( material == null || mode === SKIN_MODE_DEFAULT ) return material;

	material.transparent = true;
	material.alphaTest = 0;
	if ( newer ) return material;

	if ( mode === SKIN_MODE_SPECIAL ) {

		// uhexen2 gl_rmain.c:890-897: glBlendFunc(GL_ONE_MINUS_SRC_ALPHA, GL_SRC_ALPHA), culling off
		material.blending = THREE.CustomBlending;
		material.blendEquation = THREE.AddEquation;
		material.blendSrc = THREE.OneMinusSrcAlphaFactor;
		material.blendDst = THREE.SrcAlphaFactor;
		material.side = THREE.DoubleSide;

	}

	return material;

}

/**
 * The material state an entity's `drawflags` ask for, shared by alias models and brush models (uhexen2
 * gl_rmain.c:893-899 for DRF_TRANSLUCENT, gl_rsurf.c R_RenderBrushPoly for the absolute-light intensity).
 *
 * @param {?entity_t} entity a client entity
 * @returns {{ alpha: number, intensity: number, translucent: boolean }} `alpha` the blend opacity (1 opaque),
 *   `intensity` the 0..1 colour scale of MLS_ABSLIGHT (1 otherwise), `translucent` whether a see-through pass is due
 */
export function R_EntityMaterialStyle( entity ) {

	const translucent = R_EntityIsTranslucent( entity );
	const mls = R_EntityMls( entity );
	const abslight = ( entity?.abslight | 0 );

	return {
		alpha: translucent ? r_wateralpha.value : 1,
		intensity: mls === MLS_ABSLIGHT ? abslight / 255 : 1,
		translucent
	};

}

/**
 * Writes a style from `R_EntityMaterialStyle` onto a material (the caller owns the material when it is a per-entity
 * clone; brush materials must never be modified in place because they are shared).
 *
 * @param {?THREE.Material} material the material to change
 * @param {{ alpha: number, intensity: number, translucent: boolean }} style the entity's style
 * @returns {?THREE.Material} `material`
 */
export function R_ApplyEntityMaterialStyle( material, style ) {

	if ( material == null ) return material;
	if ( style.translucent ) {

		material.transparent = true;
		material.opacity = style.alpha;
		material.depthWrite = false;

	}
	if ( style.intensity !== 1 && material.color != null ) material.color.setScalar( style.intensity );
	return material;

}

