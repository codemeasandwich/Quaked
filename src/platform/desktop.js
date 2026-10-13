/** Thin native adapter: location authority stays in Rust; content validation and
 * mount ordering stay in the existing engine. Imported only by the desktop profile.
 */
import {invoke,convertFileSrc} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {GameCatalogue_AllGames,GameCatalogue_Refresh,GameCatalogue_SetProvider,GameCatalogue_SetDiscovered} from '../engine/common/game_catalogue.js';
import {GameSelection_Startable,GameSelection_Kept,GameSelection_Remember,GameSelection_LibraryOrder} from '../engine/common/game_selection.js';
import {COM_LoadPackFile,COM_BuildPack} from '../engine/common/pak.js';
import {GameShelf_Show} from '../engine/common/hooks.js'; // filled by src/newer/install.js, which main.js loads first
import {LoadingScreen_SetProgress} from '../newer/ui/loading_screen.js';
let listening=false;
export async function Desktop_SelectLocation(){
  document.exitPointerLock?.();
  try {if(await invoke('library_choose'))location.assign(location.pathname);}
  catch(error){alert('The game location could not be selected: '+error);}
}
function rangedFetch(library){
 return async (url,options={})=>{
  const token=decodeURIComponent(new URL(url).pathname).replace(/^\/library\//,'');
  const pack=library.packs.find(p=>p.token===token);
  if(!pack)return new Response(null,{status:404});
  const range=/^bytes=(\d+)-(\d+)$/.exec(options.headers?.Range??'');
  if(!range)throw Error('Native catalogue requires a bounded range');
  const start=Number(range[1]),length=Number(range[2])-start+1;
  if(start>=pack.bytes)return new Response(null,{status:416});
  if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const bytes=await invoke('library_read',{token,offset:start,length});
  if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
  return new Response(bytes,{status:206,headers:{'Content-Range':`bytes ${start}-${Math.min(start+length,pack.bytes)-1}/${pack.bytes}`,'Content-Length':String(Math.min(length,pack.bytes-start)),'Last-Modified':pack.modified}});
 };
}
async function snapshot(){
 const library=await invoke('library_scan');
 // the add-ons the library found by their folders (src-tauri/src/library.rs), then every game as the library names it
 GameCatalogue_SetDiscovered((library.discovered??[]).map(d=>({...d,folder:`library/${d.id}`})));
 const games=GameCatalogue_AllGames().map(g=>({...g,folders:[`library/${g.id}`]}));
 const catalogue=await GameCatalogue_Refresh({games,allPacks:true,base:'https://quaked.invalid/',fetch:rangedFetch(library)});
 return {library,catalogue};
}
/** Per-game data packs (docs/per-game-packs-design-2026-10-13.md): the app bundles the core
 * pack; a game's other packs are downloaded, verified and unpacked by the app (packs_ensure in
 * src-tauri/src/packs.rs) before it starts, while the loading screen shows the progress. Once
 * unpacked they are reused offline. A failure returns to the shelf saying so; choosing the game
 * again retries, keeping the parts already verified. */
async function ensurePacks(definition){
 const distribution=globalThis.__QUAKED_DISTRIBUTION__,packs=distribution.packsFor(definition.id,definition.base);
 if(!packs.length)return;
 const sizes=new Map(packs.map(p=>[p.name,p.parts.reduce((sum,part)=>sum+part.bytes,0)])),total=[...sizes.values()].reduce((a,b)=>a+b,0),done=new Map();
 const status=document.createElement('div');status.id='pack-status';status.role='status';
 status.style='position:fixed;left:5vw;right:5vw;bottom:12vh;color:#efd9ad;text-align:center;font:16px/1.4 system-ui,sans-serif';
 status.textContent=`Checking the Newer Game data for ${definition.name}`;
 (document.getElementById('loading')??document.body).append(status);
 const mb=bytes=>(bytes/1e6).toFixed(0);
 const stop=await listen('packs-progress',({payload})=>{
  if(payload.phase==='download')done.set(payload.pack,payload.done);
  if(payload.phase==='ready')done.set(payload.pack,sizes.get(payload.pack)??0);
  const received=[...done.values()].reduce((a,b)=>a+b,0);
  LoadingScreen_SetProgress(total?received/total:1);
  status.textContent=payload.phase==='unpack'?`Unpacking the Newer Game data for ${definition.name}`:payload.phase==='download'?`Downloading the Newer Game data for ${definition.name}: ${mb(received)} of ${mb(total)} MB`:status.textContent;
 });
 try{
  const dir=await invoke('packs_ensure',{base:distribution.packBase,packs});
  distribution.usePacks(dir,packs.map(p=>p.name));
 }catch(error){throw Error(`The Newer Game data for ${definition.name} could not be downloaded (${error?.message??error}). Choose the game again to retry.`);}
 finally{stop();status.remove();}
}
export async function Desktop_ShowShelf(reason=''){
 const {library,catalogue}=await snapshot();
 document.getElementById('loading')?.remove();
 const games=catalogue.games.map(g=>({...g,playable:GameSelection_Startable(g,{strict:true}).ok}));
 if(reason||library.error){const note=document.createElement('div');note.role='alert';note.style='position:fixed;z-index:201;top:10vh;left:5vw;right:5vw;color:#efd9ad;text-align:center';note.textContent=reason||library.error;document.body.append(note);}
 await GameShelf_Show(games,{native:true,current:GameSelection_Kept(),remember:GameSelection_Remember,selectLocation:Desktop_SelectLocation});
}
export async function Desktop_Prepare(){
 GameCatalogue_SetProvider(async()=>{
  const library=await invoke('library_scan');
  GameCatalogue_SetDiscovered((library.discovered??[]).map(d=>({...d,folder:`library/${d.id}`})));
  return {games:GameCatalogue_AllGames().map(g=>({...g,folders:[`library/${g.id}`]})),allPacks:true,base:'https://quaked.invalid/',fetch:rangedFetch(library)};
 });
 if(!listening){await listen('select-game-location',Desktop_SelectLocation);await listen('lan-menu',()=>globalThis.__QUAKED_LAN_MENU__?globalThis.__QUAKED_LAN_MENU__():alert('Select a game and wait for it to load first.'));listening=true;}
 globalThis.__QUAKED_SELECT_LOCATION__=Desktop_SelectLocation;
 const id=new URLSearchParams(location.search).get('game');
 if(!id){await Desktop_ShowShelf();return null;}
 try{
  const {library,catalogue}=await snapshot();
  const selected=catalogue.games.find(g=>g.id===id);
  if(!selected||!GameSelection_Startable(selected,{strict:true}).ok)throw Error(selected?.reason??'Unknown game');
  const definition=GameCatalogue_AllGames().find(g=>g.id===id);
  await ensurePacks(definition);
  const ids=definition.base?[definition.base,id]:[id];
  const packs=[];
  const read=async entry=>{
   const response=await fetch(convertFileSrc(entry.path));if(!response.ok)throw Error('Archive unavailable: '+entry.name);
   const bytes=await response.arrayBuffer();if(bytes.byteLength!==entry.bytes)throw Error('Archive changed: '+entry.name);
   return bytes;
  };
  // the add-on's loose game files (X-Men's progs.dat; library.rs LOOSE_FILES) as one pack under its own packs, as
  // Quake searches a game folder after its packs (GameSelection_LibraryOrder; docs/add-ons-2026-10-13.md)
  for(const step of GameSelection_LibraryOrder(library.packs,ids,definition.kind==='addon'?id:null)){
   if(step.loose){const files=[];for(const entry of step.loose)files.push({name:entry.name,data:new Uint8Array(await read(entry))});const pack=COM_LoadPackFile(id+'/loose',COM_BuildPack(files));if(!pack)throw Error('Invalid loose files: '+id);packs.push(pack);continue;}
   const pack=COM_LoadPackFile(step.pack.token,await read(step.pack));if(!pack)throw Error('Invalid archive: '+step.pack.name);packs.push(pack);
  }
  // Re-read metadata after full reads so changing files cannot silently select a different game.
  for(const entry of library.packs.filter(p=>ids.includes(p.game)))await invoke('library_read',{token:entry.token,offset:0,length:12});
  const maps=[...new Set(packs.flatMap(p=>p.files.filter(f=>/^maps\/[a-z0-9_]+\.bsp$/.test(f.name)).map(f=>f.name.slice(5,-4))))].sort();
  let identity;
  await (await import('./lan.js')).LAN_Init({maps,identity:()=>identity??=(async()=>{const hashes=[];for(const p of packs)hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',p.data)),b=>b.toString(16).padStart(2,'0')).join(''));return 'quaked-lan-v1|'+globalThis.__QUAKED_DISTRIBUTION__.engineHash+'|'+id+'|'+hashes.join('|');})()});
  return {id,packs,mission:!!definition.base};
 }catch(error){history.replaceState(null,'',location.pathname);await Desktop_ShowShelf(String(error?.message??error));return null;}
}
