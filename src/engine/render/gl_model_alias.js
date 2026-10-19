/**
 * @module engine/render/gl_model_alias
 *
 * The alias model loader (card [44k], split from gl_model.js; WinQuake gl_model.c): an .mdl's header, skins (single
 * and grouped, flood-filled, uploaded with their fullbright texels), texture coordinates, triangles and frames
 * (single and grouped poses), and its display lists for gl_mesh.js.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `pheader`, `playerClassTexels`; module-level variables `posenum`.
 *
 * Errors: calls `Sys_Error` (fatal) at 7 places; throws at 1 place; catches at 1 place.
 *
 * `Mod_LoadAliasModel` is called by `Mod_LoadModel` (gl_model.js) for an .mdl's bytes; `pheader`, `stverts`,
 * `triangles` and `poseverts` are the model being loaded, read by gl_mesh.js.
 */
import { Sys_Error } from '../common/sys.js';
import { GL_MakeAliasModelDisplayLists as GL_MakeAliasModelDisplayLists_mesh } from './gl_mesh.js';
import { ALIAS_VERSION, ALIAS_SINGLE, ALIAS_SKIN_SINGLE, ALIAS_BASE_SIZE_RATIO, MAX_LBM_HEIGHT, mod_alias, MAX_SKINS, MAXALIASVERTS, MAXALIASTRIS, stvert_t, mtriangle_t, maliasframedesc_t, aliashdr_t } from './gl_model_types.js';

// Portal of Praevus uses Raven's new alias format (`RAPO`, version 50) with per-corner texture indices. The geometry,
// skins and frames are the same as MDL; the per-corner st index is ignored by this renderer, which uses the vertex's
// base st coordinate (correct when st_verts == verts, the supplied Portal models' case).
const RAPOLYHEADER = 0x4f504152; // 'RAPO' little-endian
const ALIAS_NEWVERSION = 50;
import { loadmodel, GL_LoadTexture, readString } from './gl_model_common.js';
import { R_ModelSkinMode, SKIN_MODE_DEFAULT } from './gl_entity_semantics.js';

// Alias model globals
export let pheader = null;
export const stverts = [];
export const triangles = [];
export const poseverts = [];
let posenum = 0;

// Initialize alias arrays
for ( let i = 0; i < MAXALIASVERTS; i ++ )
	stverts[ i ] = new stvert_t();

for ( let i = 0; i < MAXALIASTRIS; i ++ )
	triangles[ i ] = new mtriangle_t();

/*
==============================================================================

				HEXEN II PLAYER CLASS SKINS

uhexen2 engine/h2shared/gl_model.c:2262-2310 keeps the raw texels of the five
class models (paladin, crusader, necro, assassin, succubus) so
R_TranslatePlayerSkin can recolour a player from a class-independent art set
(engine/hexen2/gl_rmisc.c:276-345). The registry keeps the same texels here,
filled as each model loads; a Quake model never matches, so it stays empty.

==============================================================================
*/
export const HEXEN2_PLAYER_CLASS_MODELS = Object.freeze( [
	'models/paladin.mdl', 'models/crusader.mdl', 'models/necro.mdl', 'models/assassin.mdl', 'models/succubus.mdl'
] );

/** Raw (flood-filled) skin texels per Hexen II player class, in native class order (class 1 first). */
export const playerClassTexels = [ null, null, null, null, null ];

/**
 * Forgets the class-model skins (a new game session; tests). The model cache owns the texel copies, so this only
 * drops the references.
 */
export function Hexen2_ResetPlayerClassTexels() {

	playerClassTexels.fill( null );

}

/**
 * The raw skin of a Hexen II player class model, for the per-class colour translation
 * (`R_TranslatePlayerSkin`, uhexen2 gl_rmisc.c:333-334: an unknown class falls back to the paladin's).
 *
 * @param {number} playerclass 1..5 (paladin, crusader, necro, assassin, succubus); anything else takes class 1
 * @returns {?{ data: Uint8Array, width: number, height: number, model: string }} the skin, or null before any class
 *   model has loaded
 */
export function Hexen2_PlayerClassTexels( playerclass ) {

	const index = Number.isInteger( playerclass ) && playerclass >= 1 && playerclass <= 5 ? playerclass - 1 : 0;
	return playerClassTexels[ index ] ?? playerClassTexels[ 0 ];

}


function GL_MakeAliasModelDisplayLists( mod, hdr ) {

	GL_MakeAliasModelDisplayLists_mesh( mod, hdr );

}

// ============================================================================
//
//                        ALIAS MODELS
//
// ============================================================================

// ============================================================================
// Mod_LoadAliasFrame
// ============================================================================

function Mod_LoadAliasFrame( buf, offset, frame ) {

	const view = new DataView( buf, offset );

	// daliasframe_t: bboxmin (4 bytes), bboxmax (4 bytes), name (16 bytes) = 24 bytes
	frame.bboxmin.v[ 0 ] = new Uint8Array( buf, offset )[ 0 ];
	frame.bboxmin.v[ 1 ] = new Uint8Array( buf, offset )[ 1 ];
	frame.bboxmin.v[ 2 ] = new Uint8Array( buf, offset )[ 2 ];
	frame.bboxmax.v[ 0 ] = new Uint8Array( buf, offset + 4 )[ 0 ];
	frame.bboxmax.v[ 1 ] = new Uint8Array( buf, offset + 4 )[ 1 ];
	frame.bboxmax.v[ 2 ] = new Uint8Array( buf, offset + 4 )[ 2 ];

	frame.name = readString( new Uint8Array( buf ), offset + 8, 16 );

	frame.firstpose = posenum;
	frame.numposes = 1;

	// trivertx_t data follows the header
	const SIZEOF_DALIASFRAME = 24; // bboxmin(4) + bboxmax(4) + name(16)
	const pinframe = offset + SIZEOF_DALIASFRAME;

	poseverts[ posenum ] = { buffer: buf, offset: pinframe };
	posenum ++;

	const SIZEOF_TRIVERTX = 4;		// v[3] + lightnormalindex
	return pinframe + pheader.numverts * SIZEOF_TRIVERTX;

}

// ============================================================================
// Mod_LoadAliasGroup
// ============================================================================

function Mod_LoadAliasGroup( buf, offset, frame ) {

	const view = new DataView( buf, offset );

	// daliasgroup_t: int numframes, trivertx_t bboxmin, trivertx_t bboxmax = 12 bytes
	const numframes = view.getInt32( 0, true );

	frame.firstpose = posenum;
	frame.numposes = numframes;

	const bytes = new Uint8Array( buf, offset );
	frame.bboxmin.v[ 0 ] = bytes[ 4 ];
	frame.bboxmin.v[ 1 ] = bytes[ 5 ];
	frame.bboxmin.v[ 2 ] = bytes[ 6 ];
	frame.bboxmax.v[ 0 ] = bytes[ 8 ];
	frame.bboxmax.v[ 1 ] = bytes[ 9 ];
	frame.bboxmax.v[ 2 ] = bytes[ 10 ];

	const SIZEOF_DALIASGROUP = 12;
	const SIZEOF_DALIASINTERVAL = 4;		// float interval

	// Read interval from first interval
	const intervalView = new DataView( buf, offset + SIZEOF_DALIASGROUP );
	frame.interval = intervalView.getFloat32( 0, true );

	// Skip past all intervals
	let ptemp = offset + SIZEOF_DALIASGROUP + numframes * SIZEOF_DALIASINTERVAL;

	const SIZEOF_DALIASFRAME = 24;
	const SIZEOF_TRIVERTX = 4;

	for ( let i = 0; i < numframes; i ++ ) {

		poseverts[ posenum ] = { buffer: buf, offset: ptemp + SIZEOF_DALIASFRAME };
		posenum ++;

		ptemp = ptemp + SIZEOF_DALIASFRAME + pheader.numverts * SIZEOF_TRIVERTX;

	}

	return ptemp;

}

// ============================================================================
// Mod_FloodFillSkin
//
// Fill background pixels so mipmapping doesn't have haloes - Ed
// ============================================================================

function Mod_FloodFillSkin( skin, skinwidth, skinheight ) {

	const fillcolor = skin[ 0 ];
	const FLOODFILL_FIFO_SIZE = 0x1000;
	const FLOODFILL_FIFO_MASK = FLOODFILL_FIFO_SIZE - 1;

	const fifo_x = new Int16Array( FLOODFILL_FIFO_SIZE );
	const fifo_y = new Int16Array( FLOODFILL_FIFO_SIZE );
	let inpt = 0, outpt = 0;

	let filledcolor = 0;
	// attempt to find opaque black (simplified; Quake uses d_8to24table)
	// For now just use 0

	if ( fillcolor === filledcolor || fillcolor === 255 )
		return;

	fifo_x[ inpt ] = 0;
	fifo_y[ inpt ] = 0;
	inpt = ( inpt + 1 ) & FLOODFILL_FIFO_MASK;

	while ( outpt !== inpt ) {

		const x = fifo_x[ outpt ];
		const y = fifo_y[ outpt ];
		let fdc = filledcolor;
		const posOfs = x + skinwidth * y;

		outpt = ( outpt + 1 ) & FLOODFILL_FIFO_MASK;

		// FLOODFILL_STEP macro equivalent for each direction
		if ( x > 0 ) {

			if ( skin[ posOfs - 1 ] === fillcolor ) {

				skin[ posOfs - 1 ] = 255;
				fifo_x[ inpt ] = x - 1;
				fifo_y[ inpt ] = y;
				inpt = ( inpt + 1 ) & FLOODFILL_FIFO_MASK;

			} else if ( skin[ posOfs - 1 ] !== 255 ) {

				fdc = skin[ posOfs - 1 ];

			}

		}

		if ( x < skinwidth - 1 ) {

			if ( skin[ posOfs + 1 ] === fillcolor ) {

				skin[ posOfs + 1 ] = 255;
				fifo_x[ inpt ] = x + 1;
				fifo_y[ inpt ] = y;
				inpt = ( inpt + 1 ) & FLOODFILL_FIFO_MASK;

			} else if ( skin[ posOfs + 1 ] !== 255 ) {

				fdc = skin[ posOfs + 1 ];

			}

		}

		if ( y > 0 ) {

			if ( skin[ posOfs - skinwidth ] === fillcolor ) {

				skin[ posOfs - skinwidth ] = 255;
				fifo_x[ inpt ] = x;
				fifo_y[ inpt ] = y - 1;
				inpt = ( inpt + 1 ) & FLOODFILL_FIFO_MASK;

			} else if ( skin[ posOfs - skinwidth ] !== 255 ) {

				fdc = skin[ posOfs - skinwidth ];

			}

		}

		if ( y < skinheight - 1 ) {

			if ( skin[ posOfs + skinwidth ] === fillcolor ) {

				skin[ posOfs + skinwidth ] = 255;
				fifo_x[ inpt ] = x;
				fifo_y[ inpt ] = y + 1;
				inpt = ( inpt + 1 ) & FLOODFILL_FIFO_MASK;

			} else if ( skin[ posOfs + skinwidth ] !== 255 ) {

				fdc = skin[ posOfs + skinwidth ];

			}

		}

		skin[ x + skinwidth * y ] = fdc;

	}

}

// ============================================================================
// Mod_LoadAllSkins
// ============================================================================

function Mod_LoadAllSkins( buf, numskins, offset, skinMode = SKIN_MODE_DEFAULT ) {

	if ( numskins < 1 || numskins > MAX_SKINS )
		Sys_Error( 'Mod_LoadAliasModel: Invalid # of skins: ' + numskins );

	const s = pheader.skinwidth * pheader.skinheight;
	const SIZEOF_DALIASSKINTYPE = 4; // int type

	let pos = offset;

	for ( let i = 0; i < numskins; i ++ ) {

		const view = new DataView( buf, pos );
		const skintype = view.getInt32( 0, true );

		if ( skintype === ALIAS_SKIN_SINGLE ) {

			// Skin data starts after the type int
			const skinDataOfs = pos + SIZEOF_DALIASSKINTYPE;
			const skin = new Uint8Array( buf, skinDataOfs, s );
			Mod_FloodFillSkin( skin, pheader.skinwidth, pheader.skinheight );

			// Save 8 bit texels for player model remapping
			pheader.texels[ i ] = new Uint8Array( s );
			pheader.texels[ i ].set( skin );

			const name = loadmodel.name + '_' + i;
			pheader.gl_texturenum[ i ][ 0 ] =
			pheader.gl_texturenum[ i ][ 1 ] =
			pheader.gl_texturenum[ i ][ 2 ] =
			pheader.gl_texturenum[ i ][ 3 ] =
				GL_LoadTexture( name, pheader.skinwidth, pheader.skinheight, skin, true, false, skinMode );

			pos = skinDataOfs + s;

		} else {

			// animating skin group
			pos += SIZEOF_DALIASSKINTYPE;
			const groupView = new DataView( buf, pos );
			const groupskins = groupView.getInt32( 0, true ); // daliasskingroup_t.numskins
			const SIZEOF_DALIASSKINGROUP = 4;
			const SIZEOF_DALIASSKININTERVAL = 4;

			pos += SIZEOF_DALIASSKINGROUP + groupskins * SIZEOF_DALIASSKININTERVAL;

			for ( let j = 0; j < groupskins; j ++ ) {

				const skin = new Uint8Array( buf, pos, s );
				Mod_FloodFillSkin( skin, pheader.skinwidth, pheader.skinheight );

				if ( j === 0 ) {

					pheader.texels[ i ] = new Uint8Array( s );
					pheader.texels[ i ].set( skin );

				}

				const name = loadmodel.name + '_' + i + '_' + j;
				pheader.gl_texturenum[ i ][ j & 3 ] =
					GL_LoadTexture( name, pheader.skinwidth, pheader.skinheight, skin, true, false, skinMode );

				pos += s;

			}

			// fill remaining texture slots
			for ( let j = groupskins; j < 4; j ++ )
				pheader.gl_texturenum[ i ][ j & 3 ] = pheader.gl_texturenum[ i ][ j - groupskins ];

		}

	}

	return pos;

}

// ============================================================================
// Mod_LoadAliasModel
// ============================================================================

/**
 * Loads an alias (.mdl) model into `mod` (WinQuake gl_model.c; called by `Mod_LoadModel` for its bytes): the header,
 * the skins, texture coordinates, triangles and frames, its bounds and display lists (gl_mesh.js), and a record of
 * the source bytes' identity whose SHA-256 is worked out in the background (`mod.aliasSourceIdentity`).
 *
 * @param {model_t} mod the model to fill (`loadmodel`)
 * @param {ArrayBuffer} buffer the whole .mdl file
 * @throws {Error} via `Sys_Error` for a wrong version, a skin taller than `MAX_LBM_HEIGHT`, no or too many vertices,
 *   and the other limits the format sets
 */
export function Mod_LoadAliasModel( mod, buffer ) {

	const view = new DataView( buffer );
	const bytes = new Uint8Array( buffer );

	// mdl_t header
	const ident = view.getUint32( 0, true ), newModel = ident === RAPOLYHEADER;
	const version = view.getInt32( 4, true );
	if ( newModel ? version !== ALIAS_NEWVERSION : version !== ALIAS_VERSION )
		Sys_Error( mod.name + ' has wrong version number (' + version + ' should be ' + ( newModel ? ALIAS_NEWVERSION : ALIAS_VERSION ) + ')' );

 // Alias identity belongs to the exact loaded bytes, not its filename or a
 // future pack lookup. Copy once before asynchronous hashing; native decode,
 // geometry and Classic skins stay synchronous and unchanged.
 const sourceBytes=bytes.slice(),identity={state:'pending',sha256:null,error:null,promise:null};
 mod.aliasSourceIdentity=identity;
 identity.promise=Promise.resolve().then(()=>{
  if(!globalThis.crypto?.subtle)throw new Error('Alias source digest unavailable');
  return globalThis.crypto.subtle.digest('SHA-256',sourceBytes);
 }).then(hash=>{identity.sha256=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');identity.state='ready';return identity.sha256;})
 .catch(error=>{identity.state='unavailable';identity.error=String(error.message||error);return null;});

	const numframes = view.getInt32( 68, true ); // offset of numframes in mdl_t/newmdl_t
	const numStVerts = newModel ? view.getInt32( 84, true ) : view.getInt32( 60, true );

	// Allocate header
	pheader = new aliashdr_t();
	pheader.frames = [];

	for ( let i = 0; i < numframes; i ++ )
		pheader.frames[ i ] = new maliasframedesc_t();

	mod.flags = view.getInt32( 72, true );

	// Copy header data from mdl_t
	// mdl_t layout: ident(4), version(4), scale(12), scale_origin(12), boundingradius(4),
	// eyeposition(12), numskins(4), skinwidth(4), skinheight(4), numverts(4), numtris(4),
	// numframes(4), synctype(4), flags(4), size(4) = total 84 bytes
	pheader.boundingradius = view.getFloat32( 32, true );

	// mdl_t offsets:
	// int ident = 0
	// int version = 4
	// vec3_t scale = 8, 12, 16
	// vec3_t scale_origin = 20, 24, 28
	// float boundingradius = 32
	// vec3_t eyeposition = 36, 40, 44
	// int numskins = 48
	// int skinwidth = 52
	// int skinheight = 56
	// int numverts = 60
	// int numtris = 64
	// int numframes = 68
	// synctype_t synctype = 72
	// int flags = 76
	// float size = 80
	// total = 84

	pheader.numskins = view.getInt32( 48, true );
	pheader.skinwidth = view.getInt32( 52, true );
	pheader.skinheight = view.getInt32( 56, true );
	pheader.numverts = view.getInt32( 60, true );
	pheader.numtris = view.getInt32( 64, true );
	pheader.numframes = view.getInt32( 68, true );

	if ( pheader.skinheight > MAX_LBM_HEIGHT )
		Sys_Error( 'model ' + mod.name + ' has a skin taller than ' + MAX_LBM_HEIGHT );
	if ( pheader.numverts <= 0 )
		Sys_Error( 'model ' + mod.name + ' has no vertices' );
	if ( pheader.numverts > MAXALIASVERTS )
		Sys_Error( 'model ' + mod.name + ' has too many vertices' );
	if ( pheader.numtris <= 0 )
		Sys_Error( 'model ' + mod.name + ' has no triangles' );
	if ( pheader.numtris > MAXALIASTRIS )
		Sys_Error( 'model ' + mod.name + ' has too many triangles' );
	if ( pheader.numframes < 1 )
		Sys_Error( 'Mod_LoadAliasModel: Invalid # of frames: ' + pheader.numframes );

	pheader.size = view.getFloat32( 80, true ) * ALIAS_BASE_SIZE_RATIO;
	mod.synctype = view.getInt32( 72, true );
	mod.numframes = pheader.numframes;
	mod.flags = view.getInt32( 76, true );

	for ( let i = 0; i < 3; i ++ ) {

		pheader.scale[ i ] = view.getFloat32( 8 + i * 4, true );
		pheader.scale_origin[ i ] = view.getFloat32( 20 + i * 4, true );
		pheader.eyeposition[ i ] = view.getFloat32( 36 + i * 4, true );

	}

	pheader.boundingradius = view.getFloat32( 32, true );

	// Initialize frames array
	pheader.frames = [];
	for ( let i = 0; i < pheader.numframes; i ++ )
		pheader.frames[ i ] = new maliasframedesc_t();

	//
	// load the skins
	//
	const SIZEOF_MDL = newModel ? 88 : 84;
	const skinMode = R_ModelSkinMode( mod.flags );
	let pos = Mod_LoadAllSkins( buffer, pheader.numskins, SIZEOF_MDL, skinMode );

	// keep the class models' raw skins for R_TranslatePlayerSkin (native player_8bit_texels)
	const classIndex = HEXEN2_PLAYER_CLASS_MODELS.indexOf( mod.name.toLowerCase() );
	if ( classIndex >= 0 && pheader.texels[ 0 ] != null )
		playerClassTexels[ classIndex ] = {
			data: pheader.texels[ 0 ], width: pheader.skinwidth, height: pheader.skinheight, model: mod.name
		};

	//
	// load base s and t vertices
	// stvert_t: int onseam, int s, int t = 12 bytes
	//
	const SIZEOF_STVERT = 12;
	if ( numStVerts <= 0 || numStVerts > MAXALIASVERTS ) Sys_Error( mod.name + ' has invalid ST vertices' );
	for ( let i = 0; i < numStVerts; i ++ ) {

		const sv = new DataView( buffer, pos + i * SIZEOF_STVERT );
		stverts[ i ].onseam = sv.getInt32( 0, true );
		stverts[ i ].s = sv.getInt32( 4, true );
		stverts[ i ].t = sv.getInt32( 8, true );

	}

	pos += numStVerts * SIZEOF_STVERT;

	//
	// load triangle lists
	// dtriangle_t: int facesfront, int vertindex[3] = 16 bytes
	//
	const SIZEOF_DTRIANGLE = 16;
	for ( let i = 0; i < pheader.numtris; i ++ ) {

		const tv = new DataView( buffer, pos + i * SIZEOF_DTRIANGLE );
		triangles[ i ].facesfront = tv.getInt32( 0, true );
		for ( let j = 0; j < 3; j ++ ) {

			triangles[ i ].vertindex[ j ] = newModel ? tv.getUint16( 4 + j * 2, true ) : tv.getInt32( 4 + j * 4, true );
			triangles[ i ].stindex[ j ] = newModel ? tv.getUint16( 10 + j * 2, true ) : triangles[ i ].vertindex[ j ];

		}

	}

	pos += pheader.numtris * SIZEOF_DTRIANGLE;

	//
	// load the frames
	//
	posenum = 0;
	const SIZEOF_DALIASFRAMETYPE = 4; // int type

	for ( let i = 0; i < pheader.numframes; i ++ ) {

		const ftView = new DataView( buffer, pos );
		const frametype = ftView.getInt32( 0, true );

		if ( frametype === ALIAS_SINGLE ) {

			pos = Mod_LoadAliasFrame( buffer, pos + SIZEOF_DALIASFRAMETYPE, pheader.frames[ i ] );

		} else {

			pos = Mod_LoadAliasGroup( buffer, pos + SIZEOF_DALIASFRAMETYPE, pheader.frames[ i ] );

		}

	}

	pheader.numposes = posenum;

	mod.type = mod_alias;

	// FIXME: do this right
	mod.mins[ 0 ] = mod.mins[ 1 ] = mod.mins[ 2 ] = - 16;
	mod.maxs[ 0 ] = mod.maxs[ 1 ] = mod.maxs[ 2 ] = 16;

	//
	// Decode poseverts from raw {buffer, offset} into arrays of trivertx_t objects
	// so that GL_MakeAliasModelDisplayLists can index them
	//
	const decodedPoseverts = [];
	for ( let i = 0; i < pheader.numposes; i ++ ) {

		const pv = poseverts[ i ];
		const verts = [];
		const data = new Uint8Array( pv.buffer );
		for ( let j = 0; j < pheader.numverts; j ++ ) {

			const off = pv.offset + j * 4; // trivertx_t = 4 bytes: v[3] + lightnormalindex
			verts.push( {
				v: [ data[ off ], data[ off + 1 ], data[ off + 2 ] ],
				lightnormalindex: data[ off + 3 ]
			} );

		}

		decodedPoseverts.push( verts );

	}

	// Hexen II lights an alias model at the middle of its real frame bounds (uhexen2 gl_model.c:2706-2743 computes
	// them from every pose). Keep only that centre: mod.mins/maxs stay Quake's ±16 placeholder, which the server's
	// setmodel copies into edicts, so collision boxes are untouched. Computed for every model (a Quake session never
	// reads it) so a cached model means the same thing whichever profile loads it.
	let minZ = Infinity, maxZ = - Infinity;
	for ( const pose of decodedPoseverts ) for ( const vert of pose ) {

		const z = vert.v[ 2 ] * pheader.scale[ 2 ] + pheader.scale_origin[ 2 ];
		if ( z < minZ ) minZ = z;
		if ( z > maxZ ) maxZ = z;

	}
	if ( minZ <= maxZ ) pheader.lightZCentre = ( minZ + maxZ ) / 2;

	// Wire up data needed by GL_MakeAliasModelDisplayLists
	pheader.triangles = triangles;
	pheader.stverts = stverts;
	pheader.poseverts = decodedPoseverts;

	//
	// build the draw lists
	//
	GL_MakeAliasModelDisplayLists( mod, pheader );

	//
	// move the complete, relocatable alias model to the cache
	//
	mod.cache.data = pheader;

}
