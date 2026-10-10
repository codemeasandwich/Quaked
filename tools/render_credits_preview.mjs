// Software-canvas preview of the real credits/options menu. No game, browser or
// server is started. Uses the supplied PNG loader and original Quake charset.
import { register } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
if ( ! process.env.QUAKED_THREE_MODULE || ! process.env.QUAKED_CANVAS_MODULE ) throw new Error( 'Set QUAKED_THREE_MODULE and QUAKED_CANVAS_MODULE to installed runtime modules.' );
register( 'data:text/javascript,' + encodeURIComponent( `export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(pathToFileURL(process.env.QUAKED_THREE_MODULE).href)},shortCircuit:true};return n(s,c);}` ) );
const { createCanvas, Image } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
const options = process.argv.includes( '--options' );
const height = process.argv.includes( '--small' ) ? 400 : options ? 480 : 560;
globalThis.Image = Image;
globalThis.document = { createElement: () => createCanvas( 1, 1 ) };
globalThis.window = { devicePixelRatio: 1, innerWidth: 640, innerHeight: height };
await import( '../src/engine/render/gl_rsurf.js' );
await import( '../src/newer/install.js' ); // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js), after the loader and the renderer's bootstrap
const pak = await import( '../src/engine/common/pak.js' ), wad = await import( '../src/engine/common/wad.js' ), vid = await import( '../src/engine/render/vid.js' );
const draw = await import( '../src/engine/render/gl_draw.js' ), menu = await import( '../src/engine/client/menu.js' ), cmd = await import( '../src/engine/common/cmd.js' ), keys = await import( '../src/engine/client/keys.js' );
const raw = await readFile( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
const gfx = pak.COM_FindFile( 'gfx.wad' ).data;
wad.W_LoadWadFile( gfx.buffer.slice( gfx.byteOffset, gfx.byteOffset + gfx.length ) );
vid.VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
const canvas = createCanvas( 640, height );
cmd.Cbuf_Init(); cmd.Cmd_Init();
draw.Draw_SetExternals( { vid: { width: 640, height } } );
draw.Draw_Init( canvas );
const pic = await draw.Draw_CachePicFromPNG( 'gfx/weapon_models_name.lmp', fileURLToPath( new URL( '../assets/credits/dannaki-name.png', import.meta.url ) ), { blackKey: 3, trim: true, displayHeight: 8 } );
let dest = keys.key_game;
menu.M_Init(); menu.M_SetExternals( { key_dest_get: () => dest, key_dest_set: value => { dest = value; }, vid: { width: 640, height }, cls: { demonum: -1 }, weaponModelsCredit: pic,
	Draw_CachePic: draw.Draw_CachePic, Draw_Pic: draw.Draw_Pic, Draw_TransPic: draw.Draw_TransPic, Draw_Character: draw.Draw_Character, Draw_FadeScreen: draw.Draw_FadeScreen, S_LocalSound() {} } );
draw.Draw_BeginFrame();
canvas.getContext( '2d' ).fillStyle = '#282522'; canvas.getContext( '2d' ).fillRect( 0, 0, 320, 200 );
cmd.Cmd_ExecuteString( options ? 'menu_options' : 'menu_credits' ); menu.M_Draw();
const name = options ? 'options-music-sound-volume' : 'weapon-models-credits';
await writeFile( new URL( '../docs/images/' + name + ( height === 400 ? '-small' : '' ) + '-2026-10-02.png', import.meta.url ), canvas.toBuffer( 'image/png' ) );
console.log( 'Rendered real ' + ( options ? 'options' : 'credits' ) + ' menu using native glyphs.' );
