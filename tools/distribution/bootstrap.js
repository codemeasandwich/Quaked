import {gunzipSync} from 'fflate';
import {decode85} from './base85.js';
import {invoke,convertFileSrc} from '@tauri-apps/api/core';
import {LoadingScreen_SetProgress} from '../../src/newer/ui/loading_screen.js';
globalThis.__QUAKED_BOOT_READY__=(async()=>{
const spec=JSON.parse(document.getElementById('quaked-assets').textContent);
const resourceBase=spec.profile==='desktop'?await invoke('distribution_resources'):null;
const urls=new Map(),packs=new Map(),readyParts=new Map();
if(spec.profile==='desktop'){
  // Images from the app's asset protocol (bundled and downloaded assets) are another origin
  // than the page, so reading their pixels (textures, HUD, faces, folio, the menu font)
  // failed with "The operation is insecure". Tauri answers that protocol with
  // Access-Control-Allow-Origin set to the window's origin, so such images load in CORS
  // mode; every other image is left as it is.
  const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
  Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){
    if(this.crossOrigin===null&&/^(asset:|http:\/\/asset\.localhost\/)/.test(String(value)))this.crossOrigin='anonymous';
    descriptor.set.call(this,value);
  }});
}
const metrics={decodedBytes:0,blobBytes:0,dataBytes:0,missing:[],unavailable:[],startedAt:performance.now()};
// Desktop: per-game packs unpacked by the app (src-tauri/src/packs.rs), one file per asset named by its SHA-256.
const installed=new Set(['core']);let packAssets=null;
const available=entry=>!entry.pack||(spec.profile==='web'?Boolean(entry.parts&&readyParts.get(entry.pack)&&entry.parts.every(index=>readyParts.get(entry.pack).has(index))):installed.has(entry.pack));
// An asset whose pack this copy does not have (the web ships core and shareware; the app has the
// packs of the game it is playing): a URL that fails like a network error, which every loader
// already handles by keeping the classic look. Not cached, so it resolves once the pack arrives.
function unavailable(k){metrics.unavailable.push(k);const url=URL.createObjectURL(new Blob([]));URL.revokeObjectURL(url);return url;}
// A shipped pack whose background part has not arrived yet is not a packaging fault. Give
// the engine a valid placeholder (transparent image, silence, empty JSON) instead of a broken
// blob, and do not cache it, so the real asset resolves as soon as its part is written.
const PNG_1X1=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
function silentWav(){const samples=800,bytes=new Uint8Array(44+samples*2),view=new DataView(bytes.buffer),text=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};text(0,'RIFF');view.setUint32(4,36+samples*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples*2,true);return bytes;}
const placeholders=new Map();
function placeholder(entry){const kind=(entry?.mime??'').startsWith('image/')?'image':(entry?.mime??'').startsWith('audio/')?'audio':entry?.mime==='application/json'?'json':'empty',cached=placeholders.get(kind);if(cached)return cached;const body=kind==='image'?PNG_1X1:kind==='audio'?silentWav():kind==='json'?new TextEncoder().encode('{}'):new Uint8Array(),type=kind==='image'?'image/png':kind==='audio'?'audio/wav':kind==='json'?'application/json':'application/octet-stream',url=URL.createObjectURL(new Blob([body],{type}));placeholders.set(kind,url);return url;}
const pending=entry=>spec.profile==='web'&&!entry.unshipped&&entry.pack&&Object.hasOwn(spec.packs??{},entry.pack)&&!available(entry);
function key(path) {
  if(typeof path!=='string')path=String(path);
  if(/^(blob:|data:|asset:|http:\/\/asset\.localhost)/.test(path))return null;
  if(spec.profile==='desktop'&&new URL(path,'https://quaked.invalid/').pathname.match(/\/assets\/q\d+\.[\w]+$/))return null;
  const url=new URL(path,'https://quaked.invalid/');
  return decodeURIComponent(url.pathname).replace(/^\//,'');
}
globalThis.__QUAKED_DISTRIBUTION__={profile:spec.profile,engineHash:spec.engineHash,packBase:spec.packBase,startPriority:spec.startPriority??1,metrics,
  has(path){const k=key(path);return k===null||Object.hasOwn(spec.files,k)&&available(spec.files[k]);},
  /** Desktop: the packs a game needs that are not bundled (core is), as packs_ensure takes them. */
  packsFor(game,base){if(spec.profile!=='desktop')return [];return (spec.gamePacks?.[game]??(base?[...(spec.gamePacks?.[base]??[])]:[])).filter(name=>name!=='core'&&spec.packs?.[name]).map(name=>({name,parts:spec.packs[name].parts,assets:spec.packs[name].assets}));},
  /** Desktop: split a game's packs into the parts needed to start and the rest. */
  packsForPriority(game,base,cutoff=spec.startPriority??1){
    const all=this.packsFor(game,base),required=[],background=[];
    for(const pack of all){
      const spans=[];let start=0;for(const part of pack.parts){spans.push([start,start+part.bytes]);start+=part.bytes;}
      const take=new Set(pack.parts.filter(part=>part.priority<=cutoff));
      if(!take.size)continue;
      const overlaps=(asset,part)=>{const index=pack.parts.indexOf(part),span=spans[index];return asset.offset<span[1]&&asset.offset+asset.length>span[0];};
      const requiredAssets=()=>pack.assets.filter(asset=>[...take].some(part=>overlaps(asset,part)));
      // An asset may straddle a part boundary; include every part holding its bytes.
      for(const part of pack.parts)if(requiredAssets().some(asset=>overlaps(asset,part)))take.add(part);
      const parts=pack.parts.filter(part=>take.has(part)),assets=pack.assets.filter(asset=>parts.some(part=>overlaps(asset,part)));
      if(parts.length&&assets.length)required.push({name:pack.name,parts,assets});
      const restParts=pack.parts.filter(part=>!take.has(part)),restAssets=pack.assets.filter(asset=>!assets.includes(asset)&&restParts.some(part=>overlaps(asset,part)));
      if(restParts.length&&restAssets.length)background.push({name:pack.name,parts:restParts,assets:restAssets});
    }
    return {required,background};
  },
  /** Desktop: the packs are unpacked in `dir`; their assets resolve from now on. */
  usePacks(dir,names){packAssets=dir;for(const name of names)installed.add(name);},
  url(path){
    const k=key(path);if(k===null)return String(path);
    if(urls.has(k))return urls.get(k);
    let url;
    const entry=spec.files[k];
    if(!entry){metrics.missing.push(k);throw Error('Asset absent from '+spec.profile+' package: '+k);}
    if(!available(entry))return pending(entry)?placeholder(entry):unavailable(k);
    if(spec.profile==='desktop'&&entry.pack){url=convertFileSrc(packAssets+'/'+entry.sha256+entry.ext);urls.set(k,url);return url;}
    if(spec.profile==='desktop')return entry.external?convertFileSrc(resourceBase+'/'+entry.id):new URL('assets/'+entry.id,location.href.split('?')[0]).href;
    if(entry.pack){
      // A data-file asset becomes its own small Blob, made when first asked for (as the
      // single-file build did). Slices of large category Blobs broke intermittently
      // (ERR_BLOB_REFERENCED_BLOB_BROKEN on a cold start) and could stop the game starting.
      const pack=packs.get(entry.pack);
      url=URL.createObjectURL(new Blob([pack.subarray(entry.offset,entry.offset+entry.length)],{type:entry.mime}));metrics.blobBytes+=entry.length;
    }else{
      const element=document.getElementById(entry.id);
      let bytes=decode85(element.textContent,entry.bytes);
      if(entry.gzip)bytes=gunzipSync(bytes);
      metrics.decodedBytes+=bytes.byteLength;metrics.blobBytes+=bytes.byteLength;
      url=URL.createObjectURL(new Blob([bytes],{type:entry.mime}));element.remove();
    }
    urls.set(k,url);return url;
  }
};
// index.html's own images are always embedded (build.mjs keeps page references out of data files).
for(const el of document.querySelectorAll('[data-quaked-src]'))el.src=globalThis.__QUAKED_DISTRIBUTION__.url(el.dataset.quakedSrc);
for(const el of document.querySelectorAll('[data-quaked-href]'))el.href=globalThis.__QUAKED_DISTRIBUTION__.url(el.dataset.quakedHref);
if(spec.profile==='web'&&spec.packs&&Object.keys(spec.packs).length){
  // Served over http(s) (GitHub Pages, or a local test server) the data files sit beside the
  // page; opened from disk, the page fetches them from GitHub Pages (spec.dataBase). Parts at
  // or below startPriority are fetched before the engine starts; the rest continue in the
  // background. Each part is integrity-checked by the browser, which releases it only whole.
  const http=/^https?:$/.test(location.protocol),base=http?new URL('.',location.href).href:spec.dataBase;
  const jobs=Object.entries(spec.packs).flatMap(([name,pack])=>pack.parts.map((part,index)=>({name,index,part})));
  const required=jobs.filter(job=>job.part.priority<=spec.startPriority),background=jobs.filter(job=>job.part.priority>spec.startPriority);
  // Each pack's bytes land in one ArrayBuffer, each part written at its own offset as it arrives.
  const joined=new Map(Object.entries(spec.packs).map(([name,pack])=>[name,{bytes:new Uint8Array(pack.bytes),offsets:pack.parts.map((_,index)=>pack.parts.slice(0,index).reduce((sum,part)=>sum+part.bytes,0))}]));
  const total=required.reduce((sum,job)=>sum+job.part.bytes,0),abort=new AbortController();let received=0,stale=false;
  const latest=`This copy of Quaked may be out of date: the latest is at ${spec.dataBase}`;
  const mark=job=>{let set=readyParts.get(job.name);if(!set)readyParts.set(job.name,set=new Set());set.add(job.index);};
  async function fetchPart(job,track){
    const {name,index,part}=job,where=new URL(part.file,base).href;let response;
    try{response=await fetch(where,{integrity:part.integrity,mode:'cors',signal:abort.signal});}
    catch(error){if(abort.signal.aborted&&error.name==='AbortError')return;throw Error(`could not download or verify ${where} (${error.message}). ${latest}`);}
    if(!response.ok){if(response.status===404)stale=true;throw Error(`${where} answered HTTP ${response.status}. ${latest}`);}
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength!==part.bytes)throw Error(`${where} is ${bytes.byteLength} bytes, expected ${part.bytes}`);
    const target=joined.get(name);target.bytes.set(bytes,target.offsets[index]);mark(job);
    if(track){received+=part.bytes;LoadingScreen_SetProgress(received/total);}
  }
  const workers=async(list,track)=>{let next=0;const run=async()=>{while(next<list.length)await fetchPart(list[next++],track);};await Promise.all(Array.from({length:Math.min(4,list.length)},run));};
  try{await workers(required,true);}
  catch(error){
    abort.abort();
    if(http&&stale&&!sessionStorage.getItem('quaked-data-reload')){sessionStorage.setItem('quaked-data-reload','1');await fetch(location.href,{cache:'reload'}).catch(()=>{});location.reload();await new Promise(()=>{});}
    throw error;
  }
  if(http)sessionStorage.removeItem('quaked-data-reload');
  for(const [name,pack] of Object.entries(spec.packs))if(readyParts.has(name)){packs.set(name,pack.gzip?gunzipSync(joined.get(name).bytes):joined.get(name).bytes);metrics.dataBytes+=pack.bytes;}
  metrics.dataReadyMs=performance.now()-metrics.startedAt;
  // The application can start now; later parts fill the same buffers and become available.
  if(background.length)void workers(background,false).then(()=>{metrics.backgroundComplete=true;}).catch(error=>{metrics.backgroundError=String(error);metrics.backgroundComplete=true;});
  else metrics.backgroundComplete=true;
}

})();
