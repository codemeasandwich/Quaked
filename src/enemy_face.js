// Cosmetic identity belongs to an individual enemy, never a level or slot.
// The native setmodel spawn hook assigns it once; saves and seamless snapshots
// carry it, and clearFields retires it before an edict can be reused.
export const FACE_MODELS = new Set( [ 'soldier', 'ogre', 'knight' ] );
export function Face_Seed( value ) {
	return Number.isInteger( value ) && value >= 0 && value <= 0xffffffff ? value : null;
}
export function Face_ParseSeed( value ) {
	return typeof value === 'string' && /^[0-9]{1,10}$/.test( value ) ? Face_Seed( Number( value ) ) : null;
}
const entropy = new Uint32Array( 1 );
function randomSeed() {
	// Cosmetic choices must not advance QuakeC's gameplay Math.random stream.
	if ( globalThis.crypto?.getRandomValues ) return globalThis.crypto.getRandomValues( entropy )[ 0 ];
	return Math.floor( Math.random() * 0x100000000 ) >>> 0;
}
export function Face_Assign( entity, modelName, random = null ) {
	const key = /^progs\/([a-z0-9_]+)\.mdl$/.exec( modelName || '' )?.[ 1 ];
	if ( ! FACE_MODELS.has( key ) ) return null;
	if ( Face_Seed( entity._faceSeed ) === null ) entity._faceSeed = random ? Math.floor( random() * 0x100000000 ) >>> 0 : randomSeed();
	return entity._faceSeed;
}
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
