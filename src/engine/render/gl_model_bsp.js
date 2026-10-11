/**
 * @module engine/render/gl_model_bsp
 *
 * The BSP map loader (card [44k], split from gl_model.js; WinQuake gl_model.c): a map's lumps (textures, lighting
 * with its .lit colours, visibility, entities, vertices, edges, planes, texinfo, faces, nodes, leafs, clipnodes and
 * hulls, marksurfaces, submodels) in the version 29, BSP2 and 2PSB layouts, its inline models, the sky, and Newer
 * Game's crate variants.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `mod_base`, `bspWide`, `bspFloatBounds`.
 *
 * Errors: calls `Sys_Error` (fatal) at 31 places.
 *
 * `Mod_LoadBrushModel` is called by `Mod_LoadModel` (gl_model.js) for a map's bytes.
 */
import { Sys_Error } from '../common/sys.js';
import { d_8to24table } from './vid.js';
import { COM_FindFile } from '../common/pak.js';
import { Lit_Parse, Ent_Parse } from './lit.js';
import { VectorCopy, Length } from '../common/mathlib.js';
import { R_InitSky as R_InitSky_warp, GL_SubdivideSurface as GL_SubdivideSurface_warp, GL_Warp_SetLoadmodel } from './gl_warp.js';
import { BSPVERSION, LUMP_ENTITIES, LUMP_PLANES, LUMP_TEXTURES, LUMP_VERTEXES, LUMP_VISIBILITY, LUMP_NODES, LUMP_TEXINFO, LUMP_FACES, LUMP_LIGHTING, LUMP_CLIPNODES, LUMP_LEAFS, LUMP_MARKSURFACES, LUMP_EDGES, LUMP_SURFEDGES, LUMP_MODELS, HEADER_LUMPS, MAX_MAP_HULLS, CONTENTS_EMPTY, MIPLEVELS, MAXLIGHTMAPS, TEX_SPECIAL } from '../common/bspfile.js';
import { R_NewerTextureUpgrade } from '../common/hooks.js'; // installed by newer/render/r_newertextures.js
import { R_NewerGame, r_newer_textures, r_newer_crates } from '../common/hooks.js'; // installed by newer/mode.js
import { R_IsCrateSide, R_CratePlan } from '../common/hooks.js';
import { SURF_PLANEBACK, SURF_DRAWSKY, SURF_DRAWTURB, SURF_DRAWTILED, SURF_UNDERWATER, mod_brush, mvertex_t, mplane_t, texture_t, medge_t, mtexinfo_t, msurface_t, mnode_t, mleaf_t, dclipnode_t, dmodel_t } from './gl_model_types.js';
import { set_solidskytexture, set_alphaskytexture, loadmodel, set_loadmodel, r_notexture_mip, GL_LoadTexture, previewLoad, Mod_FindName, readString, RadiusFromBounds } from './gl_model_common.js';

// mod_base: Uint8Array - the raw file bytes of the BSP currently being loaded
let mod_base = null;
// BSP2 layouts follow QuakeSpasm Quake/bspfile.h (32-bit indices).
let bspWide=false,bspFloatBounds=false;

function GL_SubdivideSurface( s ) {

	GL_Warp_SetLoadmodel( loadmodel );
	GL_SubdivideSurface_warp( s );

}

function R_InitSky( tx ) {

	// Sky texture is 256*128, split into solid (right half) and alpha (left half)
	// tx.pixels starts at mip level 0 data, tx.offsets[0] is offset from miptex header
	const mt = {
		data: tx.pixels,
		offsets: [ 0 ] // pixels already starts at the texture data
	};
	const result = R_InitSky_warp( mt, d_8to24table );
	if ( loadmodel != null ) {

		loadmodel._threeTextures.add( result.solidTexture );
		loadmodel._threeTextures.add( result.alphaTexture );

	}
	// a level loaded only to be looked at must not replace the sky of the one being played
	if ( loadmodel != null ) {

		loadmodel._skySolid = result.solidTexture;
		loadmodel._skyAlpha = result.alphaTexture;

	}

	if ( previewLoad === false ) {

		set_solidskytexture( result.solidTexture );
		set_alphaskytexture( result.alphaTexture );

	}

}

// ============================================================================
//
//                     BRUSHMODEL LOADING
//
// ============================================================================

// On-disk structure sizes (must match the BSP file layout)
const SIZEOF_DVERTEX = 12;			// 3 floats
const SIZEOF_DEDGE = 4;			// 2 unsigned shorts
const SIZEOF_DFACE = 20;			// short planenum, short side, int firstedge, short numedges, short texinfo, byte styles[4], int lightofs
const SIZEOF_DNODE = 24;			// int planenum, short children[2], short mins[3], short maxs[3], unsigned short firstface, unsigned short numfaces
const SIZEOF_DLEAF = 28;			// int contents, int visofs, short mins[3], short maxs[3], unsigned short firstmarksurface, unsigned short nummarksurfaces, byte ambient_level[4]
const SIZEOF_DCLIPNODE = 8;		// int planenum, short children[2]
const SIZEOF_TEXINFO = 40;			// float vecs[2][4], int miptex, int flags
const SIZEOF_DPLANE = 20;			// float normal[3], float dist, int type
const SIZEOF_DMODEL = 64;			// float mins[3], maxs[3], origin[3], int headnode[4], int visleafs, int firstface, int numfaces

// ============================================================================
// Mod_LoadTextures
// ============================================================================

function Mod_LoadTextures( fileofs, filelen ) {

	if ( filelen === 0 ) {

		loadmodel.textures = null;
		return;

	}

	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );

	const nummiptex = view.getInt32( 0, true );

	loadmodel.numtextures = nummiptex;
	loadmodel.textures = new Array( nummiptex );

	for ( let i = 0; i < nummiptex; i ++ ) {

		const dataofs = view.getInt32( 4 + i * 4, true );
		if ( dataofs === - 1 ) {

			loadmodel.textures[ i ] = null;
			continue;

		}

		// miptex_t at mod_base + fileofs + dataofs
		const mtOfs = fileofs + dataofs;
		const mtView = new DataView( mod_base.buffer, mod_base.byteOffset + mtOfs );

		const name = readString( mod_base, mtOfs, 16 );
		const width = mtView.getUint32( 16, true );
		const height = mtView.getUint32( 20, true );
		const offsets = [];
		for ( let j = 0; j < MIPLEVELS; j ++ )
			offsets[ j ] = mtView.getUint32( 24 + j * 4, true );

		if ( ( width & 15 ) || ( height & 15 ) )
			Sys_Error( 'Texture ' + name + ' is not 16 aligned' );

		const pixels = ( width * height / 64 ) * 85;

		const tx = new texture_t();
		loadmodel.textures[ i ] = tx;

		tx.name = name;
		tx.width = width;
		tx.height = height;
		for ( let j = 0; j < MIPLEVELS; j ++ )
			tx.offsets[ j ] = offsets[ j ];

		// Copy the pixel data (follows the miptex header in the file)
		// miptex header size is 16 (name) + 4 (width) + 4 (height) + 4*4 (offsets) = 40
		const SIZEOF_MIPTEX = 40;
		tx.pixels = new Uint8Array( pixels );
		for ( let j = 0; j < pixels; j ++ )
			tx.pixels[ j ] = mod_base[ mtOfs + SIZEOF_MIPTEX + j ];

		if ( name.substring( 0, 3 ) === 'sky' ) {

			R_InitSky( tx );

		} else {

			// Turbulent textures (lava, slime, water, teleporters) are drawn with a plain
			// map, so they must keep their fullbright texels: lava is made of nothing
			// else, and splitting them out left it black.
			tx.gl_texture = GL_LoadTexture( name, tx.width, tx.height, tx.pixels, true, false, name.charAt( 0 ) !== '*' );

			// Newer Game: our own higher resolution version of the picture, once it arrives
			if ( name.charAt( 0 ) !== '*' ) R_NewerTextureUpgrade( name, tx.gl_texture );

		}

	}

	//
	// sequence the animations
	//
	const ANIM_CYCLE = 2;

	for ( let i = 0; i < nummiptex; i ++ ) {

		const tx = loadmodel.textures[ i ];
		if ( ! tx || tx.name.charAt( 0 ) !== '+' )
			continue;
		if ( tx.anim_next )
			continue;	// already sequenced

		// find the number of frames in the animation
		const anims = new Array( 10 ).fill( null );
		const altanims = new Array( 10 ).fill( null );

		let max = tx.name.charCodeAt( 1 );
		let altmax = 0;

		if ( max >= 'a'.charCodeAt( 0 ) && max <= 'z'.charCodeAt( 0 ) )
			max -= 'a'.charCodeAt( 0 ) - 'A'.charCodeAt( 0 );
		if ( max >= '0'.charCodeAt( 0 ) && max <= '9'.charCodeAt( 0 ) ) {

			max -= '0'.charCodeAt( 0 );
			altmax = 0;
			anims[ max ] = tx;
			max ++;

		} else if ( max >= 'A'.charCodeAt( 0 ) && max <= 'J'.charCodeAt( 0 ) ) {

			altmax = max - 'A'.charCodeAt( 0 );
			max = 0;
			altanims[ altmax ] = tx;
			altmax ++;

		} else {

			Sys_Error( 'Bad animating texture ' + tx.name );

		}

		for ( let j = i + 1; j < nummiptex; j ++ ) {

			const tx2 = loadmodel.textures[ j ];
			if ( ! tx2 || tx2.name.charAt( 0 ) !== '+' )
				continue;
			if ( tx2.name.substring( 2 ) !== tx.name.substring( 2 ) )
				continue;

			let num = tx2.name.charCodeAt( 1 );
			if ( num >= 'a'.charCodeAt( 0 ) && num <= 'z'.charCodeAt( 0 ) )
				num -= 'a'.charCodeAt( 0 ) - 'A'.charCodeAt( 0 );
			if ( num >= '0'.charCodeAt( 0 ) && num <= '9'.charCodeAt( 0 ) ) {

				num -= '0'.charCodeAt( 0 );
				anims[ num ] = tx2;
				if ( num + 1 > max )
					max = num + 1;

			} else if ( num >= 'A'.charCodeAt( 0 ) && num <= 'J'.charCodeAt( 0 ) ) {

				num = num - 'A'.charCodeAt( 0 );
				altanims[ num ] = tx2;
				if ( num + 1 > altmax )
					altmax = num + 1;

			} else {

				Sys_Error( 'Bad animating texture ' + tx.name );

			}

		}

		// link them all together
		for ( let j = 0; j < max; j ++ ) {

			const tx2 = anims[ j ];
			if ( ! tx2 )
				Sys_Error( 'Missing frame ' + j + ' of ' + tx.name );
			tx2.anim_total = max * ANIM_CYCLE;
			tx2.anim_min = j * ANIM_CYCLE;
			tx2.anim_max = ( j + 1 ) * ANIM_CYCLE;
			tx2.anim_next = anims[ ( j + 1 ) % max ];
			if ( altmax )
				tx2.alternate_anims = altanims[ 0 ];

		}

		for ( let j = 0; j < altmax; j ++ ) {

			const tx2 = altanims[ j ];
			if ( ! tx2 )
				Sys_Error( 'Missing frame ' + j + ' of ' + tx.name );
			tx2.anim_total = altmax * ANIM_CYCLE;
			tx2.anim_min = j * ANIM_CYCLE;
			tx2.anim_max = ( j + 1 ) * ANIM_CYCLE;
			tx2.anim_next = altanims[ ( j + 1 ) % altmax ];
			if ( max )
				tx2.alternate_anims = anims[ 0 ];

		}

	}

}

// ============================================================================
// Mod_LoadLighting
// ============================================================================

function Mod_LoadLighting( fileofs, filelen ) {

	if ( filelen === 0 ) {

		loadmodel.lightdata = null;
		return;

	}

	loadmodel.lightdata = new Uint8Array( filelen );
	loadmodel.lightdata.set( mod_base.subarray( fileofs, fileofs + filelen ) );

	// coloured lightmaps, when the Newer Game pack has them for this map
	const lit = COM_FindFile( loadmodel.name.replace( /\.bsp$/i, '.lit' ) );
	loadmodel.litdata = lit !== null ? Lit_Parse( lit.data, filelen ) : null;

}

// ============================================================================
// Mod_LoadVisibility
// ============================================================================

function Mod_LoadVisibility( fileofs, filelen ) {

	if ( filelen === 0 ) {

		loadmodel.visdata = null;
		return;

	}

	loadmodel.visdata = new Uint8Array( filelen );
	loadmodel.visdata.set( mod_base.subarray( fileofs, fileofs + filelen ) );

}

// ============================================================================
// Mod_LoadEntities
// ============================================================================

function Mod_LoadEntities( fileofs, filelen ) {

	if ( filelen === 0 ) {

		loadmodel.entities = null;
		return;

	}

	// a replacement entity list from the Newer Game pack (maps/e1m1.ent)
	const ent = COM_FindFile( loadmodel.name.replace( /\.bsp$/i, '.ent' ) );
	const replacement = ent !== null ? Ent_Parse( ent.data ) : null;
	if ( replacement !== null ) {

		loadmodel.entities = replacement;
		return;

	}

	// Read as string
	let s = '';
	for ( let i = 0; i < filelen; i ++ ) {

		const c = mod_base[ fileofs + i ];
		if ( c === 0 ) break;
		s += String.fromCharCode( c );

	}

	loadmodel.entities = s;

}

// ============================================================================
// Mod_LoadVertexes
// ============================================================================

function Mod_LoadVertexes( fileofs, filelen ) {

	if ( filelen % SIZEOF_DVERTEX )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / SIZEOF_DVERTEX;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count );

	loadmodel.vertexes = out;
	loadmodel.numvertexes = count;

	for ( let i = 0; i < count; i ++ ) {

		const v = new mvertex_t();
		const base = i * SIZEOF_DVERTEX;
		v.position[ 0 ] = view.getFloat32( base, true );
		v.position[ 1 ] = view.getFloat32( base + 4, true );
		v.position[ 2 ] = view.getFloat32( base + 8, true );
		out[ i ] = v;

	}

}

// ============================================================================
// Mod_LoadEdges
// ============================================================================

function Mod_LoadEdges( fileofs, filelen ) {
 const recordSize=bspWide?(8):SIZEOF_DEDGE;

	if ( filelen % recordSize )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / recordSize;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count + 1 );

	loadmodel.edges = out;
	loadmodel.numedges = count;

	for ( let i = 0; i < count; i ++ ) {

		const e = new medge_t();
		const base = i * recordSize;
		e.v[ 0 ] = bspWide?view.getUint32(base,true):view.getUint16(base,true);
		e.v[ 1 ] = bspWide?view.getUint32(base+4,true):view.getUint16(base+2,true);
		if(e.v[0]>=loadmodel.numvertexes||e.v[1]>=loadmodel.numvertexes)Sys_Error('Invalid BSP edge vertex');
		out[ i ] = e;

	}

	// +1 slot (matches C allocation)
	out[ count ] = new medge_t();

}

// ============================================================================
// Mod_LoadSurfedges
// ============================================================================

function Mod_LoadSurfedges( fileofs, filelen ) {

	if ( filelen % 4 )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / 4;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Int32Array( count );

	loadmodel.surfedges = out;
	loadmodel.numsurfedges = count;

	for ( let i = 0; i < count; i ++ )
		out[ i ] = view.getInt32( i * 4, true );

}

// ============================================================================
// Mod_LoadPlanes
// ============================================================================

function Mod_LoadPlanes( fileofs, filelen ) {

	if ( filelen % SIZEOF_DPLANE )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / SIZEOF_DPLANE;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count * 2 ); // allocate 2x like C code

	loadmodel.planes = out;
	loadmodel.numplanes = count;

	for ( let i = 0; i < count; i ++ ) {

		const p = new mplane_t();
		const base = i * SIZEOF_DPLANE;
		let bits = 0;

		for ( let j = 0; j < 3; j ++ ) {

			p.normal[ j ] = view.getFloat32( base + j * 4, true );
			if ( p.normal[ j ] < 0 )
				bits |= 1 << j;

		}

		p.dist = view.getFloat32( base + 12, true );
		p.type = view.getInt32( base + 16, true );
		p.signbits = bits;

		out[ i ] = p;

	}

	// Fill remaining slots (C allocates count*2)
	for ( let i = count; i < count * 2; i ++ )
		out[ i ] = new mplane_t();

}

// ============================================================================
// Mod_LoadTexinfo
// ============================================================================

function Mod_LoadTexinfo( fileofs, filelen ) {

	if ( filelen % SIZEOF_TEXINFO )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / SIZEOF_TEXINFO;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count );

	loadmodel.texinfo = out;
	loadmodel.numtexinfo = count;

	for ( let i = 0; i < count; i ++ ) {

		const ti = new mtexinfo_t();
		const base = i * SIZEOF_TEXINFO;

		// Read vecs[2][4] = 8 floats
		for ( let j = 0; j < 4; j ++ )
			ti.vecs[ 0 ][ j ] = view.getFloat32( base + j * 4, true );
		for ( let j = 0; j < 4; j ++ )
			ti.vecs[ 1 ][ j ] = view.getFloat32( base + 16 + j * 4, true );

		// Compute mipadjust from vector lengths
		const len1 = Length( ti.vecs[ 0 ] ); // only first 3 components matter but Length uses all 3
		const len2 = Length( ti.vecs[ 1 ] );
		const lenAvg = ( len1 + len2 ) / 2;
		if ( lenAvg < 0.32 )
			ti.mipadjust = 4;
		else if ( lenAvg < 0.49 )
			ti.mipadjust = 3;
		else if ( lenAvg < 0.99 )
			ti.mipadjust = 2;
		else
			ti.mipadjust = 1;

		const miptex = view.getInt32( base + 32, true );
		ti.flags = view.getInt32( base + 36, true );

		if ( ! loadmodel.textures ) {

			ti.texture = r_notexture_mip;	// checkerboard texture
			ti.flags = 0;

		} else {

			if ( miptex >= loadmodel.numtextures )
				Sys_Error( 'miptex >= loadmodel->numtextures' );
			ti.texture = loadmodel.textures[ miptex ];
			if ( ! ti.texture ) {

				ti.texture = r_notexture_mip;	// texture not found
				ti.flags = 0;

			}

		}

		out[ i ] = ti;

	}

}

// ============================================================================
// CalcSurfaceExtents
//
// Fills in s->texturemins[] and s->extents[]
// ============================================================================

function CalcSurfaceExtents( s ) {

	const mins = [ 999999, 999999 ];
	const maxs = [ - 99999, - 99999 ];

	const tex = s.texinfo;

	for ( let i = 0; i < s.numedges; i ++ ) {

		let e = loadmodel.surfedges[ s.firstedge + i ];
		let v;
		if ( e >= 0 )
			v = loadmodel.vertexes[ loadmodel.edges[ e ].v[ 0 ] ];
		else
			v = loadmodel.vertexes[ loadmodel.edges[ - e ].v[ 1 ] ];

		for ( let j = 0; j < 2; j ++ ) {

			const val = v.position[ 0 ] * tex.vecs[ j ][ 0 ] +
						v.position[ 1 ] * tex.vecs[ j ][ 1 ] +
						v.position[ 2 ] * tex.vecs[ j ][ 2 ] +
						tex.vecs[ j ][ 3 ];
			if ( val < mins[ j ] )
				mins[ j ] = val;
			if ( val > maxs[ j ] )
				maxs[ j ] = val;

		}

	}

	for ( let i = 0; i < 2; i ++ ) {

		const bmins = Math.floor( mins[ i ] / 16 );
		const bmaxs = Math.ceil( maxs[ i ] / 16 );

		s.texturemins[ i ] = bmins * 16;
		s.extents[ i ] = ( bmaxs - bmins ) * 16;
		if ( ! ( tex.flags & TEX_SPECIAL ) && s.extents[ i ] > 512 )
			Sys_Error( 'Bad surface extents' );

	}

}

// ============================================================================
// Mod_LoadFaces
// ============================================================================

function Mod_LoadFaces( fileofs, filelen ) {
 const recordSize=bspWide?(28):SIZEOF_DFACE;

	if ( filelen % recordSize )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / recordSize;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count );

	loadmodel.surfaces = out;
	loadmodel.numsurfaces = count;

	for ( let surfnum = 0; surfnum < count; surfnum ++ ) {

		const s = new msurface_t();
		const base = surfnum * recordSize;

		s.firstedge = view.getInt32(base+(bspWide?8:4),true);
		s.numedges = bspWide?view.getInt32(base+12,true):view.getInt16(base+8,true);
		s.flags = 0;

		const planenum = bspWide?view.getUint32(base,true):view.getUint16(base,true);
		const side = bspWide?view.getInt32(base+4,true):view.getInt16(base+2,true);
		if ( side )
			s.flags |= SURF_PLANEBACK;

		if(planenum>=loadmodel.numplanes)Sys_Error('Invalid BSP face plane');
		s.plane = loadmodel.planes[ planenum ];

		s.texinfo = loadmodel.texinfo[ bspWide?view.getInt32(base+16,true):view.getInt16(base+10,true) ];

if(!s.texinfo||s.firstedge<0||s.numedges<3||s.firstedge+s.numedges>loadmodel.numsurfedges)Sys_Error('Invalid BSP face references');
		CalcSurfaceExtents( s );

		// lighting info
		for ( let i = 0; i < MAXLIGHTMAPS; i ++ )
			s.styles[ i ] = mod_base[ fileofs+base+(bspWide?20:12)+i ];

		const lightofs = view.getInt32(base+(bspWide?24:16),true);
		if ( lightofs === - 1 ) {

			s.samples = null;

		} else {

			s.samples = loadmodel.lightdata;
			s.sampleOffset = lightofs;
			if ( loadmodel.litdata !== null ) {

				s.litsamples = loadmodel.litdata;
				s.litOffset = lightofs * 3;

			}

		}

		// set the drawing flags
		if ( s.texinfo.texture && s.texinfo.texture.name.substring( 0, 3 ) === 'sky' ) {

			s.flags |= ( SURF_DRAWSKY | SURF_DRAWTILED );
			GL_SubdivideSurface( s );
			out[ surfnum ] = s;
			continue;

		}

		if ( s.texinfo.texture && s.texinfo.texture.name.charAt( 0 ) === '*' ) {

			s.flags |= ( SURF_DRAWTURB | SURF_DRAWTILED );
			for ( let i = 0; i < 2; i ++ ) {

				s.extents[ i ] = 16384;
				s.texturemins[ i ] = - 8192;

			}

			GL_SubdivideSurface( s );
			out[ surfnum ] = s;
			continue;

		}

		out[ surfnum ] = s;

	}

	Mod_CrateVariants( out );

}

// Newer Game: once in 40, a crate wears one of the rare pictures (r_cratevariants.js).  Its faces
// get their own copy of the texture info, pointing at a texture of the variant's name, which the
// textures' own upgrade (r_newertextures.js) gives its picture like any other.
function Mod_CrateVariants( surfaces ) {

	if ( ! R_NewerGame() || r_newer_textures.value === 0 || r_newer_crates.value < 1 ) return;

	const sides = [];
	for ( const s of surfaces ) {

		if ( s == null || s.texinfo == null || s.texinfo.texture == null || ! R_IsCrateSide( s.texinfo.texture.name ) ) continue;

		const mins = [ 1e9, 1e9, 1e9 ], maxs = [ - 1e9, - 1e9, - 1e9 ];
		for ( let i = 0; i < s.numedges; i ++ ) {

			const e = loadmodel.surfedges[ s.firstedge + i ];
			const v = loadmodel.vertexes[ e >= 0 ? loadmodel.edges[ e ].v[ 0 ] : loadmodel.edges[ - e ].v[ 1 ] ];
			for ( let k = 0; k < 3; k ++ ) {

				mins[ k ] = Math.min( mins[ k ], v.position[ k ] );
				maxs[ k ] = Math.max( maxs[ k ], v.position[ k ] );

			}

		}

		// how far does the face run along the picture, and where in it does it start?  A face one
		// picture across (or several) is whole; the mapper often started it part way into the picture,
		// which cuts the crate's frame in two with a seam down the middle: that is put right below
		const tex = s.texinfo.texture;
		let whole = true; // every axis a whole number of pictures (shifted into place below)
		let single = true; // and exactly one picture: the crates that may take another picture
		const shift = [ 0, 0 ];
		for ( let j = 0; j < 2; j ++ ) {

			let lo = 1e9, hi = - 1e9;
			for ( let i = 0; i < s.numedges; i ++ ) {

				const e = loadmodel.surfedges[ s.firstedge + i ];
				const v = loadmodel.vertexes[ e >= 0 ? loadmodel.edges[ e ].v[ 0 ] : loadmodel.edges[ - e ].v[ 1 ] ];
				const c = v.position[ 0 ] * s.texinfo.vecs[ j ][ 0 ] + v.position[ 1 ] * s.texinfo.vecs[ j ][ 1 ]
					+ v.position[ 2 ] * s.texinfo.vecs[ j ][ 2 ] + s.texinfo.vecs[ j ][ 3 ];
				lo = Math.min( lo, c );
				hi = Math.max( hi, c );

			}

			const size = j === 0 ? tex.width : tex.height;
			const span = hi - lo;
			const k = Math.round( span / size );
			if ( k < 1 || Math.abs( span - k * size ) > 1.5 ) {

				whole = false;
				continue;

			}

			if ( k !== 1 ) single = false;
			const off = ( ( lo % size ) + size ) % size;
			if ( off > 1.5 && size - off > 1.5 ) shift[ j ] = - off / size;

		}

				const flip = ( s.flags & SURF_PLANEBACK ) ? - 1 : 1;
		sides.push( { whole: single, aligned: whole, shift, surface: s, mins, maxs, normal: [ s.plane.normal[ 0 ] * flip, s.plane.normal[ 1 ] * flip, s.plane.normal[ 2 ] * flip ] } );

	}

	if ( sides.length === 0 ) return;

	const plan = R_CratePlan( loadmodel.name, sides, Math.round( r_newer_crates.value ) );
	const made = new Map();

	for ( let i = 0; i < sides.length; i ++ ) {

		const s = sides[ i ].surface;
		const base = s.texinfo.texture;
		const variant = plan[ i ];
		const shift = sides[ i ].aligned ? sides[ i ].shift : [ 0, 0 ];
		if ( variant === null && shift[ 0 ] === 0 && shift[ 1 ] === 0 ) continue;

		const name = variant !== null ? variant : base.name;
		// Equal enhanced art can replace different original crate faces. Keep
		// their native provenance distinct for the demo's classic half.
		const key = name + '@' + shift[ 0 ].toFixed( 4 ) + ',' + shift[ 1 ].toFixed( 4 ) + ':native:' + base.name;

		let tx = made.get( key );
		if ( tx === undefined ) {

			tx = new texture_t();
			tx.name = name;
			tx.width = base.width;
			tx.height = base.height;
			tx.pixels = base.pixels;
			tx.offsets.set( base.offsets );
			tx.gl_texture = GL_LoadTexture( name, tx.width, tx.height, tx.pixels, true, false, true );
			tx.gl_texture.userData.classicBase = base.gl_texture;
			// the picture starts at the face's edge (the diffuse picture and its relief move together)
			tx.gl_texture.offset.set( shift[ 0 ], shift[ 1 ] );
			R_NewerTextureUpgrade( name, tx.gl_texture );

			loadmodel.textures.push( tx );
			loadmodel.numtextures = loadmodel.textures.length;
			made.set( key, tx );

		}

		const info = new mtexinfo_t();
		info.vecs[ 0 ].set( s.texinfo.vecs[ 0 ] );
		info.vecs[ 1 ].set( s.texinfo.vecs[ 1 ] );
		info.mipadjust = s.texinfo.mipadjust;
		info.flags = s.texinfo.flags;
		info.texture = tx;
		s.texinfo = info;

	}

}

// ============================================================================
// Mod_SetParent
// ============================================================================

function Mod_SetParent( node, parent ) {
 // Preserve left-first native parent assignment, including shared solid leaves,
 // while rejecting cyclic/non-tree node graphs without recursive stack growth.
 const stack=[{node,parent,exit:false}],visiting=new Set(),finished=new Set();
 let steps=0;
 while(stack.length){
  if(++steps>loadmodel.numnodes*3+1)Sys_Error('Invalid BSP parent traversal');
  const item=stack.pop(),current=item.node;
  if(!current)Sys_Error('Missing BSP child');
  if(item.exit){visiting.delete(current);finished.add(current);continue;}
  if(current.contents<0){current.parent=item.parent;continue;}
  if(visiting.has(current)||finished.has(current))Sys_Error('Cyclic/non-tree BSP nodes');
  current.parent=item.parent;visiting.add(current);
  stack.push({node:current,exit:true},{node:current.children[1],parent:current,exit:false},{node:current.children[0],parent:current,exit:false});
 }
}

// ============================================================================
// Mod_LoadNodes
// ============================================================================

function Mod_LoadNodes( fileofs, filelen ) {
 const recordSize=bspWide?(bspFloatBounds?44:32):SIZEOF_DNODE;

	if ( filelen % recordSize )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / recordSize;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count );

	loadmodel.nodes = out;
	loadmodel.numnodes = count;

	for ( let i = 0; i < count; i ++ ) {

		const node = new mnode_t();
		const base = i * recordSize;

		for ( let j = 0; j < 3; j ++ ) {

			node.minmaxs[ j ] = bspFloatBounds?view.getFloat32(base+12+j*4,true):view.getInt16(base+(bspWide?12:8)+j*2,true);
			node.minmaxs[ 3 + j ] = bspFloatBounds?view.getFloat32(base+24+j*4,true):view.getInt16(base+(bspWide?18:14)+j*2,true);

		}

		const p = view.getInt32( base, true );
		if(p<0||p>=loadmodel.numplanes)Sys_Error('Invalid BSP node plane');
		node.plane = loadmodel.planes[ p ];

		node.firstsurface = bspWide?view.getUint32(base+(bspFloatBounds?36:24),true):view.getUint16(base+20,true);
		node.numsurfaces = bspWide?view.getUint32(base+(bspFloatBounds?40:28),true):view.getUint16(base+22,true);

		for ( let j = 0; j < 2; j ++ ) {

			const child = bspWide?view.getInt32(base+4+j*4,true):view.getInt16(base+4+j*2,true);
			if ( child >= 0 ) {

				node.children[ j ] = null; // will be resolved after all nodes created
				node._childIndex = node._childIndex || [];
				node._childIndex[ j ] = { type: 'node', index: child };

			} else {

				node._childIndex = node._childIndex || [];
				node._childIndex[ j ] = { type: 'leaf', index: - 1 - child };

			}

		}

		out[ i ] = node;

	}

	// Resolve children references now that all nodes and leafs exist
	for ( let i = 0; i < count; i ++ ) {

		const node = out[ i ];
		for ( let j = 0; j < 2; j ++ ) {

			const ci = node._childIndex[ j ];
			if(!ci||ci.index<0||ci.index>=(ci.type==='node'?loadmodel.nodes.length:loadmodel.leafs.length))Sys_Error('Invalid BSP node child');
			if ( ci.type === 'node' ) {

				node.children[ j ] = loadmodel.nodes[ ci.index ];

			} else {

				node.children[ j ] = loadmodel.leafs[ ci.index ];

			}

		}

		delete node._childIndex;

	}

	Mod_SetParent( loadmodel.nodes[ 0 ], null );

}

// ============================================================================
// Mod_LoadLeafs
// ============================================================================

function Mod_LoadLeafs( fileofs, filelen ) {
 const recordSize=bspWide?(bspFloatBounds?44:32):SIZEOF_DLEAF;

	if ( filelen % recordSize )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / recordSize;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count );

	loadmodel.leafs = out;
	loadmodel.numleafs = count;

	for ( let i = 0; i < count; i ++ ) {

		const leaf = new mleaf_t();
		leaf._leafIndex = i; // store index for PVS checks (C uses pointer arithmetic: leaf - sv.worldmodel->leafs)
		const base = i * recordSize;

		for ( let j = 0; j < 3; j ++ ) {

			leaf.minmaxs[ j ] = bspFloatBounds?view.getFloat32(base+8+j*4,true):view.getInt16(base+8+j*2,true);
			leaf.minmaxs[ 3 + j ] = bspFloatBounds?view.getFloat32(base+20+j*4,true):view.getInt16(base+14+j*2,true);

		}

		leaf.contents = view.getInt32( base, true );

		const firstmarksurfaceIdx = bspWide?view.getUint32(base+(bspFloatBounds?32:20),true):view.getUint16(base+20,true);
		leaf.nummarksurfaces = bspWide?view.getUint32(base+(bspFloatBounds?36:24),true):view.getUint16(base+22,true);

		if(firstmarksurfaceIdx>loadmodel.marksurfaces.length||leaf.nummarksurfaces>loadmodel.marksurfaces.length-firstmarksurfaceIdx)Sys_Error('Invalid BSP leaf marksurface range');
		// In C: leaf->firstmarksurface = loadmodel->marksurfaces + firstmarksurface;
		// This is a pointer into the marksurfaces array (which is an array of msurface_t*)
		// In JS we store the sub-array so leaf.firstmarksurface[j] works like C
		leaf.firstmarksurface = loadmodel.marksurfaces.slice(
			firstmarksurfaceIdx, firstmarksurfaceIdx + leaf.nummarksurfaces
		);

		const visofs = view.getInt32( base + 4, true );
		if ( visofs === - 1 ) {

			leaf.compressed_vis = null;

		} else {

			leaf.compressed_vis = loadmodel.visdata;
			leaf.compressed_vis_offset = visofs;

		}

		leaf.efrags = null;

		for ( let j = 0; j < 4; j ++ )
			leaf.ambient_sound_level[ j ] = mod_base[ fileofs+base+(bspWide?(bspFloatBounds?40:28):24)+j ];

		// gl underwater warp
		if ( leaf.contents !== CONTENTS_EMPTY ) {

			for ( let j = 0; j < leaf.nummarksurfaces; j ++ ) {

				leaf.firstmarksurface[ j ].flags |= SURF_UNDERWATER;

			}

		}

		out[ i ] = leaf;

	}

}

// ============================================================================
// Mod_LoadClipnodes
// ============================================================================

function Mod_LoadClipnodes( fileofs, filelen ) {
 const recordSize=bspWide?(12):SIZEOF_DCLIPNODE;

	if ( filelen % recordSize )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / recordSize;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count );

	loadmodel.clipnodes = out;
	loadmodel.numclipnodes = count;

	// hull 1 - player standing
	const hull1 = loadmodel.hulls[ 1 ];
	hull1.clipnodes = out;
	hull1.firstclipnode = 0;
	hull1.lastclipnode = count - 1;
	hull1.planes = loadmodel.planes;
	hull1.clip_mins[ 0 ] = - 16;
	hull1.clip_mins[ 1 ] = - 16;
	hull1.clip_mins[ 2 ] = - 24;
	hull1.clip_maxs[ 0 ] = 16;
	hull1.clip_maxs[ 1 ] = 16;
	hull1.clip_maxs[ 2 ] = 32;

	// hull 2 - shambler
	const hull2 = loadmodel.hulls[ 2 ];
	hull2.clipnodes = out;
	hull2.firstclipnode = 0;
	hull2.lastclipnode = count - 1;
	hull2.planes = loadmodel.planes;
	hull2.clip_mins[ 0 ] = - 32;
	hull2.clip_mins[ 1 ] = - 32;
	hull2.clip_mins[ 2 ] = - 24;
	hull2.clip_maxs[ 0 ] = 32;
	hull2.clip_maxs[ 1 ] = 32;
	hull2.clip_maxs[ 2 ] = 64;

	for ( let i = 0; i < count; i ++ ) {

		const cn = new dclipnode_t();
		const base = i * recordSize;

		cn.planenum = view.getInt32( base, true );
		cn.children[ 0 ] = bspWide?view.getInt32(base+4,true):view.getInt16(base+4,true);
		cn.children[ 1 ] = bspWide?view.getInt32(base+8,true):view.getInt16(base+6,true);

		if(cn.planenum<0||cn.planenum>=loadmodel.numplanes||cn.children.some(child=>child>=count))Sys_Error('Invalid BSP collision references');
		out[ i ] = cn;

	}

}

// ============================================================================
// Mod_MakeHull0
//
// Duplicate the drawing hull structure as a clipping hull
// ============================================================================

function Mod_MakeHull0() {

	const hull = loadmodel.hulls[ 0 ];

	const _in = loadmodel.nodes;
	const count = loadmodel.numnodes;
	const out = new Array( count );
	const nodeIndices=new Map(loadmodel.nodes.map((node,i)=>[node,i]));
	const planeIndices=new Map(loadmodel.planes.slice(0,loadmodel.numplanes).map((plane,i)=>[plane,i]));

	hull.clipnodes = out;
	hull.firstclipnode = 0;
	hull.lastclipnode = count - 1;
	hull.planes = loadmodel.planes;

	for ( let i = 0; i < count; i ++ ) {

		const cn = new dclipnode_t();
		const node = _in[ i ];

		cn.planenum = planeIndices.get(node.plane);

		for ( let j = 0; j < 2; j ++ ) {

			const child = node.children[ j ];
			if ( child.contents < 0 )
				cn.children[ j ] = child.contents;
			else
				cn.children[ j ] = nodeIndices.get(child);

		}

		out[ i ] = cn;

	}

}

// ============================================================================
// Mod_LoadMarksurfaces
// ============================================================================

function Mod_LoadMarksurfaces( fileofs, filelen ) {
 const recordSize=bspWide?4:2;

	if ( filelen % recordSize )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / recordSize;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count );

	loadmodel.marksurfaces = out;
	loadmodel.nummarksurfaces = count;

	for ( let i = 0; i < count; i ++ ) {

		const j = bspWide?view.getUint32(i*4,true):view.getUint16(i*2,true);
		if ( j >= loadmodel.numsurfaces )
			Sys_Error( 'Mod_ParseMarksurfaces: bad surface number' );
		out[ i ] = loadmodel.surfaces[ j ];

	}

}

// ============================================================================
// Mod_LoadSubmodels
// ============================================================================

function Mod_LoadSubmodels( fileofs, filelen ) {

	if ( filelen % SIZEOF_DMODEL )
		Sys_Error( 'MOD_LoadBmodel: funny lump size in ' + loadmodel.name );

	const count = filelen / SIZEOF_DMODEL;
	const view = new DataView( mod_base.buffer, mod_base.byteOffset + fileofs, filelen );
	const out = new Array( count );

	loadmodel.submodels = out;
	loadmodel.numsubmodels = count;

	for ( let i = 0; i < count; i ++ ) {

		const sm = new dmodel_t();
		const base = i * SIZEOF_DMODEL;

		for ( let j = 0; j < 3; j ++ ) {

			// spread the mins / maxs by a pixel
			sm.mins[ j ] = view.getFloat32( base + j * 4, true ) - 1;
			sm.maxs[ j ] = view.getFloat32( base + 12 + j * 4, true ) + 1;
			sm.origin[ j ] = view.getFloat32( base + 24 + j * 4, true );

		}

		for ( let j = 0; j < MAX_MAP_HULLS; j ++ )
			sm.headnode[ j ] = view.getInt32( base + 36 + j * 4, true );

		sm.visleafs = view.getInt32( base + 52, true );
		sm.firstface = view.getInt32( base + 56, true );
		sm.numfaces = view.getInt32( base + 60, true );

		out[ i ] = sm;

	}

}

// ============================================================================
// Mod_LoadBrushModel
// ============================================================================

/**
 * Loads a BSP map into `mod` (WinQuake gl_model.c; called by `Mod_LoadModel` for a map's bytes): version 29, or BSP2
 * and 2PSB with their wider indices and float bounds; the lumps in WinQuake's order (vertexes, edges, surfedges,
 * textures, lighting, planes, texinfo, faces, marksurfaces, visibility, leafs, nodes, clipnodes, entities, submodels).
 * Then each submodel gets its hulls and bounds, and the inline models `*1`, `*2`, ... are made from them as the
 * following entries of the model table, except for a level loaded only to be looked at.
 *
 * @param {model_t} mod the model to fill (`loadmodel`)
 * @param {ArrayBuffer} buffer the whole .bsp file
 * @throws {Error} via `Sys_Error` for a wrong version or a malformed lump
 */
export function Mod_LoadBrushModel( mod, buffer ) {

	loadmodel.type = mod_brush;

	const bytes = new Uint8Array( buffer );
	const view = new DataView( buffer );

	const version = view.getInt32( 0, true );
	if ( version !== BSPVERSION && version!==0x32505342 && version!==0x42535032 )
		Sys_Error( 'Mod_LoadBrushModel: ' + mod.name + ' has wrong version number (' + version + ' should be ' + BSPVERSION + ')' );

	// swap all the lumps
	bspWide=version!==BSPVERSION;bspFloatBounds=version===0x32505342;
	mod.bspVersion=version;
	mod_base = bytes;
	mod.bspSourceBytes = bytes; // immutable loaded-source identity, including preview/reload

	// Read lump directory: version (4 bytes) + HEADER_LUMPS * 2 ints (fileofs, filelen)
	const lumps = [];
	for ( let i = 0; i < HEADER_LUMPS; i ++ ) {

		lumps[ i ] = {
			fileofs: view.getInt32( 4 + i * 8, true ),
			filelen: view.getInt32( 4 + i * 8 + 4, true )
		};

	}

	for(const lump of lumps)if(lump.fileofs<0||lump.filelen<0||lump.fileofs+lump.filelen>bytes.length)Sys_Error('Invalid BSP lump bounds');
	// load into heap (order matters! same as original C code)
	Mod_LoadVertexes( lumps[ LUMP_VERTEXES ].fileofs, lumps[ LUMP_VERTEXES ].filelen );
	Mod_LoadEdges( lumps[ LUMP_EDGES ].fileofs, lumps[ LUMP_EDGES ].filelen );
	Mod_LoadSurfedges( lumps[ LUMP_SURFEDGES ].fileofs, lumps[ LUMP_SURFEDGES ].filelen );
	Mod_LoadTextures( lumps[ LUMP_TEXTURES ].fileofs, lumps[ LUMP_TEXTURES ].filelen );
	Mod_LoadLighting( lumps[ LUMP_LIGHTING ].fileofs, lumps[ LUMP_LIGHTING ].filelen );
	Mod_LoadPlanes( lumps[ LUMP_PLANES ].fileofs, lumps[ LUMP_PLANES ].filelen );
	Mod_LoadTexinfo( lumps[ LUMP_TEXINFO ].fileofs, lumps[ LUMP_TEXINFO ].filelen );
	Mod_LoadFaces( lumps[ LUMP_FACES ].fileofs, lumps[ LUMP_FACES ].filelen );
	Mod_LoadMarksurfaces( lumps[ LUMP_MARKSURFACES ].fileofs, lumps[ LUMP_MARKSURFACES ].filelen );
	Mod_LoadVisibility( lumps[ LUMP_VISIBILITY ].fileofs, lumps[ LUMP_VISIBILITY ].filelen );
	Mod_LoadLeafs( lumps[ LUMP_LEAFS ].fileofs, lumps[ LUMP_LEAFS ].filelen );
	Mod_LoadNodes( lumps[ LUMP_NODES ].fileofs, lumps[ LUMP_NODES ].filelen );
	Mod_LoadClipnodes( lumps[ LUMP_CLIPNODES ].fileofs, lumps[ LUMP_CLIPNODES ].filelen );
	Mod_LoadEntities( lumps[ LUMP_ENTITIES ].fileofs, lumps[ LUMP_ENTITIES ].filelen );
	Mod_LoadSubmodels( lumps[ LUMP_MODELS ].fileofs, lumps[ LUMP_MODELS ].filelen );

	Mod_MakeHull0();

	mod.numframes = 2;		// regular and alternate animation

	//
	// set up the submodels (FIXME: this is confusing)
	//
	for ( let i = 0; i < mod.numsubmodels; i ++ ) {

		const bm = mod.submodels[ i ];

		mod.hulls[ 0 ].firstclipnode = bm.headnode[ 0 ];
		for ( let j = 1; j < MAX_MAP_HULLS; j ++ ) {

			mod.hulls[ j ].firstclipnode = bm.headnode[ j ];
			mod.hulls[ j ].lastclipnode = mod.numclipnodes - 1;

		}

		mod.firstmodelsurface = bm.firstface;
		mod.nummodelsurfaces = bm.numfaces;

		VectorCopy( bm.maxs, mod.maxs );
		VectorCopy( bm.mins, mod.mins );

		mod.radius = RadiusFromBounds( mod.mins, mod.maxs );

		mod.numleafs = bm.visleafs;

		// a level loaded to be looked at has only its world: the *1, *2... entries
		// belong to the level being played (its doors and platforms)
		if ( previewLoad === true ) break;

		if ( i < mod.numsubmodels - 1 ) {

			// duplicate the basic information
			const name = '*' + ( i + 1 );
			const nextmodel = Mod_FindName( name );

			// Copy all properties
			nextmodel.type = mod.type;
			nextmodel.numframes = mod.numframes;
			nextmodel.synctype = mod.synctype;
			nextmodel.flags = mod.flags;
			VectorCopy( mod.mins, nextmodel.mins );
			VectorCopy( mod.maxs, nextmodel.maxs );
			nextmodel.radius = mod.radius;
			nextmodel.clipbox = mod.clipbox;
			VectorCopy( mod.clipmins, nextmodel.clipmins );
			VectorCopy( mod.clipmaxs, nextmodel.clipmaxs );
			nextmodel.firstmodelsurface = mod.firstmodelsurface;
			nextmodel.nummodelsurfaces = mod.nummodelsurfaces;
			nextmodel.numsubmodels = mod.numsubmodels;
			nextmodel.submodels = mod.submodels;
			nextmodel.numplanes = mod.numplanes;
			nextmodel.planes = mod.planes;
			nextmodel.numleafs = mod.numleafs;
			nextmodel.leafs = mod.leafs;
			nextmodel.numvertexes = mod.numvertexes;
			nextmodel.vertexes = mod.vertexes;
			nextmodel.numedges = mod.numedges;
			nextmodel.edges = mod.edges;
			nextmodel.numnodes = mod.numnodes;
			nextmodel.nodes = mod.nodes;
			nextmodel.numtexinfo = mod.numtexinfo;
			nextmodel.texinfo = mod.texinfo;
			nextmodel.numsurfaces = mod.numsurfaces;
			nextmodel.surfaces = mod.surfaces;
			nextmodel.numsurfedges = mod.numsurfedges;
			nextmodel.surfedges = mod.surfedges;
			nextmodel.numclipnodes = mod.numclipnodes;
			nextmodel.clipnodes = mod.clipnodes;
			nextmodel.nummarksurfaces = mod.nummarksurfaces;
			nextmodel.marksurfaces = mod.marksurfaces;
			for ( let h = 0; h < MAX_MAP_HULLS; h ++ ) {

				nextmodel.hulls[ h ].clipnodes = mod.hulls[ h ].clipnodes;
				nextmodel.hulls[ h ].planes = mod.hulls[ h ].planes;
				nextmodel.hulls[ h ].firstclipnode = mod.hulls[ h ].firstclipnode;
				nextmodel.hulls[ h ].lastclipnode = mod.hulls[ h ].lastclipnode;
				VectorCopy( mod.hulls[ h ].clip_mins, nextmodel.hulls[ h ].clip_mins );
				VectorCopy( mod.hulls[ h ].clip_maxs, nextmodel.hulls[ h ].clip_maxs );

			}

			nextmodel.numtextures = mod.numtextures;
			nextmodel.textures = mod.textures;
			nextmodel.visdata = mod.visdata;
			nextmodel.lightdata = mod.lightdata;
			nextmodel.litdata = mod.litdata;
			nextmodel.entities = mod.entities;
			nextmodel.needload = false;

			nextmodel.name = name;
			set_loadmodel( nextmodel );
			mod = nextmodel;

		}

	}

}
