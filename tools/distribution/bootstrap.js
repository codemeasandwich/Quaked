import {gunzipSync} from 'fflate';
import {decode85} from './base85.js';
import {invoke,convertFileSrc} from '@tauri-apps/api/core';
globalThis.__QUAKED_BOOT_READY__=(async()=>{
const spec=JSON.parse(document.getElementById('quaked-assets').textContent);
const resourceBase=spec.profile==='desktop'?await invoke('distribution_resources'):null;
const urls=new Map();
const metrics={decodedBytes:0,blobBytes:0,missing:[],startedAt:performance.now()};
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
    const element=document.getElementById(entry.id);
    let bytes=decode85(element.textContent,entry.bytes);
    if(entry.gzip)bytes=gunzipSync(bytes);
    metrics.decodedBytes+=bytes.byteLength;metrics.blobBytes+=bytes.byteLength;
    const url=URL.createObjectURL(new Blob([bytes],{type:entry.mime}));urls.set(k,url);
    element.remove();return url;
  }
};
for(const el of document.querySelectorAll('[data-quaked-src]'))el.src=globalThis.__QUAKED_DISTRIBUTION__.url(el.dataset.quakedSrc);
for(const el of document.querySelectorAll('[data-quaked-href]'))el.href=globalThis.__QUAKED_DISTRIBUTION__.url(el.dataset.quakedHref);
})();
