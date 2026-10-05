// Public status-bar selection and real optional HUD-loader/drawing boundaries.
// Native fallback sprites come from pak0's actual WAD; only DOM image/canvas
// surfaces are stubbed. No renderer, game or browser instance is launched.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
await import( '../src/gl_rsurf.js' );
const sbar = await import( '../src/sbar.js' ), draw = await import( '../src/gl_draw.js' );
const layer = await import('../src/r_playerface.js');
const faceManifest=JSON.parse(readFileSync(new URL('../newer/hud/playerface/manifest.json',import.meta.url),'utf8'));
const hud = await import( '../src/r_newerhud.js' ), anim = await import( '../src/r_anim.js' );
const vars = await import( '../src/cvar.js' ), cmd = await import( '../src/cmd.js' );
const { r_hdr } = await import( '../src/gl_post.js' );
const { W_LoadWadFile } = await import( '../src/wad.js' );
const { COM_AddPack } = await import( '../src/pak.js' );
const q = await import( '../src/quakedef.js' );
function check( value, label ) { if ( ! value ) throw new Error( label ); }
function equal( a, b, label ) { check( a === b, `${label}: ${a} != ${b}` ); }
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const descriptors = Object.fromEntries( [ 'window', 'document', 'Image' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) );
const oldFetch = globalThis.fetch, oldHdr = r_hdr.string, oldHud = anim.r_newer_hud.value;
const images = [], calls = [], faces = [], failed = new Set();
class Canvas {

	constructor() { this.width = this.height = 0; this.style = {};this.sources=[]; this.context = { imageSmoothingEnabled: false,
		createImageData: ( width, height ) => ( { width, height, data: new Uint8ClampedArray( width * height * 4 ) } ),
		putImageData: pixels => { this.pixels = pixels; }, save() {}, restore() {}, setTransform() {}, clearRect() {},translate(){},rotate(){},scale(){},beginPath(){},lineTo(){},moveTo(){},closePath(){},clip(){},fill(){},fillRect(){},
		drawImage: ( ...args ) => { this.image = args[ 0 ];this.sources.push(args[0]); calls.push( { canvas: this, args, smoothing:this.context.imageSmoothingEnabled } ); } }; }
	getContext() { return this.context; }

}
Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 480 } } );
Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: () => new Canvas(), body: { appendChild() {} } } } );
Object.defineProperty( globalThis, 'Image', { configurable: true, value: class {

	set src( value ) { this.url = value; this.width = this.height = 96; images.push( value ); queueMicrotask( () => failed.has( String( value ).split( '?' )[ 0 ] ) ? this.onerror() : this.onload() ); }

} } );
globalThis.fetch = async path => { try { return { ok: true, json: async () => JSON.parse((String(path).startsWith('file:')?readFileSync(new URL(String(path).split('?')[0])):read(String(path).split('?')[0])).toString()) }; } catch { return { ok: false }; } };
const pak = read( 'pak0.pak' ), entries = [], native = new Map();
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
vars.Cvar_SetValue( 'r_hdr', 1 ); anim.r_newer_hud.value = 1;
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

Deno.test( 'HUD portrait: pending layered artwork preserves existing native fallback priorities and ignores obsolete kill grin state', () => {

	const first = selected( 3 ), combo = first.pic, quad = nativePics.get( 'face_quad' );
	equal( combo._name, 'face_invul1', 'new combination key' ); equal( first.initialHi, undefined, 'combination does not copy stale Quad high-res cache' ); equal( first.initialAsked, undefined, 'combination gets independent lazy load' );
	equal( combo, nativePics.get( 'face_invul1' ), 'combination loaded through actual native WAD picture' ); equal( combo.canvas, nativePics.get( 'face_invul1' ).canvas, 'native FACE_INVUL1 fallback canvas retained' ); check( combo.canvas !== quad.canvas, 'combination has its own native pixels' ); equal( combo.width, 24, 'native portrait width' ); equal( combo.height, 24, 'native portrait height' );
	delete quad._hi; delete quad._asked;
	const legacy = [ 'face2', 'face_quad', 'face_invul2', 'face_quad', 'face_invis', 'face_quad', 'face_inv2', 'face_inv2' ];
	for ( const mode of [ 'enhanced', 'new-game', 'hud-off', 'classic-half' ] ) {

		vars.Cvar_SetValue( 'r_hdr', mode === 'new-game' ? 0 : 1 ); anim.r_newer_hud.value = mode === 'hud-off' ? 0 : 1; anim.R_AnimSetClassicPass( mode === 'classic-half' );
		for ( let mask = 0; mask < 8; mask ++ ) equal( selected( mask ).pic._name, mode === 'enhanced' && ( mask & 3 ) === 3 ? 'face_invul1' : legacy[ mask ], mode + ' powerup combination ' + mask );

	}
	anim.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 1 ); anim.r_newer_hud.value = 1;
	client.grintime = 11; equal( selected( 0 ).pic._name, 'face2', 'obsolete kill-grin timer cannot create an unrequested celebration' ); client.grintime = 0;

} );

Deno.test( 'HUD portrait: ready donor layers use the real Draw_Pic path at native24px while Classic and HUD-off retain original sprites', async () => {
 await layer.R_PlayerFacePreload();await flush();check(layer.R_PlayerFaceStatus().errors.length===0,'actual installed face manifest and all mocked transport images load');
 const graph=canvas=>{const seen=new Set();const walk=node=>{if(!node||seen.has(node))return;seen.add(node);for(const child of node.sources||[])walk(child);};walk(canvas);return seen;};
 const pose=faceManifest.poses.find(p=>p.id==='normal_front');
 for(let mask=0;mask<8;mask++){const chosen=selected(mask).pic;check(chosen._layeredFace,'enhanced face uses layered canvas for combination '+mask);equal(chosen.width,24,'native layout width');equal(chosen.height,24,'native layout height');equal(chosen.canvas.width,96,'donor full-cell width');const nodes=graph(chosen.canvas);check(nodes.has(layer.R_PlayerFaceLayer(pose.blood_layers[2].asset,pose.id).canvas),'health70 blood remains alongside every power combination');const effect=(mask&3)===3?'mixed':mask&1?'purple':mask&2?'yellow':null;if(effect)check(nodes.has(layer.R_PlayerFaceLayer(pose.eye_layers[effect].asset,pose.id).canvas),'selected real power-eye layer present '+effect);const maskCanvas=layer.R_PlayerFaceLayer(pose.mask_asset,pose.id).canvas;equal(nodes.has(maskCanvas),!!(mask&4),'invisibility mask chosen independently');const rendered=calls.find(call=>call.canvas===overlay&&call.args[0]===chosen.canvas);check(rendered,'actual public Draw_Pic draws composed donor canvas');equal(rendered.smoothing,false,'actual donor draw uses nearest sampling');equal(rendered.args[3],24,'rendered native width');equal(rendered.args[4],24,'rendered native height');}
 const legacy=['face2','face_quad','face_invul2','face_quad','face_invis','face_quad','face_inv2','face_inv2'];for(const mode of['new-game','hud-off','classic-half']){vars.Cvar_SetValue('r_hdr',mode==='new-game'?0:1);anim.r_newer_hud.value=mode==='hud-off'?0:1;anim.R_AnimSetClassicPass(mode==='classic-half');for(let mask=0;mask<8;mask++){const chosen=selected(mask).pic;equal(chosen._name,legacy[mask],mode+' native priority '+mask);check(!chosen._layeredFace,'cached enhanced canvas cannot escape mode boundary');}}
 anim.R_AnimSetClassicPass(false);vars.Cvar_SetValue('r_hdr',1);anim.r_newer_hud.value=1;
 for(const name of['face2','face_quad','face_invul1']){const bytes=read('newer/hud/'+name+'.webp');check(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP','existing optional fallback '+name+' remains installed');}
 equal(createHash('sha256').update(read('newer/hud/face1.webp')).digest('hex'),'95e5843218d742f77d93653a5a35b009ac5b8ce43c05c0fd3272fa3b4ffb2775','unrequested ordinary face1 unchanged from accepted commit');
} );

Deno.test( 'HUD portrait: failed optional combination load retains native FACE_INVUL1 pixels at native size', async () => {

	const isolated = await import( '../src/r_newerhud.js?hud-face-failure' ), nativeCombo = nativePics.get( 'face_invul1' );
	const pic = { _name: 'face_invul1', width: nativeCombo.width, height: nativeCombo.height, canvas: nativeCombo.canvas, imageData: nativeCombo.imageData };
	failed.add( 'newer/hud/face_invul1.webp' ); equal( isolated.R_NewerHudCanvas( pic ), null, 'native fallback while loading' ); await flush();
	equal( pic._hi, null, 'image failure settles safely' ); calls.length = 0; draw.Draw_Pic( 112, 216, pic );
	const rendered = calls.find( call => call.canvas === overlay ); equal( rendered.args[ 0 ], nativeCombo.canvas, 'failed combination uses original FACE_INVUL1 pixels' ); equal( nativeCombo.canvas.width, 24, 'fallback native width' ); equal( nativeCombo.canvas.height, 24, 'fallback native height' );
	failed.clear();

} );

Deno.test( 'HUD portrait: restore public fixture globals', () => {

	globalThis.fetch = oldFetch; vars.Cvar_Set( 'r_hdr', oldHdr ); anim.r_newer_hud.value = oldHud; anim.R_AnimSetClassicPass( false );
	for ( const key of [ 'window', 'document', 'Image' ] ) { if ( descriptors[ key ] ) Object.defineProperty( globalThis, key, descriptors[ key ] ); else delete globalThis[ key ]; }

} );
