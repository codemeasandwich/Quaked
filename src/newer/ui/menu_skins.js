/**
 * @module newer/ui/menu_skins
 *
 * The per-game skins of the dynamic (WebGL) menu. One renderer and one set of native pages serve both games; a skin only
 * changes data: the distance-field font atlas, the material, how a game's own pictures are presented and which selector
 * animation is used. Quake's skin is the supplied renderer exactly as it was (its embedded DpQuake atlas, bronze
 * materials and rotating Q); Hexen II's is built at runtime from the player's installed data:
 *
 * - `font`: `gfx/menu/bigfont2.lmp` (falling back to `bigfont.lmp`) supplies the 27 20 x 19 menu capitals (A-Z and `/`)
 *   and `gfx/menu/conchars.lmp` the 8 x 8 small font. Both are upsampled and converted to a signed distance field here;
 *   `gfx/menu/fontsize.lmp` (the native 27 x 27 advance table) supplies the bigfont advances. No glyph is shipped and
 *   none comes from Quake's atlas. Bigfont glyphs live in the private-use block starting at `0xE000` so a single atlas
 *   can carry both sizes; `MenuSkin_BigfontIndex` maps a native character to its cell.
 * - `material`: `stone`, a cool grey variant of the renderer's own material functions. The material no-art rule holds:
 *   the GLSL is derived from the supplied shaders, only the hue/roughness terms change, and the existing wear/grain/
 *   exposure uniforms are tuned by `config`.
 * - `image`: Hexen II's title plaques, help pages and menu art are drawn from the original pictures through the
 *   high-resolution image path, smoothed (never replaced with guessed typography). The scroll title is animated in the
 *   adapter, so its source picture is only ever a picture.
 * - `selector`: the native animated `gfx/menu/menudot*.lmp`, not the rotating Q.
 *
 * Types: plain frozen objects and functions; no exported classes.
 *
 * State: no mutable exports. All builders are pure and return their result.
 *
 * Errors: `BuildHexen2FontAtlas` returns null for missing or malformed sources rather than throwing;
 * `MenuSkin_ApplyPrograms` compiles GLSL and can throw the WebGL compiler's message.
 */

/** Private-use code point of bigfont cell 0 (A); the rest of A-Z and `/` follow. */
export const MENU_BIGFONT_BASE = 0xE000;

// The native bigfont sheet: 8 columns, 20 x 19 cells on a 20-pixel row pitch (uhexen2 menu.c:380-463).
const BIGFONT = Object.freeze( { columns: 8, width: 20, height: 19, pitch: 20 } );
const BIGFONT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ/';
const SMALL_WIDTH = 8, SMALL_HEIGHT = 8;

/** Quake's skin: the supplied renderer's own atlas, bronze material and rotating Q, byte for byte. */
const QUAKE_SKIN = Object.freeze( {
	id: 'quake',
	material: 'bronze',
	config: Object.freeze( { wear: 1, grain: 1, exposure: 1, copper: 1, bevel: 1, selectorRotate: true } ),
	font: null,
	image: Object.freeze( { smooth: false } ),
	selector: 'q'
} );

/** Hexen II's skin: runtime bigfont/conchars atlas, grey stone, original pictures and the menudot selector. */
const HEXEN2_SKIN = Object.freeze( {
	id: 'hexen2',
	material: 'stone',
	// The material uniforms the supplied shaders already expose: colder, rougher, slightly less exposed stone.
	config: Object.freeze( { wear: 0.55, grain: 0.85, exposure: 0.92, copper: 0.82, bevel: 1.1, selectorRotate: false, smallCaps: false } ),
	font: Object.freeze( {
		privateBase: MENU_BIGFONT_BASE,
		bigfont: Object.freeze( [ 'gfx/menu/bigfont2.lmp', 'gfx/menu/bigfont.lmp' ] ),
		conchars: 'gfx/menu/conchars.lmp',
		fontWidths: 'gfx/menu/fontsize.lmp'
	} ),
	image: Object.freeze( { smooth: true } ),
	selector: 'menudot'
} );

/** The known skins by id. */
export const MENU_SKINS = Object.freeze( { quake: QUAKE_SKIN, hexen2: HEXEN2_SKIN } );

/**
 * The skin for a game profile: Hexen II's for any Hexen II edition, Quake's for everything else.
 *
 * @param {?object} [profile] a game profile (defaults to the active one through the caller)
 * @returns {object} the frozen skin
 */
export function MenuSkin_For( profile ) {

	const named = profile?.menuSkin ? MENU_SKINS[ profile.menuSkin ] : null;
	if ( named ) return named;
	return profile?.family === 'hexen2' ? HEXEN2_SKIN : QUAKE_SKIN;

}

/**
 * The native bigfont cell of a character: 0..25 for A-Z, 26 for `/`, 32 for a space and -1 for anything else. Mirrors
 * uhexen2 `M_DrawBigCharacter` (menu.c:465-493).
 *
 * @param {string} character one character
 * @returns {number} the cell, 32 for a space, or -1
 */
export function MenuSkin_BigfontIndex( character ) {

	if ( character === ' ' ) return 32;
	if ( character === '/' ) return 26;
	const code = String( character ).toUpperCase().charCodeAt( 0 ) - 65;
	return code >= 0 && code < 26 ? code : - 1;

}

// ---------------------------------------------------------------------------
// Signed-distance font atlas built from the installed game data.
// ---------------------------------------------------------------------------

function nextPower( value ) { return 2 ** Math.ceil( Math.log2( Math.max( 1, value ) ) ); }
const clamp01 = value => Math.max( 0, Math.min( 1, value ) );

// The source is either a raw palette-index qpic/conchars sheet (`data`, 0 transparent) or RGBA pixels (`imageData` or a
// canvas). Keeping the raw sheet path first matters: qpic conversion maps 255 to transparent while the native bigfont
// uses 0, so reading pixels from a canvas would treat the sheet's transparent margin as solid black.
function pixelSource( source, transparent = 0 ) {

	if ( ! source ) return null;
	const width = source.width | 0, height = source.height | 0;
	if ( ! ( width > 0 && height > 0 ) ) return null;
	if ( source.imageData?.data ) return rgbaSource( source.imageData.data, width, height );
	let data = source.data;
	if ( ! data && source.canvas?.getContext ) {

		try { data = source.canvas.getContext( '2d' ).getImageData( 0, 0, source.canvas.width, source.canvas.height ).data; }
		catch { return null; }
		// a canvas is RGBA, even if the sheet was palette indexed
		return rgbaSource( data, source.canvas.width, source.canvas.height );

	}
	if ( ! data ) return null;
	if ( data.length >= width * height * 4 && source.rgba ) return rgbaSource( data, width, height );
	if ( data.length < width * height ) return null;
	const alpha = new Uint8Array( width * height );
	for ( let i = 0; i < alpha.length; i ++ ) alpha[ i ] = data[ i ] === transparent ? 0 : 1;
	return { width, height, alpha };

}

function rgbaSource( data, width, height ) {

	const alpha = new Uint8Array( width * height );
	for ( let i = 0; i < alpha.length; i ++ ) alpha[ i ] = data[ i * 4 + 3 ] > 24 ? 1 : 0;
	return { width, height, alpha };

}

// Bilinear coverage at a source pixel coordinate: (0,0) is the top-left corner of pixel 0.
function coverageAt( source, x, y ) {

	const px = x - .5, py = y - .5;
	const x0 = Math.floor( px ), y0 = Math.floor( py );
	const fx = px - x0, fy = py - y0;
	const at = ( ix, iy ) => {

		const cx = Math.max( 0, Math.min( source.width - 1, ix ) );
		const cy = Math.max( 0, Math.min( source.height - 1, iy ) );
		return source.alpha[ cy * source.width + cx ];

	};
	return ( at( x0, y0 ) * ( 1 - fx ) + at( x0 + 1, y0 ) * fx ) * ( 1 - fy )
		+ ( at( x0, y0 + 1 ) * ( 1 - fx ) + at( x0 + 1, y0 + 1 ) * fx ) * fy;

}

// Felzenszwalb and Huttenlocher's exact squared Euclidean distance transform, one dimension at a time. The result is
// the squared distance to the nearest pixel whose mask equals `toInside`.
function edt1d( f, n, out, v, z ) {

	let k = 0;
	v[ 0 ] = 0; z[ 0 ] = - 1e20; z[ 1 ] = 1e20;
	for ( let q = 1; q < n; q ++ ) {

		let s;
		do {

			s = ( ( f[ q ] + q * q ) - ( f[ v[ k ] ] + v[ k ] * v[ k ] ) ) / ( 2 * ( q - v[ k ] ) );
			if ( s <= z[ k ] ) k --; else break;

		} while ( k >= 0 );
		if ( k < 0 ) { k = 0; v[ 0 ] = q; z[ 0 ] = - 1e20; z[ 1 ] = 1e20; }
		else { k ++; v[ k ] = q; z[ k ] = s; z[ k + 1 ] = 1e20; }

	}
	k = 0;
	for ( let q = 0; q < n; q ++ ) {

		while ( z[ k + 1 ] < q ) k ++;
		const dx = q - v[ k ];
		out[ q ] = dx * dx + f[ v[ k ] ];

	}

}

function distanceTransform( mask, width, height, toInside ) {

	const size = Math.max( width, height );
	const f = new Float64Array( size ), d = new Float64Array( size ), v = new Int32Array( size ), z = new Float64Array( size + 1 );
	const tmp = new Float64Array( width * height ), result = new Float64Array( width * height );
	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) f[ x ] = ( mask[ y * width + x ] === 1 ) === toInside ? 0 : 1e12;
		edt1d( f, width, d, v, z );
		for ( let x = 0; x < width; x ++ ) tmp[ y * width + x ] = d[ x ];

	}
	for ( let x = 0; x < width; x ++ ) {

		for ( let y = 0; y < height; y ++ ) f[ y ] = tmp[ y * width + x ];
		edt1d( f, height, d, v, z );
		for ( let y = 0; y < height; y ++ ) result[ y * width + x ] = d[ y ];

	}
	return result;

}

// One glyph: upsample the cell with bilinear coverage, threshold to a mask, take the signed distance to that mask and
// encode it as 0..255 around 0.5 (the renderer's glyph shader decodes `(r - .5) * range * 2`). `range` stays in source
// pixels so `_shape` can scale it with the requested em.
function buildGlyph( source, cellX, cellY, cellWidth, cellHeight, em, radius, upscale, pad ) {

	const width = ( cellWidth + pad * 2 ) * upscale, height = ( cellHeight + pad * 2 ) * upscale;
	const mask = new Uint8Array( width * height );
	for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

		const coverage = coverageAt( source, cellX - pad + ( x + .5 ) / upscale, cellY - pad + ( y + .5 ) / upscale );
		mask[ y * width + x ] = coverage >= .5 ? 1 : 0;

	}
	const inside = distanceTransform( mask, width, height, false );
	const outside = distanceTransform( mask, width, height, true );
	const pixels = new Uint8Array( width * height );
	for ( let i = 0; i < pixels.length; i ++ ) {

		const distance = ( Math.sqrt( outside[ i ] ) - Math.sqrt( inside[ i ] ) + ( mask[ i ] ? .5 : - .5 ) ) / upscale;
		pixels[ i ] = Math.round( clamp01( .5 + distance / ( radius * 2 ) ) * 255 );

	}
	// Ink bounds inside the unpadded cell, in source pixels. The tile's own transparent padding still surrounds them.
	let minX = cellWidth, minY = cellHeight, maxX = - 1, maxY = - 1;
	for ( let y = 0; y < cellHeight; y ++ ) for ( let x = 0; x < cellWidth; x ++ ) {

		if ( coverageAt( source, cellX + x + .5, cellY + y + .5 ) < .5 ) continue;
		if ( x < minX ) minX = x; if ( x > maxX ) maxX = x;
		if ( y < minY ) minY = y; if ( y > maxY ) maxY = y;

	}
	if ( maxX < 0 ) return null;
	return { width, height, pixels, ink: [ minX / em, minY / em, ( maxX - minX + 1 ) / em, ( maxY - minY + 1 ) / em ],
		plane: [ - pad / em, - pad / em, ( cellWidth + pad * 2 ) / em, ( cellHeight + pad * 2 ) / em ] };

}

function blankGlyph( em, advance ) {

	return { advance, em, range: 1, plane: [ 0, 0, 1, 1 ], ink: [ 0, 0, 0, 0 ] };

}

/**
 * Builds one distance-field atlas from the installed Hexen II fonts. Sources are raw qpic/conchars data
 * (`{ width, height, data }`, palette index 0 transparent) or pictures/canvases. The bigfont's advances come from the
 * native `fontsize.lmp` 27 x 27 table when supplied; otherwise the sheet's cell width is used.
 *
 * @param {{ bigfont?: ?object, conchars?: ?object, widths?: ?(Uint8Array|ArrayLike<number>) }} sources the installed
 *   font sheets and the native advance table
 * @param {{ upscale?: number, radius?: number, maxTextureSize?: number }} [options] atlas quality limits
 * @returns {?{ metrics: object, data: Uint8Array, info: { bigfont: number, conchars: number, width: number,
 *   height: number } }} the renderer's font metrics, 8-bit atlas pixels (row-major) and a small report; null when no
 *   usable sheet is present
 */
export function BuildHexen2FontAtlas( sources, options = {} ) {

	const upscale = Math.max( 2, Math.min( 6, options.upscale ?? 4 ) );
	const maxTextureSize = Math.max( 256, Math.min( 4096, options.maxTextureSize ?? 4096 ) );
	const bigSource = pixelSource( sources?.bigfont );
	const smallSource = pixelSource( sources?.conchars );
	if ( ! bigSource && ! smallSource ) return null;
	const widths = sources?.widths && sources.widths.length === 27 * 27 ? sources.widths : null;
	const glyphs = {};
	const packed = [];

	if ( bigSource ) {

		for ( let index = 0; index < BIGFONT_LETTERS.length; index ++ ) {

			const cellX = ( index % BIGFONT.columns ) * BIGFONT.width;
			const cellY = Math.floor( index / BIGFONT.columns ) * BIGFONT.pitch;
			if ( cellX + BIGFONT.width > bigSource.width || cellY + BIGFONT.height > bigSource.height ) continue;
			const advance = ( widths ? widths[ index * 27 + index ] : BIGFONT.width ) / BIGFONT.height;
			const key = String.fromCharCode( MENU_BIGFONT_BASE + index );
			const glyph = buildGlyph( bigSource, cellX, cellY, BIGFONT.width, BIGFONT.height, BIGFONT.height, options.bigRadius ?? 2.5, upscale, 2 );
			if ( ! glyph ) { glyphs[ key ] = blankGlyph( BIGFONT.height, advance ); continue; }
			glyphs[ key ] = { advance, em: BIGFONT.height, range: options.bigRadius ?? 2.5,
				plane: glyph.plane, ink: glyph.ink };
			packed.push( { key, glyph } );

		}

	}

	if ( smallSource ) {

		const columns = Math.floor( smallSource.width / SMALL_WIDTH );
		const rows = Math.floor( smallSource.height / SMALL_HEIGHT );
		const count = Math.min( 256, columns * rows );
		for ( let code = 0; code < count; code ++ ) {

			const key = String.fromCharCode( code );
			if ( code === 32 ) { glyphs[ key ] = blankGlyph( SMALL_HEIGHT, 1 ); continue; }
			const cellX = ( code % columns ) * SMALL_WIDTH, cellY = Math.floor( code / columns ) * SMALL_HEIGHT;
			const glyph = buildGlyph( smallSource, cellX, cellY, SMALL_WIDTH, SMALL_HEIGHT, SMALL_HEIGHT, options.smallRadius ?? 1.5, upscale, 1 );
			if ( ! glyph ) { glyphs[ key ] = blankGlyph( SMALL_HEIGHT, 1 ); continue; }
			glyphs[ key ] = { advance: 1, em: SMALL_HEIGHT, range: options.smallRadius ?? 1.5,
				plane: glyph.plane, ink: glyph.ink };
			packed.push( { key, glyph } );

		}

	}

	const limit = Math.min( maxTextureSize, 4096 );
	let width = Math.min( limit, 1024 );
	packed.sort( ( a, b ) => b.glyph.height - a.glyph.height || ( a.key < b.key ? - 1 : 1 ) );
	const pack = () => {

		let x = 0, y = 0, row = 0;
		for ( const entry of packed ) {

			if ( x + entry.glyph.width + 2 > width ) { x = 0; y += row + 2; row = 0; }
			entry.glyph.atlas = [ x, y, entry.glyph.width, entry.glyph.height ];
			x += entry.glyph.width + 2;
			row = Math.max( row, entry.glyph.height );

		}
		return nextPower( y + row );

	};
	let height = pack();
	if ( height > limit && width < limit ) { width = limit; height = pack(); }
	if ( height > limit ) return null;

	const data = new Uint8Array( width * height );
	for ( const entry of packed ) {

		const [ x, y ] = entry.glyph.atlas;
		for ( let row = 0; row < entry.glyph.height; row ++ )
			data.set( entry.glyph.pixels.subarray( row * entry.glyph.width, ( row + 1 ) * entry.glyph.width ), ( y + row ) * width + x );
		glyphs[ entry.key ].atlas = [ x, y, entry.glyph.width, entry.glyph.height ];

	}

	const bigfont = bigSource ? BIGFONT_LETTERS.length : 0;
	const conchars = smallSource ? Math.min( 256, Math.floor( smallSource.width / SMALL_WIDTH ) * Math.floor( smallSource.height / SMALL_HEIGHT ) ) : 0;
	return {
		metrics: { family: 'Hexen II stock fonts', sourceName: 'gfx/menu/bigfont2.lmp + gfx/menu/conchars.lmp',
			unitsPerEm: 1, capHeight: .8, range: options.bigRadius ?? 2.5, glyphs, width, height },
		data,
		info: { bigfont, conchars, width, height }
	};

}

// ---------------------------------------------------------------------------
// Stone material: the same shader structure with the two material functions replaced.
// ---------------------------------------------------------------------------

const STONE_MATERIAL = `vec3 bronze(vec2 p, float vertical) {
    float cloud = .66*fbm(p * .105) + .34*fbm(p*.023);
    float islands = fbm(p * .155 + 41.0);
    float grit = noise2(p * 1.8);
    float scratches = pow(noise2(vec2(p.x * .052, p.y * 2.6)), 7.0);
    float tone = mix(.30, .53, smoothstep(.19,.77,cloud));
    tone += (islands-.46)*.10*u_wear;
    tone -= smoothstep(.58,.74,islands)*.06*u_wear;
    tone += (grit-.5)*.10*u_grain;
    tone += (noise2(p*.48+31.)-.5)*.06*u_grain;
    tone += scratches*.05*u_wear;
    tone -= smoothstep(.77,.94,noise2(p*2.8+87.0))*.08*u_wear;
    vec3 c = vec3(tone) * mix(vec3(.82,.84,.87), vec3(1.03,1.02,1.0), vertical);
    return max(c, vec3(.02));
}
vec3 copper(vec2 p) {
    float cloud = fbm(p*.072 + 43.8);
    float fine = noise2(p*1.45);
    float oxidation = smoothstep(.51,.74,fbm(p*.19+93.0));
    float tone = mix(.34, .58, smoothstep(.18,.81,cloud));
    tone = mix(tone, .44, oxidation*.20*u_wear);
    tone += (fine-.5)*.035*u_grain;
    tone += pow(noise2(vec2(p.x*.17,p.y*2.0)),9.)*.03*u_wear;
    return max(vec3(tone, tone*1.01, tone*1.02), vec3(.02));
}
`;

const STONE_REPLACEMENTS = Object.freeze( [
	[ 'vec3(31.,15.,6.)/255.', 'vec3(18.,18.,20.)/255.' ],
	[ 'vec3(86.,42.,18.),vec3(188.,113.,57.)', 'vec3(70.,71.,74.),vec3(166.,167.,172.)' ],
	[ 'vec3(.058,.042,.014)*glint', 'vec3(.020,.021,.024)*glint' ],
	[ 'c=vec3(.055,.042,.023);', 'c=vec3(.030,.031,.034);' ],
	[ 'mix(vec3(.014,.010,.003),vec3(.052,.029,.010),noise2(v_world*.11))', 'mix(vec3(.014,.015,.018),vec3(.048,.049,.053),noise2(v_world*.11))' ]
] );

function replaceFunction( source, name, replacement ) {

	const start = source.indexOf( 'vec3 ' + name + '(' );
	if ( start < 0 ) return source;
	const brace = source.indexOf( '{', start );
	if ( brace < 0 ) return source;
	let depth = 0, end = brace;
	for ( ; end < source.length; end ++ ) {

		if ( source[ end ] === '{' ) depth ++;
		else if ( source[ end ] === '}' ) { depth --; if ( depth === 0 ) { end ++; break; } }

	}
	return source.slice( 0, start ) + replacement + source.slice( end );

}

/**
 * A copy of the supplied shader strings whose `bronze`/`copper` material functions are grey stone. The input is never
 * changed, so Quake's renderer keeps the supplied bronze materials exactly.
 *
 * @param {object} shaders the generated `QUAKE_SHADERS` object
 * @returns {object} a shallow copy with stone fragment shaders
 */
export function MenuSkin_StoneShaders( shaders ) {

	const output = { ...shaders };
	for ( const [ name, source ] of Object.entries( output ) ) {

		if ( typeof source !== 'string' || ! source.includes( 'vec3 bronze(' ) ) continue;
		let stone = replaceFunction( replaceFunction( source, 'copper', STONE_MATERIAL.slice( STONE_MATERIAL.indexOf( 'vec3 copper(' ) ) ), 'bronze',
			STONE_MATERIAL.slice( 0, STONE_MATERIAL.indexOf( 'vec3 copper(' ) ) );
		// The glyph/plaque shaders also carry a few hard-coded warm rim and groove colours; make them cool neutral stone too.
		for ( const [ warm, cool ] of STONE_REPLACEMENTS ) stone = stone.split( warm ).join( cool );
		output[ name ] = stone;

	}
	return output;

}

function makeProgram( gl, vertex, fragment ) {

	const compile = ( type, source ) => {

		const shader = gl.createShader( type );
		gl.shaderSource( shader, source ); gl.compileShader( shader );
		if ( ! gl.getShaderParameter( shader, gl.COMPILE_STATUS ) ) {

			const message = gl.getShaderInfoLog( shader ); gl.deleteShader( shader );
			throw new Error( `GLSL compilation failed:\n${message}` );

		}
		return shader;

	};
	const vs = compile( gl.VERTEX_SHADER, vertex );
	let fs, program;
	try {

		fs = compile( gl.FRAGMENT_SHADER, fragment );
		program = gl.createProgram();
		gl.attachShader( program, vs ); gl.attachShader( program, fs ); gl.linkProgram( program );

	} catch ( error ) { if ( program ) gl.deleteProgram( program ); throw error; }
	finally { gl.deleteShader( vs ); if ( fs ) gl.deleteShader( fs ); }
	if ( ! gl.getProgramParameter( program, gl.LINK_STATUS ) ) {

		const message = gl.getProgramInfoLog( program ); gl.deleteProgram( program );
		throw new Error( `WebGL program link failed:\n${message}` );

	}
	const locations = new Map();
	return { program, uniform( name ) {

		if ( ! locations.has( name ) ) locations.set( name, gl.getUniformLocation( program, name ) );
		return locations.get( name );

	} };

}

/**
 * Replaces a live renderer's six programs with the skin's material set. The vertex shaders and every layout/uniform
 * name stay the supplied ones; only the fragment material functions change. New programs are compiled before the old
 * ones are deleted, and a compile failure leaves the previous set in place.
 *
 * @param {object} renderer a loaded `QuakeMenu`
 * @param {object} shaders the generated `QUAKE_SHADERS`
 * @param {object} skin one of `MENU_SKINS`
 * @returns {boolean} true when the stone set was applied, false when the supplied set was restored
 * @throws {Error} when a shader fails to compile or link
 */
export function MenuSkin_ApplyPrograms( renderer, shaders, skin ) {

	const gl = renderer.gl;
	const stone = skin?.material === 'stone';
	const sources = stone ? MenuSkin_StoneShaders( shaders ) : shaders;
	const entries = [
		[ 'background', 'backgroundVertex', 'backgroundFragment' ], [ 'plaque', 'rectVertex', 'plaqueFragment' ],
		[ 'glyph', 'glyphVertex', 'glyphFragment' ], [ 'copy', 'backgroundVertex', 'copyFragment' ],
		[ 'selectorMask', 'backgroundVertex', 'selectorMaskFragment' ], [ 'selector', 'selectorVertex', 'selectorFragment' ]
	];
	const programs = {};
	try {

		for ( const [ name, vertex, fragment ] of entries ) programs[ name ] = makeProgram( gl, sources[ vertex ], sources[ fragment ] );

	} catch ( error ) {

		for ( const program of Object.values( programs ) ) gl.deleteProgram( program.program );
		throw error;

	}
	for ( const program of Object.values( renderer.programs || {} ) ) gl.deleteProgram( program.program );
	renderer.programs = programs;
	renderer.backgroundDirty = true;
	return stone;

}
