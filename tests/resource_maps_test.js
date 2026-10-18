// Public loose-map loader reads canonical data while retaining maps/* identity.
import {readFileSync} from 'node:fs';
import {COM_SetLooseFileBasePath,COM_EnsureFile,COM_FindFile} from '../src/engine/common/pak.js';
const root=new URL('../',import.meta.url).pathname;
const check=(v,m)=>{if(!v)throw Error(m);};
Deno.test('dedicated-server filesystem loader resolves moved maps beneath its configured root',async()=>{
 const deno=globalThis.Deno;let requested;
 try{
  globalThis.Deno={...deno,readFile:async path=>{requested=path;return new Uint8Array(readFileSync(path));}};
  COM_SetLooseFileBasePath(root);
  check(await COM_EnsureFile('maps/zed.bsp'),'logical map loads');
  check(requested===root+'assets/game/maps/community/zed.bsp','actual Deno boundary receives canonical path');
  const loaded=COM_FindFile('maps/zed.bsp');check(loaded&&loaded.data.byteLength===725348,'unchanged map bytes retain logical lookup');
 }finally{COM_SetLooseFileBasePath('');globalThis.Deno=deno;}
});
Deno.test('browser loose-map loader requests the same canonical tree and preserves map identity',async()=>{
 const deno=globalThis.Deno,fetchBefore=globalThis.fetch;let requested;
 try{
  delete globalThis.Deno;
  globalThis.fetch=async url=>{requested=url;return new Response(readFileSync(new URL('../'+url,import.meta.url)));};
  check(await COM_EnsureFile('maps/edc.bsp'),'browser map loads');
  check(requested==='assets/game/maps/community/edc.bsp','actual fetch boundary receives canonical URL');
  const loaded=COM_FindFile('maps/edc.bsp');check(loaded&&loaded.data.byteLength===628228,'unchanged map bytes retain logical lookup');
 }finally{globalThis.Deno=deno;globalThis.fetch=fetchBefore;}
});
