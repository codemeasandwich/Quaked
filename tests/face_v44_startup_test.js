// Actual startup PAK must supply one coherent v4.4 manifest/raster family even
// when a previously-mounted optional PAK has stale face bytes and cached URLs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COM_LoadPackFile,COM_SetNewerStartupPack,COM_SetNewerPack,COM_NewerFile,COM_NewerURL,COM_NewerJSON} from '../src/engine/common/pak.js';
import {STARTUP_PACK} from '../src/newer/assets/startup_pack.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url)),ab=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),manifest=JSON.parse(read('newer/hud/playerface/manifest.json'));
function direct(entries){let offset=0;const files=[];for(const[name,value]of entries){const bytes=Buffer.from(value);files.push({name,filepos:offset,filelen:bytes.length,bytes});offset+=bytes.length;}const all=new Uint8Array(offset);for(const file of files)all.set(file.bytes,file.filepos);return{files,data:all.buffer};}
Deno.test('mounting current startup invalidates stale face blobs and pins all 270 referenced images while other override precedence survives',async()=>{
 const path='newer/hud/playerface/bases.png',manifestPath='newer/hud/playerface/manifest.json',other='newer/hud/index.json',stale=Buffer.from('old face atlas'),startup=COM_LoadPackFile('v44-real-startup',ab(read(STARTUP_PACK.file)));
 COM_SetNewerStartupPack(null);COM_SetNewerPack(direct([[path,stale],[manifestPath,'{"version":"old"}'],[other,'{"override":true}']]));try{
  const oldURL=COM_NewerURL(path,'loose'),oldUpperURL=COM_NewerURL(path.toUpperCase(),'loose');assert.ok(Buffer.from(await(await fetch(oldURL)).arrayBuffer()).equals(stale));COM_SetNewerStartupPack(startup);const currentURL=COM_NewerURL(path,'loose'),currentUpperURL=COM_NewerURL(path.toUpperCase(),'loose');assert.notEqual(currentURL,oldURL,'startup first mount invalidates prior lower-case face blob');assert.notEqual(currentUpperURL,oldUpperURL,'startup invalidates case-insensitive lookup blob');assert.ok(Buffer.from(await(await fetch(currentURL)).arrayBuffer()).equals(read(path)),'new URL contains current exact original bytes');assert.deepEqual(await COM_NewerJSON(manifestPath,'missing'),manifest);
  const expected=new Set(manifest.assets.map(a=>a.source).filter(Boolean));assert.equal(expected.size,270);for(const id of expected){const name='newer/hud/playerface/'+id+'.png';assert.ok(Buffer.from(COM_NewerFile(name).data).equals(read(name)),id+' routes to current startup bytes');}assert.deepEqual(await COM_NewerJSON(other,'missing'),{override:true},'ordinary optional HUD index keeps established override priority');
 }finally{COM_SetNewerPack(null);COM_SetNewerStartupPack(null);}
});
