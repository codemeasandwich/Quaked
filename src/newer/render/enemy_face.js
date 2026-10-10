/**
 * @module newer/render/enemy_face
 *
 * Individual enemy faces: each grunt, ogre and knight keeps a randomly chosen face of its own, saved with it.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Cosmetic identity belongs to an individual enemy, never a level or slot.
// The native setmodel spawn hook assigns it once; saves and seamless snapshots
// carry it, and clearFields retires it before an edict can be reused.
export const FACE_MODELS = new Set( [ 'soldier', 'ogre', 'knight' ] );
/**
 * Validates a stored face seed (from a save, snapshot or axe record).
 *
 * @param {*} value candidate seed
 * @returns {?number} `value` when it is an integer in 0..0xffffffff, otherwise null (no valid seed)
 */
export function Face_Seed( value ) {
	return Number.isInteger( value ) && value >= 0 && value <= 0xffffffff ? value : null;
}
/**
 * Parses a face seed written as a decimal string, as stored in the `_newer_face_seed` entity field of a level
 * snapshot (r_levelents.js).
 *
 * @param {*} value candidate string of 1 to 10 digits
 * @returns {?number} the seed (0..0xffffffff), or null when `value` is not such a string or is out of range
 */
export function Face_ParseSeed( value ) {
	return typeof value === 'string' && /^[0-9]{1,10}$/.test( value ) ? Face_Seed( Number( value ) ) : null;
}
const entropy = new Uint32Array( 1 );
function randomSeed() {
	// Cosmetic choices must not advance QuakeC's gameplay Math.random stream.
	if ( globalThis.crypto?.getRandomValues ) return globalThis.crypto.getRandomValues( entropy )[ 0 ];
	return Math.floor( Math.random() * 0x100000000 ) >>> 0;
}
/**
 * Gives an individual grunt, ogre or knight its cosmetic face seed, once. Called from the native setmodel builtin
 * (pr_cmds.js) when an edict's model is set, and again by `Face_Index` at draw time. An existing valid seed is
 * kept, so saves and seamless snapshots that carry `_faceSeed` restore the same face; clearFields retires it
 * before the edict is reused.
 *
 * @param {object} entity server edict or render entity; mutated: `entity._faceSeed` is set when missing or invalid
 * @param {?string} modelName model path such as 'progs/soldier.mdl'; only soldier, ogre and knight get a face
 * @param {?function(): number} [random=null] source of 0..1 values for a reproducible seed; when null the seed
 *   comes from `crypto.getRandomValues` (or `Math.random` without it) so QuakeC's gameplay random stream is not
 *   advanced
 * @returns {?number} the entity's seed (0..0xffffffff), or null when the model has no individual faces
 */
export function Face_Assign( entity, modelName, random = null ) {
	const key = /^progs\/([a-z0-9_]+)\.mdl$/.exec( modelName || '' )?.[ 1 ];
	if ( ! FACE_MODELS.has( key ) ) return null;
	if ( Face_Seed( entity._faceSeed ) === null ) entity._faceSeed = random ? Math.floor( random() * 0x100000000 ) >>> 0 : randomSeed();
	return entity._faceSeed;
}
/**
 * Chooses which face rectangle of a skin's face sheet an enemy wears, when its Newer skin material is picked
 * (r_newerskins.js). Assigns the seed through `Face_Assign` if the entity has none yet.
 *
 * @param {object} entity edict or render entity; may gain `_faceSeed` (see `Face_Assign`)
 * @param {?string} modelName model path such as 'progs/ogre.mdl'
 * @param {number} count number of faces available for the skin (`faces.rects.length`)
 * @param {boolean} [enabled=true] false when variety is switched off (`r_newer_variety` is 0)
 * @returns {number} face index in 0..count-1; 0 when disabled, `count` < 1, or the model has no faces
 */
export function Face_Index( entity, modelName, count, enabled = true ) {
	const seed = Face_Assign( entity, modelName );
	return seed === null || ! enabled || count < 1 ? 0 : seed % count;
}

// Mask in local patch coordinates. It excludes backdrop/shoulders/helmet edges;
// a small inset feather hides the seam without touching the rest of the skin.
// Rectangles use top-row-first pixels, exactly like native alias UVs.
export const FACE_FRAGMENT_HEAD = `
uniform sampler2D qrFaceSheet;
uniform float uHasFace;
uniform vec4 uFaceSource;
uniform vec3 uFaceColorBalance;
uniform vec4 uFaceAlignment;
uniform vec2 uFaceTargetPivot;
uniform vec2 uFacePixelSize;
uniform vec4 uFaceDest[4];
uniform vec4 uFaceSample[4];
uniform vec2 uFacePolygon[8];
float qrFaceMask(vec2 p) {
	float edge=1.;
	for(int i=0;i<8;i++) {
		vec2 a=uFacePolygon[i],b=uFacePolygon[(i+1)%8],d=b-a;
		edge=min(edge,(d.x*(p.y-a.y)-d.y*(p.x-a.x))/max(length(d),.0001));
	}
	return smoothstep(0.,.018,edge);
}
`;
export const FACE_MAP_FRAGMENT = `
float qrFaceCoverage=0.;
if(uHasFace>.5) {
	for(int i=0;i<4;i++) {
		vec4 dest=uFaceDest[i];
		if(dest.z<=0.||dest.w<=0.) continue;
		vec2 p=(vMapUv-dest.xy)/dest.zw;
		if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.)))) continue;
		vec2 face=uFaceSample[i].xy+p*uFaceSample[i].zw;
		float coverage=qrFaceMask(face);
		qrFaceCoverage=max(qrFaceCoverage,coverage);
		// Inverse sample in source pixels: normalized UV rotation alone skews
		// rectangular face crops. The coverage mask stays on the model's UVs.
		vec2 delta=(face-uFaceTargetPivot)*uFacePixelSize;
		vec2 turned=vec2(uFaceAlignment.x*delta.x-uFaceAlignment.y*delta.y,
			uFaceAlignment.y*delta.x+uFaceAlignment.x*delta.y);
		vec2 sampleFace=uFaceAlignment.zw+turned/uFacePixelSize;
		vec2 source=uFaceSource.xy+sampleFace*uFaceSource.zw;
		vec3 faceColor=texture2D(qrFaceSheet,source).rgb*uFaceColorBalance;
		diffuseColor.rgb=mix(diffuseColor.rgb,faceColor,coverage);
	}
}
`;
