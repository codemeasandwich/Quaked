// Hexen II's per-entity render semantics (U6): the drawflags model light styles and absolute light, SCALE_TYPE_ and
// SCALE_ORIGIN_ scaling with the native 127.95 constant, the DRF_TRANSLUCENT pass, the model-flag skin modes with
// their palette conversion, EF_FACE_VIEW, the light-style rate prefix, and the always-translucent *rtex078/*lowlight
// liquids. Synthetic entities only, except the last case which reads the supplied Hexen II installation when present.
//
// uhexen2 engine/hexen2/gl_rmain.c R_DrawAliasModel 737-910, engine/h2shared/gl_draw.c GL_Upload8 1705-1775,
// engine/h2shared/gl_rlight.c R_AnimateLight 33-65, engine/h2shared/model.c Mod_SetDrawingFlags.

// Bootstrap the renderer's existing circular module graph in its safe order.
await import( '../src/engine/render/gl_rsurf.js' );

const THREE = await import( 'three' );
const semantics = await import( '../src/engine/render/gl_entity_semantics.js' );
const gl_draw = await import( '../src/engine/render/gl_draw.js' );
const gl_rlight = await import( '../src/engine/render/gl_rlight.js' );
const gl_rmisc = await import( '../src/engine/render/gl_rmisc.js' );
const gl_rsurf_liquids = await import( '../src/engine/render/gl_rsurf_liquids.js' );
const glquake = await import( '../src/engine/render/glquake.js' );
const gl_model_alias = await import( '../src/engine/render/gl_model_alias.js' );
const gl_mesh = await import( '../src/engine/render/gl_mesh.js' );
const gl_rmain = await import( '../src/engine/render/gl_rmain.js' );
const gl_rsurf_brush = await import( '../src/engine/render/gl_rsurf_brush.js' );
const { GameProfile_Set } = await import( '../src/engine/common/game_profile.js' );
const { cl } = await import( '../src/engine/client/client.js' );
const { entity_t } = await import( '../src/engine/render/render.js' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m, e = 1e-3 ) => check( Number.isFinite( a ) && Math.abs( a - b ) <= e, `${m}: ${a} != ${b}` );

function entity( fields = {} ) {

	const e = new entity_t();
	e.origin = new Float32Array( [ 0, 0, 0 ] );
	e.angles = new Float32Array( [ 0, 0, 0 ] );
	Object.assign( e, fields );
	return e;

}

Deno.test( 'each drawflags light mode selects the native light style or absolute light', () => {

	// uhexen2 quakedef.h:177-183: MLS_ABSLIGHT is 7, so it is also MLS_MASKIN; the style lives at 24+mls
	const expected = [
		[ semantics.MLS_FULLBRIGHT, 25 ],
		[ semantics.MLS_POWERMODE, 26 ],
		[ semantics.MLS_TORCH, 27 ],
		[ semantics.MLS_TOTALDARK, 28 ]
	];

	for ( const [ mls, style ] of expected ) {

		const e = entity( { drawflags: mls } );
		const info = semantics.R_EntityLightInfo( e, 0, true );
		same( info.mode, 'style', 'MLS ' + mls + ' is a model light style' );
		same( info.style, style, 'MLS ' + mls + ' uses light style ' + style );
		same( semantics.R_EntityLightStyle( e ), style, 'R_EntityLightStyle ' + mls );

	}

	const abs = entity( { drawflags: semantics.MLS_ABSLIGHT | semantics.DRF_TRANSLUCENT, abslight: 128 } );
	const info = semantics.R_EntityLightInfo( abs, 0, true );
	same( info.mode, 'abslight', 'MLS_ABSLIGHT is the absolute light' );
	same( info.abslight, 128, 'the absolute light is the entity byte' );
	same( semantics.R_EntityLightStyle( abs ), - 1, 'the absolute light has no style' );

	// a Quake entity (the client defaults) samples the world light and draws no style
	const quake = entity();
	same( semantics.R_EntityLightInfo( quake ).mode, 'sample', 'an unset entity samples' );
	same( semantics.R_EntityLightStyle( quake ), - 1, 'an unset entity has no style' );
	same( semantics.R_EntityAlpha( quake ), 1, 'an unset entity is opaque' );

} );

Deno.test( 'SCALE_TYPE and SCALE_ORIGIN place a scaled model with the native 127.95 constant', () => {

	// geometries already carry v * scale + scale_origin, so the helper reports the extra per-axis factor and the
	// model-space origin shift native glTranslatef/glScalef applies
	const header = { scale: [ 0.5, 0.5, 1 ], scale_origin: [ 3, 4, 5 ] };

	const uniform = semantics.R_AliasScaleTransform(
		entity( { scale: 2, drawflags: semantics.SCALE_TYPE_UNIFORM | semantics.SCALE_ORIGIN_CENTER } ), header );
	near( uniform.scale[ 0 ], 2, 'uniform x' );
	near( uniform.scale[ 1 ], 2, 'uniform y' );
	near( uniform.scale[ 2 ], 2, 'uniform z' );
	near( uniform.offset[ 0 ], - 0.5 * 127.95, 'uniform centre x' );
	near( uniform.offset[ 1 ], - 0.5 * 127.95, 'uniform centre y' );
	near( uniform.offset[ 2 ], - 1 * 127.95, 'uniform centre z' );

	const bottom = semantics.R_AliasScaleTransform(
		entity( { scale: 2, drawflags: semantics.SCALE_TYPE_XYONLY | semantics.SCALE_ORIGIN_BOTTOM } ), header );
	near( bottom.scale[ 0 ], 2, 'xy-only x' );
	near( bottom.scale[ 1 ], 2, 'xy-only y' );
	near( bottom.scale[ 2 ], 1, 'xy-only z is unchanged' );
	near( bottom.offset[ 0 ], - 0.5 * 127.95, 'bottom x' );
	near( bottom.offset[ 1 ], - 0.5 * 127.95, 'bottom y' );
	near( bottom.offset[ 2 ], 0, 'bottom keeps its feet on the origin' );

	const top = semantics.R_AliasScaleTransform(
		entity( { scale: 2, drawflags: semantics.SCALE_TYPE_ZONLY | semantics.SCALE_ORIGIN_TOP } ), header );
	near( top.scale[ 0 ], 1, 'z-only x is unchanged' );
	near( top.scale[ 1 ], 1, 'z-only y is unchanged' );
	near( top.scale[ 2 ], 2, 'z-only z' );
	near( top.offset[ 0 ], - 0.5, 'top x uses the unchanged-axis term' );
	near( top.offset[ 1 ], - 0.5, 'top y uses the unchanged-axis term' );
	near( top.offset[ 2 ], - 1 * 127.95 * 2, 'top scales downward by twice the half-extent' );

	// native skips the whole transform at scale 0 or 100 (0 and 1.0 for Quaked's client entities)
	for ( const scale of [ 1, 0, undefined ] ) {

		const transform = semantics.R_AliasScaleTransform( entity( { scale, drawflags: 24 | 96 } ), header );
		same( transform.scale[ 0 ], 1, 'unscaled x' );
		same( transform.scale[ 1 ], 1, 'unscaled y' );
		same( transform.scale[ 2 ], 1, 'unscaled z' );
		same( transform.offset[ 0 ], 0, 'unscaled offset x' );
		same( transform.offset[ 1 ], 0, 'unscaled offset y' );
		same( transform.offset[ 2 ], 0, 'unscaled offset z' );

	}

} );

Deno.test( 'EF_FACE_VIEW looks at the viewer and reports yaw and pitch in degrees', () => {

	let facing = semantics.R_FaceViewAngles( entity( { origin: new Float32Array( [ 100, 0, 0 ] ) } ), [ 0, 0, 0 ] );
	near( facing.yaw, 180, 'looking down -x' );
	near( facing.pitch, 0, 'level' );

	facing = semantics.R_FaceViewAngles( entity(), [ 0, 100, 100 ] );
	near( facing.yaw, 90, 'looking down +y' );
	near( facing.pitch, 45, 'looking 45 degrees up' );

	facing = semantics.R_FaceViewAngles( entity( { origin: new Float32Array( [ 10, 10, 10 ] ) } ), [ 10, 11, 10 ] );
	near( facing.yaw, 90, 'one unit away' );
	near( facing.pitch, 0, 'one unit away level' );

} );

Deno.test( 'Hexen II samples alias lighting at the model mid-height and Quake at the origin', () => {

	const model = { mins: [ - 16, - 16, - 40 ], maxs: [ 16, 16, 24 ] };
	const e = entity( { origin: new Float32Array( [ 1, 2, 3 ] ) } );

	let point = semantics.R_AliasLightOrigin( e, model, false );
	same( point[ 0 ], 1, 'Quake samples x at the origin' );
	same( point[ 1 ], 2, 'Quake samples y at the origin' );
	same( point[ 2 ], 3, 'Quake samples z at the origin' );

	point = semantics.R_AliasLightOrigin( e, model, true );
	same( point[ 0 ], 1, 'Hexen samples x at the origin' );
	same( point[ 1 ], 2, 'Hexen samples y at the origin' );
	same( point[ 2 ], 3 + ( - 40 + 24 ) / 2, 'Hexen samples z at the middle of the model' );
	same( e.origin[ 2 ], 3, 'the entity origin is not moved' );

	// an alias model keeps its real frame-bounds centre, not its placeholder mins/maxs
	point = semantics.R_AliasLightOrigin( e, { mins: [ - 16, - 16, - 16 ], maxs: [ 16, 16, 16 ], cache: { data: { lightZCentre: 12 } } }, true );
	same( point[ 2 ], 15, 'an alias model uses its decoded frame-bounds centre' );

} );

Deno.test( 'model flags select the skin mode and its native blend state', () => {

	same( semantics.R_ModelSkinMode( 0 ), semantics.SKIN_MODE_DEFAULT, 'no flags: opaque' );
	same( semantics.R_ModelSkinMode( semantics.EF_TRANSPARENT ), semantics.SKIN_MODE_TRANSPARENT, 'EF_TRANSPARENT' );
	same( semantics.R_ModelSkinMode( semantics.EF_HOLEY ), semantics.SKIN_MODE_HOLEY, 'EF_HOLEY' );
	same( semantics.R_ModelSkinMode( semantics.EF_SPECIAL_TRANS ), semantics.SKIN_MODE_SPECIAL, 'EF_SPECIAL_TRANS' );
	same( semantics.R_ModelSkinMode( semantics.EF_TRANSPARENT | semantics.EF_HOLEY ), semantics.SKIN_MODE_TRANSPARENT,
		'EF_TRANSPARENT wins over EF_HOLEY' );

	const holey = new THREE.MeshLambertMaterial();
	same( semantics.R_ApplyModelSkinMode( holey, semantics.SKIN_MODE_HOLEY ), holey, 'the material is returned' );
	same( holey.transparent, true, 'a skin mode blends' );
	same( holey.side, THREE.FrontSide, 'EF_HOLEY keeps culling' );

	const special = new THREE.MeshLambertMaterial();
	semantics.R_ApplyModelSkinMode( special, semantics.SKIN_MODE_SPECIAL );
	same( special.side, THREE.DoubleSide, 'EF_SPECIAL_TRANS culls nothing' );
	same( special.blending, THREE.CustomBlending, 'EF_SPECIAL_TRANS uses its own blend' );
	same( special.blendSrc, THREE.OneMinusSrcAlphaFactor, 'native GL_ONE_MINUS_SRC_ALPHA source factor' );
	same( special.blendDst, THREE.SrcAlphaFactor, 'native GL_SRC_ALPHA destination factor' );

	const opaque = new THREE.MeshLambertMaterial();
	semantics.R_ApplyModelSkinMode( opaque, semantics.SKIN_MODE_DEFAULT );
	same( opaque.transparent, false, 'the default mode changes nothing' );

	// the enhanced pipeline keeps its own blend state (its imported art carries the alpha); only blending is forced
	const enhanced = new THREE.MeshLambertMaterial();
	semantics.R_ApplyModelSkinMode( enhanced, semantics.SKIN_MODE_SPECIAL, true );
	same( enhanced.transparent, true, 'an enhanced skin still blends' );
	same( enhanced.blending, THREE.NormalBlending, 'the enhanced pipeline keeps its blend' );
	same( enhanced.side, THREE.FrontSide, 'the enhanced pipeline keeps its culling' );

} );

Deno.test( 'skin-mode pixel conversion matches GL_Upload8', () => {

	// a synthetic palette whose channels all equal the index
	const table = new Uint32Array( 256 );
	for ( let i = 0; i < 256; i ++ ) table[ i ] = i | ( i << 8 ) | ( i << 16 );

	let texel = gl_draw.GL_SkinTexel( 0, semantics.SKIN_MODE_HOLEY, 1, table );
	same( texel[ 3 ], 0, 'EF_HOLEY clears index 0' );
	same( texel[ 0 ], 0, 'EF_HOLEY keeps index 0\'s colour for the fringe' );
	texel = gl_draw.GL_SkinTexel( 7, semantics.SKIN_MODE_HOLEY, 1, table );
	same( texel[ 3 ], 255, 'EF_HOLEY leaves any other texel opaque' );

	texel = gl_draw.GL_SkinTexel( 0, semantics.SKIN_MODE_TRANSPARENT, 0.33, table );
	same( texel[ 3 ], 0, 'EF_TRANSPARENT clears index 0' );
	texel = gl_draw.GL_SkinTexel( 3, semantics.SKIN_MODE_TRANSPARENT, 0.33, table );
	same( texel[ 3 ], ( 255 * 0.33 ) & 0xff, 'EF_TRANSPARENT makes odd texels r_wateralpha' );
	texel = gl_draw.GL_SkinTexel( 4, semantics.SKIN_MODE_TRANSPARENT, 0.33, table );
	same( texel[ 3 ], 255, 'EF_TRANSPARENT leaves even texels opaque' );

	texel = gl_draw.GL_SkinTexel( 0x2a, semantics.SKIN_MODE_SPECIAL, 1, table );
	same( texel[ 0 ], gl_draw.HX_COLOR_INDEX[ 2 ], 'EF_SPECIAL_TRANS takes the high nibble\'s colour row' );
	same( texel[ 3 ], gl_draw.HX_COLOR_PERCENT[ 10 ], 'EF_SPECIAL_TRANS takes the low nibble\'s opacity' );

	const rgba = gl_draw.GL_ConvertSkinPixels( new Uint8Array( [ 0, 1, 2, 3 ] ), 2, 2,
		semantics.SKIN_MODE_DEFAULT, 1, table );
	same( rgba.length, 16, 'one RGBA quad per texel' );
	same( rgba[ 3 ], 255, 'the default mode is opaque' );
	same( rgba[ 4 ], 1, 'the default mode copies the palette colour' );

} );

Deno.test( 'DRF_TRANSLUCENT and MLS_ABSLIGHT give an entity its own material style', () => {

	const oldWater = glquake.r_wateralpha.value;
	const oldString = glquake.r_wateralpha.string;
	try {

		glquake.r_wateralpha.value = 0.33;
		const translucent = entity( { drawflags: semantics.DRF_TRANSLUCENT } );
		const style = semantics.R_EntityMaterialStyle( translucent );
		same( style.translucent, true, 'DRF_TRANSLUCENT is a see-through entity' );
		near( style.alpha, 0.33, 'DRF_TRANSLUCENT uses r_wateralpha' );
		same( style.intensity, 1, 'no absolute light' );

		const material = new THREE.MeshLambertMaterial();
		semantics.R_ApplyEntityMaterialStyle( material, style );
		same( material.transparent, true, 'the clone blends' );
		near( material.opacity, 0.33, 'the clone is at r_wateralpha' );
		same( material.depthWrite, false, 'a see-through clone leaves depth to what is behind it' );

		const dark = semantics.R_EntityMaterialStyle( entity( { drawflags: semantics.MLS_ABSLIGHT, abslight: 128 } ) );
		same( dark.translucent, false, 'the absolute light alone is opaque' );
		near( dark.intensity, 128 / 255, 'MLS_ABSLIGHT scales by abslight/255' );

		// a Quake entity (drawflags 0, abslight 0) keeps the plain style
		const quake = semantics.R_EntityMaterialStyle( entity() );
		same( quake.translucent, false, 'a Quake entity is opaque' );
		same( quake.alpha, 1, 'a Quake entity is at alpha 1' );
		same( quake.intensity, 1, 'a Quake entity is unmodulated' );

	} finally {

		glquake.r_wateralpha.value = oldWater;
		glquake.r_wateralpha.string = oldString;

	}

} );

Deno.test( 'the light-style rate prefix selects 10/20/30 Hz for Hexen strings only', () => {

	const oldStyles = cl.cl_lightstyle;
	const oldTime = cl.time;
	const styles = new Array( 64 ).fill( null );
	for ( let i = 0; i < 64; i ++ ) styles[ i ] = { length: 0, map: '' };
	try {

		styles[ 0 ] = { length: 3, map: '1az' }; // 20 Hz? no: '1' is 10 Hz, then "az"
		styles[ 1 ] = { length: 3, map: '2az' };
		styles[ 2 ] = { length: 3, map: '3az' };
		styles[ 3 ] = { length: 2, map: 'az' };
		styles[ 4 ] = { length: 1, map: '1' }; // a bad native definition: normal light
		cl.cl_lightstyle = styles;
		cl.time = 0.15;

		GameProfile_Set( 'hexen2' );
		gl_rlight.R_AnimateLight( cl, styles );
		// 10 Hz at t=0.15 steps once: '1az' index 1 % 2 = 1 -> 'z' = (122-97)*22
		same( glquake.d_lightstylevalue[ 0 ], ( 'z'.charCodeAt( 0 ) - 97 ) * 22, '10 Hz prefix' );
		// 20 Hz steps three times: 3 % 2 = 1 -> 'z'
		same( glquake.d_lightstylevalue[ 1 ], ( 'z'.charCodeAt( 0 ) - 97 ) * 22, '20 Hz prefix' );
		// 30 Hz steps four times: 4 % 2 = 0 -> 'a' = 0
		same( glquake.d_lightstylevalue[ 2 ], 0, '30 Hz prefix' );
		// no prefix: 10 Hz over the whole two-character cycle, index 1 -> 'z'
		same( glquake.d_lightstylevalue[ 3 ], ( 'z'.charCodeAt( 0 ) - 97 ) * 22, 'no prefix' );
		same( glquake.d_lightstylevalue[ 4 ], 256, 'a one-character rate prefix is normal light' );

		// a Quake session reads the same string as an ordinary style, never as a rate
		GameProfile_Set( 'quake' );
		gl_rlight.R_AnimateLight( cl, styles );
		same( glquake.d_lightstylevalue[ 0 ], 0, 'Quake treats the leading digit as a normal character' );

	} finally {

		GameProfile_Set( 'quake' );
		cl.cl_lightstyle = oldStyles;
		cl.time = oldTime;

	}

} );

Deno.test( 'Hexen liquids are translucent only for *rtex078 and *lowlight', () => {

	const oldWater = glquake.r_wateralpha.value;
	try {

		glquake.r_wateralpha.value = 0.33;
		GameProfile_Set( 'hexen2' );
		near( gl_rsurf_liquids.R_LiquidAlpha( { name: '*rtex078' } ), 0.33, '*rtex078 is always translucent' );
		near( gl_rsurf_liquids.R_LiquidAlpha( { name: '*lowlight1' } ), 0.33, '*lowlight is always translucent' );
		same( gl_rsurf_liquids.R_LiquidAlpha( { name: '*water1' } ), 1, 'ordinary Hexen water is opaque' );
		same( gl_rsurf_liquids.R_LiquidAlpha( { name: '*black' } ), 1, '*BLACK is an opaque vis-breaker' );

		GameProfile_Set( 'quake' );
		near( gl_rsurf_liquids.R_LiquidAlpha( { name: '*water1' } ), 0.33, 'Quake water still uses r_wateralpha' );

	} finally {

		GameProfile_Set( 'quake' );
		glquake.r_wateralpha.value = oldWater;

	}

} );

Deno.test( 'Hexen II player skins translate from gfx/player.lmp per class', () => {

	// a synthetic player.lmp: 256 bytes header, then class blocks of 2 masks + 14 colour rows of 256
	const file = new Uint8Array( 10752 );
	for ( let i = 0; i < file.length; i ++ ) file[ i ] = 255; // 255 means "leave this index alone"
	// class 1 (paladin) at offset 2*14*256: shirts are palette index 20 and pants index 21
	const classOffset = 256 + 2 * 14 * 256;
	for ( let i = 0; i < 256; i ++ ) {

		file[ classOffset + i ] = i === 20 ? 0 : 255; // colorA: only index 20 is a shirt texel
		file[ classOffset + 256 + i ] = i === 21 ? 0 : 255; // colorB: only index 21 is a pants texel

	}
	// top colour row 0 (the player's colour 1 -> top-1 = 0) at colorB + 256
	const sourceA = classOffset + 512;
	const sourceB = sourceA + 256;
	file[ sourceA + 20 ] = 100;
	file[ sourceB + 21 ] = 101;

	let translate = gl_rmisc.Hexen2_TranslatePlayerSkinIndices( { colors: 0x12, playerclass: 1 }, file );
	same( translate[ 20 ], 100, 'the shirt texel takes the top colour' );
	same( translate[ 21 ], 101, 'the pants texel takes the bottom colour' );
	same( translate[ 19 ], 19, 'an unmasked index is unchanged' );

	// colour 0 means no translation at all (native top -= 1 leaves a negative row)
	translate = gl_rmisc.Hexen2_TranslatePlayerSkinIndices( { colors: 0x00, playerclass: 1 }, file );
	same( translate[ 20 ], 20, 'no colours leaves every index alone' );

	// a broken or absent file is the identity
	translate = gl_rmisc.Hexen2_TranslatePlayerSkinIndices( { colors: 0x12, playerclass: 1 }, null );
	same( translate[ 20 ], 20, 'a missing player.lmp leaves every index alone' );

} );

Deno.test( 'a DRF_TRANSLUCENT alias entity gets its own material, not the shared one', () => {

	const oldWater = glquake.r_wateralpha.value;
	try {

		glquake.r_wateralpha.value = 0.33;
		const base = new THREE.MeshLambertMaterial( { map: null } );
		const mesh = new THREE.Mesh( new THREE.BufferGeometry(), base );
		const translucent = entity( { drawflags: semantics.DRF_TRANSLUCENT, model: { flags: 0 } } );
		gl_rmain.R_ApplyAliasEntityRenderState( mesh, translucent );
		check( mesh.material !== base, 'the entity does not share the base material' );
		same( mesh.material.transparent, true, 'the entity material blends' );
		near( mesh.material.opacity, 0.33, 'the entity material is at r_wateralpha' );
		same( base.transparent, false, 'the shared material is untouched' );
		same( base.opacity, 1, 'the shared material keeps its opacity' );

		// an enhanced material's shader hooks travel to the clone (the post chain keeps drawing it)
		const hooked = new THREE.MeshLambertMaterial();
		hooked.onBeforeCompile = function () {};
		hooked.customProgramCacheKey = function () { return 'u6-hooked'; };
		const hookedMesh = new THREE.Mesh( new THREE.BufferGeometry(), hooked );
		gl_rmain.R_ApplyAliasEntityRenderState( hookedMesh, entity( { drawflags: semantics.DRF_TRANSLUCENT, model: { flags: 0 } } ) );
		same( hookedMesh.material.onBeforeCompile, hooked.onBeforeCompile, 'the clone keeps onBeforeCompile' );
		same( hookedMesh.material.customProgramCacheKey(), 'u6-hooked', 'the clone keeps the program key' );

		// the same entity keeps its clone (no per-frame allocation), a different alpha rebuilds it
		const first = mesh.material;
		gl_rmain.R_ApplyAliasEntityRenderState( mesh, translucent );
		same( mesh.material, first, 'the clone is reused while the alpha is the same' );
		glquake.r_wateralpha.value = 0.5;
		gl_rmain.R_ApplyAliasEntityRenderState( mesh, translucent );
		check( mesh.material !== first, 'a changed alpha makes a new clone' );
		near( mesh.material.opacity, 0.5, 'the new clone takes the new alpha' );

		// a Quake entity (drawflags 0) keeps the material it was given
		const quakeBase = new THREE.MeshLambertMaterial();
		const quakeMesh = new THREE.Mesh( new THREE.BufferGeometry(), quakeBase );
		gl_rmain.R_ApplyAliasEntityRenderState( quakeMesh, entity( { model: { flags: 0 } } ) );
		same( quakeMesh.material, quakeBase, 'a Quake entity keeps its material' );

	} finally {

		glquake.r_wateralpha.value = oldWater;

	}

} );

Deno.test( 'DRF_TRANSLUCENT and MLS_ABSLIGHT clone a brush entity\'s materials', () => {

	const oldWater = glquake.r_wateralpha.value;
	try {

		glquake.r_wateralpha.value = 0.33;
		const base = new THREE.MeshLambertMaterial();
		const group = new THREE.Group();
		const child = new THREE.Mesh( new THREE.BufferGeometry(), base );
		child.userData.baseMaterial = base;
		group.add( child );

		const translucent = entity( { drawflags: semantics.DRF_TRANSLUCENT } );
		gl_rsurf_brush.R_ApplyBrushEntityRenderState( translucent, group );
		check( child.material !== base, 'the brush entity gets its own material' );
		near( child.material.opacity, 0.33, 'the brush entity is at r_wateralpha' );
		same( base.opacity, 1, 'the shared brush material is untouched' );

		const abslight = entity( { drawflags: semantics.MLS_ABSLIGHT, abslight: 128 } );
		gl_rsurf_brush.R_ApplyBrushEntityRenderState( abslight, group );
		near( child.material.color.r, 128 / 255, 'MLS_ABSLIGHT scales the brush material\'s colour' );
		same( child.material.transparent, false, 'the absolute light alone does not blend' );

		// an entity back at the defaults gets the shared material again
		gl_rsurf_brush.R_ApplyBrushEntityRenderState( entity( { drawflags: 0 } ), group );
		same( child.material, base, 'a default entity uses the shared brush material' );

	} finally {

		glquake.r_wateralpha.value = oldWater;

	}

} );

Deno.test( 'the supplied Hexen II class models load with their skin mode and raw texels', async () => {

	const { existsSync, readFileSync } = await import( 'node:fs' );
	const pak = await import( '../src/engine/common/pak.js' );
	const { VID_SetPalette } = await import( '../src/engine/render/vid.js' );
	const { Mod_Init, Mod_ForName } = await import( '../src/engine/render/gl_model.js' );
	const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
	if ( ! existsSync( HEXEN + '/pak0.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }

	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const path = HEXEN + '/' + name;
		if ( ! existsSync( path ) ) continue;
		const raw = readFileSync( path );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-u6-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	gl_model_alias.Hexen2_ResetPlayerClassTexels();

	const paladin = Mod_ForName( 'models/paladin.mdl', true );
	same( paladin.type, 2, 'paladin is an alias model' );
	const classSkin = gl_model_alias.Hexen2_PlayerClassTexels( 1 );
	check( classSkin != null, 'the paladin skin was kept for the class translation' );
	same( classSkin.data, paladin.cache.data.texels[ 0 ], 'the kept skin is the model header\'s raw texels' );
	same( classSkin.width, paladin.cache.data.skinwidth, 'the kept skin width' );
	same( classSkin.height, paladin.cache.data.skinheight, 'the kept skin height' );
	check( Number.isFinite( paladin.cache.data.lightZCentre ) && paladin.cache.data.lightZCentre !== 0,
		'the Hexen II model kept its real frame-bounds lighting centre: ' + paladin.cache.data.lightZCentre );

	// the real gfx/player.lmp is the native class mask/colour table layout
	gl_rmisc.Hexen2_SetPlayerTranslation( null );
	const player = gl_rmisc.Hexen2_PlayerTranslation();
	check( player != null, 'gfx/player.lmp is in the supplied installation' );
	same( player.length, 10752, 'the native player.lmp size' );
	const translate = gl_rmisc.Hexen2_TranslatePlayerSkinIndices( { colors: 0x12, playerclass: 1 }, player );
	same( translate.length, 256, 'a full palette translation' );
	let changed = 0;
	for ( let i = 0; i < 256; i ++ ) if ( translate[ i ] !== i ) changed ++;
	check( changed > 0, 'the paladin\'s shirt and pants texels are recoloured' );

} );

Deno.test( 'a scaled Hexen alias entity reaches the mesh as scale and native origin offset', async () => {

	const { existsSync, readFileSync } = await import( 'node:fs' );
	const pak = await import( '../src/engine/common/pak.js' );
	const { VID_SetPalette } = await import( '../src/engine/render/vid.js' );
	const { Mod_Init, Mod_ForName } = await import( '../src/engine/render/gl_model.js' );
	const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
	if ( ! existsSync( HEXEN + '/pak0.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }

	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const path = HEXEN + '/' + name;
		if ( ! existsSync( path ) ) continue;
		const raw = readFileSync( path );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-u6-mesh-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const model = Mod_ForName( 'models/paladin.mdl', true );
	const header = model.cache.data;

	const origin = new Float32Array( [ 10, 20, 30 ] );
	const plain = entity( { model, frame: 0, origin, angles: new Float32Array( [ 0, 0, 0 ] ) } );
	const plainMesh = gl_mesh.R_DrawAliasModel( plain, header, null );
	check( plainMesh != null, 'the unscaled model drew' );
	near( plainMesh.scale.x, 1, 'an unscaled entity is not scaled' );
	near( plainMesh.position.x, 10, 'an unscaled entity sits at its origin' );
	near( plainMesh.position.y, 20, 'an unscaled entity sits at its origin' );
	near( plainMesh.position.z, 30, 'an unscaled entity sits at its origin' );

	const scaled = entity( {
		model, frame: 0, origin, angles: new Float32Array( [ 0, 0, 0 ] ), scale: 2,
		drawflags: semantics.SCALE_TYPE_UNIFORM | semantics.SCALE_ORIGIN_CENTER
	} );
	const scaledMesh = gl_mesh.R_DrawAliasModel( scaled, header, null );
	check( scaledMesh != null, 'the scaled model drew' );
	near( scaledMesh.scale.x, 2, 'the uniform scale reaches the mesh' );
	near( scaledMesh.scale.y, 2, 'the uniform scale reaches the mesh' );
	near( scaledMesh.scale.z, 2, 'the uniform scale reaches the mesh' );
	near( scaledMesh.position.x, 10 - header.scale[ 0 ] * 127.95, 'the centred x offset' );
	near( scaledMesh.position.y, 20 - header.scale[ 1 ] * 127.95, 'the centred y offset' );
	near( scaledMesh.position.z, 30 - header.scale[ 2 ] * 127.95, 'the centred z offset' );

	// EF_FACE_VIEW turns the model to the viewer with R_RotateForEntity2's yaw and pitch
	const view = await import( '../src/engine/render/render.js' );
	const oldView = new Float32Array( view.r_origin );
	const oldFlags = model.flags;
	try {

		view.r_origin[ 0 ] = 10; view.r_origin[ 1 ] = 120; view.r_origin[ 2 ] = 30;
		model.flags = oldFlags | semantics.EF_FACE_VIEW;
		const facing = entity( { model, frame: 0, origin, angles: new Float32Array( [ 0, 0, 0 ] ) } );
		const facingMesh = gl_mesh.R_DrawAliasModel( facing, header, null );
		const yaw = 90 * Math.PI / 180;
		const expected = new THREE.Quaternion().setFromRotationMatrix(
			new THREE.Matrix4().makeRotationZ( yaw ) );
		check( Math.abs( facingMesh.quaternion.dot( expected ) ) > 0.9999, 'the model turns its +x toward the viewer' );

	} finally {

		model.flags = oldFlags;
		view.r_origin.set( oldView );

	}

} );
