import {gunzipSync} from 'fflate';
import {decode85} from './base85.js';
import {invoke,convertFileSrc} from '@tauri-apps/api/core';
import {LoadingScreen_SetProgress} from '../../src/newer/ui/loading_screen.js';
globalThis.__QUAKED_BOOT_READY__=(async()=>{
const spec=JSON.parse(document.getElementById('quaked-assets').textContent);
const resourceBase=spec.profile==='desktop'?await invoke('distribution_resources'):null;
const urls=new Map(),packs=new Map();
const metrics={decodedBytes:0,blobBytes:0,dataBytes:0,missing:[],startedAt:performance.now()};
function key(path) {
  if(typeof path!=='string')path=String(path);
  if(/^(blob:|data:|asset:|http:\/\/asset\.localhost)/.test(path))return null;
  if(spec.profile==='desktop'&&new URL(path,'https://quaked.invalid/').pathname.match(/\/assets\/q\d+\.[\w]+$/))return null;
  const url=new URL(path,'https://quaked.invalid/');
  return decodeURIComponent(url.pathname).replace(/^\//,'');
}
globalThis.__QUAKED_DISTRIBUTION__={profile:spec.profile,engineHash:spec.engineHash,metrics,
  has(path){const k=key(path);return k===null||Object.hasOwn(spec.files,k);},
  url(path){
    const k=key(path);if(k===null)return String(path);
    if(urls.has(k))return urls.get(k);
    const entry=spec.files[k];
    if(!entry){metrics.missing.push(k);throw Error('Asset absent from '+spec.profile+' package: '+k);}
    if(spec.profile==='desktop')return entry.external?convertFileSrc(resourceBase+'/'+entry.id):new URL('assets/'+entry.id,location.href.split('?')[0]).href;
    let url;
    if(entry.pack){
      // A data-file asset becomes its own small Blob, made when first asked for (as the
      // single-file build did). Slices of large category Blobs broke intermittently
      // (ERR_BLOB_REFERENCED_BLOB_BROKEN on a cold start) and could stop the game starting.
      const pack=packs.get(entry.pack);if(!pack)throw Error('Data file not loaded for '+k+': '+entry.pack);
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
if(spec.packs&&Object.keys(spec.packs).length){
  // Served over http(s) (GitHub Pages, or a local test server) the data files sit beside the
  // page; opened from disk, the page fetches them from GitHub Pages (spec.dataBase). Each part
  // is integrity-checked by the browser, which releases it only whole, so progress moves per part.
  const http=/^https?:$/.test(location.protocol),base=http?new URL('.',location.href).href:spec.dataBase;
  const jobs=Object.entries(spec.packs).flatMap(([name,pack])=>pack.parts.map((part,index)=>({name,index,part})));
  // Each category's bytes land in one ArrayBuffer, each part written at its own offset as it arrives.
  const joined=new Map(Object.entries(spec.packs).map(([name,pack])=>[name,{bytes:new Uint8Array(pack.bytes),offsets:pack.parts.map((_,index)=>pack.parts.slice(0,index).reduce((sum,part)=>sum+part.bytes,0))}]));
  const total=jobs.reduce((sum,job)=>sum+job.part.bytes,0),abort=new AbortController();let received=0,next=0,stale=false;
  const latest=`This copy of Quaked may be out of date: the latest is at ${spec.dataBase}`;
  async function fetchPart({name,index,part}){
    const where=new URL(part.file,base).href;let response;
    try{response=await fetch(where,{integrity:part.integrity,mode:'cors',signal:abort.signal});}
    catch(error){if(abort.signal.aborted&&error.name==='AbortError')return;throw Error(`could not download or verify ${where} (${error.message}). ${latest}`);}
    if(!response.ok){if(response.status===404)stale=true;throw Error(`${where} answered HTTP ${response.status}. ${latest}`);}
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength!==part.bytes)throw Error(`${where} is ${bytes.byteLength} bytes, expected ${part.bytes}`);
    const target=joined.get(name);target.bytes.set(bytes,target.offsets[index]);received+=part.bytes;LoadingScreen_SetProgress(received/total);
  }
  const worker=async()=>{while(next<jobs.length)await fetchPart(jobs[next++]);};
  try{await Promise.all(Array.from({length:Math.min(4,jobs.length)},worker));}
  catch(error){
    abort.abort();
    // Just after a deploy the browser may reuse a cached index.html whose data files are gone:
    // fetch the page afresh and reload once before reporting.
    if(http&&stale&&!sessionStorage.getItem('quaked-data-reload')){sessionStorage.setItem('quaked-data-reload','1');await fetch(location.href,{cache:'reload'}).catch(()=>{});location.reload();await new Promise(()=>{});}
    throw error;
  }
  if(http)sessionStorage.removeItem('quaked-data-reload');
  for(const [name,pack] of Object.entries(spec.packs)){
    const bytes=pack.gzip?gunzipSync(joined.get(name).bytes):joined.get(name).bytes;joined.delete(name);
    if(bytes.byteLength!==pack.rawBytes)throw Error(`${name} data unpacked to ${bytes.byteLength} bytes, expected ${pack.rawBytes}`);
    packs.set(name,bytes);metrics.dataBytes+=pack.bytes;
  }
  metrics.dataReadyMs=performance.now()-metrics.startedAt;
}
})();
