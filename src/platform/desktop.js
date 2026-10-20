/** Thin native adapter: location authority stays in Rust; content validation and
 * mount ordering stay in the existing engine. Imported only by the desktop profile.
 */
import {invoke,convertFileSrc} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {GameCatalogue_AllGames,GameCatalogue_Refresh,GameCatalogue_SetProvider,GameCatalogue_SetDiscovered} from '../engine/common/game_catalogue.js';
import {GameSelection_Startable,GameSelection_Kept,GameSelection_Remember,GameSelection_LibraryOrder} from '../engine/common/game_selection.js';
import {COM_LoadPackFile,COM_BuildPack} from '../engine/common/pak.js';
import {GameShelf_Show} from '../engine/common/hooks.js'; // filled by src/newer/install.js, which main.js loads first
import {LoadingScreen_SetProgress} from '../engine/common/hooks.js';
let listening=false;
export async function Desktop_Log(text){
 try{localStorage.setItem('hexen2_stage',String(text).slice(0,2500));}catch{}
 try{await invoke('hexen_log',{text:String(text)});}catch{}

}
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
const MUSIC_TYPES=Object.freeze({ogg:'audio/ogg',mp3:'audio/mpeg',wav:'audio/wav'});
const MUSIC_FILE_LIMIT=64<<20,MUSIC_READ_CHUNK=131072; // read_range's per-call bound
// The Portal expansion reads base tracks from the base game's data folder and its own from portals/music. Its
// tuklu*/track* set is Portal-only, so it prefers the portals token; everything else prefers the base, as the game's
// filesystem does (src-tauri/src/library.rs lists both editions' music tokens).
function musicEditionOrder(game,base,name){
 const editions=[...new Set([game,base].filter(Boolean))];
 if(game!=='hexen2-portals'||editions.length<2)return editions;
 const others=editions.filter(edition=>edition!==game);
 return /^(?:tulku|track)/i.test(name)?[game,...others]:[...others,game];
}
/** The Hexen II music source for the packaged app: reads a loose track through the existing scoped library reader
 * (library.rs read_range via the library_read command) into a Blob and returns an object URL. The file path never
 * reaches an asset URL, so the asset protocol's scope is unchanged. Only direct data-folder music is listed; a file
 * over the bound, or a token that is not in the current library, is refused. The previous object URL is revoked when a
 * new track starts.
 * @param {object} library the library_scan result
 * @param {{game?:string,base?:?string,read?:Function,createObjectURL?:Function,revokeObjectURL?:Function,
 *   maxBytes?:number,chunk?:number}} [options] edition, base edition and test seams
 * @returns {function(string): Promise<?string>} game path -> object URL, or null
 */
export function Desktop_Hexen2MusicSource(library,options={}){
 const game=options.game??'hexen2',base=options.base??null;
 const read=options.read??((token,offset,length)=>invoke('library_read',{token,offset,length}));
 const createURL=options.createObjectURL??(blob=>URL.createObjectURL(blob));
 const revokeURL=options.revokeObjectURL??(url=>URL.revokeObjectURL(url));
 const limit=options.maxBytes??MUSIC_FILE_LIMIT,chunk=Math.min(options.chunk??MUSIC_READ_CHUNK,MUSIC_READ_CHUNK);
 let current=null,currentPath=null;
 return async path=>{
  const text=String(path??'');
  const match=/^music\/([a-z0-9_.-]+)$/i.exec(text);
  if(!match)return null;
  const name=match[1].toLowerCase(),format=name.slice(name.lastIndexOf('.')+1);
  if(!MUSIC_TYPES[format])return null;
  // Asking for the track already playing is not a new track: reuse its URL, never revoke a URL the music element
  // still points at (CDAudio_Play ignores a repeat of the same track).
  if(current&&currentPath===text)return current;
  for(const edition of musicEditionOrder(game,base,name)){
   const token=`${edition}/music/${name}`;
   const entry=(library.packs??[]).find(p=>p.token===token);
   if(!entry)continue;
   if(!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>limit)return null;
   try{
    const parts=[];let at=0;
    while(at<entry.bytes){
     const want=Math.min(chunk,entry.bytes-at);
     const part=await read(token,at,want);
     const bytes=part instanceof Uint8Array?part:new Uint8Array(part??[]);
     if(!bytes.length||bytes.length>want)return null;
     parts.push(bytes);at+=bytes.length;
    }
    const url=createURL(new Blob(parts,{type:MUSIC_TYPES[format]}));
    if(!url)return null;
    if(current)try{revokeURL(current);}catch{}
    current=url;currentPath=text;
    return url;
   }catch{return null;}
  }
  return null;
 };
}
/** Per-game data packs (docs/per-game-packs-design-2026-10-13.md): the app bundles the core
 * pack; a game's other packs are downloaded, verified and unpacked by the app (packs_ensure in
 * src-tauri/src/packs.rs) before it starts, while the loading screen shows the progress. Once
 * unpacked they are reused offline. A failure returns to the shelf saying so; choosing the game
 * again retries, keeping the parts already verified. */
async function ensurePacks(definition){
 const distribution=globalThis.__QUAKED_DISTRIBUTION__,groups=distribution.packsForPriority(definition.id,definition.base),packs=groups.required;
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
  // The remaining parts continue in the background; a failure leaves the verified start data
  // usable and is retried the next time the game is chosen.
  if(groups.background.length)void invoke('packs_ensure',{base:distribution.packBase,packs:groups.background})
   .then(next=>distribution.usePacks(next,groups.background.map(p=>p.name)))
   .catch(()=>{});
 }catch(error){throw Error(`The Newer Game data for ${definition.name} could not be downloaded (${error?.message??error}). Choose the game again to retry.`);}
 finally{stop();status.remove();}
}
export async function Desktop_ShowShelf(reason=''){
 void Desktop_Log('show shelf '+reason);
 const {library,catalogue}=await snapshot();
 document.getElementById('loading')?.remove();
 // Only paths validated by the native scan and admitted to its exact-file scope
 // are exposed. The shelf overlays these faces onto its bundled fallbacks.
 const games=catalogue.games.map(g=>{
  const images=Object.fromEntries(Object.entries(library.artwork?.[g.id]??{}).map(([face,path])=>[face,convertFileSrc(path)]));
  const artOnly=!g.present&&(library.discovered??[]).some(d=>d.id===g.id);
  return {...g,kind:artOnly?'unavailable':g.kind,playable:GameSelection_Startable(g,{strict:true}).ok,images,
   reason:artOnly?'No supported game files found':g.reason};
 });
 if(reason||library.error){const note=document.createElement('div');note.role='alert';note.style='position:fixed;z-index:201;top:10vh;left:5vw;right:5vw;color:#efd9ad;text-align:center';note.textContent=reason||library.error;document.body.append(note);}
 await GameShelf_Show(games,{native:true,current:GameSelection_Kept(),remember:GameSelection_Remember,selectLocation:Desktop_SelectLocation});
}
export async function Desktop_Prepare(){
 void Desktop_Log('desktop prepare start');
 GameCatalogue_SetProvider(async()=>{
  const library=await invoke('library_scan');
  GameCatalogue_SetDiscovered((library.discovered??[]).map(d=>({...d,folder:`library/${d.id}`})));
  return {games:GameCatalogue_AllGames().map(g=>({...g,folders:[`library/${g.id}`]})),allPacks:true,base:'https://quaked.invalid/',fetch:rangedFetch(library)};
 });
 if(!listening){await listen('select-game-location',Desktop_SelectLocation);await listen('lan-menu',()=>globalThis.__QUAKED_LAN_MENU__?globalThis.__QUAKED_LAN_MENU__():alert('Select a game and wait for it to load first.'));listening=true;}
 globalThis.__QUAKED_SELECT_LOCATION__=Desktop_SelectLocation;
 let id=new URLSearchParams(location.search).get('game');
 let trial=null;
 try{trial=await invoke('trial_game');}catch{}
 // Trial launches may override a remembered ?game= URL so the packaged smoke can select Portal/demo explicitly.
 if(trial)id=trial;
 void Desktop_Log('desktop prepare id='+id+(trial?' (trial)':''));
 if(!id){await Desktop_ShowShelf();return null;}
 try{
  const {library,catalogue}=await snapshot();
  void Desktop_Log('catalogue '+catalogue.games.map(g=>g.id+':'+(g.present?1:0)+(g.validated?1:0)+(g.playable?1:0)).join(','));
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
  const looseId=definition.kind==='addon'||String(id).startsWith('hexen2')?id:null; // Hexen's loose progs.dat/strings/hexen.rc sit above its PAKs
  for(const step of GameSelection_LibraryOrder(library.packs,ids,looseId)){
   if(step.loose){const files=[];for(const entry of step.loose){if(entry.name.startsWith('music/'))continue;files.push({name:entry.name,data:new Uint8Array(await read(entry))});}const pack=COM_LoadPackFile(id+'/loose',COM_BuildPack(files));if(!pack)throw Error('Invalid loose files: '+id);packs.push(pack);continue;}
   const pack=COM_LoadPackFile(step.pack.token,await read(step.pack));if(!pack)throw Error('Invalid archive: '+step.pack.name);packs.push(pack);
  }
  // Hexen's music is loose OGG beside the PAKs: register a source that reads each track through the scoped library
  // reader (library.rs music tokens) into a Blob URL. It is not an asset URL, so the asset protocol's scope is not
  // widened; the web/source build registers nothing and keeps its pack conversion.
  if(String(id).startsWith('hexen2')){
   const {Hexen2_SetMusicSource}=await import('../engine/client/hexen2_music.js');
   Hexen2_SetMusicSource(Desktop_Hexen2MusicSource(library,{game:id,base:definition.base??null}));
  }
  // Re-read metadata after full reads so changing files cannot silently select a different game (music is read on
  // demand by the provider, not mounted).
  for(const entry of library.packs.filter(p=>ids.includes(p.game)&&!p.name.startsWith('music/')))await invoke('library_read',{token:entry.token,offset:0,length:12});
  const maps=[...new Set(packs.flatMap(p=>p.files.filter(f=>/^maps\/[a-z0-9_]+\.bsp$/.test(f.name)).map(f=>f.name.slice(5,-4))))].sort();
  let identity;
  await (await import('./lan.js')).LAN_Init({maps,identity:()=>identity??=(async()=>{const hashes=[];for(const p of packs)hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',p.data)),b=>b.toString(16).padStart(2,'0')).join(''));return 'quaked-lan-v1|'+globalThis.__QUAKED_DISTRIBUTION__.engineHash+'|'+id+'|'+hashes.join('|');})()});
  let autoPlay=false, autoClass='paladin', saveTrial=false;
  if(trial===id){try{autoPlay=await invoke('trial_autoplay');const chosen=await invoke('trial_class');if(typeof chosen==='string'&&chosen)autoClass=chosen;saveTrial=await invoke('trial_save');}catch{}}
  return {id,packs,mission:!!definition.base,autoStart:trial===id,autoPlay,autoClass,saveTrial,source:String(library.root)};
 }catch(error){history.replaceState(null,'',location.pathname);await Desktop_ShowShelf(String(error?.message??error));return null;}
}
