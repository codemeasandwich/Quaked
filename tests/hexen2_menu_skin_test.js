// M2: the dynamic menu's per-game skins. The Hexen II atlas is built at runtime from the installed bigfont/conchars
// bitmaps and the native advance table; every Hexen page then emits dynamic text/panel/image/selector commands with the
// Hexen skin and the menudot selector. Quake's own command stream is snapshotted to prove its skin and output are
// unchanged. GPU appearance is not claimed here (tests/menu_webgl_gpu_trial.html and the live capture do).
import { existsSync, readFileSync } from './helpers/resource_fs.mjs';
import * as menu from '../src/engine/client/menu.js';
import * as draw from '../src/engine/render/gl_draw.js';
import * as gpu from '../src/newer/ui/menu_webgl.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as keys from '../src/engine/client/keys.js';
import * as pak from '../src/engine/common/pak.js';
import { W_LoadWadFile } from '../src/engine/common/wad.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { NewerBindings } from '../src/newer/content_bindings.js';
import { BuildHexen2FontAtlas, MENU_SKINS, MenuSkin_BigfontIndex, MenuSkin_StoneShaders } from '../src/newer/ui/menu_skins.js';
import { M_Hexen2_Reset, M_Hexen2_Menu_Main_f, M_Hexen2_Menu_SinglePlayer_f, M_Hexen2_Menu_Class_f,
	M_Hexen2_Menu_Skill_f } from '../src/engine/client/menu_hexen2.js';
import { M_Hexen2_Menu_Options_f, M_Hexen2_Menu_Keys_f } from '../src/engine/client/menu_hexen2_options.js';
import { M_Hexen2_Menu_Help_f, M_Hexen2_Menu_Quit_f } from '../src/engine/client/menu_hexen2_help.js';
import { M_Hexen2_Menu_Multiplayer_f, M_Hexen2_Menu_Setup_f, M_Hexen2_Menu_Load_f,
	M_Hexen2_Menu_Save_f } from '../src/engine/client/menu_hexen2_multiplayer.js';
import { M_Menu_Video_f } from '../src/engine/client/menu_options.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( actual, expected, label ) => check( actual === expected, `${label}: ${actual} != ${expected}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const hasHexen = existsSync( HEXEN + '/pak0.pak' );

const shareware = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'menu-skin-shareware', shareware.buffer.slice( shareware.byteOffset, shareware.byteOffset + shareware.length ) ) );
const wad = pak.COM_FindFile( 'gfx.wad' ).data;
W_LoadWadFile( wad.buffer.slice( wad.byteOffset, wad.byteOffset + wad.length ) );
if ( hasHexen ) {

	const raw = readFileSync( HEXEN + '/pak0.pak' );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'menu-skin-hexen2', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

}
cmd.Cbuf_Init(); cmd.Cmd_Init(); menu.M_Init();

// A recording WebGL2 endpoint; the donor renderer is exercised through its public frame/layout code without a GPU.
function webgl() {

	let id = 0;
	const constants = new Map( [ [ 'FRAMEBUFFER_COMPLETE', 0x8cd5 ], [ 'NO_ERROR', 0 ], [ 'VIEWPORT', 0x0ba2 ] ] );
	const special = {
		getParameter: key => key === constants.get( 'VIEWPORT' ) ? [ 0, 0, 1280, 800 ] : 8192,
		getShaderParameter: () => true, getProgramParameter: () => true, getShaderInfoLog: () => '', getProgramInfoLog: () => '',
		getError: () => 0, checkFramebufferStatus: () => constants.get( 'FRAMEBUFFER_COMPLETE' ),
		getUniformLocation: ( _program, name ) => name,
		readPixels: ( _x, _y, w, h, _format, _type, pixels ) => {

			for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) {

				const at = ( y * w + x ) * 4;
				pixels[ at ] = x > w * .4 && x < w * .6 ? 255 : 0; pixels[ at + 3 ] = 255;

			}

		}
	};
	return new Proxy( special, { get( target, key ) {

		if ( key in target ) return target[ key ];
		if ( typeof key === 'string' && key === key.toUpperCase() ) {

			if ( ! constants.has( key ) ) constants.set( key, key === 'NO_ERROR' ? 0 : ++ id );
			return constants.get( key );

		}
		if ( String( key ).startsWith( 'create' ) ) return () => ( { id: ++ id } );
		return () => {};

	} } );

}

function fixture( run, { profile = 'hexen2', pics = {} } = {} ) {

	return ( async () => {

		const names = [ 'window', 'document', 'Image', 'HTMLCanvasElement', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver' ];
		const saved = Object.fromEntries( names.map( name => [ name, Object.getOwnPropertyDescriptor( globalThis, name ) ] ) );
		const copies = [], fallback = [], listeners = [];
		const context = {
			save() {}, restore() {}, setTransform() {}, clearRect() {}, fillRect() {}, putImageData() {},
			createImageData: ( w, h ) => ( { data: new Uint8ClampedArray( w * h * 4 ), width: w, height: h } ),
			drawImage( ...args ) { copies.push( args ); }
		};
		class Canvas extends EventTarget {

			constructor() { super(); this.width = 1280; this.height = 800; this.style = {}; }
			getContext( kind ) { return kind === 'webgl2' ? ( this.gl ||= webgl() ) : context; }
			getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0 }; }
			addEventListener( type, ...args ) { listeners.push( type ); return super.addEventListener( type, ...args ); }

		}
		const win = new EventTarget();
		Object.assign( win, { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800 } );
		const doc = new EventTarget();
		Object.assign( doc, { hidden: false, fullscreenElement: null, createElement: () => new Canvas(), body: { appendChild() {} } } );
		const globals = {
			window: win, document: doc, HTMLCanvasElement: Canvas,
			Image: class { set src( value ) { this.width = this.height = 128; queueMicrotask( () => this.onload?.() ); } },
			matchMedia: () => Object.assign( new EventTarget(), { matches: false } ),
			requestAnimationFrame: () => { throw new Error( 'Externally driven menu must not schedule RAF' ); },
			cancelAnimationFrame() {},
			ResizeObserver: class { constructor() { throw new Error( 'Detached menu must not own a resize observer' ); } }
		};
		for ( const [ name, value ] of Object.entries( globals ) ) Object.defineProperty( globalThis, name, { configurable: true, writable: true, value } );
		const overlay = new Canvas();
		let dest = keys.key_game, time = 1;
		const client = { state: 0, demonum: - 1, demoplayback: false, intermission: 0 }, server = { active: false }, svs = { maxclients: 1 };
		try {

			GameProfile_Set( profile );
			if ( profile === 'hexen2' ) M_Hexen2_Reset();
			gpu.MainMenu_Destroy();
			draw.Draw_SetExternals( { vid: { width: 1280, height: 800 } } );
			draw.Draw_Init( overlay );
			menu.M_SetExternals( {
				key_dest_get: () => dest, key_dest_set: value => { dest = value; }, cls: client, sv: server, svs,
				Draw_CachePic: path => pics[ path ] || { width: 16, height: 16, path },
				Draw_TransPic() {}, Draw_Pic() {}, Draw_SubPic() {}, Draw_TransPicRegion() {}, Draw_Character() {},
				Draw_FadeScreen() {}, S_LocalSound() {}, host_time_get: () => time, realtime_get: () => time, IN_RequestPointerLock() {}
			} );
			const api = {
				client, server, svs, overlay, copies, fallback, listeners,
				render() { time += .016; menu.M_Draw(); return gpu.MainMenu_Snapshot(); },
				open() { cmd.Cmd_ExecuteString( 'menu_main' ); return this.render(); },
				async ready() {

					this.open();
					for ( let i = 0; i < 800; i ++ ) {

						const state = this.render();
						if ( state.ready || state.error ) return state;
						await new Promise( resolve => setTimeout( resolve, 10 ) );

					}
					throw new Error( 'Bounded menu-skin initialization did not settle' );

				},
				frame() { return gpu.MainMenu_Frame(); }
			};
			await run( api );

		} finally {

			gpu.MainMenu_Destroy();
			for ( const [ name, descriptor ] of Object.entries( saved ) )
				if ( descriptor ) Object.defineProperty( globalThis, name, descriptor ); else delete globalThis[ name ];

		}

	} )();

}

function picture( path, width, height, rects = [] ) {

	const data = new Uint8ClampedArray( width * height * 4 );
	for ( const rect of rects ) for ( let y = rect.y; y < rect.y + rect.h; y ++ ) for ( let x = rect.x; x < rect.x + rect.w; x ++ )
		data[ ( y * width + x ) * 4 + 3 ] = 255;
	return { width, height, path, canvas: { width, height, getContext: () => ( { getImageData: () => ( { data } ) } ) } };

}

function sheet( path, rows ) {

	const rects = [];
	for ( let row = 0; row < rows; row ++ ) rects.push( { x: 2, y: row * 20 + 3, w: 59, h: 16 } );
	return picture( path, 100, rows * 20, rects );

}

// The Quake snapshot's normal form: only the fields the supplied renderer reads, rounded to hundredths.
function norm( list ) {

	return list.filter( command => command.type !== 'image' ).map( command => {

		const out = { type: command.type };
		for ( const key of [ 'text', 'x', 'y', 'w', 'h', 'size', 'stretch', 'kind', 'well', 'disabled', 'display' ] )
			if ( command[ key ] !== undefined ) out[ key ] = typeof command[ key ] === 'number' ? Math.round( command[ key ] * 100 ) / 100 : command[ key ];
		return out;

	} );

}

function digest( commands ) {

	let hash = 2166136261 >>> 0;
	for ( const character of JSON.stringify( norm( commands ) ) ) {

		hash ^= character.charCodeAt( 0 ); hash = Math.imul( hash, 16777619 ) >>> 0;

	}
	return hash;

}

const hexenQuakePics = {
	'gfx/mainmenu_ext.lmp': sheet( 'gfx/mainmenu_ext.lmp', 7 ),
	'gfx/mp_menu.lmp': sheet( 'gfx/mp_menu.lmp', 3 ),
	'gfx/sp_menu_ext.lmp': sheet( 'gfx/sp_menu_ext.lmp', 5 ),
	'gfx/qplaque.lmp': picture( 'gfx/qplaque.lmp', 32, 144, [ { x: 0, y: 0, w: 32, h: 144 } ] ),
	'gfx/ttl_main.lmp': picture( 'gfx/ttl_main.lmp', 48, 48, [ { x: 4, y: 4, w: 40, h: 40 } ] )
};

Deno.test( 'the Hexen II font atlas is generated from the installed bigfont and conchars bitmaps', () => {

	if ( ! hasHexen ) return;
	const bigfont = ( () => {

		const file = pak.COM_FindFile( 'gfx/menu/bigfont2.lmp' );
		const view = new DataView( file.data.buffer, file.data.byteOffset, file.size );
		const width = view.getInt32( 0, true ), height = view.getInt32( 4, true );
		return { width, height, data: file.data.subarray( 8, 8 + width * height ) };

	} )();
	const concharsFile = pak.COM_FindFile( 'gfx/menu/conchars.lmp' );
	const widthsFile = pak.COM_LoadFile( 'gfx/menu/fontsize.lmp' );
	const atlas = BuildHexen2FontAtlas( {
		bigfont, conchars: { width: 256, height: 128, data: concharsFile.data },
		widths: new Uint8Array( widthsFile )
	} );
	const bindings = NewerBindings( { family: 'hexen2' } );
	same( bindings.menu.bigfont[ 0 ], 'gfx/menu/bigfont2.lmp', 'the current bigfont is tried first' );
	same( bindings.menu.bigfont[ 1 ], 'gfx/menu/bigfont.lmp', 'the old demo bigfont is the fallback' );
	same( bindings.menu.fontWidths, 'gfx/menu/fontsize.lmp', 'advances come from the native table' );
	check( atlas, 'the installed sheets produce an atlas' );
	same( atlas.info.bigfont, 27, 'all 27 bigfont cells' );
	check( atlas.info.conchars >= 128, 'the small conchars bank is present: ' + atlas.info.conchars );
	same( atlas.data.length, atlas.metrics.width * atlas.metrics.height, '8-bit atlas pixel count' );
	same( MenuSkin_BigfontIndex( 'A' ), 0, 'A is cell 0' );
	same( MenuSkin_BigfontIndex( 'Z' ), 25, 'Z is cell 25' );
	same( MenuSkin_BigfontIndex( '/' ), 26, 'slash is cell 26' );
	same( MenuSkin_BigfontIndex( ' ' ), 32, 'space advances without a cell' );
	same( MenuSkin_BigfontIndex( '?' ), - 1, 'unsupported characters are skipped' );
	const widths = new Uint8Array( widthsFile );
	for ( let index = 0; index < 27; index ++ ) {

		const glyph = atlas.metrics.glyphs[ String.fromCharCode( MENU_SKINS.hexen2.font.privateBase + index ) ];
		check( glyph?.atlas, 'bigfont cell ' + index + ' has distance-field pixels' );
		same( Math.round( glyph.advance * glyph.em ), widths[ index * 27 + index ], 'advance follows fontsize.lmp for cell ' + index );
		check( glyph.range > 0 && glyph.plane[ 2 ] > 0 && glyph.ink[ 2 ] > 0, 'cell ' + index + ' has sensible normalised metrics' );

	}
	// 'H' is a filled pair of stems: the field spans background and ink values, and its tile is not flat.
	const glyph = atlas.metrics.glyphs[ String.fromCharCode( MENU_SKINS.hexen2.font.privateBase + 7 ) ];
	const [ x, y, w, h ] = glyph.atlas;
	let low = 255, high = 0;
	for ( let row = 0; row < h; row ++ ) for ( let column = 0; column < w; column ++ ) {

		const value = atlas.data[ ( y + row ) * atlas.metrics.width + x + column ];
		if ( value < low ) low = value; if ( value > high ) high = value;

	}
	check( low < 64 && high > 192, 'the H distance field spans outside and inside: ' + low + '..' + high );
	const small = atlas.metrics.glyphs[ 'H' ];
	same( small.em, 8, 'the small conchars bank keeps its 8-pixel em' );
	check( small.atlas, 'the small H has its own tile' );

} );

Deno.test( 'the Hexen II stone material is derived from the supplied shaders, leaving Quake untouched', async () => {

	const { QUAKE_SHADERS } = await import( '../src/newer/ui/menu_webgl_source.js' );
	const stone = MenuSkin_StoneShaders( QUAKE_SHADERS );
	check( stone.plaqueFragment.includes( 'vec3 bronze(' ) && stone.plaqueFragment.includes( 'vec3 copper(' ), 'the material functions keep their names' );
	check( ! stone.plaqueFragment.includes( 'vec3(.414,.291,.193)' ), 'the bronze palette is replaced' );
	check( stone.plaqueFragment.includes( 'smoothstep(.19,.77,cloud)' ) && stone.plaqueFragment.includes( '.82,.84,.87' ), 'the stone tone is neutral and cool' );
	check( ! stone.glyphFragment.includes( 'vec3(31.,15.,6.)' ), 'the glyph material loses its warm bronze rim' );
	check( stone.glyphFragment.includes( 'vec3(18.,18.,20.)' ), 'the glyph rim is cool stone' );
	check( QUAKE_SHADERS.plaqueFragment.includes( 'vec3(.414,.291,.193)' ), 'Quake keeps the supplied bronze shader' );
	check( MenuSkin_StoneShaders( QUAKE_SHADERS ) !== stone, 'each call returns its own copy' );

} );

Deno.test( 'every Hexen II page emits dynamic commands with the Hexen skin and menudot selector', () => {

	if ( ! hasHexen ) return;
	return fixture( async api => {

		const state = await api.ready();
		check( state.ready && ! state.error, 'the Hexen skin is ready: ' + state.error );
		same( state.skin, 'hexen2', 'the active skin' );
		same( state.menuSkin, 'hexen2', 'the renderer reports the applied skin' );
		same( state.material, 'stone', 'the renderer reports the stone material' );
		check( state.font?.bigfont === 27 && state.font?.conchars >= 128, 'the runtime atlas is live: ' + JSON.stringify( state.font ) );

		const bigText = commands => commands.filter( c => c.type === 'text' && c.bigfont ).map( c => c.display ).join( '' ).toUpperCase();
		const smallText = commands => commands.filter( c => c.type === 'text' && ! c.bigfont ).map( c => c.text ).join( '' ).toUpperCase();
		const imagePaths = commands => commands.filter( c => c.type === 'image' ).map( c => c.path ).join( '|' );
		const stonePanel = commands => commands.some( c => c.type === 'panel' && c.skin === 'hexen2' && c.material === 'stone' );
		const menudot = commands => commands.some( c => c.type === 'selector' && c.skin === 'hexen2' && /gfx\/menu\/menudot[1-8]\.lmp/.test( c.path ) );
		const pages = [
			[ 'main', M_Hexen2_Menu_Main_f, c => bigText( c ).includes( 'SINGLEPLAYER' ) && imagePaths( c ).includes( 'title0' ) && menudot( c ) ],
			[ 'single player', M_Hexen2_Menu_SinglePlayer_f, c => bigText( c ).includes( 'NEWGAME' ) ],
			[ 'class', M_Hexen2_Menu_Class_f, c => bigText( c ).includes( 'PALADIN' ) && imagePaths( c ).includes( 'cport1' ) ],
			[ 'difficulty', M_Hexen2_Menu_Skill_f, c => bigText( c ).includes( 'APPRENTICE' ) ],
			[ 'multiplayer', M_Hexen2_Menu_Multiplayer_f, c => bigText( c ).includes( 'JOINAGAME' ) ],
			[ 'setup', M_Hexen2_Menu_Setup_f, c => {
				const glyph = c.find( x => x.type === 'text' && x.text === 'H' );
				return smallText( c ).includes( 'HOSTNAME' ) && glyph && Math.abs( glyph.size - 8 * draw.Draw_GetUIScale() ) < .01;
			} ],
			[ 'options', M_Hexen2_Menu_Options_f, c => stonePanel( c ) && smallText( c ).includes( 'CUSTOMIZECONTROLS' ) ],
			[ 'keys', M_Hexen2_Menu_Keys_f, c => smallText( c ).includes( 'ENTERTOCHANGE' )
				&& c.some( x => x.type === 'text' && ( x.text === '\x80' || x.text === '\x81' ) ) ],
			[ 'video', M_Menu_Video_f, c => smallText( c ).includes( 'VIDEOSETTINGS' ) ],
			[ 'help', M_Hexen2_Menu_Help_f, c => imagePaths( c ).includes( 'help01' ) ],
			[ 'quit', M_Hexen2_Menu_Quit_f, c => stonePanel( c ) && smallText( c ).includes( 'HEXENIIVERSION' ) ],
			[ 'load', M_Hexen2_Menu_Load_f, c => imagePaths( c ).length > 0 && smallText( c ).includes( 'UNUSEDSLOT' ) ]
		];
		for ( const [ name, open, expect ] of pages ) {

			open();
			api.render();
			const commands = api.frame().commands;
			check( commands.some( c => c.skin === 'hexen2' ), name + ' emits commands from the Hexen skin' );
			check( expect( commands ), name + ' has its dynamic text, picture or panel' );

		}
		// Save is the only page that natively requires a local game.
		api.server.active = true; api.client.intermission = 0; api.svs.maxclients = 1;
		try {

			M_Hexen2_Menu_Save_f();
			api.render();
			const commands = api.frame().commands;
			check( commands.some( c => c.skin === 'hexen2' ), 'save emits commands from the Hexen skin' );
			check( imagePaths( commands ).length > 0 && smallText( commands ).includes( 'UNUSEDSLOT' ), 'save draws its title and slots' );

		} finally { api.server.active = false; }

	}, {} );

} );

Deno.test( 'Quake main and options command streams are unchanged by the skin seam', () => {

	return fixture( async api => {

		const state = await api.ready();
		check( state.ready && ! state.error, 'the Quake renderer is ready: ' + state.error );
		same( state.skin, 'quake', 'Quake keeps its skin' );
		same( state.material, 'bronze', 'Quake keeps the bronze material' );
		same( state.font, null, 'Quake keeps the supplied embedded atlas' );
		api.open();
		const main = api.frame().commands;
		same( digest( main ), 2157577950, 'the main menu command stream is byte-for-byte the old one' );
		check( main.every( c => c.skin === undefined && c.type !== 'image' ), 'Quake commands carry no skin tags and no Hexen images' );
		cmd.Cmd_ExecuteString( 'menu_options' );
		api.render();
		same( digest( api.frame().commands ), 3551365704, 'the options command stream is byte-for-byte the old one' );

	}, { profile: 'quake', pics: hexenQuakePics } );

} );
