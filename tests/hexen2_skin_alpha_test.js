// Model-loader to draw-material coverage: a valid tiny MDL with single or grouped skins.
// Unlike a converter-only test this catches the GL_LoadTexture argument contract.
await import( '../src/engine/render/gl_rsurf.js' );
const { COM_AddPack, COM_BuildPack, COM_LoadPackFile } = await import( '../src/engine/common/pak.js' );
const { Mod_ForName, Mod_Init } = await import( '../src/engine/render/gl_model.js' );
const { R_DrawAliasModel } = await import( '../src/engine/render/gl_mesh.js' );
const { entity_t } = await import( '../src/engine/render/render.js' );
const { GameProfile_Set } = await import( '../src/engine/common/game_profile.js' );
const { R_AnimSetNewer } = await import( '../src/newer/mode.js' );
const { R_ClassicMaterial } = await import( '../src/newer/render/r_classicstate.js' );
const { R_ClassicTexture } = await import( '../src/newer/render/r_newertextures.js' );
const { r_wateralpha } = await import( '../src/engine/render/glquake.js' );
Mod_Init();
const s = await import( '../src/engine/render/gl_entity_semantics.js' );
const { skinModel } = await import( './helpers/skin_model.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

for ( const grouped of [ false, true ] ) for ( const flag of [ s.EF_HOLEY, s.EF_TRANSPARENT, s.EF_SPECIAL_TRANS, 0 ] ) {

	Deno.test( `alias skin alpha survives loading and both render paths: flags=${flag}, group=${grouped}`, () => {

		const oldWater = r_wateralpha.value;
		GameProfile_Set( flag ? 'hexen2' : 'quake' );
		r_wateralpha.value = 0.33;
		try {

			const name = `models/tr-${flag}-${grouped}.mdl`;
			COM_AddPack( COM_LoadPackFile( name, COM_BuildPack( [ { name, data: new Uint8Array( skinModel( flag, grouped ) ) } ] ) ) );
			const model = Mod_ForName( name, true );
			const header = model.cache.data;
			for ( const texture of header.gl_texturenum[ 0 ] ) {

				const rgba = texture.image.data;
				for ( let i = 0; i < 4; i ++ ) {

					const expected = s.R_ModelSkinMode( flag ) === s.SKIN_MODE_DEFAULT ? 255 :
						s.R_ModelSkinMode( flag ) === s.SKIN_MODE_SPECIAL ? [ 25, 51, 76, 102 ][ i ] :
						i === 0 ? 0 : flag === s.EF_TRANSPARENT && i % 2 ? 84 : 255;
					check( rgba[ i * 4 + 3 ] === expected, `texel ${i} alpha: ${rgba[ i * 4 + 3 ]} != ${expected}` );

				}
				check( ! texture._fullbright, 'skin modes do not split fullbright' );

			}
			for ( const newer of [ false, true ] ) {

				R_AnimSetNewer( newer );
				const e = new entity_t(); e.model = model;
				const mesh = R_DrawAliasModel( e, header, null );
				check( mesh.material.map === header.gl_texturenum[ 0 ][ 0 ], 'the drawn material retains the loaded skin' );
				check( mesh.material.transparent === !! flag, 'only native skin modes blend' );
				check( mesh.material.alphaTest === 0, 'fractional alpha is retained' );
				const classic = R_ClassicMaterial( mesh.material, R_ClassicTexture );
				check( classic.map.image.data === mesh.material.map.image.data && classic.transparent === !! flag, 'split Classic keeps alpha and blend' );

			}

		} finally { r_wateralpha.value = oldWater; R_AnimSetNewer( false ); GameProfile_Set( 'quake' ); }

	} );

}

Deno.test( 'installed Hexen skin-mode models preserve native alpha through their real material', async () => {

	const { existsSync, readFileSync } = await import( 'node:fs' );
	const pak = await import( '../src/engine/common/pak.js' );
	const { VID_SetPalette } = await import( '../src/engine/render/vid.js' );
	const { HX_COLOR_PERCENT } = await import( '../src/engine/render/gl_draw.js' );
	const root = '/Users/bri/quaked/Hexen 2/data1';
	if ( ! existsSync( root + '/pak0.pak' ) || ! existsSync( root + '/pak1.pak' ) ) {

		console.log( 'SKIP: installed Hexen II retail packs are absent' ); return;

	}
	const names = new Set();
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const bytes = readFileSync( root + '/' + name );
		const pack = pak.COM_LoadPackFile( 'tr-owned-' + name, bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) );
		pak.COM_AddPack( pack );
		for ( const f of pack.files ) if ( f.name.endsWith( '.mdl' ) ) names.add( f.name );

	}
	VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
	const oldWater = r_wateralpha.value;
	GameProfile_Set( 'hexen2' ); r_wateralpha.value = 0.33;
	let models = 0, texels = 0, holes = 0, actualHoles = 0, alphaMismatches = 0;
	let firstMismatch = null;
	try {

		for ( const name of names ) {

			const source = pak.COM_FindFile( name ).data;
			const v = new DataView( source.buffer, source.byteOffset, source.byteLength );
			const flags = v.getInt32( 76, true ), mode = s.R_ModelSkinMode( flags );
			if ( mode === s.SKIN_MODE_DEFAULT ) continue;
			models ++;
			const model = Mod_ForName( name, true ), header = model.cache.data;
			const size = header.skinwidth * header.skinheight;
			let at = v.getInt32( 4, true ) === 50 ? 88 : 84;
			for ( let skin = 0; skin < header.numskins; skin ++ ) {

				const grouped = v.getInt32( at, true ); at += 4;
				const count = grouped ? v.getInt32( at, true ) : 1;
				if ( grouped ) at += 4 + count * 4;
				for ( let frame = 0; frame < count; frame ++ ) {

					// Flood filling is native preprocessing; single skins retain its resulting indices.
					const indices = ! grouped || frame === 0 ? header.texels[ skin ] : source.subarray( at, at + size ); at += size;
					// Groups keep the last frame in each of four native animation slots.
					if ( frame + 4 < count ) continue;
					const texture = header.gl_texturenum[ skin ][ frame & 3 ];
					for ( let p = 0; p < size; p ++ ) {

						const index = indices[ p ];
						const alpha = mode === s.SKIN_MODE_SPECIAL ? HX_COLOR_PERCENT[ index & 15 ] :
							index === 0 ? 0 : mode === s.SKIN_MODE_TRANSPARENT && ( index & 1 ) ? 84 : 255;
						const actual = texture.image.data[ p * 4 + 3 ];
						if ( actual !== alpha ) {

							alphaMismatches ++;
							firstMismatch ??= `${name} skin ${skin} frame ${frame} texel ${p}: alpha ${actual} != ${alpha}`;

						}
						if ( actual === 0 ) actualHoles ++;
						texels ++; if ( alpha === 0 ) holes ++;

					}

				}
				for ( const newer of [ false, true ] ) {

					R_AnimSetNewer( newer );
					const e = new entity_t(); e.model = model; e.skinnum = skin;
					const mesh = R_DrawAliasModel( e, header, null );
					check( mesh.material.map === header.gl_texturenum[ skin ][ 0 ], name + ': native map retained' );
					check( mesh.material.transparent && mesh.material.alphaTest === 0, name + ': fractional alpha blends' );
					const classic = R_ClassicMaterial( mesh.material, R_ClassicTexture );
					check( classic.map.image.data === mesh.material.map.image.data && classic.transparent, name + ': split Classic retains alpha' );

				}

			}

		}
		check( models > 0 && holes > 0, 'real skin-mode models and zero-alpha texels were checked' );
		console.log( `OWNED: ${models} models, ${texels} texels, ${holes} expected holes, ${actualHoles} actual holes, ${alphaMismatches} alpha mismatches` );
		check( alphaMismatches === 0, `${alphaMismatches} alpha mismatches; first: ${firstMismatch}` );

	} finally { r_wateralpha.value = oldWater; R_AnimSetNewer( false ); GameProfile_Set( 'quake' ); }

} );

Deno.test( 'sprites keep index 255 clear and index 0 opaque in Classic, Enhanced and split Classic', async () => {

	const { cl_visedicts, cl_numvisedicts, set_cl_numvisedicts } = await import( '../src/engine/client/client.js' );
	const { R_DrawEntitiesOnList } = await import( '../src/engine/render/gl_rmain.js' );
	const oldCount = cl_numvisedicts, oldFirst = cl_visedicts[ 0 ];
	// A single 2x2 sprite frame through Mod_ForName, rather than a hand-built material.
	const data = new Uint8Array( 60 ), v = new DataView( data.buffer );
	for ( const [ p, n ] of [ [ 0, 0x50534449 ], [ 4, 1 ], [ 16, 2 ], [ 20, 2 ], [ 24, 1 ], [ 48, 2 ], [ 52, 2 ] ] ) v.setInt32( p, n, true );
	data.set( [ 255, 0, 1, 2 ], 56 );
	COM_AddPack( COM_LoadPackFile( 'tr-sprite', COM_BuildPack( [ { name: 'models/tr-alpha.spr', data } ] ) ) );
	const model = Mod_ForName( 'models/tr-alpha.spr', true );
	try {

		for ( const profile of [ 'quake', 'hexen2' ] ) for ( const newer of [ false, true ] ) {

			GameProfile_Set( profile );
			R_AnimSetNewer( newer );
			const e = new entity_t(); e.model = model;
			cl_visedicts[ 0 ] = e; set_cl_numvisedicts( 1 );
			R_DrawEntitiesOnList();
			const material = e._spriteMesh.material;
			check( material.map.image.data[ 3 ] === 0 && material.map.image.data[ 7 ] === 255, 'only index 255 is clear' );
			check( material.transparent && material.alphaTest === 0.5, 'sprite blend and cutout stay intact' );
			const classic = R_ClassicMaterial( material, R_ClassicTexture );
			check( classic.map.image.data === material.map.image.data && classic.transparent, 'split Classic keeps sprite alpha and blending' );

		}

	} finally { cl_visedicts[ 0 ] = oldFirst; set_cl_numvisedicts( oldCount ); R_AnimSetNewer( false ); GameProfile_Set( 'quake' ); }

} );
