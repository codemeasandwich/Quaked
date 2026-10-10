// Terminal layered-head failure through real Sbar and native WAD fallback boundaries.
// Native fallback sprites come from pak0's actual WAD; only DOM image/canvas
// surfaces are stubbed. No renderer, game or browser instance is launched.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
await import( '../src/engine/render/gl_rsurf.js' );
const sbar = await import( '../src/engine/client/sbar.js' ), draw = await import( '../src/engine/render/gl_draw.js' );
const layer = await import('../src/newer/ui/r_playerface.js');
const faceManifest=JSON.parse(readFileSync(new URL('../newer/hud/playerface/manifest.json',import.meta.url),'utf8'));
const hud = await import( '../src/newer/ui/r_newerhud.js' ), newerMode = await import( '../src/newer/mode.js' );
const vars = await import( '../src/engine/common/cvar.js' ), cmd = await import( '../src/engine/common/cmd.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const { W_LoadWadFile } = await import( '../src/engine/common/wad.js' );
const { COM_AddPack } = await import( '../src/engine/common/pak.js' );
const q = await import( '../src/engine/common/quakedef.js' );
function check( value, label ) { if ( ! value ) throw new Error( label ); }
function equal( a, b, label ) { check( a === b, `${label}: ${a} != ${b}` ); }
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const descriptors = Object.fromEntries( [ 'window', 'document', 'Image' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) );
const oldFetch = globalThis.fetch, oldHdr = r_hdr.string, oldHud = newerMode.r_newer_hud.value;
const images = [], calls = [], faces = [], failed = new Set();
class Canvas {

	constructor() { this.width = this.height = 0; this.style = {};this.sources=[]; this.context = { imageSmoothingEnabled: false,
		createImageData: ( width, height ) => ( { width, height, data: new Uint8ClampedArray( width * height * 4 ) } ),
		putImageData: pixels => { this.pixels = pixels; }, save() {}, restore() {}, setTransform() {}, clearRect() {},translate(){},rotate(){},scale(){},beginPath(){},lineTo(){},moveTo(){},closePath(){},clip(){},fill(){},fillRect(){},
		drawImage: ( ...args ) => { this.image = args[ 0 ];this.sources.push(args[0]); calls.push( { canvas: this, args } ); } }; }
	getContext() { return this.context; }

}
Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 480 } } );
Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: () => new Canvas(), body: { appendChild() {} } } } );
Object.defineProperty( globalThis, 'Image', { configurable: true, value: class {

	set src( value ) { this.url = value; this.width = this.height = 96; images.push( value ); queueMicrotask( () => failed.has( String( value ).split( '?' )[ 0 ] ) ? this.onerror() : this.onload() ); }

} } );
globalThis.fetch = async path => { try { return { ok: true, json: async () => JSON.parse((String(path).startsWith('file:')?readFileSync(new URL(String(path).split('?')[0])):read(String(path).split('?')[0])).toString()) }; } catch { return { ok: false }; } };
const pak = read( 'games/shareware/pak0.pak' ), entries = [], native = new Map();
for ( let offset = pak.readInt32LE( 4 ), end = offset + pak.readInt32LE( 8 ); offset < end; offset += 64 ) {

	const name = pak.subarray( offset, offset + 56 ).toString().split( '\0' )[ 0 ], filepos = pak.readInt32LE( offset + 56 ), filelen = pak.readInt32LE( offset + 60 );
	entries.push( { name, filepos, filelen } ); native.set( name, pak.subarray( filepos, filepos + filelen ) );

}
COM_AddPack( { filename: 'hud-face-native-fixture', data: pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.byteLength ), files: entries } );
const wad = native.get( 'gfx.wad' ); W_LoadWadFile( wad.buffer.slice( wad.byteOffset, wad.byteOffset + wad.byteLength ) );
const palette = native.get( 'gfx/palette.lmp' ), rgba = new Uint32Array( 256 );
for ( let i = 0; i < 256; i ++ ) rgba[ i ] = palette[ i * 3 ] | palette[ i * 3 + 1 ] << 8 | palette[ i * 3 + 2 ] << 16 | 255 << 24;
cmd.Cbuf_Init(); cmd.Cmd_Init(); draw.Draw_SetExternals( { vid: { width: 640, height: 480 }, d_8to24table: rgba } );
const overlay = new Canvas(); draw.Draw_Init( overlay );
if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( r_hdr );
vars.Cvar_SetValue( 'r_hdr', 1 ); newerMode.r_newer_hud.value = 1;
const client = { stats: new Int32Array( 32 ), items: 0, gametype: 0, scores: [], time: 10, faceanimtime: 0, grintime: 0, maxclients: 1, levelname: 'face test', item_gettime: new Float32Array( 32 ), viewentity: 1 };
client.stats[ q.STAT_HEALTH ] = 70;
const nativePics = new Map(), seededQuad = new Canvas();
sbar.Sbar_SetExternals( { cl: client, vid: { width: 640, height: 480, numpages: 1 },
	Draw_PicFromWad: name => { const pic = draw.Draw_PicFromWad( name ); nativePics.set( name, pic ); if ( name === 'face_quad' ) { pic._hi = seededQuad; pic._asked = true; } return pic; },
	Draw_Pic: ( x, y, pic ) => { if ( pic._layeredFace || pic._name?.startsWith( 'face' ) ) faces.push( { x, y, pic, initialHi: pic._hi, initialAsked: pic._asked } ); draw.Draw_Pic( x, y, pic ); },
	Draw_TransPic: draw.Draw_TransPic, Draw_Character() {}, Draw_String() {}, Draw_Fill() {} } );
sbar.Sbar_Init(); sbar.set_sb_lines( 24 );
function selected( mask ) {

	faces.length = 0; calls.length = 0; client.items = ( mask & 1 ? q.IT_QUAD : 0 ) | ( mask & 2 ? q.IT_INVULNERABILITY : 0 ) | ( mask & 4 ? q.IT_INVISIBILITY : 0 );
	sbar.Sbar_Draw(); equal( faces.length, 1, 'one selected portrait' ); return faces[ 0 ];

}
async function flush() { for ( let i = 0; i < 30; i ++ ) await Promise.resolve(); }

Deno.test('terminal canonical-head failure preserves real native fallback priorities for every enhanced and Classic power combination',async()=>{
 failed.add(new URL('../newer/hud/playerface/bases.png',import.meta.url).href);await layer.R_PlayerFacePreload();await flush();check(layer.R_PlayerFaceStatus().settled&&layer.R_PlayerFaceStatus().errors.includes('bases'),'actual canonical head image transport failed terminally');const legacy=['face2','face_quad','face_invul2','face_quad','face_invis','face_quad','face_inv2','face_inv2'];for(const mode of['enhanced','new-game','hud-off','classic-half']){vars.Cvar_SetValue('r_hdr',mode==='new-game'?0:1);newerMode.r_newer_hud.value=mode==='hud-off'?0:1;newerMode.R_AnimSetClassicPass(mode==='classic-half');for(let mask=0;mask<8;mask++){const pic=selected(mask).pic;equal(pic._name,mode==='enhanced'&&(mask&3)===3?'face_invul1':legacy[mask],mode+' fallback priority '+mask);check(!pic._layeredFace,'incomplete face never replaces native fallback');equal(pic.width,24,'fallback layout width remains native');equal(pic.height,24,'fallback layout height remains native');}}});
Deno.test('restore terminal face fallback fixture',()=>{globalThis.fetch=oldFetch;vars.Cvar_Set('r_hdr',oldHdr);newerMode.r_newer_hud.value=oldHud;newerMode.R_AnimSetClassicPass(false);for(const key of ['window','document','Image'])if(descriptors[key])Object.defineProperty(globalThis,key,descriptors[key]);else delete globalThis[key];});
